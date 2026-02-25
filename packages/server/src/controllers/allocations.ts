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
import { DEFAULT_COMPILE_OPTIONS, type CompileOptions } from '../types/compiled-options.js'
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
  type BreakSeeding,
} from './shared/break-config.js'
import {
  buildBreakCandidatesFromCompiledPayload,
  pickBreakTeamIdsFromCandidates,
} from './shared/break-candidates.js'
import { badRequest, isValidObjectId, notFound } from './shared/http-errors.js'
import {
  validateAllocationOptions,
  validateEntityDetailsShape,
} from './shared/allocation-validation.js'

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

const BREAK_WINNER_COMPILE_OPTIONS: CompileOptions = {
  ...DEFAULT_COMPILE_OPTIONS,
  ranking_priority: {
    ...DEFAULT_COMPILE_OPTIONS.ranking_priority,
    order: [...DEFAULT_COMPILE_OPTIONS.ranking_priority.order],
  },
  duplicate_normalization: {
    ...DEFAULT_COMPILE_OPTIONS.duplicate_normalization,
    // Break winner resolution should be resilient when duplicate submissions exist.
    merge_policy: 'latest',
  },
  missing_data_policy: 'exclude',
  include_labels: ['teams'],
  diff_baseline: { mode: 'latest' },
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

type CanonicalBreakSeeding =
  | 'reseed_each_round'
  | 'fixed_bracket'
  | 'random_within_tie_group'
  | 'random_full'

function canonicalBreakSeeding(seeding: BreakSeeding): CanonicalBreakSeeding {
  if (seeding === 'fixed_bracket') return 'fixed_bracket'
  if (seeding === 'random_within_tie_group') return 'random_within_tie_group'
  if (seeding === 'random_full') return 'random_full'
  // Keep backward compatibility for legacy value.
  return 'reseed_each_round'
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[items[index], items[swapIndex]] = [items[swapIndex], items[index]]
  }
  return items
}

function reseedParticipantsSequentially(participants: BreakParticipant[]): BreakParticipant[] {
  return participants.map((participant, index) => ({
    teamId: participant.teamId,
    seed: index + 1,
  }))
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

function highestPowerOfTwoLessOrEqual(input: number): number {
  if (input <= 1) return 1
  let value = 1
  while (value * 2 <= input) value *= 2
  return value
}

function expectedBreakByeCount(totalParticipants: number): number {
  if (totalParticipants < 2) return totalParticipants
  const floorPow2 = highestPowerOfTwoLessOrEqual(totalParticipants)
  return totalParticipants === floorPow2 ? 0 : 2 * floorPow2 - totalParticipants
}

function normalizeDrawAllocationTeamId(teamId: unknown, teamMaps: IdMaps): string {
  if (typeof teamId === 'number' && Number.isInteger(teamId)) {
    return teamMaps.reverse.get(teamId) ?? String(teamId)
  }
  const token = String(teamId ?? '').trim()
  if (!token) return ''
  if (teamMaps.map.has(token)) return token
  const numeric = Number(token)
  if (Number.isInteger(numeric)) {
    const mapped = teamMaps.reverse.get(numeric)
    if (mapped) return mapped
  }
  return token
}

function extractBreakTeamsFromAllocationRow(square: unknown, teamMaps: IdMaps): [string, string] | null {
  if (!square || typeof square !== 'object') return null
  const source = square as Record<string, unknown>
  const teamsSource = source.teams
  const rawTeams = Array.isArray(teamsSource)
    ? teamsSource
    : teamsSource && typeof teamsSource === 'object'
      ? [(teamsSource as Record<string, unknown>).gov, (teamsSource as Record<string, unknown>).opp]
      : []
  const normalized = Array.from(
    new Set(
      rawTeams
        .map((teamId) => normalizeDrawAllocationTeamId(teamId, teamMaps))
        .filter((teamId) => teamMaps.map.has(teamId))
    )
  )
  if (normalized.length !== 2) return null
  return [normalized[0], normalized[1]]
}

function normalizeBreakMatches(value: unknown): BreakMatchMeta[] {
  if (!Array.isArray(value)) return []
  const normalized: BreakMatchMeta[] = []
  const seenIds = new Set<number>()
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
    if (!Number.isInteger(id) || id < 1 || seenIds.has(id)) continue
    if (!gov.teamId || !opp.teamId || gov.teamId === opp.teamId) continue
    if (!Number.isInteger(gov.seed) || gov.seed < 1) continue
    if (!Number.isInteger(opp.seed) || opp.seed < 1) continue
    normalized.push({ id, gov, opp })
    seenIds.add(id)
  }
  return normalized.sort((left, right) => left.id - right.id)
}

