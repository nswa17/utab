import type { Connection } from 'mongoose'
import type { RequestHandler } from 'express'
import { getSubmissionModel } from '../models/submission.js'
import { getRoundModel } from '../models/round.js'
import { getDrawModel } from '../models/draw.js'
import { getTeamModel } from '../models/team.js'
import { getSpeakerModel } from '../models/speaker.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { badRequest, isValidObjectId, notFound } from './shared/http-errors.js'

function resolveSubmissionActor(submittedEntityId?: string, sessionUserId?: string) {
  const submittedEntityToken = String(submittedEntityId ?? '').trim()
  if (submittedEntityToken) return submittedEntityToken
  return String(sessionUserId ?? '').trim()
}

const DUPLICATE_BALLOT_MESSAGE =
  'すでにチーム評価が送信されています。運営に報告してください。'
const DUPLICATE_FEEDBACK_MESSAGE =
  'すでにジャッジ評価が送信されています。運営に報告してください。'

function sumScores(scores: number[]): number {
  return scores.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0)
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
  speakerIdsA?: string[]
  speakerIdsB?: string[]
  scoresA: number[]
  scoresB: number[]
  comment?: string
  role?: string
  submittedEntityId?: string
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
  role?: string
  submittedEntityId?: string
  matter?: number
  manner?: number
}

function toPayloadRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
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

type DrawAllocationContext = {
  teams: {
    gov: string
    opp: string
  }
  chairs: string[]
  panels: string[]
  trainees: string[]
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
    )
  )
}

function normalizeDrawTeams(teams: unknown): { gov: string; opp: string } | null {
  let gov = ''
  let opp = ''
  if (Array.isArray(teams)) {
    gov = String(teams[0] ?? '').trim()
    opp = String(teams[1] ?? '').trim()
  } else if (teams && typeof teams === 'object') {
    const source = teams as Record<string, unknown>
    gov = String(source.gov ?? '').trim()
    opp = String(source.opp ?? '').trim()
  }
  if (!gov || !opp || gov === opp) return null
  return { gov, opp }
}

function normalizeDrawAllocationRows(allocation: unknown): DrawAllocationContext[] {
  if (!Array.isArray(allocation)) return []
  return allocation
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const source = item as Record<string, unknown>
      const teams = normalizeDrawTeams(source.teams)
      if (!teams) return null
      return {
        teams,
        chairs: normalizeStringList(source.chairs),
        panels: normalizeStringList(source.panels),
        trainees: normalizeStringList(source.trainees),
      }
    })
    .filter((item): item is DrawAllocationContext => Boolean(item))
}

async function loadRoundAllocationRows(
  connection: Connection,
  tournamentId: string,
  round: number
): Promise<DrawAllocationContext[]> {
  const drawDoc = await getDrawModel(connection)
    .findOne({ tournamentId, round })
    .lean()
    .exec()
  return normalizeDrawAllocationRows((drawDoc as any)?.allocation)
}

