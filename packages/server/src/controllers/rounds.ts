import type { RequestHandler } from 'express'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { getAdjudicatorModel } from '../models/adjudicator.js'
import { getRoundModel } from '../models/round.js'
import { getTeamModel } from '../models/team.js'
import { getVenueModel } from '../models/venue.js'
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
import { buildAwardSelectionUserDefinedData } from './shared/award-selection.js'
import { isRoundBreakEnabled, withRoundBreakEnabled } from './shared/round-break.js'
import {
  annotateBreakCandidatesForPreview,
  buildBreakCandidatesFromCompiledPayload,
} from './shared/break-candidates.js'
import { normalizeTournamentBreakConfig } from './shared/tournament-break.js'
import { withTournamentTeamRankingPriority } from './shared/tournament-team-ranking.js'
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
    best_min_count: number
    best_max_count: number
    poi_min_count: number
    poi_max_count: number
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

function isRoundHidden(round: unknown): boolean {
  const source = asRecord(round)
  const userDefinedData = asRecord(source.userDefinedData)
  return userDefinedData.hidden === true
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

function normalizeBreakSeeding(value: unknown, fallback: BreakSeeding): BreakSeeding {
  if (value === 'high_low') return 'reseed_each_round'
  if (value === 'reseed_each_round') return 'reseed_each_round'
  if (value === 'fixed_bracket') return 'fixed_bracket'
  if (value === 'random_within_tie_group') return 'random_within_tie_group'
  if (value === 'random_full') return 'random_full'
  return fallback
}

function normalizeRoundCompileOptions(
  input?: CompileOptionsInput,
  fallback: CompileOptions = DEFAULT_COMPILE_OPTIONS
): CompileOptions {
  const normalized = normalizeCompileOptions(input, fallback)
  return {
    ...normalized,
    tie_points: DEFAULT_COMPILE_OPTIONS.tie_points,
  }
}

function sanitizeRoundCompileConfig(value: unknown): Record<string, unknown> {
  const source = asRecord(value)
  const compileOptionsSource =
    source.options && typeof source.options === 'object' ? source.options : source
  const normalizedOptions = normalizeRoundCompileOptions(
    compileOptionsSource as CompileOptionsInput,
    DEFAULT_COMPILE_OPTIONS
  ) as Record<string, unknown>
  const { ranking_priority: _ignoredRankingPriority, ...optionsWithoutRanking } = normalizedOptions
  void _ignoredRankingPriority
  return {
    source: source.source === 'raw' ? 'raw' : 'submissions',
    source_rounds: asRoundList(source.source_rounds),
    options: optionsWithoutRanking,
  }
}

function sanitizeRoundBreakConfig(value: unknown): Record<string, unknown> {
  const source = asRecord(value)
  const { enabled: _legacyEnabled, ...rest } = source
  void _legacyEnabled
  return rest
}

function defaultRoundDefaults(): RoundDefaults {
  const awardSelection = buildAwardSelectionUserDefinedData(undefined)
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
      ...awardSelection,
      allow_low_tie_win: true,
    },
    break: {
      source: 'submissions',
      size: 8,
      cutoff_tie_policy: 'include_all',
      seeding: 'fixed_bracket',
    },
    compile: {
      source: 'submissions',
      source_rounds: [],
      options: normalizeRoundCompileOptions(undefined, DEFAULT_COMPILE_OPTIONS),
    },
  }
}

