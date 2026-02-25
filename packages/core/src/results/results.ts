import { sum, average, sd, count } from '../general/math.js'
import { findOne as findResult } from '../allocations/sys.js'
import {
  speakerSimpleComparer,
  adjudicatorSimpleComparer,
  teamSimpleComparer,
  teamComparer,
  speakerComparer,
  adjudicatorComparer,
} from '../general/sortings.js'
import { sillyLogger } from '../general/loggers.js'
import { accessDetail } from '../general/tools.js'
import {
  speakerResultsPrecheck,
  adjudicatorResultsPrecheck,
  teamResultsPrecheck,
  resultsPrecheck,
} from './checks.js'
import type { SpeakerEntity, TeamEntity, AdjudicatorEntity } from '../types/domain.js'
import type {
  RawAdjudicatorResult,
  RawSpeakerResult,
  RawTeamResult,
  AdjudicatorRoundResult,
  CompiledAdjudicatorResult,
  CompiledSpeakerResult,
  CompiledTeamResult,
  ResultsSummaryStyle,
  SpeakerRoundResult,
  TeamRoundResult,
} from '../types/results.js'
import type { Side } from '../types/domain.js'

type Ranked = { id: number; ranking?: number }

function insertRanking<T extends Ranked>(
  list: T[],
  comparer: (list: T[], a: number, b: number) => number
): T[] {
  sillyLogger(insertRanking, arguments, 'results')
  const ids = list.map((entity) => entity.id)
  if (ids.length === 0) return list
  ids.sort((a, b) => comparer(list, a, b))
  findResult(list, ids[0]).ranking = 1
  let ranking = 1
  let stay = 0
  for (let i = 1; i < ids.length; i += 1) {
    if (comparer(list, ids[i], ids[i - 1]) === 1) {
      ranking += 1 + stay
      stay = 0
    } else {
      stay += 1
    }
    findResult(list, ids[i]).ranking = ranking
  }
  return list
}

function sumByEach(a: number[], b: number[]): number[] {
  const newList: number[] = []
  for (let i = 0, limit = Math.min(a.length, b.length); i < limit; i += 1) {
    newList.push(a[i] + b[i])
  }
  return newList
}

function toUserDefinedCollection(
  list: Array<{ user_defined_data?: Record<string, unknown> }>
): Record<string, unknown>[] {
  return list
    .map((item) => item.user_defined_data)
    .filter((value): value is Record<string, unknown> => value !== null && value !== undefined)
}

function getWeightedScore(scores: number[], style: ResultsSummaryStyle): number {
  const scoreWeights = style.score_weights
  let score = 0
  let sumWeight = 0
  for (let i = 0; i < scores.length; i += 1) {
    if (scores[i] !== 0) {
      score += scores[i]
      sumWeight += scoreWeights[i] ?? 0
    }
  }
  return sumWeight === 0 ? 0 : score / sumWeight
}

export function summarizeSpeakerResults(
  speakerInstances: SpeakerEntity[],
  rawSpeakerResults: RawSpeakerResult[],
  style: ResultsSummaryStyle,
  r: number
): SpeakerRoundResult[] {
  sillyLogger(summarizeSpeakerResults, arguments, 'results')
  const speakers = speakerInstances.map((speaker) => speaker.id)
  const results: SpeakerRoundResult[] = []
  for (const id of speakers) {
    const filtered = rawSpeakerResults.filter((raw) => raw.r === r && raw.id === id)
    if (filtered.length === 0) continue
    const scoresList = filtered.map((raw) => raw.scores)
    const scores = scoresList
      .reduce((left, right) => sumByEach(left, right))
      .map((score) => score / scoresList.length)
    const result: SpeakerRoundResult = {
      r,
      id,
      scores,
      average: getWeightedScore(scores, style),
      sum: sum(scores),
      user_defined_data_collection: toUserDefinedCollection(filtered),
    }
    results.push(result)
  }
  insertRanking(results, speakerSimpleComparer)
  return results
}

