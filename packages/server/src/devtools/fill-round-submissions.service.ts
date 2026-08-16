import { Types } from 'mongoose'

import { getDrawModel } from '../models/draw.js'
import { getRoundModel } from '../models/round.js'
import { getSubmissionModel } from '../models/submission.js'
import { getTeamModel } from '../models/team.js'
import { StyleModel } from '../models/style.js'
import { TournamentModel } from '../models/tournament.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import {
  DevToolsServiceError,
  type ClearRoundSubmissionsResponse,
  type FillRoundSubmissionsMode,
  type FillRoundSubmissionsResponse,
  type SubmissionCountSummary,
} from './types.js'

type NormalizedDrawRow = {
  gov: string
  opp: string
  chairs: string[]
  panels: string[]
  trainees: string[]
  ballotSubmitters: string[]
  adjudicators: string[]
}

type FeedbackSettings = {
  fromTeams: boolean
  fromAdjudicators: boolean
  evaluatorInTeam: 'team' | 'speaker'
  chairsAlwaysEvaluated: boolean
  noSpeakerScore: boolean
  ballotSubmitterRoles: Set<'chair' | 'panel' | 'trainee'>
}

type NumericRange = { from: number; to: number; unit: number }

type SubmissionStyleSettings = {
  govScoreCount: number
  oppScoreCount: number
  speakerRanges: NumericRange[]
  adjudicatorRange: NumericRange | null
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const normalized: string[] = []
  value.forEach((item) => {
    const token = String(item ?? '').trim()
    if (!token || seen.has(token)) return
    seen.add(token)
    normalized.push(token)
  })
  return normalized
}

function normalizeDrawTeams(value: unknown): { gov: string; opp: string } | null {
  if (Array.isArray(value)) {
    const gov = String(value[0] ?? '').trim()
    const opp = String(value[1] ?? '').trim()
    if (!gov || !opp || gov === opp) return null
    return { gov, opp }
  }
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const gov = String(source.gov ?? '').trim()
  const opp = String(source.opp ?? '').trim()
  if (!gov || !opp || gov === opp) return null
  return { gov, opp }
}

function normalizeDrawRows(allocation: unknown, userDefinedData?: unknown): NormalizedDrawRow[] {
  if (!Array.isArray(allocation)) return []
  const settings = asRecord(userDefinedData)
  const configuredRoles = Array.isArray(settings.ballot_submitter_roles)
    ? settings.ballot_submitter_roles
        .map((value) =>
          String(value ?? '')
            .trim()
            .toLowerCase()
        )
        .filter(
          (value): value is 'chair' | 'panel' | 'trainee' =>
            value === 'chair' || value === 'panel' || value === 'trainee'
        )
    : typeof settings.allow_panel_ballot_submission === 'boolean'
      ? settings.allow_panel_ballot_submission
        ? ['chair', 'panel']
        : ['chair']
      : ['chair', 'panel']
  const ballotSubmitterRoles = new Set(configuredRoles)
  return allocation
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const source = item as Record<string, unknown>
      const teams = normalizeDrawTeams(source.teams)
      if (!teams) return null
      const chairs = normalizeIdList(source.chairs)
      const panels = normalizeIdList(source.panels)
      const trainees = normalizeIdList(source.trainees)
      const ballotSubmitters = normalizeIdList([
        ...(ballotSubmitterRoles.has('chair') ? chairs : []),
        ...(ballotSubmitterRoles.has('panel') ? panels : []),
        ...(ballotSubmitterRoles.has('trainee') ? trainees : []),
      ])
      const adjudicators = normalizeIdList([...chairs, ...panels, ...trainees])
      if (adjudicators.length === 0) return null
      return {
        gov: teams.gov,
        opp: teams.opp,
        chairs,
        panels,
        trainees,
        ballotSubmitters,
        adjudicators,
      }
    })
    .filter((row): row is NormalizedDrawRow => Boolean(row))
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeNumericRange(value: unknown): NumericRange | null {
  if (Array.isArray(value)) {
    const from = Number(value[0])
    const to = Number(value[1])
    const unit = Number(value[2])
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return null
    return { from, to, unit: Number.isFinite(unit) && unit > 0 ? unit : 0 }
  }
  const source = asRecord(asRecord(value).value ?? value)
  const from = Number(source.from)
  const to = Number(source.to)
  const unit = Number(source.unit)
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return null
  return { from, to, unit: Number.isFinite(unit) && unit > 0 ? unit : 0 }
}

