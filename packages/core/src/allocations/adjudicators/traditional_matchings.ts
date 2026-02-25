import { sillyLogger } from '../../general/loggers.js'
import {
  allocationClosenessComparer,
  allocationSlightnessComparer,
  sortAllocation,
  sortAdjudicators,
  type CompiledAdjudicatorResult,
  type CompiledTeamResult,
  type AllocationSquare,
} from '../../general/sortings.js'
import { allocationDeepcopy } from '../sys.js'
import { accessDetail } from '../../general/tools.js'
import type { AdjudicatorEntity, TeamEntity } from '../../types/domain.js'
import type { NumbersOfAdjudicators } from '../../types/allocations.js'

interface AllocationWithAdjudicators extends AllocationSquare {
  chairs?: number[]
  panels?: number[]
  trainees?: number[]
}

type AllocationSortAlgorithm = (
  allocation: AllocationWithAdjudicators[],
  compiledTeamResults: CompiledTeamResult[]
) => AllocationWithAdjudicators[]

type AdjudicatorSortAlgorithm = (
  adjudicators: AdjudicatorEntity[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[]
) => AdjudicatorEntity[]

function isConflict(
  r: number,
  square: AllocationWithAdjudicators,
  adjudicator: AdjudicatorEntity,
  teams: TeamEntity[]
): boolean {
  const adjInstitutions = accessDetail(adjudicator, r).institutions as number[]
  const adjConflicts = accessDetail(adjudicator, r).conflicts as number[]
  const teamInstitutions = ([] as number[]).concat(
    ...square.teams.map(
      (teamId) =>
        (accessDetail(
          teams.find((team) => team.id === teamId) as TeamEntity,
          r
        ).institutions as number[]) || []
    )
  )
  if (teamInstitutions.some((institutionId) => adjInstitutions?.includes(institutionId))) return true
  if (square.teams.some((teamId) => adjConflicts?.includes(teamId))) return true
  return false
}

function distributeAdjudicators(
  r: number,
  sortedAllocation: AllocationWithAdjudicators[],
  sortedAdjudicators: AdjudicatorEntity[],
  teams: TeamEntity[],
  { chairs, panels, trainees }: NumbersOfAdjudicators,
  middle: boolean,
  options: { scatter?: boolean }
): AllocationWithAdjudicators[] {
  sillyLogger(distributeAdjudicators, arguments, 'draws')
  const newAllocation = allocationDeepcopy(sortedAllocation)
  let remaining = [...sortedAdjudicators]
  const allocatePanelFirst = panels > 0 && middle

  for (let j = 0; j < newAllocation.length; j += 1) {
    const square = newAllocation[j]
    square.chairs = square.chairs ?? []
    square.panels = square.panels ?? []
    square.trainees = square.trainees ?? []
    const exitCondition = !options.scatter
      ? () => false
      : (i: number) =>
          (newAllocation.length + 1) * (i - 1) + (j + 1) >= sortedAdjudicators.length

    for (let i = 0; i < remaining.length; i += 1) {
      const adjudicator = remaining[i]
      if (allocatePanelFirst) {
        if (!isConflict(r, square, adjudicator, teams)) {
          square.panels.push(adjudicator.id)
          remaining = remaining.filter((adj) => adj.id !== adjudicator.id)
          break
        }
      } else if (!isConflict(r, square, adjudicator, teams)) {
        if ((square.chairs?.length ?? 0) < chairs) {
          square.chairs?.push(adjudicator.id)
        } else if ((square.panels?.length ?? 0) < panels) {
          square.panels?.push(adjudicator.id)
        } else if ((square.trainees?.length ?? 0) < trainees) {
          square.trainees?.push(adjudicator.id)
        } else {
          break
        }
        remaining = remaining.filter((adj) => adj.id !== adjudicator.id)
      }
      if (exitCondition(i)) break
    }
  }
  return allocatePanelFirst
    ? distributeAdjudicators(
        r,
        newAllocation,
        remaining,
        teams,
        { chairs, panels: panels - 1, trainees },
        false,
        options
      )
    : newAllocation
}

function allocateAdjudicators(
  r: number,
  allocation: AllocationWithAdjudicators[],
  adjudicators: AdjudicatorEntity[],
  teams: TeamEntity[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  compiledTeamResults: CompiledTeamResult[],
  allocationSortAlgorithm: AllocationSortAlgorithm,
  adjudicatorsSortAlgorithm: AdjudicatorSortAlgorithm,
  numbersOfAdjudicators: NumbersOfAdjudicators,
  middle: boolean,
  options: { scatter?: boolean }
): AllocationWithAdjudicators[] {
  sillyLogger(allocateAdjudicators, arguments, 'draws')
  const sortedAllocation = allocationSortAlgorithm(allocation, compiledTeamResults)
  const sortedAdjudicators = adjudicatorsSortAlgorithm(adjudicators, compiledAdjudicatorResults)
  return distributeAdjudicators(
    r,
    sortedAllocation,
    sortedAdjudicators,
    teams,
    numbersOfAdjudicators,
    middle,
    options
  )
}

export function allocateHighToHigh(
  r: number,
  allocation: AllocationWithAdjudicators[],
  adjudicators: AdjudicatorEntity[],
  teams: TeamEntity[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  compiledTeamResults: CompiledTeamResult[],
  numbersOfAdjudicators: NumbersOfAdjudicators,
  options: { scatter?: boolean }
) {
  return allocateAdjudicators(
    r,
    allocation,
    adjudicators,
    teams,
    compiledAdjudicatorResults,
    compiledTeamResults,
    sortAllocation,
    sortAdjudicators,
    numbersOfAdjudicators,
    false,
    options
  )
}

export function allocateHighToSlight(
  r: number,
  allocation: AllocationWithAdjudicators[],
  adjudicators: AdjudicatorEntity[],
  teams: TeamEntity[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  compiledTeamResults: CompiledTeamResult[],
  numbersOfAdjudicators: NumbersOfAdjudicators,
  options: { scatter?: boolean }
) {
  const allocationSort: AllocationSortAlgorithm = (rows, compiledResults) =>
    sortAllocation(rows, compiledResults, allocationSlightnessComparer)
  return allocateAdjudicators(
    r,
    allocation,
    adjudicators,
    teams,
    compiledAdjudicatorResults,
    compiledTeamResults,
    allocationSort,
    sortAdjudicators,
    numbersOfAdjudicators,
    false,
    options
  )
}

export function allocateMiddleToHigh(
  r: number,
  allocation: AllocationWithAdjudicators[],
  adjudicators: AdjudicatorEntity[],
  teams: TeamEntity[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  compiledTeamResults: CompiledTeamResult[],
  numbersOfAdjudicators: NumbersOfAdjudicators,
  options: { scatter?: boolean }
) {
  return allocateAdjudicators(
    r,
    allocation,
    adjudicators,
    teams,
    compiledAdjudicatorResults,
    compiledTeamResults,
    sortAllocation,
    sortAdjudicators,
    numbersOfAdjudicators,
    true,
    options
  )
}

export function allocateMiddleToSlight(
  r: number,
  allocation: AllocationWithAdjudicators[],
  adjudicators: AdjudicatorEntity[],
  teams: TeamEntity[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  compiledTeamResults: CompiledTeamResult[],
  numbersOfAdjudicators: NumbersOfAdjudicators,
  options: { scatter?: boolean }
) {
  const allocationSort: AllocationSortAlgorithm = (rows, compiledResults) =>
    sortAllocation(rows, compiledResults, allocationSlightnessComparer)
  return allocateAdjudicators(
    r,
    allocation,
    adjudicators,
    teams,
    compiledAdjudicatorResults,
    compiledTeamResults,
    allocationSort,
    sortAdjudicators,
    numbersOfAdjudicators,
    true,
    options
  )
}

export function allocateHighToClose(
  r: number,
  allocation: AllocationWithAdjudicators[],
  adjudicators: AdjudicatorEntity[],
  teams: TeamEntity[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  compiledTeamResults: CompiledTeamResult[],
  numbersOfAdjudicators: NumbersOfAdjudicators,
  options: { scatter?: boolean }
) {
  const allocationSort: AllocationSortAlgorithm = (rows, compiledResults) =>
    sortAllocation(rows, compiledResults, allocationClosenessComparer)
  return allocateAdjudicators(
    r,
    allocation,
    adjudicators,
    teams,
    compiledAdjudicatorResults,
    compiledTeamResults,
    allocationSort,
    sortAdjudicators,
    numbersOfAdjudicators,
    false,
    options
  )
}

export function allocateMiddleToClose(
  r: number,
  allocation: AllocationWithAdjudicators[],
  adjudicators: AdjudicatorEntity[],
  teams: TeamEntity[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  compiledTeamResults: CompiledTeamResult[],
  numbersOfAdjudicators: NumbersOfAdjudicators,
  options: { scatter?: boolean }
) {
  const allocationSort: AllocationSortAlgorithm = (rows, compiledResults) =>
    sortAllocation(rows, compiledResults, allocationClosenessComparer)
  return allocateAdjudicators(
    r,
    allocation,
    adjudicators,
    teams,
    compiledAdjudicatorResults,
    compiledTeamResults,
    allocationSort,
    sortAdjudicators,
    numbersOfAdjudicators,
    true,
    options
  )
}

export default {
  allocateHighToHigh,
  allocateHighToSlight,
  allocateMiddleToHigh,
  allocateMiddleToSlight,
  allocateHighToClose,
  allocateMiddleToClose,
}
