import { shuffle, countCommon } from '../../general/math.js'
import { sortTeams } from '../../general/sortings.js'
import { accessDetail, filterAvailable } from '../../general/tools.js'
import { decidePositions, findOne as findOneResult } from '../sys.js'
import { sillyLogger } from '../../general/loggers.js'

type OddBracketMethod = 'pullup_top' | 'pullup_bottom' | 'pullup_random'
type PairingMethod = 'slide' | 'fold' | 'random'
type AvoidConflictsMode = 'off' | 'one_up_one_down'

type ConflictWeights = {
  institution: number
  past_opponent: number
}

type TeamBracket = {
  points: number
  teams: any[]
}

function makeBadRequest(message: string): Error {
  const err = new Error(message)
  ;(err as any).status = 400
  return err
}

function normalizeOddBracketMethod(value: unknown): OddBracketMethod {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'pullup_top' || normalized === 'fromtop') return 'pullup_top'
  if (normalized === 'pullup_bottom' || normalized === 'frombottom') return 'pullup_bottom'
  if (normalized === 'pullup_random' || normalized === 'random') return 'pullup_random'
  return 'pullup_top'
}

function normalizePairingMethod(value: unknown): PairingMethod {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'slide' || normalized === 'fold' || normalized === 'random') {
    return normalized as PairingMethod
  }
  return 'fold'
}

function normalizeAvoidConflictsMode(value: unknown): AvoidConflictsMode {
  if (value === true) return 'one_up_one_down'
  if (value === false) return 'off'
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'one_up_one_down') return 'one_up_one_down'
  if (normalized === 'off' || normalized === 'none') return 'off'
  return 'one_up_one_down'
}

function normalizeWeight(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function normalizeConflictWeights(value: unknown): ConflictWeights {
  if (!value || typeof value !== 'object') {
    return { institution: 1, past_opponent: 1 }
  }
  const raw = value as Record<string, unknown>
  return {
    institution: normalizeWeight(raw.institution, 1),
    past_opponent: normalizeWeight(raw.past_opponent, 1),
  }
}

function normalizeInstitutionPriorityMap(value: unknown): Record<number, number> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<number, number> = {}
  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    const parsedKey = Number(key)
    const parsedValue = Number(raw)
    if (!Number.isFinite(parsedKey)) return
    out[parsedKey] = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 1
  })
  return out
}

function weightedCommonScore(
  left: number[],
  right: number[],
  priorityMap: Record<number, number>
): number {
  const rightSet = new Set(right)
  const common = Array.from(new Set(left.filter((value) => rightSet.has(value))))
  return common.reduce((total, id) => total + (priorityMap[id] ?? 1), 0)
}

function normalizeMaxIterations(value: unknown, fallback = 24): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.floor(parsed))
}

function groupTeamsByPoints(sortedTeams: any[], compiledTeamResults: any[]): TeamBracket[] {
  const resultById = new Map<number, any>(
    (compiledTeamResults as any[]).map((result) => [Number(result.id), result])
  )
  const grouped = new Map<number, any[]>()
  for (const team of sortedTeams) {
    const points = Number(resultById.get(team.id)?.win ?? 0)
    const current = grouped.get(points) ?? []
    current.push(team)
    grouped.set(points, current)
  }
  const pointsList = Array.from(grouped.keys()).sort((left, right) => right - left)
  return pointsList.map((points) => ({ points, teams: grouped.get(points) ?? [] }))
}

function selectDonorIndex(
  teams: any[],
  method: OddBracketMethod,
  randomSeed: string
): number {
  if (teams.length === 0) return 0
  if (method === 'pullup_top') return 0
  if (method === 'pullup_bottom') return teams.length - 1
  const indexes = teams.map((_team, index) => index)
  const shuffled = shuffle(indexes, randomSeed)
  return shuffled[0] ?? 0
}

function resolveOddBrackets(
  brackets: TeamBracket[],
  method: OddBracketMethod,
  randomSeed: string
) {
  const pullups: Array<{
    team_id: number
    from_points: number
    to_points: number
    from_bracket_index: number
    to_bracket_index: number
  }> = []

  for (let index = 0; index < brackets.length - 1; index += 1) {
    const current = brackets[index]
    if (current.teams.length % 2 === 0) continue
    const donorSource = brackets[index + 1]
    if (!donorSource || donorSource.teams.length === 0) {
      throw makeBadRequest('powerpair requires enough teams to resolve odd brackets')
    }
    const donorIndex = selectDonorIndex(
      donorSource.teams,
      method,
      `${randomSeed}:pullup:${index}`
    )
    const donor = donorSource.teams.splice(donorIndex, 1)[0]
    current.teams.push(donor)
    pullups.push({
      team_id: Number(donor.id),
      from_points: donorSource.points,
      to_points: current.points,
      from_bracket_index: index + 1,
      to_bracket_index: index,
    })
  }

  const odd = brackets.find((bracket) => bracket.teams.length % 2 !== 0)
  if (odd) {
    throw makeBadRequest('powerpair requires an even number of available teams')
  }
  return pullups
}

