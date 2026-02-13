import { Types, type Connection } from 'mongoose'
import type { RequestHandler } from 'express'
import { results as coreResults } from '@utab/core'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { TournamentModel } from '../models/tournament.js'
import { StyleModel } from '../models/style.js'
import { getCompiledModel } from '../models/compiled.js'
import { getSubmissionModel } from '../models/submission.js'
import { getTeamModel } from '../models/team.js'
import { getAdjudicatorModel } from '../models/adjudicator.js'
import { getDrawModel } from '../models/draw.js'
import { getRoundModel } from '../models/round.js'
import { getRawTeamResultModel } from '../models/raw-team-result.js'
import { getRawSpeakerResultModel } from '../models/raw-speaker-result.js'
import { getRawAdjudicatorResultModel } from '../models/raw-adjudicator-result.js'
import {
  sanitizeCompiledForPublic,
  sanitizeCompiledSubsetForPublic,
} from '../services/response-sanitizer.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import {
  DEFAULT_COMPILE_OPTIONS,
  normalizeCompileOptions,
  type CompileIncludeLabel,
  type CompileOptions,
  type CompileOptionsInput,
} from '../types/compiled-options.js'

type BallotPayload = {
  teamAId?: string
  teamBId?: string
  winnerId?: string
  submittedEntityId?: string
  speakerIdsA?: unknown
  speakerIdsB?: unknown
  scoresA?: unknown
  scoresB?: unknown
  comment?: string
}

type FeedbackPayload = {
  adjudicatorId?: string
  score?: unknown
  comment?: string
}

type CompiledPayload = {
  tournamentId: string
  rounds: Array<{ r: number; name: string }>
  compile_options: CompileOptions
  compile_warnings: string[]
  compile_diff_meta: CompileDiffMeta
  compiled_team_results: any[]
  compiled_speaker_results: any[]
  compiled_adjudicator_results: any[]
}

type CompiledResultsKey =
  | 'compiled_team_results'
  | 'compiled_speaker_results'
  | 'compiled_adjudicator_results'

type CompiledSubset = {
  compiledId: string
  tournamentId: string
  rounds: Array<{ r: number; name: string }>
  compile_options: CompileOptions
  compile_warnings: string[]
  compile_diff_meta: CompileDiffMeta
  results: any[]
}

type MissingDataIssue = {
  code: string
  message: string
  round?: number
  submissionId?: string
}

type DiffRankingTrend = 'improved' | 'worsened' | 'unchanged' | 'new' | 'na'

type DiffMetric = {
  baseline: number | null
  delta: number | null
}

type DiffRanking = {
  baseline: number | null
  delta: number | null
  trend: DiffRankingTrend
}

type CompileDiffMeta = {
  baseline_mode: CompileOptions['diff_baseline']['mode']
  requested_compiled_id?: string
  baseline_compiled_id: string | null
  baseline_found: boolean
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === 'number' ? item : Number(item)))
}

function sumScores(scores: number[]): number {
  return scores.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0)
}

function normalizeScoreWeights(scoreWeights: any): number[] {
  if (Array.isArray(scoreWeights)) {
    if (scoreWeights.every((v) => typeof v === 'number')) return scoreWeights
    if (scoreWeights.every((v) => v && typeof v === 'object' && 'value' in v)) {
      return scoreWeights.map((v) => Number(v.value))
    }
  }
  return [1]
}

function buildDetailsForRounds(
  details: any[] | undefined,
  rounds: number[],
  defaults: Record<string, unknown>
) {
  return rounds.map((r) => {
    const existing = details?.find((d) => d.r === r) ?? {}
    return { r, ...defaults, ...existing }
  })
}

function resolveRounds(
  provided: number[] | undefined,
  rawTeamResults: Array<{ r?: number }>,
  rawSpeakerResults: Array<{ r?: number }>,
  rawAdjudicatorResults: Array<{ r?: number }>
): number[] {
  if (Array.isArray(provided) && provided.length > 0) {
    return Array.from(new Set(provided)).filter(Number.isFinite).sort((a, b) => a - b)
  }
  const roundsSet = new Set<number>()
  rawTeamResults.forEach((result) => {
    const r = Number(result.r)
    if (Number.isFinite(r)) roundsSet.add(r)
  })
  rawSpeakerResults.forEach((result) => {
    const r = Number(result.r)
    if (Number.isFinite(r)) roundsSet.add(r)
  })
  rawAdjudicatorResults.forEach((result) => {
    const r = Number(result.r)
    if (Number.isFinite(r)) roundsSet.add(r)
  })
  return Array.from(roundsSet).sort((a, b) => a - b)
}

function resolveRoundsFromSubmissions(
  provided: number[] | undefined,
  submissions: Array<{ round?: number }>,
  draws: Array<{ round?: number }>
): number[] {
  if (Array.isArray(provided) && provided.length > 0) {
    return Array.from(new Set(provided)).filter(Number.isFinite).sort((a, b) => a - b)
  }
  const roundsSet = new Set<number>()
  submissions.forEach((submission) => {
    const round = Number(submission.round)
    if (Number.isFinite(round)) roundsSet.add(round)
  })
  draws.forEach((draw) => {
    const round = Number(draw.round)
    if (Number.isFinite(round)) roundsSet.add(round)
  })
  return Array.from(roundsSet).sort((a, b) => a - b)
}

function toNumericValue(value: unknown, mode: 'desc' | 'asc'): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return mode === 'desc' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
}

function compareByNumericValue(
  left: unknown,
  right: unknown,
  mode: 'desc' | 'asc'
): number {
  const a = toNumericValue(left, mode)
  const b = toNumericValue(right, mode)
  if (a === b) return 0
  if (mode === 'desc') return a > b ? -1 : 1
  return a < b ? -1 : 1
}

function compareTeamsByRankingMetrics(
  left: any,
  right: any,
  order: CompileOptions['ranking_priority']['order']
): number {
  for (const metric of order) {
    const mode = metric === 'sd' ? 'asc' : 'desc'
    const compared = compareByNumericValue(left?.[metric], right?.[metric], mode)
    if (compared !== 0) return compared
  }
  return 0
}

function compareTeamsByRankingPriority(
  left: any,
  right: any,
  order: CompileOptions['ranking_priority']['order']
): number {
  const metricsCompared = compareTeamsByRankingMetrics(left, right, order)
  if (metricsCompared !== 0) return metricsCompared
  const leftId = String(left?.id ?? '')
  const rightId = String(right?.id ?? '')
  if (leftId === rightId) return 0
  return leftId < rightId ? -1 : 1
}

function applyTeamRankingPriority(
  teamResults: any[],
  compileOptions: CompileOptions
): any[] {
  if (compileOptions.ranking_priority.preset !== 'custom') return teamResults
  const sorted = [...teamResults]
  sorted.sort((left, right) =>
    compareTeamsByRankingPriority(left, right, compileOptions.ranking_priority.order)
  )
  let currentRank = 1
  for (let index = 0; index < sorted.length; index += 1) {
    if (index > 0) {
      const compared = compareTeamsByRankingMetrics(
        sorted[index],
        sorted[index - 1],
        compileOptions.ranking_priority.order
      )
      if (compared !== 0) currentRank = index + 1
    }
    sorted[index] = { ...sorted[index], ranking: currentRank }
  }
  return sorted
}

