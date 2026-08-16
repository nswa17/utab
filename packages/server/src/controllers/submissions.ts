import type { Connection } from 'mongoose'
import type { RequestHandler } from 'express'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { getSubmissionModel } from '../models/submission.js'
import { getRoundModel } from '../models/round.js'
import { getDrawModel } from '../models/draw.js'
import { getTeamModel } from '../models/team.js'
import { getSpeakerModel } from '../models/speaker.js'
import { getAdjudicatorModel } from '../models/adjudicator.js'
import { StyleModel } from '../models/style.js'
import { TournamentModel } from '../models/tournament.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { DEFAULT_COMPILE_OPTIONS, normalizeCompileOptions } from '../types/compiled-options.js'
import { normalizeTeamNum } from './shared/allocation-support.js'
import {
  resolveRoundAwardSelectionRules,
  validateBallotAwardSelectionCounts,
} from './shared/award-selection.js'
import { badRequest, isValidObjectId, notFound } from './shared/http-errors.js'

function resolveSubmissionActor(submittedEntityId?: string, sessionUserId?: string) {
  const submittedEntityToken = String(submittedEntityId ?? '').trim()
  if (submittedEntityToken) return submittedEntityToken
  return String(sessionUserId ?? '').trim()
}

const DUPLICATE_BALLOT_MESSAGE =
  'すでにチーム評価が送信されています。送信済みのチーム評価を修正する場合は運営に連絡してください。'
const DUPLICATE_FEEDBACK_MESSAGE = 'すでにジャッジ評価が送信されています。運営に報告してください。'

function buildBallotDedupeKey(
  payload: Pick<NormalizedBallotPayload, 'teamAId' | 'teamBId' | 'submittedEntityId'>,
  sessionUserId?: string
): string | undefined {
  const actor = resolveSubmissionActor(payload.submittedEntityId, sessionUserId)
  const teamAId = String(payload.teamAId ?? '').trim()
  const teamBId = String(payload.teamBId ?? '').trim()
  if (!actor || !teamAId || !teamBId || teamAId === teamBId) return undefined
  const [left, right] = [teamAId, teamBId].sort()
  return `ballot:${actor}:${left}:${right}`
}

function buildFeedbackDedupeKey(
  payload: Pick<NormalizedFeedbackPayload, 'adjudicatorId' | 'submittedEntityId'>,
  sessionUserId?: string
): string | undefined {
  const actor = resolveSubmissionActor(payload.submittedEntityId, sessionUserId)
  const adjudicatorId = String(payload.adjudicatorId ?? '').trim()
  if (!actor || !adjudicatorId) return undefined
  return `feedback:${actor}:${adjudicatorId}`
}

function duplicateMessageByType(type: 'ballot' | 'feedback'): string {
  return type === 'ballot' ? DUPLICATE_BALLOT_MESSAGE : DUPLICATE_FEEDBACK_MESSAGE
}

function isDuplicateSubmissionKeyError(error: unknown): boolean {
  return Boolean((error as { code?: unknown } | null)?.code === 11000)
}

function sumScores(scores: number[]): number {
  return scores.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0)
}

type NumericRange = { from: number; to: number; unit: number }

function normalizeNumericRange(value: unknown): NumericRange | null {
  if (Array.isArray(value)) {
    const from = Number(value[0])
    const to = Number(value[1])
    const unit = Number(value[2])
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return null
    return { from, to, unit: Number.isFinite(unit) && unit > 0 ? unit : 0 }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = 'value' in value && (value as any).value ? (value as any).value : value
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null
  const from = Number((source as any).from)
  const to = Number((source as any).to)
  const unit = Number((source as any).unit)
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return null
  return { from, to, unit: Number.isFinite(unit) && unit > 0 ? unit : 0 }
}

function normalizeOrderedRanges(value: unknown): NumericRange[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry, index) => ({
      range: normalizeNumericRange(entry),
      order: Number((entry as any)?.order ?? index + 1),
    }))
    .filter((entry): entry is { range: NumericRange; order: number } => entry.range !== null)
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.range)
}

function scoreMatchesRange(score: number, range: NumericRange): boolean {
  if (score < range.from || score > range.to) return false
  if (range.unit <= 0) return true
  const steps = (score - range.from) / range.unit
  return Math.abs(steps - Math.round(steps)) <= 1e-8
}

function roleCountForSide(style: Record<string, any>, side: 'gov' | 'opp'): number {
  const roles = style.roles?.[side]
  if (Array.isArray(roles) && roles.length > 0) return roles.length
  const ranges = normalizeOrderedRanges(style.range)
  if (ranges.length > 0) return ranges.length
  return Array.isArray(style.score_weights) ? style.score_weights.length : 0
}

async function loadTournamentStyle(tournamentId: string): Promise<Record<string, any> | null> {
  const tournament = await TournamentModel.findById(tournamentId).lean().exec()
  if (!tournament || typeof tournament.style !== 'number') return null
  const style = await StyleModel.findOne({ id: tournament.style }).lean().exec()
  if (!style) return null
  const styleOverrides = toPayloadRecord((tournament.options as any)?.style)
  if (!styleOverrides) return style as Record<string, any>
  const overridesScoreLayout = Array.isArray(styleOverrides.score_weights)
  return {
    ...(style as Record<string, any>),
    ...styleOverrides,
    ...(overridesScoreLayout && styleOverrides.roles === undefined ? { roles: undefined } : {}),
    ...(overridesScoreLayout && styleOverrides.range === undefined ? { range: [] } : {}),
  }
}

function arrayLengthMatches(value: unknown, expectedLength: number): boolean {
  if (!Array.isArray(value)) return true
  return value.length === expectedLength
}

function ensureTournamentId(
  res: Parameters<RequestHandler>[1],
  tournamentId?: string
): tournamentId is string {
  if (!tournamentId || !isValidObjectId(tournamentId)) {
    badRequest(res, 'Invalid tournament id')
    return false
  }
  return true
}

function ensureSubmissionId(res: Parameters<RequestHandler>[1], submissionId: string): boolean {
  if (!isValidObjectId(submissionId)) {
    badRequest(res, 'Invalid submission id')
    return false
  }
  return true
}

type ValidationOutcome<T> = { ok: true; value: T } | { ok: false; message: string }

type NormalizedBallotPayload = {
  teamAId: string
  teamBId: string
  winnerId?: string
  draw?: boolean
  speakerIdsA?: string[]
  speakerIdsB?: string[]
  scoresA: number[]
  scoresB: number[]
  comment?: string
  submittedEntityId?: string
  submittedEntityType?: 'team' | 'speaker' | 'adjudicator'
  matterA?: number[]
  mannerA?: number[]
  matterB?: number[]
  mannerB?: number[]
  bestA?: boolean[]
  bestB?: boolean[]
  poiA?: boolean[]
  poiB?: boolean[]
}

