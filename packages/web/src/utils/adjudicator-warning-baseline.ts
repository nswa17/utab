import type { ConflictGroupCategory } from './allocation-warnings'

export const ADJUDICATOR_BASELINE_SUPPORTED_FILTERS = [
  'by_conflict_team',
  'by_conflict_group',
  'by_past',
] as const

export type AdjudicatorBaselineSupportedFilter =
  (typeof ADJUDICATOR_BASELINE_SUPPORTED_FILTERS)[number]

export type AdjudicatorWarningBaselineEntry = {
  filter: AdjudicatorBaselineSupportedFilter
  count: number
}

export type AdjudicatorWarningBaselineResult =
  | {
      status: 'ready'
      mode: 'exact'
      entries: AdjudicatorWarningBaselineEntry[]
      ignoredFilters: string[]
      slotCount: number
      availableAdjudicatorCount: number
    }
  | {
      status: 'unavailable'
      reason: 'not_enough_rows' | 'not_enough_adjudicators' | 'no_supported_filters'
      ignoredFilters: string[]
      slotCount: number
      availableAdjudicatorCount: number
    }

export type EstimateAdjudicatorWarningBaselineInput = {
  rows: Array<{
    teamIds: string[]
    slotCount: number
  }>
  adjudicatorIds: string[]
  filterOrder: string[]
  teamInstitutions: (teamId: string) => string[]
  adjudicatorInstitutions: (adjudicatorId: string) => string[]
  adjudicatorConflicts: (adjudicatorId: string) => string[]
  adjudicatorJudgedTeams: (adjudicatorId: string) => string[]
  institutionCategory: (institutionId: string) => ConflictGroupCategory
}

type Slot = {
  teamIds: string[]
}

type SlotCost = {
  scalarCost: number
  counts: Record<AdjudicatorBaselineSupportedFilter, number>
}

const conflictCategoryOrder: ConflictGroupCategory[] = ['institution', 'region', 'league']

function normalizeIdList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const out: string[] = []
  values.forEach((value) => {
    const normalized = String(value ?? '').trim()
    if (!normalized || out.includes(normalized)) return
    out.push(normalized)
  })
  return out
}

function normalizeConflictGroupCategory(value: unknown): ConflictGroupCategory {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'region') return 'region'
  if (normalized === 'league') return 'league'
  return 'institution'
}

function overlapConflictCategories(
  left: string[],
  right: string[],
  categoryOf: (institutionId: string) => ConflictGroupCategory
): ConflictGroupCategory[] {
  if (left.length === 0 || right.length === 0) return []
  const rightSet = new Set(right)
  const overlaps = new Set<ConflictGroupCategory>()
  left.forEach((institutionId) => {
    if (!rightSet.has(institutionId)) return
    overlaps.add(normalizeConflictGroupCategory(categoryOf(institutionId)))
  })
  return conflictCategoryOrder.filter((category) => overlaps.has(category))
}

function compareCosts(left: number, right: number) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function dedupeSupportedFilters(filterOrder: string[]) {
  const supported = new Set<AdjudicatorBaselineSupportedFilter>(
    ADJUDICATOR_BASELINE_SUPPORTED_FILTERS
  )
  const active: AdjudicatorBaselineSupportedFilter[] = []
  const ignored: string[] = []
  filterOrder.forEach((filter) => {
    if (typeof filter !== 'string') return
    if (supported.has(filter as AdjudicatorBaselineSupportedFilter)) {
      if (!active.includes(filter as AdjudicatorBaselineSupportedFilter)) {
        active.push(filter as AdjudicatorBaselineSupportedFilter)
      }
      return
    }
    if (!ignored.includes(filter)) ignored.push(filter)
  })
  return { active, ignored }
}