function applyIncludeLabels(
  compileOptions: CompileOptions,
  compiled: Pick<
    CompiledPayload,
    'compiled_team_results' | 'compiled_speaker_results' | 'compiled_adjudicator_results'
  >
) {
  const labels = new Set<CompileIncludeLabel>(compileOptions.include_labels)
  if (!labels.has('teams')) {
    compiled.compiled_team_results = []
  }
  if (!labels.has('adjudicators')) {
    compiled.compiled_adjudicator_results = []
  }
  const needsSpeakerBase = labels.has('speakers') || labels.has('poi') || labels.has('best')
  if (!needsSpeakerBase) {
    compiled.compiled_speaker_results = []
  }
}

const TEAM_DIFF_KEYS = ['win', 'sum', 'margin', 'vote', 'average', 'sd']
const SPEAKER_DIFF_KEYS = ['average', 'sum', 'sd']
const ADJUDICATOR_DIFF_KEYS = ['average', 'sd', 'num_experienced', 'num_experienced_chair']

function buildDefaultDiffMeta(compileOptions: CompileOptions): CompileDiffMeta {
  return {
    baseline_mode: compileOptions.diff_baseline.mode,
    requested_compiled_id:
      compileOptions.diff_baseline.mode === 'compiled'
        ? compileOptions.diff_baseline.compiled_id
        : undefined,
    baseline_compiled_id: null,
    baseline_found: false,
  }
}

function toFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function buildMetricDiff(currentValue: unknown, baselineValue: unknown): DiffMetric {
  const current = toFiniteNumberOrNull(currentValue)
  const baseline = toFiniteNumberOrNull(baselineValue)
  if (current === null || baseline === null) {
    return { baseline, delta: null }
  }
  return { baseline, delta: current - baseline }
}

function buildRankingDiff(currentValue: unknown, baselineValue: unknown): DiffRanking {
  const current = toFiniteNumberOrNull(currentValue)
  const baseline = toFiniteNumberOrNull(baselineValue)
  if (current === null || baseline === null) {
    if (current !== null && baseline === null) {
      return { baseline: null, delta: null, trend: 'new' }
    }
    return { baseline, delta: null, trend: 'na' }
  }
  const delta = current - baseline
  if (delta < 0) return { baseline, delta, trend: 'improved' }
  if (delta > 0) return { baseline, delta, trend: 'worsened' }
  return { baseline, delta: 0, trend: 'unchanged' }
}

function applyResultDiffs(
  currentResults: any[],
  baselineResults: any[],
  metricKeys: string[]
): any[] {
  const baselineById = new Map<string, any>()
  baselineResults.forEach((item) => {
    const id = String(item?.id ?? '')
    if (!id) return
    baselineById.set(id, item)
  })
  return currentResults.map((row) => {
    const rowId = String(row?.id ?? '')
    const baseline = baselineById.get(rowId)
    const metrics = Object.fromEntries(
      metricKeys.map((key) => [key, buildMetricDiff(row?.[key], baseline?.[key])])
    )
    return {
      ...row,
      diff: {
        ranking: buildRankingDiff(row?.ranking, baseline?.ranking),
        metrics,
      },
    }
  })
}

async function resolveDiffBaselineDoc(
  connection: Connection,
  tournamentId: string,
  compileOptions: CompileOptions
) {
  const CompiledModel = getCompiledModel(connection)
  if (compileOptions.diff_baseline.mode === 'compiled') {
    if (!Types.ObjectId.isValid(compileOptions.diff_baseline.compiled_id)) {
      return null
    }
    return CompiledModel.findOne({
      _id: compileOptions.diff_baseline.compiled_id,
      tournamentId,
    })
      .lean()
      .exec()
  }
  return CompiledModel.findOne({ tournamentId }).sort({ createdAt: -1 }).lean().exec()
}

async function attachDiffAgainstBaseline(
  payload: CompiledPayload,
  connection: Connection
): Promise<void> {
  const compileOptions = payload.compile_options
  payload.compile_diff_meta = buildDefaultDiffMeta(compileOptions)
  const baselineDoc = await resolveDiffBaselineDoc(connection, payload.tournamentId, compileOptions)
  if (!baselineDoc) {
    return
  }
  const baselinePayload = (baselineDoc as any)?.payload ?? {}
  payload.compile_diff_meta = {
    ...payload.compile_diff_meta,
    baseline_compiled_id: String((baselineDoc as any)?._id ?? ''),
    baseline_found: true,
  }
  payload.compiled_team_results = applyResultDiffs(
    payload.compiled_team_results,
    Array.isArray(baselinePayload.compiled_team_results)
      ? baselinePayload.compiled_team_results
      : [],
    TEAM_DIFF_KEYS
  )
  payload.compiled_speaker_results = applyResultDiffs(
    payload.compiled_speaker_results,
    Array.isArray(baselinePayload.compiled_speaker_results)
      ? baselinePayload.compiled_speaker_results
      : [],
    SPEAKER_DIFF_KEYS
  )
  payload.compiled_adjudicator_results = applyResultDiffs(
    payload.compiled_adjudicator_results,
    Array.isArray(baselinePayload.compiled_adjudicator_results)
      ? baselinePayload.compiled_adjudicator_results
      : [],
    ADJUDICATOR_DIFF_KEYS
  )
}

function buildMissingIssueMessage(issue: MissingDataIssue): string {
  const prefix = issue.round ? `Round ${issue.round}` : 'Round ?'
  const submissionToken = issue.submissionId ? ` / submission ${issue.submissionId}` : ''
  return `${prefix}${submissionToken}: ${issue.message}`
}

function finalizeMissingDataIssues(
  issues: MissingDataIssue[],
  compileOptions: CompileOptions
): string[] {
  if (issues.length === 0) return []
  const messages = issues.map(buildMissingIssueMessage)
  if (compileOptions.missing_data_policy === 'error') {
    const err = new Error(`Missing data detected: ${messages[0]}`)
    ;(err as any).status = 400
    throw err
  }
  return compileOptions.missing_data_policy === 'warn' ? messages : []
}

function canonicalBallotMatchKey(round: number, payload: BallotPayload): string {
  const teamA = String(payload.teamAId ?? '').trim()
  const teamB = String(payload.teamBId ?? '').trim()
  if (!teamA || !teamB) return `${round}:invalid`
  const ordered = [teamA, teamB].sort()
  return `${round}:${ordered[0]}:${ordered[1]}`
}

function resolveBallotSubmissionActor(submission: any): string {
  const payloadActor = String((submission?.payload as BallotPayload | undefined)?.submittedEntityId ?? '').trim()
  if (payloadActor) return payloadActor
  const submittedBy = String(submission?.submittedBy ?? '').trim()
  if (submittedBy) return submittedBy
  const submissionId = String(submission?._id ?? '').trim()
  return submissionId ? `submission:${submissionId}` : ''
}

