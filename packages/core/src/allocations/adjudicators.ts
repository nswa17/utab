import { allocationDeepcopy, findOne } from './sys.js'
import { adjudicatorAllocationPrecheck } from './adjudicators/checks.js'
import { filterAvailable } from '../general/tools.js'
import { sillyLogger } from '../general/loggers.js'
import {
  sortDecorator,
  sortAdjudicators,
  sortAllocation,
  sortAdjudicatorsWithPreev,
} from '../general/sortings.js'
import { setMinus } from '../general/math.js'
import * as adjfilters from './adjudicators/adjfilters.js'
import { galeShapley } from './adjudicators/matchings.js'
import * as traditionalMatchings from './adjudicators/traditional_matchings.js'

type AdjFilter = (base: any, a: any, b: any, dict: any) => number

function getAdjudicatorRanks(
  r: number,
  allocation: any[],
  teams: any[],
  adjudicators: any[],
  compiledAdjudicatorResults: any[],
  filterFunctions: AdjFilter[],
  filterFunctions2: AdjFilter[],
  config: any
) {
  sillyLogger(getAdjudicatorRanks, arguments, 'draws')
  const allocationCp = [...allocation]
  const gRanks: Record<number, number[]> = {}
  const aRanks: Record<number, number[]> = {}
  for (const square of allocationCp) {
    adjudicators.sort(
      sortDecorator(square, filterFunctions, {
        teams,
        compiled_adjudicator_results: compiledAdjudicatorResults,
        config,
        r,
      })
    )
    gRanks[square.id] = adjudicators.map((a) => a.id)
  }
  for (const adjudicator of adjudicators) {
    allocationCp.sort(
      sortDecorator(adjudicator, filterFunctions2, {
        teams,
        compiled_adjudicator_results: compiledAdjudicatorResults,
        config,
        r,
      })
    )
    aRanks[adjudicator.id] = allocationCp.map((ta) => ta.id)
  }
  return [gRanks, aRanks] as const
}

function getAdjudicatorAllocationFromMatching(
  allocation: any[],
  matching: Record<number, number[]>,
  role: 'chairs' | 'panels' | 'trainees'
) {
  sillyLogger(getAdjudicatorAllocationFromMatching, arguments, 'draws')
  const newAllocation = allocationDeepcopy(allocation)
  for (const i in matching) {
    const targetAllocation = newAllocation.find((g) => g.id === parseInt(i))
    if (targetAllocation) targetAllocation[role] = matching[i]
  }
  return newAllocation
}

function getMatching(
  allocation: any[],
  availableAdjudicators: any[],
  gRanks: Record<number, number[]>,
  aRanks: Record<number, number[]>,
  compiledTeamResults: any[],
  compiledAdjudicatorResults: any[],
  role: 'chairs' | 'panels' | 'trainees',
  num: number
) {
  sillyLogger(getMatching, arguments, 'draws')
  const sortedAdjudicators = sortAdjudicators(availableAdjudicators, compiledAdjudicatorResults)
  const sortedAllocation = sortAllocation(allocation, compiledTeamResults)
  const chairMatching = galeShapley(
    sortedAllocation.map((a) => a.id),
    sortedAdjudicators.map((a) => a.id),
    gRanks,
    aRanks,
    num
  )
  return getAdjudicatorAllocationFromMatching(allocation, chairMatching, role)
}

function getAdjudicatorDraw(
  r: number,
  draw: any,
  adjudicators: any[],
  teams: any[],
  compiledTeamResults: any[],
  compiledAdjudicatorResults: any[],
  { chairs, panels, trainees }: { chairs: number; panels: number; trainees: number },
  config: any,
  {
    filters: filtersOpt = [
      'by_bubble',
      'by_strength',
      'by_attendance',
      'by_conflict',
      'by_institution',
      'by_past',
      'by_random',
    ],
  }
) {
  sillyLogger(getAdjudicatorDraw, arguments, 'draws')
  const availableTeams = filterAvailable(teams, r)
  const availableAdjudicators = filterAvailable(adjudicators, r)
  const allocation = draw.allocation
  const filterFunctionsAdj = filtersOpt
    .filter((f) => adjfilterMethods1.hasOwnProperty(f))
    .map((f) => adjfilterMethods1[f]) as AdjFilter[]
  const filterFunctionsAdj2 = filtersOpt
    .filter((f) => adjfilterMethods2.hasOwnProperty(f))
    .map((f) => adjfilterMethods2[f]) as AdjFilter[]

  const [gRanks, aRanks] = getAdjudicatorRanks(
    r,
    allocation,
    availableTeams,
    availableAdjudicators,
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

  let activeAdjudicators = ([] as number[]).concat(...newAllocation.map((s: any) => s.chairs))
  let remainingAdjudicatorIds = setMinus(
    availableAdjudicators.map((a) => a.id),
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
    ...newAllocation.map((s: any) => s.chairs),
    ...newAllocation.map((s: any) => s.panels)
  )
  remainingAdjudicatorIds = setMinus(
    availableAdjudicators.map((a) => a.id),
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

  return { r: draw.r, allocation: newAllocation }
}

function getAdjudicatorDrawTraditional(
  r: number,
  draw: any,
  adjudicators: any[],
  teams: any[],
  compiledTeamResults: any[],
  compiledAdjudicatorResults: any[],
  numbersOfAdjudicators: { chairs: number; panels: number; trainees: number },
  config: any,
  { assign = 'high_to_high', scatter = false }
) {
  sillyLogger(getAdjudicatorDrawTraditional, arguments, 'draws')
  const allocation = draw.allocation
  const availableAdjudicators = filterAvailable(adjudicators, r)
  const sortedAdjudicators = sortAdjudicatorsWithPreev(
    availableAdjudicators,
    compiledAdjudicatorResults,
    config.preev_weights
  )
  const sortedAllocation = sortAllocation(allocation, compiledTeamResults)

  const assignMap: Record<string, Function> = {
    high_to_high: traditionalMatchings.allocateHighToHigh,
    high_to_slight: traditionalMatchings.allocateHighToSlight,
    middle_to_high: traditionalMatchings.allocateMiddleToHigh,
    middle_to_slight: traditionalMatchings.allocateMiddleToSlight,
  }
  const f = assignMap[assign]
  const newAllocation = f(
    r,
    sortedAllocation,
    sortedAdjudicators,
    teams,
    compiledAdjudicatorResults,
    compiledTeamResults,
    numbersOfAdjudicators,
    { scatter }
  )
  return { r: draw.r, allocation: newAllocation }
}

const adjfilterMethods1: Record<string, Function> = {
  by_bubble: adjfilters.filterByBubble,
  by_strength: adjfilters.filterByStrength,
  by_attendance: adjfilters.filterByAttendance,
  by_random: adjfilters.filterByRandom,
}

const adjfilterMethods2: Record<string, Function> = {
  by_past: adjfilters.filterByPast,
  by_institution: adjfilters.filterByInstitution,
  by_conflict: adjfilters.filterByConflict,
}

const standard = { get: getAdjudicatorDraw }
const traditional = { get: getAdjudicatorDrawTraditional }
const precheck = adjudicatorAllocationPrecheck

export { standard, traditional, precheck }
export default { standard, traditional, precheck }