type NormalizedFeedbackPayload = {
  adjudicatorId: string
  score: number
  comment?: string
  submittedEntityId?: string
  submittedEntityType?: 'team' | 'speaker' | 'adjudicator'
  matter?: number
  manner?: number
}

function toPayloadRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function isRoundHidden(roundDoc: unknown): boolean {
  const roundRecord = toPayloadRecord(roundDoc)
  if (!roundRecord) return false
  const userDefinedData = toPayloadRecord(roundRecord.userDefinedData)
  return userDefinedData?.hidden === true
}

function parseOptionalFiniteNumberArray(
  value: unknown,
  key: string
): ValidationOutcome<number[] | undefined> {
  if (value === undefined) return { ok: true, value: undefined }
  if (!Array.isArray(value)) {
    return { ok: false, message: `${key} must be an array` }
  }
  const parsed: number[] = []
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      return { ok: false, message: `${key} must contain finite numbers` }
    }
    parsed.push(item)
  }
  return { ok: true, value: parsed }
}

function parseOptionalBooleanArray(
  value: unknown,
  key: string
): ValidationOutcome<boolean[] | undefined> {
  if (value === undefined) return { ok: true, value: undefined }
  if (!Array.isArray(value)) {
    return { ok: false, message: `${key} must be an array` }
  }
  const parsed: boolean[] = []
  for (const item of value) {
    if (typeof item !== 'boolean') {
      return { ok: false, message: `${key} must contain boolean values` }
    }
    parsed.push(item)
  }
  return { ok: true, value: parsed }
}

function parseOptionalStringArray(
  value: unknown,
  key: string
): ValidationOutcome<string[] | undefined> {
  if (value === undefined) return { ok: true, value: undefined }
  if (!Array.isArray(value)) {
    return { ok: false, message: `${key} must be an array` }
  }
  const parsed: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') {
      return { ok: false, message: `${key} must contain string values` }
    }
    const normalized = item.trim()
    if (!normalized) {
      return { ok: false, message: `${key} must not contain blank entries` }
    }
    parsed.push(normalized)
  }
  return { ok: true, value: parsed }
}

function parseOptionalString(value: unknown, key: string): ValidationOutcome<string | undefined> {
  if (value === undefined) return { ok: true, value: undefined }
  if (typeof value !== 'string') {
    return { ok: false, message: `${key} must be a string` }
  }
  return { ok: true, value }
}

function parseOptionalTrimmedString(
  value: unknown,
  key: string
): ValidationOutcome<string | undefined> {
  if (value === undefined) return { ok: true, value: undefined }
  if (typeof value !== 'string') {
    return { ok: false, message: `${key} must be a string` }
  }
  const normalized = value.trim()
  return { ok: true, value: normalized || undefined }
}

function parseOptionalBoolean(value: unknown, key: string): ValidationOutcome<boolean | undefined> {
  if (value === undefined) return { ok: true, value: undefined }
  if (typeof value !== 'boolean') {
    return { ok: false, message: `${key} must be a boolean` }
  }
  return { ok: true, value }
}

function parseWinnerPolicyToken(
  value: unknown
): 'winner_id_then_score' | 'score_only' | 'draw_on_missing' | undefined {
  if (typeof value !== 'string') return undefined
  if (value === 'winner_id_then_score' || value === 'score_only' || value === 'draw_on_missing') {
    return value
  }
  return undefined
}

function resolveRoundBallotRules(roundDoc: unknown): {
  allowDraw: boolean
  allowWinnerScoreMismatch: boolean
} {
  const userDefinedData = toPayloadRecord((roundDoc as any)?.userDefinedData) ?? {}
  const compileRecord = toPayloadRecord(userDefinedData.compile)
  const compileCandidate = toPayloadRecord(compileRecord?.options) ?? compileRecord ?? {}
  const winnerPolicyToken =
    parseWinnerPolicyToken(userDefinedData.winner_policy) ??
    parseWinnerPolicyToken(compileCandidate.winner_policy)
  const normalizedCompileOptions = normalizeCompileOptions(
    winnerPolicyToken ? ({ winner_policy: winnerPolicyToken } as any) : undefined,
    DEFAULT_COMPILE_OPTIONS
  )
  const allowDraw = userDefinedData.allow_low_tie_win === true
  const allowWinnerScoreMismatch =
    typeof userDefinedData.allow_score_winner_mismatch === 'boolean'
      ? userDefinedData.allow_score_winner_mismatch
      : normalizedCompileOptions.winner_policy !== 'score_only'
  return {
    allowDraw,
    allowWinnerScoreMismatch,
  }
}

type DrawAllocationContext = {
  teamIds: string[]
  chairs: string[]
  panels: string[]
  trainees: string[]
}

type RoundDrawContext = {
  exists: boolean
  drawOpened: boolean
  allocationOpened: boolean
  rows: DrawAllocationContext[]
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean)))
}

function normalizeDrawTeamIds(teams: unknown): string[] {
  if (Array.isArray(teams)) {
    return normalizeStringList(teams)
  }
  if (!teams || typeof teams !== 'object') return []
  const source = teams as Record<string, unknown>
  const hasFourTeamShape = ['og', 'oo', 'cg', 'co'].some((key) =>
    Object.prototype.hasOwnProperty.call(source, key)
  )
  const values = hasFourTeamShape
    ? [source.og ?? source.gov, source.oo ?? source.opp, source.cg, source.co]
    : [source.gov, source.opp]
  return normalizeStringList(values)
}

function normalizeDrawAllocationRows(allocation: unknown): DrawAllocationContext[] {
  if (!Array.isArray(allocation)) return []
  return allocation
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const source = item as Record<string, unknown>
      const teamIds = normalizeDrawTeamIds(source.teams)
      if (teamIds.length < 2) return null
      return {
        teamIds,
        chairs: normalizeStringList(source.chairs),
        panels: normalizeStringList(source.panels),
        trainees: normalizeStringList(source.trainees),
      }
    })
    .filter((item): item is DrawAllocationContext => Boolean(item))
}

async function loadRoundDrawContext(
  connection: Connection,
  tournamentId: string,
  round: number
): Promise<RoundDrawContext> {
  const drawDoc = await getDrawModel(connection).findOne({ tournamentId, round }).lean().exec()
  return {
    exists: Boolean(drawDoc),
    drawOpened: (drawDoc as any)?.drawOpened === true,
    allocationOpened: (drawDoc as any)?.allocationOpened === true,
    rows: normalizeDrawAllocationRows((drawDoc as any)?.allocation),
  }
}

function hasSameMatchup(row: DrawAllocationContext, teamAId: string, teamBId: string): boolean {
  if (row.teamIds.length !== 2) return false
  const drawPair = [...row.teamIds].sort()
  const payloadPair = [teamAId, teamBId].sort()
  return drawPair[0] === payloadPair[0] && drawPair[1] === payloadPair[1]
}