function normalizeRoundDefaults(input: unknown): RoundDefaults {
  const fallback = defaultRoundDefaults()
  const source = asRecord(input)
  const userDefinedSource = asRecord(source.userDefinedData)
  const breakSource = asRecord(source.break)
  const compileSource = asRecord(source.compile)
  const awardSelection = buildAwardSelectionUserDefinedData(userDefinedSource)
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
      ...awardSelection,
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
        breakSource.cutoff_tie_policy === 'manual' ||
        breakSource.cutoff_tie_policy === 'include_all' ||
        breakSource.cutoff_tie_policy === 'strict'
          ? (breakSource.cutoff_tie_policy as BreakCutoffTiePolicy)
          : fallback.break.cutoff_tie_policy,
      seeding: normalizeBreakSeeding(breakSource.seeding, fallback.break.seeding),
    },
    compile: {
      source: compileSource.source === 'raw' ? 'raw' : fallback.compile.source,
      source_rounds: asRoundList(compileSource.source_rounds),
      options: normalizeRoundCompileOptions(
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
  Object.assign(merged, buildAwardSelectionUserDefinedData(merged))
  const breakRoundEnabled = merged.break_round === true
  merged.break_round = breakRoundEnabled
  if (!Object.prototype.hasOwnProperty.call(merged, 'hidden')) {
    merged.hidden = false
  }
  if (!Object.prototype.hasOwnProperty.call(current, 'break')) {
    merged.break = {
      source: defaults.break.source,
      source_rounds: [],
      size: defaults.break.size,
      cutoff_tie_policy: defaults.break.cutoff_tie_policy,
      seeding: defaults.break.seeding,
      participants: [],
    }
  } else {
    merged.break = sanitizeRoundBreakConfig(merged.break)
  }
  if (!Object.prototype.hasOwnProperty.call(current, 'compile')) {
    merged.compile = sanitizeRoundCompileConfig({
      source: defaults.compile.source,
      source_rounds: [...defaults.compile.source_rounds],
      options: normalizeRoundCompileOptions(defaults.compile.options, defaults.compile.options),
    })
  } else {
    merged.compile = sanitizeRoundCompileConfig(merged.compile)
  }
  if (breakRoundEnabled) {
    merged.allow_low_tie_win = false
  }
  return merged
}

function applyBreakConstraintsToUserDefined(input: unknown): Record<string, unknown> {
  const current = asRecord(input)
  const breakRoundEnabled = current.break_round === true
  const next: Record<string, unknown> = {
    ...current,
    break_round: breakRoundEnabled,
    break: sanitizeRoundBreakConfig(current.break),
  }
  if (Object.prototype.hasOwnProperty.call(current, 'compile')) {
    next.compile = sanitizeRoundCompileConfig(current.compile)
  }
  if (breakRoundEnabled) {
    next.allow_low_tie_win = false
  }
  return next
}

type TeamTemplate = {
  available: boolean
  conflicts: string[]
  speakers: string[]
}

type AdjudicatorTemplate = {
  available: boolean
  conflicts: string[]
  conflict_teams: string[]
}

type VenueTemplate = {
  available: boolean
  priority: number
}

function normalizeStringIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  value.forEach((item) => {
    const token = String(item ?? '').trim()
    if (!token || seen.has(token)) return
    seen.add(token)
    out.push(token)
  })
  return out
}

function normalizeTeamTemplate(value: unknown): TeamTemplate {
  const source = asRecord(value)
  return {
    available: source.available !== false,
    conflicts: normalizeStringIdList(source.conflicts),
    speakers: normalizeStringIdList(source.speakers),
  }
}

function normalizeAdjudicatorTemplate(value: unknown): AdjudicatorTemplate {
  const source = asRecord(value)
  return {
    available: source.available !== false,
    conflicts: normalizeStringIdList(source.conflicts),
    conflict_teams: normalizeStringIdList(source.conflict_teams),
  }
}

function normalizeVenueTemplate(value: unknown): VenueTemplate {
  const source = asRecord(value)
  const priorityRaw = Number(source.priority)
  return {
    available: source.available !== false,
    priority: Number.isFinite(priorityRaw) ? priorityRaw : 1,
  }
}

function sortDetailsByRound(details: Array<Record<string, unknown>>) {
  return details.sort((left, right) => Number((left as any)?.r ?? 0) - Number((right as any)?.r ?? 0))
}

function upsertTeamRoundDetail(
  details: unknown,
  roundNumber: number,
  templateValue: unknown,
  availableOverride?: boolean
) {
  const template = normalizeTeamTemplate(templateValue)
  const list = Array.isArray(details) ? details.map((detail) => ({ ...(detail as Record<string, unknown>) })) : []
  const index = list.findIndex((detail) => Number((detail as any)?.r) === roundNumber)
  const current = index >= 0 ? asRecord(list[index]) : {}
  const currentConflicts = normalizeStringIdList(current.conflicts)
  const currentSpeakers = normalizeStringIdList(current.speakers)
  const payload = {
    r: roundNumber,
    available: availableOverride ?? (typeof current.available === 'boolean' ? current.available : template.available),
    conflicts: currentConflicts.length > 0 ? currentConflicts : [...template.conflicts],
    speakers: currentSpeakers.length > 0 ? currentSpeakers : [...template.speakers],
  }
  if (index >= 0) {
    list[index] = payload
  } else {
    list.push(payload)
  }
  return sortDetailsByRound(list)
}

