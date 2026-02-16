import type { RequestHandler } from 'express'
import {
  teams as teamAllocations,
  adjudicators as adjudicatorAllocations,
  venues as venueAllocations,
  results as coreResults,
  filterAvailable,
} from '@utab/core'
import { TournamentModel } from '../models/tournament.js'
import { StyleModel } from '../models/style.js'
import { getTeamModel } from '../models/team.js'
import { getAdjudicatorModel } from '../models/adjudicator.js'
import { getVenueModel } from '../models/venue.js'
import { getInstitutionModel } from '../models/institution.js'
import { getSpeakerModel } from '../models/speaker.js'
import { getRoundModel } from '../models/round.js'
import { getDrawModel } from '../models/draw.js'
import { getCompiledModel } from '../models/compiled.js'
import { getRawTeamResultModel } from '../models/raw-team-result.js'
import { getRawSpeakerResultModel } from '../models/raw-speaker-result.js'
import { getRawAdjudicatorResultModel } from '../models/raw-adjudicator-result.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { buildCompiledPayload } from './compiled.js'
import {
  buildDetailsForRounds,
  buildIdMaps,
  ensureRounds,
  extractDrawUserDefinedData,
  hasSufficientAdjudicators,
  normalizeInstitutionPriority,
  normalizeScoreWeights,
  type IdMaps,
} from './shared/allocation-support.js'
import {
  normalizeBreakConfig,
  normalizeBreakParticipants,
  type BreakParticipant,
} from './shared/break-config.js'
import { badRequest, isValidObjectId, notFound } from './shared/http-errors.js'

const allocations = {
  teams: teamAllocations,
  adjudicators: adjudicatorAllocations,
  venues: venueAllocations,
}

type BreakMatchMeta = {
  id: number
  gov: BreakParticipant
  opp: BreakParticipant
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function toHttpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number }
  err.status = status
  return err
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

function mapIdList(ids: unknown, map: Map<string, number>): number[] {
  if (!Array.isArray(ids)) return []
  return ids
    .map((id) => map.get(String(id)))
    .filter((id): id is number => typeof id === 'number')
}

function mapCompiledTeamResultsFromSnapshot(
  value: unknown,
  teamMaps: IdMaps,
  teamInstances: Array<{ id: number }>
): any[] {
  const list = Array.isArray(value) ? value : []
  const mapped = list
    .map((row: any) => {
      const mappedId = teamMaps.map.get(String(row?.id))
      if (mappedId === undefined) return null
      const details = Array.isArray(row?.details)
        ? row.details.map((detail: any) => ({
            ...detail,
            opponents: mapIdList(detail?.opponents, teamMaps.map),
          }))
        : []
      return {
        ...row,
        id: mappedId,
        past_opponents: mapIdList(row?.past_opponents, teamMaps.map),
        details,
      }
    })
    .filter((row): row is Record<string, unknown> => Boolean(row))

  const byId = new Map<number, any>()
  mapped.forEach((row) => {
    byId.set(Number(row.id), row)
  })
  teamInstances.forEach((team) => {
    if (byId.has(team.id)) return
    byId.set(team.id, {
      id: team.id,
      ranking: 0,
      win: 0,
      sum: 0,
      vote: 0,
      vote_rate: 0,
      margin: 0,
      average: 0,
      sd: 0,
      past_opponents: [],
      past_sides: [],
      details: [],
    })
  })
  return Array.from(byId.values())
}

function mapCompiledAdjudicatorResultsFromSnapshot(
  value: unknown,
  adjudicatorMaps: IdMaps,
  teamMaps: IdMaps,
  adjudicatorInstances: Array<{ id: number }>
): any[] {
  const list = Array.isArray(value) ? value : []
  const mapped = list
    .map((row: any) => {
      const mappedId = adjudicatorMaps.map.get(String(row?.id))
      if (mappedId === undefined) return null
      const details = Array.isArray(row?.details)
        ? row.details.map((detail: any) => ({
            ...detail,
            judged_teams: mapIdList(detail?.judged_teams, teamMaps.map),
          }))
        : []
      return {
        ...row,
        id: mappedId,
        judged_teams: mapIdList(row?.judged_teams, teamMaps.map),
        details,
      }
    })
    .filter((row): row is Record<string, unknown> => Boolean(row))

  const byId = new Map<number, any>()
  mapped.forEach((row) => {
    byId.set(Number(row.id), row)
  })
  adjudicatorInstances.forEach((adj) => {
    if (byId.has(adj.id)) return
    byId.set(adj.id, {
      id: adj.id,
      ranking: 0,
      average: 0,
      sd: 0,
      active_num: 0,
      judged_teams: [],
      details: [],
    })
  })
  return Array.from(byId.values())
}

