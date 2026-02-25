import { clone } from 'lodash-es'
import { sillyLogger } from '../../general/loggers.js'
import { shuffle, combinations, isin, countCommon } from '../../general/math.js'
import { decidePositions, findOne as findOneResult } from '../sys.js'
import {
  buildInstitutionPriorityHistogram,
  compareInstitutionPriorityHistograms,
  mergeInstitutionPriorityHistograms,
  normalizeInstitutionPriorityMap,
  type InstitutionPriorityHistogram,
} from '../common/institution-priority.js'

type PullupMethod = 'fromtop' | 'frombottom' | 'random'
type PairingMethod = 'random' | 'fold' | 'slide' | 'sort' | 'adjusted'
type PositionMethod = 'random' | 'adjusted'

type TeamLike = {
  id: number
  details?: Array<{ r: number; institutions?: number[] }>
}

type CompiledTeamResultLike = {
  id: number
  win: number
  past_sides?: string[]
  past_opponents?: number[]
}

type StrictConfig = {
  name?: string
  style: { team_num: number }
  institution_priority_map?: Record<number, number>
}

type StrictMatchingOptions = {
  pairing_method?: string
  pullup_method?: string
  position_method?: string
  avoid_conflict?: boolean
  conflict_weights?: { institution?: number; past_opponent?: number }
  round?: number
  max_swap_iterations?: number
}

type Division = {
  win: number
  teams: number[]
}

type EnrichedDivision = Division & {
  out: number
  in: number
  consider: boolean
}

function addInformationToDivision(division: Division[], config: StrictConfig): EnrichedDivision[] {
  const div: EnrichedDivision[] = division.map((d) => ({ ...d, out: 0, in: 0, consider: false }))
  const teamNum = config.style.team_num
  if (div.length === 0) return div

  div[0].out = 0
  div[0].consider = true
  div[0].in = div[0].teams.length % teamNum === 0 ? 0 : teamNum - (div[0].teams.length % teamNum)

  let nowIn = div[0].in
  for (let i = 1; i < div.length - 1; i += 1) {
    if (div[i].teams.length < nowIn) {
      div[i].out = div[i].teams.length
      nowIn -= div[i].teams.length
      div[i].consider = false
    } else {
      div[i].out = nowIn
      div[i].consider = true
      const remaining = div[i].teams.length - div[i].out
      nowIn = remaining % teamNum === 0 ? 0 : teamNum - remaining
    }
  }

  const last = div[div.length - 1]
  last.out = Math.min(nowIn, last.teams.length)
  last.consider = last.teams.length - last.out > 0
  return div
}

function pullupFuncFromtop(d: EnrichedDivision): [number[], number[]] {
  return [d.teams.slice(0, d.out), d.teams.slice(d.out)]
}

function pullupFuncFrombottom(d: EnrichedDivision): [number[], number[]] {
  const e = [...d.teams].reverse()
  return [e.slice(0, d.out), e.slice(d.out)]
}

function pullupFuncRandom(d: EnrichedDivision, config: StrictConfig): [number[], number[]] {
  const e = shuffle(d.teams, config.name)
  return [e.slice(0, d.out), e.slice(d.out)]
}

const pullupFuncs: Record<
  PullupMethod,
  (d: EnrichedDivision, config: StrictConfig) => [number[], number[]]
> = {
  fromtop: pullupFuncFromtop,
  frombottom: pullupFuncFrombottom,
  random: pullupFuncRandom,
}

function divideInto<T>(list: T[], num: number): T[][] {
  const divided: T[][] = []
  const inDiv = list.length / num
  for (let j = 0; j < num; j += 1) {
    divided.push(list.slice(j * inDiv, (j + 1) * inDiv))
  }
  return divided
}

function divideComb<T>(list: T[], num: number): T[][] {
  if (list.length === num) return [list]
  const heads = combinations(list, num)
  return heads.flatMap((head) =>
    divideComb(
      list.filter((e) => !isin(e, head)),
      num
    ).map((t) => head.concat(t))
  )
}

function pairingFuncSort(
  teams: number[],
  config: StrictConfig,
  _compiledTeamResults: CompiledTeamResultLike[]
): number[][] {
  return divideInto(teams, teams.length / config.style.team_num)
}

