import { Types } from 'mongoose'
import type { RequestHandler } from 'express'
import { getSubmissionModel } from '../models/submission.js'
import { getRoundModel } from '../models/round.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'

function resolveSubmissionActor(submittedEntityId?: string, sessionUserId?: string) {
  const submittedEntityToken = String(submittedEntityId ?? '').trim()
  if (submittedEntityToken) return submittedEntityToken
  return String(sessionUserId ?? '').trim()
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === 'number' ? item : Number(item)))
}

function sumScores(scores: number[]): number {
  return scores.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0)
}

function arrayLengthMatches(value: unknown, expectedLength: number): boolean {
  if (!Array.isArray(value)) return true
  return value.length === expectedLength
}

export const listSubmissions: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, type, round } = req.query as {
      tournamentId?: string
      type?: 'ballot' | 'feedback'
      round?: string | number
    }

    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

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

    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const actor = String(submittedEntityId ?? '').trim()
    if (!actor) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'submittedEntityId is required' }] })
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

    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const SubmissionModel = getSubmissionModel(connection)
    const roundDoc = await RoundModel.findOne({ tournamentId, round }).lean().exec()
    const allowLowTieWin = (roundDoc as any)?.userDefinedData?.allow_low_tie_win !== false
    const normalizedTeamAId = String(teamAId ?? '').trim()
    const normalizedTeamBId = String(teamBId ?? '').trim()
    const normalizedSubmittedEntityId = String(submittedEntityId ?? '').trim()
    if (!normalizedTeamAId || !normalizedTeamBId || normalizedTeamAId === normalizedTeamBId) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'teamAId and teamBId must be different' }],
      })
      return
    }
    const normalizedWinner = String(winnerId ?? '').trim()
    const winnerIsTeamA = normalizedWinner === normalizedTeamAId
    const winnerIsTeamB = normalizedWinner === normalizedTeamBId
    const validWinner = winnerIsTeamA || winnerIsTeamB
    if (normalizedWinner && !validWinner) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'winnerId must match teamAId or teamBId' }],
      })
      return
    }

    const parsedScoresA = toNumberArray(scoresA)
    const parsedScoresB = toNumberArray(scoresB)
    const hasNonFiniteScore =
      parsedScoresA.some((score) => !Number.isFinite(score)) ||
      parsedScoresB.some((score) => !Number.isFinite(score))
    if (hasNonFiniteScore) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'scores must be finite numbers' }],
      })
      return
    }

    const hasScoresA = parsedScoresA.length > 0
    const hasScoresB = parsedScoresB.length > 0
    if (hasScoresA !== hasScoresB) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'scoresA and scoresB must both be provided or both empty' }],
      })
      return
    }

    const scoreLengthMismatch =
      !arrayLengthMatches(speakerIdsA, parsedScoresA.length) ||
      !arrayLengthMatches(speakerIdsB, parsedScoresB.length) ||
      !arrayLengthMatches(matterA, parsedScoresA.length) ||
      !arrayLengthMatches(mannerA, parsedScoresA.length) ||
      !arrayLengthMatches(matterB, parsedScoresB.length) ||
      !arrayLengthMatches(mannerB, parsedScoresB.length) ||
      !arrayLengthMatches(bestA, parsedScoresA.length) ||
      !arrayLengthMatches(bestB, parsedScoresB.length) ||
      !arrayLengthMatches(poiA, parsedScoresA.length) ||
      !arrayLengthMatches(poiB, parsedScoresB.length)
    if (scoreLengthMismatch) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'speaker/flag arrays must match score lengths' }],
      })
      return
    }

    const hasComparableScores =
      parsedScoresA.some((score) => Number.isFinite(score)) &&
      parsedScoresB.some((score) => Number.isFinite(score))
    const totalA = sumScores(parsedScoresA)
    const totalB = sumScores(parsedScoresB)
    const hasDecisiveScore = hasComparableScores && totalA !== totalB
    if (allowLowTieWin && !validWinner && hasDecisiveScore) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'winnerId is required when scores are not tied' }],
      })
      return
    }

    if (!allowLowTieWin) {
      let invalid = !validWinner
      if (!invalid && hasComparableScores) {
        if (winnerIsTeamA) invalid = totalA <= totalB
        if (winnerIsTeamB) invalid = totalB <= totalA
      }
      if (invalid) {
        res.status(400).json({
          data: null,
          errors: [{ name: 'BadRequest', message: 'low tie win is not allowed in this round' }],
        })
        return
      }
    }

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
    const payload = {
      teamAId: normalizedTeamAId,
      teamBId: normalizedTeamBId,
      winnerId: normalizedWinner || undefined,
      speakerIdsA,
      speakerIdsB,
      scoresA,
      scoresB,
      comment,
      role,
      submittedEntityId: normalizedSubmittedEntityId || undefined,
      bestA,
      bestB,
      poiA,
      poiB,
      matterA,
      mannerA,
      matterB,
      mannerB,
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

    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const normalizedAdjudicatorId = String(adjudicatorId ?? '').trim()
    if (!normalizedAdjudicatorId) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'adjudicatorId is required' }],
      })
      return
    }
    if (!Number.isFinite(score) || score < 0) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'score must be a finite non-negative number' }],
      })
      return
    }

    const normalizedSubmittedEntityId = String(submittedEntityId ?? '').trim()
    const connection = await getTournamentConnection(tournamentId)
    const SubmissionModel = getSubmissionModel(connection)
    const actor = resolveSubmissionActor(normalizedSubmittedEntityId, req.session?.userId)
    if (actor) {
      await SubmissionModel.deleteMany({
        tournamentId,
        round,
        type: 'feedback',
        'payload.adjudicatorId': normalizedAdjudicatorId,
        $or: [{ 'payload.submittedEntityId': actor }, { submittedBy: actor }],
      }).exec()
    }
    const payload = {
      adjudicatorId: normalizedAdjudicatorId,
      score,
      comment,
      role,
      submittedEntityId: normalizedSubmittedEntityId || undefined,
      matter,
      manner,
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