function buildBreakStageFromSavedAllocation(params: {
  allocation: unknown
  participants: BreakParticipant[]
  teamMaps: IdMaps
}): { byes: BreakParticipant[]; matches: BreakMatchMeta[] } {
  const allocationRows = Array.isArray(params.allocation) ? params.allocation : []
  const participants = [...params.participants].sort((left, right) => left.seed - right.seed)
  const seedByTeamId = new Map<string, number>()
  let nextSeed = 1
  participants.forEach((participant) => {
    seedByTeamId.set(participant.teamId, participant.seed)
    nextSeed = Math.max(nextSeed, participant.seed + 1)
  })

  const matches: BreakMatchMeta[] = []
  const matchedTeamIds = new Set<string>()
  const seenPairs = new Set<string>()
  for (const row of allocationRows) {
    const matchup = extractBreakTeamsFromAllocationRow(row, params.teamMaps)
    if (!matchup) continue
    const [govTeamId, oppTeamId] = matchup
    if (govTeamId === oppTeamId) continue
    const pairKey = [govTeamId, oppTeamId].sort().join(':')
    if (seenPairs.has(pairKey)) continue
    seenPairs.add(pairKey)
    const govSeed = seedByTeamId.get(govTeamId) ?? nextSeed++
    const oppSeed = seedByTeamId.get(oppTeamId) ?? nextSeed++
    seedByTeamId.set(govTeamId, govSeed)
    seedByTeamId.set(oppTeamId, oppSeed)
    matchedTeamIds.add(govTeamId)
    matchedTeamIds.add(oppTeamId)
    matches.push({
      id: matches.length + 1,
      gov: { teamId: govTeamId, seed: govSeed },
      opp: { teamId: oppTeamId, seed: oppSeed },
    })
  }

  const byeMap = new Map<string, BreakParticipant>()
  if (participants.length > 0) {
    const inferredByes = participants.filter((participant) => !matchedTeamIds.has(participant.teamId))
    if (inferredByes.length === expectedBreakByeCount(participants.length)) {
      inferredByes.forEach((participant) => {
        byeMap.set(participant.teamId, {
          teamId: participant.teamId,
          seed: seedByTeamId.get(participant.teamId) ?? participant.seed,
        })
      })
    }
  }

  return {
    byes: Array.from(byeMap.values()).sort((left, right) => left.seed - right.seed),
    matches,
  }
}

function buildBreakAllocationRows(matches: BreakMatchMeta[]) {
  return matches.map((match, index) => ({
    id: index,
    teams: [match.gov.teamId, match.opp.teamId],
    chairs: [],
    panels: [],
    trainees: [],
    venue: null,
  }))
}

function buildBreakStageHighLow(participants: BreakParticipant[]) {
  const sorted = [...participants].sort((left, right) => left.seed - right.seed)
  const total = sorted.length
  if (total < 2) {
    return { byes: sorted, matches: [] as BreakMatchMeta[], allocation: [] as any[] }
  }
  const byeCount = expectedBreakByeCount(total)
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
  const allocation = buildBreakAllocationRows(matches)
  return { byes, matches, allocation }
}

function buildBreakStageFromBracketOrder(orderedParticipants: BreakParticipant[]) {
  const participants = [...orderedParticipants]
  if (participants.length < 2) {
    return { byes: participants, matches: [] as BreakMatchMeta[], allocation: [] as any[] }
  }
  if (participants.length % 2 !== 0) {
    throw new Error('fixed bracket participants must be even')
  }
  const matches: BreakMatchMeta[] = []
  for (let index = 0; index < participants.length / 2; index += 1) {
    const gov = participants[index * 2]
    const opp = participants[index * 2 + 1]
    matches.push({
      id: index + 1,
      gov,
      opp,
    })
  }
  return {
    byes: [] as BreakParticipant[],
    matches,
    allocation: buildBreakAllocationRows(matches),
  }
}

