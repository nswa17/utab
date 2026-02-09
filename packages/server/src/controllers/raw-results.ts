import { Types } from 'mongoose'
import type { Request, RequestHandler } from 'express'
import { results as coreResults } from '@utab/core'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { getRawTeamResultModel } from '../models/raw-team-result.js'
import { getRawSpeakerResultModel } from '../models/raw-speaker-result.js'
import { getRawAdjudicatorResultModel } from '../models/raw-adjudicator-result.js'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { TournamentModel } from '../models/tournament.js'
import { StyleModel } from '../models/style.js'
import { getTeamModel } from '../models/team.js'
import { getSpeakerModel } from '../models/speaker.js'
import { getAdjudicatorModel } from '../models/adjudicator.js'
import { isDuplicateKeyError } from '../services/mongo-error.service.js'
import { sanitizeAggregateForPublic } from '../services/response-sanitizer.js'

function invalidTournament(res: any) {
  res
    .status(400)
    .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
}

async function isTournamentAdmin(req: Request, tournamentId: string): Promise<boolean> {
  const role = req.session?.usertype
  if (role === 'superuser') return true
  if (!req.session?.userId) return false
  const membership = await TournamentMemberModel.findOne({
    tournamentId: String(tournamentId),
    userId: String(req.session.userId),
  })
    .select({ role: 1, _id: 0 })
    .lean()
    .exec()
  return membership?.role === 'organizer'
}

function normalizeScoreWeights(scoreWeights: any): number[] {
  if (Array.isArray(scoreWeights)) {
    if (scoreWeights.every((v) => typeof v === 'number')) return scoreWeights
    if (scoreWeights.every((v) => v && typeof v === 'object' && 'value' in v)) {
      return scoreWeights.map((v: any) => Number(v.value))
    }
  }
  return [1]
}

function buildDetailsForRounds(
  details: any[] | undefined,
  rounds: number[],
  defaults: Record<string, unknown>
) {
  return rounds.map((r) => {
    const existing = details?.find((d) => d.r === r) ?? {}
    return { r, ...defaults, ...existing }
  })
}

function resolveRounds(requestedRound: number | undefined, ...rawLists: Array<Array<{ r?: number }>>) {
  if (Number.isFinite(requestedRound)) {
    return [Number(requestedRound)]
  }
  const rounds = new Set<number>()
  rawLists.forEach((list) => {
    list.forEach((item) => {
      const r = Number(item.r)
      if (Number.isFinite(r)) rounds.add(r)
    })
  })
  return Array.from(rounds).sort((a, b) => a - b)
}

export const listRawTeamResults: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, id, fromId } = req.query as {
      tournamentId?: string
      round?: string
      id?: string
      fromId?: string
    }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawTeamResultModel(connection)
    const filter: Record<string, unknown> = { tournamentId }
    if (round !== undefined) filter.r = Number(round)
    if (id !== undefined) filter.id = id
    if (fromId !== undefined) filter.from_id = fromId
    const rawTeamResults = await Model.find(filter).lean().exec()

    if (await isTournamentAdmin(req, tournamentId)) {
      res.json({ data: rawTeamResults, errors: [] })
      return
    }

    if (rawTeamResults.length === 0) {
      res.json({ data: [], errors: [] })
      return
    }

    const [tournament, teams, speakers, rawSpeakerResults] = await Promise.all([
      TournamentModel.findById(tournamentId).lean().exec(),
      getTeamModel(connection).find({ tournamentId }).lean().exec(),
      getSpeakerModel(connection).find({ tournamentId }).lean().exec(),
      getRawSpeakerResultModel(connection).find({ tournamentId }).lean().exec(),
    ])
    if (!tournament) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
      return
    }

    const rounds = resolveRounds(
      round !== undefined ? Number(round) : undefined,
      rawTeamResults,
      rawSpeakerResults
    )
    if (rounds.length === 0) {
      res.json({ data: [], errors: [] })
      return
    }

    const styleOptions = (tournament.options as any)?.style ?? {}
    const styleDoc =
      typeof tournament.style === 'number'
        ? await StyleModel.findOne({ id: tournament.style }).lean().exec()
        : null
    const scoreWeights = normalizeScoreWeights(styleOptions.score_weights ?? styleDoc?.score_weights)
    const teamNum = styleOptions.team_num ?? styleDoc?.team_num ?? 2
    const style = { team_num: teamNum, score_weights: scoreWeights }

    const teamInstances = teams.map((team: any) => ({
      id: String(team._id),
      details: buildDetailsForRounds(team.details, rounds, {
        available: true,
        institutions: [],
        speakers: [],
      }),
    }))
    const speakerInstances = speakers.map((speaker: any) => ({ id: String(speaker._id) }))

    const compiled = rawSpeakerResults.length
      ? coreResults.compileTeamResults(
          teamInstances,
          speakerInstances,
          rawTeamResults,
          rawSpeakerResults,
          rounds,
          style
        )
      : coreResults.compileTeamResults(teamInstances, rawTeamResults, rounds, style)

    res.json({ data: sanitizeAggregateForPublic(compiled), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createRawTeamResult: RequestHandler = async (req, res, next) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body]
    const tournamentId = payload[0]?.tournamentId
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    if (!payload.every((item: any) => item.tournamentId === tournamentId)) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'Mixed tournament ids are not supported' }],
      })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawTeamResultModel(connection)
    const created = await Model.insertMany(payload.map((p: any) => ({ ...p, tournamentId })), { ordered: false })
    res.status(201).json({ data: created, errors: [] })
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: 'Raw team result already exists' }] })
      return
    }
    next(err)
  }
}

