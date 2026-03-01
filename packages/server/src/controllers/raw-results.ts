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
import { buildDetailsForRounds, buildIdMaps, normalizeScoreWeights } from './shared/allocation-support.js'
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

function restoreMappedId(value: unknown, reverse: Map<number, string>): string {
  const numericValue = Number(value)
  if (Number.isFinite(numericValue) && reverse.has(numericValue)) {
    return reverse.get(numericValue) ?? String(value ?? '')
  }
  return String(value ?? '')
}

function remapCompiledTeamResults(
  teamResults: any[],
  teamReverse: Map<number, string>
): any[] {
  return teamResults.map((result: any) => ({
    ...result,
    id: restoreMappedId(result?.id, teamReverse),
    past_opponents: Array.isArray(result?.past_opponents)
      ? result.past_opponents.map((id: unknown) => restoreMappedId(id, teamReverse))
      : result?.past_opponents,
    details: Array.isArray(result?.details)
      ? result.details.map((detail: any) => ({
          ...detail,
          id: restoreMappedId(detail?.id, teamReverse),
          opponents: Array.isArray(detail?.opponents)
            ? detail.opponents.map((id: unknown) => restoreMappedId(id, teamReverse))
            : detail?.opponents,
        }))
      : result?.details,
  }))
}

function remapCompiledSpeakerResults(
  speakerResults: any[],
  speakerReverse: Map<number, string>
): any[] {
  return speakerResults.map((result: any) => ({
    ...result,
    id: restoreMappedId(result?.id, speakerReverse),
    details: Array.isArray(result?.details)
      ? result.details.map((detail: any) => ({
          ...detail,
          id: restoreMappedId(detail?.id, speakerReverse),
        }))
      : result?.details,
  }))
}

