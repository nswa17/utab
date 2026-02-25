import { countCommon } from '../../general/math.js'
import { findOne } from '../sys.js'
import { accessDetail, findAndAccessDetail } from '../../general/tools.js'
import { evaluateAdjudicator } from '../../general/sortings.js'
import {
  buildInstitutionPriorityHistogram,
  compareInstitutionPriorityHistograms,
  normalizeInstitutionPriorityMap,
} from '../common/institution-priority.js'
import type { AllocationConfig } from '../../types/allocations.js'
import type { AdjudicatorEntity, TeamEntity } from '../../types/domain.js'
import type { CompiledAdjudicatorResult } from '../../types/results.js'

type AdjudicatorFilterEntity = Pick<AdjudicatorEntity, 'id' | 'preev' | 'details'>
type AllocationGroup = { id: number; teams: number[] }

interface AdjudicatorFilterContext {
  r: number
  teams: TeamEntity[]
  config?: AllocationConfig
  compiled_adjudicator_results: CompiledAdjudicatorResult[]
}

function toNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : []
}

export function filterByRandom(
  _square: AllocationGroup,
  a: { id: number },
  b: { id: number },
  { r }: Pick<AdjudicatorFilterContext, 'r'>
): number {
  const value = (adjudicator: { id: number }) => adjudicator.id % (r + 2760)
  return value(a) > value(b) ? 1 : -1
}

export function filterByStrength(
  _square: AllocationGroup,
  a: AdjudicatorFilterEntity,
  b: AdjudicatorFilterEntity,
  { compiled_adjudicator_results, config }: Pick<
    AdjudicatorFilterContext,
    'compiled_adjudicator_results' | 'config'
  >
): number {
  const preevWeights = config?.preev_weights ?? []
  const aScore = evaluateAdjudicator(a, compiled_adjudicator_results, preevWeights)
  const bScore = evaluateAdjudicator(b, compiled_adjudicator_results, preevWeights)
  if (aScore < bScore) return 1
  if (aScore > bScore) return -1
  return 0
}

export function filterByBubble(
  _square: AllocationGroup,
  _a: AdjudicatorFilterEntity,
  _b: AdjudicatorFilterEntity,
  _ctx: unknown
): number {
  return 0
}

export function filterByAttendance(
  _square: AllocationGroup,
  a: AdjudicatorFilterEntity,
  b: AdjudicatorFilterEntity,
  { compiled_adjudicator_results }: Pick<AdjudicatorFilterContext, 'compiled_adjudicator_results'>
): number {
  const getResult = (id: number) => findOne(compiled_adjudicator_results, id)
  const aActive = getResult(a.id).active_num
  const bActive = getResult(b.id).active_num
  if (aActive > bActive) return 1
  if (aActive < bActive) return -1
  return 0
}

export function filterByPast(
  adjudicator: AdjudicatorFilterEntity,
  g1: AllocationGroup,
  g2: AllocationGroup,
  { compiled_adjudicator_results }: Pick<AdjudicatorFilterContext, 'compiled_adjudicator_results'>
): number {
  const getResult = (id: number) => findOne(compiled_adjudicator_results, id)
  const g1Watched = countCommon(g1.teams, getResult(adjudicator.id).judged_teams ?? [])
  const g2Watched = countCommon(g2.teams, getResult(adjudicator.id).judged_teams ?? [])
  if (g1Watched > g2Watched) return 1
  if (g1Watched < g2Watched) return -1
  return 0
}

export function filterByInstitution(
  adjudicator: AdjudicatorFilterEntity,
  g1: AllocationGroup,
  g2: AllocationGroup,
  { teams, r, config }: Pick<AdjudicatorFilterContext, 'teams' | 'r' | 'config'>
): number {
  const g1Institutions = g1.teams.flatMap((teamId) =>
    toNumberArray(findAndAccessDetail(teams, teamId, r).institutions)
  )
  const g2Institutions = g2.teams.flatMap((teamId) =>
    toNumberArray(findAndAccessDetail(teams, teamId, r).institutions)
  )
  const adjudicatorInstitutions = toNumberArray(accessDetail(adjudicator, r).institutions)
  const priorityMap = normalizeInstitutionPriorityMap(config?.institution_priority_map)
  if (Object.keys(priorityMap).length > 0) {
    const g1Histogram = buildInstitutionPriorityHistogram(
      g1Institutions,
      adjudicatorInstitutions ?? [],
      priorityMap
    )
    const g2Histogram = buildInstitutionPriorityHistogram(
      g2Institutions,
      adjudicatorInstitutions ?? [],
      priorityMap
    )
    return compareInstitutionPriorityHistograms(g1Histogram, g2Histogram)
  }
  const g1Conflict = countCommon(g1Institutions, adjudicatorInstitutions ?? [])
  const g2Conflict = countCommon(g2Institutions, adjudicatorInstitutions ?? [])
  if (g1Conflict > g2Conflict) return 1
  if (g1Conflict < g2Conflict) return -1
  return 0
}

export function filterByConflict(
  adjudicator: AdjudicatorFilterEntity,
  g1: AllocationGroup,
  g2: AllocationGroup,
  { r }: Pick<AdjudicatorFilterContext, 'r'>
): number {
  const conflicts = (accessDetail(adjudicator, r).conflicts ?? []) as number[]
  const g1Conflict = countCommon(g1.teams, conflicts)
  const g2Conflict = countCommon(g2.teams, conflicts)
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