function normalizeBreakMatches(value: unknown): BreakMatchMeta[] {
  if (!Array.isArray(value)) return []
  const normalized: BreakMatchMeta[] = []
  for (const raw of value) {
    const id = Number((raw as any)?.id)
    const gov = {
      teamId: String((raw as any)?.gov?.teamId ?? '').trim(),
      seed: Number((raw as any)?.gov?.seed),
    }
    const opp = {
      teamId: String((raw as any)?.opp?.teamId ?? '').trim(),
      seed: Number((raw as any)?.opp?.seed),
    }
    if (!Number.isFinite(id) || !Number.isInteger(gov.seed) || !Number.isInteger(opp.seed)) continue
    if (!gov.teamId || !opp.teamId || gov.teamId === opp.teamId) continue
    normalized.push({ id, gov, opp })
  }
  return normalized.sort((left, right) => left.id - right.id)
}

function highestPowerOfTwoLessOrEqual(input: number): number {
  if (input <= 1) return 1
  let value = 1
  while (value * 2 <= input) value *= 2
  return value
}

function buildBreakStage(participants: BreakParticipant[]) {
  const sorted = [...participants].sort((left, right) => left.seed - right.seed)
  const total = sorted.length
  if (total < 2) {
    return { byes: sorted, matches: [] as BreakMatchMeta[], allocation: [] as any[] }
  }
  const floorPow2 = highestPowerOfTwoLessOrEqual(total)
  const byeCount = total === floorPow2 ? 0 : 2 * floorPow2 - total
  const byes = sorted.slice(0, byeCount)
  const matchPool = sorted.slice(byeCount)
  if (matchPool.length % 2 !== 0) {
    throw new Error('break match pool must be even')
  }

  const matches: BreakMatchMeta[] = []
  for (let index = 0; index < matchPool.length / 2; index += 1) {
    const gov = matchPool[index]
    const opp = matchPool[matchPool.length - 1 - index]
    matches.push({
      id: index + 1,
      gov,
      opp,
    })
  }

  const allocation = matches.map((match, index) => ({
    id: index,
    teams: [match.gov.teamId, match.opp.teamId],
    chairs: [],
    panels: [],
    trainees: [],
    venue: null,
  }))
  return { byes, matches, allocation }
}

function buildRoundTeamStatsMap(
  payload: { compiled_team_results?: any[] },
  round: number
): Map<string, { win: number; sum: number }> {
  const map = new Map<string, { win: number; sum: number }>()
  ;(payload.compiled_team_results ?? []).forEach((result: any) => {
    const teamId = String(result?.id ?? '').trim()
    if (!teamId) return
    const detail = Array.isArray(result?.details)
      ? result.details.find((entry: any) => Number(entry?.r) === round)
      : null
    if (!detail) return
    const win = Number(detail?.win)
    const sum = Number(detail?.sum)
    if (!Number.isFinite(win)) return
    map.set(teamId, { win, sum: Number.isFinite(sum) ? sum : 0 })
  })
  return map
}

async function buildRoundTeamStats(
  tournamentId: string,
  round: number
): Promise<Map<string, { win: number; sum: number }>> {
  const submissionsPayload = await buildCompiledPayload(tournamentId, 'submissions', [round])
  let stats = buildRoundTeamStatsMap(submissionsPayload.payload, round)
  if (stats.size > 0) return stats
  const rawPayload = await buildCompiledPayload(tournamentId, 'raw', [round])
  stats = buildRoundTeamStatsMap(rawPayload.payload, round)
  return stats
}

async function resolveBreakMatchWinners(
  tournamentId: string,
  round: number,
  matches: BreakMatchMeta[]
): Promise<BreakParticipant[]> {
  const stats = await buildRoundTeamStats(tournamentId, round)
  if (stats.size === 0) {
    throw new Error(`No compiled team stats found for break winner resolution in round ${round}`)
  }
  const winners: BreakParticipant[] = []
  const unresolved: string[] = []

  for (const match of matches) {
    const govStats = stats.get(match.gov.teamId)
    const oppStats = stats.get(match.opp.teamId)
    if (!govStats || !oppStats) {
      unresolved.push(`#${match.id}`)
      continue
    }
    if (govStats.win > oppStats.win) {
      winners.push(match.gov)
      continue
    }
    if (oppStats.win > govStats.win) {
      winners.push(match.opp)
      continue
    }
    if (govStats.sum > oppStats.sum) {
      winners.push(match.gov)
      continue
    }
    if (oppStats.sum > govStats.sum) {
      winners.push(match.opp)
      continue
    }
    unresolved.push(`#${match.id}`)
  }

  if (unresolved.length > 0) {
    throw new Error(
      `Unable to resolve break winners for previous round matches (${unresolved.join(
        ', '
      )}). Please set participants manually.`
    )
  }
  return winners.sort((left, right) => left.seed - right.seed)
}

