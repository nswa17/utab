import { sortTeams, type CompiledTeamResult } from '../../general/sortings.js'
import { accessDetail, filterAvailable } from '../../general/tools.js'
import { decidePositions } from '../sys.js'
import type { AllocationConfig, Draw } from '../../types/allocations.js'
import type { TeamEntity } from '../../types/domain.js'
import type { TeamDrawAlgorithmOptions } from '../../types/options.js'

type SupportedFilter =
  | 'by_strength'
  | 'by_side'
  | 'by_past_opponent'
  | 'by_conflict_group'
  | 'by_sibling_past_opponent_school'

type TeamProfile = {
  institutions: number[]
  win: number
  pastOpponents: number[]
  pastSides: string[]
}

type PairPlan = {
  scalarCost: number
  orderedTeams: [number, number]
  counts: Record<SupportedFilter, number>
}

type SideOrderingDecision = {
  orderedTeams: [number, number]
  warningCount: number
}

const SUPPORTED_FILTERS: SupportedFilter[] = [
  'by_strength',
  'by_side',
  'by_past_opponent',
  'by_conflict_group',
  'by_sibling_past_opponent_school',
]
const DEFAULT_FILTERS: SupportedFilter[] = [
  'by_strength',
  'by_side',
  'by_past_opponent',
  'by_conflict_group',
]
const EXACT_TEAM_THRESHOLD = 18
const CONFLICT_CATEGORY_ORDER = ['institution', 'region', 'league'] as const

function makeBadRequest(message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number }
  err.status = 400
  return err
}

function uniqueNumbers(values: unknown): number[] {
  if (!Array.isArray(values)) return []
  const out: number[] = []
  values.forEach((value) => {
    if (typeof value !== 'number') return
    if (out.includes(value)) return
    out.push(value)
  })
  return out
}

function normalizeInstitutionCategory(value: unknown): string {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized.length > 0 ? normalized : 'institution'
}

function overlapConflictCategories(
  left: number[],
  right: number[],
  config: AllocationConfig
): string[] {
  if (left.length === 0 || right.length === 0) return []
  const rightSet = new Set<number>(right)
  const overlaps = new Set<string>()
  left.forEach((institutionId) => {
    if (!rightSet.has(institutionId)) return
    overlaps.add(normalizeInstitutionCategory(config.institution_category_map?.[institutionId]))
  })
  return CONFLICT_CATEGORY_ORDER.filter((category) => overlaps.has(category))
}

function checkSided(pastSides: string[], side: 'gov' | 'opp') {
  let govCount = 0
  let oppCount = 0
  pastSides.forEach((pastSide) => {
    if (pastSide === 'gov') govCount += 1
    if (pastSide === 'opp') oppCount += 1
  })
  if (side === 'gov') govCount += 1
  if (side === 'opp') oppCount += 1
  return Math.abs(govCount - oppCount) > 1
}