function canonicalBallotDuplicateKey(submission: any): string {
  const round = Number(submission?.round)
  const matchKey = canonicalBallotMatchKey(round, (submission?.payload ?? {}) as BallotPayload)
  const actor = resolveBallotSubmissionActor(submission)
  return actor ? `${matchKey}:${actor}` : matchKey
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item)).map((item) => item.trim())
}

function toBooleanArray(value: unknown): boolean[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => Boolean(item))
}

function averageFiniteNumbers(values: number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return null
  return sumScores(finite) / finite.length
}

function averageNumberArrays(values: number[][]): number[] {
  const maxLength = values.reduce((current, list) => Math.max(current, list.length), 0)
  const averaged: number[] = []
  for (let index = 0; index < maxLength; index += 1) {
    const atIndex = values
      .map((list) => list[index])
      .filter((value): value is number => Number.isFinite(value))
    averaged.push(atIndex.length > 0 ? sumScores(atIndex) / atIndex.length : Number.NaN)
  }
  return averaged
}

function aggregateBooleanArrays(
  values: boolean[][],
  policy: CompileOptions['duplicate_normalization']['best_aggregation']
): boolean[] {
  const maxLength = values.reduce((current, list) => Math.max(current, list.length), 0)
  const aggregated: boolean[] = []
  for (let index = 0; index < maxLength; index += 1) {
    const atIndex = values
      .map((list) => list[index])
      .filter((value): value is boolean => typeof value === 'boolean')
    if (atIndex.length === 0) {
      aggregated.push(false)
      continue
    }
    if (policy === 'max') {
      aggregated.push(atIndex.some(Boolean))
      continue
    }
    const trueRate = atIndex.filter(Boolean).length / atIndex.length
    aggregated.push(trueRate >= 0.5)
  }
  return aggregated
}

function orientBallotPayload(
  payload: Record<string, unknown>,
  teamAId: string,
  teamBId: string
): Record<string, unknown> | null {
  const payloadTeamAId = String(payload.teamAId ?? '').trim()
  const payloadTeamBId = String(payload.teamBId ?? '').trim()
  if (!payloadTeamAId || !payloadTeamBId) return null
  if (payloadTeamAId === teamAId && payloadTeamBId === teamBId) return { ...payload, teamAId, teamBId }
  if (payloadTeamAId === teamBId && payloadTeamBId === teamAId) {
    return {
      ...payload,
      teamAId,
      teamBId,
      speakerIdsA: payload.speakerIdsB,
      speakerIdsB: payload.speakerIdsA,
      scoresA: payload.scoresB,
      scoresB: payload.scoresA,
      bestA: payload.bestB,
      bestB: payload.bestA,
      poiA: payload.poiB,
      poiB: payload.poiA,
      matterA: payload.matterB,
      matterB: payload.matterA,
      mannerA: payload.mannerB,
      mannerB: payload.mannerA,
    }
  }
  return null
}

function mergeAverageBallotGroup(grouped: any[], key: string, compileOptions: CompileOptions): any {
  const firstPayload = (grouped[0]?.payload ?? {}) as Record<string, unknown>
  const teamAId = String(firstPayload.teamAId ?? '').trim()
  const teamBId = String(firstPayload.teamBId ?? '').trim()
  if (!teamAId || !teamBId || teamAId === teamBId) return grouped[0]

  const orientedPayloads = grouped
    .map((submission) =>
      orientBallotPayload((submission?.payload ?? {}) as Record<string, unknown>, teamAId, teamBId)
    )
    .filter((payload): payload is Record<string, unknown> => Boolean(payload))
  if (orientedPayloads.length === 0) return grouped[0]

  const averagedScoresA = averageNumberArrays(
    orientedPayloads.map((payload) => toNumberArray(payload.scoresA))
  )
  const averagedScoresB = averageNumberArrays(
    orientedPayloads.map((payload) => toNumberArray(payload.scoresB))
  )
  const averagedMatterA = averageNumberArrays(
    orientedPayloads.map((payload) => toNumberArray(payload.matterA))
  )
  const averagedMannerA = averageNumberArrays(
    orientedPayloads.map((payload) => toNumberArray(payload.mannerA))
  )
  const averagedMatterB = averageNumberArrays(
    orientedPayloads.map((payload) => toNumberArray(payload.matterB))
  )
  const averagedMannerB = averageNumberArrays(
    orientedPayloads.map((payload) => toNumberArray(payload.mannerB))
  )

  const aggregatedBestA = aggregateBooleanArrays(
    orientedPayloads.map((payload) => toBooleanArray(payload.bestA)),
    compileOptions.duplicate_normalization.best_aggregation
  )
  const aggregatedBestB = aggregateBooleanArrays(
    orientedPayloads.map((payload) => toBooleanArray(payload.bestB)),
    compileOptions.duplicate_normalization.best_aggregation
  )
  const aggregatedPoiA = aggregateBooleanArrays(
    orientedPayloads.map((payload) => toBooleanArray(payload.poiA)),
    compileOptions.duplicate_normalization.poi_aggregation
  )
  const aggregatedPoiB = aggregateBooleanArrays(
    orientedPayloads.map((payload) => toBooleanArray(payload.poiB)),
    compileOptions.duplicate_normalization.poi_aggregation
  )

  const speakerIdsA =
    orientedPayloads
      .map((payload) => toStringArray(payload.speakerIdsA))
      .find((value) => value.some((item) => item.length > 0)) ?? []
  const speakerIdsB =
    orientedPayloads
      .map((payload) => toStringArray(payload.speakerIdsB))
      .find((value) => value.some((item) => item.length > 0)) ?? []

  const winsA = orientedPayloads.map((payload) => {
    const totalA = sumScores(toNumberArray(payload.scoresA))
    const totalB = sumScores(toNumberArray(payload.scoresB))
    const winnerId = resolveWinnerForBallot(
      payload as BallotPayload,
      compileOptions.winner_policy,
      totalA,
      totalB
    )
    return winnerId === teamAId ? 1 : winnerId ? 0 : compileOptions.tie_points
  })
  const winsB = orientedPayloads.map((payload) => {
    const totalA = sumScores(toNumberArray(payload.scoresA))
    const totalB = sumScores(toNumberArray(payload.scoresB))
    const winnerId = resolveWinnerForBallot(
      payload as BallotPayload,
      compileOptions.winner_policy,
      totalA,
      totalB
    )
    return winnerId === teamBId ? 1 : winnerId ? 0 : compileOptions.tie_points
  })
  const averagedWinA = averageFiniteNumbers(winsA)
  const averagedWinB = averageFiniteNumbers(winsB)

  return {
    ...grouped[0],
    _id: `avg:${key}`,
    payload: {
      ...orientedPayloads[0],
      teamAId,
      teamBId,
      winnerId: '',
      speakerIdsA,
      speakerIdsB,
      scoresA: averagedScoresA,
      scoresB: averagedScoresB,
      bestA: aggregatedBestA,
      bestB: aggregatedBestB,
      poiA: aggregatedPoiA,
      poiB: aggregatedPoiB,
      matterA: averagedMatterA,
      mannerA: averagedMannerA,
      matterB: averagedMatterB,
      mannerB: averagedMannerB,
    },
    __normalizedWinA: averagedWinA ?? 0,
    __normalizedWinB: averagedWinB ?? 0,
  }
}

