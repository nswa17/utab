import type { ConflictGroupCategory } from './allocation-warnings'

export const TEAM_BASELINE_SUPPORTED_FILTERS = [
  'by_strength',
  'by_side',
  'by_past_opponent',
  'by_conflict_group',
  'by_sibling_past_opponent_school',
] as const

export type TeamBaselineSupportedFilter =
  (typeof TEAM_BASELINE_SUPPORTED_FILTERS)[number]

export type TeamWarningBaselineEntry = {
  filter: TeamBaselineSupportedFilter
  count: number
}

export type TeamWarningBaselineResult =
  | {
      status: 'ready'
      mode: 'exact' | 'estimated'
      entries: TeamWarningBaselineEntry[]
      ignoredFilters: string[]
      pairedTeamCount: number
      unpairedTeamCount: number
    }
  | {
      status: 'unavailable'
      reason: 'requires_two_team_style' | 'not_enough_teams' | 'no_supported_filters'
      ignoredFilters: string[]
      pairedTeamCount: number
      unpairedTeamCount: number
    }

export type EstimateTeamWarningBaselineInput = {
  teamIds: string[]
  teamNum: number
  filterOrder: string[]
  teamWin: (teamId: string) => number | undefined
  teamPastOpponents: (teamId: string) => string[]
  teamPastSides: (teamId: string) => string[]
  teamInstitutions: (teamId: string) => string[]
  institutionCategory: (institutionId: string) => ConflictGroupCategory
  exactTeamThreshold?: number
}

type TeamProfile = {
  win: number | null
  pastOpponents: string[]
  pastSides: string[]
  institutions: string[]
}

type PairPlan = {
  scalarCost: number
  counts: Record<TeamBaselineSupportedFilter, number>
}

const conflictCategoryOrder: ConflictGroupCategory[] = ['institution', 'region', 'league']
const DEFAULT_EXACT_TEAM_THRESHOLD = 18

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

function checkSided(pastSides: string[], side: 'gov' | 'opp') {
  const sides = normalizeIdList([...pastSides, side])
  const govCount = sides.filter((value) => value === 'gov').length
  const oppCount = sides.filter((value) => value === 'opp').length
  return Math.abs(govCount - oppCount) > 1
}

function firstSetBitIndex(mask: number) {
  let index = 0
  let remaining = mask
  while ((remaining & 1) === 0) {
    remaining >>>= 1
    index += 1
  }
  return index
}

function bitCount(mask: number) {
  let remaining = mask
  let count = 0
  while (remaining !== 0) {
    remaining &= remaining - 1
    count += 1
  }
  return count
}

function compareCosts(left: number, right: number) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function dedupeSupportedFilters(filterOrder: string[]) {
  const supported = new Set<TeamBaselineSupportedFilter>(TEAM_BASELINE_SUPPORTED_FILTERS)
  const active: TeamBaselineSupportedFilter[] = []
  const ignored: string[] = []
  filterOrder.forEach((filter) => {
    if (typeof filter !== 'string') return
    if (supported.has(filter as TeamBaselineSupportedFilter)) {
      if (!active.includes(filter as TeamBaselineSupportedFilter)) {
        active.push(filter as TeamBaselineSupportedFilter)
      }
      return
    }
    if (!ignored.includes(filter)) ignored.push(filter)
  })
  return { active, ignored }
}

function buildLexWeights(
  supportedFilters: TeamBaselineSupportedFilter[],
  pairPlans: PairPlan[][],
  pairCount: number
) {
  const maxTotals = supportedFilters.map((filter) => {
    let maxPairCost = 0
    for (let left = 0; left < pairPlans.length; left += 1) {
      for (let right = left + 1; right < pairPlans.length; right += 1) {
        const pairCost = pairPlans[left]?.[right]?.counts?.[filter] ?? 0
        if (pairCost > maxPairCost) maxPairCost = pairCost
      }
    }
    return maxPairCost * pairCount
  })

  const weights = new Array<number>(supportedFilters.length).fill(1)
  for (let index = supportedFilters.length - 2; index >= 0; index -= 1) {
    weights[index] = weights[index + 1] * (maxTotals[index + 1] + 1)
  }
  return weights
}