function pairingFuncRandom(
  teams: number[],
  config: StrictConfig,
  compiledTeamResults: CompiledTeamResultLike[]
): number[][] {
  const shuffled = shuffle(teams, config.name)
  return pairingFuncSort(shuffled, config, compiledTeamResults)
}

function pairingFuncFold(
  teams: number[],
  config: StrictConfig,
  compiledTeamResults: CompiledTeamResultLike[]
): number[][] {
  const matched: number[][] = []
  const divided = divideInto(teams, config.style.team_num)
  for (let j = config.style.team_num - 1; j >= config.style.team_num / 2; j -= 1) {
    divided[j].reverse()
  }
  for (let i = 0; i < teams.length / config.style.team_num; i += 1) {
    matched.push(divided.map((div) => div[i]))
  }
  return matched
}

function pairingFuncSlide(
  teams: number[],
  config: StrictConfig,
  _compiledTeamResults: CompiledTeamResultLike[]
): number[][] {
  const matched: number[][] = []
  const divided = divideInto(teams, config.style.team_num)
  for (let i = 0; i < teams.length / config.style.team_num; i += 1) {
    matched.push(divided.map((div) => div[i]))
  }
  return matched
}

function pairingFuncAdjusted(
  teams: number[],
  config: StrictConfig,
  compiledTeamResults: CompiledTeamResultLike[]
): number[][] {
  const allCs = divideComb(teams, config.style.team_num)
  const allDivs = allCs.map((c) => divideInto(c, teams.length / config.style.team_num))
  const measures: number[] = []

  for (const divs of allDivs) {
    let measure = 0
    for (const div of divs) {
      const cs = combinations(div, div.length)
      const pastSidesListList = cs.map((c) =>
        c.map((teamId) => findOneResult(compiledTeamResults, teamId).past_sides ?? [])
      )
      measure += Math.min(
        ...pastSidesListList.map((pastSidesList) =>
          pastSidesList.reduce((acc, curr) => acc + curr.length, 0)
        )
      )
    }
    measures.push(measure)
  }
  if (allDivs.length === 0) return []
  const maxIndex = measures.indexOf(Math.max(...measures))
  return allDivs[maxIndex]
}

const pairingFuncs: Record<
  PairingMethod,
  (teams: number[], config: StrictConfig, compiledTeamResults: CompiledTeamResultLike[]) => number[][]
> = {
  random: pairingFuncRandom,
  fold: pairingFuncFold,
  slide: pairingFuncSlide,
  sort: pairingFuncSort,
  adjusted: pairingFuncAdjusted,
}

const positionFuncs: Record<
  PositionMethod,
  (ts: number[], compiledTeamResults: CompiledTeamResultLike[], config: StrictConfig) => number[]
> = {
  random: (ts: number[], _compiledTeamResults: CompiledTeamResultLike[], config: StrictConfig) =>
    shuffle(ts, config.name),
  adjusted: decidePositions,
}

function match(
  div: EnrichedDivision[],
  pullupFunc: (d: EnrichedDivision, config: StrictConfig) => [number[], number[]],
  config: StrictConfig
): number[][] {
  sillyLogger(match, arguments, 'draws')
  const divCp = clone(div)
  if (divCp.length === 0) return []
  if (divCp.length === 1) return [divCp[0].teams]

  const matchingPool: number[][] = []
  let matched: number[] = [...divCp[0].teams]

  for (let i = 1; i < divCp.length - 1; i += 1) {
    if (!divCp[i].consider) continue
    const [chosen, rem] = pullupFunc(divCp[i], config)
    matched = matched.concat(chosen)
    if (rem.length > 0) {
      matchingPool.push([...matched])
      matched = [...rem]
    }
  }

  const last = divCp[divCp.length - 1]
  if (last?.consider) {
    matched = matched.concat(last.teams ?? [])
  }
  if (matched.length > 0) {
    matchingPool.push([...matched])
  }
  return matchingPool
}

