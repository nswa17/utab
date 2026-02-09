import { countCommon } from '../../general/math.js'
import { findOne } from '../sys.js'
import { accessDetail, findAndAccessDetail } from '../../general/tools.js'
import { evaluateAdjudicator } from '../../general/sortings.js'

export function filterByRandom(square: any, a: any, b: any, { r }: any): number {
  const f = (adj: any) => adj.id % (r + 2760)
  return f(a) > f(b) ? 1 : -1
}

export function filterByStrength(
  square: any,
  a: any,
  b: any,
  { compiled_adjudicator_results, config }: any
): number {
  const preevWeights = config.preev_weights
  const aEv = evaluateAdjudicator(a, compiled_adjudicator_results, preevWeights)
  const bEv = evaluateAdjudicator(b, compiled_adjudicator_results, preevWeights)
  if (aEv < bEv) return 1
  if (aEv > bEv) return -1
  return 0
}

export function filterByBubble(_square: any, _a: any, _b: any, _ctx: any): number {
  return 0
}

export function filterByAttendance(
  _square: any,
  a: any,
  b: any,
  { compiled_adjudicator_results }: any
): number {
  const getResult = (id: number) => findOne(compiled_adjudicator_results as any[], id) as any
  const aActive = getResult(a.id).active_num
  const bActive = getResult(b.id).active_num
  if (aActive > bActive) return 1
  if (aActive < bActive) return -1
  return 0
}

export function filterByPast(
  adjudicator: any,
  g1: any,
  g2: any,
  { compiled_adjudicator_results }: any
): number {
  const getResult = (id: number) => findOne(compiled_adjudicator_results as any[], id) as any
  const g1Watched = countCommon(g1.teams, getResult(adjudicator.id).judged_teams)
  const g2Watched = countCommon(g2.teams, getResult(adjudicator.id).judged_teams)
  if (g1Watched > g2Watched) return 1
  if (g1Watched < g2Watched) return -1
  return 0
}

export function filterByInstitution(adjudicator: any, g1: any, g2: any, { teams, r }: any): number {
  const g1Inst = ([] as number[]).concat(
    ...g1.teams.map((t: number) => findAndAccessDetail(teams, t, r).institutions || [])
  )
  const g2Inst = ([] as number[]).concat(
    ...g2.teams.map((t: number) => findAndAccessDetail(teams, t, r).institutions || [])
  )
  const aInst = accessDetail(adjudicator, r).institutions as number[]
  const g1Conflict = countCommon(g1Inst, aInst || [])
  const g2Conflict = countCommon(g2Inst, aInst || [])
  if (g1Conflict > g2Conflict) return 1
  if (g1Conflict < g2Conflict) return -1
  return 0
}

export function filterByConflict(adjudicator: any, g1: any, g2: any, { r }: any): number {
  const g1Conflict = countCommon(g1.teams, accessDetail(adjudicator, r).conflicts as number[])
  const g2Conflict = countCommon(g2.teams, accessDetail(adjudicator, r).conflicts as number[])
  if (g1Conflict > g2Conflict) return 1
  if (g1Conflict < g2Conflict) return -1
  return 0
}

export default {
  filterByRandom,
  filterByStrength,
  filterByPast,
  filterByInstitution,
  filterByBubble,
  filterByAttendance,
  filterByConflict,
}
