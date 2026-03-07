import { allocationDeepcopy, findOne } from './sys.js'
import { adjudicatorAllocationPrecheck } from './adjudicators/checks.js'
import { accessDetail, filterAvailable, findAndAccessDetail } from '../general/tools.js'
import { sillyLogger } from '../general/loggers.js'
import {
  sortDecorator,
  sortAdjudicators,
  sortAllocation,
  sortAdjudicatorsWithPreev,
  evaluateAdjudicator,
  type CompiledAdjudicatorResult,
  type CompiledTeamResult,
} from '../general/sortings.js'
import { countCommon, setMinus, shuffle } from '../general/math.js'
import * as adjfilters from './adjudicators/adjfilters.js'
import { galeShapley } from './adjudicators/matchings.js'
import * as traditionalMatchings from './adjudicators/traditional_matchings.js'
import {
  normalizeInstitutionPriorityMap,
  weightedCommonScore,
} from './common/institution-priority.js'
import type { AllocationConfig, Draw, NumbersOfAdjudicators } from '../types/allocations.js'
import type { AdjudicatorEntity, TeamEntity } from '../types/domain.js'

type AllocationWithAdjudicators = Draw['allocation'][number]

interface RankContext {
  teams: TeamEntity[]
  compiled_team_results: CompiledTeamResult[]
  compiled_adjudicator_results: CompiledAdjudicatorResult[]
  config: AllocationConfig
  r: number
}

type GroupRankFilter = (
  square: AllocationWithAdjudicators,
  a: AdjudicatorEntity,
  b: AdjudicatorEntity,
  dict: RankContext
) => number

type AdjudicatorRankFilter = (
  adjudicator: AdjudicatorEntity,
  g1: AllocationWithAdjudicators,
  g2: AllocationWithAdjudicators,
  dict: RankContext
) => number

type JudgeClass = 'A' | 'B' | 'C'

type ClassBasedRole = 'chairs' | 'panels' | 'trainees'

interface ClassBasedRow {
  square: AllocationWithAdjudicators
  teamInstitutionIds: number[]
  roomPriority: number
}

function createAllocationError(message: string, status = 400): Error & { status: number } {
  const err = new Error(message) as Error & { status: number }
  err.status = status
  return err
}

function toNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : []
}

function comparePenalty(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? 0
    const rightValue = right[index] ?? 0
    if (leftValue < rightValue) return -1
    if (leftValue > rightValue) return 1
  }
  return 0
}

function getJudgeClass(adjudicator: AdjudicatorEntity): JudgeClass | null {
  const raw =
    typeof adjudicator.user_defined_data?.judge_class === 'string'
      ? adjudicator.user_defined_data.judge_class
      : typeof adjudicator.user_defined_data?.judgeClass === 'string'
        ? adjudicator.user_defined_data.judgeClass
        : null
  if (!raw) return null
  const normalized = raw.trim().toUpperCase()
  return normalized === 'A' || normalized === 'B' || normalized === 'C'
    ? normalized
    : null
}

function getEffectiveJudgeClasses(adjudicators: AdjudicatorEntity[]): {
  hasExplicitClass: boolean
  map: Map<number, JudgeClass>
} {
  const map = new Map<number, JudgeClass>()
  let hasExplicitClass = false
  adjudicators.forEach((adjudicator) => {
    const judgeClass = getJudgeClass(adjudicator)
    if (judgeClass !== null) {
      hasExplicitClass = true
      map.set(adjudicator.id, judgeClass)
      return
    }
    map.set(adjudicator.id, 'A')
  })
  return { hasExplicitClass, map }
}

function getAdjudicatorScore(
  adjudicator: AdjudicatorEntity,
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  config: AllocationConfig
): number {
  return evaluateAdjudicator(adjudicator, compiledAdjudicatorResults, config.preev_weights ?? [])
}

function buildClassBasedRows(
  allocation: AllocationWithAdjudicators[],
  teams: TeamEntity[],
  r: number,
  roomPriorityById: Map<number, number>
): ClassBasedRow[] {
  return allocation.map((square) => ({
    square,
    teamInstitutionIds: square.teams.flatMap((teamId) =>
      toNumberArray(findAndAccessDetail(teams, teamId, r).conflicts)
    ),
    roomPriority: roomPriorityById.get(square.id) ?? Number.MAX_SAFE_INTEGER,
  }))
}