export const updateRawTeamResult: RequestHandler = async (req, res, next) => {
  try {
    const { id: docId } = req.params
    const { tournamentId, ...rest } = req.body as { tournamentId?: string } & Record<string, unknown>
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    if (!Types.ObjectId.isValid(docId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid raw result id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawTeamResultModel(connection)
    const updated = await Model.findOneAndUpdate({ _id: docId, tournamentId }, { $set: rest }, { new: true })
      .lean()
      .exec()
    if (!updated) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Raw team result not found' }] })
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteRawTeamResult: RequestHandler = async (req, res, next) => {
  try {
    const { id: docId } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    if (!Types.ObjectId.isValid(docId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid raw result id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawTeamResultModel(connection)
    const deleted = await Model.findOneAndDelete({ _id: docId, tournamentId }).lean().exec()
    if (!deleted) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Raw team result not found' }] })
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteRawTeamResults: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, id, fromId } = req.query as {
      tournamentId?: string
      round?: string
      id?: string
      fromId?: string
    }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawTeamResultModel(connection)
    const filter: Record<string, unknown> = { tournamentId }
    if (round !== undefined) filter.r = Number(round)
    if (id !== undefined) filter.id = id
    if (fromId !== undefined) filter.from_id = fromId
    const result = await Model.deleteMany(filter).exec()
    res.json({ data: { deletedCount: result.deletedCount }, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const listRawSpeakerResults: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, id, fromId } = req.query as {
      tournamentId?: string
      round?: string
      id?: string
      fromId?: string
    }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawSpeakerResultModel(connection)
    const filter: Record<string, unknown> = { tournamentId }
    if (round !== undefined) filter.r = Number(round)
    if (id !== undefined) filter.id = id
    if (fromId !== undefined) filter.from_id = fromId
    const rawSpeakerResults = await Model.find(filter).lean().exec()

    if (await isTournamentAdmin(req, tournamentId)) {
      res.json({ data: rawSpeakerResults, errors: [] })
      return
    }

    if (rawSpeakerResults.length === 0) {
      res.json({ data: [], errors: [] })
      return
    }

    const [tournament, speakers] = await Promise.all([
      TournamentModel.findById(tournamentId).lean().exec(),
      getSpeakerModel(connection).find({ tournamentId }).lean().exec(),
    ])
    if (!tournament) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
      return
    }

    const rounds = resolveRounds(round !== undefined ? Number(round) : undefined, rawSpeakerResults)
    if (rounds.length === 0) {
      res.json({ data: [], errors: [] })
      return
    }

    const styleOptions = (tournament.options as any)?.style ?? {}
    const styleDoc =
      typeof tournament.style === 'number'
        ? await StyleModel.findOne({ id: tournament.style }).lean().exec()
        : null
    const scoreWeights = normalizeScoreWeights(styleOptions.score_weights ?? styleDoc?.score_weights)
    const teamNum = styleOptions.team_num ?? styleDoc?.team_num ?? 2
    const style = { team_num: teamNum, score_weights: scoreWeights }

    const speakerInstances = speakers.map((speaker: any) => ({ id: String(speaker._id) }))
    const compiled = coreResults.compileSpeakerResults(
      speakerInstances,
      rawSpeakerResults,
      style,
      rounds
    )
    res.json({ data: sanitizeAggregateForPublic(compiled), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createRawSpeakerResult: RequestHandler = async (req, res, next) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body]
    const tournamentId = payload[0]?.tournamentId
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    if (!payload.every((item: any) => item.tournamentId === tournamentId)) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'Mixed tournament ids are not supported' }],
      })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawSpeakerResultModel(connection)
    const created = await Model.insertMany(payload.map((p: any) => ({ ...p, tournamentId })), { ordered: false })
    res.status(201).json({ data: created, errors: [] })
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: 'Raw speaker result already exists' }] })
      return
    }
    next(err)
  }
}