export function summarizeAdjudicatorResults(
  adjudicatorInstances: AdjudicatorEntity[],
  rawAdjResults: RawAdjudicatorResult[],
  r: number
): AdjudicatorRoundResult[] {
  sillyLogger(summarizeAdjudicatorResults, arguments, 'results')
  const adjudicators = adjudicatorInstances.map((adjudicator) => adjudicator.id)
  const results: AdjudicatorRoundResult[] = []
  for (const id of adjudicators) {
    const filtered = rawAdjResults.filter((raw) => raw.r === r && raw.id === id)
    if (filtered.length === 0) continue
    const score = average(filtered.map((raw) => raw.score))
    const judgedTeams = filtered[0].judged_teams
    const comments = filtered.map((raw) => raw.comment ?? '').filter(Boolean)
    results.push({
      r,
      id,
      score,
      judged_teams: judgedTeams,
      comments,
      user_defined_data_collection: toUserDefinedCollection(filtered),
    })
  }
  insertRanking(results, adjudicatorSimpleComparer)
  return results
}

export function summarizeTeamResults(
  teamInstances: TeamEntity[],
  rawTeamResults: RawTeamResult[],
  r: number,
  style: ResultsSummaryStyle
): TeamRoundResult[] {
  sillyLogger(summarizeTeamResults, arguments, 'results')
  const results: TeamRoundResult[] = []
  const teams = teamInstances.map((team) => team.id)
  const teamNum = style.team_num
  for (const id of teams) {
    const filtered = rawTeamResults.filter((raw) => raw.id === id && raw.r === r)
    if (filtered.length === 0) continue
    let vote: number | null
    let voteRate: number | null
    let win: number
    const winValues = filtered
      .map((raw) => (typeof raw.win === 'number' ? raw.win : Number(raw.win)))
      .filter((value) => Number.isFinite(value))
    const hasFractionalWin = winValues.some((value) => value !== 0 && value !== 1)
    if (teamNum === 2) {
      if (hasFractionalWin) {
        const winTotal = sum(winValues)
        vote = winTotal - (filtered.length - winTotal)
        voteRate = filtered.length === 0 ? 0 : winTotal / filtered.length
        win = filtered.length === 0 ? 0 : winTotal / filtered.length
      } else {
        vote =
          count(
            filtered.map((raw) => raw.win),
            1
          ) -
          count(
            filtered.map((raw) => raw.win),
            0
          )
        voteRate =
          count(
            filtered.map((raw) => raw.win),
            1
          ) / filtered.length
        win = vote > 0 ? 1 : 0
      }
    } else {
      vote = null
      voteRate = null
      win = filtered[0].win
    }
    const opponents = filtered[0].opponents
    const side = filtered[0].side
    results.push({
      r,
      id,
      win,
      opponents,
      side,
      sum: null,
      opponent_average: null,
      vote,
      vote_rate: voteRate,
      acc: filtered.length,
      margin: null,
      user_defined_data_collection: toUserDefinedCollection(filtered),
    })
  }
  insertRanking(results, teamSimpleComparer)
  return results
}

export function integrateTeamAndSpeakerResults(
  teams: TeamEntity[],
  teamResults: TeamRoundResult[],
  speakerResults: SpeakerRoundResult[],
  r: number
): TeamRoundResult[] {
  sillyLogger(integrateTeamAndSpeakerResults, arguments, 'results')
  const results: TeamRoundResult[] = []
  for (const teamResult of teamResults) {
    const team = teams.find((entity) => entity.id === teamResult.id)
    if (!team) {
      throw new Error(`team ${teamResult.id} not found`)
    }
    const speakers = Array.from(new Set(accessDetail(team, r).speakers ?? [])) as number[]
    const filteredSpeakerResults = ([] as SpeakerRoundResult[]).concat(
      ...speakers.map((id) => speakerResults.filter((raw) => raw.r === r && raw.id === id))
    )
    const sumScore =
      filteredSpeakerResults.length === 0
        ? null
        : sum(filteredSpeakerResults.map((raw) => raw.sum))
    const result: TeamRoundResult = {
      r: teamResult.r,
      id: teamResult.id,
      win: teamResult.win,
      opponents: teamResult.opponents,
      side: teamResult.side,
      sum: sumScore,
      vote: teamResult.vote,
      vote_rate: teamResult.vote_rate,
      acc: teamResult.acc,
      margin: null,
      opponent_average: null,
      user_defined_data_collection: teamResult.user_defined_data_collection,
    }
    results.push(result)
  }
  for (const result of results) {
    if (result.sum === null) {
      result.margin = null
      result.opponent_average = null
      continue
    }
    const opponentsSum = sum(
      result.opponents.map((opponentId) => Number(findResult(results, opponentId).sum ?? 0))
    )
    result.margin = result.sum - opponentsSum / result.opponents.length
    result.opponent_average = opponentsSum / result.opponents.length
  }
  insertRanking(results, teamComparer)
  return results
}