function hasSameMatchup(
  row: DrawAllocationContext,
  teamAId: string,
  teamBId: string
): boolean {
  const drawPair = [row.teams.gov, row.teams.opp].sort()
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
  const uniqueTeamIds = Array.from(new Set(teamIds.map((teamId) => String(teamId ?? '').trim()).filter(Boolean)))
  const speakerIdsByTeam = new Map<string, Set<string>>()
  uniqueTeamIds.forEach((teamId) => speakerIdsByTeam.set(teamId, new Set<string>()))
  if (uniqueTeamIds.length === 0) return speakerIdsByTeam

  const TeamModel = getTeamModel(connection)
  const teams = await TeamModel.find({
    tournamentId,
    _id: { $in: uniqueTeamIds },
  })
    .lean()
    .exec()

  const fallbackNamesByTeam = new Map<string, string[]>()
  const fallbackSpeakerNames = new Set<string>()

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
    if (collected.size === 0) {
      details.forEach((detail: any) => {
        if (!Array.isArray(detail?.speakers)) return
        detail.speakers.forEach((speakerId: any) => {
          const normalized = String(speakerId ?? '').trim()
          if (normalized) collected.add(normalized)
        })
      })
    }
    if (collected.size === 0 && Array.isArray(team?.speakers)) {
      const names: string[] = team.speakers
        .map((speaker: any) => String(speaker?.name ?? '').trim())
        .filter((name: string) => name.length > 0)
      if (names.length > 0) {
        fallbackNamesByTeam.set(teamId, names)
        names.forEach((name: string) => fallbackSpeakerNames.add(name))
      }
    }
    speakerIdsByTeam.set(teamId, collected)
  })

  if (fallbackSpeakerNames.size === 0) return speakerIdsByTeam

  const SpeakerModel = getSpeakerModel(connection)
  const speakers = await SpeakerModel.find({
    tournamentId,
    name: { $in: Array.from(fallbackSpeakerNames) },
  })
    .lean()
    .exec()
  const speakerIdsByName = new Map<string, string[]>()
  speakers.forEach((speaker: any) => {
    const name = String(speaker?.name ?? '').trim()
    const id = String(speaker?._id ?? '').trim()
    if (!name || !id) return
    const current = speakerIdsByName.get(name) ?? []
    current.push(id)
    speakerIdsByName.set(name, current)
  })

  fallbackNamesByTeam.forEach((names, teamId) => {
    const collected = speakerIdsByTeam.get(teamId) ?? new Set<string>()
    names.forEach((name) => {
      const ids = speakerIdsByName.get(name) ?? []
      ids.forEach((id) => collected.add(id))
    })
    speakerIdsByTeam.set(teamId, collected)
  })

  return speakerIdsByTeam
}

async function validateBallotAgainstDraw(
  connection: Connection,
  tournamentId: string,
  round: number,
  payload: Pick<NormalizedBallotPayload, 'teamAId' | 'teamBId' | 'submittedEntityId'>
): Promise<ValidationOutcome<null>> {
  const allocationRows = await loadRoundAllocationRows(connection, tournamentId, round)
  if (allocationRows.length === 0) return { ok: true, value: null }

  const row = allocationRows.find((item) => hasSameMatchup(item, payload.teamAId, payload.teamBId))
  if (!row) {
    return { ok: false, message: 'teamAId/teamBId is not present in draw allocation' }
  }

  const submittedEntityId = String(payload.submittedEntityId ?? '').trim()
  if (!submittedEntityId) return { ok: true, value: null }

  const allowedAdjudicators = new Set<string>([...row.chairs, ...row.panels, ...row.trainees])
  if (allowedAdjudicators.size > 0 && !allowedAdjudicators.has(submittedEntityId)) {
    return { ok: false, message: 'submittedEntityId is not assigned to this matchup' }
  }

  return { ok: true, value: null }
}