function pairTeamsInBracket(
  teams: any[],
  method: PairingMethod,
  randomSeed: string
): number[][] {
  if (teams.length % 2 !== 0) {
    throw makeBadRequest('powerpair bracket has an odd number of teams')
  }
  if (teams.length === 0) return []

  if (method === 'random') {
    const shuffledTeams = shuffle(teams, randomSeed)
    const pairs: number[][] = []
    for (let index = 0; index < shuffledTeams.length; index += 2) {
      pairs.push([Number(shuffledTeams[index].id), Number(shuffledTeams[index + 1].id)])
    }
    return pairs
  }

  if (method === 'slide') {
    const half = teams.length / 2
    const pairs: number[][] = []
    for (let index = 0; index < half; index += 1) {
      pairs.push([Number(teams[index].id), Number(teams[index + half].id)])
    }
    return pairs
  }

  const pairs: number[][] = []
  for (let index = 0; index < teams.length / 2; index += 1) {
    pairs.push([Number(teams[index].id), Number(teams[teams.length - 1 - index].id)])
  }
  return pairs
}

function pairConflictScore(
  teamAId: number,
  teamBId: number,
  teamById: Map<number, any>,
  resultById: Map<number, any>,
  round: number,
  institutionPriorityMap: Record<number, number>,
  conflictWeights: ConflictWeights
): number {
  const teamA = teamById.get(teamAId)
  const teamB = teamById.get(teamBId)
  const institutionsA = (accessDetail(teamA, round)?.institutions ?? []) as number[]
  const institutionsB = (accessDetail(teamB, round)?.institutions ?? []) as number[]
  const institutionConflict =
    Object.keys(institutionPriorityMap).length > 0
      ? weightedCommonScore(institutionsA, institutionsB, institutionPriorityMap)
      : countCommon(institutionsA, institutionsB)

  const pastOpponentsA = Array.isArray(resultById.get(teamAId)?.past_opponents)
    ? (resultById.get(teamAId)?.past_opponents as number[])
    : []
  const pastOpponentsB = Array.isArray(resultById.get(teamBId)?.past_opponents)
    ? (resultById.get(teamBId)?.past_opponents as number[])
    : []
  const pastConflict =
    pastOpponentsA.filter((id) => id === teamBId).length +
    pastOpponentsB.filter((id) => id === teamAId).length

  return (
    conflictWeights.institution * institutionConflict +
    conflictWeights.past_opponent * pastConflict
  )
}

function applyOneUpOneDown(
  matches: number[][],
  teamById: Map<number, any>,
  resultById: Map<number, any>,
  round: number,
  institutionPriorityMap: Record<number, number>,
  conflictWeights: ConflictWeights,
  maxIterations: number
): number[][] {
  if (matches.length < 2) return matches.map((match) => [...match])
  let next = matches.map((match) => [...match])

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let improved = false
    for (let index = 0; index < next.length - 1; index += 1) {
      const upper = next[index]
      const lower = next[index + 1]
      if (upper.length !== 2 || lower.length !== 2) continue
      const before =
        pairConflictScore(
          upper[0],
          upper[1],
          teamById,
          resultById,
          round,
          institutionPriorityMap,
          conflictWeights
        ) +
        pairConflictScore(
          lower[0],
          lower[1],
          teamById,
          resultById,
          round,
          institutionPriorityMap,
          conflictWeights
        )

      let best:
        | {
            improvement: number
            upperPos: number
            lowerPos: number
          }
        | null = null
      for (let upperPos = 0; upperPos < upper.length; upperPos += 1) {
        for (let lowerPos = 0; lowerPos < lower.length; lowerPos += 1) {
          const swappedUpper = [...upper]
          const swappedLower = [...lower]
          ;[swappedUpper[upperPos], swappedLower[lowerPos]] = [
            swappedLower[lowerPos],
            swappedUpper[upperPos],
          ]
          const after =
            pairConflictScore(
              swappedUpper[0],
              swappedUpper[1],
              teamById,
              resultById,
              round,
              institutionPriorityMap,
              conflictWeights
            ) +
            pairConflictScore(
              swappedLower[0],
              swappedLower[1],
              teamById,
              resultById,
              round,
              institutionPriorityMap,
              conflictWeights
            )
          const improvement = before - after
          if (improvement <= 0) continue
          if (
            !best ||
            improvement > best.improvement ||
            (improvement === best.improvement &&
              (upperPos < best.upperPos ||
                (upperPos === best.upperPos && lowerPos < best.lowerPos)))
          ) {
            best = { improvement, upperPos, lowerPos }
          }
        }
      }

      if (best && best.improvement > 0) {
        ;[next[index][best.upperPos], next[index + 1][best.lowerPos]] = [
          next[index + 1][best.lowerPos],
          next[index][best.upperPos],
        ]
        improved = true
      }
    }
    if (!improved) break
  }
  return next
}

