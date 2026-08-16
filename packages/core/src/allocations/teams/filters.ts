import { count, countCommon } from '../../general/math.js'
import { findOne } from '../sys.js'
import { accessDetail } from '../../general/tools.js'
import {
  buildInstitutionPriorityHistogram,
  compareInstitutionPriorityHistograms,
  normalizeInstitutionPriorityMap,
} from '../common/institution-priority.js'
import type { AllocationConfig } from '../../types/allocations.js'
import type { CompiledTeamResult } from '../../types/results.js'
import type { TeamEntity } from '../../types/domain.js'

type TeamFilterEntity = Pick<TeamEntity, 'id' | 'details'>

interface TeamFilterContext {
  compiled_team_results: CompiledTeamResult[]
  r: number
  config?: AllocationConfig
  teams?: TeamFilterEntity[]
}

function normalizeInstitutionCategory(value: unknown): string {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized.length > 0 ? normalized : 'institution'
}

function uniqueNumbers(values: unknown[]): number[] {
  const out: number[] = []
  values.forEach((value) => {
    if (typeof value !== 'number') return
    if (out.includes(value)) return
    out.push(value)
  })
  return out
}

function teamSchoolIds(
  team: TeamFilterEntity,
  r: number,
  config?: AllocationConfig
): number[] {
  const conflicts = uniqueNumbers((accessDetail(team, r).conflicts as unknown[]) ?? [])
  const categoryMap = config?.institution_category_map
  if (!categoryMap || Object.keys(categoryMap).length === 0) {
    return conflicts
  }
  return conflicts.filter(
    (institutionId) => normalizeInstitutionCategory(categoryMap[institutionId]) === 'institution'
  )
}

function countSchoolOverlap(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const bSet = new Set<number>(b)
  let overlap = 0
  a.forEach((schoolId) => {
    if (bSet.has(schoolId)) overlap += 1
  })
  return overlap
}

function schoolPastOpponentSchools(
  team: TeamFilterEntity,
  {
    teams,
    compiled_team_results,
    r,
    config,
  }: Pick<TeamFilterContext, 'teams' | 'compiled_team_results' | 'r' | 'config'>
): number[] {
  if (!Array.isArray(teams) || teams.length === 0) return []

  const selfSchools = teamSchoolIds(team, r, config)
  if (selfSchools.length === 0) return []
  const selfSchoolSet = new Set<number>(selfSchools)

  const teamById = new Map<number, TeamFilterEntity>(teams.map((entry) => [entry.id, entry]))
  const sameSchoolTeams = teams.filter((entry) => {
    const schools = teamSchoolIds(entry, r, config)
    return schools.some((schoolId) => selfSchoolSet.has(schoolId))
  })
  if (sameSchoolTeams.length === 0) return []

  const schoolSet = new Set<number>()
  sameSchoolTeams.forEach((schoolTeam) => {
    const schoolTeamResult = findOne(compiled_team_results, schoolTeam.id)
    const pastOpponents = Array.isArray(schoolTeamResult.past_opponents)
      ? schoolTeamResult.past_opponents
      : []
    pastOpponents.forEach((opponentId) => {
      const opponentTeam = teamById.get(opponentId)
      if (!opponentTeam) return
      teamSchoolIds(opponentTeam, r, config).forEach((schoolId) => schoolSet.add(schoolId))
    })
  })
  return Array.from(schoolSet)
}

export function filterByRandom(
  _team: { id: number },
  a: { id: number },
  b: { id: number },
  { r }: Pick<TeamFilterContext, 'r'>
): number {
  const value = (entity: { id: number }) => entity.id % (r + 2760)
  return value(a) > value(b) ? 1 : -1
}

export function filterBySide(
  team: TeamFilterEntity,
  a: TeamFilterEntity,
  b: TeamFilterEntity,
  { compiled_team_results, r }: TeamFilterContext
): number {
  const getResult = (id: number) => findOne(compiled_team_results, id)
  const teamAPastSides = getResult(a.id).past_sides ?? []
  const teamBPastSides = getResult(b.id).past_sides ?? []
  const teamPastSides = getResult(team.id).past_sides ?? []
  const aSide = count(teamAPastSides, 'gov') - count(teamAPastSides, 'opp')
  const bSide = count(teamBPastSides, 'gov') - count(teamBPastSides, 'opp')
  const tSide = count(teamPastSides, 'gov') - count(teamPastSides, 'opp')
  const aFit = aSide * tSide < 0
  const bFit = bSide * tSide < 0
  if (aFit && !bFit) return -1
  if (bFit && !aFit) return 1
  return 0
}