function buildFixedBracketParticipantsFromPreviousStage(params: {
  previousByes: BreakParticipant[]
  previousMatches: BreakMatchMeta[]
  winnerByMatchId: Map<number, BreakParticipant>
}): BreakParticipant[] {
  const byes = [...params.previousByes].sort((left, right) => left.seed - right.seed)
  const orderedMatchWinners = [...params.previousMatches]
    .sort((left, right) => left.id - right.id)
    .map((match) => params.winnerByMatchId.get(match.id))
    .filter((winner): winner is BreakParticipant => Boolean(winner))
  if (byes.length === 0) {
    return orderedMatchWinners
  }
  const reversedWinners = [...orderedMatchWinners].reverse()
  const ordered: BreakParticipant[] = []
  const longest = Math.max(byes.length, reversedWinners.length)
  for (let index = 0; index < longest; index += 1) {
    const bye = byes[index]
    if (bye) ordered.push(bye)
    const winner = reversedWinners[index]
    if (winner) ordered.push(winner)
  }
  return ordered
}

type TeamSideCounts = {
  gov: number
  opp: number
}

function normalizeTwoTeamSide(value: unknown): 'gov' | 'opp' | null {
  const token = String(value ?? '').trim().toLowerCase()
  if (!token) return null
  if (
    token === 'gov' ||
    token === 'government' ||
    token === 'proposition' ||
    token === 'prop' ||
    token === 'opening government' ||
    token === 'closing government'
  ) {
    return 'gov'
  }
  if (
    token === 'opp' ||
    token === 'opposition' ||
    token === 'opening opposition' ||
    token === 'closing opposition'
  ) {
    return 'opp'
  }
  return null
}

function buildTeamSideCounts(compiledTeamResults: any[], round: number): Map<number, TeamSideCounts> {
  const countsByTeam = new Map<number, TeamSideCounts>()
  ;(compiledTeamResults || []).forEach((result: any) => {
    const teamId = Number(result?.id)
    if (!Number.isInteger(teamId)) return
    const counts: TeamSideCounts = { gov: 0, opp: 0 }
    const details = Array.isArray(result?.details) ? result.details : []
    details.forEach((detail: any) => {
      const detailRound = Number(detail?.r)
      if (Number.isInteger(detailRound) && detailRound >= round) return
      const side = normalizeTwoTeamSide(detail?.side)
      if (side === 'gov') counts.gov += 1
      if (side === 'opp') counts.opp += 1
    })
    countsByTeam.set(teamId, counts)
  })
  return countsByTeam
}

function sideImbalanceAfterAssignment(counts: TeamSideCounts, assignedSide: 'gov' | 'opp'): number {
  const nextGov = counts.gov + (assignedSide === 'gov' ? 1 : 0)
  const nextOpp = counts.opp + (assignedSide === 'opp' ? 1 : 0)
  return Math.abs(nextGov - nextOpp)
}

function chooseGovOppForPair(
  teamA: number,
  teamB: number,
  countsByTeam: Map<number, TeamSideCounts>
): [number, number] {
  const countsA = countsByTeam.get(teamA) ?? { gov: 0, opp: 0 }
  const countsB = countsByTeam.get(teamB) ?? { gov: 0, opp: 0 }

  const keepScore =
    sideImbalanceAfterAssignment(countsA, 'gov') + sideImbalanceAfterAssignment(countsB, 'opp')
  const swapScore =
    sideImbalanceAfterAssignment(countsB, 'gov') + sideImbalanceAfterAssignment(countsA, 'opp')
  if (keepScore < swapScore) return [teamA, teamB]
  if (swapScore < keepScore) return [teamB, teamA]

  if (countsA.gov < countsB.gov) return [teamA, teamB]
  if (countsB.gov < countsA.gov) return [teamB, teamA]
  return teamA <= teamB ? [teamA, teamB] : [teamB, teamA]
}