function pairKey(left: number, right: number) {
  return left < right ? [left, right] : [right, left]
}

function sumMatchingCounts(
  pairs: Array<[number, number]>,
  pairPlans: PairPlan[][],
  supportedFilters: TeamBaselineSupportedFilter[]
) {
  const totals = new Map<TeamBaselineSupportedFilter, number>()
  supportedFilters.forEach((filter) => totals.set(filter, 0))
  pairs.forEach(([left, right]) => {
    const [a, b] = pairKey(left, right)
    const plan = pairPlans[a][b]
    supportedFilters.forEach((filter) => {
      totals.set(filter, (totals.get(filter) ?? 0) + (plan?.counts?.[filter] ?? 0))
    })
  })
  return supportedFilters.map((filter) => ({
    filter,
    count: totals.get(filter) ?? 0,
  }))
}

function sumMatchingScalar(pairs: Array<[number, number]>, pairPlans: PairPlan[][]) {
  return pairs.reduce((sum, [left, right]) => {
    const [a, b] = pairKey(left, right)
    return sum + (pairPlans[a][b]?.scalarCost ?? 0)
  }, 0)
}

function buildSeedOrders(
  teamIds: string[],
  getProfile: (teamId: string) => TeamProfile,
  filterOrder: string[]
) {
  const baseIndexes = teamIds.map((_, index) => index)
  const stableCompare = (left: number, right: number) => {
    const idDiff = teamIds[left].localeCompare(teamIds[right], ['ja', 'en'], {
      numeric: true,
      sensitivity: 'base',
    })
    return idDiff !== 0 ? idDiff : left - right
  }
  const hashSeed = filterOrder.join('|')
  const hash = (value: string) => {
    let acc = 2166136261
    const input = `${hashSeed}:${value}`
    for (let index = 0; index < input.length; index += 1) {
      acc ^= input.charCodeAt(index)
      acc = Math.imul(acc, 16777619)
    }
    return acc >>> 0
  }

  const orders: number[][] = []
  const pushOrder = (indexes: number[]) => {
    const key = indexes.join(',')
    if (orders.some((order) => order.join(',') === key)) return
    orders.push(indexes)
  }

  pushOrder([...baseIndexes])
  pushOrder(
    [...baseIndexes].sort((left, right) => {
      const leftWin = getProfile(teamIds[left]).win ?? Number.NEGATIVE_INFINITY
      const rightWin = getProfile(teamIds[right]).win ?? Number.NEGATIVE_INFINITY
      if (leftWin !== rightWin) return rightWin - leftWin
      return stableCompare(left, right)
    })
  )
  pushOrder(
    [...baseIndexes].sort((left, right) => {
      const leftWin = getProfile(teamIds[left]).win ?? Number.NEGATIVE_INFINITY
      const rightWin = getProfile(teamIds[right]).win ?? Number.NEGATIVE_INFINITY
      if (leftWin !== rightWin) return leftWin - rightWin
      return stableCompare(left, right)
    })
  )
  pushOrder(
    [...baseIndexes].sort((left, right) => {
      const leftPastCount = getProfile(teamIds[left]).pastOpponents.length
      const rightPastCount = getProfile(teamIds[right]).pastOpponents.length
      if (leftPastCount !== rightPastCount) return rightPastCount - leftPastCount
      return stableCompare(left, right)
    })
  )
  pushOrder(
    [...baseIndexes].sort((left, right) => {
      const leftInstCount = getProfile(teamIds[left]).institutions.length
      const rightInstCount = getProfile(teamIds[right]).institutions.length
      if (leftInstCount !== rightInstCount) return rightInstCount - leftInstCount
      return stableCompare(left, right)
    })
  )
  pushOrder(
    [...baseIndexes].sort((left, right) => {
      const leftHash = hash(`a:${teamIds[left]}`)
      const rightHash = hash(`a:${teamIds[right]}`)
      if (leftHash !== rightHash) return leftHash - rightHash
      return stableCompare(left, right)
    })
  )
  pushOrder(
    [...baseIndexes].sort((left, right) => {
      const leftHash = hash(`b:${teamIds[left]}`)
      const rightHash = hash(`b:${teamIds[right]}`)
      if (leftHash !== rightHash) return leftHash - rightHash
      return stableCompare(left, right)
    })
  )

  return orders
}