function compareCosts(left: number, right: number) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function pairKey(left: number, right: number) {
  return left < right ? [left, right] : [right, left]
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

function normalizeFilters(filters: unknown): SupportedFilter[] {
  if (!Array.isArray(filters)) return [...DEFAULT_FILTERS]
  const out: SupportedFilter[] = []
  filters.forEach((filter) => {
    if (typeof filter !== 'string') return
    if (!SUPPORTED_FILTERS.includes(filter as SupportedFilter)) return
    if (out.includes(filter as SupportedFilter)) return
    out.push(filter as SupportedFilter)
  })
  return out
}

function buildLexWeights(
  filters: SupportedFilter[],
  pairPlans: PairPlan[][],
  pairCount: number
) {
  const maxTotals = filters.map((filter) => {
    let maxPairCost = 0
    for (let left = 0; left < pairPlans.length; left += 1) {
      for (let right = left + 1; right < pairPlans.length; right += 1) {
        const pairCost = pairPlans[left]?.[right]?.counts?.[filter] ?? 0
        if (pairCost > maxPairCost) maxPairCost = pairCost
      }
    }
    return maxPairCost * pairCount
  })

  const weights = new Array<number>(filters.length).fill(1)
  for (let index = filters.length - 2; index >= 0; index -= 1) {
    weights[index] = weights[index + 1] * (maxTotals[index + 1] + 1)
  }
  return weights
}

function buildSeedOrders(
  teamIds: number[],
  getProfile: (teamId: number) => TeamProfile
) {
  const baseIndexes = teamIds.map((_teamId, index) => index)
  const stableCompare = (left: number, right: number) => teamIds[left] - teamIds[right]
  const hash = (value: number, salt: string) => {
    let acc = 2166136261
    const input = `${salt}:${value}`
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
      const leftWin = getProfile(teamIds[left]).win
      const rightWin = getProfile(teamIds[right]).win
      if (leftWin !== rightWin) return rightWin - leftWin
      return stableCompare(left, right)
    })
  )
  pushOrder(
    [...baseIndexes].sort((left, right) => {
      const leftPast = getProfile(teamIds[left]).pastOpponents.length
      const rightPast = getProfile(teamIds[right]).pastOpponents.length
      if (leftPast !== rightPast) return rightPast - leftPast
      return stableCompare(left, right)
    })
  )
  pushOrder(
    [...baseIndexes].sort((left, right) => {
      const leftInstitutions = getProfile(teamIds[left]).institutions.length
      const rightInstitutions = getProfile(teamIds[right]).institutions.length
      if (leftInstitutions !== rightInstitutions) return rightInstitutions - leftInstitutions
      return stableCompare(left, right)
    })
  )
  pushOrder(
    [...baseIndexes].sort((left, right) => {
      const leftHash = hash(teamIds[left], 'a')
      const rightHash = hash(teamIds[right], 'a')
      if (leftHash !== rightHash) return leftHash - rightHash
      return stableCompare(left, right)
    })
  )
  pushOrder(
    [...baseIndexes].sort((left, right) => {
      const leftHash = hash(teamIds[left], 'b')
      const rightHash = hash(teamIds[right], 'b')
      if (leftHash !== rightHash) return leftHash - rightHash
      return stableCompare(left, right)
    })
  )

  return orders
}

function buildGreedyMatching(order: number[], pairPlans: PairPlan[][]) {
  const available = new Set<number>(order)
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

  return pairs
}

function improveMatching(initialPairs: Array<[number, number]>, pairPlans: PairPlan[][]) {
  const pairs = initialPairs.map((pair) => [...pair] as [number, number])
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

    if (!improved) break
    iterations += 1
  }

  return pairs
}