function rebalanceBreakRoundTeamSides<TDraw extends { r: number; allocation: any[] }>(
  draw: TDraw,
  compiledTeamResults: any[],
  round: number
): TDraw {
  const allocation = Array.isArray(draw?.allocation) ? draw.allocation : []
  if (allocation.length === 0) return draw

  const countsByTeam = buildTeamSideCounts(compiledTeamResults, round)
  const balancedAllocation = allocation.map((square: any) => {
    const teams = Array.isArray(square?.teams) ? square.teams : []
    if (teams.length !== 2) return square
    const teamA = Number(teams[0])
    const teamB = Number(teams[1])
    if (!Number.isInteger(teamA) || !Number.isInteger(teamB) || teamA === teamB) return square

    const [govTeam, oppTeam] = chooseGovOppForPair(teamA, teamB, countsByTeam)
    const govCounts = countsByTeam.get(govTeam) ?? { gov: 0, opp: 0 }
    govCounts.gov += 1
    countsByTeam.set(govTeam, govCounts)
    const oppCounts = countsByTeam.get(oppTeam) ?? { gov: 0, opp: 0 }
    oppCounts.opp += 1
    countsByTeam.set(oppTeam, oppCounts)

    if (govTeam === teamA && oppTeam === teamB) return square
    return {
      ...square,
      teams: [govTeam, oppTeam],
    }
  })

  return {
    ...draw,
    allocation: balancedAllocation,
  } as TDraw
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
  const submissionsPayload = await buildCompiledPayload(
    tournamentId,
    'submissions',
    [round],
    BREAK_WINNER_COMPILE_OPTIONS
  )
  let stats = buildRoundTeamStatsMap(submissionsPayload.payload, round)
  if (stats.size > 0) return stats
  const rawPayload = await buildCompiledPayload(
    tournamentId,
    'raw',
    [round],
    BREAK_WINNER_COMPILE_OPTIONS
  )
  stats = buildRoundTeamStatsMap(rawPayload.payload, round)
  return stats
}