function normalizeOrderedRanges(value: unknown): NumericRange[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry, index) => ({
      range: normalizeNumericRange(entry),
      order: Number(asRecord(entry).order ?? index + 1),
    }))
    .filter((entry): entry is { range: NumericRange; order: number } => entry.range !== null)
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.range)
}

function roleCountForSide(style: Record<string, unknown>, side: 'gov' | 'opp'): number {
  const roles = asRecord(style.roles)[side]
  if (Array.isArray(roles) && roles.length > 0) return roles.length
  const ranges = normalizeOrderedRanges(style.range)
  if (ranges.length > 0) return ranges.length
  return Array.isArray(style.score_weights) ? style.score_weights.length : 0
}

async function loadSubmissionStyleSettings(tournamentId: string): Promise<SubmissionStyleSettings> {
  const tournament = await TournamentModel.findById(tournamentId).lean().exec()
  if (!tournament || typeof tournament.style !== 'number') {
    throw new DevToolsServiceError(400, 'Tournament style is required')
  }
  const styleDoc = await StyleModel.findOne({ id: tournament.style }).lean().exec()
  if (!styleDoc) throw new DevToolsServiceError(400, 'Tournament style not found')
  const overrides = asRecord((tournament.options as any)?.style)
  const overridesScoreLayout = Array.isArray(overrides.score_weights)
  const style: Record<string, unknown> = {
    ...(styleDoc as Record<string, unknown>),
    ...overrides,
    ...(overridesScoreLayout && overrides.roles === undefined ? { roles: undefined } : {}),
    ...(overridesScoreLayout && overrides.range === undefined ? { range: [] } : {}),
  }
  return {
    govScoreCount: roleCountForSide(style, 'gov'),
    oppScoreCount: roleCountForSide(style, 'opp'),
    speakerRanges: normalizeOrderedRanges(style.range),
    adjudicatorRange: normalizeNumericRange(style.adjudicator_range),
  }
}

function resolveFeedbackSettings(roundDoc: unknown): FeedbackSettings {
  const userDefinedData = asRecord((roundDoc as any)?.userDefinedData)
  return {
    fromTeams: userDefinedData.evaluate_from_teams === true,
    fromAdjudicators: userDefinedData.evaluate_from_adjudicators === true,
    evaluatorInTeam: userDefinedData.evaluator_in_team === 'speaker' ? 'speaker' : 'team',
    chairsAlwaysEvaluated: userDefinedData.chairs_always_evaluated === true,
    noSpeakerScore: userDefinedData.no_speaker_score === true,
    ballotSubmitterRoles: new Set(
      Array.isArray(userDefinedData.ballot_submitter_roles)
        ? userDefinedData.ballot_submitter_roles.filter(
            (value): value is 'chair' | 'panel' | 'trainee' =>
              value === 'chair' || value === 'panel' || value === 'trainee'
          )
        : ['chair', 'panel']
    ),
  }
}