export function filterByStrength(
  team: TeamFilterEntity,
  a: TeamFilterEntity,
  b: TeamFilterEntity,
  { compiled_team_results }: Pick<TeamFilterContext, 'compiled_team_results'>
): number {
  const getResult = (id: number) => findOne(compiled_team_results, id)
  const aWin = getResult(a.id).win
  const bWin = getResult(b.id).win
  const teamWin = getResult(team.id).win
  const aWinDiff = Math.abs(teamWin - aWin)
  const bWinDiff = Math.abs(teamWin - bWin)
  if (aWinDiff > bWinDiff) return 1
  if (aWinDiff < bWinDiff) return -1
  const aSum = Number(getResult(a.id).sum ?? 0)
  const bSum = Number(getResult(b.id).sum ?? 0)
  const teamSum = Number(getResult(team.id).sum ?? 0)
  const aSumDiff = Math.abs(teamSum - aSum)
  const bSumDiff = Math.abs(teamSum - bSum)
  if (aSumDiff > bSumDiff) return 1
  if (aSumDiff < bSumDiff) return -1
  return 0
}

export function filterByConflictGroup(
  team: TeamFilterEntity,
  a: TeamFilterEntity,
  b: TeamFilterEntity,
  { r, config }: Pick<TeamFilterContext, 'r' | 'config'>
): number {
  const aConflicts = accessDetail(a, r).conflicts as number[]
  const bConflicts = accessDetail(b, r).conflicts as number[]
  const teamConflicts = accessDetail(team, r).conflicts as number[]
  const priorityMap = normalizeInstitutionPriorityMap(config?.institution_priority_map)
  if (Object.keys(priorityMap).length > 0) {
    const aHistogram = buildInstitutionPriorityHistogram(aConflicts || [], teamConflicts || [], priorityMap)
    const bHistogram = buildInstitutionPriorityHistogram(bConflicts || [], teamConflicts || [], priorityMap)
    return compareInstitutionPriorityHistograms(aHistogram, bHistogram)
  }
  const aOverlap = countCommon(aConflicts || [], teamConflicts || [])
  const bOverlap = countCommon(bConflicts || [], teamConflicts || [])
  if (aOverlap < bOverlap) return -1
  if (aOverlap > bOverlap) return 1
  return 0
}

export function filterByPastOpponent(
  team: TeamFilterEntity,
  a: TeamFilterEntity,
  b: TeamFilterEntity,
  { compiled_team_results }: Pick<TeamFilterContext, 'compiled_team_results'>
): number {
  const getResult = (id: number) => findOne(compiled_team_results, id)
  const aPast = count(getResult(a.id).past_opponents ?? [], team.id)
  const bPast = count(getResult(b.id).past_opponents ?? [], team.id)
  if (aPast > bPast) return 1
  if (aPast < bPast) return -1
  return 0
}

export function filterBySiblingPastOpponentSchool(
  team: TeamFilterEntity,
  a: TeamFilterEntity,
  b: TeamFilterEntity,
  context: TeamFilterContext
): number {
  const pastOpponentSchools = schoolPastOpponentSchools(team, context)
  if (pastOpponentSchools.length === 0) return 0
  const aSchools = teamSchoolIds(a, context.r, context.config)
  const bSchools = teamSchoolIds(b, context.r, context.config)
  const aOverlap = countSchoolOverlap(aSchools, pastOpponentSchools)
  const bOverlap = countSchoolOverlap(bSchools, pastOpponentSchools)
  if (aOverlap > bOverlap) return 1
  if (aOverlap < bOverlap) return -1
  return 0
}

export default {
  filterByRandom,
  filterBySide,
  filterByConflictGroup,
  filterByPastOpponent,
  filterBySiblingPastOpponentSchool,
  filterByStrength,
}
