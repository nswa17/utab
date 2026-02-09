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

function insertRanking(list: any[], comparer: (list: any[], a: number, b: number) => number) {
  sillyLogger(insertRanking, arguments, 'results')
  const ids = list.map((e) => e.id)
  if (ids.length === 0) return list
  ids.sort((a, b) => comparer(list, a, b))
  findResult(list, ids[0]).ranking = 1
  let ranking = 1
  let stay = 0
  for (let i = 1; i < ids.length; i++) {
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
  for (let i = 0, M = Math.min(a.length, b.length); i < M; i++) newList.push(a[i] + b[i])
  return newList
}

function getWeightedScore(scores: number[], style: any): number {
  const scoreWeights = style.score_weights
  let score = 0
  let sumWeight = 0
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] !== 0) {
      score += scores[i]
      sumWeight += scoreWeights[i]
    }
  }
  return sumWeight === 0 ? 0 : score / sumWeight
}

export function summarizeSpeakerResults(
  speakerInstances: any[],
  rawSpeakerResults: any[],
  style: any,
  r: number
) {
  sillyLogger(summarizeSpeakerResults, arguments, 'results')
  const speakers = speakerInstances.map((d) => d.id)
  const results: any[] = []
  for (const id of speakers) {
    const filtered = rawSpeakerResults.filter((dr) => dr.r === r && dr.id === id)
    if (filtered.length === 0) continue
    const scoresList = filtered.map((dr) => dr.scores)
    const scores = scoresList
      .reduce((a, b) => sumByEach(a, b))
      .map((sc: number) => sc / scoresList.length)
    const result = {
      r,
      id,
      scores,
      average: getWeightedScore(scores, style),
      sum: sum(scores),
      user_defined_data_collection: filtered
        .map((dr) => dr.user_defined_data)
        .filter((d) => d !== null && d !== undefined),
    }
    results.push(result)
  }
  insertRanking(results, speakerSimpleComparer)
  return results
}

export function summarizeAdjudicatorResults(
  adjudicatorInstances: any[],
  rawAdjResults: any[],
  r: number
) {
  sillyLogger(summarizeAdjudicatorResults, arguments, 'results')
  const adjudicators = adjudicatorInstances.map((a) => a.id)
  const results: any[] = []
  for (const id of adjudicators) {
    const filtered = rawAdjResults.filter((ar) => ar.r === r && ar.id === id)
    if (filtered.length === 0) continue
    const score = average(filtered.map((ar) => ar.score))
    const judgedTeams = filtered[0].judged_teams
    const comments = filtered.map((ar) => ar.comment).filter(Boolean)
    results.push({
      r,
      id,
      score,
      judged_teams: judgedTeams,
      comments,
      user_defined_data_collection: filtered
        .map((ar) => ar.user_defined_data)
        .filter((d) => d !== null && d !== undefined),
    })
  }
  insertRanking(results, adjudicatorSimpleComparer)
  return results
}

export function summarizeTeamResults(
  teamInstances: any[],
  rawTeamResults: any[],
  r: number,
  style: any
) {
  sillyLogger(summarizeTeamResults, arguments, 'results')
  const results: any[] = []
  const teams = teamInstances.map((t) => t.id)
  const teamNum = style.team_num
  for (const id of teams) {
    const filtered = rawTeamResults.filter((tr) => tr.id === id && tr.r === r)
    if (filtered.length === 0) continue
    let vote: number | null
    let voteRate: number | null
    let win: number
    if (teamNum === 2) {
      vote =
        count(
          filtered.map((tr) => tr.win),
          1
        ) -
        count(
          filtered.map((tr) => tr.win),
          0
        )
      voteRate =
        count(
          filtered.map((tr) => tr.win),
          1
        ) / filtered.length
      win = vote > 0 ? 1 : 0
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
      user_defined_data_collection: filtered
        .map((tr) => tr.user_defined_data)
        .filter((d) => d !== null && d !== undefined),
    })
  }
  insertRanking(results, teamSimpleComparer)
  return results
}