function upsertAdjudicatorRoundDetail(details: unknown, roundNumber: number, templateValue: unknown) {
  const template = normalizeAdjudicatorTemplate(templateValue)
  const list = Array.isArray(details) ? details.map((detail) => ({ ...(detail as Record<string, unknown>) })) : []
  const index = list.findIndex((detail) => Number((detail as any)?.r) === roundNumber)
  const current = index >= 0 ? asRecord(list[index]) : {}
  const currentConflicts = normalizeStringIdList(current.conflicts)
  const currentConflictTeams = normalizeStringIdList(current.conflict_teams)
  const payload = {
    r: roundNumber,
    available: typeof current.available === 'boolean' ? current.available : template.available,
    conflicts: currentConflicts.length > 0 ? currentConflicts : [...template.conflicts],
    conflict_teams: currentConflictTeams.length > 0 ? currentConflictTeams : [...template.conflict_teams],
  }
  if (index >= 0) {
    list[index] = payload
  } else {
    list.push(payload)
  }
  return sortDetailsByRound(list)
}

function upsertVenueRoundDetail(details: unknown, roundNumber: number, templateValue: unknown) {
  const template = normalizeVenueTemplate(templateValue)
  const list = Array.isArray(details) ? details.map((detail) => ({ ...(detail as Record<string, unknown>) })) : []
  const index = list.findIndex((detail) => Number((detail as any)?.r) === roundNumber)
  const current = index >= 0 ? asRecord(list[index]) : {}
  const priorityRaw = Number(current.priority)
  const payload = {
    r: roundNumber,
    available: typeof current.available === 'boolean' ? current.available : template.available,
    priority: Number.isFinite(priorityRaw) ? priorityRaw : template.priority,
  }
  if (index >= 0) {
    list[index] = payload
  } else {
    list.push(payload)
  }
  return sortDetailsByRound(list)
}

function removeRoundDetails(details: unknown, roundsToRemove: Set<number>) {
  const list = Array.isArray(details) ? details : []
  return list
    .filter((detail) => !roundsToRemove.has(Number((detail as any)?.r)))
    .map((detail) => ({ ...(detail as Record<string, unknown>) }))
}

async function syncEntityRoundDetailsForCreate(
  tournamentId: string,
  createdRounds: number[]
): Promise<void> {
  const uniqueRounds = Array.from(new Set(createdRounds.filter((round) => Number.isInteger(round) && round >= 1)))
  if (uniqueRounds.length === 0) return

  const connection = await getTournamentConnection(tournamentId)
  const TeamModel = getTeamModel(connection)
  const AdjudicatorModel = getAdjudicatorModel(connection)
  const VenueModel = getVenueModel(connection)

  const [teams, adjudicators, venues] = await Promise.all([
    TeamModel.find({ tournamentId }).lean().exec(),
    AdjudicatorModel.find({ tournamentId }).lean().exec(),
    VenueModel.find({ tournamentId }).lean().exec(),
  ])

  const teamOps = teams.map((team: any) => {
    const template = normalizeTeamTemplate(team?.template)
    let nextDetails = Array.isArray(team?.details) ? team.details : []
    uniqueRounds.forEach((roundNumber) => {
      nextDetails = upsertTeamRoundDetail(nextDetails, roundNumber, template)
    })
    return {
      updateOne: {
        filter: { _id: team._id, tournamentId },
        update: { $set: { template, details: nextDetails as any } },
      },
    }
  })

  const adjudicatorOps = adjudicators.map((adjudicator: any) => {
    const template = normalizeAdjudicatorTemplate(adjudicator?.template)
    let nextDetails = Array.isArray(adjudicator?.details) ? adjudicator.details : []
    uniqueRounds.forEach((roundNumber) => {
      nextDetails = upsertAdjudicatorRoundDetail(nextDetails, roundNumber, template)
    })
    return {
      updateOne: {
        filter: { _id: adjudicator._id, tournamentId },
        update: { $set: { template, details: nextDetails as any } },
      },
    }
  })

  const venueOps = venues.map((venue: any) => {
    const template = normalizeVenueTemplate(venue?.template)
    let nextDetails = Array.isArray(venue?.details) ? venue.details : []
    uniqueRounds.forEach((roundNumber) => {
      nextDetails = upsertVenueRoundDetail(nextDetails, roundNumber, template)
    })
    return {
      updateOne: {
        filter: { _id: venue._id, tournamentId },
        update: { $set: { template, details: nextDetails as any } },
      },
    }
  })

  await Promise.all([
    teamOps.length > 0 ? TeamModel.bulkWrite(teamOps, { ordered: false }) : Promise.resolve(),
    adjudicatorOps.length > 0
      ? AdjudicatorModel.bulkWrite(adjudicatorOps, { ordered: false })
      : Promise.resolve(),
    venueOps.length > 0 ? VenueModel.bulkWrite(venueOps, { ordered: false }) : Promise.resolve(),
  ])
}

