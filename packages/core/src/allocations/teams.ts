import { teamAllocationPrecheck } from './teams/checks.js'
import { sortTeams, sortDecorator, type CompiledTeamResult } from '../general/sortings.js'
import { mGaleShapley } from './teams/matchings.js'
import { strictMatching } from './teams/strict_matchings.js'
import { getTeamDrawPowerpair } from './teams/powerpair.js'
import { decidePositions } from './sys.js'
import { filterAvailable } from '../general/tools.js'
import { sillyLogger } from '../general/loggers.js'
import * as filters from './teams/filters.js'
import type { AllocationConfig, Draw } from '../types/allocations.js'
import type { TeamEntity } from '../types/domain.js'
import type { TeamDrawAlgorithmOptions } from '../types/options.js'

type TeamFilterContext = {
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
  config: AllocationConfig
): Record<number, number[]> {
  sillyLogger(getTeamRanksOriginal, arguments, 'draws')
  const ranks: Record<number, number[]> = {}
  for (const team of teams) {
    const others = teams.filter((other) => team.id !== other.id)
    others.sort(
      sortDecorator(team, filterFunctions, {
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
  config: AllocationConfig
): Record<number, number[]> {
  sillyLogger(getTeamRanksStraight, arguments, 'draws')
  const ranks: Record<number, number[]> = {}
  const weights = Array(filterFunctions.length).fill(1)
  for (const team of teams) {
    const others = teams.filter((other) => team.id !== other.id)
    others.sort(
      integrateFilterFunctions(team, filterFunctions, weights, {
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
  config: AllocationConfig
): Record<number, number[]> {
  sillyLogger(getTeamRanksWeighted, arguments, 'draws')
  const ranks: Record<number, number[]> = {}
  const weights = Array(filterFunctions.length).map((_value, index) => 1 / (index + 1))
  for (const team of teams) {
    const others = teams.filter((other) => team.id !== other.id)
    others.sort(
      integrateFilterFunctions(team, filterFunctions, weights, {
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
  config: AllocationConfig
): Record<number, number[]> {
  sillyLogger(getTeamRanksCustom, arguments, 'draws')
  const ranks: Record<number, number[]> = {}
  for (const team of teams) {
    const others = teams.filter((other) => team.id !== other.id)
    others.sort(
      integrateFilterFunctions(team, filterFunctions, weights, {
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
      'by_institution',
      'by_random',
    ],
    method = 'straight',
    weights = [],
  }: TeamDrawAlgorithmOptions = {},
  config: AllocationConfig
): Draw {
  const filterFunctions = filtersOpt.map((filterName) => filterMethods[filterName]).filter(Boolean)
  const availableTeams = filterAvailable(teams, r)
  const sortedTeams = sortTeams(availableTeams, compiledTeamResults)
  const teamIds = sortedTeams.map((team) => team.id)
  const rankMethod = getTeamRanksMethods[method as keyof typeof getTeamRanksMethods] ?? getTeamRanksStraight
  const ranks = rankMethod(r, sortedTeams, compiledTeamResults, filterFunctions, weights, config)
  const teamNum = config.style.team_num
  const matching = mGaleShapley(teamIds, ranks, teamNum - 1)
  const teamAllocation = getTeamAllocationFromMatching(matching, compiledTeamResults, config)
  return { r, allocation: teamAllocation }
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
  by_institution: filters.filterByInstitution,
  by_past_opponent: filters.filterByPastOpponent,
  by_strength: filters.filterByStrength,
  by_random: filters.filterByRandom,
}

const standard = { get: getTeamDraw }
const strict = { get: getTeamDrawStrict }
const powerpair = { get: getTeamDrawPowerpair }
const precheck = teamAllocationPrecheck

export { standard, strict, powerpair, precheck }
export default { standard, strict, powerpair, precheck }
