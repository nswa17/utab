import { allocationDeepcopy, findOne } from './sys.js'
import { adjudicatorAllocationPrecheck } from './adjudicators/checks.js'
import { filterAvailable } from '../general/tools.js'
import { sillyLogger } from '../general/loggers.js'
import {
  sortDecorator,
  sortAdjudicators,
  sortAllocation,
  sortAdjudicatorsWithPreev,
  type CompiledAdjudicatorResult,
  type CompiledTeamResult,
} from '../general/sortings.js'
import { setMinus } from '../general/math.js'
import * as adjfilters from './adjudicators/adjfilters.js'
import { galeShapley } from './adjudicators/matchings.js'
import * as traditionalMatchings from './adjudicators/traditional_matchings.js'
import type { AllocationConfig, Draw, NumbersOfAdjudicators } from '../types/allocations.js'
import type { AdjudicatorEntity, TeamEntity } from '../types/domain.js'

type AllocationWithAdjudicators = Draw['allocation'][number]

interface RankContext {
  teams: TeamEntity[]
  compiled_team_results: CompiledTeamResult[]
  compiled_adjudicator_results: CompiledAdjudicatorResult[]
  config: AllocationConfig
  r: number
}

type GroupRankFilter = (
  square: AllocationWithAdjudicators,
  a: AdjudicatorEntity,
  b: AdjudicatorEntity,
  dict: RankContext
) => number

type AdjudicatorRankFilter = (
  adjudicator: AdjudicatorEntity,
  g1: AllocationWithAdjudicators,
  g2: AllocationWithAdjudicators,
  dict: RankContext
) => number

