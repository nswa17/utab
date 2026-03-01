import { sum, sd, average } from './math.js'
import { findOne as findOneResult } from '../allocations/sys.js'
import { accessDetail } from './tools.js'
import { sillyLogger } from './loggers.js'
import type { AllocationSquare } from '../types/allocations.js'
import type { CompiledAdjudicatorResult, CompiledTeamResult } from '../types/results.js'

export type { AllocationSquare } from '../types/allocations.js'
export type { CompiledAdjudicatorResult, CompiledTeamResult } from '../types/results.js'

type IdWithAverage = { id: number; average: number }
type IdWithScore = { id: number; score: number }
type IdWithSumAndAverage = { id: number; sum: number; average: number }

function getScores(
  adjudicator: { id: number },
  compiledAdjudicatorResults: CompiledAdjudicatorResult[]
): number[] {
  const detail = findOneResult(compiledAdjudicatorResults, adjudicator.id).details ?? []
  return detail.map((d) => d.score).filter((s): s is number => typeof s === 'number')
}

export function evaluateAdjudicator(
  adjudicator: { id: number; preev: number },
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  preevWeights: number[]
): number {
  const scores = getScores(adjudicator, compiledAdjudicatorResults)
  if (scores.length === 0) return adjudicator.preev
  const weight =
    preevWeights[Math.max(0, Math.min(scores.length - 1, preevWeights.length - 1))] ?? 0.5
  return weight * adjudicator.preev + (1 - weight) * average(scores)
}

export function sortDecorator<TBase, TItem extends { id: number }, TDict>(
  base: TBase,
  filterFunctions: Array<(base: TBase, a: TItem, b: TItem, dict: TDict) => number>,
  dict: TDict
): (a: TItem, b: TItem) => number {
  return (a, b) => {
    for (const func of filterFunctions) {
      const c = func(base, a, b, dict)
      if (c !== 0) return c
    }
    return a.id > b.id ? 1 : -1
  }
}

export function allocationComparer(
  compiledTeamResults: CompiledTeamResult[],
  a: AllocationSquare,
  b: AllocationSquare
): number {
  const aWin = sum(a.teams.map((id) => findOneResult(compiledTeamResults, id).win))
  const bWin = sum(b.teams.map((id) => findOneResult(compiledTeamResults, id).win))
  return aWin > bWin ? 1 : -1
}

function measureSlightness(
  ts: number[],
  compiledTeamResults: CompiledTeamResult[]
): [number, number] {
  const winSlightness = sd(ts.map((id) => findOneResult(compiledTeamResults, id).win))
  const sumSlightness = sd(ts.map((id) => Number(findOneResult(compiledTeamResults, id).sum ?? 0)))
  return [winSlightness, sumSlightness]
}

export function allocationSlightnessComparer(
  compiledTeamResults: CompiledTeamResult[],
  s1: AllocationSquare,
  s2: AllocationSquare
): number {
  const [win1, sum1] = measureSlightness(s1.teams, compiledTeamResults)
  const [win2, sum2] = measureSlightness(s2.teams, compiledTeamResults)
  if (win1 < win2) return 1
  if (win1 === win2 && sum1 < sum2) return 1
  return -1
}

export function allocationClosenessComparer(
  compiledTeamResults: CompiledTeamResult[],
  s1: AllocationSquare,
  s2: AllocationSquare
): number {
  const [win1, sum1] = measureSlightness(s1.teams, compiledTeamResults)
  const [win2, sum2] = measureSlightness(s2.teams, compiledTeamResults)
  if (win1 < win2) return -1
  if (win1 === win2 && sum1 < sum2) return -1
  return 1
}

export function speakerSimpleComparer(
  results: IdWithAverage[],
  id1: number,
  id2: number
): number {
  return findOneResult(results, id1).average < findOneResult(results, id2).average ? 1 : -1
}

export function teamSimpleComparer<T extends { id: number; win: number }>(
  results: T[],
  id1: number,
  id2: number
): number {
  return findOneResult(results, id1).win < findOneResult(results, id2).win ? 1 : -1
}