export const updateRawSpeakerResult: RequestHandler = async (req, res, next) => {
  try {
    const { id: docId } = req.params
    const { tournamentId, ...rest } = req.body as { tournamentId?: string } & Record<string, unknown>
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    if (!Types.ObjectId.isValid(docId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid raw result id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawSpeakerResultModel(connection)
    const updated = await Model.findOneAndUpdate({ _id: docId, tournamentId }, { $set: rest }, { new: true })
      .lean()
      .exec()
    if (!updated) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Raw speaker result not found' }] })
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteRawSpeakerResult: RequestHandler = async (req, res, next) => {
  try {
    const { id: docId } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    if (!Types.ObjectId.isValid(docId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid raw result id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawSpeakerResultModel(connection)
    const deleted = await Model.findOneAndDelete({ _id: docId, tournamentId }).lean().exec()
    if (!deleted) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Raw speaker result not found' }] })
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteRawSpeakerResults: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, id, fromId } = req.query as {
      tournamentId?: string
      round?: string
      id?: string
      fromId?: string
    }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawSpeakerResultModel(connection)
    const filter: Record<string, unknown> = { tournamentId }
    if (round !== undefined) filter.r = Number(round)
    if (id !== undefined) filter.id = id
    if (fromId !== undefined) filter.from_id = fromId
    const result = await Model.deleteMany(filter).exec()
    res.json({ data: { deletedCount: result.deletedCount }, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const listRawAdjudicatorResults: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, id, fromId } = req.query as {
      tournamentId?: string
      round?: string
      id?: string
      fromId?: string
    }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawAdjudicatorResultModel(connection)
    const filter: Record<string, unknown> = { tournamentId }
    if (round !== undefined) filter.r = Number(round)
    if (id !== undefined) filter.id = id
    if (fromId !== undefined) filter.from_id = fromId
    const rawAdjResults = await Model.find(filter).lean().exec()

    if (await isTournamentAdmin(req, tournamentId)) {
      res.json({ data: rawAdjResults, errors: [] })
      return
    }

    if (rawAdjResults.length === 0) {
      res.json({ data: [], errors: [] })
      return
    }

    const adjudicators = await getAdjudicatorModel(connection)
      .find({ tournamentId })
      .lean()
      .exec()
    const rounds = resolveRounds(round !== undefined ? Number(round) : undefined, rawAdjResults)
    if (rounds.length === 0) {
      res.json({ data: [], errors: [] })
      return
    }

    const adjudicatorInstances = adjudicators.map((adj: any) => ({ id: String(adj._id) }))
    const compiled = coreResults.compileAdjudicatorResults(adjudicatorInstances, rawAdjResults, rounds)
    res.json({ data: sanitizeAggregateForPublic(compiled), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createRawAdjudicatorResult: RequestHandler = async (req, res, next) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body]
    const tournamentId = payload[0]?.tournamentId
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    if (!payload.every((item: any) => item.tournamentId === tournamentId)) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'Mixed tournament ids are not supported' }],
      })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawAdjudicatorResultModel(connection)
    const created = await Model.insertMany(payload.map((p: any) => ({ ...p, tournamentId })), { ordered: false })
    res.status(201).json({ data: created, errors: [] })
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: 'Raw adjudicator result already exists' }] })
      return
    }
    next(err)
  }
}

export const updateRawAdjudicatorResult: RequestHandler = async (req, res, next) => {
  try {
    const { id: docId } = req.params
    const { tournamentId, ...rest } = req.body as { tournamentId?: string } & Record<string, unknown>
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    if (!Types.ObjectId.isValid(docId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid raw result id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawAdjudicatorResultModel(connection)
    const updated = await Model.findOneAndUpdate({ _id: docId, tournamentId }, { $set: rest }, { new: true })
      .lean()
      .exec()
    if (!updated) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Raw adjudicator result not found' }] })
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteRawAdjudicatorResult: RequestHandler = async (req, res, next) => {
  try {
    const { id: docId } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    if (!Types.ObjectId.isValid(docId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid raw result id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawAdjudicatorResultModel(connection)
    const deleted = await Model.findOneAndDelete({ _id: docId, tournamentId }).lean().exec()
    if (!deleted) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Raw adjudicator result not found' }] })
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteRawAdjudicatorResults: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, id, fromId } = req.query as {
      tournamentId?: string
      round?: string
      id?: string
      fromId?: string
    }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      invalidTournament(res)
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawAdjudicatorResultModel(connection)
    const filter: Record<string, unknown> = { tournamentId }
    if (round !== undefined) filter.r = Number(round)
    if (id !== undefined) filter.id = id
    if (fromId !== undefined) filter.from_id = fromId
    const result = await Model.deleteMany(filter).exec()
    res.json({ data: { deletedCount: result.deletedCount }, errors: [] })
  } catch (err) {
    next(err)
  }
}