function resolveWinnerForBallot(
  payload: BallotPayload,
  policy: CompileOptions['winner_policy'],
  totalA: number,
  totalB: number
): string | undefined {
  const teamAId = String(payload.teamAId ?? '').trim()
  const teamBId = String(payload.teamBId ?? '').trim()
  const explicitWinner = String(payload.winnerId ?? '').trim()
  const normalizedWinner =
    explicitWinner === teamAId || explicitWinner === teamBId ? explicitWinner : undefined

  if (policy === 'score_only') {
    if (totalA > totalB) return teamAId
    if (totalB > totalA) return teamBId
    return undefined
  }
  if (policy === 'draw_on_missing') {
    return normalizedWinner
  }
  if (normalizedWinner) return normalizedWinner
  if (totalA > totalB) return teamAId
  if (totalB > totalA) return teamBId
  return undefined
}

async function buildCompiledPayloadFromRaw(
  tournamentId: string,
  requestedRounds?: number[],
  compileOptions: CompileOptions = DEFAULT_COMPILE_OPTIONS
): Promise<{ payload: CompiledPayload; connection: Connection }> {
  const [tournament, connection] = await Promise.all([
    TournamentModel.findById(tournamentId).lean().exec(),
    getTournamentConnection(tournamentId),
  ])
  if (!tournament) {
    const err = new Error('Tournament not found')
    ;(err as any).status = 404
    throw err
  }

  const [teams, adjudicators, rawTeamResults, rawSpeakerResults, rawAdjudicatorResults, draws] =
    await Promise.all([
      getTeamModel(connection).find({ tournamentId }).lean().exec(),
      getAdjudicatorModel(connection).find({ tournamentId }).lean().exec(),
      getRawTeamResultModel(connection).find({ tournamentId }).lean().exec(),
      getRawSpeakerResultModel(connection).find({ tournamentId }).lean().exec(),
      getRawAdjudicatorResultModel(connection).find({ tournamentId }).lean().exec(),
      getDrawModel(connection).find({ tournamentId }).lean().exec(),
    ])

  const rounds = resolveRounds(
    requestedRounds,
    rawTeamResults as Array<{ r?: number }>,
    rawSpeakerResults as Array<{ r?: number }>,
    rawAdjudicatorResults as Array<{ r?: number }>
  )
  const selectedRoundSet = new Set(rounds.map((r) => Number(r)))
  const filteredRawTeamResults = (rawTeamResults as any[]).filter((result) =>
    selectedRoundSet.has(Number((result as any).r))
  )
  const filteredRawSpeakerResults = (rawSpeakerResults as any[]).filter((result) =>
    selectedRoundSet.has(Number((result as any).r))
  )
  const filteredRawAdjudicatorResults = (rawAdjudicatorResults as any[]).filter((result) =>
    selectedRoundSet.has(Number((result as any).r))
  )
  const filteredDraws = (draws as any[]).filter((draw) => selectedRoundSet.has(Number(draw.round)))
  const roundDocs = await getRoundModel(connection).find({ tournamentId }).lean().exec()
  const roundNameMap = new Map<number, string>(
    roundDocs.map((doc: any) => [Number(doc.round), doc.name ?? `Round ${doc.round}`])
  )

  const styleOptions = (tournament.options as any)?.style ?? {}
  const styleDoc =
    typeof tournament.style === 'number'
      ? await StyleModel.findOne({ id: tournament.style }).lean().exec()
      : null
  const scoreWeights = normalizeScoreWeights(styleOptions.score_weights ?? styleDoc?.score_weights)
  const teamNum = styleOptions.team_num ?? styleDoc?.team_num ?? 2
  const style = { team_num: teamNum, score_weights: scoreWeights }

  const teamById = new Map(teams.map((team) => [String(team._id), team]))
  const teamIds = new Set(filteredRawTeamResults.map((result: any) => String(result.id)))
  const teamInstances = Array.from(teamIds).map((id) => {
    const team = teamById.get(id)
    return {
      id,
      details: buildDetailsForRounds((team as any)?.details, rounds, {
        available: true,
        institutions: [],
        speakers: [],
      }),
    }
  })

  const speakerIds = new Set(filteredRawSpeakerResults.map((result: any) => String(result.id)))
  const speakerInstances = Array.from(speakerIds).map((id) => ({ id }))

  const adjudicatorIds = new Set(filteredRawAdjudicatorResults.map((result: any) => String(result.id)))
  const adjudicatorInstances = Array.from(adjudicatorIds).map((id) => ({ id }))

  const compiledTeamResults =
    filteredRawSpeakerResults.length > 0 && speakerInstances.length > 0
      ? coreResults.compileTeamResults(
          teamInstances,
          speakerInstances,
          filteredRawTeamResults,
          filteredRawSpeakerResults,
          rounds,
          style
        )
      : coreResults.compileTeamResults(teamInstances, filteredRawTeamResults, rounds, style)

  const compiledSpeakerResults =
    filteredRawSpeakerResults.length > 0
      ? coreResults.compileSpeakerResults(speakerInstances, filteredRawSpeakerResults, style, rounds)
      : []

  const compiledAdjudicatorResults =
    filteredRawAdjudicatorResults.length > 0
      ? coreResults.compileAdjudicatorResults(adjudicatorInstances, filteredRawAdjudicatorResults, rounds)
      : []

  const teamMeta = new Map<string, { institutions: string[] }>()
  teams.forEach((team: any) => {
    const institutions = new Set<string>()
    if (team.institution) institutions.add(team.institution)
    const detailInstitutions = team.details?.flatMap((detail: any) => detail.institutions ?? []) ?? []
    detailInstitutions.forEach((inst: string) => {
      if (inst) institutions.add(String(inst))
    })
    teamMeta.set(String(team._id), { institutions: Array.from(institutions) })
  })

  const speakerMeta = new Map<string, { teamId: string; teamName: string }>()
  teams.forEach((team: any) => {
    const teamId = String(team._id)
    const teamName = team.name
    const speakerIdsFromTeam = new Set<string>()
    team.details?.forEach((detail: any) => {
      ;(detail.speakers ?? []).forEach((speakerId: string) => {
        if (speakerId) speakerIdsFromTeam.add(String(speakerId))
      })
    })
    speakerIdsFromTeam.forEach((speakerId) => {
      if (!speakerMeta.has(speakerId)) {
        speakerMeta.set(speakerId, { teamId, teamName })
      }
    })
  })

  const adjudicatorMeta = new Map<string, { institutions: string[] }>()
  adjudicators.forEach((adj: any) => {
    const institutions = new Set<string>()
    adj.details?.forEach((detail: any) => {
      ;(detail.institutions ?? []).forEach((inst: string) => {
        if (inst) institutions.add(String(inst))
      })
    })
    adjudicatorMeta.set(String(adj._id), { institutions: Array.from(institutions) })
  })

  const adjudicatorStats = new Map<string, { num_experienced: number; num_experienced_chair: number }>()
  filteredDraws.forEach((draw: any) => {
    const drawRound = Number(draw.round)
    if (!Number.isFinite(drawRound) || !selectedRoundSet.has(drawRound)) return
    draw.allocation?.forEach((row: any) => {
      const chairs = (row?.chairs ?? []).map((id: any) => String(id))
      const panels = (row?.panels ?? []).map((id: any) => String(id))
      const trainees = (row?.trainees ?? []).map((id: any) => String(id))
      const all = ([] as string[]).concat(chairs, panels, trainees)
      all.forEach((adjId) => {
        const stats = adjudicatorStats.get(adjId) ?? { num_experienced: 0, num_experienced_chair: 0 }
        stats.num_experienced += 1
        if (chairs.includes(adjId)) stats.num_experienced_chair += 1
        adjudicatorStats.set(adjId, stats)
      })
    })
  })

  const compiled: CompiledPayload = {
    tournamentId,
    rounds: rounds.map((r) => ({ r, name: roundNameMap.get(r) ?? `Round ${r}` })),
    compile_options: compileOptions,
    compile_warnings: [],
    compile_diff_meta: buildDefaultDiffMeta(compileOptions),
    compiled_team_results: applyTeamRankingPriority(
      compiledTeamResults.map((result: any) => ({
        ...result,
        institutions: teamMeta.get(result.id)?.institutions ?? [],
      })),
      compileOptions
    ),
    compiled_speaker_results: compiledSpeakerResults.map((result: any) => ({
      ...result,
      teams: speakerMeta.get(result.id)?.teamName ? [speakerMeta.get(result.id)?.teamName] : [],
    })),
    compiled_adjudicator_results: compiledAdjudicatorResults.map((result: any) => ({
      ...result,
      institutions: adjudicatorMeta.get(result.id)?.institutions ?? [],
      num_experienced: adjudicatorStats.get(result.id)?.num_experienced ?? result.active_num ?? 0,
      num_experienced_chair: adjudicatorStats.get(result.id)?.num_experienced_chair ?? 0,
    })),
  }
  applyIncludeLabels(compileOptions, compiled)

  return { payload: compiled, connection }
}