function validateBreakParticipants(participants: BreakParticipant[], validTeamIds: Set<string>) {
  for (const participant of participants) {
    if (!validTeamIds.has(participant.teamId)) {
      throw new Error(`Unknown team in break participants: ${participant.teamId}`)
    }
  }
}

type AllocationContext = {
  teamMaps: IdMaps
  adjudicatorMaps: IdMaps
  venueMaps: IdMaps
  institutionMaps: IdMaps
  speakerMaps: IdMaps
  teamInstances: any[]
  adjudicatorInstances: any[]
  venueInstances: any[]
  compiledTeamResults: any[]
  compiledAdjudicatorResults: any[]
  config: {
    name: string
    style: { team_num: number; score_weights: number[] }
    preev_weights: number[]
    institution_priority_map: Record<number, number>
  }
}

async function buildAllocationContext(
  tournamentId: string,
  round: number,
  roundsOverride?: number[],
  snapshotId?: string
): Promise<AllocationContext> {
  const connection = await getTournamentConnection(tournamentId)
  const includeRawResults = !snapshotId
  const CompiledModel = getCompiledModel(connection)
  const compiledSnapshotPromise = snapshotId
    ? (async () => {
        if (!isValidObjectId(snapshotId)) {
          throw toHttpError(400, 'Invalid snapshot id')
        }
        const compiledSnapshot = await CompiledModel.findOne({
          _id: snapshotId,
          tournamentId,
        })
          .lean()
          .exec()
        if (!compiledSnapshot) {
          throw toHttpError(404, 'Compiled snapshot not found for tournament')
        }
        return compiledSnapshot
      })()
    : Promise.resolve(null)
  const [
    tournament,
    teams,
    adjudicators,
    venues,
    institutions,
    speakers,
    rawTeamResults,
    rawSpeakerResults,
    rawAdjudicatorResults,
    compiledSnapshot,
  ] = await Promise.all([
    TournamentModel.findById(tournamentId).lean().exec(),
    getTeamModel(connection).find({ tournamentId }).lean().exec(),
    getAdjudicatorModel(connection).find({ tournamentId }).lean().exec(),
    getVenueModel(connection).find({ tournamentId }).lean().exec(),
    getInstitutionModel(connection).find({ tournamentId }).lean().exec(),
    getSpeakerModel(connection).find({ tournamentId }).lean().exec(),
    includeRawResults
      ? getRawTeamResultModel(connection).find({ tournamentId }).lean().exec()
      : Promise.resolve([]),
    includeRawResults
      ? getRawSpeakerResultModel(connection).find({ tournamentId }).lean().exec()
      : Promise.resolve([]),
    includeRawResults
      ? getRawAdjudicatorResultModel(connection).find({ tournamentId }).lean().exec()
      : Promise.resolve([]),
    compiledSnapshotPromise,
  ])

  if (!tournament) {
    throw new Error('Tournament not found')
  }

  const styleOption = (tournament.options as any)?.style
  const styleDoc =
    typeof tournament.style === 'number'
      ? await StyleModel.findOne({ id: tournament.style }).lean().exec()
      : null
  const scoreWeights = normalizeScoreWeights(styleOption?.score_weights ?? styleDoc?.score_weights)
  const teamNum = styleOption?.team_num ?? styleDoc?.team_num ?? 2
  const style = { team_num: teamNum, score_weights: scoreWeights }
  const config = {
    name: tournament.name,
    style,
    preev_weights:
      (tournament as any).preev_weights ?? (tournament.options as any)?.preev_weights ?? [0, 0, 0, 0, 0, 0],
    institution_priority_map: {} as Record<number, number>,
  }

  const teamMaps = buildIdMaps(teams)
  const adjudicatorMaps = buildIdMaps(adjudicators)
  const venueMaps = buildIdMaps(venues)
  const institutionMaps = buildIdMaps(institutions)
  config.institution_priority_map = Object.fromEntries(
    institutions.map((inst) => [
      institutionMaps.map.get(String(inst._id))!,
      normalizeInstitutionPriority((inst as any).priority),
    ])
  )
  const speakerMaps = buildIdMaps(speakers)

  const roundsForCompile =
    Array.isArray(roundsOverride) && roundsOverride.length > 0
      ? Array.from(new Set(roundsOverride)).sort((a, b) => a - b)
      : ensureRounds(round)
  const roundsNeeded = Array.from(new Set([...roundsForCompile, round])).sort((a, b) => a - b)

  const teamInstances = teams.map((team) => ({
    id: teamMaps.map.get(String(team._id))!,
    name: team.name,
    details: buildDetailsForRounds(
      (team as any).details,
      roundsNeeded,
      { available: true, institutions: [], speakers: [] },
      (id) => institutionMaps.map.get(id),
      (id) => speakerMaps.map.get(id)
    ),
  }))

  const adjudicatorInstances = adjudicators.map((adj) => ({
    id: adjudicatorMaps.map.get(String(adj._id))!,
    name: adj.name,
    preev: (adj as any).preev ?? (adj as any).strength ?? 0,
    details: buildDetailsForRounds(
      (adj as any).details,
      roundsNeeded,
      { available: true, institutions: [], conflicts: [] },
      (id) => institutionMaps.map.get(id),
      undefined,
      (id) => teamMaps.map.get(id)
    ),
  }))

  const venueInstances = venues.map((venue) => ({
    id: venueMaps.map.get(String(venue._id))!,
    name: venue.name,
    details: buildDetailsForRounds((venue as any).details, roundsNeeded, { available: true, priority: 1 }),
  }))

  const speakerInstances = speakers.map((speaker) => ({
    id: speakerMaps.map.get(String(speaker._id))!,
    name: speaker.name,
  }))

  const mapFromId = (id: string) =>
    adjudicatorMaps.map.get(id) ?? speakerMaps.map.get(id) ?? teamMaps.map.get(id) ?? 0

  const mappedRawTeamResults = rawTeamResults
    .map((r: any) => ({
      ...r,
      id: teamMaps.map.get(String(r.id)),
      from_id: mapFromId(String(r.from_id)),
      opponents: (r.opponents || [])
        .map((oid: string) => teamMaps.map.get(String(oid)))
        .filter((v: number | undefined): v is number => v !== undefined),
    }))
    .filter((r: any) => r.id !== undefined)

  const mappedRawSpeakerResults = rawSpeakerResults
    .map((r: any) => ({
      ...r,
      id: speakerMaps.map.get(String(r.id)),
      from_id: mapFromId(String(r.from_id)),
    }))
    .filter((r: any) => r.id !== undefined)

  const mappedRawAdjudicatorResults = rawAdjudicatorResults
    .map((r: any) => ({
      ...r,
      id: adjudicatorMaps.map.get(String(r.id)),
      from_id: mapFromId(String(r.from_id)),
      judged_teams: (r.judged_teams || [])
        .map((oid: string) => teamMaps.map.get(String(oid)))
        .filter((v: number | undefined): v is number => v !== undefined),
    }))
    .filter((r: any) => r.id !== undefined)

  let compiledTeamResults =
    mappedRawSpeakerResults.length > 0 && speakerInstances.length > 0
      ? coreResults.compileTeamResults(
          teamInstances,
          speakerInstances,
          mappedRawTeamResults,
          mappedRawSpeakerResults,
          roundsForCompile,
          style
        )
      : coreResults.compileTeamResults(teamInstances, mappedRawTeamResults, roundsForCompile, style)

  let compiledAdjudicatorResults = coreResults.compileAdjudicatorResults(
    adjudicatorInstances,
    mappedRawAdjudicatorResults,
    roundsForCompile
  )

  if (compiledSnapshot) {
    const compiledPayload = asRecord((compiledSnapshot as any).payload)
    compiledTeamResults = mapCompiledTeamResultsFromSnapshot(
      compiledPayload.compiled_team_results,
      teamMaps,
      teamInstances
    )
    compiledAdjudicatorResults = mapCompiledAdjudicatorResultsFromSnapshot(
      compiledPayload.compiled_adjudicator_results,
      adjudicatorMaps,
      teamMaps,
      adjudicatorInstances
    )
  }

  return {
    teamMaps,
    adjudicatorMaps,
    venueMaps,
    institutionMaps,
    speakerMaps,
    teamInstances,
    adjudicatorInstances,
    venueInstances,
    compiledTeamResults,
    compiledAdjudicatorResults,
    config,
  }
}

