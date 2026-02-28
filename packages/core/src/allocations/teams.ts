import { teamAllocationPrecheck } from './teams/checks.js'
import { sortTeams, sortDecorator, type CompiledTeamResult } from '../general/sortings.js'
import { mGaleShapley } from './teams/matchings.js'
import { strictMatching } from './teams/strict_matchings.js'
import { getTeamDrawPowerpair } from './teams/powerpair.js'
import { decidePositions } from './sys.js'
import { accessDetail, filterAvailable } from '../general/tools.js'
import { sillyLogger } from '../general/loggers.js'
import * as filters from './teams/filters.js'
import type { AllocationConfig, Draw } from '../types/allocations.js'
import type { TeamEntity } from '../types/domain.js'
import type { TeamDrawAlgorithmOptions } from '../types/options.js'

type TeamFilterContext = {
  teams: TeamEntity[]
  r: number
  compiled_team_results: CompiledTeamResult[]
  config: AllocationConfig
}

type RankFilter = (
  team: TeamEntity,
  a: TeamEntity,
  b: TeamEntity,
  dict: TeamFilterContext
) => number

function integrateFilterFunctions(
  team: TeamEntity,
  filterFunctions: RankFilter[],
  weights: number[],
  dict: TeamFilterContext
) {
  sillyLogger(integrateFilterFunctions, arguments, 'draws')
  return (a: TeamEntity, b: TeamEntity) => {
    let aValue = 0
    let index = 0
    for (const func of filterFunctions) {
      aValue += weights[index] * func(team, a, b, dict)
      index += 1
    }
    return aValue > 0 ? 1 : aValue < 0 ? -1 : 0
  }
}

function getTeamRanksOriginal(
  r: number,
  teams: TeamEntity[],
  compiledTeamResults: CompiledTeamResult[],
  filterFunctions: RankFilter[],
  _: number[],
  config: AllocationConfig,
  allTeams: TeamEntity[]
): Record<number, number[]> {
  sillyLogger(getTeamRanksOriginal, arguments, 'draws')
  const ranks: Record<number, number[]> = {}
  for (const team of teams) {
    const others = teams.filter((other) => team.id !== other.id)
    others.sort(
      sortDecorator(team, filterFunctions, {
        teams: allTeams,
        r,
        compiled_team_results: compiledTeamResults,
        config,
      })
    )
    ranks[team.id] = others.map((other) => other.id)
  }
  return ranks
}

function getTeamRanksStraight(
  r: number,
  teams: TeamEntity[],
  compiledTeamResults: CompiledTeamResult[],
  filterFunctions: RankFilter[],
  _: number[],
  config: AllocationConfig,
  allTeams: TeamEntity[]
): Record<number, number[]> {
  sillyLogger(getTeamRanksStraight, arguments, 'draws')
  const ranks: Record<number, number[]> = {}
  const weights = Array(filterFunctions.length).fill(1)
  for (const team of teams) {
    const others = teams.filter((other) => team.id !== other.id)
    others.sort(
      integrateFilterFunctions(team, filterFunctions, weights, {
        teams: allTeams,
        r,
        compiled_team_results: compiledTeamResults,
        config,
      })
    )
    ranks[team.id] = others.map((other) => other.id)
  }
  return ranks
}

function getTeamRanksWeighted(
  r: number,
  teams: TeamEntity[],
  compiledTeamResults: CompiledTeamResult[],
  filterFunctions: RankFilter[],
  _: number[],
  config: AllocationConfig,
  allTeams: TeamEntity[]
): Record<number, number[]> {
  sillyLogger(getTeamRanksWeighted, arguments, 'draws')
  const ranks: Record<number, number[]> = {}
  const weights = Array(filterFunctions.length).map((_value, index) => 1 / (index + 1))
  for (const team of teams) {
    const others = teams.filter((other) => team.id !== other.id)
    others.sort(
      integrateFilterFunctions(team, filterFunctions, weights, {
        teams: allTeams,
        r,
        compiled_team_results: compiledTeamResults,
        config,
      })
    )
    ranks[team.id] = others.map((other) => other.id)
  }
  return ranks
}

function getTeamRanksCustom(
  r: number,
  teams: TeamEntity[],
  compiledTeamResults: CompiledTeamResult[],
  filterFunctions: RankFilter[],
  weights: number[],
  config: AllocationConfig,
  allTeams: TeamEntity[]
): Record<number, number[]> {
  sillyLogger(getTeamRanksCustom, arguments, 'draws')
  const ranks: Record<number, number[]> = {}
  for (const team of teams) {
    const others = teams.filter((other) => team.id !== other.id)
    others.sort(
      integrateFilterFunctions(team, filterFunctions, weights, {
        teams: allTeams,
        r,
        compiled_team_results: compiledTeamResults,
        config,
      })
    )
    ranks[team.id] = others.map((other) => other.id)
  }
  return ranks
}

