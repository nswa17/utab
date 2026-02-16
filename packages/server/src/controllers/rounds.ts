import type { RequestHandler } from 'express'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { getRoundModel } from '../models/round.js'
import { getTeamModel } from '../models/team.js'
import { TournamentModel } from '../models/tournament.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { isDuplicateKeyError } from '../services/mongo-error.service.js'
import { sanitizeRoundForPublic } from '../services/response-sanitizer.js'
import {
  DEFAULT_COMPILE_OPTIONS,
  normalizeCompileOptions,
  type CompileOptionsInput,
  type CompileOptions,
} from '../types/compiled-options.js'
import { buildCompiledPayload } from './compiled.js'
import {
  normalizeBreakConfig,
  normalizeBreakSourceRounds,
  type BreakCutoffTiePolicy,
  type BreakSeeding,
} from './shared/break-config.js'
import { badRequest, isValidObjectId, notFound } from './shared/http-errors.js'

type RoundDefaults = {
  userDefinedData: {
    evaluate_from_adjudicators: boolean
    evaluate_from_teams: boolean
    chairs_always_evaluated: boolean
    evaluator_in_team: 'team' | 'speaker'
    no_speaker_score: boolean
    score_by_matter_manner: boolean
    poi: boolean
    best: boolean
    allow_low_tie_win: boolean
  }
  break: {
    source: 'submissions' | 'raw'
    size: number
    cutoff_tie_policy: BreakCutoffTiePolicy
    seeding: BreakSeeding
  }
  compile: {
    source: 'submissions' | 'raw'
    source_rounds: number[]
    options: CompileOptions
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function asRoundList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 1)
    )
  ).sort((left, right) => left - right)
}

function defaultRoundDefaults(): RoundDefaults {
  return {
    userDefinedData: {
      evaluate_from_adjudicators: true,
      evaluate_from_teams: true,
      chairs_always_evaluated: false,
      evaluator_in_team: 'team',
      no_speaker_score: false,
      score_by_matter_manner: true,
      poi: true,
      best: true,
      allow_low_tie_win: true,
    },
    break: {
      source: 'submissions',
      size: 8,
      cutoff_tie_policy: 'manual',
      seeding: 'high_low',
    },
    compile: {
      source: 'submissions',
      source_rounds: [],
      options: normalizeCompileOptions(undefined, DEFAULT_COMPILE_OPTIONS),
    },
  }
}