function normalizedWeight(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

type ConflictProfile = {
  institution: InstitutionPriorityHistogram
  pastOpponent: number
}

function getTeamInstitutions(team: TeamLike | undefined, round: number): number[] {
  const detail = team?.details?.find((d) => d.r === round)
  return Array.isArray(detail?.institutions)
    ? detail.institutions.filter((id): id is number => typeof id === 'number')
    : []
}

function pairConflictProfile(
  teamAId: number,
  teamBId: number,
  teamById: Map<number, TeamLike>,
  resultById: Map<number, CompiledTeamResultLike>,
  round: number,
  institutionPriorityMap: Record<number, number>
): ConflictProfile {
  const teamA = teamById.get(teamAId)
  const teamB = teamById.get(teamBId)
  const institutionsA = getTeamInstitutions(teamA, round)
  const institutionsB = getTeamInstitutions(teamB, round)
  const institutionOverlapProfile =
    Object.keys(institutionPriorityMap).length > 0
      ? buildInstitutionPriorityHistogram(institutionsA, institutionsB, institutionPriorityMap)
      : (() => {
          const overlap = countCommon(institutionsA, institutionsB)
          const histogram: InstitutionPriorityHistogram = {}
          if (overlap > 0) histogram[1] = overlap
          return histogram
        })()

  const pastA = Array.isArray(resultById.get(teamAId)?.past_opponents)
    ? (resultById.get(teamAId)?.past_opponents as number[])
    : []
  const pastB = Array.isArray(resultById.get(teamBId)?.past_opponents)
    ? (resultById.get(teamBId)?.past_opponents as number[])
    : []
  const pastOverlap =
    pastA.filter((id) => id === teamBId).length + pastB.filter((id) => id === teamAId).length

  return {
    institution: institutionOverlapProfile,
    pastOpponent: pastOverlap,
  }
}

function mergeConflictProfiles(left: ConflictProfile, right: ConflictProfile): ConflictProfile {
  return {
    institution: mergeInstitutionPriorityHistograms(left.institution, right.institution),
    pastOpponent: left.pastOpponent + right.pastOpponent,
  }
}

function compareConflictProfiles(
  left: ConflictProfile,
  right: ConflictProfile,
  conflictWeights: { institution: number; past_opponent: number }
): number {
  const compareInstitution = () =>
    compareInstitutionPriorityHistograms(left.institution, right.institution)
  const comparePast = () => {
    if (left.pastOpponent < right.pastOpponent) return -1
    if (left.pastOpponent > right.pastOpponent) return 1
    return 0
  }

  if (conflictWeights.institution <= 0 && conflictWeights.past_opponent <= 0) {
    return 0
  }
  if (conflictWeights.institution <= 0) return comparePast()
  if (conflictWeights.past_opponent <= 0) return compareInstitution()

  if (conflictWeights.institution >= conflictWeights.past_opponent) {
    const institutionComparison = compareInstitution()
    if (institutionComparison !== 0) return institutionComparison
    return comparePast()
  }
  const pastComparison = comparePast()
  if (pastComparison !== 0) return pastComparison
  return compareInstitution()
}

function matchConflictProfile(
  match: number[],
  teamById: Map<number, TeamLike>,
  resultById: Map<number, CompiledTeamResultLike>,
  round: number,
  institutionPriorityMap: Record<number, number>
): ConflictProfile {
  let profile: ConflictProfile = { institution: {}, pastOpponent: 0 }
  for (let i = 0; i < match.length; i += 1) {
    for (let j = i + 1; j < match.length; j += 1) {
      profile = mergeConflictProfiles(
        profile,
        pairConflictProfile(match[i], match[j], teamById, resultById, round, institutionPriorityMap)
      )
    }
  }
  return profile
}

function resolveDp(
  teams: TeamLike[],
  matching: number[][],
  compiledTeamResults: CompiledTeamResultLike[],
  {
    round,
    config,
    conflict_weights,
    max_swap_iterations = 24,
  }: {
    round: number
    config: StrictConfig
    conflict_weights?: { institution?: number; past_opponent?: number }
    max_swap_iterations?: number
  }
): number[][] {
  const teamById = new Map<number, TeamLike>(teams.map((team) => [team.id, team]))
  const resultById = new Map<number, CompiledTeamResultLike>(
    compiledTeamResults.map((result) => [Number(result.id), result])
  )
  const institutionPriorityMap = normalizeInstitutionPriorityMap(config?.institution_priority_map)
  const conflictWeights = {
    institution: normalizedWeight(conflict_weights?.institution, 1),
    past_opponent: normalizedWeight(conflict_weights?.past_opponent, 1),
  }
  if (conflictWeights.institution === 0 && conflictWeights.past_opponent === 0) {
    return matching
  }

  const swapsLimit = Math.max(0, Math.floor(Number(max_swap_iterations) || 0))
  const next = matching.map((matchRow) => [...matchRow])
  for (let iteration = 0; iteration < swapsLimit; iteration += 1) {
    let best:
      | {
          after: ConflictProfile
          leftIndex: number
          rightIndex: number
          leftPos: number
          rightPos: number
        }
      | null = null

    for (let leftIndex = 0; leftIndex < next.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < next.length; rightIndex += 1) {
        const leftMatch = next[leftIndex]
        const rightMatch = next[rightIndex]

        const before = mergeConflictProfiles(
          matchConflictProfile(leftMatch, teamById, resultById, round, institutionPriorityMap),
          matchConflictProfile(rightMatch, teamById, resultById, round, institutionPriorityMap)
        )

        for (let leftPos = 0; leftPos < leftMatch.length; leftPos += 1) {
          for (let rightPos = 0; rightPos < rightMatch.length; rightPos += 1) {
            const swappedLeft = [...leftMatch]
            const swappedRight = [...rightMatch]
            ;[swappedLeft[leftPos], swappedRight[rightPos]] = [
              swappedRight[rightPos],
              swappedLeft[leftPos],
            ]
            const after = mergeConflictProfiles(
              matchConflictProfile(swappedLeft, teamById, resultById, round, institutionPriorityMap),
              matchConflictProfile(swappedRight, teamById, resultById, round, institutionPriorityMap)
            )
            if (compareConflictProfiles(after, before, conflictWeights) >= 0) continue
            if (
              !best ||
              compareConflictProfiles(after, best.after, conflictWeights) < 0 ||
              (compareConflictProfiles(after, best.after, conflictWeights) === 0 &&
                (leftIndex < best.leftIndex ||
                  (leftIndex === best.leftIndex &&
                    (rightIndex < best.rightIndex ||
                      (rightIndex === best.rightIndex &&
                        (leftPos < best.leftPos ||
                          (leftPos === best.leftPos && rightPos < best.rightPos)))))))
            ) {
              best = { after, leftIndex, rightIndex, leftPos, rightPos }
            }
          }
        }
      }
    }

    if (!best) break
    ;[next[best.leftIndex][best.leftPos], next[best.rightIndex][best.rightPos]] = [
      next[best.rightIndex][best.rightPos],
      next[best.leftIndex][best.leftPos],
    ]
  }

  return next
}