const getTeamRanksMethods = {
  original: getTeamRanksOriginal,
  straight: getTeamRanksStraight,
  weighted: getTeamRanksWeighted,
  custom: getTeamRanksCustom,
} as const

function normalizeInstitutionCategoryMap(
  value: unknown
): Record<number, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<number, string> = {}
  Object.entries(value as Record<string, unknown>).forEach(([rawKey, rawCategory]) => {
    const key = Number(rawKey)
    if (!Number.isFinite(key)) return
    const category = String(rawCategory ?? '').trim().toLowerCase()
    out[key] = category.length > 0 ? category : 'institution'
  })
  return out
}

function teamSchoolIdsForRound(
  team: TeamEntity,
  r: number,
  institutionCategoryMap: Record<number, string>
): number[] {
  const detail = accessDetail(team, r)
  const conflicts = Array.isArray(detail.conflicts) ? (detail.conflicts as unknown[]) : []
  const hasCategoryMap = Object.keys(institutionCategoryMap).length > 0
  const schoolIds: number[] = []
  conflicts.forEach((conflictId) => {
    if (typeof conflictId !== 'number') return
    if (hasCategoryMap && institutionCategoryMap[conflictId] !== 'institution') return
    if (schoolIds.includes(conflictId)) return
    schoolIds.push(conflictId)
  })
  return schoolIds
}

type SideSpreadCost = {
  schoolImbalance: number
  teamImbalance: number
}

function sideSpreadCost(
  allocation: Draw['allocation'],
  teamIdsBySchool: Map<number, number[]>,
  resultByTeamId: Map<number, CompiledTeamResult>
): SideSpreadCost {
  const teamSide = new Map<number, 'gov' | 'opp'>()
  allocation.forEach((row) => {
    if (!Array.isArray(row.teams) || row.teams.length !== 2) return
    teamSide.set(row.teams[0], 'gov')
    teamSide.set(row.teams[1], 'opp')
  })

  let schoolImbalance = 0
  teamIdsBySchool.forEach((teamIds) => {
    let gov = 0
    let opp = 0
    teamIds.forEach((teamId) => {
      const side = teamSide.get(teamId)
      if (side === 'gov') gov += 1
      if (side === 'opp') opp += 1
    })
    schoolImbalance += Math.abs(gov - opp)
  })

  let teamImbalance = 0
  teamSide.forEach((side, teamId) => {
    const result = resultByTeamId.get(teamId)
    const pastSides = Array.isArray(result?.past_sides) ? result.past_sides : []
    let gov = 0
    let opp = 0
    pastSides.forEach((pastSide) => {
      if (pastSide === 'gov') gov += 1
      if (pastSide === 'opp') opp += 1
    })
    if (side === 'gov') gov += 1
    if (side === 'opp') opp += 1
    teamImbalance += Math.abs(gov - opp)
  })

  return { schoolImbalance, teamImbalance }
}

function isBetterSideSpreadCost(next: SideSpreadCost, current: SideSpreadCost): boolean {
  if (next.schoolImbalance < current.schoolImbalance) return true
  if (next.schoolImbalance > current.schoolImbalance) return false
  return next.teamImbalance < current.teamImbalance
}

function spreadSidesBySchool(
  allocation: Draw['allocation'],
  availableTeams: TeamEntity[],
  compiledTeamResults: CompiledTeamResult[],
  r: number,
  config: AllocationConfig
): Draw['allocation'] {
  if (config.style.team_num !== 2) return allocation
  if (allocation.length <= 1) return allocation

  const institutionCategoryMap = normalizeInstitutionCategoryMap(config.institution_category_map)
  const schoolByTeamId = new Map<number, number[]>()
  const teamIdsBySchool = new Map<number, number[]>()
  availableTeams.forEach((team) => {
    const schools = teamSchoolIdsForRound(team, r, institutionCategoryMap)
    schoolByTeamId.set(team.id, schools)
    schools.forEach((schoolId) => {
      const current = teamIdsBySchool.get(schoolId) ?? []
      current.push(team.id)
      teamIdsBySchool.set(schoolId, current)
    })
  })

  Array.from(teamIdsBySchool.entries()).forEach(([schoolId, teamIds]) => {
    if (teamIds.length < 2) teamIdsBySchool.delete(schoolId)
  })
  if (teamIdsBySchool.size === 0) return allocation

  const resultByTeamId = new Map<number, CompiledTeamResult>(
    compiledTeamResults.map((result) => [result.id, result])
  )
  const next = allocation.map((row) => ({
    ...row,
    teams: Array.isArray(row.teams) ? [...row.teams] : row.teams,
  }))
  const maxIterations = Math.max(1, next.length * 2)

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let improved = false
    for (let rowIndex = 0; rowIndex < next.length; rowIndex += 1) {
      const row = next[rowIndex]
      if (!Array.isArray(row.teams) || row.teams.length !== 2) continue

      const [leftTeamId, rightTeamId] = row.teams
      const leftSchools = schoolByTeamId.get(leftTeamId) ?? []
      const rightSchools = schoolByTeamId.get(rightTeamId) ?? []
      if (leftSchools.length === 0 && rightSchools.length === 0) continue

      const before = sideSpreadCost(next, teamIdsBySchool, resultByTeamId)
      ;[row.teams[0], row.teams[1]] = [row.teams[1], row.teams[0]]
      const after = sideSpreadCost(next, teamIdsBySchool, resultByTeamId)
      if (isBetterSideSpreadCost(after, before)) {
        improved = true
      } else {
        ;[row.teams[0], row.teams[1]] = [row.teams[1], row.teams[0]]
      }
    }
    if (!improved) break
  }
  return next
}