function buildGreedyMatching(
  order: number[],
  pairPlans: PairPlan[][],
  skippedIndex: number | null
) {
  const available = new Set<number>(order)
  if (skippedIndex !== null) available.delete(skippedIndex)
  const pairs: Array<[number, number]> = []

  order.forEach((index) => {
    if (!available.has(index)) return
    available.delete(index)
    let bestPartner = -1
    let bestCost = Number.POSITIVE_INFINITY
    available.forEach((candidate) => {
      const [left, right] = pairKey(index, candidate)
      const nextCost = pairPlans[left][right]?.scalarCost ?? Number.POSITIVE_INFINITY
      if (compareCosts(nextCost, bestCost) < 0) {
        bestCost = nextCost
        bestPartner = candidate
      }
    })
    if (bestPartner === -1) return
    available.delete(bestPartner)
    pairs.push([index, bestPartner])
  })

  return { pairs, skippedIndex }
}

function improveMatching(
  initialPairs: Array<[number, number]>,
  initialSkippedIndex: number | null,
  pairPlans: PairPlan[][]
) {
  const pairs = initialPairs.map((pair) => [...pair] as [number, number])
  let skippedIndex = initialSkippedIndex
  let iterations = 0
  const iterationLimit = Math.max(8, pairs.length * 4)

  while (iterations < iterationLimit) {
    let improved = false

    outer: for (let leftIndex = 0; leftIndex < pairs.length; leftIndex += 1) {
      const [a, b] = pairs[leftIndex]
      const currentLeftCost = pairPlans[pairKey(a, b)[0]][pairKey(a, b)[1]].scalarCost

      for (let rightIndex = leftIndex + 1; rightIndex < pairs.length; rightIndex += 1) {
        const [c, d] = pairs[rightIndex]
        const currentRightCost = pairPlans[pairKey(c, d)[0]][pairKey(c, d)[1]].scalarCost
        const currentCost = currentLeftCost + currentRightCost

        const altOne =
          pairPlans[pairKey(a, c)[0]][pairKey(a, c)[1]].scalarCost +
          pairPlans[pairKey(b, d)[0]][pairKey(b, d)[1]].scalarCost
        const altTwo =
          pairPlans[pairKey(a, d)[0]][pairKey(a, d)[1]].scalarCost +
          pairPlans[pairKey(b, c)[0]][pairKey(b, c)[1]].scalarCost

        if (compareCosts(altOne, currentCost) < 0 && compareCosts(altOne, altTwo) <= 0) {
          pairs[leftIndex] = [a, c]
          pairs[rightIndex] = [b, d]
          improved = true
          break outer
        }
        if (compareCosts(altTwo, currentCost) < 0) {
          pairs[leftIndex] = [a, d]
          pairs[rightIndex] = [b, c]
          improved = true
          break outer
        }
      }
    }

    if (improved) {
      iterations += 1
      continue
    }

    if (skippedIndex !== null) {
      outerSkip: for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
        const [a, b] = pairs[pairIndex]
        const currentCost = pairPlans[pairKey(a, b)[0]][pairKey(a, b)[1]].scalarCost
        const altWithA = pairPlans[pairKey(skippedIndex, a)[0]][pairKey(skippedIndex, a)[1]].scalarCost
        const altWithB = pairPlans[pairKey(skippedIndex, b)[0]][pairKey(skippedIndex, b)[1]].scalarCost

        if (compareCosts(altWithA, currentCost) < 0 && compareCosts(altWithA, altWithB) <= 0) {
          pairs[pairIndex] = [skippedIndex, a]
          skippedIndex = b
          improved = true
          break outerSkip
        }
        if (compareCosts(altWithB, currentCost) < 0) {
          pairs[pairIndex] = [skippedIndex, b]
          skippedIndex = a
          improved = true
          break outerSkip
        }
      }
    }

    if (!improved) break
    iterations += 1
  }

  return { pairs, skippedIndex }
}

