import { count, countCommon } from '../../general/math.js'
import { findOne } from '../sys.js'
import { accessDetail } from '../../general/tools.js'
import {
  normalizeInstitutionPriorityMap,
  weightedCommonScore,
} from '../common/institution-priority.js'

export function filterByRandom(
  team: { id: number },
  a: { id: number },
  b: { id: number },
  { r }: { compiled_team_results: any; r: number }
): number {
  const f = (t: { id: number }) => t.id % (r + 2760)
  return f(a) > f(b) ? 1 : -1
}

export function filterBySide(team: any, a: any, b: any, { compiled_team_results, r }: any): number {
  const getResult = (id: number) => findOne(compiled_team_results as any[], id) as any
  const teamAPastSides = getResult(a.id).past_sides
  const teamBPastSides = getResult(b.id).past_sides
  const teamPastSides = getResult(team.id).past_sides
  const aFit = teamAPastSides && teamPastSides && getResult(a.id) && getResult(team.id)
  const bFit = teamBPastSides && teamPastSides && getResult(b.id) && getResult(team.id)
  const aSide = count(teamAPastSides || [], 'gov') - count(teamAPastSides || [], 'opp')
  const bSide = count(teamBPastSides || [], 'gov') - count(teamBPastSides || [], 'opp')
  const tSide = count(teamPastSides || [], 'gov') - count(teamPastSides || [], 'opp')
  const aFitVal = aSide * tSide < 0
  const bFitVal = bSide * tSide < 0

  if (aFitVal && !bFitVal) return -1
  if (bFitVal && !aFitVal) return 1
  return 0
}

export function filterByStrength(
  team: any,
  a: any,
  b: any,
  { compiled_team_results }: any
): number {
  const getResult = (id: number) => findOne(compiled_team_results as any[], id) as any
  const aWin = getResult(a.id).win
  const bWin = getResult(b.id).win
  const teamWin = getResult(team.id).win
  const aWinDiff = Math.abs(teamWin - aWin)
  const bWinDiff = Math.abs(teamWin - bWin)
  if (aWinDiff > bWinDiff) return 1
  if (aWinDiff < bWinDiff) return -1
  const aSum = getResult(a.id).sum
  const bSum = getResult(b.id).sum
  const teamSum = getResult(team.id).sum
  const aSumDiff = Math.abs(teamSum - aSum)
  const bSumDiff = Math.abs(teamSum - bSum)
  if (aSumDiff > bSumDiff) return 1
  if (aSumDiff < bSumDiff) return -1
  return 0
}

export function filterByInstitution(team: any, a: any, b: any, { r, config }: any): number {
  const aInstitutions = accessDetail(a, r).institutions as number[]
  const bInstitutions = accessDetail(b, r).institutions as number[]
  const teamInstitutions = accessDetail(team, r).institutions as number[]
  const priorityMap = normalizeInstitutionPriorityMap(config?.institution_priority_map)
  const aInsti =
    Object.keys(priorityMap).length > 0
      ? weightedCommonScore(aInstitutions || [], teamInstitutions || [], priorityMap)
      : countCommon(aInstitutions || [], teamInstitutions || [])
  const bInsti =
    Object.keys(priorityMap).length > 0
      ? weightedCommonScore(bInstitutions || [], teamInstitutions || [], priorityMap)
      : countCommon(bInstitutions || [], teamInstitutions || [])
  if (aInsti < bInsti) return -1
  if (aInsti > bInsti) return 1
  return 0
}

export function filterByPastOpponent(
  team: any,
  a: any,
  b: any,
  { compiled_team_results }: any
): number {
  const getResult = (id: number) => findOne(compiled_team_results as any[], id) as any
  const aPast = count(getResult(a.id).past_opponents || [], team.id)
  const bPast = count(getResult(b.id).past_opponents || [], team.id)
  if (aPast > bPast) return 1
  if (aPast < bPast) return -1
  return 0
}

export default {
  filterByRandom,
  filterBySide,
  filterByInstitution,
  filterByPastOpponent,
  filterByStrength,
}