function rowContainsAdjudicator(row: DrawAllocationContext, adjudicatorId: string): boolean {
  return [...row.chairs, ...row.panels, ...row.trainees].includes(adjudicatorId)
}

async function loadSpeakerIdsByTeamForRound(
  connection: Connection,
  tournamentId: string,
  teamIds: string[],
  round: number
): Promise<Map<string, Set<string>>> {
  const uniqueTeamIds = Array.from(
    new Set(teamIds.map((teamId) => String(teamId ?? '').trim()).filter(Boolean))
  )
  const speakerIdsByTeam = new Map<string, Set<string>>()
  if (uniqueTeamIds.length === 0) return speakerIdsByTeam

  const TeamModel = getTeamModel(connection)
  const teams = await TeamModel.find({
    tournamentId,
    _id: { $in: uniqueTeamIds },
  })
    .lean()
    .exec()

  teams.forEach((team: any) => {
    const teamId = String(team?._id ?? '').trim()
    if (!teamId) return
    const collected = speakerIdsByTeam.get(teamId) ?? new Set<string>()
    const details = Array.isArray(team?.details) ? team.details : []
    const roundDetail = details.find((detail: any) => Number(detail?.r) === round)
    if (Array.isArray(roundDetail?.speakers)) {
      roundDetail.speakers.forEach((speakerId: any) => {
        const normalized = String(speakerId ?? '').trim()
        if (normalized) collected.add(normalized)
      })
    }
    if (!roundDetail && Array.isArray(team?.template?.speakers)) {
      team.template.speakers.forEach((speakerId: any) => {
        const normalized = String(speakerId ?? '').trim()
        if (normalized) collected.add(normalized)
      })
    }
    speakerIdsByTeam.set(teamId, collected)
  })

  return speakerIdsByTeam
}

async function resolveSubmittedEntityType(
  connection: Connection,
  tournamentId: string,
  submittedEntityId?: string
): Promise<'team' | 'speaker' | 'adjudicator' | undefined> {
  const token = String(submittedEntityId ?? '').trim()
  if (!token || !isValidObjectId(token)) return undefined

  const TeamModel = getTeamModel(connection)
  const team = await TeamModel.findOne({ tournamentId, _id: token })
    .select({ _id: 1 })
    .lean()
    .exec()
  if (team) return 'team'

  const SpeakerModel = getSpeakerModel(connection)
  const speaker = await SpeakerModel.findOne({ tournamentId, _id: token })
    .select({ _id: 1 })
    .lean()
    .exec()
  if (speaker) return 'speaker'

  const AdjudicatorModel = getAdjudicatorModel(connection)
  const adjudicator = await AdjudicatorModel.findOne({ tournamentId, _id: token })
    .select({ _id: 1 })
    .lean()
    .exec()
  if (adjudicator) return 'adjudicator'

  return undefined
}

type BallotSubmitterRole = 'chair' | 'panel' | 'trainee'
const DEFAULT_BALLOT_SUBMITTER_ROLES: BallotSubmitterRole[] = ['chair', 'panel']

function resolveBallotSubmitterRoles(userDefinedData: unknown): Set<BallotSubmitterRole> {
  const source = toPayloadRecord(userDefinedData) ?? {}
  if (Array.isArray(source.ballot_submitter_roles)) {
    const roles = new Set<BallotSubmitterRole>()
    source.ballot_submitter_roles.forEach((value) => {
      const role = String(value ?? '')
        .trim()
        .toLowerCase()
      if (role === 'chair' || role === 'panel' || role === 'trainee') roles.add(role)
    })
    return roles
  }
  if (typeof source.allow_panel_ballot_submission === 'boolean') {
    return new Set(
      source.allow_panel_ballot_submission ? DEFAULT_BALLOT_SUBMITTER_ROLES : ['chair']
    )
  }
  return new Set(DEFAULT_BALLOT_SUBMITTER_ROLES)
}

async function validateBallotAgainstDraw(
  connection: Connection,
  tournamentId: string,
  round: number,
  payload: Pick<NormalizedBallotPayload, 'teamAId' | 'teamBId' | 'submittedEntityId'>,
  options?: {
    allowEmptySubmitterList?: boolean
    requirePublishedDraw?: boolean
    ballotSubmitterRoles?: ReadonlySet<BallotSubmitterRole>
  }
): Promise<ValidationOutcome<null>> {
  const draw = await loadRoundDrawContext(connection, tournamentId, round)
  const allocationRows = draw.rows
  if (
    options?.requirePublishedDraw &&
    (!draw.exists || !draw.drawOpened || !draw.allocationOpened || allocationRows.length === 0)
  ) {
    return { ok: false, message: 'draw allocation is not published' }
  }
  if (allocationRows.length === 0) return { ok: true, value: null }

  const row = allocationRows.find((item) => hasSameMatchup(item, payload.teamAId, payload.teamBId))
  if (!row) {
    return { ok: false, message: 'teamAId/teamBId is not present in draw allocation' }
  }

  const submittedEntityId = String(payload.submittedEntityId ?? '').trim()
  if (!submittedEntityId) return { ok: true, value: null }

  const submitterRoles =
    options?.ballotSubmitterRoles ??
    resolveBallotSubmitterRoles(
      (
        await getRoundModel(connection)
          .findOne({ tournamentId, round })
          .select({ userDefinedData: 1 })
          .lean()
          .exec()
      )?.userDefinedData
    )
  const allowedBallotSubmitters = new Set<string>([
    ...(submitterRoles.has('chair') ? row.chairs : []),
    ...(submitterRoles.has('panel') ? row.panels : []),
    ...(submitterRoles.has('trainee') ? row.trainees : []),
  ])
  if (allowedBallotSubmitters.size === 0 && options?.allowEmptySubmitterList) {
    return { ok: true, value: null }
  }
  if (!allowedBallotSubmitters.has(submittedEntityId)) {
    return { ok: false, message: 'submittedEntityId is not assigned to this matchup' }
  }

  return { ok: true, value: null }
}