function mapAllocationOut(
  allocation: any[],
  teamMaps: IdMaps,
  adjudicatorMaps: IdMaps,
  venueMaps: IdMaps
) {
  return (allocation || []).map((square: any) => {
    const teams = Array.isArray(square.teams)
      ? square.teams.map((id: number) => teamMaps.reverse.get(id) ?? String(id))
      : square.teams
    const mappedTeams =
      Array.isArray(teams) && teams.length === 2 ? { gov: teams[0], opp: teams[1] } : teams

    return {
      ...square,
      teams: mappedTeams,
      chairs: (square.chairs || []).map((id: number) => adjudicatorMaps.reverse.get(id) ?? String(id)),
      panels: (square.panels || []).map((id: number) => adjudicatorMaps.reverse.get(id) ?? String(id)),
      trainees: (square.trainees || []).map((id: number) => adjudicatorMaps.reverse.get(id) ?? String(id)),
      venue: square.venue ? venueMaps.reverse.get(square.venue) ?? String(square.venue) : null,
    }
  })
}

function normalizeIncomingAllocation(allocation: any[], teamMaps: IdMaps) {
  return allocation.map((square: any, index: number) => {
    const rawTeams = Array.isArray(square.teams)
      ? square.teams
      : square.teams && typeof square.teams === 'object'
        ? [square.teams.gov, square.teams.opp]
        : []
    const mappedTeams = rawTeams
      .map((id: any) => teamMaps.map.get(String(id)))
      .filter((v: number | undefined): v is number => v !== undefined)
    return {
      id: typeof square.id === 'number' ? square.id : index,
      teams: mappedTeams,
      chairs: [],
      panels: [],
      trainees: [],
      venue: square.venue ?? null,
    }
  })
}

