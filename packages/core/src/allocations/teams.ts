import { teamAllocationPrecheck } from './teams/checks.js'
import { sortTeams, sortDecorator } from '../general/sortings.js'
import { mGaleShapley } from './teams/matchings.js'
import { strictMatching } from './teams/strict_matchings.js'
import { decidePositions } from './sys.js'
import { filterAvailable } from '../general/tools.js'
import { sillyLogger } from '../general/loggers.js'
import * as filters from './teams/filters.js'

type RankFilter = (team: any, a: any, b: any, dict: any) => number

function integrateFilterFunctions(
  team: any,
  filterFunctions: RankFilter[],
  weights: number[],
  dict: any
) {
  sillyLogger(integrateFilterFunctions, arguments, 'draws')
  return (a: any, b: any) => {
    let aVal = 0
    let c = 0
    for (const func of filterFunctions) {
      aVal += weights[c] * func(team, a, b, dict)
      c += 1
    }
    return aVal > 0 ? 1 : aVal < 0 ? -1 : 0
  }
}

function getTeamRanksOriginal(
  r: number,
  teams: any[],
  compiledTeamResults: any[],
  filterFunctions: RankFilter[],
  __: any
) {
  sillyLogger(getTeamRanksOriginal, arguments, 'draws')
  const ranks: Record<number, number[]> = {}
  for (const team of teams) {
    const others = teams.filter((other) => team.id !== other.id)
    others.sort(
      sortDecorator(team, filterFunctions, { r, compiled_team_results: compiledTeamResults })
    )
    ranks[team.id] = others.map((o) => o.id)
  }
  return ranks
}

function getTeamRanksStraight(
  r: number,
  teams: any[],
  compiledTeamResults: any[],
  filterFunctions: RankFilter[],
  __: any
) {
  sillyLogger(getTeamRanksStraight, arguments, 'draws')
  const ranks: Record<number, number[]> = {}
  const weights = Array(filterFunctions.length).fill(1)
  for (const team of teams) {
    const others = teams.filter((other) => team.id !== other.id)
    others.sort(
      integrateFilterFunctions(team, filterFunctions, weights, {
        r,
        compiled_team_results: compiledTeamResults,
      })
    )
    ranks[team.id] = others.map((o) => o.id)
  }
  return ranks
}

function getTeamRanksWeighted(
  r: number,
  teams: any[],
  compiledTeamResults: any[],
  filterFunctions: RankFilter[],
  __: any
) {
  sillyLogger(getTeamRanksWeighted, arguments, 'draws')
  const ranks: Record<number, number[]> = {}
  const weights = Array(filterFunctions.length).map((_x, i) => 1 / (i + 1))
  for (const team of teams) {
    const others = teams.filter((other) => team.id !== other.id)
    others.sort(
      integrateFilterFunctions(team, filterFunctions, weights, {
        r,
        compiled_team_results: compiledTeamResults,
      })
    )
    ranks[team.id] = others.map((o) => o.id)
  }
  return ranks
}

function getTeamRanksCustom(
  r: number,
  teams: any[],
  compiledTeamResults: any[],
  filterFunctions: RankFilter[],
  weights: number[]
) {
  sillyLogger(getTeamRanksCustom, arguments, 'draws')
  const ranks: Record<number, number[]> = {}
  for (const team of teams) {
    const others = teams.filter((other) => team.id !== other.id)
    others.sort(
      integrateFilterFunctions(team, filterFunctions, weights, {
        r,
        compiled_team_results: compiledTeamResults,
      })
    )
    ranks[team.id] = others.map((o) => o.id)
  }
  return ranks
}

const getTeamRanksMethods: Record<string, Function> = {
  original: getTeamRanksOriginal,
  straight: getTeamRanksStraight,
  weighted: getTeamRanksWeighted,
  custom: getTeamRanksCustom,
}

function getTeamAllocationFromMatching(
  matching: Record<number, number[]>,
  compiledTeamResults: any[],
  config: any
) {
  sillyLogger(getTeamAllocationFromMatching, arguments, 'draws')
  let used: number[] = []
  const teamAllocation: any[] = []
  let id = 0
  for (const key in matching) {
    if (used.indexOf(parseInt(key)) > -1) continue
    const square: any = { id, chairs: [], panels: [], trainees: [], venue: null }
    const teams = matching[key]
    teams.push(parseInt(key))
    square.teams = decidePositions(teams, compiledTeamResults, config)
    teamAllocation.push(square)
    used = used.concat(teams)
    id += 1
  }
  return teamAllocation
}

function getTeamDraw(
  r: number,
  teams: any[],
  compiledTeamResults: any[],
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
  },
  config: any
) {
  const filterFunctions = filtersOpt.map((f) => filterMethods[f])
  const availableTeams = filterAvailable(teams, r)
  const sortedTeams = sortTeams(availableTeams, compiledTeamResults)
  const ts = sortedTeams.map((t) => t.id)
  const ranks = getTeamRanksMethods[method](
    r,
    sortedTeams,
    compiledTeamResults,
    filterFunctions,
    weights
  )
  const teamNum = config.style.team_num
  const matching = mGaleShapley(ts, ranks, teamNum - 1)
  const teamAllocation = getTeamAllocationFromMatching(matching, compiledTeamResults, config)
  return { r, allocation: teamAllocation }
}

function getTeamAllocationFromStrictMatching(matching: number[][]) {
  sillyLogger(getTeamAllocationFromStrictMatching, arguments, 'draws')
  let id = 0
  const allocation: any[] = []
  for (const div of matching) {
    allocation.push({ id, teams: div, chairs: [], panels: [], trainees: [], venue: null })
    id += 1
  }
  return allocation
}

function getTeamDrawStrict(
  r: number,
  teams: any[],
  compiledTeamResults: any[],
  config: any,
  options: any
) {
  const matching = strictMatching(teams, compiledTeamResults, config, options)
  const teamAllocation = getTeamAllocationFromStrictMatching(matching as any)
  return { r, allocation: teamAllocation }
}

const filterMethods: Record<string, Function> = {
  by_side: filters.filterBySide,
  by_institution: filters.filterByInstitution,
  by_past_opponent: filters.filterByPastOpponent,
  by_strength: filters.filterByStrength,
  by_random: filters.filterByRandom,
}

const standard = { get: getTeamDraw }
const strict = { get: getTeamDrawStrict }
const precheck = teamAllocationPrecheck

export { standard, strict, precheck }
export default { standard, strict, precheck }