async function validateFeedbackAgainstDraw(
  connection: Connection,
  tournamentId: string,
  round: number,
  payload: Pick<
    NormalizedFeedbackPayload,
    'adjudicatorId' | 'submittedEntityId' | 'submittedEntityType'
  >,
  options?: { requirePublishedDraw?: boolean }
): Promise<ValidationOutcome<null>> {
  const [draw, roundDoc, style] = await Promise.all([
    loadRoundDrawContext(connection, tournamentId, round),
    getRoundModel(connection).findOne({ tournamentId, round }).lean().exec(),
    loadTournamentStyle(tournamentId),
  ])
  if (!roundDoc) {
    return { ok: false, message: 'round not found' }
  }
  if (!style) {
    return { ok: false, message: 'tournament style not found' }
  }
  const allocationRows = draw.rows
  if (
    options?.requirePublishedDraw &&
    (!draw.exists || !draw.drawOpened || !draw.allocationOpened || allocationRows.length === 0)
  ) {
    return { ok: false, message: 'draw allocation is not published' }
  }
  const userDefined = ((roundDoc as any)?.userDefinedData ?? {}) as Record<string, unknown>
  const evaluateFromTeams = userDefined.evaluate_from_teams !== false
  const evaluateFromAdjudicators = userDefined.evaluate_from_adjudicators !== false
  const evaluatorInTeam = userDefined.evaluator_in_team === 'speaker' ? 'speaker' : 'team'
  const chairsAlwaysEvaluated = userDefined.chairs_always_evaluated === true
  if (!evaluateFromTeams && !evaluateFromAdjudicators) {
    return { ok: false, message: 'feedback is disabled in this round' }
  }

  const submittedEntityType = payload.submittedEntityType
  if (
    (submittedEntityType === 'adjudicator' && !evaluateFromAdjudicators) ||
    ((submittedEntityType === 'team' || submittedEntityType === 'speaker') && !evaluateFromTeams) ||
    (submittedEntityType === 'team' && evaluatorInTeam === 'speaker') ||
    (submittedEntityType === 'speaker' && evaluatorInTeam === 'team')
  ) {
    return { ok: false, message: 'submittedEntityId is not allowed for this feedback target' }
  }

  if (allocationRows.length === 0) return { ok: true, value: null }

  const matchingRows = allocationRows.filter((row) =>
    rowContainsAdjudicator(row, payload.adjudicatorId)
  )
  if (matchingRows.length === 0) {
    return { ok: false, message: 'adjudicatorId is not assigned in draw allocation' }
  }

  const submittedEntityId = String(payload.submittedEntityId ?? '').trim()
  if (!submittedEntityId) return { ok: true, value: null }

  let speakerIdsByTeam = new Map<string, Set<string>>()
  if (evaluateFromTeams && evaluatorInTeam === 'speaker') {
    const feedbackTeamIds = matchingRows.flatMap((row) => row.teamIds)
    speakerIdsByTeam = await loadSpeakerIdsByTeamForRound(
      connection,
      tournamentId,
      feedbackTeamIds,
      round
    )
  }

  const allowedSubmittedEntities = new Set<string>()
  matchingRows.forEach((row) => {
    if (evaluateFromAdjudicators) {
      ;[...row.chairs, ...row.panels, ...row.trainees].forEach((adjudicatorId) => {
        if (adjudicatorId && adjudicatorId !== payload.adjudicatorId) {
          allowedSubmittedEntities.add(adjudicatorId)
        }
      })
    }

    if (!evaluateFromTeams) return
    const teamCanEvaluateTarget = chairsAlwaysEvaluated
      ? row.chairs.includes(payload.adjudicatorId)
      : [...row.chairs, ...row.panels].includes(payload.adjudicatorId)
    if (!teamCanEvaluateTarget) return

    if (evaluatorInTeam === 'team') {
      row.teamIds.forEach((teamId) => allowedSubmittedEntities.add(teamId))
      return
    }

    row.teamIds.forEach((teamId) => {
      ;(speakerIdsByTeam.get(teamId) ?? new Set<string>()).forEach((speakerId) =>
        allowedSubmittedEntities.add(speakerId)
      )
    })
  })

  if (allowedSubmittedEntities.size === 0) {
    return { ok: false, message: 'no valid submittedEntityId exists for this feedback target' }
  }
  if (!allowedSubmittedEntities.has(submittedEntityId)) {
    return { ok: false, message: 'submittedEntityId is not allowed for this feedback target' }
  }

  return { ok: true, value: null }
}