function normalizeAllocationWithAdjudicators(
  allocation: any[],
  teamMaps: IdMaps,
  adjudicatorMaps: IdMaps
) {
  return allocation.map((square: any, index: number) => {
    const rawTeams = Array.isArray(square.teams)
      ? square.teams
      : square.teams && typeof square.teams === 'object'
        ? [square.teams.gov, square.teams.opp]
        : []
    const mappedTeams = rawTeams
      .map((id: any) => teamMaps.map.get(String(id)))
      .filter((v: number | undefined): v is number => v !== undefined)
    const mapAdj = (ids: any[]) =>
      (ids || [])
        .map((id) => {
          if (typeof id === 'number') return id
          return adjudicatorMaps.map.get(String(id)) ?? id
        })
        .filter((v) => v !== undefined)
    return {
      id: typeof square.id === 'number' ? square.id : index,
      teams: mappedTeams,
      chairs: mapAdj(square.chairs),
      panels: mapAdj(square.panels),
      trainees: mapAdj(square.trainees),
      venue: square.venue ?? null,
    }
  })
}

export const createTeamAllocation: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, options, rounds, snapshotId } = req.body as {
      tournamentId: string
      round: number
      options?: Record<string, any>
      rounds?: number[]
      snapshotId?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return

    const context = await buildAllocationContext(tournamentId, round, rounds, snapshotId)

    const teamAlgorithm = options?.team_allocation_algorithm ?? 'standard'
    const teamAlgorithmOptions = options?.team_allocation_algorithm_options ?? {}
    let draw =
      teamAlgorithm === 'strict'
        ? allocations.teams.strict.get(
            round,
            context.teamInstances,
            context.compiledTeamResults,
            context.config,
            teamAlgorithmOptions
          )
        : teamAlgorithm === 'powerpair'
          ? allocations.teams.powerpair.get(
              round,
              context.teamInstances,
              context.compiledTeamResults,
              teamAlgorithmOptions,
              context.config
            )
          : allocations.teams.standard.get(
              round,
              context.teamInstances,
              context.compiledTeamResults,
              teamAlgorithmOptions,
              context.config
            )

    const mappedAllocation = mapAllocationOut(
      draw.allocation || [],
      context.teamMaps,
      context.adjudicatorMaps,
      context.venueMaps
    )
    const userDefinedData = extractDrawUserDefinedData(draw)
    res.json({
      data: { r: round, allocation: mappedAllocation, ...(userDefinedData ? { userDefinedData } : {}) },
      errors: [],
    })
  } catch (err: any) {
    const message = typeof err?.message === 'string' ? err.message : ''
    if (
      message.startsWith('Unknown team in break participants') ||
      message.startsWith('No compiled team stats found for break winner resolution') ||
      message.startsWith('Unable to resolve break winners for previous round matches') ||
      message === 'break match pool must be even' ||
      message === 'Invalid snapshot id'
    ) {
      badRequest(res, message)
      return
    }
    if (message === 'Compiled snapshot not found for tournament') {
      notFound(res, message)
      return
    }
    if (err?.message === 'Tournament not found') {
      notFound(res, 'Tournament not found')
      return
    }
    next(err)
  }
}