async function buildCompiledPayloadFromSubmissions(
  tournamentId: string,
  requestedRounds?: number[],
  compileOptions: CompileOptions = DEFAULT_COMPILE_OPTIONS
): Promise<{ payload: CompiledPayload; connection: Connection }> {
  const [tournament, connection] = await Promise.all([
    TournamentModel.findById(tournamentId).lean().exec(),
    getTournamentConnection(tournamentId),
  ])
  if (!tournament) {
    const err = new Error('Tournament not found')
    ;(err as any).status = 404
    throw err
  }

  const [teams, adjudicators, submissions, draws] = await Promise.all([
    getTeamModel(connection).find({ tournamentId }).lean().exec(),
    getAdjudicatorModel(connection).find({ tournamentId }).lean().exec(),
    getSubmissionModel(connection).find({ tournamentId }).lean().exec(),
    getDrawModel(connection).find({ tournamentId }).lean().exec(),
  ])

  const rounds = resolveRoundsFromSubmissions(
    requestedRounds,
    submissions as Array<{ round?: number }>,
    draws as Array<{ round?: number }>
  )
  const selectedRoundSet = new Set(rounds.map((r) => Number(r)))
  const filteredSubmissions = (submissions as any[]).filter((item) =>
    selectedRoundSet.has(Number(item.round))
  )
  const filteredDraws = (draws as any[]).filter((draw) =>
    selectedRoundSet.has(Number(draw.round))
  )
  const roundDocs = await getRoundModel(connection).find({ tournamentId }).lean().exec()
  const roundNameMap = new Map<number, string>(
    roundDocs.map((doc: any) => [Number(doc.round), doc.name ?? `Round ${doc.round}`])
  )

  const teamById = new Map<string, any>(teams.map((team) => [String(team._id), team]))
  const speakerMeta = new Map<string, { teamId: string; teamName: string }>()

  teams.forEach((team) => {
    const teamId = String(team._id)
    const teamName = team.name

    const detailSpeakerIds = new Set<string>()
    team.details?.forEach((detail: any) => {
      ;(detail.speakers ?? []).forEach((speakerId: string) => {
        if (speakerId) detailSpeakerIds.add(String(speakerId))
      })
    })
    detailSpeakerIds.forEach((speakerId) => {
      if (!speakerMeta.has(speakerId)) {
        speakerMeta.set(speakerId, { teamId, teamName })
      }
    })

    team.speakers?.forEach((_speaker: any, index: number) => {
      const speakerId = `${teamId}:${index}`
      if (!speakerMeta.has(speakerId)) {
        speakerMeta.set(speakerId, { teamId, teamName })
      }
    })
  })

  function getSpeakersForTeamRound(teamId: string, round: number): string[] {
    const team = teamById.get(teamId)
    if (!team) return []
    const detail = team.details?.find((d: any) => Number(d.r) === round)
    const detailSpeakers = (detail?.speakers ?? []).map((id: string) => String(id)).filter(Boolean)
    if (detailSpeakers.length > 0) return detailSpeakers
    if (Array.isArray(team.speakers) && team.speakers.length > 0) {
      return team.speakers.map((_speaker: any, index: number) => `${teamId}:${index}`)
    }
    return []
  }

  const sideByRoundTeam = new Map<number, Map<string, string>>()
  const opponentsByRoundTeam = new Map<number, Map<string, string[]>>()
  const judgedTeamsByRoundAdj = new Map<string, Set<string>>()

  filteredDraws.forEach((draw) => {
    const round = Number(draw.round)
    if (!Number.isFinite(round)) return
    const sideMap = sideByRoundTeam.get(round) ?? new Map<string, string>()
    const oppMap = opponentsByRoundTeam.get(round) ?? new Map<string, string[]>()

    draw.allocation?.forEach((row: any) => {
      let gov: string | undefined
      let opp: string | undefined
      const rowTeams = row?.teams
      if (Array.isArray(rowTeams)) {
        gov = rowTeams[0]
        opp = rowTeams[1]
      } else if (rowTeams && typeof rowTeams === 'object') {
        gov = rowTeams.gov
        opp = rowTeams.opp
      }

      if (gov) {
        sideMap.set(gov, 'gov')
        oppMap.set(gov, opp ? [opp] : [])
      }
      if (opp) {
        sideMap.set(opp, 'opp')
        oppMap.set(opp, gov ? [gov] : [])
      }

      const judgedTeams = [gov, opp].filter(Boolean) as string[]
      const adjudicatorIds = ([] as string[])
        .concat(row?.chairs ?? [], row?.panels ?? [], row?.trainees ?? [])
        .filter(Boolean)
      adjudicatorIds.forEach((adjId) => {
        const key = `${round}:${adjId}`
        const current = judgedTeamsByRoundAdj.get(key) ?? new Set<string>()
        judgedTeams.forEach((teamId) => current.add(teamId))
        judgedTeamsByRoundAdj.set(key, current)
      })
    })

    sideByRoundTeam.set(round, sideMap)
    opponentsByRoundTeam.set(round, oppMap)
  })

  const rawTeamResults: any[] = []
  const rawSpeakerResults: any[] = []
  const rawAdjudicatorResults: any[] = []
  const speakerIdsWithScores = new Set<string>()
  const teamIdsWithResults = new Set<string>()
  const adjudicatorIdsWithScores = new Set<string>()
  const missingDataIssues: MissingDataIssue[] = []
  const registerMissingIssue = (
    issue: Omit<MissingDataIssue, 'round' | 'submissionId'> & {
      round?: number
      submissionId?: string
    }
  ) => {
    missingDataIssues.push(issue)
  }

  const ballotSubmissions = filteredSubmissions.filter((submission) => submission.type === 'ballot')
  const feedbackSubmissions = filteredSubmissions.filter((submission) => submission.type === 'feedback')

  const ballotGroups = new Map<string, any[]>()
  ballotSubmissions.forEach((submission) => {
    const key = canonicalBallotDuplicateKey(submission)
    const grouped = ballotGroups.get(key) ?? []
    grouped.push(submission)
    ballotGroups.set(key, grouped)
  })

  const normalizedBallots: any[] = []
  ballotGroups.forEach((grouped, key) => {
    if (grouped.length <= 1) {
      normalizedBallots.push(grouped[0])
      return
    }
    if (compileOptions.duplicate_normalization.merge_policy === 'error') {
      const err = new Error(`Duplicate ballots detected: ${key}`)
      ;(err as any).status = 400
      throw err
    }
    if (compileOptions.duplicate_normalization.merge_policy === 'latest') {
      const latest = grouped
        .slice()
        .sort((left, right) => {
          const leftTime = new Date(left?.updatedAt ?? left?.createdAt ?? 0).getTime()
          const rightTime = new Date(right?.updatedAt ?? right?.createdAt ?? 0).getTime()
          return leftTime - rightTime
        })
        .at(-1)
      if (latest) normalizedBallots.push(latest)
      return
    }
    normalizedBallots.push(mergeAverageBallotGroup(grouped, key, compileOptions))
  })

  normalizedBallots.forEach((submission: any) => {
    const round = Number(submission.round)
    const payload = (submission.payload ?? {}) as BallotPayload
    const submissionId = submission._id?.toString()
    if (!Number.isFinite(round)) {
      registerMissingIssue({
        code: 'invalid_round',
        message: 'round is not a finite number in ballot submission',
        submissionId,
      })
      return
    }

    const teamAId = String(payload.teamAId ?? '').trim()
    const teamBId = String(payload.teamBId ?? '').trim()
    if (!teamAId || !teamBId || teamAId === teamBId) {
      registerMissingIssue({
        code: 'invalid_matchup',
        message: 'teamAId/teamBId is missing or invalid in ballot submission',
        round,
        submissionId,
      })
      return
    }

    const scoresA = toNumberArray(payload.scoresA)
    const scoresB = toNumberArray(payload.scoresB)
    const hasInvalidScore = scoresA.some((value) => !Number.isFinite(value)) ||
      scoresB.some((value) => !Number.isFinite(value))
    if (hasInvalidScore) {
      registerMissingIssue({
        code: 'invalid_score',
        message: 'score contains non-finite values in ballot submission',
        round,
        submissionId,
      })
      if (compileOptions.missing_data_policy !== 'warn') return
    }

    const totalA = sumScores(scoresA)
    const totalB = sumScores(scoresB)
    const winnerId = resolveWinnerForBallot(payload, compileOptions.winner_policy, totalA, totalB)
    const normalizedWinA = Number((submission as any).__normalizedWinA)
    const normalizedWinB = Number((submission as any).__normalizedWinB)
    const hasNormalizedWins = Number.isFinite(normalizedWinA) && Number.isFinite(normalizedWinB)
    const winA = hasNormalizedWins
      ? normalizedWinA
      : winnerId === teamAId
        ? 1
        : winnerId
          ? 0
          : compileOptions.tie_points
    const winB = hasNormalizedWins
      ? normalizedWinB
      : winnerId === teamBId
        ? 1
        : winnerId
          ? 0
          : compileOptions.tie_points
    const sideMap = sideByRoundTeam.get(round)

    rawTeamResults.push({
      id: teamAId,
      r: round,
      win: winA,
      opponents: [teamBId],
      side: sideMap?.get(teamAId) ?? 'gov',
      from_id: submissionId,
    })
    rawTeamResults.push({
      id: teamBId,
      r: round,
      win: winB,
      opponents: [teamAId],
      side: sideMap?.get(teamBId) ?? 'opp',
      from_id: submissionId,
    })
    teamIdsWithResults.add(teamAId)
    teamIdsWithResults.add(teamBId)

    const selectedSpeakerIdsA = Array.isArray((submission.payload as any)?.speakerIdsA)
      ? ((submission.payload as any).speakerIdsA as any[]).map((id) => String(id).trim())
      : []
    const selectedSpeakerIdsB = Array.isArray((submission.payload as any)?.speakerIdsB)
      ? ((submission.payload as any).speakerIdsB as any[]).map((id) => String(id).trim())
      : []
    const fallbackSpeakersA = getSpeakersForTeamRound(teamAId, round)
    const fallbackSpeakersB = getSpeakersForTeamRound(teamBId, round)
    const speakersA =
      selectedSpeakerIdsA.length > 0
        ? scoresA.map((_score, index) => selectedSpeakerIdsA[index] || fallbackSpeakersA[index] || '')
        : fallbackSpeakersA
    const speakersB =
      selectedSpeakerIdsB.length > 0
        ? scoresB.map((_score, index) => selectedSpeakerIdsB[index] || fallbackSpeakersB[index] || '')
        : fallbackSpeakersB
    const bestA = Array.isArray((submission.payload as any)?.bestA)
      ? ((submission.payload as any).bestA as boolean[])
      : []
    const bestB = Array.isArray((submission.payload as any)?.bestB)
      ? ((submission.payload as any).bestB as boolean[])
      : []
    const poiA = Array.isArray((submission.payload as any)?.poiA)
      ? ((submission.payload as any).poiA as boolean[])
      : []
    const poiB = Array.isArray((submission.payload as any)?.poiB)
      ? ((submission.payload as any).poiB as boolean[])
      : []
    const matterA = Array.isArray((submission.payload as any)?.matterA)
      ? ((submission.payload as any).matterA as number[])
      : []
    const mannerA = Array.isArray((submission.payload as any)?.mannerA)
      ? ((submission.payload as any).mannerA as number[])
      : []
    const matterB = Array.isArray((submission.payload as any)?.matterB)
      ? ((submission.payload as any).matterB as number[])
      : []
    const mannerB = Array.isArray((submission.payload as any)?.mannerB)
      ? ((submission.payload as any).mannerB as number[])
      : []

    scoresA.forEach((score, index) => {
      const speakerId = speakersA[index]
      if (!Number.isFinite(score)) return
      if (!speakerId) {
        registerMissingIssue({
          code: 'missing_speaker',
          message: 'speakerId is missing for a scored speaker on teamA',
          round,
          submissionId,
        })
        return
      }
      const matterValue = matterA[index]
      const mannerValue = mannerA[index]
      rawSpeakerResults.push({
        id: speakerId,
        r: round,
        scores: [score],
        from_id: submissionId,
        user_defined_data: {
          best: [{ order: index + 1, value: Boolean(bestA[index]) }],
          poi: [{ order: index + 1, value: Boolean(poiA[index]) }],
          matter:
            typeof matterValue === 'number' && Number.isFinite(matterValue)
              ? [{ order: index + 1, value: matterValue }]
              : undefined,
          manner:
            typeof mannerValue === 'number' && Number.isFinite(mannerValue)
              ? [{ order: index + 1, value: mannerValue }]
              : undefined,
        },
      })
      speakerIdsWithScores.add(speakerId)
    })
    scoresB.forEach((score, index) => {
      const speakerId = speakersB[index]
      if (!Number.isFinite(score)) return
      if (!speakerId) {
        registerMissingIssue({
          code: 'missing_speaker',
          message: 'speakerId is missing for a scored speaker on teamB',
          round,
          submissionId,
        })
        return
      }
      const matterValue = matterB[index]
      const mannerValue = mannerB[index]
      rawSpeakerResults.push({
        id: speakerId,
        r: round,
        scores: [score],
        from_id: submissionId,
        user_defined_data: {
          best: [{ order: index + 1, value: Boolean(bestB[index]) }],
          poi: [{ order: index + 1, value: Boolean(poiB[index]) }],
          matter:
            typeof matterValue === 'number' && Number.isFinite(matterValue)
              ? [{ order: index + 1, value: matterValue }]
              : undefined,
          manner:
            typeof mannerValue === 'number' && Number.isFinite(mannerValue)
              ? [{ order: index + 1, value: mannerValue }]
              : undefined,
        },
      })
      speakerIdsWithScores.add(speakerId)
    })
  })

  feedbackSubmissions.forEach((submission: any) => {
    const round = Number(submission.round)
    const payload = (submission.payload ?? {}) as FeedbackPayload
    const submissionId = submission._id?.toString()
    if (!Number.isFinite(round)) {
      registerMissingIssue({
        code: 'invalid_round',
        message: 'round is not a finite number in feedback submission',
        submissionId,
      })
      return
    }
    const adjudicatorId = String(payload.adjudicatorId ?? '').trim()
    const score = typeof payload.score === 'number' ? payload.score : Number(payload.score)
    if (!adjudicatorId || !Number.isFinite(score)) {
      registerMissingIssue({
        code: 'invalid_feedback',
        message: 'adjudicatorId or score is missing in feedback submission',
        round,
        submissionId,
      })
      return
    }
    const judgedTeams = Array.from(judgedTeamsByRoundAdj.get(`${round}:${adjudicatorId}`) ?? [])
    rawAdjudicatorResults.push({
      id: adjudicatorId,
      r: round,
      score,
      comment: payload.comment,
      judged_teams: judgedTeams,
      from_id: submissionId,
      user_defined_data: {
        matter: (submission.payload as any)?.matter,
        manner: (submission.payload as any)?.manner,
      },
    })
    adjudicatorIdsWithScores.add(adjudicatorId)
  })

  const compileWarnings = finalizeMissingDataIssues(missingDataIssues, compileOptions)

  const styleOptions = (tournament?.options as any)?.style ?? {}
  const styleDoc =
    typeof tournament?.style === 'number'
      ? await StyleModel.findOne({ id: tournament.style }).lean().exec()
      : null
  const scoreWeights = normalizeScoreWeights(styleOptions.score_weights ?? styleDoc?.score_weights)
  const teamNum = styleOptions.team_num ?? styleDoc?.team_num ?? 2
  const style = { team_num: teamNum, score_weights: scoreWeights }

  const teamInstances = Array.from(teamIdsWithResults).map((teamId) => ({
    id: teamId,
    details: rounds.map((r) => ({ r, speakers: getSpeakersForTeamRound(teamId, r) })),
  }))

  const speakerInstances = Array.from(speakerIdsWithScores).map((id) => ({ id }))
  const adjudicatorInstances = adjudicators
    .filter((adj) => adjudicatorIdsWithScores.has(String(adj._id)))
    .map((adj) => ({ id: String(adj._id) }))

  const compiledTeamResults =
    rawTeamResults.length > 0
      ? coreResults.compileTeamResults(
          teamInstances,
          speakerInstances,
          rawTeamResults,
          rawSpeakerResults,
          rounds,
          style
        )
      : []
  const compiledSpeakerResults =
    rawSpeakerResults.length > 0
      ? coreResults.compileSpeakerResults(speakerInstances, rawSpeakerResults, style, rounds)
      : []
  const compiledAdjudicatorResults =
    rawAdjudicatorResults.length > 0
      ? coreResults.compileAdjudicatorResults(adjudicatorInstances, rawAdjudicatorResults, rounds)
      : []

  const teamMeta = new Map<string, { institutions: string[] }>()
  teams.forEach((team) => {
    const institutions = new Set<string>()
    if (team.institution) institutions.add(String(team.institution))
    team.details?.forEach((detail: any) => {
      ;(detail.institutions ?? []).forEach((inst: string) => {
        if (inst) institutions.add(String(inst))
      })
    })
    teamMeta.set(String(team._id), { institutions: Array.from(institutions) })
  })

  const adjudicatorMeta = new Map<string, { institutions: string[] }>()
  adjudicators.forEach((adj: any) => {
    const institutions = new Set<string>()
    adj.details?.forEach((detail: any) => {
      ;(detail.institutions ?? []).forEach((inst: string) => {
        if (inst) institutions.add(String(inst))
      })
    })
    adjudicatorMeta.set(String(adj._id), { institutions: Array.from(institutions) })
  })

  const adjudicatorStats = new Map<string, { num_experienced: number; num_experienced_chair: number }>()
  filteredDraws.forEach((draw: any) => {
    const drawRound = Number(draw.round)
    if (!Number.isFinite(drawRound) || !selectedRoundSet.has(drawRound)) return
    draw.allocation?.forEach((row: any) => {
      const chairs = (row?.chairs ?? []).map((id: any) => String(id))
      const panels = (row?.panels ?? []).map((id: any) => String(id))
      const trainees = (row?.trainees ?? []).map((id: any) => String(id))
      const all = ([] as string[]).concat(chairs, panels, trainees)
      all.forEach((adjId) => {
        const stats = adjudicatorStats.get(adjId) ?? { num_experienced: 0, num_experienced_chair: 0 }
        stats.num_experienced += 1
        if (chairs.includes(adjId)) stats.num_experienced_chair += 1
        adjudicatorStats.set(adjId, stats)
      })
    })
  })

  const compiled: CompiledPayload = {
    tournamentId,
    rounds: rounds.map((r) => ({ r, name: roundNameMap.get(r) ?? `Round ${r}` })),
    compile_options: compileOptions,
    compile_warnings: compileWarnings,
    compile_diff_meta: buildDefaultDiffMeta(compileOptions),
    compiled_team_results: applyTeamRankingPriority(
      compiledTeamResults.map((result: any) => ({
        ...result,
        institutions: teamMeta.get(result.id)?.institutions ?? [],
      })),
      compileOptions
    ),
    compiled_speaker_results: compiledSpeakerResults.map((result: any) => ({
      ...result,
      teams: speakerMeta.get(result.id)?.teamName ? [speakerMeta.get(result.id)?.teamName] : [],
    })),
    compiled_adjudicator_results: compiledAdjudicatorResults.map((result: any) => ({
      ...result,
      institutions: adjudicatorMeta.get(result.id)?.institutions ?? [],
      num_experienced: adjudicatorStats.get(result.id)?.num_experienced ?? result.active_num ?? 0,
      num_experienced_chair: adjudicatorStats.get(result.id)?.num_experienced_chair ?? 0,
    })),
  }
  applyIncludeLabels(compileOptions, compiled)

  return { payload: compiled, connection }
}