function remapCompiledAdjudicatorResults(
  adjudicatorResults: any[],
  adjudicatorReverse: Map<number, string>,
  teamReverse: Map<number, string>
): any[] {
  return adjudicatorResults.map((result: any) => ({
    ...result,
    id: restoreMappedId(result?.id, adjudicatorReverse),
    judged_teams: Array.isArray(result?.judged_teams)
      ? result.judged_teams.map((id: unknown) => restoreMappedId(id, teamReverse))
      : result?.judged_teams,
    details: Array.isArray(result?.details)
      ? result.details.map((detail: any) => ({
          ...detail,
          id: restoreMappedId(detail?.id, adjudicatorReverse),
          judged_teams: Array.isArray(detail?.judged_teams)
            ? detail.judged_teams.map((id: unknown) => restoreMappedId(id, teamReverse))
            : detail?.judged_teams,
        }))
      : result?.details,
  }))
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

    const teamMaps = buildIdMaps(teams)
    const speakerMaps = buildIdMaps(speakers)
    const mapFromId = (id: string): number =>
      speakerMaps.map.get(id) ??
      teamMaps.map.get(id) ??
      0

    const mappedRawTeamResults = (rawTeamResults as any[])
      .map((result: any) => {
        const teamId = teamMaps.map.get(String(result?.id ?? ''))
        if (teamId === undefined) return null
        const opponents = Array.isArray(result?.opponents)
          ? result.opponents
              .map((opponentId: unknown) => teamMaps.map.get(String(opponentId ?? '')))
              .filter((value: number | undefined): value is number => value !== undefined)
          : []
        return {
          ...result,
          id: teamId,
          from_id: mapFromId(String(result?.from_id ?? '')),
          opponents,
        }
      })
      .filter((result): result is Record<string, any> => result !== null)

    const mappedRawSpeakerResults = (rawSpeakerResults as any[])
      .map((result: any) => {
        const speakerId = speakerMaps.map.get(String(result?.id ?? ''))
        if (speakerId === undefined) return null
        return {
          ...result,
          id: speakerId,
          from_id: mapFromId(String(result?.from_id ?? '')),
        }
      })
      .filter((result): result is Record<string, any> => result !== null)

    const teamInstances = teams.map((team: any) => ({
      id: teamMaps.map.get(String(team._id))!,
      details: buildDetailsForRounds(
        team.details,
        rounds,
        {
          available: team?.template?.available !== false,
          conflicts: Array.isArray(team?.template?.conflicts) ? team.template.conflicts : [],
          speakers: Array.isArray(team?.template?.speakers) ? team.template.speakers : [],
        },
        undefined,
        (speakerId) => speakerMaps.map.get(String(speakerId))
      ),
    }))
    const speakerInstances = speakers
      .map((speaker: any) => speakerMaps.map.get(String(speaker._id)))
      .filter((id: number | undefined): id is number => id !== undefined)
      .map((id) => ({ id }))

    const compiledCore = mappedRawSpeakerResults.length
      ? coreResults.compileTeamResults(
          teamInstances as any,
          speakerInstances as any,
          mappedRawTeamResults as any,
          mappedRawSpeakerResults as any,
          rounds,
          style
        )
      : coreResults.compileTeamResults(
          teamInstances as any,
          mappedRawTeamResults as any,
          rounds,
          style
        )

    const compiled = remapCompiledTeamResults(compiledCore, teamMaps.reverse)
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

    const speakerMaps = buildIdMaps(speakers)
    const mappedRawSpeakerResults = (rawSpeakerResults as any[])
      .map((result: any) => {
        const speakerId = speakerMaps.map.get(String(result?.id ?? ''))
        if (speakerId === undefined) return null
        return {
          ...result,
          id: speakerId,
          from_id: speakerMaps.map.get(String(result?.from_id ?? '')) ?? 0,
        }
      })
      .filter((result): result is Record<string, any> => result !== null)
    const speakerInstances = speakers
      .map((speaker: any) => speakerMaps.map.get(String(speaker._id)))
      .filter((id: number | undefined): id is number => id !== undefined)
      .map((id) => ({ id }))
    const compiledCore = coreResults.compileSpeakerResults(
      speakerInstances as any,
      mappedRawSpeakerResults as any,
      style,
      rounds
    )
    const compiled = remapCompiledSpeakerResults(compiledCore, speakerMaps.reverse)
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

    const [adjudicators, teams] = await Promise.all([
      getAdjudicatorModel(connection)
        .find({ tournamentId })
        .lean()
        .exec(),
      getTeamModel(connection)
        .find({ tournamentId })
        .lean()
        .exec(),
    ])
    const rounds = resolveRounds(round !== undefined ? Number(round) : undefined, rawAdjResults)
    if (rounds.length === 0) {
      res.json({ data: [], errors: [] })
      return
    }

    const adjudicatorMaps = buildIdMaps(adjudicators)
    const teamMaps = buildIdMaps(teams)
    const mappedRawAdjudicatorResults = (rawAdjResults as any[])
      .map((result: any) => {
        const adjudicatorId = adjudicatorMaps.map.get(String(result?.id ?? ''))
        if (adjudicatorId === undefined) return null
        const judgedTeams = Array.isArray(result?.judged_teams)
          ? result.judged_teams
              .map((teamId: unknown) => teamMaps.map.get(String(teamId ?? '')))
              .filter((value: number | undefined): value is number => value !== undefined)
          : []
        return {
          ...result,
          id: adjudicatorId,
          from_id: adjudicatorMaps.map.get(String(result?.from_id ?? '')) ?? 0,
          judged_teams: judgedTeams,
        }
      })
      .filter((result): result is Record<string, any> => result !== null)
    const adjudicatorInstances = adjudicators
      .map((adj: any) => {
        const mappedId = adjudicatorMaps.map.get(String(adj._id))
        if (mappedId === undefined) return null
        return {
          id: mappedId,
          preev: Number((adj as any).preev ?? (adj as any).strength ?? 0),
          details: buildDetailsForRounds(
            (adj as any).details,
            rounds,
            {
              available: (adj as any)?.template?.available !== false,
              conflicts: Array.isArray((adj as any)?.template?.conflicts)
                ? (adj as any).template.conflicts
                : [],
              conflict_teams: Array.isArray((adj as any)?.template?.conflict_teams)
                ? (adj as any).template.conflict_teams
                : [],
            },
            undefined,
            undefined,
            (teamId) => teamMaps.map.get(String(teamId))
          ),
        }
      })
      .filter((adj): adj is { id: number; preev: number; details: any[] } => adj !== null)
    const compiledCore = coreResults.compileAdjudicatorResults(
      adjudicatorInstances as any,
      mappedRawAdjudicatorResults as any,
      rounds
    )
    const compiled = remapCompiledAdjudicatorResults(
      compiledCore,
      adjudicatorMaps.reverse,
      teamMaps.reverse
    )
    res.json({ data: sanitizeAggregateForPublic(compiled), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createRawAdjudicatorResult: RequestHandler = rawAdjudicatorResultCrudHandlers.create
export const updateRawAdjudicatorResult: RequestHandler = rawAdjudicatorResultCrudHandlers.update
export const deleteRawAdjudicatorResult: RequestHandler = rawAdjudicatorResultCrudHandlers.deleteOne
export const deleteRawAdjudicatorResults: RequestHandler = rawAdjudicatorResultCrudHandlers.deleteMany
