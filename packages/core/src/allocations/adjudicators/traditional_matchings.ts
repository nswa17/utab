import { sillyLogger } from '../../general/loggers.js'
import {
  allocationSlightnessComparer,
  sortAllocation,
  sortAdjudicators,
} from '../../general/sortings.js'
import { allocationDeepcopy } from '../sys.js'
import { setMinus } from '../../general/math.js'
import { accessDetail } from '../../general/tools.js'

function isConflict(r: number, square: any, adjudicator: any, teams: any[]): boolean {
  const adjInst = accessDetail(adjudicator, r).institutions as number[]
  const adjConfl = accessDetail(adjudicator, r).conflicts as number[]
  const teamInst = ([] as number[]).concat(
    ...square.teams.map((id: number) => teams.find((t: any) => t.id === id)?.institutions || [])
  )
  if (teamInst.some((i) => adjInst?.includes(i))) return true
  if (square.teams.some((tid: number) => adjConfl?.includes(tid))) return true
  return false
}

function distributeAdjudicators(
  r: number,
  sortedAllocation: any[],
  sortedAdjudicators: any[],
  teams: any[],
  { chairs, panels, trainees }: { chairs: number; panels: number; trainees: number },
  middle: boolean,
  options: { scatter?: boolean }
): any[] {
  sillyLogger(distributeAdjudicators, arguments, 'draws')
  const newAllocation = allocationDeepcopy(sortedAllocation)
  let remaining = [...sortedAdjudicators]
  const allocatePanelFirst = panels > 0 && middle

  for (let j = 0; j < newAllocation.length; j++) {
    const square = newAllocation[j]
    square.chairs = square.chairs ?? []
    square.panels = square.panels ?? []
    square.trainees = square.trainees ?? []
    const exitCondition = !options.scatter
      ? () => false
      : (i: number, rem: any[]) =>
          (newAllocation.length + 1) * (i - 1) + (j + 1) >= sortedAdjudicators.length

    for (let i = 0; i < remaining.length; i++) {
      const adjudicator = remaining[i]
      if (allocatePanelFirst) {
        if (!isConflict(r, square, adjudicator, teams)) {
          square.panels.push(adjudicator.id)
          remaining = remaining.filter((adj) => adj.id !== adjudicator.id)
          break
        }
      } else {
        if (!isConflict(r, square, adjudicator, teams)) {
          if (square.chairs.length < chairs) {
            square.chairs.push(adjudicator.id)
          } else if (square.panels.length < panels) {
            square.panels.push(adjudicator.id)
          } else if (square.trainees.length < trainees) {
            square.trainees.push(adjudicator.id)
          } else {
            break
          }
          remaining = remaining.filter((adj) => adj.id !== adjudicator.id)
        }
      }
      if (exitCondition(i, remaining)) break
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
  allocation: any[],
  adjudicators: any[],
  teams: any[],
  compiledAdjudicatorResults: any[],
  compiledTeamResults: any[],
  allocationSortAlgorithm: any,
  adjudicatorsSortAlgorithm: any,
  numbersOfAdjudicators: { chairs: number; panels: number; trainees: number },
  middle: boolean,
  options: { scatter?: boolean }
): any[] {
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
  allocation: any[],
  adjudicators: any[],
  teams: any[],
  compiledAdjudicatorResults: any[],
  compiledTeamResults: any[],
  numbersOfAdjudicators: { chairs: number; panels: number; trainees: number },
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
  allocation: any[],
  adjudicators: any[],
  teams: any[],
  compiledAdjudicatorResults: any[],
  compiledTeamResults: any[],
  numbersOfAdjudicators: { chairs: number; panels: number; trainees: number },
  options: { scatter?: boolean }
) {
  const f = (a: any, c: any) => sortAllocation(a, c, allocationSlightnessComparer)
  return allocateAdjudicators(
    r,
    allocation,
    adjudicators,
    teams,
    compiledAdjudicatorResults,
    compiledTeamResults,
    f,
    sortAdjudicators,
    numbersOfAdjudicators,
    false,
    options
  )
}

export function allocateMiddleToHigh(
  r: number,
  allocation: any[],
  adjudicators: any[],
  teams: any[],
  compiledAdjudicatorResults: any[],
  compiledTeamResults: any[],
  numbersOfAdjudicators: { chairs: number; panels: number; trainees: number },
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
  allocation: any[],
  adjudicators: any[],
  teams: any[],
  compiledAdjudicatorResults: any[],
  compiledTeamResults: any[],
  numbersOfAdjudicators: { chairs: number; panels: number; trainees: number },
  options: { scatter?: boolean }
) {
  const f = (a: any, c: any) => sortAllocation(a, c, allocationSlightnessComparer)
  return allocateAdjudicators(
    r,
    allocation,
    adjudicators,
    teams,
    compiledAdjudicatorResults,
    compiledTeamResults,
    f,
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
}