export const createBreakAllocation: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round } = req.body as {
      tournamentId: string
      round: number
    }
    if (!ensureTournamentId(res, tournamentId)) return

    const context = await buildAllocationContext(tournamentId, round)
    if (context.config.style.team_num !== 2) {
      badRequest(res, 'Break allocation only supports team_num=2')
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const DrawModel = getDrawModel(connection)
    const [roundDocs, drawDocs] = await Promise.all([
      RoundModel.find({ tournamentId }).lean().exec(),
      DrawModel.find({ tournamentId }).lean().exec(),
    ])
    const roundDoc = roundDocs.find((doc: any) => Number(doc.round) === round)
    if (!roundDoc) {
      notFound(res, 'Round not found')
      return
    }

    const breakConfig = normalizeBreakConfig(round, asRecord((roundDoc as any).userDefinedData).break, {
      dedupeParticipants: true,
    })
    if (!breakConfig.enabled) {
      badRequest(res, 'Break config is not enabled for this round')
      return
    }

    const validTeamIds = new Set<string>(Array.from(context.teamMaps.map.keys()))
    let stageParticipants = normalizeBreakParticipants(breakConfig.participants, {
      dedupeParticipants: true,
    })
    validateBreakParticipants(stageParticipants, validTeamIds)

    let derivedFromPreviousRound = false
    let previousRound: number | null = null
    if (stageParticipants.length === 0) {
      const previousRoundNumber = round - 1
      if (previousRoundNumber < 1) {
        badRequest(res, 'Break participants are not configured for this round')
        return
      }
      const previousDraw = drawDocs.find((doc: any) => Number(doc.round) === previousRoundNumber)
      const previousBreakMeta = asRecord(asRecord((previousDraw as any)?.userDefinedData).break)
      const previousByes = normalizeBreakParticipants(previousBreakMeta.stage_byes, {
        dedupeParticipants: true,
      })
      const previousMatches = normalizeBreakMatches(previousBreakMeta.matches)
      if (previousByes.length === 0 && previousMatches.length === 0) {
        badRequest(res, 'No previous break stage metadata found. Configure participants manually.')
        return
      }
      const winners = await resolveBreakMatchWinners(tournamentId, previousRoundNumber, previousMatches)
      stageParticipants = [...previousByes, ...winners].sort((left, right) => left.seed - right.seed)
      validateBreakParticipants(stageParticipants, validTeamIds)
      derivedFromPreviousRound = true
      previousRound = previousRoundNumber
    }

    if (stageParticipants.length < 2) {
      badRequest(res, 'Not enough break participants to generate allocation')
      return
    }

    const stage = buildBreakStage(stageParticipants)
    if (stage.matches.length === 0) {
      badRequest(res, 'No break matches to allocate for this round')
      return
    }

    const mappedAllocation = mapAllocationOut(
      stage.allocation || [],
      context.teamMaps,
      context.adjudicatorMaps,
      context.venueMaps
    )
    const userDefinedData = {
      team_allocation_algorithm: 'break',
      break: {
        enabled: breakConfig.enabled,
        source_rounds: breakConfig.source_rounds,
        size: breakConfig.size,
        cutoff_tie_policy: breakConfig.cutoff_tie_policy,
        seeding: breakConfig.seeding,
        participants: stageParticipants,
        stage_participants: stageParticipants,
        stage_byes: stage.byes,
        matches: stage.matches,
        derived_from_previous_round: derivedFromPreviousRound,
        previous_round: previousRound,
      },
    }

    res.json({
      data: {
        r: round,
        allocation: mappedAllocation,
        userDefinedData,
      },
      errors: [],
    })
  } catch (err: any) {
    const message = typeof err?.message === 'string' ? err.message : ''
    if (
      message.startsWith('Unknown team in break participants') ||
      message.startsWith('No compiled team stats found for break winner resolution') ||
      message.startsWith('Unable to resolve break winners for previous round matches') ||
      message === 'break match pool must be even'
    ) {
      badRequest(res, message)
      return
    }
    if (err?.message === 'Tournament not found') {
      notFound(res, 'Tournament not found')
      return
    }
    next(err)
  }
}