function getSquareLeadScore(
  square: AllocationWithAdjudicators,
  adjudicators: AdjudicatorEntity[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  config: AllocationConfig
): number {
  const chairIds = square.chairs ?? []
  if (chairIds.length === 0) return Number.NEGATIVE_INFINITY
  const scores = chairIds.map((chairId) =>
    getAdjudicatorScore(findOne(adjudicators, chairId), compiledAdjudicatorResults, config)
  )
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

function sortClassBasedRowsForRole(
  rows: ClassBasedRow[],
  role: ClassBasedRole,
  adjudicators: AdjudicatorEntity[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  config: AllocationConfig
): ClassBasedRow[] {
  const sorted = [...rows]
  sorted.sort((left, right) => {
    if (role !== 'chairs') {
      const leftLead = getSquareLeadScore(left.square, adjudicators, compiledAdjudicatorResults, config)
      const rightLead = getSquareLeadScore(
        right.square,
        adjudicators,
        compiledAdjudicatorResults,
        config
      )
      if (leftLead !== rightLead) return rightLead - leftLead
    }
    if (left.roomPriority !== right.roomPriority) return left.roomPriority - right.roomPriority
    return left.square.id - right.square.id
  })
  return sorted
}

function classPenaltyForRole(role: ClassBasedRole, judgeClass: JudgeClass): number {
  if (role === 'chairs') {
    return judgeClass === 'A' ? 0 : judgeClass === 'B' ? 1 : Number.MAX_SAFE_INTEGER
  }
  return judgeClass === 'C' ? 0 : judgeClass === 'B' ? 1 : 2
}

function buildRolePenalty(
  role: ClassBasedRole,
  row: ClassBasedRow,
  adjudicator: AdjudicatorEntity,
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  config: AllocationConfig,
  judgeClass: JudgeClass,
  r: number
): number[] {
  const detail = accessDetail(adjudicator, r)
  const conflictTeams = toNumberArray(detail.conflict_teams)
  const institutionIds = toNumberArray(detail.conflicts)
  const compiled = findOne(compiledAdjudicatorResults, adjudicator.id)
  const priorityMap = normalizeInstitutionPriorityMap(config.institution_priority_map)
  const strengthScore = getAdjudicatorScore(adjudicator, compiledAdjudicatorResults, config)
  return [
    countCommon(row.square.teams, conflictTeams),
    weightedCommonScore(row.teamInstitutionIds, institutionIds, priorityMap),
    classPenaltyForRole(role, judgeClass),
    countCommon(row.square.teams, compiled.judged_teams ?? []),
    role === 'chairs' ? -strengthScore : strengthScore,
    adjudicator.id,
  ]
}

function selectCandidateForRole(
  role: ClassBasedRole,
  row: ClassBasedRow,
  candidates: AdjudicatorEntity[],
  used: Set<number>,
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  config: AllocationConfig,
  judgeClasses: Map<number, JudgeClass>,
  r: number
): AdjudicatorEntity | null {
  let selected: AdjudicatorEntity | null = null
  let bestPenalty: number[] | null = null
  candidates.forEach((candidate) => {
    if (used.has(candidate.id)) return
    const judgeClass = judgeClasses.get(candidate.id) ?? 'A'
    if (role === 'chairs' && judgeClass === 'C') return
    const penalty = buildRolePenalty(
      role,
      row,
      candidate,
      compiledAdjudicatorResults,
      config,
      judgeClass,
      r
    )
    if (bestPenalty === null || comparePenalty(penalty, bestPenalty) < 0) {
      selected = candidate
      bestPenalty = penalty
    }
  })
  return selected
}

function getAdjudicatorRanks(
  r: number,
  allocation: AllocationWithAdjudicators[],
  teams: TeamEntity[],
  adjudicators: AdjudicatorEntity[],
  compiledTeamResults: CompiledTeamResult[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  filterFunctions: GroupRankFilter[],
  filterFunctions2: AdjudicatorRankFilter[],
  config: AllocationConfig
) {
  sillyLogger(getAdjudicatorRanks, arguments, 'draws')
  const allocationCopy = [...allocation]
  const gRanks: Record<number, number[]> = {}
  const aRanks: Record<number, number[]> = {}
  for (const square of allocationCopy) {
    adjudicators.sort(
      sortDecorator(square, filterFunctions, {
        teams,
        compiled_team_results: compiledTeamResults,
        compiled_adjudicator_results: compiledAdjudicatorResults,
        config,
        r,
      })
    )
    gRanks[square.id] = adjudicators.map((adjudicator) => adjudicator.id)
  }
  for (const adjudicator of adjudicators) {
    allocationCopy.sort(
      sortDecorator(adjudicator, filterFunctions2, {
        teams,
        compiled_team_results: compiledTeamResults,
        compiled_adjudicator_results: compiledAdjudicatorResults,
        config,
        r,
      })
    )
    aRanks[adjudicator.id] = allocationCopy.map((square) => square.id)
  }
  return [gRanks, aRanks] as const
}

function getAdjudicatorAllocationFromMatching(
  allocation: AllocationWithAdjudicators[],
  matching: Record<number, number[]>,
  role: 'chairs' | 'panels' | 'trainees'
): AllocationWithAdjudicators[] {
  sillyLogger(getAdjudicatorAllocationFromMatching, arguments, 'draws')
  const newAllocation = allocationDeepcopy(allocation)
  for (const squareId of Object.keys(matching)) {
    const targetAllocation = newAllocation.find((square) => square.id === Number(squareId))
    if (targetAllocation) {
      const adjudicatorIds = matching[Number(squareId)]
      if (role === 'chairs') targetAllocation.chairs = adjudicatorIds
      else if (role === 'panels') targetAllocation.panels = adjudicatorIds
      else targetAllocation.trainees = adjudicatorIds
    }
  }
  return newAllocation
}

function getMatching(
  allocation: AllocationWithAdjudicators[],
  availableAdjudicators: AdjudicatorEntity[],
  gRanks: Record<number, number[]>,
  aRanks: Record<number, number[]>,
  compiledTeamResults: CompiledTeamResult[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  role: 'chairs' | 'panels' | 'trainees',
  num: number
) {
  sillyLogger(getMatching, arguments, 'draws')
  const sortedAdjudicators = sortAdjudicators(availableAdjudicators, compiledAdjudicatorResults)
  const sortedAllocation = sortAllocation(allocation, compiledTeamResults)
  const chairMatching = galeShapley(
    sortedAllocation.map((row) => row.id),
    sortedAdjudicators.map((adjudicator) => adjudicator.id),
    gRanks,
    aRanks,
    num
  )
  return getAdjudicatorAllocationFromMatching(allocation, chairMatching, role)
}

function getAdjudicatorDraw(
  r: number,
  draw: Draw,
  adjudicators: AdjudicatorEntity[],
  teams: TeamEntity[],
  compiledTeamResults: CompiledTeamResult[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  { chairs, panels, trainees }: NumbersOfAdjudicators,
  config: AllocationConfig,
  {
    filters: filtersOpt = [
      'by_bubble',
      'by_strength',
      'by_attendance',
      'by_conflict_team',
      'by_conflict_group',
      'by_past',
      'by_random',
    ],
  }: { filters?: string[] } = {}
): Draw {
  sillyLogger(getAdjudicatorDraw, arguments, 'draws')
  const availableTeams = filterAvailable(teams, r)
  const availableAdjudicators = filterAvailable(adjudicators, r)
  const allocation = draw.allocation
  const filterFunctionsAdj = filtersOpt
    .filter((filterName) => Object.prototype.hasOwnProperty.call(adjfilterMethods1, filterName))
    .map((filterName) => adjfilterMethods1[filterName]) as GroupRankFilter[]
  const filterFunctionsAdj2 = filtersOpt
    .filter((filterName) => Object.prototype.hasOwnProperty.call(adjfilterMethods2, filterName))
    .map((filterName) => adjfilterMethods2[filterName]) as AdjudicatorRankFilter[]

  const [gRanks, aRanks] = getAdjudicatorRanks(
    r,
    allocation,
    availableTeams,
    availableAdjudicators,
    compiledTeamResults,
    compiledAdjudicatorResults,
    filterFunctionsAdj,
    filterFunctionsAdj2,
    config
  )
  let newAllocation = getMatching(
    allocation,
    availableAdjudicators,
    gRanks,
    aRanks,
    compiledTeamResults,
    compiledAdjudicatorResults,
    'chairs',
    chairs
  )

  let activeAdjudicators = ([] as number[]).concat(
    ...newAllocation.map((square) => square.chairs ?? [])
  )
  let remainingAdjudicatorIds = setMinus(
    availableAdjudicators.map((adjudicator) => adjudicator.id),
    activeAdjudicators
  )
  let remainingAdjudicators = remainingAdjudicatorIds.map((id) => findOne(adjudicators, id))
  newAllocation = getMatching(
    newAllocation,
    remainingAdjudicators,
    gRanks,
    aRanks,
    compiledTeamResults,
    compiledAdjudicatorResults,
    'panels',
    panels
  )

  activeAdjudicators = ([] as number[]).concat(
    ...newAllocation.map((square) => square.chairs ?? []),
    ...newAllocation.map((square) => square.panels ?? [])
  )
  remainingAdjudicatorIds = setMinus(
    availableAdjudicators.map((adjudicator) => adjudicator.id),
    activeAdjudicators
  )
  remainingAdjudicators = remainingAdjudicatorIds.map((id) => findOne(adjudicators, id))
  newAllocation = getMatching(
    newAllocation,
    remainingAdjudicators,
    gRanks,
    aRanks,
    compiledTeamResults,
    compiledAdjudicatorResults,
    'trainees',
    trainees
  )

  return { r: draw.r, allocation: newAllocation, user_defined_data: draw.user_defined_data }
}

function getAdjudicatorDrawTraditional(
  r: number,
  draw: Draw,
  adjudicators: AdjudicatorEntity[],
  teams: TeamEntity[],
  compiledTeamResults: CompiledTeamResult[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  numbersOfAdjudicators: NumbersOfAdjudicators,
  config: AllocationConfig,
  { assign = 'high_to_high', scatter = false }: { assign?: string; scatter?: boolean } = {}
): Draw {
  sillyLogger(getAdjudicatorDrawTraditional, arguments, 'draws')
  const allocation = draw.allocation
  const availableAdjudicators = filterAvailable(adjudicators, r)
  const sortedAdjudicators = sortAdjudicatorsWithPreev(
    availableAdjudicators,
    compiledAdjudicatorResults,
    config.preev_weights ?? []
  )
  const sortedAllocation = sortAllocation(allocation, compiledTeamResults)

  const assignMap = {
    high_to_high: traditionalMatchings.allocateHighToHigh,
    high_to_slight: traditionalMatchings.allocateHighToSlight,
    high_to_close: traditionalMatchings.allocateHighToClose,
    middle_to_high: traditionalMatchings.allocateMiddleToHigh,
    middle_to_slight: traditionalMatchings.allocateMiddleToSlight,
    middle_to_close: traditionalMatchings.allocateMiddleToClose,
  } as const
  const assigner = assignMap[(assign as keyof typeof assignMap) ?? 'high_to_high']
  const newAllocation = assigner(
    r,
    sortedAllocation,
    sortedAdjudicators,
    teams,
    compiledAdjudicatorResults,
    compiledTeamResults,
    numbersOfAdjudicators,
    { scatter }
  )
  return { r: draw.r, allocation: newAllocation, user_defined_data: draw.user_defined_data }
}

function getAdjudicatorDrawClassBased(
  r: number,
  draw: Draw,
  adjudicators: AdjudicatorEntity[],
  teams: TeamEntity[],
  compiledTeamResults: CompiledTeamResult[],
  compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  numbersOfAdjudicators: NumbersOfAdjudicators,
  config: AllocationConfig,
  _options: { filters?: string[] } = {}
): Draw {
  sillyLogger(getAdjudicatorDrawClassBased, arguments, 'draws')
  const { chairs, panels, trainees } = numbersOfAdjudicators

  const availableAdjudicators = filterAvailable(adjudicators, r)
  const { hasExplicitClass, map: judgeClasses } = getEffectiveJudgeClasses(availableAdjudicators)
  if (!hasExplicitClass) {
    return getAdjudicatorDraw(
      r,
      draw,
      adjudicators,
      teams,
      compiledTeamResults,
      compiledAdjudicatorResults,
      numbersOfAdjudicators,
      config,
      _options
    )
  }

  const totalChairSlots = draw.allocation.length * chairs
  const availableChairCandidates = availableAdjudicators.filter(
    (adjudicator) => (judgeClasses.get(adjudicator.id) ?? 'A') !== 'C'
  )
  if (availableChairCandidates.length < totalChairSlots) {
    throw createAllocationError(
      'Not enough A/B adjudicators to fill chair slots in class_based mode',
      412
    )
  }

  const newAllocation = allocationDeepcopy(draw.allocation).map((square): AllocationWithAdjudicators => ({
    ...square,
    chairs: [] as number[],
    panels: [] as number[],
    trainees: [] as number[],
  }))
  const roomPriorityById = new Map(
    sortAllocation(draw.allocation, compiledTeamResults)
      .reverse()
      .map((square, index) => [square.id, index] as const)
  )
  const rows = buildClassBasedRows(newAllocation, teams, r, roomPriorityById)
  const used = new Set<number>()

  const assignRole = (role: ClassBasedRole, count: number) => {
    for (let slot = 0; slot < count; slot += 1) {
      const sortedRows = sortClassBasedRowsForRole(
        rows,
        role,
        adjudicators,
        compiledAdjudicatorResults,
        config
      )
      for (const row of sortedRows) {
        const candidate = selectCandidateForRole(
          role,
          row,
          availableAdjudicators,
          used,
          compiledAdjudicatorResults,
          config,
          judgeClasses,
          r
        )
        if (!candidate) {
          throw createAllocationError(
            `Not enough adjudicators to fill ${role} slots in class_based mode`,
            412
          )
        }
        if (role === 'chairs') row.square.chairs = [...(row.square.chairs ?? []), candidate.id]
        else if (role === 'panels') row.square.panels = [...(row.square.panels ?? []), candidate.id]
        else row.square.trainees = [...(row.square.trainees ?? []), candidate.id]
        used.add(candidate.id)
      }
    }
  }

  assignRole('chairs', chairs)
  assignRole('panels', panels)
  assignRole('trainees', trainees)

  return { r: draw.r, allocation: newAllocation, user_defined_data: draw.user_defined_data }
}

function getAdjudicatorDrawRandom(
  r: number,
  draw: Draw,
  adjudicators: AdjudicatorEntity[],
  _teams: TeamEntity[],
  _compiledTeamResults: CompiledTeamResult[],
  _compiledAdjudicatorResults: CompiledAdjudicatorResult[],
  numbersOfAdjudicators: NumbersOfAdjudicators,
  config: AllocationConfig,
  _options: { filters?: string[] } = {}
): Draw {
  sillyLogger(getAdjudicatorDrawRandom, arguments, 'draws')
  const { chairs, panels, trainees } = numbersOfAdjudicators
  const shuffledAdjudicators = shuffle(
    filterAvailable(adjudicators, r),
    `${Date.now()}:adjudicator-random:${config.name ?? 'draw'}:${r}`
  )
  const newAllocation = allocationDeepcopy(draw.allocation).map((square): AllocationWithAdjudicators => ({
    ...square,
    chairs: [] as number[],
    panels: [] as number[],
    trainees: [] as number[],
  }))
  let cursor = 0

  const assignRole = (role: ClassBasedRole, count: number) => {
    for (let slot = 0; slot < count; slot += 1) {
      for (const square of newAllocation) {
        const candidate = shuffledAdjudicators[cursor]
        if (!candidate) {
          throw createAllocationError(`Not enough adjudicators to fill ${role} slots in random mode`, 412)
        }
        if (role === 'chairs') square.chairs = [...(square.chairs ?? []), candidate.id]
        else if (role === 'panels') square.panels = [...(square.panels ?? []), candidate.id]
        else square.trainees = [...(square.trainees ?? []), candidate.id]
        cursor += 1
      }
    }
  }

  assignRole('chairs', chairs)
  assignRole('panels', panels)
  assignRole('trainees', trainees)

  return { r: draw.r, allocation: newAllocation, user_defined_data: draw.user_defined_data }
}

const adjfilterMethods1: Record<string, GroupRankFilter> = {
  by_bubble: adjfilters.filterByBubble,
  by_strength: adjfilters.filterByStrength,
  by_attendance: adjfilters.filterByAttendance,
  by_random: adjfilters.filterByRandom,
}

const adjfilterMethods2: Record<string, AdjudicatorRankFilter> = {
  by_past: adjfilters.filterByPast,
  by_conflict_group: adjfilters.filterByConflictGroup,
  by_conflict_team: adjfilters.filterByConflictTeam,
}

const standard = { get: getAdjudicatorDraw }
const traditional = { get: getAdjudicatorDrawTraditional }
const class_based = { get: getAdjudicatorDrawClassBased }
const random = { get: getAdjudicatorDrawRandom }
const precheck = adjudicatorAllocationPrecheck

export { standard, traditional, class_based, random, precheck }
export default { standard, traditional, class_based, random, precheck }
