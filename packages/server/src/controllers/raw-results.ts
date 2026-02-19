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
import { buildDetailsForRounds, normalizeScoreWeights } from './shared/allocation-support.js'
import { notFound } from './shared/http-errors.js'
import { ensureObjectId, ensureTournamentId, requireSingleTournamentPayload } from './shared/request-validators.js'

function buildRawFilter(
  tournamentId: string,
  params: { round?: string; id?: string; fromId?: string }
): Record<string, unknown> {
  const filter: Record<string, unknown> = { tournamentId }
  if (params.round !== undefined) filter.r = Number(params.round)
  if (params.id !== undefined) filter.id = params.id
  if (params.fromId !== undefined) filter.from_id = params.fromId
  return filter
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

type PlainRecord = Record<string, unknown>
type TournamentConnection = Awaited<ReturnType<typeof getTournamentConnection>>

type RawResultCrudModel = {
  insertMany: (docs: PlainRecord[], options: { ordered: boolean }) => Promise<unknown[]>
  findOneAndUpdate: (
    filter: PlainRecord,
    update: PlainRecord,
    options: { new: boolean }
  ) => { lean: () => { exec: () => Promise<unknown | null> } }
  findOneAndDelete: (filter: PlainRecord) => { lean: () => { exec: () => Promise<unknown | null> } }
  deleteMany: (filter: PlainRecord) => { exec: () => Promise<{ deletedCount?: number }> }
}

type RawResultCrudOptions = {
  getModel: (connection: TournamentConnection) => RawResultCrudModel
  duplicateConflictMessage: string
  notFoundMessage: string
}

function createRawResultCrudHandlers(options: RawResultCrudOptions): {
  create: RequestHandler
  update: RequestHandler
  deleteOne: RequestHandler
  deleteMany: RequestHandler
} {
  const create: RequestHandler = async (req, res, next) => {
    try {
      const payload = Array.isArray(req.body) ? req.body : [req.body]
      const tournamentId = requireSingleTournamentPayload(res, payload)
      if (!tournamentId) return
      const connection = await getTournamentConnection(tournamentId)
      const Model = options.getModel(connection)
      const created = await Model.insertMany(
        payload.map((item: any) => ({ ...item, tournamentId })),
        { ordered: false }
      )
      res.status(201).json({ data: created, errors: [] })
    } catch (err: any) {
      if (isDuplicateKeyError(err)) {
        res.status(409).json({
          data: null,
          errors: [{ name: 'Conflict', message: options.duplicateConflictMessage }],
        })
        return
      }
      next(err)
    }
  }

  const update: RequestHandler = async (req, res, next) => {
    try {
      const { id: docId } = req.params
      const { tournamentId, ...rest } = req.body as { tournamentId?: string } & PlainRecord
      if (!ensureTournamentId(res, tournamentId)) return
      if (!ensureObjectId(res, docId, 'Invalid raw result id')) return
      const connection = await getTournamentConnection(tournamentId)
      const Model = options.getModel(connection)
      const updated = await Model.findOneAndUpdate(
        { _id: docId, tournamentId },
        { $set: rest },
        { new: true }
      )
        .lean()
        .exec()
      if (!updated) {
        notFound(res, options.notFoundMessage)
        return
      }
      res.json({ data: updated, errors: [] })
    } catch (err) {
      next(err)
    }
  }

  const deleteOne: RequestHandler = async (req, res, next) => {
    try {
      const { id: docId } = req.params
      const { tournamentId } = req.query as { tournamentId?: string }
      if (!ensureTournamentId(res, tournamentId)) return
      if (!ensureObjectId(res, docId, 'Invalid raw result id')) return
      const connection = await getTournamentConnection(tournamentId)
      const Model = options.getModel(connection)
      const deleted = await Model.findOneAndDelete({ _id: docId, tournamentId }).lean().exec()
      if (!deleted) {
        notFound(res, options.notFoundMessage)
        return
      }
      res.json({ data: deleted, errors: [] })
    } catch (err) {
      next(err)
    }
  }

  const deleteMany: RequestHandler = async (req, res, next) => {
    try {
      const { tournamentId, round, id, fromId } = req.query as {
        tournamentId?: string
        round?: string
        id?: string
        fromId?: string
      }
      if (!ensureTournamentId(res, tournamentId)) return
      const connection = await getTournamentConnection(tournamentId)
      const Model = options.getModel(connection)
      const filter = buildRawFilter(tournamentId, { round, id, fromId })
      const result = await Model.deleteMany(filter).exec()
      res.json({ data: { deletedCount: result.deletedCount }, errors: [] })
    } catch (err) {
      next(err)
    }
  }

  return { create, update, deleteOne, deleteMany }
}

const rawTeamResultCrudHandlers = createRawResultCrudHandlers({
  getModel: getRawTeamResultModel,
  duplicateConflictMessage: 'Raw team result already exists',
  notFoundMessage: 'Raw team result not found',
})

const rawSpeakerResultCrudHandlers = createRawResultCrudHandlers({
  getModel: getRawSpeakerResultModel,
  duplicateConflictMessage: 'Raw speaker result already exists',
  notFoundMessage: 'Raw speaker result not found',
})

const rawAdjudicatorResultCrudHandlers = createRawResultCrudHandlers({
  getModel: getRawAdjudicatorResultModel,
  duplicateConflictMessage: 'Raw adjudicator result already exists',
  notFoundMessage: 'Raw adjudicator result not found',
})

export const listRawTeamResults: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, id, fromId } = req.query as {
      tournamentId?: string
      round?: string
      id?: string
      fromId?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawTeamResultModel(connection)
    const filter = buildRawFilter(tournamentId, { round, id, fromId })
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
      notFound(res, 'Tournament not found')
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

export const createRawTeamResult: RequestHandler = rawTeamResultCrudHandlers.create
export const updateRawTeamResult: RequestHandler = rawTeamResultCrudHandlers.update
export const deleteRawTeamResult: RequestHandler = rawTeamResultCrudHandlers.deleteOne
export const deleteRawTeamResults: RequestHandler = rawTeamResultCrudHandlers.deleteMany

export const listRawSpeakerResults: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, id, fromId } = req.query as {
      tournamentId?: string
      round?: string
      id?: string
      fromId?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawSpeakerResultModel(connection)
    const filter = buildRawFilter(tournamentId, { round, id, fromId })
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
      notFound(res, 'Tournament not found')
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

export const createRawSpeakerResult: RequestHandler = rawSpeakerResultCrudHandlers.create
export const updateRawSpeakerResult: RequestHandler = rawSpeakerResultCrudHandlers.update
export const deleteRawSpeakerResult: RequestHandler = rawSpeakerResultCrudHandlers.deleteOne
export const deleteRawSpeakerResults: RequestHandler = rawSpeakerResultCrudHandlers.deleteMany

export const listRawAdjudicatorResults: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, id, fromId } = req.query as {
      tournamentId?: string
      round?: string
      id?: string
      fromId?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return
    const connection = await getTournamentConnection(tournamentId)
    const Model = getRawAdjudicatorResultModel(connection)
    const filter = buildRawFilter(tournamentId, { round, id, fromId })
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

export const createRawAdjudicatorResult: RequestHandler = rawAdjudicatorResultCrudHandlers.create
export const updateRawAdjudicatorResult: RequestHandler = rawAdjudicatorResultCrudHandlers.update
export const deleteRawAdjudicatorResult: RequestHandler = rawAdjudicatorResultCrudHandlers.deleteOne
export const deleteRawAdjudicatorResults: RequestHandler = rawAdjudicatorResultCrudHandlers.deleteMany