export function adjudicatorSimpleComparer(results: IdWithScore[], id1: number, id2: number): number {
  return findOneResult(results, id1).score < findOneResult(results, id2).score ? 1 : -1
}

export function speakerComparer(results: IdWithSumAndAverage[], id1: number, id2: number): number {
  if (findOneResult(results, id1).sum < findOneResult(results, id2).sum) return 1
  if (findOneResult(results, id1).average < findOneResult(results, id2).average) return 1
  return -1
}

export function adjudicatorComparer(
  results: CompiledAdjudicatorResult[],
  id1: number,
  id2: number
): number {
  return findOneResult(results, id1).average < findOneResult(results, id2).average ? 1 : -1
}

export function teamComparer<
  T extends { id: number; win: number; sum: number | null; margin: number | null },
>(results: T[], id1: number, id2: number): number {
  const a = findOneResult(results, id1)
  const b = findOneResult(results, id2)
  if (a.win < b.win) return 1
  if (a.win === b.win) {
    const aSum = a.sum ?? Number.NEGATIVE_INFINITY
    const bSum = b.sum ?? Number.NEGATIVE_INFINITY
    if (aSum < bSum) return 1
    if (aSum === bSum) {
      const aMargin = a.margin ?? Number.NEGATIVE_INFINITY
      const bMargin = b.margin ?? Number.NEGATIVE_INFINITY
      if (aMargin < bMargin) return 1
    }
  }
  return -1
}

export function sortTeams<T extends { id: number }>(
  teams: T[],
  compiledTeamResults: CompiledTeamResult[],
  comparer = teamComparer
): T[] {
  sillyLogger(sortTeams, arguments, 'general')
  const sorted = [...teams]
  sorted.sort((a, b) => comparer(compiledTeamResults, a.id, b.id))
  return sorted
}

export function sortAdjudicators<T extends { id: number }>(
  adjudicators: T[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  comparer = adjudicatorComparer
): T[] {
  sillyLogger(sortAdjudicators, arguments, 'general')
  const sorted = [...adjudicators]
  sorted.sort((a, b) => comparer(compiledAdjudicatorResults, a.id, b.id))
  return sorted
}

export function sortAdjudicatorsWithPreev<T extends { id: number; preev: number }>(
  adjudicators: T[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  preevWeights: number[]
): T[] {
  sillyLogger(sortAdjudicatorsWithPreev, arguments, 'general')
  const sorted = [...adjudicators]
  sorted.sort((a, b) => {
    const aScore = evaluateAdjudicator(a, compiledAdjudicatorResults, preevWeights)
    const bScore = evaluateAdjudicator(b, compiledAdjudicatorResults, preevWeights)
    return aScore < bScore ? 1 : -1
  })
  return sorted
}

export function sortVenues<
  T extends { id: number; details: Array<{ r: number; priority?: number }> },
>(r: number, venues: T[]): T[] {
  sillyLogger(sortVenues, arguments, 'general')
  const sorted = [...venues]
  sorted.sort((a, b) =>
    Number(accessDetail(a, r).priority ?? 0) > Number(accessDetail(b, r).priority ?? 0) ? 1 : -1
  )
  return sorted
}

export function sortAllocation(
  allocation: AllocationSquare[],
  compiledTeamResults: CompiledTeamResult[],
  comparer = allocationComparer
): AllocationSquare[] {
  sillyLogger(sortAllocation, arguments, 'general')
  const sorted = [...allocation]
  sorted.sort((a, b) => comparer(compiledTeamResults, a, b))
  return sorted
}

export default {
  evaluateAdjudicator,
  allocationComparer,
  allocationSlightnessComparer,
  allocationClosenessComparer,
  speakerSimpleComparer,
  speakerComparer,
  adjudicatorSimpleComparer,
  adjudicatorComparer,
  teamSimpleComparer,
  teamComparer,
  sortTeams,
  sortAdjudicators,
  sortAdjudicatorsWithPreev,
  sortVenues,
  sortAllocation,
  sortDecorator,
}