export const createAdjudicatorAllocation: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, allocation, options, rounds, snapshotId } = req.body as {
      tournamentId: string
      round: number
      allocation: any[]
      options?: Record<string, any>
      rounds?: number[]
      snapshotId?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!Array.isArray(allocation)) {
      badRequest(res, 'Allocation is required')
      return
    }

    const context = await buildAllocationContext(tournamentId, round, rounds, snapshotId)
    const normalized = normalizeIncomingAllocation(allocation, context.teamMaps)

    const baseDraw = { r: round, allocation: normalized }
    if (context.adjudicatorInstances.length === 0) {
      const mappedAllocation = mapAllocationOut(
        baseDraw.allocation || [],
        context.teamMaps,
        context.adjudicatorMaps,
        context.venueMaps
      )
      res.json({ data: { r: round, allocation: mappedAllocation }, errors: [] })
      return
    }

    const numbersOfAdjudicators = options?.numbers_of_adjudicators ?? { chairs: 1, panels: 2, trainees: 0 }
    const allocationSquares = baseDraw.allocation?.length ?? 0
    const availableAdjudicators = filterAvailable(context.adjudicatorInstances, round)
    if (!hasSufficientAdjudicators(availableAdjudicators.length, allocationSquares, numbersOfAdjudicators)) {
      const mappedAllocation = mapAllocationOut(
        baseDraw.allocation || [],
        context.teamMaps,
        context.adjudicatorMaps,
        context.venueMaps
      )
      res.json({ data: { r: round, allocation: mappedAllocation }, errors: [] })
      return
    }

    const adjudicatorAlgorithm = options?.adjudicator_allocation_algorithm ?? 'standard'
    const adjudicatorOptions = options?.adjudicator_allocation_algorithm_options ?? {}

    const adjudicatorDraw =
      adjudicatorAlgorithm === 'traditional'
        ? allocations.adjudicators.traditional.get(
            round,
            baseDraw,
            context.adjudicatorInstances,
            context.teamInstances,
            context.compiledTeamResults,
            context.compiledAdjudicatorResults,
            numbersOfAdjudicators,
            context.config,
            adjudicatorOptions
          )
        : allocations.adjudicators.standard.get(
            round,
            baseDraw,
            context.adjudicatorInstances,
            context.teamInstances,
            context.compiledTeamResults,
            context.compiledAdjudicatorResults,
            numbersOfAdjudicators,
            context.config,
            adjudicatorOptions
          )

    const mappedAllocation = mapAllocationOut(
      adjudicatorDraw.allocation || [],
      context.teamMaps,
      context.adjudicatorMaps,
      context.venueMaps
    )

    res.json({ data: { r: round, allocation: mappedAllocation }, errors: [] })
  } catch (err: any) {
    if (err?.message === 'Invalid snapshot id') {
      badRequest(res, 'Invalid snapshot id')
      return
    }
    if (err?.message === 'Compiled snapshot not found for tournament') {
      notFound(res, 'Compiled snapshot not found for tournament')
      return
    }
    if (err?.message === 'Tournament not found') {
      notFound(res, 'Tournament not found')
      return
    }
    next(err)
  }
}

export const createVenueAllocation: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, allocation, options, rounds, snapshotId } = req.body as {
      tournamentId: string
      round: number
      allocation: any[]
      options?: Record<string, any>
      rounds?: number[]
      snapshotId?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!Array.isArray(allocation)) {
      badRequest(res, 'Allocation is required')
      return
    }

    const context = await buildAllocationContext(tournamentId, round, rounds, snapshotId)
    const normalized = normalizeAllocationWithAdjudicators(allocation, context.teamMaps, context.adjudicatorMaps)
    const venueOptions = options?.venue_allocation_algorithm_options ?? {}

    const baseDraw = { r: round, allocation: normalized }
    if (context.venueInstances.length === 0) {
      const mappedAllocation = mapAllocationOut(
        baseDraw.allocation || [],
        context.teamMaps,
        context.adjudicatorMaps,
        context.venueMaps
      )
      res.json({ data: { r: round, allocation: mappedAllocation }, errors: [] })
      return
    }

    const venueDraw = allocations.venues.standard.get(
      round,
      baseDraw,
      context.venueInstances,
      context.compiledTeamResults,
      context.config,
      venueOptions.shuffle
    )

    const mappedAllocation = mapAllocationOut(
      venueDraw.allocation || [],
      context.teamMaps,
      context.adjudicatorMaps,
      context.venueMaps
    )
    res.json({ data: { r: round, allocation: mappedAllocation }, errors: [] })
  } catch (err: any) {
    if (err?.message === 'Invalid snapshot id') {
      badRequest(res, 'Invalid snapshot id')
      return
    }
    if (err?.message === 'Compiled snapshot not found for tournament') {
      notFound(res, 'Compiled snapshot not found for tournament')
      return
    }
    if (err?.message === 'Tournament not found') {
      notFound(res, 'Tournament not found')
      return
    }
    next(err)
  }
}