async function resolveBreakMatchWinners(
  tournamentId: string,
  round: number,
  matches: BreakMatchMeta[]
): Promise<Array<{ matchId: number; winner: BreakParticipant }>> {
  const stats = await buildRoundTeamStats(tournamentId, round)
  if (stats.size === 0) {
    throw new Error(`No compiled team stats found for break winner resolution in round ${round}`)
  }
  const winners: Array<{ matchId: number; winner: BreakParticipant }> = []
  const unresolved: string[] = []

  for (const match of matches) {
    const govStats = stats.get(match.gov.teamId)
    const oppStats = stats.get(match.opp.teamId)
    if (!govStats || !oppStats) {
      unresolved.push(`#${match.id}`)
      continue
    }
    if (govStats.win > oppStats.win) {
      winners.push({ matchId: match.id, winner: match.gov })
      continue
    }
    if (oppStats.win > govStats.win) {
      winners.push({ matchId: match.id, winner: match.opp })
      continue
    }
    if (govStats.sum > oppStats.sum) {
      winners.push({ matchId: match.id, winner: match.gov })
      continue
    }
    if (oppStats.sum > govStats.sum) {
      winners.push({ matchId: match.id, winner: match.opp })
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
  return winners.sort((left, right) => left.matchId - right.matchId)
}

function validateBreakParticipants(participants: BreakParticipant[], validTeamIds: Set<string>) {
  for (const participant of participants) {
    if (!validTeamIds.has(participant.teamId)) {
      throw new Error(`Unknown team in break participants: ${participant.teamId}`)
    }
  }
}

function effectiveBreakSourceRounds(round: number, sourceRounds: number[]): number[] {
  if (sourceRounds.length > 0) return sourceRounds
  return Array.from({ length: round - 1 }, (_, index) => index + 1)
}

function buildTeamNameById(context: AllocationContext): Map<string, string> {
  const teamNameById = new Map<string, string>()
  context.teamInstances.forEach((team: any) => {
    const teamId = context.teamMaps.reverse.get(Number(team?.id))
    if (!teamId) return
    teamNameById.set(teamId, String(team?.name ?? teamId))
  })
  return teamNameById
}

async function buildBreakCandidates(params: {
  tournamentId: string
  round: number
  source: 'submissions' | 'raw'
  sourceRounds: number[]
  teamNameById: Map<string, string>
}) {
  const { payload } = await buildCompiledPayload(
    params.tournamentId,
    params.source,
    effectiveBreakSourceRounds(params.round, params.sourceRounds)
  )
  return buildBreakCandidatesFromCompiledPayload(payload, params.teamNameById)
}

async function deriveBreakParticipantsFromStandings(params: {
  tournamentId: string
  round: number
  source: 'submissions' | 'raw'
  sourceRounds: number[]
  size: number
  cutoffTiePolicy: 'manual' | 'include_all' | 'strict'
  teamNameById: Map<string, string>
}): Promise<BreakParticipant[]> {
  const candidates = await buildBreakCandidates({
    tournamentId: params.tournamentId,
    round: params.round,
    source: params.source,
    sourceRounds: params.sourceRounds,
    teamNameById: params.teamNameById,
  })
  return pickBreakTeamIdsFromCandidates(candidates, params.size, params.cutoffTiePolicy).map(
    (teamId, index) => ({
      teamId,
      seed: index + 1,
    })
  )
}

async function deriveBreakRankingMap(params: {
  tournamentId: string
  round: number
  source: 'submissions' | 'raw'
  sourceRounds: number[]
  teamNameById: Map<string, string>
}): Promise<Map<string, number | null>> {
  const candidates = await buildBreakCandidates({
    tournamentId: params.tournamentId,
    round: params.round,
    source: params.source,
    sourceRounds: params.sourceRounds,
    teamNameById: params.teamNameById,
  })
  const rankingByTeamId = new Map<string, number | null>()
  for (const candidate of candidates) {
    rankingByTeamId.set(candidate.teamId, candidate.ranking)
  }
  return rankingByTeamId
}

function applyRandomFullSeeding(participants: BreakParticipant[]): BreakParticipant[] {
  const shuffled = shuffleInPlace([...participants])
  return reseedParticipantsSequentially(shuffled)
}

function applyRandomWithinTieGroupSeeding(
  participants: BreakParticipant[],
  rankingByTeamId: Map<string, number | null>
): BreakParticipant[] {
  const sorted = [...participants]
    .map((participant) => ({
      participant,
      ranking: rankingByTeamId.has(participant.teamId)
        ? (rankingByTeamId.get(participant.teamId) ?? null)
        : null,
    }))
    .sort((left, right) => {
      const leftRank = left.ranking
      const rightRank = right.ranking
      if (leftRank !== null && rightRank !== null && leftRank !== rightRank) {
        return leftRank - rightRank
      }
      if (leftRank !== null && rightRank === null) return -1
      if (leftRank === null && rightRank !== null) return 1
      return left.participant.seed - right.participant.seed
    })

  const grouped: BreakParticipant[] = []
  let index = 0
  while (index < sorted.length) {
    const base = sorted[index]
    const group: BreakParticipant[] = [base.participant]
    index += 1
    while (
      index < sorted.length &&
      sorted[index].ranking === base.ranking
    ) {
      group.push(sorted[index].participant)
      index += 1
    }
    grouped.push(...shuffleInPlace(group))
  }

  return reseedParticipantsSequentially(grouped)
}

type BreakTeamDrawResult = {
  draw: {
    r: number
    allocation: any[]
    userDefinedData: Record<string, unknown>
  }
}

async function buildBreakTeamDraw(
  tournamentId: string,
  round: number,
  context: AllocationContext
): Promise<BreakTeamDrawResult> {
  const connection = await getTournamentConnection(tournamentId)
  const RoundModel = getRoundModel(connection)
  const DrawModel = getDrawModel(connection)
  const [roundDocs, drawDocs] = await Promise.all([
    RoundModel.find({ tournamentId }).lean().exec(),
    DrawModel.find({ tournamentId }).lean().exec(),
  ])
  const roundDoc = roundDocs.find((doc: any) => Number(doc.round) === round)
  if (!roundDoc) {
    throw toHttpError(404, 'Round not found')
  }

  const roundUserDefined = asRecord((roundDoc as any).userDefinedData)
  const roundBreakRaw = asRecord(roundUserDefined.break)
  const breakSource = roundBreakRaw.source === 'raw' ? 'raw' : 'submissions'
  const breakConfig = normalizeBreakConfig(round, roundBreakRaw, {
    dedupeParticipants: true,
  })
  const breakSeeding = canonicalBreakSeeding(breakConfig.seeding)
  if (!breakConfig.enabled) {
    throw toHttpError(400, 'Break config is not enabled for this round')
  }

  const validTeamIds = new Set<string>(Array.from(context.teamMaps.map.keys()))
  const teamNameById = buildTeamNameById(context)
  let stageParticipants = normalizeBreakParticipants(breakConfig.participants, {
    dedupeParticipants: true,
  })
  validateBreakParticipants(stageParticipants, validTeamIds)
  let fixedBracketOrderForStage: BreakParticipant[] | null = null

  let derivedFromPreviousRound = false
  let previousRound: number | null = null
  const previousRoundNumber = round - 1
  if (previousRoundNumber >= 1) {
    const previousDraw = drawDocs.find((doc: any) => Number(doc.round) === previousRoundNumber)
    const previousBreakMeta = asRecord(asRecord((previousDraw as any)?.userDefinedData).break)
    const previousStageParticipantsRaw = normalizeBreakParticipants(previousBreakMeta.stage_participants, {
      dedupeParticipants: true,
    })
    const previousStageParticipants =
      previousStageParticipantsRaw.length > 0
        ? previousStageParticipantsRaw
        : normalizeBreakParticipants(previousBreakMeta.participants, {
            dedupeParticipants: true,
          })
    const previousByesMeta = normalizeBreakParticipants(previousBreakMeta.stage_byes, {
      dedupeParticipants: true,
    })
    const previousMatchesMeta = normalizeBreakMatches(previousBreakMeta.matches)
    const previousStageFromAllocation = buildBreakStageFromSavedAllocation({
      allocation: (previousDraw as any)?.allocation,
      participants: previousStageParticipants,
      teamMaps: context.teamMaps,
    })
    const previousMatches =
      previousStageFromAllocation.matches.length > 0
        ? previousStageFromAllocation.matches
        : previousMatchesMeta
    const previousByes =
      previousStageFromAllocation.matches.length > 0 ? previousStageFromAllocation.byes : previousByesMeta
    if (previousByes.length > 0 || previousMatches.length > 0) {
      try {
        const winnerEntries = await resolveBreakMatchWinners(
          tournamentId,
          previousRoundNumber,
          previousMatches
        )
        const winners = winnerEntries.map((entry) => entry.winner)
        if (breakSeeding === 'fixed_bracket') {
          const winnerByMatchId = new Map<number, BreakParticipant>()
          winnerEntries.forEach((entry) => {
            winnerByMatchId.set(entry.matchId, entry.winner)
          })
          const fixedOrdered = buildFixedBracketParticipantsFromPreviousStage({
            previousByes,
            previousMatches,
            winnerByMatchId,
          })
          stageParticipants = fixedOrdered
          fixedBracketOrderForStage = fixedOrdered
        } else {
          stageParticipants = [...previousByes, ...winners].sort((left, right) => left.seed - right.seed)
        }
        validateBreakParticipants(stageParticipants, validTeamIds)
        derivedFromPreviousRound = true
        previousRound = previousRoundNumber
      } catch (err) {
        // Keep manual participants as a fallback only when they are explicitly configured.
        if (stageParticipants.length === 0) {
          throw err
        }
      }
    }
  }

  if (stageParticipants.length === 0) {
    if (previousRoundNumber < 1) {
      throw toHttpError(400, 'Break participants are not configured for this round')
    }
    const previousRoundDoc = roundDocs.find((doc: any) => Number(doc.round) === previousRoundNumber)
    const previousBreakEnabled = previousRoundDoc
      ? normalizeBreakConfig(
          previousRoundNumber,
          asRecord(asRecord((previousRoundDoc as any).userDefinedData).break),
          {
            dedupeParticipants: true,
          }
        ).enabled
      : false
    if (previousBreakEnabled) {
      throw toHttpError(400, 'No previous break stage metadata found. Configure participants manually.')
    }
    stageParticipants = await deriveBreakParticipantsFromStandings({
      tournamentId,
      round,
      source: breakSource,
      sourceRounds: breakConfig.source_rounds,
      size: breakConfig.size,
      cutoffTiePolicy: breakConfig.cutoff_tie_policy,
      teamNameById,
    })
    validateBreakParticipants(stageParticipants, validTeamIds)
  }

  if (breakSeeding === 'random_full') {
    stageParticipants = applyRandomFullSeeding(stageParticipants)
    fixedBracketOrderForStage = null
  } else if (breakSeeding === 'random_within_tie_group') {
    const rankingByTeamId = await deriveBreakRankingMap({
      tournamentId,
      round,
      source: breakSource,
      sourceRounds: breakConfig.source_rounds,
      teamNameById,
    })
    stageParticipants = applyRandomWithinTieGroupSeeding(stageParticipants, rankingByTeamId)
    fixedBracketOrderForStage = null
  } else if (breakSeeding === 'reseed_each_round') {
    stageParticipants = [...stageParticipants].sort((left, right) => left.seed - right.seed)
    fixedBracketOrderForStage = null
  } else if (!fixedBracketOrderForStage) {
    stageParticipants = [...stageParticipants].sort((left, right) => left.seed - right.seed)
  }

  if (stageParticipants.length < 2) {
    throw toHttpError(400, 'Not enough break participants to generate allocation')
  }

  const stage = fixedBracketOrderForStage
    ? buildBreakStageFromBracketOrder(fixedBracketOrderForStage)
    : buildBreakStageHighLow(stageParticipants)
  if (stage.matches.length === 0) {
    throw toHttpError(400, 'No break matches to allocate for this round')
  }

  const breakAllocation = (stage.allocation || []).map((square: any, index: number) => {
    const rawTeams = Array.isArray(square?.teams) ? square.teams : []
    const teams = rawTeams.map((teamId: any) => {
      const mapped = context.teamMaps.map.get(String(teamId))
      if (mapped === undefined) {
        throw new Error(`Unknown team in break participants: ${String(teamId)}`)
      }
      return mapped
    })
    return {
      id: typeof square?.id === 'number' ? square.id : index,
      teams,
      chairs: [],
      panels: [],
      trainees: [],
      venue: null,
    }
  })

  const stageParticipantsForMeta = [...stageParticipants].sort((left, right) => left.seed - right.seed)

  const userDefinedData = {
    team_allocation_algorithm: 'break',
    break: {
      enabled: breakConfig.enabled,
      source_rounds: breakConfig.source_rounds,
      size: breakConfig.size,
      cutoff_tie_policy: breakConfig.cutoff_tie_policy,
      seeding: breakConfig.seeding,
      participants: stageParticipantsForMeta,
      stage_participants: stageParticipantsForMeta,
      stage_byes: stage.byes,
      matches: stage.matches,
      derived_from_previous_round: derivedFromPreviousRound,
      previous_round: previousRound,
    },
  }

  const balancedBreakDraw = rebalanceBreakRoundTeamSides(
    {
      r: round,
      allocation: breakAllocation,
      userDefinedData,
    },
    context.compiledTeamResults,
    round
  )

  return {
    draw: balancedBreakDraw,
  }
}

async function isBreakRoundEnabled(tournamentId: string, round: number): Promise<boolean> {
  const connection = await getTournamentConnection(tournamentId)
  const roundDoc = await getRoundModel(connection).findOne({ tournamentId, round }).lean().exec()
  if (!roundDoc) return false
  return normalizeBreakConfig(round, asRecord(asRecord((roundDoc as any).userDefinedData).break), {
    dedupeParticipants: true,
  }).enabled
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

  teams.forEach((team) => {
    validateEntityDetailsShape('team', `${String((team as any)._id ?? '') || 'unknown team'}`, (team as any).details)
  })
  adjudicators.forEach((adj) => {
    validateEntityDetailsShape(
      'adjudicator',
      `${String((adj as any)._id ?? '') || 'unknown adjudicator'}`,
      (adj as any).details
    )
  })
  venues.forEach((venue) => {
    validateEntityDetailsShape(
      'venue',
      `${String((venue as any)._id ?? '') || 'unknown venue'}`,
      (venue as any).details
    )
  })

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
    const validatedOptions = validateAllocationOptions(options)
    const teamAlgorithm = validatedOptions.team_allocation_algorithm
    const teamAlgorithmOptions = validatedOptions.team_allocation_algorithm_options
    const normalizedSnapshotId = typeof snapshotId === 'string' ? snapshotId.trim() : ''
    if (teamAlgorithm !== 'break' && !normalizedSnapshotId) {
      badRequest(res, 'Snapshot id is required')
      return
    }

    const context = await buildAllocationContext(
      tournamentId,
      round,
      rounds,
      normalizedSnapshotId || undefined
    )
    if (teamAlgorithm === 'break' && context.config.style.team_num !== 2) {
      badRequest(res, 'Break allocation only supports team_num=2')
      return
    }
    let draw =
      teamAlgorithm === 'break'
        ? (await buildBreakTeamDraw(tournamentId, round, context)).draw
        : teamAlgorithm === 'strict'
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
    if (teamAlgorithm !== 'break' && (await isBreakRoundEnabled(tournamentId, round))) {
      draw = rebalanceBreakRoundTeamSides(draw, context.compiledTeamResults, round)
    }

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
    if (err?.status === 400) {
      badRequest(res, String(err?.message ?? 'Bad Request'))
      return
    }
    if (err?.status === 404) {
      notFound(res, String(err?.message ?? 'Not Found'))
      return
    }
    const message = typeof err?.message === 'string' ? err.message : ''
    if (
      message.startsWith('Unknown team in break participants') ||
      message.startsWith('No compiled team stats found for break winner resolution') ||
      message.startsWith('Unable to resolve break winners for previous round matches') ||
      message === 'break match pool must be even' ||
      message === 'fixed bracket participants must be even' ||
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

    const { draw } = await buildBreakTeamDraw(tournamentId, round, context)

    const mappedAllocation = mapAllocationOut(
      draw.allocation || [],
      context.teamMaps,
      context.adjudicatorMaps,
      context.venueMaps
    )

    res.json({
      data: {
        r: round,
        allocation: mappedAllocation,
        userDefinedData: draw.userDefinedData,
      },
      errors: [],
    })
  } catch (err: any) {
    if (err?.status === 400) {
      badRequest(res, String(err?.message ?? 'Bad Request'))
      return
    }
    if (err?.status === 404) {
      notFound(res, String(err?.message ?? 'Not Found'))
      return
    }
    const message = typeof err?.message === 'string' ? err.message : ''
    if (
      message.startsWith('Unknown team in break participants') ||
      message.startsWith('No compiled team stats found for break winner resolution') ||
      message.startsWith('Unable to resolve break winners for previous round matches') ||
      message === 'break match pool must be even' ||
      message === 'fixed bracket participants must be even'
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

    const validatedOptions = validateAllocationOptions(options)
    const numbersOfAdjudicators = validatedOptions.numbers_of_adjudicators
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

    const adjudicatorAlgorithm = validatedOptions.adjudicator_allocation_algorithm
    const adjudicatorOptions = validatedOptions.adjudicator_allocation_algorithm_options

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
    if (err?.status === 400) {
      badRequest(res, String(err?.message ?? 'Bad Request'))
      return
    }
    if (err?.status === 404) {
      notFound(res, String(err?.message ?? 'Not Found'))
      return
    }
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
    const validatedOptions = validateAllocationOptions(options)
    const venueOptions = validatedOptions.venue_allocation_algorithm_options

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
    if (err?.status === 400) {
      badRequest(res, String(err?.message ?? 'Bad Request'))
      return
    }
    if (err?.status === 404) {
      notFound(res, String(err?.message ?? 'Not Found'))
      return
    }
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
    const validatedOptions = validateAllocationOptions(options)

    const teamAlgorithm = validatedOptions.team_allocation_algorithm
    const teamAlgorithmOptions = validatedOptions.team_allocation_algorithm_options
    if (teamAlgorithm === 'break' && context.config.style.team_num !== 2) {
      badRequest(res, 'Break allocation only supports team_num=2')
      return
    }
    let draw =
      teamAlgorithm === 'break'
        ? (await buildBreakTeamDraw(tournamentId, round, context)).draw
        : teamAlgorithm === 'strict'
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
    if (teamAlgorithm !== 'break' && (await isBreakRoundEnabled(tournamentId, round))) {
      draw = rebalanceBreakRoundTeamSides(draw, context.compiledTeamResults, round)
    }

    const numbersOfAdjudicators = validatedOptions.numbers_of_adjudicators
    const adjudicatorAlgorithm = validatedOptions.adjudicator_allocation_algorithm
    const adjudicatorOptions = validatedOptions.adjudicator_allocation_algorithm_options

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

    const venueOptions = validatedOptions.venue_allocation_algorithm_options
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
    if (err?.status === 400) {
      badRequest(res, String(err?.message ?? 'Bad Request'))
      return
    }
    if (err?.status === 404) {
      notFound(res, String(err?.message ?? 'Not Found'))
      return
    }
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
    const message = typeof err?.message === 'string' ? err.message : ''
    if (
      message.startsWith('Unknown team in break participants') ||
      message.startsWith('No compiled team stats found for break winner resolution') ||
      message.startsWith('Unable to resolve break winners for previous round matches') ||
      message === 'break match pool must be even' ||
      message === 'fixed bracket participants must be even'
    ) {
      badRequest(res, message)
      return
    }
    next(err)
  }
}