export function getTeamDrawPowerpair(
  r: number,
  teams: any[],
  compiledTeamResults: any[],
  {
    odd_bracket = 'pullup_top',
    pairing_method = 'fold',
    avoid_conflicts = 'one_up_one_down',
    conflict_weights = {},
    max_swap_iterations = 24,
  }: {
    odd_bracket?: string
    pairing_method?: string
    avoid_conflicts?: string | boolean
    conflict_weights?: { institution?: number; past_opponent?: number }
    max_swap_iterations?: number
  } = {},
  config: any
) {
  sillyLogger(getTeamDrawPowerpair, arguments, 'draws')

  if (config?.style?.team_num !== 2) {
    throw makeBadRequest('powerpair supports only style.team_num=2')
  }

  const availableTeams = filterAvailable(teams, r)
  if (availableTeams.length % 2 !== 0) {
    throw makeBadRequest('powerpair requires an even number of available teams')
  }
  if (availableTeams.length === 0) {
    return { r, allocation: [], user_defined_data: { powerpair: { brackets: [], pullups: [] } } }
  }

  const oddBracketMethod = normalizeOddBracketMethod(odd_bracket)
  const pairingMethod = normalizePairingMethod(pairing_method)
  const avoidConflictsMode = normalizeAvoidConflictsMode(avoid_conflicts)
  const conflictWeights = normalizeConflictWeights(conflict_weights)
  const maxIterations = normalizeMaxIterations(max_swap_iterations)
  const randomSeed = `${config?.name ?? 'powerpair'}:${r}`

  const sortedTeams = sortTeams(availableTeams, compiledTeamResults)
  const brackets = groupTeamsByPoints(sortedTeams, compiledTeamResults)
  const pullups = resolveOddBrackets(brackets, oddBracketMethod, randomSeed)

  const teamById = new Map<number, any>(teams.map((team) => [Number(team.id), team]))
  const resultById = new Map<number, any>(
    (compiledTeamResults as any[]).map((result) => [Number(result.id), result])
  )
  const institutionPriorityMap = normalizeInstitutionPriorityMap(config?.institution_priority_map)

  const bracketMetas: Array<{
    index: number
    points: number
    team_ids: number[]
    pairings_before_conflict: number[][]
    pairings_after_conflict: number[][]
  }> = []
  const allocationRows: any[] = []
  let nextSquareId = 0

  brackets.forEach((bracket, bracketIndex) => {
    const initialPairings = pairTeamsInBracket(
      bracket.teams,
      pairingMethod,
      `${randomSeed}:pair:${bracketIndex}`
    )
    const resolvedPairings =
      avoidConflictsMode === 'one_up_one_down'
        ? applyOneUpOneDown(
            initialPairings,
            teamById,
            resultById,
            r,
            institutionPriorityMap,
            conflictWeights,
            maxIterations
          )
        : initialPairings

    bracketMetas.push({
      index: bracketIndex,
      points: bracket.points,
      team_ids: bracket.teams.map((team) => Number(team.id)),
      pairings_before_conflict: initialPairings.map((pair) => [...pair]),
      pairings_after_conflict: resolvedPairings.map((pair) => [...pair]),
    })

    resolvedPairings.forEach((pair) => {
      const positioned = decidePositions(pair, compiledTeamResults, config)
      allocationRows.push({
        id: nextSquareId,
        teams: positioned,
        chairs: [],
        panels: [],
        trainees: [],
        venue: null,
      })
      nextSquareId += 1
    })
  })

  return {
    r,
    allocation: allocationRows,
    user_defined_data: {
      team_allocation_algorithm: 'powerpair',
      powerpair: {
        odd_bracket: oddBracketMethod,
        pairing_method: pairingMethod,
        avoid_conflicts: avoidConflictsMode,
        conflict_weights: conflictWeights,
        max_swap_iterations: maxIterations,
        pullups,
        brackets: bracketMetas,
      },
    },
  }
}

export default { getTeamDrawPowerpair }