async function normalizeBallotPayload(
  connection: Connection,
  tournamentId: string,
  round: number,
  rawPayload: unknown,
  options?: {
    allowHiddenRound?: boolean
    allowUnknownEntityRefs?: boolean
    requirePublishedDraw?: boolean
  }
): Promise<ValidationOutcome<NormalizedBallotPayload>> {
  const payload = toPayloadRecord(rawPayload)
  if (!payload) return { ok: false, message: 'payload must be an object' }

  const [roundDoc, style] = await Promise.all([
    getRoundModel(connection).findOne({ tournamentId, round }).lean().exec(),
    loadTournamentStyle(tournamentId),
  ])
  if (!roundDoc) {
    return { ok: false, message: 'round not found' }
  }
  if (!style) {
    return { ok: false, message: 'tournament style not found' }
  }
  if (!options?.allowHiddenRound && isRoundHidden(roundDoc)) {
    return { ok: false, message: 'round is hidden from participants' }
  }
  if (normalizeTeamNum(style.team_num) !== 2) {
    return { ok: false, message: 'ballot submissions support only two-team styles' }
  }
  const { allowDraw, allowWinnerScoreMismatch } = resolveRoundBallotRules(roundDoc)
  const awardSelectionRules = resolveRoundAwardSelectionRules((roundDoc as any)?.userDefinedData)
  const noSpeakerScore = (roundDoc as any)?.userDefinedData?.no_speaker_score === true

  const normalizedTeamAId = String(payload.teamAId ?? '').trim()
  const normalizedTeamBId = String(payload.teamBId ?? '').trim()
  if (!normalizedTeamAId || !normalizedTeamBId || normalizedTeamAId === normalizedTeamBId) {
    return { ok: false, message: 'teamAId and teamBId must be different' }
  }

  const winnerToken = parseOptionalTrimmedString(payload.winnerId, 'winnerId')
  if (!winnerToken.ok) return winnerToken
  const normalizedWinner = winnerToken.value ?? ''
  const winnerIsTeamA = normalizedWinner === normalizedTeamAId
  const winnerIsTeamB = normalizedWinner === normalizedTeamBId
  const validWinner = winnerIsTeamA || winnerIsTeamB
  if (normalizedWinner && !validWinner) {
    return { ok: false, message: 'winnerId must match teamAId or teamBId' }
  }

  const drawToken = parseOptionalBoolean(payload.draw, 'draw')
  if (!drawToken.ok) return drawToken
  const drawSelected = drawToken.value === true
  if (drawSelected && normalizedWinner) {
    return { ok: false, message: 'winnerId and draw cannot both be set' }
  }
  if (!drawSelected && !validWinner) {
    return {
      ok: false,
      message: allowDraw ? 'winnerId or draw is required' : 'winnerId is required',
    }
  }

  const scoresAResult = parseOptionalFiniteNumberArray(payload.scoresA, 'scoresA')
  if (!scoresAResult.ok) return scoresAResult
  const scoresBResult = parseOptionalFiniteNumberArray(payload.scoresB, 'scoresB')
  if (!scoresBResult.ok) return scoresBResult

  const speakerIdsAResult = parseOptionalStringArray(payload.speakerIdsA, 'speakerIdsA')
  if (!speakerIdsAResult.ok) return speakerIdsAResult
  const speakerIdsBResult = parseOptionalStringArray(payload.speakerIdsB, 'speakerIdsB')
  if (!speakerIdsBResult.ok) return speakerIdsBResult

  const matterAResult = parseOptionalFiniteNumberArray(payload.matterA, 'matterA')
  if (!matterAResult.ok) return matterAResult
  const mannerAResult = parseOptionalFiniteNumberArray(payload.mannerA, 'mannerA')
  if (!mannerAResult.ok) return mannerAResult
  const matterBResult = parseOptionalFiniteNumberArray(payload.matterB, 'matterB')
  if (!matterBResult.ok) return matterBResult
  const mannerBResult = parseOptionalFiniteNumberArray(payload.mannerB, 'mannerB')
  if (!mannerBResult.ok) return mannerBResult

  const hasMatterA = matterAResult.value !== undefined
  const hasMannerA = mannerAResult.value !== undefined
  if (hasMatterA !== hasMannerA) {
    return { ok: false, message: 'matterA and mannerA must be provided together' }
  }
  const hasMatterB = matterBResult.value !== undefined
  const hasMannerB = mannerBResult.value !== undefined
  if (hasMatterB !== hasMannerB) {
    return { ok: false, message: 'matterB and mannerB must be provided together' }
  }

  const scoresProvidedA = scoresAResult.value !== undefined
  const scoresProvidedB = scoresBResult.value !== undefined
  let parsedScoresA = scoresAResult.value ?? []
  let parsedScoresB = scoresBResult.value ?? []

  if (hasMatterA && hasMannerA) {
    const matterA = matterAResult.value ?? []
    const mannerA = mannerAResult.value ?? []
    if (matterA.length !== mannerA.length) {
      return { ok: false, message: 'matterA and mannerA must have the same length' }
    }
    const derivedScoresA = matterA.map((matter, index) => matter + mannerA[index])
    if (scoresProvidedA && parsedScoresA.length !== derivedScoresA.length) {
      return { ok: false, message: 'scoresA length must match matterA/mannerA lengths' }
    }
    parsedScoresA = derivedScoresA
  }

  if (hasMatterB && hasMannerB) {
    const matterB = matterBResult.value ?? []
    const mannerB = mannerBResult.value ?? []
    if (matterB.length !== mannerB.length) {
      return { ok: false, message: 'matterB and mannerB must have the same length' }
    }
    const derivedScoresB = matterB.map((matter, index) => matter + mannerB[index])
    if (scoresProvidedB && parsedScoresB.length !== derivedScoresB.length) {
      return { ok: false, message: 'scoresB length must match matterB/mannerB lengths' }
    }
    parsedScoresB = derivedScoresB
  }

  if (!scoresProvidedA && !hasMatterA) {
    return { ok: false, message: 'scoresA must be provided as an array' }
  }
  if (!scoresProvidedB && !hasMatterB) {
    return { ok: false, message: 'scoresB must be provided as an array' }
  }

  const bestAResult = parseOptionalBooleanArray(payload.bestA, 'bestA')
  if (!bestAResult.ok) return bestAResult
  const bestBResult = parseOptionalBooleanArray(payload.bestB, 'bestB')
  if (!bestBResult.ok) return bestBResult
  const poiAResult = parseOptionalBooleanArray(payload.poiA, 'poiA')
  if (!poiAResult.ok) return poiAResult
  const poiBResult = parseOptionalBooleanArray(payload.poiB, 'poiB')
  if (!poiBResult.ok) return poiBResult

  const commentResult = parseOptionalString(payload.comment, 'comment')
  if (!commentResult.ok) return commentResult
  const submittedEntityResult = parseOptionalTrimmedString(
    payload.submittedEntityId,
    'submittedEntityId'
  )
  if (!submittedEntityResult.ok) return submittedEntityResult
  const submittedEntityType = await resolveSubmittedEntityType(
    connection,
    tournamentId,
    submittedEntityResult.value
  )
  if (!options?.allowUnknownEntityRefs && submittedEntityResult.value && !submittedEntityType) {
    return { ok: false, message: 'submittedEntityId must reference a tournament entity' }
  }

  if (!options?.allowUnknownEntityRefs) {
    if (!isValidObjectId(normalizedTeamAId) || !isValidObjectId(normalizedTeamBId)) {
      return { ok: false, message: 'teamAId and teamBId must reference tournament teams' }
    }
    const referencedTeamCount = await getTeamModel(connection)
      .countDocuments({
        tournamentId,
        _id: { $in: [normalizedTeamAId, normalizedTeamBId] },
      })
      .exec()
    if (referencedTeamCount !== 2) {
      return { ok: false, message: 'teamAId and teamBId must reference tournament teams' }
    }
  }

  const hasScoresA = parsedScoresA.length > 0
  const hasScoresB = parsedScoresB.length > 0
  if (hasScoresA !== hasScoresB) {
    return { ok: false, message: 'scoresA and scoresB must both be provided or both empty' }
  }
  if (!noSpeakerScore && !hasScoresA && !hasScoresB) {
    return { ok: false, message: 'speaker scores are required in this round' }
  }
  if (noSpeakerScore && (hasScoresA || hasScoresB)) {
    return { ok: false, message: 'speaker scores are disabled in this round' }
  }

  if (!noSpeakerScore) {
    const expectedScoresA = roleCountForSide(style, 'gov')
    const expectedScoresB = roleCountForSide(style, 'opp')
    if (expectedScoresA > 0 && parsedScoresA.length !== expectedScoresA) {
      return { ok: false, message: `scoresA must contain exactly ${expectedScoresA} scores` }
    }
    if (expectedScoresB > 0 && parsedScoresB.length !== expectedScoresB) {
      return { ok: false, message: `scoresB must contain exactly ${expectedScoresB} scores` }
    }
    if (
      isValidObjectId(normalizedTeamAId) &&
      isValidObjectId(normalizedTeamBId) &&
      (!speakerIdsAResult.value || !speakerIdsBResult.value)
    ) {
      return { ok: false, message: 'speakerIdsA and speakerIdsB are required with speaker scores' }
    }
    const scoreRanges = normalizeOrderedRanges(style.range)
    const validateScores = (scores: number[], label: string): string | null => {
      for (let index = 0; index < scores.length; index += 1) {
        const range = scoreRanges[index] ?? scoreRanges[scoreRanges.length - 1]
        if (range && !scoreMatchesRange(scores[index], range)) {
          return `${label}[${index}] is outside the configured score range or unit`
        }
      }
      return null
    }
    const rangeError =
      validateScores(parsedScoresA, 'scoresA') ?? validateScores(parsedScoresB, 'scoresB')
    if (rangeError) return { ok: false, message: rangeError }
  }

  const scoreLengthMismatch =
    !arrayLengthMatches(speakerIdsAResult.value, parsedScoresA.length) ||
    !arrayLengthMatches(speakerIdsBResult.value, parsedScoresB.length) ||
    !arrayLengthMatches(matterAResult.value, parsedScoresA.length) ||
    !arrayLengthMatches(mannerAResult.value, parsedScoresA.length) ||
    !arrayLengthMatches(matterBResult.value, parsedScoresB.length) ||
    !arrayLengthMatches(mannerBResult.value, parsedScoresB.length) ||
    !arrayLengthMatches(bestAResult.value, parsedScoresA.length) ||
    !arrayLengthMatches(bestBResult.value, parsedScoresB.length) ||
    !arrayLengthMatches(poiAResult.value, parsedScoresA.length) ||
    !arrayLengthMatches(poiBResult.value, parsedScoresB.length)
  if (scoreLengthMismatch) {
    return { ok: false, message: 'speaker/flag arrays must match score lengths' }
  }

  const awardSelectionViolation = validateBallotAwardSelectionCounts(
    {
      bestA: bestAResult.value,
      bestB: bestBResult.value,
      poiA: poiAResult.value,
      poiB: poiBResult.value,
    },
    awardSelectionRules
  )
  if (awardSelectionViolation) {
    return {
      ok: false,
      message: `${awardSelectionViolation.kind} selection count must be between ${awardSelectionViolation.min} and ${awardSelectionViolation.max}`,
    }
  }

  const hasComparableScores = parsedScoresA.length > 0 && parsedScoresB.length > 0
  const totalA = sumScores(parsedScoresA)
  const totalB = sumScores(parsedScoresB)
  const tiedScore = !hasComparableScores || totalA === totalB

  if (drawSelected) {
    if (!allowDraw) {
      return { ok: false, message: 'draw is not allowed in this round' }
    }
    if (!allowWinnerScoreMismatch && !tiedScore) {
      return {
        ok: false,
        message: 'draw is allowed only on tied scores when winner-score mismatch is disabled',
      }
    }
  } else if (!allowWinnerScoreMismatch && hasComparableScores && totalA !== totalB) {
    if (winnerIsTeamA && totalA < totalB) {
      return { ok: false, message: 'winnerId must follow score order in this round' }
    }
    if (winnerIsTeamB && totalB < totalA) {
      return { ok: false, message: 'winnerId must follow score order in this round' }
    }
  }

  const drawValidation = await validateBallotAgainstDraw(
    connection,
    tournamentId,
    round,
    {
      teamAId: normalizedTeamAId,
      teamBId: normalizedTeamBId,
      submittedEntityId: submittedEntityResult.value,
    },
    {
      allowEmptySubmitterList: options?.allowUnknownEntityRefs === true,
      requirePublishedDraw: options?.requirePublishedDraw,
      ballotSubmitterRoles: resolveBallotSubmitterRoles((roundDoc as any)?.userDefinedData),
    }
  )
  if (!drawValidation.ok) return drawValidation

  if (!noSpeakerScore && isValidObjectId(normalizedTeamAId) && isValidObjectId(normalizedTeamBId)) {
    const speakerIdsA = speakerIdsAResult.value ?? []
    const speakerIdsB = speakerIdsBResult.value ?? []
    if ([...speakerIdsA, ...speakerIdsB].some((speakerId) => !isValidObjectId(speakerId))) {
      return { ok: false, message: 'speaker ids must reference tournament speakers' }
    }
    const speakerIdsByTeam = await loadSpeakerIdsByTeamForRound(
      connection,
      tournamentId,
      [normalizedTeamAId, normalizedTeamBId],
      round
    )
    if (!speakerIdsByTeam.has(normalizedTeamAId) || !speakerIdsByTeam.has(normalizedTeamBId)) {
      return { ok: false, message: 'teamAId and teamBId must reference tournament teams' }
    }
    const allowedA = speakerIdsByTeam.get(normalizedTeamAId) ?? new Set<string>()
    const allowedB = speakerIdsByTeam.get(normalizedTeamBId) ?? new Set<string>()
    if (speakerIdsA.some((speakerId) => !allowedA.has(speakerId))) {
      return { ok: false, message: 'speakerIdsA contains a speaker outside teamA' }
    }
    if (speakerIdsB.some((speakerId) => !allowedB.has(speakerId))) {
      return { ok: false, message: 'speakerIdsB contains a speaker outside teamB' }
    }
    const uniqueSpeakerIds = Array.from(new Set([...speakerIdsA, ...speakerIdsB]))
    const speakerCount = await getSpeakerModel(connection)
      .countDocuments({ tournamentId, _id: { $in: uniqueSpeakerIds } })
      .exec()
    if (speakerCount !== uniqueSpeakerIds.length) {
      return { ok: false, message: 'speaker ids must reference tournament speakers' }
    }
  }

  return {
    ok: true,
    value: {
      teamAId: normalizedTeamAId,
      teamBId: normalizedTeamBId,
      winnerId: drawSelected ? undefined : normalizedWinner || undefined,
      draw: drawSelected || undefined,
      speakerIdsA: speakerIdsAResult.value,
      speakerIdsB: speakerIdsBResult.value,
      scoresA: parsedScoresA,
      scoresB: parsedScoresB,
      comment: commentResult.value,
      submittedEntityId: submittedEntityResult.value,
      submittedEntityType,
      bestA: bestAResult.value,
      bestB: bestBResult.value,
      poiA: poiAResult.value,
      poiB: poiBResult.value,
      matterA: matterAResult.value,
      mannerA: mannerAResult.value,
      matterB: matterBResult.value,
      mannerB: mannerBResult.value,
    },
  }
}