async function validateFeedbackAgainstDraw(
  connection: Connection,
  tournamentId: string,
  round: number,
  payload: Pick<NormalizedFeedbackPayload, 'adjudicatorId' | 'submittedEntityId'>
): Promise<ValidationOutcome<null>> {
  const allocationRows = await loadRoundAllocationRows(connection, tournamentId, round)
  if (allocationRows.length === 0) return { ok: true, value: null }

  const matchingRows = allocationRows.filter((row) => rowContainsAdjudicator(row, payload.adjudicatorId))
  if (matchingRows.length === 0) {
    return { ok: false, message: 'adjudicatorId is not assigned in draw allocation' }
  }

  const roundDoc = await getRoundModel(connection).findOne({ tournamentId, round }).lean().exec()
  const userDefined = ((roundDoc as any)?.userDefinedData ?? {}) as Record<string, unknown>
  const evaluateFromTeams = userDefined.evaluate_from_teams !== false
  const evaluateFromAdjudicators = userDefined.evaluate_from_adjudicators !== false
  const evaluatorInTeam = userDefined.evaluator_in_team === 'speaker' ? 'speaker' : 'team'
  const chairsAlwaysEvaluated = userDefined.chairs_always_evaluated === true
  if (!evaluateFromTeams && !evaluateFromAdjudicators) {
    return { ok: false, message: 'feedback is disabled in this round' }
  }

  const submittedEntityId = String(payload.submittedEntityId ?? '').trim()
  if (!submittedEntityId) return { ok: true, value: null }

  let speakerIdsByTeam = new Map<string, Set<string>>()
  if (evaluateFromTeams && evaluatorInTeam === 'speaker') {
    const feedbackTeamIds = matchingRows.flatMap((row) => [row.teams.gov, row.teams.opp])
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
      allowedSubmittedEntities.add(row.teams.gov)
      allowedSubmittedEntities.add(row.teams.opp)
      return
    }

    ;(speakerIdsByTeam.get(row.teams.gov) ?? new Set<string>()).forEach((speakerId) =>
      allowedSubmittedEntities.add(speakerId)
    )
    ;(speakerIdsByTeam.get(row.teams.opp) ?? new Set<string>()).forEach((speakerId) =>
      allowedSubmittedEntities.add(speakerId)
    )
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
  rawPayload: unknown
): Promise<ValidationOutcome<NormalizedBallotPayload>> {
  const payload = toPayloadRecord(rawPayload)
  if (!payload) return { ok: false, message: 'payload must be an object' }

  const roundDoc = await getRoundModel(connection).findOne({ tournamentId, round }).lean().exec()
  const allowLowTieWin = (roundDoc as any)?.userDefinedData?.allow_low_tie_win !== false
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
  const roleResult = parseOptionalString(payload.role, 'role')
  if (!roleResult.ok) return roleResult
  const submittedEntityResult = parseOptionalTrimmedString(payload.submittedEntityId, 'submittedEntityId')
  if (!submittedEntityResult.ok) return submittedEntityResult

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

  const hasComparableScores = parsedScoresA.length > 0 && parsedScoresB.length > 0
  const totalA = sumScores(parsedScoresA)
  const totalB = sumScores(parsedScoresB)
  const hasDecisiveScore = hasComparableScores && totalA !== totalB
  if (allowLowTieWin && !validWinner && hasDecisiveScore) {
    return { ok: false, message: 'winnerId is required when scores are not tied' }
  }

  if (!allowLowTieWin) {
    let invalid = !validWinner
    if (!invalid && hasComparableScores) {
      if (winnerIsTeamA) invalid = totalA <= totalB
      if (winnerIsTeamB) invalid = totalB <= totalA
    }
    if (invalid) {
      return { ok: false, message: 'low tie win is not allowed in this round' }
    }
  }

  const drawValidation = await validateBallotAgainstDraw(connection, tournamentId, round, {
    teamAId: normalizedTeamAId,
    teamBId: normalizedTeamBId,
    submittedEntityId: submittedEntityResult.value,
  })
  if (!drawValidation.ok) return drawValidation

  return {
    ok: true,
    value: {
      teamAId: normalizedTeamAId,
      teamBId: normalizedTeamBId,
      winnerId: normalizedWinner || undefined,
      speakerIdsA: speakerIdsAResult.value,
      speakerIdsB: speakerIdsBResult.value,
      scoresA: parsedScoresA,
      scoresB: parsedScoresB,
      comment: commentResult.value,
      role: roleResult.value,
      submittedEntityId: submittedEntityResult.value,
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
  rawPayload: unknown
): Promise<ValidationOutcome<NormalizedFeedbackPayload>> {
  const payload = toPayloadRecord(rawPayload)
  if (!payload) return { ok: false, message: 'payload must be an object' }

  const normalizedAdjudicatorId = String(payload.adjudicatorId ?? '').trim()
  if (!normalizedAdjudicatorId) {
    return { ok: false, message: 'adjudicatorId is required' }
  }

  const score = payload.score
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
    return { ok: false, message: 'score must be a finite non-negative number' }
  }

  const commentResult = parseOptionalString(payload.comment, 'comment')
  if (!commentResult.ok) return commentResult
  const roleResult = parseOptionalString(payload.role, 'role')
  if (!roleResult.ok) return roleResult
  const submittedEntityResult = parseOptionalTrimmedString(payload.submittedEntityId, 'submittedEntityId')
  if (!submittedEntityResult.ok) return submittedEntityResult

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

  const drawValidation = await validateFeedbackAgainstDraw(connection, tournamentId, round, {
    adjudicatorId: normalizedAdjudicatorId,
    submittedEntityId: submittedEntityResult.value,
  })
  if (!drawValidation.ok) return drawValidation

  return {
    ok: true,
    value: {
      adjudicatorId: normalizedAdjudicatorId,
      score,
      comment: commentResult.value,
      role: roleResult.value,
      submittedEntityId: submittedEntityResult.value,
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
      speakerIdsA,
      speakerIdsB,
      scoresA,
      scoresB,
      comment,
      role,
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
      scoresA: number[]
      scoresB: number[]
      comment?: string
      role?: string
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

    const connection = await getTournamentConnection(tournamentId)
    const SubmissionModel = getSubmissionModel(connection)
    const normalized = await normalizeBallotPayload(connection, tournamentId, round, {
      teamAId,
      teamBId,
      winnerId,
      speakerIdsA,
      speakerIdsB,
      scoresA,
      scoresB,
      comment,
      role,
      submittedEntityId,
      bestA,
      bestB,
      poiA,
      poiB,
      matterA,
      mannerA,
      matterB,
      mannerB,
    })
    if (!normalized.ok) {
      badRequest(res, normalized.message)
      return
    }
    const payload = normalized.value
    const normalizedTeamAId = payload.teamAId
    const normalizedTeamBId = payload.teamBId
    const normalizedSubmittedEntityId = payload.submittedEntityId ?? ''

    const actor = resolveSubmissionActor(normalizedSubmittedEntityId, req.session?.userId)
    if (actor) {
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
    }
    const created = await SubmissionModel.create({
      tournamentId,
      round,
      type: 'ballot',
      payload,
      submittedBy: req.session?.userId,
    })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err) {
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
      role,
      submittedEntityId,
      matter,
      manner,
    } = req.body as {
      tournamentId: string
      round: number
      adjudicatorId: string
      score: number
      comment?: string
      role?: string
      submittedEntityId?: string
      matter?: number
      manner?: number
    }

    if (!ensureTournamentId(res, tournamentId)) return

    const connection = await getTournamentConnection(tournamentId)
    const normalized = await normalizeFeedbackPayload(connection, tournamentId, round, {
      adjudicatorId,
      score,
      comment,
      role,
      submittedEntityId,
      matter,
      manner,
    })
    if (!normalized.ok) {
      badRequest(res, normalized.message)
      return
    }
    const payload = normalized.value

    const SubmissionModel = getSubmissionModel(connection)
    const actor = resolveSubmissionActor(payload.submittedEntityId, req.session?.userId)
    if (actor) {
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
    }
    const created = await SubmissionModel.create({
      tournamentId,
      round,
      type: 'feedback',
      payload,
      submittedBy: req.session?.userId,
    })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const updateSubmission: RequestHandler = async (req, res, next) => {
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
    const existing = await SubmissionModel.findOne({ _id: id, tournamentId }).lean().exec()
    if (!existing) {
      notFound(res, 'Submission not found')
      return
    }

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
        nextPayload
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
        nextPayload
      )
      if (!normalizedFeedback.ok) {
        badRequest(res, normalizedFeedback.message)
        return
      }
      nextPayload = normalizedFeedback.value
    }

    const updated = await SubmissionModel.findOneAndUpdate(
      { _id: id, tournamentId },
      {
        $set: {
          round: nextRound,
          payload: nextPayload,
        },
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