export async function buildCompiledPayload(
  tournamentId: string,
  source: 'submissions' | 'raw' | undefined,
  requestedRounds?: number[],
  compileOptions: CompileOptions = DEFAULT_COMPILE_OPTIONS
): Promise<{ payload: CompiledPayload; connection: Connection }> {
  return source === 'raw'
    ? buildCompiledPayloadFromRaw(tournamentId, requestedRounds, compileOptions)
    : buildCompiledPayloadFromSubmissions(tournamentId, requestedRounds, compileOptions)
}

function toCompiledSubset(doc: any, key: CompiledResultsKey): CompiledSubset {
  const payload = doc?.payload ?? doc ?? {}
  const tournamentId = payload.tournamentId ?? doc?.tournamentId ?? ''
  return {
    compiledId: String(doc?._id ?? payload._id ?? ''),
    tournamentId: String(tournamentId),
    rounds: Array.isArray(payload.rounds) ? payload.rounds : [],
    compile_options: normalizeCompileOptions(payload.compile_options as CompileOptionsInput | undefined),
    compile_warnings: Array.isArray(payload.compile_warnings) ? payload.compile_warnings : [],
    compile_diff_meta:
      payload.compile_diff_meta && typeof payload.compile_diff_meta === 'object'
        ? (payload.compile_diff_meta as CompileDiffMeta)
        : buildDefaultDiffMeta(
            normalizeCompileOptions(payload.compile_options as CompileOptionsInput | undefined)
          ),
    results: Array.isArray(payload[key]) ? payload[key] : [],
  }
}

