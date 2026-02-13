import { Router } from 'express'
import { z } from 'zod'
import {
  createBallotSubmission,
  createFeedbackSubmission,
  listParticipantSubmissions,
  listSubmissions,
} from '../controllers/submissions.js'
import { requireTournamentAccess, requireTournamentAdmin } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const finiteScoreSchema = z.number().finite()

const ballotSchema = {
  body: z
    .object({
      tournamentId: z.string().trim().min(1),
      round: z.number().int().min(1),
      teamAId: z.string().trim().min(1),
      teamBId: z.string().trim().min(1),
      winnerId: z.string().trim().min(1).optional(),
      speakerIdsA: z.array(z.string().trim()).optional(),
      speakerIdsB: z.array(z.string().trim()).optional(),
      scoresA: z.array(finiteScoreSchema),
      scoresB: z.array(finiteScoreSchema),
      comment: z.string().optional(),
      role: z.string().optional(),
      submittedEntityId: z.string().trim().optional(),
      matterA: z.array(finiteScoreSchema).optional(),
      mannerA: z.array(finiteScoreSchema).optional(),
      matterB: z.array(finiteScoreSchema).optional(),
      mannerB: z.array(finiteScoreSchema).optional(),
      bestA: z.array(z.boolean()).optional(),
      bestB: z.array(z.boolean()).optional(),
      poiA: z.array(z.boolean()).optional(),
      poiB: z.array(z.boolean()).optional(),
    })
    .superRefine((payload, ctx) => {
      if (payload.teamAId === payload.teamBId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['teamBId'],
          message: 'teamAId and teamBId must be different',
        })
      }

      const hasScoresA = payload.scoresA.length > 0
      const hasScoresB = payload.scoresB.length > 0
      if (hasScoresA !== hasScoresB) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scoresA'],
          message: 'scoresA and scoresB must both be provided or both empty',
        })
      }

      const expectLength = (value: unknown[] | undefined, expected: number, key: string) => {
        if (!Array.isArray(value)) return
        if (value.length === expected) return
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} length must match scores`,
        })
      }
      expectLength(payload.speakerIdsA, payload.scoresA.length, 'speakerIdsA')
      expectLength(payload.speakerIdsB, payload.scoresB.length, 'speakerIdsB')
      expectLength(payload.matterA, payload.scoresA.length, 'matterA')
      expectLength(payload.mannerA, payload.scoresA.length, 'mannerA')
      expectLength(payload.matterB, payload.scoresB.length, 'matterB')
      expectLength(payload.mannerB, payload.scoresB.length, 'mannerB')
      expectLength(payload.bestA, payload.scoresA.length, 'bestA')
      expectLength(payload.bestB, payload.scoresB.length, 'bestB')
      expectLength(payload.poiA, payload.scoresA.length, 'poiA')
      expectLength(payload.poiB, payload.scoresB.length, 'poiB')
    }),
}

const feedbackSchema = {
  body: z.object({
    tournamentId: z.string().trim().min(1),
    round: z.number().int().min(1),
    adjudicatorId: z.string().trim().min(1),
    score: z.number().finite().min(0),
    comment: z.string().optional(),
    role: z.string().optional(),
    submittedEntityId: z.string().trim().optional(),
    matter: z.number().finite().optional(),
    manner: z.number().finite().optional(),
  }),
}

const listSchema = {
  query: z.object({
    tournamentId: z.string().min(1),
    type: z.enum(['ballot', 'feedback']).optional(),
    round: z.coerce.number().int().min(1).optional(),
  }),
}

const participantListSchema = {
  query: z.object({
    tournamentId: z.string().min(1),
    submittedEntityId: z.string().min(1),
    type: z.enum(['ballot', 'feedback']).optional(),
    round: z.coerce.number().int().min(1).optional(),
  }),
}

router.get('/', requireTournamentAdmin(), validateRequest(listSchema), listSubmissions)
router.get(
  '/mine',
  requireTournamentAccess(),
  validateRequest(participantListSchema),
  listParticipantSubmissions
)
router.post(
  '/ballots',
  requireTournamentAccess(),
  validateRequest(ballotSchema),
  createBallotSubmission
)
router.post(
  '/feedback',
  requireTournamentAccess(),
  validateRequest(feedbackSchema),
  createFeedbackSubmission
)

export { router as submissionRouter }