async function syncEntityRoundDetailsForDelete(
  tournamentId: string,
  deletedRounds: number[]
): Promise<void> {
  const roundSet = new Set(deletedRounds.filter((round) => Number.isInteger(round) && round >= 1))
  if (roundSet.size === 0) return

  const connection = await getTournamentConnection(tournamentId)
  const TeamModel = getTeamModel(connection)
  const AdjudicatorModel = getAdjudicatorModel(connection)
  const VenueModel = getVenueModel(connection)

  const [teams, adjudicators, venues] = await Promise.all([
    TeamModel.find({ tournamentId }).lean().exec(),
    AdjudicatorModel.find({ tournamentId }).lean().exec(),
    VenueModel.find({ tournamentId }).lean().exec(),
  ])

  const teamOps = teams.map((team: any) => ({
    updateOne: {
      filter: { _id: team._id, tournamentId },
      update: {
        $set: {
          template: normalizeTeamTemplate(team?.template),
          details: removeRoundDetails(team?.details, roundSet) as any,
        },
      },
    },
  }))

  const adjudicatorOps = adjudicators.map((adjudicator: any) => ({
    updateOne: {
      filter: { _id: adjudicator._id, tournamentId },
      update: {
        $set: {
          template: normalizeAdjudicatorTemplate(adjudicator?.template),
          details: removeRoundDetails(adjudicator?.details, roundSet) as any,
        },
      },
    },
  }))

  const venueOps = venues.map((venue: any) => ({
    updateOne: {
      filter: { _id: venue._id, tournamentId },
      update: {
        $set: {
          template: normalizeVenueTemplate(venue?.template),
          details: removeRoundDetails(venue?.details, roundSet) as any,
        },
      },
    },
  }))

  await Promise.all([
    teamOps.length > 0 ? TeamModel.bulkWrite(teamOps, { ordered: false }) : Promise.resolve(),
    adjudicatorOps.length > 0
      ? AdjudicatorModel.bulkWrite(adjudicatorOps, { ordered: false })
      : Promise.resolve(),
    venueOps.length > 0 ? VenueModel.bulkWrite(venueOps, { ordered: false }) : Promise.resolve(),
  ])
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
    const data =
      isAdmin && !forcePublic
        ? rounds
        : rounds.filter((round) => !isRoundHidden(round)).map((round) => sanitizeRoundForPublic(round))
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
    if ((!isAdmin || forcePublic) && isRoundHidden(round)) {
      notFound(res, 'Round not found')
      return
    }
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
      const tournamentUserDefined = asRecord((tournament as any)?.user_defined_data)
      const roundDefaults = normalizeRoundDefaults(tournamentUserDefined.round_defaults)
      const connection = await getTournamentConnection(tournamentId)
      const RoundModel = getRoundModel(connection)
      const preparedPayload = payload.map((item) => {
        const normalizedTournamentBreak = normalizeTournamentBreakConfig(
          Number(item.round),
          tournamentUserDefined.break
        )
        const defaultsWithTournamentBreak: RoundDefaults = {
          ...roundDefaults,
          break: {
            source: normalizedTournamentBreak.source,
            size: normalizedTournamentBreak.size,
            cutoff_tie_policy: normalizedTournamentBreak.cutoff_tie_policy,
            seeding: normalizedTournamentBreak.seeding,
          },
        }
        return {
          ...item,
          userDefinedData: applyBreakConstraintsToUserDefined(
            buildRoundUserDefinedFromDefaults(defaultsWithTournamentBreak, item.userDefinedData)
          ),
        }
      })
      const created = await RoundModel.insertMany(preparedPayload, { ordered: false })
      await syncEntityRoundDetailsForCreate(
        tournamentId,
        preparedPayload.map((item) => Number(item.round))
      )
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
    const tournamentUserDefined = asRecord((tournament as any)?.user_defined_data)
    const roundDefaults = normalizeRoundDefaults(tournamentUserDefined.round_defaults)
    const normalizedTournamentBreak = normalizeTournamentBreakConfig(round, tournamentUserDefined.break)
    const defaultsWithTournamentBreak: RoundDefaults = {
      ...roundDefaults,
      break: {
        source: normalizedTournamentBreak.source,
        size: normalizedTournamentBreak.size,
        cutoff_tie_policy: normalizedTournamentBreak.cutoff_tie_policy,
        seeding: normalizedTournamentBreak.seeding,
      },
    }

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
      userDefinedData: applyBreakConstraintsToUserDefined(
        buildRoundUserDefinedFromDefaults(defaultsWithTournamentBreak, userDefinedData)
      ),
    })
    await syncEntityRoundDetailsForCreate(tournamentId, [Number(round)])
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
    const ids = payload.map((item) => item.id)
    const beforeDocs = await RoundModel.find({ _id: { $in: ids }, tournamentId })
      .select({ _id: 1, round: 1 })
      .lean()
      .exec()
    const beforeRoundById = new Map<string, number>(
      beforeDocs.map((doc: any) => [String(doc?._id ?? ''), Number(doc?.round)])
    )
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
      if (item.userDefinedData !== undefined) {
        update.userDefinedData = applyBreakConstraintsToUserDefined(item.userDefinedData)
      }
      return {
        updateOne: {
          filter: { _id: item.id, tournamentId },
          update: { $set: update },
        },
      }
    })
    await RoundModel.bulkWrite(ops, { ordered: false })
    const updated = await RoundModel.find({ _id: { $in: ids }, tournamentId }).lean().exec()
    const addedRounds: number[] = []
    const removedRounds: number[] = []
    payload.forEach((item) => {
      if (item.round === undefined) return
      const previousRound = Number(beforeRoundById.get(String(item.id)))
      const nextRound = Number(item.round)
      if (!Number.isInteger(nextRound) || nextRound < 1) return
      if (!Number.isInteger(previousRound) || previousRound === nextRound) return
      removedRounds.push(previousRound)
      addedRounds.push(nextRound)
    })
    if (addedRounds.length > 0) {
      await syncEntityRoundDetailsForCreate(tournamentId, addedRounds)
    }
    if (removedRounds.length > 0) {
      await syncEntityRoundDetailsForDelete(tournamentId, removedRounds)
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: 'Round already exists' }] })
      return
    }
    next(err)
  }
}