export function strictMatching(
  teams: TeamLike[],
  compiledTeamResults: CompiledTeamResultLike[],
  config: StrictConfig,
  {
    pairing_method = 'random',
    pullup_method = 'fromtop',
    position_method = 'adjusted',
    avoid_conflict = true,
    conflict_weights,
    round = 1,
    max_swap_iterations = 24,
  }: StrictMatchingOptions = {}
): Record<string, never> | number[][] {
  sillyLogger(strictMatching, arguments, 'draws')
  if (teams.length === 0) return {}

  const div: Division[] = []
  const wins = Array.from(new Set(compiledTeamResults.map((ctr) => ctr.win)))
  const teamIds = teams.map((t) => t.id)
  wins.sort((a, b) => a - b)

  for (const win of wins) {
    const sameWinTeams = teamIds.filter((id) => findOneResult(compiledTeamResults, id).win === win)
    div.push({ win, teams: sameWinTeams })
  }

  const enrichedDiv = addInformationToDivision(div, config)
  const pullup = pullupFuncs[(pullup_method as PullupMethod) ?? 'fromtop'] ?? pullupFuncs.fromtop
  const pairing = pairingFuncs[(pairing_method as PairingMethod) ?? 'random'] ?? pairingFuncs.random
  const position =
    positionFuncs[(position_method as PositionMethod) ?? 'adjusted'] ?? positionFuncs.adjusted

  const matchingPool = match(enrichedDiv, pullup, config)
  const preMatching = matchingPool.flatMap((pool) => pairing(pool, config, compiledTeamResults))
  const matching = preMatching.map((ts) => position(ts, compiledTeamResults, config))
  return avoid_conflict
    ? resolveDp(teams, matching, compiledTeamResults, {
        round,
        config,
        conflict_weights,
        max_swap_iterations,
      })
    : matching
}

export default { strictMatching }