function normalizeRoundDefaults(input: unknown): RoundDefaults {
  const fallback = defaultRoundDefaults()
  const source = asRecord(input)
  const userDefinedSource = asRecord(source.userDefinedData)
  const breakSource = asRecord(source.break)
  const compileSource = asRecord(source.compile)
  const compileOptionsSource =
    compileSource.options && typeof compileSource.options === 'object'
      ? compileSource.options
      : compileSource
  return {
    userDefinedData: {
      evaluate_from_adjudicators:
        typeof userDefinedSource.evaluate_from_adjudicators === 'boolean'
          ? userDefinedSource.evaluate_from_adjudicators
          : fallback.userDefinedData.evaluate_from_adjudicators,
      evaluate_from_teams:
        typeof userDefinedSource.evaluate_from_teams === 'boolean'
          ? userDefinedSource.evaluate_from_teams
          : fallback.userDefinedData.evaluate_from_teams,
      chairs_always_evaluated:
        typeof userDefinedSource.chairs_always_evaluated === 'boolean'
          ? userDefinedSource.chairs_always_evaluated
          : fallback.userDefinedData.chairs_always_evaluated,
      evaluator_in_team: userDefinedSource.evaluator_in_team === 'speaker' ? 'speaker' : 'team',
      no_speaker_score:
        typeof userDefinedSource.no_speaker_score === 'boolean'
          ? userDefinedSource.no_speaker_score
          : fallback.userDefinedData.no_speaker_score,
      score_by_matter_manner:
        typeof userDefinedSource.score_by_matter_manner === 'boolean'
          ? userDefinedSource.score_by_matter_manner
          : fallback.userDefinedData.score_by_matter_manner,
      poi: typeof userDefinedSource.poi === 'boolean' ? userDefinedSource.poi : fallback.userDefinedData.poi,
      best: typeof userDefinedSource.best === 'boolean' ? userDefinedSource.best : fallback.userDefinedData.best,
      allow_low_tie_win:
        typeof userDefinedSource.allow_low_tie_win === 'boolean'
          ? userDefinedSource.allow_low_tie_win
          : fallback.userDefinedData.allow_low_tie_win,
    },
    break: {
      source: breakSource.source === 'raw' ? 'raw' : fallback.break.source,
      size: (() => {
        const sizeRaw = Number(breakSource.size)
        return Number.isInteger(sizeRaw) && sizeRaw >= 1 ? sizeRaw : fallback.break.size
      })(),
      cutoff_tie_policy:
        breakSource.cutoff_tie_policy === 'include_all' || breakSource.cutoff_tie_policy === 'strict'
          ? (breakSource.cutoff_tie_policy as BreakCutoffTiePolicy)
          : fallback.break.cutoff_tie_policy,
      seeding: breakSource.seeding === 'high_low' ? 'high_low' : fallback.break.seeding,
    },
    compile: {
      source: compileSource.source === 'raw' ? 'raw' : fallback.compile.source,
      source_rounds: asRoundList(compileSource.source_rounds),
      options: normalizeCompileOptions(
        compileOptionsSource as CompileOptionsInput,
        fallback.compile.options
      ),
    },
  }
}

function buildRoundUserDefinedFromDefaults(defaults: RoundDefaults, input: unknown): Record<string, unknown> {
  const current = asRecord(input)
  const merged: Record<string, unknown> = {
    ...defaults.userDefinedData,
    ...current,
  }
  if (!Object.prototype.hasOwnProperty.call(merged, 'hidden')) {
    merged.hidden = false
  }
  if (!Object.prototype.hasOwnProperty.call(current, 'break')) {
    merged.break = {
      enabled: false,
      source: defaults.break.source,
      source_rounds: [],
      size: defaults.break.size,
      cutoff_tie_policy: defaults.break.cutoff_tie_policy,
      seeding: defaults.break.seeding,
      participants: [],
    }
  }
  if (!Object.prototype.hasOwnProperty.call(current, 'compile')) {
    merged.compile = {
      source: defaults.compile.source,
      source_rounds: [...defaults.compile.source_rounds],
      options: normalizeCompileOptions(defaults.compile.options, defaults.compile.options),
    }
  }
  return merged
}

function upsertTeamAvailabilityDetail(details: unknown, roundNumber: number, available: boolean) {
  const list = Array.isArray(details) ? details.map((detail) => ({ ...(detail as Record<string, unknown>) })) : []
  const index = list.findIndex((detail) => Number((detail as any)?.r) === roundNumber)
  const payload = {
    r: roundNumber,
    available,
    institutions: Array.isArray((list[index] as any)?.institutions) ? (list[index] as any).institutions : [],
    speakers: Array.isArray((list[index] as any)?.speakers) ? (list[index] as any).speakers : [],
  }
  if (index >= 0) {
    list[index] = payload
  } else {
    list.push(payload)
  }
  return list.sort((left, right) => Number((left as any)?.r ?? 0) - Number((right as any)?.r ?? 0))
}

function ensureTournamentId(
  res: Parameters<RequestHandler>[1],
  tournamentId?: string
): tournamentId is string {
  if (!tournamentId || !isValidObjectId(tournamentId)) {
    badRequest(res, 'Invalid tournament id')
    return false
  }
  return true
}

function ensureRoundId(res: Parameters<RequestHandler>[1], id: string): boolean {
  if (!isValidObjectId(id)) {
    badRequest(res, 'Invalid round id')
    return false
  }
  return true
}