function randomInt(minInclusive: number, maxInclusive: number): number {
  const min = Math.ceil(minInclusive)
  const max = Math.floor(maxInclusive)
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomScore(
  range: NumericRange | undefined,
  fallbackFrom: number,
  fallbackTo: number
): number {
  if (!range) return randomInt(fallbackFrom, fallbackTo)
  if (range.unit <= 0) return range.from + Math.random() * (range.to - range.from)
  const stepCount = Math.floor((range.to - range.from) / range.unit + 1e-8)
  return range.from + randomInt(0, Math.max(0, stepCount)) * range.unit
}

function ballotKey(round: number, actor: string, teamAId: string, teamBId: string): string {
  const pair = [teamAId, teamBId].sort()
  return `${round}:ballot:${actor}:${pair[0]}:${pair[1]}`
}

function feedbackKey(round: number, actor: string, adjudicatorId: string): string {
  return `${round}:feedback:${actor}:${adjudicatorId}`
}

function ballotDedupeKey(payload: Record<string, unknown>): string {
  const actor = String(payload.submittedEntityId ?? '').trim()
  const teamIds = [
    String(payload.teamAId ?? '').trim(),
    String(payload.teamBId ?? '').trim(),
  ].sort()
  return `ballot:${actor}:${teamIds[0]}:${teamIds[1]}`
}

function feedbackDedupeKey(payload: Record<string, unknown>): string {
  const actor = String(payload.submittedEntityId ?? '').trim()
  const adjudicatorId = String(payload.adjudicatorId ?? '').trim()
  return `feedback:${actor}:${adjudicatorId}`
}

function resolveSubmissionActor(item: any): string {
  const payloadActor = String(item?.payload?.submittedEntityId ?? '').trim()
  if (payloadActor) return payloadActor
  return String(item?.submittedBy ?? '').trim()
}

function buildBallotPayload(
  row: NormalizedDrawRow,
  submittedEntityId: string,
  govSpeakerIds: string[],
  oppSpeakerIds: string[],
  noSpeakerScore: boolean,
  style: SubmissionStyleSettings
): Record<string, unknown> {
  if (noSpeakerScore) {
    const winnerId = Math.random() < 0.5 ? row.gov : row.opp
    return {
      teamAId: row.gov,
      teamBId: row.opp,
      winnerId,
      scoresA: [],
      scoresB: [],
      submittedEntityId,
      comment: 'devtools generated ballot',
      userDefinedData: { __devtools: { source: 'fill-round-submissions' } },
    }
  }

  if (style.govScoreCount < 1 || style.oppScoreCount < 1) {
    throw new DevToolsServiceError(400, 'Tournament style must define speaker score roles')
  }
  if (govSpeakerIds.length === 0 || oppSpeakerIds.length === 0) {
    throw new DevToolsServiceError(400, 'Speaker assignments are required for generated ballots')
  }

  const scoresA = Array.from({ length: style.govScoreCount }).map((_, index) =>
    randomScore(style.speakerRanges[index] ?? style.speakerRanges.at(-1), 72, 79)
  )
  const scoresB = Array.from({ length: style.oppScoreCount }).map((_, index) =>
    randomScore(style.speakerRanges[index] ?? style.speakerRanges.at(-1), 72, 79)
  )

  const totalA = scoresA.reduce((sum, value) => sum + value, 0)
  const totalB = scoresB.reduce((sum, value) => sum + value, 0)
  const winnerId = totalA >= totalB ? row.gov : row.opp

  const payload: Record<string, unknown> = {
    teamAId: row.gov,
    teamBId: row.opp,
    winnerId,
    scoresA,
    scoresB,
    submittedEntityId,
    comment: 'devtools generated ballot',
    userDefinedData: { __devtools: { source: 'fill-round-submissions' } },
  }

  payload.speakerIdsA = Array.from(
    { length: style.govScoreCount },
    (_, index) => govSpeakerIds[index % govSpeakerIds.length]
  )
  payload.speakerIdsB = Array.from(
    { length: style.oppScoreCount },
    (_, index) => oppSpeakerIds[index % oppSpeakerIds.length]
  )

  return payload
}

function buildFeedbackPayload(
  adjudicatorId: string,
  submittedEntityId: string,
  range: NumericRange | null
): Record<string, unknown> {
  return {
    adjudicatorId,
    score: randomScore(range ?? undefined, 5, 9),
    submittedEntityId,
    comment: 'devtools generated feedback',
    userDefinedData: { __devtools: { source: 'fill-round-submissions' } },
  }
}

function toSummary(ballot: number, feedback: number): SubmissionCountSummary {
  return {
    ballot,
    feedback,
    total: ballot + feedback,
  }
}

export async function clearRoundSubmissions(
  tournamentId: string,
  round: number
): Promise<ClearRoundSubmissionsResponse> {
  if (!Number.isInteger(round) || round < 1) {
    throw new DevToolsServiceError(400, 'round must be an integer >= 1')
  }

  const connection = await getTournamentConnection(tournamentId)
  const SubmissionModel = getSubmissionModel(connection)

  const [beforeBallot, beforeFeedback] = await Promise.all([
    SubmissionModel.countDocuments({ tournamentId, round, type: 'ballot' }).exec(),
    SubmissionModel.countDocuments({ tournamentId, round, type: 'feedback' }).exec(),
  ])

  const [deletedBallotResult, deletedFeedbackResult] = await Promise.all([
    SubmissionModel.deleteMany({ tournamentId, round, type: 'ballot' }).exec(),
    SubmissionModel.deleteMany({ tournamentId, round, type: 'feedback' }).exec(),
  ])

  const deletedBallot = Number((deletedBallotResult as any)?.deletedCount ?? 0)
  const deletedFeedback = Number((deletedFeedbackResult as any)?.deletedCount ?? 0)
  const afterBallot = Math.max(0, beforeBallot - deletedBallot)
  const afterFeedback = Math.max(0, beforeFeedback - deletedFeedback)

  return {
    tournamentId,
    round,
    before: toSummary(beforeBallot, beforeFeedback),
    deleted: toSummary(deletedBallot, deletedFeedback),
    after: toSummary(afterBallot, afterFeedback),
  }
}

function teamSpeakerIdsForRound(team: any, round: number): string[] {
  const details = Array.isArray(team?.details) ? team.details : []
  const roundDetail = details.find((detail: any) => Number(detail?.r) === round)
  const roundSpeakers = normalizeIdList(roundDetail?.speakers)
  if (roundSpeakers.length > 0) return roundSpeakers

  const templateSpeakers = normalizeIdList(team?.template?.speakers)
  if (templateSpeakers.length > 0) return templateSpeakers

  return []
}

export async function fillRoundSubmissions(
  tournamentId: string,
  round: number,
  actorUserId?: string,
  mode: FillRoundSubmissionsMode = 'all'
): Promise<FillRoundSubmissionsResponse> {
  if (!Number.isInteger(round) || round < 1) {
    throw new DevToolsServiceError(400, 'round must be an integer >= 1')
  }

  const tournamentObjectId = new Types.ObjectId(tournamentId)
  const connection = await getTournamentConnection(tournamentId)
  const RoundModel = getRoundModel(connection)
  const DrawModel = getDrawModel(connection)
  const TeamModel = getTeamModel(connection)
  const SubmissionModel = getSubmissionModel(connection)

  const roundDoc = await RoundModel.findOne({ tournamentId, round }).lean().exec()
  if (!roundDoc) {
    throw new DevToolsServiceError(400, 'Round not found')
  }

  const drawDoc = await DrawModel.findOne({ tournamentId, round }).lean().exec()
  const rows = normalizeDrawRows((drawDoc as any)?.allocation, (roundDoc as any)?.userDefinedData)
  if (rows.length === 0) {
    throw new DevToolsServiceError(400, 'Draw allocation is required for this round')
  }

  const teamIds = Array.from(new Set(rows.flatMap((row) => [row.gov, row.opp])))
  const teams = await TeamModel.find({ tournamentId, _id: { $in: teamIds } })
    .lean()
    .exec()
  const teamById = new Map<string, any>()
  teams.forEach((team: any) => {
    const teamId = String(team?._id ?? '').trim()
    if (!teamId) return
    teamById.set(teamId, team)
  })

  const teamSpeakerIdsByTeam = new Map<string, string[]>()
  teamIds.forEach((teamId) => {
    teamSpeakerIdsByTeam.set(teamId, teamSpeakerIdsForRound(teamById.get(teamId), round))
  })

  const settings = resolveFeedbackSettings(roundDoc)
  const styleSettings = await loadSubmissionStyleSettings(tournamentId)
  const expectedBallotByKey = new Map<string, Record<string, unknown>>()
  const expectedFeedbackByKey = new Map<string, Record<string, unknown>>()

  const shouldFillBallot = mode === 'all' || mode === 'ballot'
  const shouldFillTeamFeedback = mode === 'all' || mode === 'feedback' || mode === 'team_feedback'
  const shouldFillAdjudicatorFeedback =
    mode === 'all' || mode === 'feedback' || mode === 'adjudicator_feedback'

  rows.forEach((row) => {
    if (shouldFillBallot) {
      row.ballotSubmitters.forEach((submittedEntityId) => {
        const key = ballotKey(round, submittedEntityId, row.gov, row.opp)
        if (expectedBallotByKey.has(key)) return
        expectedBallotByKey.set(
          key,
          buildBallotPayload(
            row,
            submittedEntityId,
            teamSpeakerIdsByTeam.get(row.gov) ?? [],
            teamSpeakerIdsByTeam.get(row.opp) ?? [],
            settings.noSpeakerScore,
            styleSettings
          )
        )
      })
    }

    const targetsFromTeams = settings.chairsAlwaysEvaluated
      ? row.chairs
      : normalizeIdList([...row.chairs, ...row.panels])

    if (shouldFillTeamFeedback && settings.fromTeams && targetsFromTeams.length > 0) {
      const evaluators =
        settings.evaluatorInTeam === 'speaker'
          ? normalizeIdList([
              ...(teamSpeakerIdsByTeam.get(row.gov) ?? []),
              ...(teamSpeakerIdsByTeam.get(row.opp) ?? []),
            ])
          : normalizeIdList([row.gov, row.opp])

      evaluators.forEach((submittedEntityId) => {
        targetsFromTeams.forEach((adjudicatorId) => {
          const key = feedbackKey(round, submittedEntityId, adjudicatorId)
          if (expectedFeedbackByKey.has(key)) return
          expectedFeedbackByKey.set(
            key,
            buildFeedbackPayload(adjudicatorId, submittedEntityId, styleSettings.adjudicatorRange)
          )
        })
      })
    }

    if (shouldFillAdjudicatorFeedback && settings.fromAdjudicators) {
      row.adjudicators.forEach((submittedEntityId) => {
        row.adjudicators.forEach((adjudicatorId) => {
          if (adjudicatorId === submittedEntityId) return
          const key = feedbackKey(round, submittedEntityId, adjudicatorId)
          if (expectedFeedbackByKey.has(key)) return
          expectedFeedbackByKey.set(
            key,
            buildFeedbackPayload(adjudicatorId, submittedEntityId, styleSettings.adjudicatorRange)
          )
        })
      })
    }
  })

  const existingRows = await SubmissionModel.find({
    tournamentId,
    round,
    type: { $in: ['ballot', 'feedback'] },
  })
    .select({ type: 1, payload: 1, submittedBy: 1 })
    .lean()
    .exec()

  const existingBallotKeys = new Set<string>()
  const existingFeedbackKeys = new Set<string>()
  existingRows.forEach((row: any) => {
    const type = String(row?.type ?? '')
    const actor = resolveSubmissionActor(row)
    if (!actor) return
    if (type === 'ballot') {
      const teamAId = String(row?.payload?.teamAId ?? '').trim()
      const teamBId = String(row?.payload?.teamBId ?? '').trim()
      if (!teamAId || !teamBId) return
      existingBallotKeys.add(ballotKey(round, actor, teamAId, teamBId))
      return
    }
    if (type === 'feedback') {
      const adjudicatorId = String(row?.payload?.adjudicatorId ?? '').trim()
      if (!adjudicatorId) return
      existingFeedbackKeys.add(feedbackKey(round, actor, adjudicatorId))
    }
  })

  const expectedBallotKeys = Array.from(expectedBallotByKey.keys())
  const expectedFeedbackKeys = Array.from(expectedFeedbackByKey.keys())

  const beforeBallot = expectedBallotKeys.filter((key) => existingBallotKeys.has(key)).length
  const beforeFeedback = expectedFeedbackKeys.filter((key) => existingFeedbackKeys.has(key)).length

  const missingBallotKeys = expectedBallotKeys.filter((key) => !existingBallotKeys.has(key))
  const missingFeedbackKeys = expectedFeedbackKeys.filter((key) => !existingFeedbackKeys.has(key))

  const createdBallotDocs = missingBallotKeys.map((key) => {
    const payload = expectedBallotByKey.get(key) ?? {}
    return {
      tournamentId: tournamentObjectId,
      round,
      type: 'ballot' as const,
      payload,
      submittedBy: actorUserId,
      dedupeKey: ballotDedupeKey(payload),
    }
  })
  const createdFeedbackDocs = missingFeedbackKeys.map((key) => {
    const payload = expectedFeedbackByKey.get(key) ?? {}
    return {
      tournamentId: tournamentObjectId,
      round,
      type: 'feedback' as const,
      payload,
      submittedBy: actorUserId,
      dedupeKey: feedbackDedupeKey(payload),
    }
  })

  const ballotWriteResult =
    createdBallotDocs.length > 0
      ? await SubmissionModel.bulkWrite(
          createdBallotDocs.map((doc) => ({
            updateOne: {
              filter: {
                tournamentId: tournamentObjectId,
                round,
                type: doc.type,
                dedupeKey: doc.dedupeKey,
              },
              update: { $setOnInsert: doc },
              upsert: true,
            },
          })),
          { ordered: false }
        )
      : null
  const feedbackWriteResult =
    createdFeedbackDocs.length > 0
      ? await SubmissionModel.bulkWrite(
          createdFeedbackDocs.map((doc) => ({
            updateOne: {
              filter: {
                tournamentId: tournamentObjectId,
                round,
                type: doc.type,
                dedupeKey: doc.dedupeKey,
              },
              update: { $setOnInsert: doc },
              upsert: true,
            },
          })),
          { ordered: false }
        )
      : null

  const createdBallot = Number(ballotWriteResult?.upsertedCount ?? 0)
  const createdFeedback = Number(feedbackWriteResult?.upsertedCount ?? 0)

  return {
    tournamentId,
    round,
    mode,
    expected: toSummary(expectedBallotByKey.size, expectedFeedbackByKey.size),
    before: toSummary(beforeBallot, beforeFeedback),
    created: toSummary(createdBallot, createdFeedback),
    after: toSummary(expectedBallotByKey.size, expectedFeedbackByKey.size),
  }
}
