import { sum, sd, average } from './math.js'
import { findOne as findOneResult } from '../allocations/sys.js'
import { accessDetail } from './tools.js'
import { sillyLogger } from './loggers.js'

export interface CompiledTeamResult {
  id: number
  win: number
  sum: number
  margin?: number
  past_sides?: string[]
}

export interface CompiledAdjudicatorResult {
  id: number
  average: number
  score?: number
  details?: Array<{ score?: number }>
}

export interface AllocationSquare {
  id: number
  teams: number[]
}

function getScores(
  adjudicator: { id: number },
  compiledAdjudicatorResults: CompiledAdjudicatorResult[]
): number[] {
  const detail = findOneResult(compiledAdjudicatorResults, adjudicator.id).details || []
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

export function sortDecorator<TBase, T>(
  base: TBase,
  filterFunctions: Array<(base: TBase, a: T, b: T, dict: any) => number>,
  dict: any
) {
  return (a: T & { id: number }, b: T & { id: number }) => {
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
  const sumSlightness = sd(ts.map((id) => findOneResult(compiledTeamResults, id).sum))
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

export function speakerSimpleComparer(results: any[], id1: number, id2: number): number {
  return findOneResult(results, id1).average < findOneResult(results, id2).average ? 1 : -1
}

export function teamSimpleComparer(
  results: CompiledTeamResult[],
  id1: number,
  id2: number
): number {
  return findOneResult(results, id1).win < findOneResult(results, id2).win ? 1 : -1
}

export function adjudicatorSimpleComparer(results: any[], id1: number, id2: number): number {
  return findOneResult(results, id1).score < findOneResult(results, id2).score ? 1 : -1
}

export function speakerComparer(results: any[], id1: number, id2: number): number {
  if (findOneResult(results, id1).sum < findOneResult(results, id2).sum) return 1
  if (findOneResult(results, id1).average < findOneResult(results, id2).average) return 1
  return -1
}

export function adjudicatorComparer(results: any[], id1: number, id2: number): number {
  return findOneResult(results, id1).average < findOneResult(results, id2).average ? 1 : -1
}

export function teamComparer(results: CompiledTeamResult[], id1: number, id2: number): number {
  const a = findOneResult(results, id1)
  const b = findOneResult(results, id2)
  if (a.win < b.win) return 1
  if (a.win === b.win) {
    if (a.sum < b.sum) return 1
    if (a.sum === b.sum) {
      if ((a.margin ?? 0) < (b.margin ?? 0)) return 1
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
  T extends { id: number; details: Array<{ r: number; priority: number }> },
>(r: number, venues: T[]): T[] {
  sillyLogger(sortVenues, arguments, 'general')
  const sorted = [...venues]
  sorted.sort((a, b) =>
    (accessDetail(a, r).priority as number) > (accessDetail(b, r).priority as number) ? 1 : -1
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