function requireSingleTournamentPayload(
  res: Parameters<RequestHandler>[1],
  payload: Array<{ tournamentId: string }>
): string | null {
  const tournamentId = payload[0]?.tournamentId
  if (!ensureTournamentId(res, tournamentId)) return null
  if (!payload.every((item) => item.tournamentId === tournamentId)) {
    badRequest(res, 'Mixed tournament ids are not supported')
    return null
  }
  return tournamentId
}

export const listRounds: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, public: publicParam } = req.query as {
      tournamentId?: string
      public?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const rounds = await RoundModel.find({ tournamentId }).sort({ round: 1 }).lean().exec()
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    const forcePublic =
      publicParam === '1' || publicParam === 'true' || publicParam === 'yes' || publicParam === 'public'
    const data = isAdmin && !forcePublic ? rounds : rounds.map((round) => sanitizeRoundForPublic(round))
    res.json({ data, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const getRound: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId, public: publicParam } = req.query as {
      tournamentId?: string
      public?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureRoundId(res, id)) return
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const round = await RoundModel.findById(id).lean().exec()
    if (!round) {
      notFound(res, 'Round not found')
      return
    }
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    const forcePublic =
      publicParam === '1' || publicParam === 'true' || publicParam === 'yes' || publicParam === 'public'
    res.json({ data: isAdmin && !forcePublic ? round : sanitizeRoundForPublic(round), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createRound: RequestHandler = async (req, res, next) => {
  try {
    if (Array.isArray(req.body)) {
      const payload = req.body as Array<{
        tournamentId: string
        round: number
        name?: string
        motions?: string[]
        motionOpened?: boolean
        teamAllocationOpened?: boolean
        adjudicatorAllocationOpened?: boolean
        weightsOfAdjudicators?: { chair: number; panel: number; trainee: number }
        userDefinedData?: unknown
      }>
      if (payload.length === 0) {
        badRequest(res, 'Empty payload')
        return
      }
      const tournamentId = requireSingleTournamentPayload(res, payload)
      if (!tournamentId) return
      const tournament = await TournamentModel.findById(tournamentId).lean().exec()
      const roundDefaults = normalizeRoundDefaults(
        asRecord((tournament as any)?.user_defined_data).round_defaults
      )
      const connection = await getTournamentConnection(tournamentId)
      const RoundModel = getRoundModel(connection)
      const preparedPayload = payload.map((item) => ({
        ...item,
        userDefinedData: buildRoundUserDefinedFromDefaults(roundDefaults, item.userDefinedData),
      }))
      const created = await RoundModel.insertMany(preparedPayload, { ordered: false })
      res.status(201).json({ data: created, errors: [] })
      return
    }

    const {
      tournamentId,
      round,
      name,
      motions,
      motionOpened,
      teamAllocationOpened,
      adjudicatorAllocationOpened,
      weightsOfAdjudicators,
      userDefinedData,
    } = req.body as {
      tournamentId: string
      round: number
      name?: string
      motions?: string[]
      motionOpened?: boolean
      teamAllocationOpened?: boolean
      adjudicatorAllocationOpened?: boolean
      weightsOfAdjudicators?: { chair: number; panel: number; trainee: number }
      userDefinedData?: unknown
    }

    if (!ensureTournamentId(res, tournamentId)) return

    const tournament = await TournamentModel.findById(tournamentId).lean().exec()
    const roundDefaults = normalizeRoundDefaults(asRecord((tournament as any)?.user_defined_data).round_defaults)

    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const created = await RoundModel.create({
      tournamentId,
      round,
      name,
      motions,
      motionOpened,
      teamAllocationOpened,
      adjudicatorAllocationOpened,
      weightsOfAdjudicators,
      userDefinedData: buildRoundUserDefinedFromDefaults(roundDefaults, userDefinedData),
    })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: 'Round already exists' }] })
      return
    }
    next(err)
  }
}