export function compileSpeakerResults(
  speakerInstances: SpeakerEntity[],
  rawSpeakerResults: RawSpeakerResult[],
  style: ResultsSummaryStyle,
  rs: number[]
): CompiledSpeakerResult[] {
  sillyLogger(compileSpeakerResults, arguments, 'results')
  const results: CompiledSpeakerResult[] = []
  const speakers = speakerInstances.map((speaker) => speaker.id)
  const averages: Record<number, number[]> = {}
  const details: Record<number, SpeakerRoundResult[]> = {}
  for (const id of speakers) {
    averages[id] = []
    details[id] = []
  }
  for (const r of rs) {
    const summarized = summarizeSpeakerResults(speakerInstances, rawSpeakerResults, style, r)
    for (const result of summarized) {
      averages[result.id].push(result.average)
      details[result.id].push(result)
    }
  }
  for (const id of speakers) {
    results.push({
      id,
      average: average(averages[id]),
      sum: sum(averages[id]),
      sd: sd(averages[id]),
      details: details[id],
    })
  }
  insertRanking(results, speakerComparer)
  return results
}

export function compileAdjudicatorResults(
  adjudicatorInstances: AdjudicatorEntity[],
  rawAdjResults: RawAdjudicatorResult[],
  rs: number[]
): CompiledAdjudicatorResult[] {
  sillyLogger(compileAdjudicatorResults, arguments, 'results')
  const results: CompiledAdjudicatorResult[] = []
  const adjudicators = adjudicatorInstances.map((adjudicator) => adjudicator.id)
  const averages: Record<number, number[]> = {}
  const details: Record<number, AdjudicatorRoundResult[]> = {}
  const judgedTeams: Record<number, number[]> = {}
  const activeNum: Record<number, number> = {}
  for (const id of adjudicators) {
    averages[id] = []
    details[id] = []
    judgedTeams[id] = []
    activeNum[id] = 0
  }
  for (const r of rs) {
    const summarized = summarizeAdjudicatorResults(adjudicatorInstances, rawAdjResults, r)
    for (const result of summarized) {
      averages[result.id].push(result.score)
      details[result.id].push(result)
      judgedTeams[result.id] = judgedTeams[result.id].concat(result.judged_teams)
      activeNum[result.id] += 1
    }
  }
  for (const id of adjudicators) {
    results.push({
      id,
      average: average(averages[id]),
      sd: sd(averages[id]),
      judged_teams: judgedTeams[id],
      active_num: activeNum[id],
      details: details[id],
    })
  }
  insertRanking(results, adjudicatorComparer)
  return results
}

type SimpleCompileTeamArgs = [
  teamInstances: TeamEntity[],
  rawTeamResults: RawTeamResult[],
  rs: number[],
  style: ResultsSummaryStyle,
]

type FullCompileTeamArgs = [
  teamInstances: TeamEntity[],
  speakerInstances: SpeakerEntity[],
  rawTeamResults: RawTeamResult[],
  rawSpeakerResults: RawSpeakerResult[],
  rs: number[],
  style: ResultsSummaryStyle,
]