export const bulkDeleteRounds: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, ids } = req.query as { tournamentId?: string; ids?: string }
    if (!ensureTournamentId(res, tournamentId)) return
    const idList =
      typeof ids === 'string'
        ? ids
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id.length > 0)
        : []
    if (idList.length === 0) {
      badRequest(res, 'Bulk delete ids are required')
      return
    }
    if (idList.some((id) => !isValidObjectId(id))) {
      badRequest(res, 'Invalid round id')
      return
    }
    const filter: Record<string, unknown> = { tournamentId, _id: { $in: idList } }
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const targets = await RoundModel.find(filter).select({ _id: 1, round: 1 }).lean().exec()
    const deletedRounds = targets
      .map((item: any) => Number(item?.round))
      .filter((value) => Number.isInteger(value) && value >= 1)
    const result = await RoundModel.deleteMany(filter).exec()
    if (deletedRounds.length > 0) {
      await syncEntityRoundDetailsForDelete(tournamentId, deletedRounds)
    }
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
    if (userDefinedData !== undefined) {
      update.userDefinedData = applyBreakConstraintsToUserDefined(userDefinedData)
    }

    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const before = await RoundModel.findOne({ _id: id, tournamentId }).lean().exec()
    if (!before) {
      notFound(res, 'Round not found')
      return
    }
    const updated = await RoundModel.findOneAndUpdate({ _id: id, tournamentId }, { $set: update }, { new: true })
      .lean()
      .exec()
    if (!updated) {
      notFound(res, 'Round not found')
      return
    }
    const previousRound = Number((before as any)?.round)
    const nextRound = Number((updated as any)?.round)
    if (Number.isInteger(previousRound) && Number.isInteger(nextRound) && previousRound !== nextRound) {
      await syncEntityRoundDetailsForCreate(tournamentId, [nextRound])
      await syncEntityRoundDetailsForDelete(tournamentId, [previousRound])
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: 'Round already exists' }] })
      return
    }
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

    const tournament = await TournamentModel.findById(tournamentId).lean().exec()
    const compileOptions = withTournamentTeamRankingPriority(
      DEFAULT_COMPILE_OPTIONS,
      asRecord((tournament as any)?.user_defined_data)
    )

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
      effectiveSourceRounds,
      compileOptions
    )
    const TeamModel = getTeamModel(connection)
    const teams = await TeamModel.find({ tournamentId }).lean().exec()
    const teamNameById = new Map<string, string>()
    const availabilityByTeamId = new Map<string, boolean>()
    teams.forEach((team: any) => {
      const teamId = String(team?._id ?? '').trim()
      if (!teamId) return
      teamNameById.set(teamId, String(team?.name ?? teamId))
      const detail = Array.isArray(team?.details)
        ? team.details.find((item: any) => Number(item?.r) === roundNumber)
        : null
      availabilityByTeamId.set(teamId, detail?.available !== false)
    })

    const baseCandidates = buildBreakCandidatesFromCompiledPayload(payload, teamNameById)
    const candidates = annotateBreakCandidatesForPreview(
      baseCandidates,
      requestedSize,
      availabilityByTeamId
    )

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
    const currentUserDefined = asRecord((roundDoc as any).userDefinedData)
    const currentRoundBreakEnabled = isRoundBreakEnabled(roundNumber, currentUserDefined)
    const breakInputRecord = asRecord(breakInput)
    const explicitBreakEnabled =
      typeof breakInputRecord.enabled === 'boolean' ? breakInputRecord.enabled : undefined
    const roundBreakEnabled =
      typeof explicitBreakEnabled === 'boolean'
        ? explicitBreakEnabled
        : currentRoundBreakEnabled
    if (!roundBreakEnabled && !currentRoundBreakEnabled) {
      badRequest(res, 'Break round is not enabled for this round')
      return
    }
    const normalizedBreak = normalizeBreakConfig(roundNumber, breakInput)

    if (roundBreakEnabled) {
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

    const currentBreak = sanitizeRoundBreakConfig(currentUserDefined.break)
    const breakSource = currentBreak.source === 'raw' ? 'raw' : 'submissions'
    const nextUserDefined = withRoundBreakEnabled(
      roundNumber,
      {
        ...currentUserDefined,
        break: {
          ...normalizedBreak,
          source: breakSource,
        },
        ...(roundBreakEnabled ? { allow_low_tie_win: false } : {}),
      },
      roundBreakEnabled
    )

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
        roundBreakEnabled && normalizedBreak.participants.length > 0
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
                details: upsertTeamRoundDetail(team.details, roundNumber, team.template, available) as any,
                template: normalizeTeamTemplate(team.template),
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
    const deletedRound = Number((deleted as any)?.round)
    if (Number.isInteger(deletedRound) && deletedRound >= 1) {
      await syncEntityRoundDetailsForDelete(tournamentId, [deletedRound])
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