export const createAllocation: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, options, rounds, snapshotId } = req.body as {
      tournamentId: string
      round: number
      options?: Record<string, any>
      rounds?: number[]
      snapshotId?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return

    const context = await buildAllocationContext(tournamentId, round, rounds, snapshotId)

    const teamAlgorithm = options?.team_allocation_algorithm ?? 'standard'
    const teamAlgorithmOptions = options?.team_allocation_algorithm_options ?? {}
    let draw =
      teamAlgorithm === 'strict'
        ? allocations.teams.strict.get(
            round,
            context.teamInstances,
            context.compiledTeamResults,
            context.config,
            teamAlgorithmOptions
          )
        : teamAlgorithm === 'powerpair'
          ? allocations.teams.powerpair.get(
              round,
              context.teamInstances,
              context.compiledTeamResults,
              teamAlgorithmOptions,
              context.config
            )
          : allocations.teams.standard.get(
              round,
              context.teamInstances,
              context.compiledTeamResults,
              teamAlgorithmOptions,
              context.config
            )

    const numbersOfAdjudicators = options?.numbers_of_adjudicators ?? { chairs: 1, panels: 2, trainees: 0 }
    const adjudicatorAlgorithm = options?.adjudicator_allocation_algorithm ?? 'standard'
    const adjudicatorOptions = options?.adjudicator_allocation_algorithm_options ?? {}

    let adjudicatorDraw = draw
    const allocationSquares = draw.allocation?.length ?? 0
    const availableAdjudicators = filterAvailable(context.adjudicatorInstances, round)
    if (
      context.adjudicatorInstances.length > 0 &&
      hasSufficientAdjudicators(availableAdjudicators.length, allocationSquares, numbersOfAdjudicators)
    ) {
      adjudicatorDraw =
        adjudicatorAlgorithm === 'traditional'
          ? allocations.adjudicators.traditional.get(
              round,
              draw,
              context.adjudicatorInstances,
              context.teamInstances,
              context.compiledTeamResults,
              context.compiledAdjudicatorResults,
              numbersOfAdjudicators,
              context.config,
              adjudicatorOptions
            )
          : allocations.adjudicators.standard.get(
              round,
              draw,
              context.adjudicatorInstances,
              context.teamInstances,
              context.compiledTeamResults,
              context.compiledAdjudicatorResults,
              numbersOfAdjudicators,
              context.config,
              adjudicatorOptions
            )
    }

    const venueOptions = options?.venue_allocation_algorithm_options ?? {}
    let venueDraw = adjudicatorDraw
    if (context.venueInstances.length > 0) {
      venueDraw = allocations.venues.standard.get(
        round,
        adjudicatorDraw,
        context.venueInstances,
        context.compiledTeamResults,
        context.config,
        venueOptions.shuffle
      )
    }

    const mappedAllocation = mapAllocationOut(
      venueDraw.allocation || [],
      context.teamMaps,
      context.adjudicatorMaps,
      context.venueMaps
    )
    const userDefinedData = extractDrawUserDefinedData(draw)
    res.json({
      data: { r: round, allocation: mappedAllocation, ...(userDefinedData ? { userDefinedData } : {}) },
      errors: [],
    })
  } catch (err: any) {
    if (err?.message === 'Invalid snapshot id') {
      badRequest(res, 'Invalid snapshot id')
      return
    }
    if (err?.message === 'Compiled snapshot not found for tournament') {
      notFound(res, 'Compiled snapshot not found for tournament')
      return
    }
    if (err?.message === 'Tournament not found') {
      notFound(res, 'Tournament not found')
      return
    }
    next(err)
  }
}