async function normalizeFeedbackPayload(
  connection: Connection,
  tournamentId: string,
  round: number,
  rawPayload: unknown,
  options?: {
    allowHiddenRound?: boolean
    allowUnknownEntityRefs?: boolean
    requirePublishedDraw?: boolean
  }
): Promise<ValidationOutcome<NormalizedFeedbackPayload>> {
  const payload = toPayloadRecord(rawPayload)
  if (!payload) return { ok: false, message: 'payload must be an object' }

  const [roundDoc, style] = await Promise.all([
    getRoundModel(connection).findOne({ tournamentId, round }).lean().exec(),
    loadTournamentStyle(tournamentId),
  ])
  if (!roundDoc) {
    return { ok: false, message: 'round not found' }
  }
  if (!style) {
    return { ok: false, message: 'tournament style not found' }
  }
  if (!options?.allowHiddenRound && isRoundHidden(roundDoc)) {
    return { ok: false, message: 'round is hidden from participants' }
  }

  const normalizedAdjudicatorId = String(payload.adjudicatorId ?? '').trim()
  if (!normalizedAdjudicatorId) {
    return { ok: false, message: 'adjudicatorId is required' }
  }

  const score = payload.score
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
    return { ok: false, message: 'score must be a finite non-negative number' }
  }
  const adjudicatorRange = normalizeNumericRange(style.adjudicator_range)

  const commentResult = parseOptionalString(payload.comment, 'comment')
  if (!commentResult.ok) return commentResult
  const submittedEntityResult = parseOptionalTrimmedString(
    payload.submittedEntityId,
    'submittedEntityId'
  )
  if (!submittedEntityResult.ok) return submittedEntityResult
  const submittedEntityType = await resolveSubmittedEntityType(
    connection,
    tournamentId,
    submittedEntityResult.value
  )
  if (!options?.allowUnknownEntityRefs && submittedEntityResult.value && !submittedEntityType) {
    return { ok: false, message: 'submittedEntityId must reference a tournament entity' }
  }
  if (!options?.allowUnknownEntityRefs) {
    if (!isValidObjectId(normalizedAdjudicatorId)) {
      return { ok: false, message: 'adjudicatorId must reference a tournament adjudicator' }
    }
    const targetExists = await getAdjudicatorModel(connection)
      .exists({ tournamentId, _id: normalizedAdjudicatorId })
      .exec()
    if (!targetExists) {
      return { ok: false, message: 'adjudicatorId must reference a tournament adjudicator' }
    }
  }

  if (
    payload.matter !== undefined &&
    (typeof payload.matter !== 'number' || !Number.isFinite(payload.matter))
  ) {
    return { ok: false, message: 'matter must be a finite number' }
  }
  if (
    payload.manner !== undefined &&
    (typeof payload.manner !== 'number' || !Number.isFinite(payload.manner))
  ) {
    return { ok: false, message: 'manner must be a finite number' }
  }
  const hasMatter = payload.matter !== undefined
  const hasManner = payload.manner !== undefined
  if (hasMatter !== hasManner) {
    return { ok: false, message: 'matter and manner must be provided together' }
  }
  if (adjudicatorRange) {
    if (hasMatter && hasManner) {
      if (!scoreMatchesRange(payload.matter as number, adjudicatorRange)) {
        return { ok: false, message: 'matter is outside the configured score range or unit' }
      }
      if (!scoreMatchesRange(payload.manner as number, adjudicatorRange)) {
        return { ok: false, message: 'manner is outside the configured score range or unit' }
      }
      if (Math.abs(score - ((payload.matter as number) + (payload.manner as number))) > 1e-8) {
        return { ok: false, message: 'score must equal matter plus manner' }
      }
    } else if (!scoreMatchesRange(score, adjudicatorRange)) {
      return { ok: false, message: 'score is outside the configured score range or unit' }
    }
  }

  const drawValidation = await validateFeedbackAgainstDraw(
    connection,
    tournamentId,
    round,
    {
      adjudicatorId: normalizedAdjudicatorId,
      submittedEntityId: submittedEntityResult.value,
      submittedEntityType,
    },
    { requirePublishedDraw: options?.requirePublishedDraw }
  )
  if (!drawValidation.ok) return drawValidation

  return {
    ok: true,
    value: {
      adjudicatorId: normalizedAdjudicatorId,
      score,
      comment: commentResult.value,
      submittedEntityId: submittedEntityResult.value,
      submittedEntityType,
      matter: payload.matter as number | undefined,
      manner: payload.manner as number | undefined,
    },
  }
}