function solveExactMatching(pairPlans: PairPlan[][], teamCount: number) {
  const fullMask = (1 << teamCount) - 1
  const memo = new Float64Array(1 << teamCount)
  memo.fill(Number.NaN)
  const choices = new Int16Array(1 << teamCount)
  choices.fill(-2)

  const solve = (mask: number): number => {
    if (mask === 0) return 0
    const cached = memo[mask]
    if (!Number.isNaN(cached)) return cached

    const first = firstSetBitIndex(mask)
    const withoutFirst = mask & ~(1 << first)
    let bestCost = Number.POSITIVE_INFINITY
    let bestChoice = -1

    if (bitCount(mask) % 2 === 1) {
      bestCost = solve(withoutFirst)
      bestChoice = -1
    }

    for (let candidate = first + 1; candidate < teamCount; candidate += 1) {
      if ((withoutFirst & (1 << candidate)) === 0) continue
      const nextMask = withoutFirst & ~(1 << candidate)
      const [left, right] = pairKey(first, candidate)
      const nextCost = pairPlans[left][right].scalarCost + solve(nextMask)
      if (compareCosts(nextCost, bestCost) < 0) {
        bestCost = nextCost
        bestChoice = candidate
      }
    }

    memo[mask] = bestCost
    choices[mask] = bestChoice
    return bestCost
  }

  solve(fullMask)

  const pairs: Array<[number, number]> = []
  let skippedIndex: number | null = null
  let mask = fullMask
  while (mask !== 0) {
    const first = firstSetBitIndex(mask)
    const choice = choices[mask]
    mask &= ~(1 << first)
    if (choice === -1) {
      skippedIndex = first
      continue
    }
    pairs.push([first, choice])
    mask &= ~(1 << choice)
  }

  return { pairs, skippedIndex }
}