function buildLexWeights(
  supportedFilters: AdjudicatorBaselineSupportedFilter[],
  slotCosts: SlotCost[][],
  slotCount: number
) {
  const maxTotals = supportedFilters.map((filter) => {
    let maxSlotCost = 0
    for (let slotIndex = 0; slotIndex < slotCosts.length; slotIndex += 1) {
      for (let adjudicatorIndex = 0; adjudicatorIndex < (slotCosts[slotIndex]?.length ?? 0); adjudicatorIndex += 1) {
        const slotCost = slotCosts[slotIndex]?.[adjudicatorIndex]?.counts?.[filter] ?? 0
        if (slotCost > maxSlotCost) maxSlotCost = slotCost
      }
    }
    return maxSlotCost * slotCount
  })

  const weights = new Array<number>(supportedFilters.length).fill(1)
  for (let index = supportedFilters.length - 2; index >= 0; index -= 1) {
    weights[index] = weights[index + 1] * (maxTotals[index + 1] + 1)
  }
  return weights
}

function hungarian(cost: number[][]): number[] {
  const rowCount = cost.length
  const columnCount = cost[0]?.length ?? 0
  const u = new Array<number>(rowCount + 1).fill(0)
  const v = new Array<number>(columnCount + 1).fill(0)
  const p = new Array<number>(columnCount + 1).fill(0)
  const way = new Array<number>(columnCount + 1).fill(0)

  for (let row = 1; row <= rowCount; row += 1) {
    p[0] = row
    let column0 = 0
    const minv = new Array<number>(columnCount + 1).fill(Number.POSITIVE_INFINITY)
    const used = new Array<boolean>(columnCount + 1).fill(false)

    do {
      used[column0] = true
      const row0 = p[column0]
      let delta = Number.POSITIVE_INFINITY
      let column1 = 0

      for (let column = 1; column <= columnCount; column += 1) {
        if (used[column]) continue
        const cur = cost[row0 - 1][column - 1] - u[row0] - v[column]
        if (cur < minv[column]) {
          minv[column] = cur
          way[column] = column0
        }
        if (minv[column] < delta) {
          delta = minv[column]
          column1 = column
        }
      }

      for (let column = 0; column <= columnCount; column += 1) {
        if (used[column]) {
          u[p[column]] += delta
          v[column] -= delta
        } else {
          minv[column] -= delta
        }
      }
      column0 = column1
    } while (p[column0] !== 0)

    do {
      const column1 = way[column0]
      p[column0] = p[column1]
      column0 = column1
    } while (column0 !== 0)
  }

  const assignment = new Array<number>(rowCount).fill(-1)
  for (let column = 1; column <= columnCount; column += 1) {
    if (p[column] !== 0) assignment[p[column] - 1] = column - 1
  }
  return assignment
}