export const listSubmissions: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, type, round } = req.query as {
      tournamentId?: string
      type?: 'ballot' | 'feedback'
      round?: string | number
    }

    if (!ensureTournamentId(res, tournamentId)) return

    const connection = await getTournamentConnection(tournamentId)
    const SubmissionModel = getSubmissionModel(connection)

    const filter: Record<string, unknown> = { tournamentId }
    if (type) filter.type = type
    if (round !== undefined) filter.round = Number(round)

    const submissions = await SubmissionModel.find(filter)
      .select({
        _id: 1,
        round: 1,
        type: 1,
        payload: 1,
        submittedBy: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec()
    res.json({ data: submissions, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const listParticipantSubmissions: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, type, round, submittedEntityId } = req.query as {
      tournamentId?: string
      type?: 'ballot' | 'feedback'
      round?: string | number
      submittedEntityId?: string
    }

    if (!ensureTournamentId(res, tournamentId)) return

    const actor = String(submittedEntityId ?? '').trim()
    if (!actor) {
      badRequest(res, 'submittedEntityId is required')
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const SubmissionModel = getSubmissionModel(connection)

    const filter: Record<string, unknown> = {
      tournamentId,
      $or: [{ 'payload.submittedEntityId': actor }, { submittedBy: actor }],
    }
    if (type) filter.type = type
    if (round !== undefined) filter.round = Number(round)

    const submissions = await SubmissionModel.find(filter).sort({ createdAt: -1 }).lean().exec()
    res.json({ data: submissions, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createBallotSubmission: RequestHandler = async (req, res, next) => {
  try {
    const {
      tournamentId,
      round,
      teamAId,
      teamBId,
      winnerId,
      draw,
      speakerIdsA,
      speakerIdsB,
      scoresA,
      scoresB,
      comment,
      submittedEntityId,
      bestA,
      bestB,
      poiA,
      poiB,
      matterA,
      mannerA,
      matterB,
      mannerB,
    } = req.body as {
      tournamentId: string
      round: number
      teamAId: string
      teamBId: string
      winnerId?: string
      draw?: boolean
      scoresA: number[]
      scoresB: number[]
      comment?: string
      speakerIdsA?: string[]
      speakerIdsB?: string[]
      submittedEntityId?: string
      bestA?: boolean[]
      bestB?: boolean[]
      poiA?: boolean[]
      poiB?: boolean[]
      matterA?: number[]
      mannerA?: number[]
      matterB?: number[]
      mannerB?: number[]
    }

    if (!ensureTournamentId(res, tournamentId)) return
    const actor = resolveSubmissionActor(submittedEntityId, req.session?.userId)
    if (!actor) {
      badRequest(res, 'submittedEntityId or authenticated user is required')
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const SubmissionModel = getSubmissionModel(connection)
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    const normalized = await normalizeBallotPayload(
      connection,
      tournamentId,
      round,
      {
        teamAId,
        teamBId,
        winnerId,
        draw,
        speakerIdsA,
        speakerIdsB,
        scoresA,
        scoresB,
        comment,
        submittedEntityId,
        bestA,
        bestB,
        poiA,
        poiB,
        matterA,
        mannerA,
        matterB,
        mannerB,
      },
      {
        allowHiddenRound: isAdmin,
        allowUnknownEntityRefs: isAdmin,
        requirePublishedDraw: !isAdmin,
      }
    )
    if (!normalized.ok) {
      badRequest(res, normalized.message)
      return
    }
    const payload = normalized.value
    const normalizedTeamAId = payload.teamAId
    const normalizedTeamBId = payload.teamBId
    const dedupeKey = buildBallotDedupeKey(payload, req.session?.userId)
    const duplicate = await SubmissionModel.findOne({
      tournamentId,
      round,
      type: 'ballot',
      $and: [
        { $or: [{ 'payload.submittedEntityId': actor }, { submittedBy: actor }] },
        {
          $or: [
            { 'payload.teamAId': normalizedTeamAId, 'payload.teamBId': normalizedTeamBId },
            { 'payload.teamAId': normalizedTeamBId, 'payload.teamBId': normalizedTeamAId },
          ],
        },
      ],
    })
      .select({ _id: 1 })
      .lean()
      .exec()
    if (duplicate) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: DUPLICATE_BALLOT_MESSAGE }] })
      return
    }
    const created = await SubmissionModel.create({
      tournamentId,
      round,
      type: 'ballot',
      payload,
      submittedBy: req.session?.userId,
      ...(dedupeKey ? { dedupeKey } : {}),
    })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err) {
    if (isDuplicateSubmissionKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: DUPLICATE_BALLOT_MESSAGE }] })
      return
    }
    next(err)
  }
}