export function integrateTeamAndSpeakerResults(
  teams: any[],
  teamResults: any[],
  speakerResults: any[],
  r: number
) {
  sillyLogger(integrateTeamAndSpeakerResults, arguments, 'results')
  const results: any[] = []
  for (const teamResult of teamResults) {
    const team = teams.find((t) => t.id === teamResult.id)
    const speakers = Array.from(new Set(accessDetail(team, r).speakers ?? [])) as number[]
    const filteredSpeakerResults = ([] as any[]).concat(
      ...speakers.map((id) => speakerResults.filter((dr) => dr.r === r && dr.id === id))
    )
    const sumScore =
      filteredSpeakerResults.length === 0 ? null : sum(filteredSpeakerResults.map((dr) => dr.sum))
    const result = {
      r: teamResult.r,
      id: teamResult.id,
      win: teamResult.win,
      opponents: teamResult.opponents,
      side: teamResult.side,
      sum: sumScore,
      vote: teamResult.vote,
      vote_rate: teamResult.vote_rate,
      acc: teamResult.acc,
      user_defined_data_collection: teamResult.user_defined_data_collection,
    }
    results.push(result)
  }
  for (const result of results) {
    if (result.sum === null) {
      result.margin = null
      result.opponent_average = null
    } else {
      result.margin =
        result.sum -
        sum(result.opponents.map((opId: number) => findResult(results, opId).sum)) /
          result.opponents.length
      result.opponent_average =
        sum(result.opponents.map((opId: number) => findResult(results, opId).sum)) /
        result.opponents.length
    }
  }
  insertRanking(results, teamComparer)
  return results
}

export function compileSpeakerResults(
  speakerInstances: any[],
  rawSpeakerResults: any[],
  style: any,
  rs: number[]
) {
  sillyLogger(compileSpeakerResults, arguments, 'results')
  const results: any[] = []
  const speakers = speakerInstances.map((d) => d.id)
  const averages: Record<number, number[]> = {}
  const details: Record<number, any[]> = {}
  for (const id of speakers) {
    averages[id] = []
    details[id] = []
  }
  for (const r of rs) {
    const summarized = summarizeSpeakerResults(speakerInstances, rawSpeakerResults, style, r)
    for (const res of summarized) {
      averages[res.id].push(res.average)
      details[res.id].push(res)
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
  adjudicatorInstances: any[],
  rawAdjResults: any[],
  rs: number[]
) {
  sillyLogger(compileAdjudicatorResults, arguments, 'results')
  const results: any[] = []
  const adjudicators = adjudicatorInstances.map((a) => a.id)
  const averages: Record<number, number[]> = {}
  const details: Record<number, any[]> = {}
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
    for (const res of summarized) {
      averages[res.id].push(res.score)
      details[res.id].push(res)
      judgedTeams[res.id] = judgedTeams[res.id].concat(res.judged_teams)
      activeNum[res.id] += 1
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

export function compileTeamResults(...args: any[]) {
  const simple = args.length === 4
  let teamInstances: any[]
  let rawTeamResults: any[]
  let rs: number[]
  let style: any
  let speakerInstances: any[] = []
  let rawSpeakerResults: any[] = []
  if (simple) {
    ;[teamInstances, rawTeamResults, rs, style] = args as any
  } else {
    ;[teamInstances, speakerInstances, rawTeamResults, rawSpeakerResults, rs, style] = args as any
  }
  sillyLogger(compileTeamResults, arguments, 'results')
  const results: any[] = []
  const teams = teamInstances.map((t) => t.id)
  const sums: Record<number, number[]> = {}
  const details: Record<number, any[]> = {}
  const margins: Record<number, number[]> = {}
  const opponentAverages: Record<number, number[]> = {}
  const wins: Record<number, number[]> = {}
  const opponents: Record<number, number[]> = {}
  const sides: Record<number, string[]> = {}
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
    const summarizedTeamResultsBefore = summarizeTeamResults(
      teamInstances,
      rawTeamResults,
      r,
      style
    )
    const summarizedTeamResults = simple
      ? summarizedTeamResultsBefore
      : integrateTeamAndSpeakerResults(
          teamInstances,
          summarizedTeamResultsBefore,
          summarizeSpeakerResults(speakerInstances, rawSpeakerResults, style, r),
          r
        )
    for (const res of summarizedTeamResults) {
      const id = res.id
      votes[id] += res.vote
      opponents[id] = opponents[id].concat(res.opponents)
      accs[id] += res.acc
      wins[id].push(res.win)
      sides[id].push(res.side)
      if (!simple) {
        sums[id].push(res.sum)
        opponentAverages[id].push(res.opponent_average)
        margins[id].push(res.margin)
      }
      details[id].push(res)
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
export const precheck = (teamsArr: any[], speakersArr: any[], r: number) => {
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
