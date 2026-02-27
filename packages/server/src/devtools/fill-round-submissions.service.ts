import { getDrawModel } from '../models/draw.js'
import { getRoundModel } from '../models/round.js'
import { getSubmissionModel } from '../models/submission.js'
import { getTeamModel } from '../models/team.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import {
  DevToolsServiceError,
  type ClearRoundSubmissionsResponse,
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

function normalizeDrawRows(allocation: unknown): NormalizedDrawRow[] {
  if (!Array.isArray(allocation)) return []
  return allocation
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const source = item as Record<string, unknown>
      const teams = normalizeDrawTeams(source.teams)
      if (!teams) return null
      const chairs = normalizeIdList(source.chairs)
      const panels = normalizeIdList(source.panels)
      const trainees = normalizeIdList(source.trainees)
      const ballotSubmitters = normalizeIdList([...chairs, ...panels])
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

function resolveFeedbackSettings(roundDoc: unknown): FeedbackSettings {
  const userDefinedData = asRecord((roundDoc as any)?.userDefinedData)
  return {
    fromTeams: userDefinedData.evaluate_from_teams === true,
    fromAdjudicators: userDefinedData.evaluate_from_adjudicators === true,
    evaluatorInTeam: userDefinedData.evaluator_in_team === 'speaker' ? 'speaker' : 'team',
    chairsAlwaysEvaluated: userDefinedData.chairs_always_evaluated === true,
    noSpeakerScore: userDefinedData.no_speaker_score === true,
  }
}

function randomInt(minInclusive: number, maxInclusive: number): number {
  const min = Math.ceil(minInclusive)
  const max = Math.floor(maxInclusive)
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function ballotKey(round: number, actor: string, teamAId: string, teamBId: string): string {
  const pair = [teamAId, teamBId].sort()
  return `${round}:ballot:${actor}:${pair[0]}:${pair[1]}`
}

function feedbackKey(round: number, actor: string, adjudicatorId: string): string {
  return `${round}:feedback:${actor}:${adjudicatorId}`
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
  noSpeakerScore: boolean
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

  const useSpeakerIds = govSpeakerIds.length > 0 && oppSpeakerIds.length > 0
  const scoreLength = useSpeakerIds ? Math.max(1, Math.min(govSpeakerIds.length, oppSpeakerIds.length)) : 1

  const scoresA = Array.from({ length: scoreLength }).map(() => randomInt(72, 79))
  const scoresB = Array.from({ length: scoreLength }).map(() => randomInt(72, 79))

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

  if (useSpeakerIds) {
    payload.speakerIdsA = govSpeakerIds.slice(0, scoreLength)
    payload.speakerIdsB = oppSpeakerIds.slice(0, scoreLength)
  }

  return payload
}

function buildFeedbackPayload(adjudicatorId: string, submittedEntityId: string): Record<string, unknown> {
  return {
    adjudicatorId,
    score: randomInt(5, 9),
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

  // Break round and custom operations may not carry round-specific speaker links.
  // Fall back to any known speaker ids on the team details to keep ballot payload usable.
  const fallbackSpeakers = normalizeIdList(
    details.flatMap((detail: any) => (Array.isArray(detail?.speakers) ? detail.speakers : []))
  )
  return fallbackSpeakers
}

export async function fillRoundSubmissions(
  tournamentId: string,
  round: number,
  actorUserId?: string
): Promise<FillRoundSubmissionsResponse> {
  if (!Number.isInteger(round) || round < 1) {
    throw new DevToolsServiceError(400, 'round must be an integer >= 1')
  }

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
  const rows = normalizeDrawRows((drawDoc as any)?.allocation)
  if (rows.length === 0) {
    throw new DevToolsServiceError(400, 'Draw allocation is required for this round')
  }

  const teamIds = Array.from(new Set(rows.flatMap((row) => [row.gov, row.opp])))
  const teams = await TeamModel.find({ tournamentId, _id: { $in: teamIds } }).lean().exec()
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
  const expectedBallotByKey = new Map<string, Record<string, unknown>>()
  const expectedFeedbackByKey = new Map<string, Record<string, unknown>>()

  rows.forEach((row) => {
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
          settings.noSpeakerScore
        )
      )
    })

    const targetsFromTeams = settings.chairsAlwaysEvaluated
      ? row.chairs
      : normalizeIdList([...row.chairs, ...row.panels])

    if (settings.fromTeams && targetsFromTeams.length > 0) {
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
          expectedFeedbackByKey.set(key, buildFeedbackPayload(adjudicatorId, submittedEntityId))
        })
      })
    }

    if (settings.fromAdjudicators) {
      row.adjudicators.forEach((submittedEntityId) => {
        row.adjudicators.forEach((adjudicatorId) => {
          if (adjudicatorId === submittedEntityId) return
          const key = feedbackKey(round, submittedEntityId, adjudicatorId)
          if (expectedFeedbackByKey.has(key)) return
          expectedFeedbackByKey.set(key, buildFeedbackPayload(adjudicatorId, submittedEntityId))
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

  const createdBallotDocs = missingBallotKeys.map((key) => ({
    tournamentId,
    round,
    type: 'ballot',
    payload: expectedBallotByKey.get(key),
    submittedBy: actorUserId,
  }))
  const createdFeedbackDocs = missingFeedbackKeys.map((key) => ({
    tournamentId,
    round,
    type: 'feedback',
    payload: expectedFeedbackByKey.get(key),
    submittedBy: actorUserId,
  }))

  if (createdBallotDocs.length > 0) {
    await SubmissionModel.insertMany(createdBallotDocs, { ordered: false })
  }
  if (createdFeedbackDocs.length > 0) {
    await SubmissionModel.insertMany(createdFeedbackDocs, { ordered: false })
  }

  const createdBallot = createdBallotDocs.length
  const createdFeedback = createdFeedbackDocs.length

  return {
    tournamentId,
    round,
    expected: toSummary(expectedBallotByKey.size, expectedFeedbackByKey.size),
    before: toSummary(beforeBallot, beforeFeedback),
    created: toSummary(createdBallot, createdFeedback),
    after: toSummary(beforeBallot + createdBallot, beforeFeedback + createdFeedback),
  }
}