export const bulkUpdateRounds: RequestHandler = async (req, res, next) => {
  try {
    if (!Array.isArray(req.body) || req.body.length === 0) {
      badRequest(res, 'Empty payload')
      return
    }
    const payload = req.body as Array<{
      id: string
      tournamentId: string
      round?: number
      name?: string
      motions?: string[]
      motionOpened?: boolean
      teamAllocationOpened?: boolean
      adjudicatorAllocationOpened?: boolean
      weightsOfAdjudicators?: { chair: number; panel: number; trainee: number }
      userDefinedData?: unknown
    }>
    const tournamentId = requireSingleTournamentPayload(res, payload)
    if (!tournamentId) return
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const ops = payload.map((item) => {
      const update: Record<string, unknown> = {}
      if (item.round !== undefined) update.round = item.round
      if (item.name !== undefined) update.name = item.name
      if (item.motions !== undefined) update.motions = item.motions
      if (item.motionOpened !== undefined) update.motionOpened = item.motionOpened
      if (item.teamAllocationOpened !== undefined) update.teamAllocationOpened = item.teamAllocationOpened
      if (item.adjudicatorAllocationOpened !== undefined)
        update.adjudicatorAllocationOpened = item.adjudicatorAllocationOpened
      if (item.weightsOfAdjudicators !== undefined) update.weightsOfAdjudicators = item.weightsOfAdjudicators
      if (item.userDefinedData !== undefined) update.userDefinedData = item.userDefinedData
      return {
        updateOne: {
          filter: { _id: item.id, tournamentId },
          update: { $set: update },
        },
      }
    })
    await RoundModel.bulkWrite(ops, { ordered: false })
    const ids = payload.map((item) => item.id)
    const updated = await RoundModel.find({ _id: { $in: ids }, tournamentId }).lean().exec()
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const bulkDeleteRounds: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, ids } = req.query as { tournamentId?: string; ids?: string }
    if (!ensureTournamentId(res, tournamentId)) return
    const idList =
      typeof ids === 'string' && ids.length > 0 ? ids.split(',').filter((id) => id.length > 0) : []
    const filter: Record<string, unknown> = { tournamentId }
    if (idList.length > 0) {
      filter._id = { $in: idList }
    }
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const result = await RoundModel.deleteMany(filter).exec()
    res.json({ data: { deletedCount: result.deletedCount }, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const updateRound: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const {
      tournamentId,
      round,
      name,
      motions,
      motionOpened,
      teamAllocationOpened,
      adjudicatorAllocationOpened,
      weightsOfAdjudicators,
      userDefinedData,
    } = req.body as {
      tournamentId: string
      round?: number
      name?: string
      motions?: string[]
      motionOpened?: boolean
      teamAllocationOpened?: boolean
      adjudicatorAllocationOpened?: boolean
      weightsOfAdjudicators?: { chair: number; panel: number; trainee: number }
      userDefinedData?: unknown
    }

    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureRoundId(res, id)) return

    const update: Record<string, unknown> = {}
    if (round !== undefined) update.round = round
    if (name !== undefined) update.name = name
    if (motions !== undefined) update.motions = motions
    if (motionOpened !== undefined) update.motionOpened = motionOpened
    if (teamAllocationOpened !== undefined) update.teamAllocationOpened = teamAllocationOpened
    if (adjudicatorAllocationOpened !== undefined)
      update.adjudicatorAllocationOpened = adjudicatorAllocationOpened
    if (weightsOfAdjudicators !== undefined) update.weightsOfAdjudicators = weightsOfAdjudicators
    if (userDefinedData !== undefined) update.userDefinedData = userDefinedData

    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const updated = await RoundModel.findOneAndUpdate({ _id: id, tournamentId }, { $set: update }, { new: true })
      .lean()
      .exec()
    if (!updated) {
      notFound(res, 'Round not found')
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const previewBreakCandidates: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId, source = 'submissions', sourceRounds, size } = req.body as {
      tournamentId: string
      source?: 'submissions' | 'raw'
      sourceRounds?: number[]
      size?: number
    }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureRoundId(res, id)) return

    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const roundDoc = await RoundModel.findOne({ _id: id, tournamentId }).lean().exec()
    if (!roundDoc) {
      notFound(res, 'Round not found')
      return
    }

    const roundNumber = Number((roundDoc as any).round)
    if (!Number.isInteger(roundNumber) || roundNumber < 2) {
      badRequest(res, 'Break candidates require a target round number of 2 or later')
      return
    }

    const normalizedSourceRounds = normalizeBreakSourceRounds(roundNumber, sourceRounds)
    const effectiveSourceRounds =
      normalizedSourceRounds.length > 0
        ? normalizedSourceRounds
        : Array.from({ length: roundNumber - 1 }, (_, index) => index + 1)
    const requestedSizeRaw = Number(size)
    const requestedSize = Number.isInteger(requestedSizeRaw) && requestedSizeRaw >= 1 ? requestedSizeRaw : null

    const { payload } = await buildCompiledPayload(
      tournamentId,
      source,
      effectiveSourceRounds
    )
    const TeamModel = getTeamModel(connection)
    const teams = await TeamModel.find({ tournamentId }).lean().exec()
    const teamsById = new Map<string, any>(teams.map((team) => [String(team._id), team]))

    const candidates = (Array.isArray(payload.compiled_team_results) ? payload.compiled_team_results : [])
      .map((result: any) => {
        const teamId = String(result?.id ?? '')
        const team = teamsById.get(teamId)
        if (!team) return null
        const detail = Array.isArray(team.details)
          ? team.details.find((item: any) => Number(item?.r) === roundNumber)
          : null
        const rankingRaw = Number(result?.ranking)
        const ranking = Number.isFinite(rankingRaw) ? rankingRaw : null
        return {
          teamId,
          teamName: String(team.name ?? teamId),
          ranking,
          win: Number(result?.win ?? 0),
          sum: Number(result?.sum ?? 0),
          margin: Number(result?.margin ?? 0),
          available: detail?.available !== false,
          tieGroup: 0,
          isCutoffTie: false,
        }
      })
      .filter((item): item is {
        teamId: string
        teamName: string
        ranking: number | null
        win: number
        sum: number
        margin: number
        available: boolean
        tieGroup: number
        isCutoffTie: boolean
      } => item !== null)
      .sort((left, right) => {
        if (left.ranking !== null && right.ranking !== null && left.ranking !== right.ranking) {
          return left.ranking - right.ranking
        }
        if (left.win !== right.win) return right.win - left.win
        if (left.sum !== right.sum) return right.sum - left.sum
        if (left.margin !== right.margin) return right.margin - left.margin
        return left.teamName.localeCompare(right.teamName)
      })

    let tieGroup = 0
    let lastRanking: number | null = null
    candidates.forEach((candidate, index) => {
      if (index === 0 || candidate.ranking !== lastRanking) tieGroup += 1
      candidate.tieGroup = tieGroup
      lastRanking = candidate.ranking
    })

    if (requestedSize !== null && requestedSize > 0 && candidates.length >= requestedSize) {
      const cutoff = candidates[requestedSize - 1]
      if (cutoff?.ranking !== null) {
        const betterCount = candidates.filter(
          (candidate) => candidate.ranking !== null && candidate.ranking < cutoff.ranking!
        ).length
        const atCutoff = candidates.filter((candidate) => candidate.ranking === cutoff.ranking).length
        const isTieOverflow = betterCount < requestedSize && betterCount + atCutoff > requestedSize
        if (isTieOverflow) {
          candidates.forEach((candidate) => {
            candidate.isCutoffTie = candidate.ranking === cutoff.ranking
          })
        }
      }
    }

    res.json({
      data: {
        roundId: id,
        round: roundNumber,
        source,
        sourceRounds: effectiveSourceRounds,
        size: requestedSize,
        candidates,
      },
      errors: [],
    })
  } catch (err: any) {
    if ((err as any)?.status === 404) {
      notFound(res, 'Tournament not found')
      return
    }
    next(err)
  }
}