export function estimateAdjudicatorWarningBaseline(
  input: EstimateAdjudicatorWarningBaselineInput
): AdjudicatorWarningBaselineResult {
  const adjudicatorIds = normalizeIdList(input.adjudicatorIds)
  const { active: supportedFilters, ignored: ignoredFilters } = dedupeSupportedFilters(
    input.filterOrder
  )
  const slots: Slot[] = []

  input.rows.forEach((row) => {
    const teamIds = normalizeIdList(row.teamIds).slice(0, 2)
    const slotCount = Math.max(0, Number(row.slotCount) || 0)
    if (teamIds.length === 0 || slotCount <= 0) return
    for (let index = 0; index < slotCount; index += 1) {
      slots.push({ teamIds })
    }
  })

  if (slots.length === 0) {
    return {
      status: 'unavailable',
      reason: 'not_enough_rows',
      ignoredFilters,
      slotCount: 0,
      availableAdjudicatorCount: adjudicatorIds.length,
    }
  }
  if (supportedFilters.length === 0) {
    return {
      status: 'unavailable',
      reason: 'no_supported_filters',
      ignoredFilters,
      slotCount: slots.length,
      availableAdjudicatorCount: adjudicatorIds.length,
    }
  }
  if (adjudicatorIds.length < slots.length) {
    return {
      status: 'unavailable',
      reason: 'not_enough_adjudicators',
      ignoredFilters,
      slotCount: slots.length,
      availableAdjudicatorCount: adjudicatorIds.length,
    }
  }

  const teamInstitutionCache = new Map<string, string[]>()
  const adjudicatorInstitutionCache = new Map<string, string[]>()
  const adjudicatorConflictCache = new Map<string, string[]>()
  const adjudicatorJudgedCache = new Map<string, string[]>()

  const teamInstitutions = (teamId: string) => {
    const normalizedId = String(teamId ?? '').trim()
    const cached = teamInstitutionCache.get(normalizedId)
    if (cached) return cached
    const next = normalizeIdList(input.teamInstitutions(normalizedId))
    teamInstitutionCache.set(normalizedId, next)
    return next
  }

  const adjudicatorInstitutions = (adjudicatorId: string) => {
    const normalizedId = String(adjudicatorId ?? '').trim()
    const cached = adjudicatorInstitutionCache.get(normalizedId)
    if (cached) return cached
    const next = normalizeIdList(input.adjudicatorInstitutions(normalizedId))
    adjudicatorInstitutionCache.set(normalizedId, next)
    return next
  }

  const adjudicatorConflicts = (adjudicatorId: string) => {
    const normalizedId = String(adjudicatorId ?? '').trim()
    const cached = adjudicatorConflictCache.get(normalizedId)
    if (cached) return cached
    const next = normalizeIdList(input.adjudicatorConflicts(normalizedId))
    adjudicatorConflictCache.set(normalizedId, next)
    return next
  }

  const adjudicatorJudgedTeams = (adjudicatorId: string) => {
    const normalizedId = String(adjudicatorId ?? '').trim()
    const cached = adjudicatorJudgedCache.get(normalizedId)
    if (cached) return cached
    const next = normalizeIdList(input.adjudicatorJudgedTeams(normalizedId))
    adjudicatorJudgedCache.set(normalizedId, next)
    return next
  }

  const slotCosts = slots.map((slot) =>
    adjudicatorIds.map((adjudicatorId) => {
      const teamIds = slot.teamIds
      const adjudicatorInstitutionIds = adjudicatorInstitutions(adjudicatorId)
      const conflicts = new Set(adjudicatorConflicts(adjudicatorId))
      const judgedTeams = new Set(adjudicatorJudgedTeams(adjudicatorId))
      const counts: Record<AdjudicatorBaselineSupportedFilter, number> = {
        by_conflict_team: teamIds.filter((teamId) => conflicts.has(teamId)).length,
        by_conflict_group: teamIds.reduce((sum, teamId) => {
          return (
            sum +
            overlapConflictCategories(
              teamInstitutions(teamId),
              adjudicatorInstitutionIds,
              input.institutionCategory
            ).length
          )
        }, 0),
        by_past: teamIds.filter((teamId) => judgedTeams.has(teamId)).length,
      }
      return {
        scalarCost: 0,
        counts,
      }
    })
  )

  const weights = buildLexWeights(supportedFilters, slotCosts, slots.length)
  for (let slotIndex = 0; slotIndex < slotCosts.length; slotIndex += 1) {
    for (let adjudicatorIndex = 0; adjudicatorIndex < adjudicatorIds.length; adjudicatorIndex += 1) {
      const slotCost = slotCosts[slotIndex][adjudicatorIndex]
      slotCost.scalarCost = supportedFilters.reduce((sum, filter, index) => {
        return sum + (slotCost.counts[filter] ?? 0) * weights[index]
      }, 0)
    }
  }

  const assignment = hungarian(slotCosts.map((row) => row.map((item) => item.scalarCost)))
  const totals = new Map<AdjudicatorBaselineSupportedFilter, number>()
  supportedFilters.forEach((filter) => totals.set(filter, 0))

  assignment.forEach((adjudicatorIndex, slotIndex) => {
    const slotCost = slotCosts[slotIndex]?.[adjudicatorIndex]
    supportedFilters.forEach((filter) => {
      totals.set(filter, (totals.get(filter) ?? 0) + (slotCost?.counts?.[filter] ?? 0))
    })
  })

  return {
    status: 'ready',
    mode: 'exact',
    entries: supportedFilters.map((filter) => ({
      filter,
      count: totals.get(filter) ?? 0,
    })),
    ignoredFilters,
    slotCount: slots.length,
    availableAdjudicatorCount: adjudicatorIds.length,
  }
}