function getTeamAllocationFromMatching(
  matching: Record<number, number[]>,
  compiledTeamResults: CompiledTeamResult[],
  config: AllocationConfig
): Draw['allocation'] {
  sillyLogger(getTeamAllocationFromMatching, arguments, 'draws')
  let used: number[] = []
  const teamAllocation: Draw['allocation'] = []
  let id = 0
  for (const key of Object.keys(matching)) {
    const teamId = Number(key)
    if (used.includes(teamId)) continue
    const square = { id, teams: [] as number[], chairs: [], panels: [], trainees: [], venue: null }
    const teams = [...matching[teamId], teamId]
    square.teams = decidePositions(teams, compiledTeamResults, config)
    teamAllocation.push(square)
    used = used.concat(teams)
    id += 1
  }
  return teamAllocation
}

function getTeamDraw(
  r: number,
  teams: TeamEntity[],
  compiledTeamResults: CompiledTeamResult[],
  {
    filters: filtersOpt = [
      'by_strength',
      'by_side',
      'by_past_opponent',
      'by_conflict_group',
      'by_random',
    ],
    method = 'straight',
    weights = [],
    spread_sides_by_school = false,
  }: TeamDrawAlgorithmOptions = {},
  config: AllocationConfig
): Draw {
  const filterFunctions = filtersOpt.map((filterName) => filterMethods[filterName]).filter(Boolean)
  const availableTeams = filterAvailable(teams, r)
  const sortedTeams = sortTeams(availableTeams, compiledTeamResults)
  const teamIds = sortedTeams.map((team) => team.id)
  const rankMethod = getTeamRanksMethods[method as keyof typeof getTeamRanksMethods] ?? getTeamRanksStraight
  const ranks = rankMethod(
    r,
    sortedTeams,
    compiledTeamResults,
    filterFunctions,
    weights,
    config,
    teams
  )
  const teamNum = config.style.team_num
  const matching = mGaleShapley(teamIds, ranks, teamNum - 1)
  const teamAllocation = getTeamAllocationFromMatching(matching, compiledTeamResults, config)
  const finalAllocation =
    spread_sides_by_school === true
      ? spreadSidesBySchool(teamAllocation, availableTeams, compiledTeamResults, r, config)
      : teamAllocation
  return { r, allocation: finalAllocation }
}

function getTeamAllocationFromStrictMatching(matching: number[][]): Draw['allocation'] {
  sillyLogger(getTeamAllocationFromStrictMatching, arguments, 'draws')
  let id = 0
  const allocation: Draw['allocation'] = []
  for (const teams of matching) {
    allocation.push({ id, teams, chairs: [], panels: [], trainees: [], venue: null })
    id += 1
  }
  return allocation
}

function getTeamDrawStrict(
  r: number,
  teams: TeamEntity[],
  compiledTeamResults: CompiledTeamResult[],
  config: AllocationConfig,
  options: TeamDrawAlgorithmOptions = {}
): Draw {
  const matching = strictMatching(teams, compiledTeamResults, config, { ...options, round: r })
  const teamAllocation = getTeamAllocationFromStrictMatching(matching as number[][])
  return { r, allocation: teamAllocation }
}

const filterMethods: Record<string, RankFilter> = {
  by_side: filters.filterBySide,
  by_conflict_group: filters.filterByConflictGroup,
  by_past_opponent: filters.filterByPastOpponent,
  by_sibling_past_opponent_school: filters.filterBySiblingPastOpponentSchool,
  by_strength: filters.filterByStrength,
  by_random: filters.filterByRandom,
}

const standard = { get: getTeamDraw }
const strict = { get: getTeamDrawStrict }
const powerpair = { get: getTeamDrawPowerpair }
const precheck = teamAllocationPrecheck

export { standard, strict, powerpair, precheck }
export default { standard, strict, powerpair, precheck }