export function compileTeamResults(...args: SimpleCompileTeamArgs): CompiledTeamResult[]
export function compileTeamResults(...args: FullCompileTeamArgs): CompiledTeamResult[]
export function compileTeamResults(
  ...args: SimpleCompileTeamArgs | FullCompileTeamArgs
): CompiledTeamResult[] {
  const simple = args.length === 4
  let teamInstances: TeamEntity[]
  let rawTeamResults: RawTeamResult[]
  let rs: number[]
  let style: ResultsSummaryStyle
  let speakerInstances: SpeakerEntity[] = []
  let rawSpeakerResults: RawSpeakerResult[] = []
  if (simple) {
    ;[teamInstances, rawTeamResults, rs, style] = args as SimpleCompileTeamArgs
  } else {
    ;[teamInstances, speakerInstances, rawTeamResults, rawSpeakerResults, rs, style] =
      args as FullCompileTeamArgs
  }

  sillyLogger(compileTeamResults, arguments, 'results')
  const results: CompiledTeamResult[] = []
  const teams = teamInstances.map((team) => team.id)
  const sums: Record<number, number[]> = {}
  const details: Record<number, TeamRoundResult[]> = {}
  const margins: Record<number, number[]> = {}
  const opponentAverages: Record<number, number[]> = {}
  const wins: Record<number, number[]> = {}
  const opponents: Record<number, number[]> = {}
  const sides: Record<number, Array<Side | string>> = {}
  const votes: Record<number, number> = {}
  const accs: Record<number, number> = {}

  for (const id of teams) {
    sums[id] = []
    details[id] = []
    margins[id] = []
    opponentAverages[id] = []
    wins[id] = []
    opponents[id] = []
    sides[id] = []
    votes[id] = 0
    accs[id] = 0
  }

  for (const r of rs) {
    const summarizedTeamResultsBefore = summarizeTeamResults(teamInstances, rawTeamResults, r, style)
    const summarizedTeamResults = simple
      ? summarizedTeamResultsBefore
      : integrateTeamAndSpeakerResults(
          teamInstances,
          summarizedTeamResultsBefore,
          summarizeSpeakerResults(speakerInstances, rawSpeakerResults, style, r),
          r
        )
    for (const result of summarizedTeamResults) {
      const id = result.id
      votes[id] += result.vote ?? 0
      opponents[id] = opponents[id].concat(result.opponents)
      accs[id] += result.acc
      wins[id].push(result.win)
      sides[id].push(result.side)
      if (!simple) {
        sums[id].push(Number(result.sum ?? 0))
        opponentAverages[id].push(Number(result.opponent_average ?? 0))
        margins[id].push(Number(result.margin ?? 0))
      }
      details[id].push(result)
    }
  }

  for (const id of teams) {
    results.push({
      id,
      win: sum(wins[id]),
      vote: votes[id],
      vote_rate: accs[id] === 0 ? 0 : votes[id] / accs[id],
      details: details[id],
      past_opponents: opponents[id],
      past_sides: sides[id],
      sum: simple ? null : sum(sums[id]),
      margin: simple ? null : sum(margins[id]),
      average_margin: simple ? null : average(margins[id]),
      average: simple ? null : average(sums[id]),
      sd: simple ? null : sd(sums[id]),
      opponent_average: simple ? null : average(opponentAverages[id]),
    })
  }
  insertRanking(results, teamComparer)
  return results
}

export const teams = {
  compile: compileTeamResults,
  simple_compile: compileTeamResults,
  precheck: teamResultsPrecheck,
}

export const speakers = {
  compile: compileSpeakerResults,
  precheck: speakerResultsPrecheck,
}

export const adjudicators = {
  compile: compileAdjudicatorResults,
  precheck: adjudicatorResultsPrecheck,
}

export const precheck = (teamsArr: TeamEntity[], speakersArr: SpeakerEntity[], r: number) => {
  sillyLogger(() => {}, [teamsArr, speakersArr, r], 'results')
  resultsPrecheck(teamsArr, speakersArr, r)
}

export default {
  teams,
  speakers,
  adjudicators,
  precheck,
  summarizeSpeakerResults,
  summarizeAdjudicatorResults,
  summarizeTeamResults,
  integrateTeamAndSpeakerResults,
  compileSpeakerResults,
  compileAdjudicatorResults,
  compileTeamResults,
}