export const updateRoundBreak: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId, break: breakInput, syncTeamAvailability = true } = req.body as {
      tournamentId: string
      break: unknown
      syncTeamAvailability?: boolean
    }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureRoundId(res, id)) return

    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const TeamModel = getTeamModel(connection)
    const roundDoc = await RoundModel.findOne({ _id: id, tournamentId }).lean().exec()
    if (!roundDoc) {
      notFound(res, 'Round not found')
      return
    }
    const roundNumber = Number((roundDoc as any).round)
    if (!Number.isInteger(roundNumber) || roundNumber < 1) {
      badRequest(res, 'Invalid round number')
      return
    }

    const teams = await TeamModel.find({ tournamentId }).lean().exec()
    const teamIds = new Set(teams.map((team) => String(team._id)))
    const normalizedBreak = normalizeBreakConfig(roundNumber, breakInput)

    if (normalizedBreak.enabled) {
      const seenTeamIds = new Set<string>()
      const seenSeeds = new Set<number>()
      for (const participant of normalizedBreak.participants) {
        if (!teamIds.has(participant.teamId)) {
          badRequest(res, `Unknown team in break participants: ${participant.teamId}`)
          return
        }
        if (seenTeamIds.has(participant.teamId)) {
          badRequest(res, `Duplicate team in break participants: ${participant.teamId}`)
          return
        }
        if (seenSeeds.has(participant.seed)) {
          badRequest(res, `Duplicate seed in break participants: ${participant.seed}`)
          return
        }
        seenTeamIds.add(participant.teamId)
        seenSeeds.add(participant.seed)
      }
    }

    const currentUserDefined = asRecord((roundDoc as any).userDefinedData)
    const nextUserDefined = {
      ...currentUserDefined,
      break: normalizedBreak,
    }

    const updatedRound = await RoundModel.findOneAndUpdate(
      { _id: id, tournamentId },
      { $set: { userDefinedData: nextUserDefined } },
      { new: true }
    )
      .lean()
      .exec()

    if (!updatedRound) {
      notFound(res, 'Round not found')
      return
    }

    let updatedTeamCount = 0
    if (syncTeamAvailability) {
      // participants が未確定（空）なブレイクは、後続ラウンドで前ラウンド結果から導出される。
      // この状態で全チーム unavailable へ落とさないため、空の場合は全チームを available 扱いにする。
      const selectedTeamIds =
        normalizedBreak.enabled && normalizedBreak.participants.length > 0
        ? new Set(normalizedBreak.participants.map((participant) => participant.teamId))
        : new Set<string>(teams.map((team) => String(team._id)))
      const ops: any[] = teams.map((team) => {
        const teamId = String(team._id)
        const available = selectedTeamIds.has(teamId)
        return {
          updateOne: {
            filter: { _id: team._id, tournamentId },
            update: {
              $set: {
                details: upsertTeamAvailabilityDetail(team.details, roundNumber, available) as any,
              },
            },
          },
        }
      })
      if (ops.length > 0) {
        const result = await TeamModel.bulkWrite(ops, { ordered: false })
        updatedTeamCount = result.modifiedCount ?? 0
      }
    }

    res.json({
      data: {
        round: updatedRound,
        break: normalizedBreak,
        updatedTeamCount,
      },
      errors: [],
    })
  } catch (err) {
    next(err)
  }
}

export const deleteRound: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureRoundId(res, id)) return
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const deleted = await RoundModel.findOneAndDelete({ _id: id, tournamentId }).lean().exec()
    if (!deleted) {
      notFound(res, 'Round not found')
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