const makeListCompiled =
  (key: CompiledResultsKey): RequestHandler =>
  async (req, res, next) => {
    try {
      const { tournamentId, latest } = req.query as { tournamentId?: string; latest?: string }
      if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
        res
          .status(400)
          .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
        return
      }

      const connection = await getTournamentConnection(tournamentId)
      const CompiledModel = getCompiledModel(connection)
      const isAdmin = await hasTournamentAdminAccess(req, tournamentId)

      if (latest === 'true' || latest === '1') {
        const compiled = await CompiledModel.findOne({ tournamentId })
          .sort({ createdAt: -1 })
          .lean()
          .exec()
        if (!compiled) {
          res.json({ data: null, errors: [] })
          return
        }
        const subset = toCompiledSubset(compiled, key)
        res.json({
          data: isAdmin ? subset : sanitizeCompiledSubsetForPublic(subset),
          errors: [],
        })
        return
      }

      const compiled = await CompiledModel.find({ tournamentId })
        .sort({ createdAt: -1 })
        .lean()
        .exec()
      const subsets = compiled.map((doc) => toCompiledSubset(doc, key))
      res.json({
        data: isAdmin ? subsets : subsets.map((subset) => sanitizeCompiledSubsetForPublic(subset)),
        errors: [],
      })
    } catch (err) {
      next(err)
    }
  }