export function estimateTeamWarningBaseline(
  input: EstimateTeamWarningBaselineInput
): TeamWarningBaselineResult {
  const normalizedTeamIds = normalizeIdList(input.teamIds)
  const { active: supportedFilters, ignored: ignoredFilters } = dedupeSupportedFilters(
    input.filterOrder
  )
  const unpairedTeamCount = normalizedTeamIds.length % 2
  const pairedTeamCount = normalizedTeamIds.length - unpairedTeamCount

  if (input.teamNum !== 2) {
    return {
      status: 'unavailable',
      reason: 'requires_two_team_style',
      ignoredFilters,
      pairedTeamCount: 0,
      unpairedTeamCount: normalizedTeamIds.length,
    }
  }
  if (normalizedTeamIds.length < 2) {
    return {
      status: 'unavailable',
      reason: 'not_enough_teams',
      ignoredFilters,
      pairedTeamCount: 0,
      unpairedTeamCount: normalizedTeamIds.length,
    }
  }
  if (supportedFilters.length === 0) {
    return {
      status: 'unavailable',
      reason: 'no_supported_filters',
      ignoredFilters,
      pairedTeamCount,
      unpairedTeamCount,
    }
  }

  const profileCache = new Map<string, TeamProfile>()
  const getProfile = (teamId: string): TeamProfile => {
    const normalizedId = String(teamId ?? '').trim()
    const cached = profileCache.get(normalizedId)
    if (cached) return cached
    const winValue = Number(input.teamWin(normalizedId))
    const profile: TeamProfile = {
      win: Number.isFinite(winValue) ? winValue : null,
      pastOpponents: normalizeIdList(input.teamPastOpponents(normalizedId)),
      pastSides: normalizeIdList(input.teamPastSides(normalizedId)),
      institutions: normalizeIdList(input.teamInstitutions(normalizedId)),
    }
    profileCache.set(normalizedId, profile)
    return profile
  }

  const pairPlans = normalizedTeamIds.map(() => new Array<PairPlan>(normalizedTeamIds.length))
  const pairCount = Math.floor(normalizedTeamIds.length / 2)

  for (let left = 0; left < normalizedTeamIds.length; left += 1) {
    const leftId = normalizedTeamIds[left]
    const leftProfile = getProfile(leftId)
    for (let right = left + 1; right < normalizedTeamIds.length; right += 1) {
      const rightId = normalizedTeamIds[right]
      const rightProfile = getProfile(rightId)

      const counts: Record<TeamBaselineSupportedFilter, number> = {
        by_strength:
          leftProfile.win !== null &&
          rightProfile.win !== null &&
          leftProfile.win !== rightProfile.win
            ? 1
            : 0,
        by_side: 0,
        by_past_opponent:
          leftProfile.pastOpponents.includes(rightId) || rightProfile.pastOpponents.includes(leftId)
            ? 1
            : 0,
        by_conflict_group: overlapConflictCategories(
          leftProfile.institutions,
          rightProfile.institutions,
          input.institutionCategory
        ).length,
        by_sibling_past_opponent_school: 0,
      }

      const sameInstitutionPastCategories = new Set<ConflictGroupCategory>()
      leftProfile.pastOpponents
        .filter((pastTeamId) => pastTeamId !== rightId)
        .forEach((pastTeamId) => {
          overlapConflictCategories(
            getProfile(pastTeamId).institutions,
            rightProfile.institutions,
            input.institutionCategory
          ).forEach((category) => sameInstitutionPastCategories.add(category))
        })
      rightProfile.pastOpponents
        .filter((pastTeamId) => pastTeamId !== leftId)
        .forEach((pastTeamId) => {
          overlapConflictCategories(
            getProfile(pastTeamId).institutions,
            leftProfile.institutions,
            input.institutionCategory
          ).forEach((category) => sameInstitutionPastCategories.add(category))
        })
      counts.by_sibling_past_opponent_school = conflictCategoryOrder.filter((category) =>
        sameInstitutionPastCategories.has(category)
      ).length

      const sideForward =
        (checkSided(leftProfile.pastSides, 'gov') ? 1 : 0) +
        (checkSided(rightProfile.pastSides, 'opp') ? 1 : 0)
      const sideReverse =
        (checkSided(leftProfile.pastSides, 'opp') ? 1 : 0) +
        (checkSided(rightProfile.pastSides, 'gov') ? 1 : 0)
      counts.by_side = Math.min(sideForward, sideReverse)

      pairPlans[left][right] = {
        scalarCost: 0,
        counts,
      }
    }
  }

  const weights = buildLexWeights(supportedFilters, pairPlans, pairCount)

  for (let left = 0; left < normalizedTeamIds.length; left += 1) {
    for (let right = left + 1; right < normalizedTeamIds.length; right += 1) {
      const plan = pairPlans[left][right]
      if (!plan) continue
      plan.scalarCost = supportedFilters.reduce((sum, filter, index) => {
        return sum + (plan.counts[filter] ?? 0) * weights[index]
      }, 0)
    }
  }

  const exactTeamThreshold = Math.max(2, Number(input.exactTeamThreshold ?? DEFAULT_EXACT_TEAM_THRESHOLD))
  const useExact = normalizedTeamIds.length <= exactTeamThreshold

  const solved = useExact
    ? solveExactMatching(pairPlans, normalizedTeamIds.length)
    : (() => {
        const orders = buildSeedOrders(normalizedTeamIds, getProfile, supportedFilters)
        const skipCandidates =
          normalizedTeamIds.length % 2 === 1
            ? normalizedTeamIds.map((_, index) => index)
            : [null]
        let bestPairs: Array<[number, number]> = []
        let bestSkippedIndex: number | null = normalizedTeamIds.length % 2 === 1 ? 0 : null
        let bestCost = Number.POSITIVE_INFINITY

        orders.forEach((order) => {
          skipCandidates.forEach((skipCandidate) => {
            const greedy = buildGreedyMatching(order, pairPlans, skipCandidate)
            const improved = improveMatching(greedy.pairs, greedy.skippedIndex, pairPlans)
            const nextCost = sumMatchingScalar(improved.pairs, pairPlans)
            if (compareCosts(nextCost, bestCost) < 0) {
              bestCost = nextCost
              bestPairs = improved.pairs
              bestSkippedIndex = improved.skippedIndex
            }
          })
        })

        return { pairs: bestPairs, skippedIndex: bestSkippedIndex }
      })()

  return {
    status: 'ready',
    mode: useExact ? 'exact' : 'estimated',
    entries: sumMatchingCounts(solved.pairs, pairPlans, supportedFilters),
    ignoredFilters,
    pairedTeamCount,
    unpairedTeamCount: solved.skippedIndex === null ? 0 : 1,
  }
}
