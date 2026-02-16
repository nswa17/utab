import type { Connection } from 'mongoose'
import type { RequestHandler } from 'express'
import { getSubmissionModel } from '../models/submission.js'
import { getRoundModel } from '../models/round.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { badRequest, isValidObjectId, notFound } from './shared/http-errors.js'

function resolveSubmissionActor(submittedEntityId?: string, sessionUserId?: string) {
  const submittedEntityToken = String(submittedEntityId ?? '').trim()
  if (submittedEntityToken) return submittedEntityToken
  return String(sessionUserId ?? '').trim()
}

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

function normalizeFeedbackPayload(rawPayload: unknown): ValidationOutcome<NormalizedFeedbackPayload> {
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
      await SubmissionModel.deleteMany({
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
      }).exec()
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

    const normalized = normalizeFeedbackPayload({
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

    const connection = await getTournamentConnection(tournamentId)
    const SubmissionModel = getSubmissionModel(connection)
    const actor = resolveSubmissionActor(payload.submittedEntityId, req.session?.userId)
    if (actor) {
      await SubmissionModel.deleteMany({
        tournamentId,
        round,
        type: 'feedback',
        'payload.adjudicatorId': payload.adjudicatorId,
        $or: [{ 'payload.submittedEntityId': actor }, { submittedBy: actor }],
      }).exec()
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
      const normalizedFeedback = normalizeFeedbackPayload(nextPayload)
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