const makeCreateCompiled =
  (key: CompiledResultsKey): RequestHandler =>
  async (req, res, next) => {
    try {
      const { tournamentId, source, rounds: requestedRounds } = req.body as {
        tournamentId: string
        source?: 'submissions' | 'raw'
        rounds?: number[]
        options?: CompileOptionsInput
      }
      if (!Types.ObjectId.isValid(tournamentId)) {
        res
          .status(400)
          .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
        return
      }

      const compileOptions = normalizeCompileOptions(req.body?.options as CompileOptionsInput | undefined)
      const { payload, connection } = await buildCompiledPayload(
        tournamentId,
        source,
        requestedRounds,
        compileOptions
      )
      await attachDiffAgainstBaseline(payload, connection)
      const CompiledModel = getCompiledModel(connection)
      const created = await CompiledModel.create({
        tournamentId,
        payload,
        createdBy: req.session?.userId,
      })
      const createdJson = created.toJSON()
      res.status(201).json({ data: toCompiledSubset(createdJson, key), errors: [] })
    } catch (err) {
      if ((err as any)?.status === 404) {
        res
          .status(404)
          .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
        return
      }
      next(err)
    }
  }

export const listCompiledTeams: RequestHandler = makeListCompiled('compiled_team_results')
export const listCompiledSpeakers: RequestHandler = makeListCompiled('compiled_speaker_results')
export const listCompiledAdjudicators: RequestHandler = makeListCompiled('compiled_adjudicator_results')

export const createCompiledTeams: RequestHandler = makeCreateCompiled('compiled_team_results')
export const createCompiledSpeakers: RequestHandler = makeCreateCompiled('compiled_speaker_results')
export const createCompiledAdjudicators: RequestHandler = makeCreateCompiled('compiled_adjudicator_results')

export const listCompiled: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, latest } = req.query as { tournamentId?: string; latest?: string }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const CompiledModel = getCompiledModel(connection)
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)

    if (latest === 'true' || latest === '1') {
      const compiled = await CompiledModel.findOne({ tournamentId })
        .sort({ createdAt: -1 })
        .lean()
        .exec()
      if (!compiled) {
        res.json({ data: null, errors: [] })
        return
      }
      res.json({ data: isAdmin ? compiled : sanitizeCompiledForPublic(compiled), errors: [] })
      return
    }

    const compiled = await CompiledModel.find({ tournamentId })
      .sort({ createdAt: -1 })
      .lean()
      .exec()
    res.json({
      data: isAdmin ? compiled : compiled.map((doc) => sanitizeCompiledForPublic(doc)),
      errors: [],
    })
  } catch (err) {
    next(err)
  }
}

export const createCompiled: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, source, rounds: requestedRounds } = req.body as {
      tournamentId: string
      source?: 'submissions' | 'raw'
      rounds?: number[]
      options?: CompileOptionsInput
    }
    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const compileOptions = normalizeCompileOptions(req.body?.options as CompileOptionsInput | undefined)
    const { payload, connection } = await buildCompiledPayload(
      tournamentId,
      source,
      requestedRounds,
      compileOptions
    )
    await attachDiffAgainstBaseline(payload, connection)
    const CompiledModel = getCompiledModel(connection)
    const created = await CompiledModel.create({
      tournamentId,
      payload,
      createdBy: req.session?.userId,
    })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err) {
    if ((err as any)?.status === 404) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
      return
    }
    next(err)
  }
}