function getAdjudicatorRanks(
  r: number,
  allocation: AllocationWithAdjudicators[],
  teams: TeamEntity[],
  adjudicators: AdjudicatorEntity[],
  compiledTeamResults: CompiledTeamResult[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  filterFunctions: GroupRankFilter[],
  filterFunctions2: AdjudicatorRankFilter[],
  config: AllocationConfig
) {
  sillyLogger(getAdjudicatorRanks, arguments, 'draws')
  const allocationCopy = [...allocation]
  const gRanks: Record<number, number[]> = {}
  const aRanks: Record<number, number[]> = {}
  for (const square of allocationCopy) {
    adjudicators.sort(
      sortDecorator(square, filterFunctions, {
        teams,
        compiled_team_results: compiledTeamResults,
        compiled_adjudicator_results: compiledAdjudicatorResults,
        config,
        r,
      })
    )
    gRanks[square.id] = adjudicators.map((adjudicator) => adjudicator.id)
  }
  for (const adjudicator of adjudicators) {
    allocationCopy.sort(
      sortDecorator(adjudicator, filterFunctions2, {
        teams,
        compiled_team_results: compiledTeamResults,
        compiled_adjudicator_results: compiledAdjudicatorResults,
        config,
        r,
      })
    )
    aRanks[adjudicator.id] = allocationCopy.map((square) => square.id)
  }
  return [gRanks, aRanks] as const
}

function getAdjudicatorAllocationFromMatching(
  allocation: AllocationWithAdjudicators[],
  matching: Record<number, number[]>,
  role: 'chairs' | 'panels' | 'trainees'
): AllocationWithAdjudicators[] {
  sillyLogger(getAdjudicatorAllocationFromMatching, arguments, 'draws')
  const newAllocation = allocationDeepcopy(allocation)
  for (const squareId of Object.keys(matching)) {
    const targetAllocation = newAllocation.find((square) => square.id === Number(squareId))
    if (targetAllocation) {
      targetAllocation[role] = matching[Number(squareId)]
    }
  }
  return newAllocation
}

function getMatching(
  allocation: AllocationWithAdjudicators[],
  availableAdjudicators: AdjudicatorEntity[],
  gRanks: Record<number, number[]>,
  aRanks: Record<number, number[]>,
  compiledTeamResults: CompiledTeamResult[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  role: 'chairs' | 'panels' | 'trainees',
  num: number
) {
  sillyLogger(getMatching, arguments, 'draws')
  const sortedAdjudicators = sortAdjudicators(availableAdjudicators, compiledAdjudicatorResults)
  const sortedAllocation = sortAllocation(allocation, compiledTeamResults)
  const chairMatching = galeShapley(
    sortedAllocation.map((row) => row.id),
    sortedAdjudicators.map((adjudicator) => adjudicator.id),
    gRanks,
    aRanks,
    num
  )
  return getAdjudicatorAllocationFromMatching(allocation, chairMatching, role)
}

function getAdjudicatorDraw(
  r: number,
  draw: Draw,
  adjudicators: AdjudicatorEntity[],
  teams: TeamEntity[],
  compiledTeamResults: CompiledTeamResult[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  { chairs, panels, trainees }: NumbersOfAdjudicators,
  config: AllocationConfig,
  {
    filters: filtersOpt = [
      'by_bubble',
      'by_strength',
      'by_attendance',
      'by_conflict_team',
      'by_conflict_group',
      'by_past',
      'by_random',
    ],
  }: { filters?: string[] } = {}
): Draw {
  sillyLogger(getAdjudicatorDraw, arguments, 'draws')
  const availableTeams = filterAvailable(teams, r)
  const availableAdjudicators = filterAvailable(adjudicators, r)
  const allocation = draw.allocation
  const filterFunctionsAdj = filtersOpt
    .filter((filterName) => Object.prototype.hasOwnProperty.call(adjfilterMethods1, filterName))
    .map((filterName) => adjfilterMethods1[filterName]) as GroupRankFilter[]
  const filterFunctionsAdj2 = filtersOpt
    .filter((filterName) => Object.prototype.hasOwnProperty.call(adjfilterMethods2, filterName))
    .map((filterName) => adjfilterMethods2[filterName]) as AdjudicatorRankFilter[]

  const [gRanks, aRanks] = getAdjudicatorRanks(
    r,
    allocation,
    availableTeams,
    availableAdjudicators,
    compiledTeamResults,
    compiledAdjudicatorResults,
    filterFunctionsAdj,
    filterFunctionsAdj2,
    config
  )
  let newAllocation = getMatching(
    allocation,
    availableAdjudicators,
    gRanks,
    aRanks,
    compiledTeamResults,
    compiledAdjudicatorResults,
    'chairs',
    chairs
  )

  let activeAdjudicators = ([] as number[]).concat(
    ...newAllocation.map((square) => square.chairs ?? [])
  )
  let remainingAdjudicatorIds = setMinus(
    availableAdjudicators.map((adjudicator) => adjudicator.id),
    activeAdjudicators
  )
  let remainingAdjudicators = remainingAdjudicatorIds.map((id) => findOne(adjudicators, id))
  newAllocation = getMatching(
    newAllocation,
    remainingAdjudicators,
    gRanks,
    aRanks,
    compiledTeamResults,
    compiledAdjudicatorResults,
    'panels',
    panels
  )

  activeAdjudicators = ([] as number[]).concat(
    ...newAllocation.map((square) => square.chairs ?? []),
    ...newAllocation.map((square) => square.panels ?? [])
  )
  remainingAdjudicatorIds = setMinus(
    availableAdjudicators.map((adjudicator) => adjudicator.id),
    activeAdjudicators
  )
  remainingAdjudicators = remainingAdjudicatorIds.map((id) => findOne(adjudicators, id))
  newAllocation = getMatching(
    newAllocation,
    remainingAdjudicators,
    gRanks,
    aRanks,
    compiledTeamResults,
    compiledAdjudicatorResults,
    'trainees',
    trainees
  )

  return { r: draw.r, allocation: newAllocation, user_defined_data: draw.user_defined_data }
}

function getAdjudicatorDrawTraditional(
  r: number,
  draw: Draw,
  adjudicators: AdjudicatorEntity[],
  teams: TeamEntity[],
  compiledTeamResults: CompiledTeamResult[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  numbersOfAdjudicators: NumbersOfAdjudicators,
  config: AllocationConfig,
  { assign = 'high_to_high', scatter = false }: { assign?: string; scatter?: boolean } = {}
): Draw {
  sillyLogger(getAdjudicatorDrawTraditional, arguments, 'draws')
  const allocation = draw.allocation
  const availableAdjudicators = filterAvailable(adjudicators, r)
  const sortedAdjudicators = sortAdjudicatorsWithPreev(
    availableAdjudicators,
    compiledAdjudicatorResults,
    config.preev_weights ?? []
  )
  const sortedAllocation = sortAllocation(allocation, compiledTeamResults)

  const assignMap = {
    high_to_high: traditionalMatchings.allocateHighToHigh,
    high_to_slight: traditionalMatchings.allocateHighToSlight,
    high_to_close: traditionalMatchings.allocateHighToClose,
    middle_to_high: traditionalMatchings.allocateMiddleToHigh,
    middle_to_slight: traditionalMatchings.allocateMiddleToSlight,
    middle_to_close: traditionalMatchings.allocateMiddleToClose,
  } as const
  const assigner = assignMap[(assign as keyof typeof assignMap) ?? 'high_to_high']
  const newAllocation = assigner(
    r,
    sortedAllocation,
    sortedAdjudicators,
    teams,
    compiledAdjudicatorResults,
    compiledTeamResults,
    numbersOfAdjudicators,
    { scatter }
  )
  return { r: draw.r, allocation: newAllocation, user_defined_data: draw.user_defined_data }
}

const adjfilterMethods1: Record<string, GroupRankFilter> = {
  by_bubble: adjfilters.filterByBubble,
  by_strength: adjfilters.filterByStrength,
  by_attendance: adjfilters.filterByAttendance,
  by_random: adjfilters.filterByRandom,
}

const adjfilterMethods2: Record<string, AdjudicatorRankFilter> = {
  by_past: adjfilters.filterByPast,
  by_conflict_group: adjfilters.filterByConflictGroup,
  by_conflict_team: adjfilters.filterByConflictTeam,
}

const standard = { get: getAdjudicatorDraw }
const traditional = { get: getAdjudicatorDrawTraditional }
const precheck = adjudicatorAllocationPrecheck

export { standard, traditional, precheck }
export default { standard, traditional, precheck }