function solveExactMatching(pairPlans: PairPlan[][], teamCount: number) {
  const fullMask = (1 << teamCount) - 1
  const memo = new Float64Array(1 << teamCount)
  memo.fill(Number.NaN)
  const choices = new Int16Array(1 << teamCount)
  choices.fill(-1)

  const solve = (mask: number): number => {
    if (mask === 0) return 0
    const cached = memo[mask]
    if (!Number.isNaN(cached)) return cached

    const first = firstSetBitIndex(mask)
    const withoutFirst = mask & ~(1 << first)
    let bestCost = Number.POSITIVE_INFINITY
    let bestChoice = -1

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
  let mask = fullMask
  while (mask !== 0) {
    const first = firstSetBitIndex(mask)
    const choice = choices[mask]
    mask &= ~(1 << first)
    pairs.push([first, choice])
    mask &= ~(1 << choice)
  }
  return pairs
}

function pairWarningCounts(
  teamAId: number,
  teamBId: number,
  getProfile: (teamId: number) => TeamProfile,
  teamById: Map<number, TeamEntity>,
  config: AllocationConfig
) {
  const teamA = getProfile(teamAId)
  const teamB = getProfile(teamBId)
  const counts: Record<SupportedFilter, number> = {
    by_strength: teamA.win !== teamB.win ? 1 : 0,
    by_side: 0,
    by_past_opponent:
      teamA.pastOpponents.includes(teamBId) || teamB.pastOpponents.includes(teamAId) ? 1 : 0,
    by_conflict_group: overlapConflictCategories(teamA.institutions, teamB.institutions, config).length,
    by_sibling_past_opponent_school: 0,
  }

  const siblingPastCategories = new Set<string>()
  teamA.pastOpponents
    .filter((pastTeamId) => pastTeamId !== teamBId)
    .forEach((pastTeamId) => {
      siblingPastCategoriesForPair(
        pastTeamId,
        teamBId,
        teamById,
        getProfile,
        config
      ).forEach((category) => siblingPastCategories.add(category))
    })
  teamB.pastOpponents
    .filter((pastTeamId) => pastTeamId !== teamAId)
    .forEach((pastTeamId) => {
      siblingPastCategoriesForPair(
        pastTeamId,
        teamAId,
        teamById,
        getProfile,
        config
      ).forEach((category) => siblingPastCategories.add(category))
    })
  counts.by_sibling_past_opponent_school = CONFLICT_CATEGORY_ORDER.filter((category) =>
    siblingPastCategories.has(category)
  ).length

  return counts
}

function siblingPastCategoriesForPair(
  pastTeamId: number,
  currentOpponentId: number,
  teamById: Map<number, TeamEntity>,
  getProfile: (teamId: number) => TeamProfile,
  config: AllocationConfig
) {
  const pastTeam = teamById.get(pastTeamId)
  const currentOpponent = teamById.get(currentOpponentId)
  if (!pastTeam || !currentOpponent) return []
  return overlapConflictCategories(
    getProfile(pastTeam.id).institutions,
    getProfile(currentOpponent.id).institutions,
    config
  )
}

function sideOrderingForPair(
  leftId: number,
  rightId: number,
  getProfile: (teamId: number) => TeamProfile,
  compiledTeamResults: CompiledTeamResult[],
  config: AllocationConfig,
  filters: SupportedFilter[]
): SideOrderingDecision {
  const defaultOrder = decidePositions([leftId, rightId], compiledTeamResults, config) as [number, number]
  const leftProfile = getProfile(leftId)
  const rightProfile = getProfile(rightId)
  const forwardCount =
    (checkSided(leftProfile.pastSides, 'gov') ? 1 : 0) +
    (checkSided(rightProfile.pastSides, 'opp') ? 1 : 0)
  const reverseCount =
    (checkSided(leftProfile.pastSides, 'opp') ? 1 : 0) +
    (checkSided(rightProfile.pastSides, 'gov') ? 1 : 0)

  if (!filters.includes('by_side')) {
    const isReverse = defaultOrder[0] === rightId
    return {
      orderedTeams: defaultOrder,
      warningCount: isReverse ? reverseCount : forwardCount,
    }
  }
  if (reverseCount < forwardCount) {
    return { orderedTeams: [rightId, leftId], warningCount: reverseCount }
  }
  if (forwardCount < reverseCount) {
    return { orderedTeams: [leftId, rightId], warningCount: forwardCount }
  }
  const isReverse = defaultOrder[0] === rightId
  return {
    orderedTeams: defaultOrder,
    warningCount: isReverse ? reverseCount : forwardCount,
  }
}

function buildAllocation(
  pairs: Array<[number, number]>,
  pairPlans: PairPlan[][],
  compiledTeamResults: CompiledTeamResult[]
): Draw['allocation'] {
  const resultById = new Map<number, CompiledTeamResult>(
    compiledTeamResults.map((result) => [Number(result.id), result])
  )
  const rows = pairs.map(([leftIndex, rightIndex]) => {
    const [left, right] = pairKey(leftIndex, rightIndex)
    const orderedTeams = pairPlans[left][right].orderedTeams
    const leftResult = resultById.get(orderedTeams[0])
    const rightResult = resultById.get(orderedTeams[1])
    const topWin = Math.max(Number(leftResult?.win ?? 0), Number(rightResult?.win ?? 0))
    const totalWin = Number(leftResult?.win ?? 0) + Number(rightResult?.win ?? 0)
    const totalSum = Number(leftResult?.sum ?? 0) + Number(rightResult?.sum ?? 0)
    return { orderedTeams, topWin, totalWin, totalSum }
  })

  rows.sort((left, right) => {
    if (left.topWin !== right.topWin) return right.topWin - left.topWin
    if (left.totalWin !== right.totalWin) return right.totalWin - left.totalWin
    if (left.totalSum !== right.totalSum) return right.totalSum - left.totalSum
    if (left.orderedTeams[0] !== right.orderedTeams[0]) return left.orderedTeams[0] - right.orderedTeams[0]
    return left.orderedTeams[1] - right.orderedTeams[1]
  })

  return rows.map((row, index) => ({
    id: index,
    teams: [...row.orderedTeams],
    chairs: [],
    panels: [],
    trainees: [],
    venue: null,
  }))
}

export function getTeamDrawMinWarnings(
  r: number,
  teams: TeamEntity[],
  compiledTeamResults: CompiledTeamResult[],
  options: TeamDrawAlgorithmOptions = {},
  config: AllocationConfig
): Draw {
  if (config.style.team_num !== 2) {
    throw makeBadRequest('min_warnings supports only 2-team formats')
  }

  const filters = normalizeFilters(options.filters)
  if (filters.length === 0) {
    throw makeBadRequest('min_warnings requires at least one warning-based team filter')
  }

  const availableTeams = sortTeams(filterAvailable(teams, r), compiledTeamResults)
  if (availableTeams.length === 0) return { r, allocation: [] }
  if (availableTeams.length % config.style.team_num !== 0) {
    throw makeBadRequest('min_warnings requires an even number of available teams')
  }

  const teamIds = availableTeams.map((team) => team.id)
  const teamById = new Map<number, TeamEntity>(teams.map((team) => [team.id, team]))
  const resultById = new Map<number, CompiledTeamResult>(
    compiledTeamResults.map((result) => [Number(result.id), result])
  )
  const profileCache = new Map<number, TeamProfile>()
  const getProfile = (teamId: number): TeamProfile => {
    const cached = profileCache.get(teamId)
    if (cached) return cached
    const team = teamById.get(teamId)
    if (!team) throw new Error(`Unknown team ${teamId}`)
    const result = resultById.get(teamId)
    const profile: TeamProfile = {
      institutions: uniqueNumbers(accessDetail(team, r).conflicts),
      win: Number(result?.win ?? 0),
      pastOpponents: Array.isArray(result?.past_opponents) ? result.past_opponents : [],
      pastSides: Array.isArray(result?.past_sides) ? result.past_sides.map(String) : [],
    }
    profileCache.set(teamId, profile)
    return profile
  }

  const pairPlans = teamIds.map(() => new Array<PairPlan>(teamIds.length))
  const pairCount = Math.floor(teamIds.length / 2)
  for (let left = 0; left < teamIds.length; left += 1) {
    for (let right = left + 1; right < teamIds.length; right += 1) {
      const leftId = teamIds[left]
      const rightId = teamIds[right]
      const counts = pairWarningCounts(leftId, rightId, getProfile, teamById, config)
      const sideDecision = sideOrderingForPair(
        leftId,
        rightId,
        getProfile,
        compiledTeamResults,
        config,
        filters
      )
      counts.by_side = sideDecision.warningCount
      pairPlans[left][right] = {
        scalarCost: 0,
        orderedTeams: sideDecision.orderedTeams,
        counts,
      }
    }
  }

  const weights = buildLexWeights(filters, pairPlans, pairCount)
  for (let left = 0; left < teamIds.length; left += 1) {
    for (let right = left + 1; right < teamIds.length; right += 1) {
      const plan = pairPlans[left][right]
      if (!plan) continue
      plan.scalarCost = filters.reduce((sum, filter, index) => {
        return sum + (plan.counts[filter] ?? 0) * weights[index]
      }, 0)
    }
  }

  const pairs =
    teamIds.length <= EXACT_TEAM_THRESHOLD
      ? solveExactMatching(pairPlans, teamIds.length)
      : (() => {
          const orders = buildSeedOrders(teamIds, getProfile)
          let bestPairs: Array<[number, number]> = []
          let bestCost = Number.POSITIVE_INFINITY

          orders.forEach((order) => {
            const greedyPairs = buildGreedyMatching(order, pairPlans)
            const improvedPairs = improveMatching(greedyPairs, pairPlans)
            const nextCost = improvedPairs.reduce((sum, [leftIndex, rightIndex]) => {
              const [left, right] = pairKey(leftIndex, rightIndex)
              return sum + pairPlans[left][right].scalarCost
            }, 0)
            if (compareCosts(nextCost, bestCost) < 0) {
              bestCost = nextCost
              bestPairs = improvedPairs
            }
          })

          return bestPairs
        })()

  return {
    r,
    allocation: buildAllocation(pairs, pairPlans, compiledTeamResults),
  }
}

export default { getTeamDrawMinWarnings }