export const createFeedbackSubmission: RequestHandler = async (req, res, next) => {
  try {
    const {
      tournamentId,
      round,
      adjudicatorId,
      score,
      comment,
      submittedEntityId,
      matter,
      manner,
    } = req.body as {
      tournamentId: string
      round: number
      adjudicatorId: string
      score: number
      comment?: string
      submittedEntityId?: string
      matter?: number
      manner?: number
    }

    if (!ensureTournamentId(res, tournamentId)) return
    const actor = resolveSubmissionActor(submittedEntityId, req.session?.userId)
    if (!actor) {
      badRequest(res, 'submittedEntityId or authenticated user is required')
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    const normalized = await normalizeFeedbackPayload(
      connection,
      tournamentId,
      round,
      {
        adjudicatorId,
        score,
        comment,
        submittedEntityId,
        matter,
        manner,
      },
      {
        allowHiddenRound: isAdmin,
        allowUnknownEntityRefs: isAdmin,
        requirePublishedDraw: !isAdmin,
      }
    )
    if (!normalized.ok) {
      badRequest(res, normalized.message)
      return
    }
    const payload = normalized.value

    const SubmissionModel = getSubmissionModel(connection)
    const dedupeKey = buildFeedbackDedupeKey(payload, req.session?.userId)
    const duplicate = await SubmissionModel.findOne({
      tournamentId,
      round,
      type: 'feedback',
      'payload.adjudicatorId': payload.adjudicatorId,
      $or: [{ 'payload.submittedEntityId': actor }, { submittedBy: actor }],
    })
      .select({ _id: 1 })
      .lean()
      .exec()
    if (duplicate) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: DUPLICATE_FEEDBACK_MESSAGE }] })
      return
    }
    const created = await SubmissionModel.create({
      tournamentId,
      round,
      type: 'feedback',
      payload,
      submittedBy: req.session?.userId,
      ...(dedupeKey ? { dedupeKey } : {}),
    })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err) {
    if (isDuplicateSubmissionKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: DUPLICATE_FEEDBACK_MESSAGE }] })
      return
    }
    next(err)
  }
}

export const updateSubmission: RequestHandler = async (req, res, next) => {
  let submissionType: 'ballot' | 'feedback' | null = null
  try {
    const { id } = req.params
    const { tournamentId, round, payload } = req.body as {
      tournamentId: string
      round?: number
      payload?: Record<string, unknown>
    }

    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureSubmissionId(res, id)) return

    const connection = await getTournamentConnection(tournamentId)
    const SubmissionModel = getSubmissionModel(connection)
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    const existing = await SubmissionModel.findOne({ _id: id, tournamentId }).lean().exec()
    if (!existing) {
      notFound(res, 'Submission not found')
      return
    }
    submissionType = existing.type === 'feedback' ? 'feedback' : 'ballot'

    const nextRound = round ?? Number(existing.round)
    if (!Number.isFinite(nextRound) || nextRound < 1) {
      badRequest(res, 'round must be an integer >= 1')
      return
    }

    let nextPayload: unknown = payload ?? existing.payload
    if (existing.type === 'ballot') {
      const normalizedBallot = await normalizeBallotPayload(
        connection,
        tournamentId,
        nextRound,
        nextPayload,
        { allowHiddenRound: isAdmin, allowUnknownEntityRefs: isAdmin }
      )
      if (!normalizedBallot.ok) {
        badRequest(res, normalizedBallot.message)
        return
      }
      nextPayload = normalizedBallot.value
    } else {
      const normalizedFeedback = await normalizeFeedbackPayload(
        connection,
        tournamentId,
        nextRound,
        nextPayload,
        { allowHiddenRound: isAdmin, allowUnknownEntityRefs: isAdmin }
      )
      if (!normalizedFeedback.ok) {
        badRequest(res, normalizedFeedback.message)
        return
      }
      nextPayload = normalizedFeedback.value
    }

    const dedupeKey =
      existing.type === 'ballot'
        ? buildBallotDedupeKey(
            nextPayload as NormalizedBallotPayload,
            existing.submittedBy ?? undefined
          )
        : buildFeedbackDedupeKey(
            nextPayload as NormalizedFeedbackPayload,
            existing.submittedBy ?? undefined
          )

    const setPayload: Record<string, unknown> = {
      round: nextRound,
      payload: nextPayload,
    }
    const unsetPayload: Record<string, 1> = {}
    if (dedupeKey) {
      setPayload.dedupeKey = dedupeKey
    } else {
      unsetPayload.dedupeKey = 1
    }

    const updated = await SubmissionModel.findOneAndUpdate(
      { _id: id, tournamentId },
      Object.keys(unsetPayload).length > 0
        ? {
            $set: setPayload,
            $unset: unsetPayload,
          }
        : {
            $set: setPayload,
          },
      { new: true }
    )
      .lean()
      .exec()

    if (!updated) {
      notFound(res, 'Submission not found')
      return
    }

    res.json({ data: updated, errors: [] })
  } catch (err) {
    if (submissionType && isDuplicateSubmissionKeyError(err)) {
      res.status(409).json({
        data: null,
        errors: [{ name: 'Conflict', message: duplicateMessageByType(submissionType) }],
      })
      return
    }
    next(err)
  }
}

export const deleteSubmission: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }

    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureSubmissionId(res, id)) return

    const connection = await getTournamentConnection(tournamentId)
    const SubmissionModel = getSubmissionModel(connection)
    const deleted = await SubmissionModel.findOneAndDelete({ _id: id, tournamentId }).lean().exec()
    if (!deleted) {
      notFound(res, 'Submission not found')
      return
    }

    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
