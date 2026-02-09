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

const ballotSchema = {
  body: z.object({
    tournamentId: z.string().min(1),
    round: z.number().int().min(1),
    teamAId: z.string().min(1),
    teamBId: z.string().min(1),
    winnerId: z.string().min(1).optional(),
    speakerIdsA: z.array(z.string()).optional(),
    speakerIdsB: z.array(z.string()).optional(),
    scoresA: z.array(z.number()),
    scoresB: z.array(z.number()),
    comment: z.string().optional(),
    role: z.string().optional(),
    submittedEntityId: z.string().optional(),
    matterA: z.array(z.number()).optional(),
    mannerA: z.array(z.number()).optional(),
    matterB: z.array(z.number()).optional(),
    mannerB: z.array(z.number()).optional(),
    bestA: z.array(z.boolean()).optional(),
    bestB: z.array(z.boolean()).optional(),
    poiA: z.array(z.boolean()).optional(),
    poiB: z.array(z.boolean()).optional(),
  }),
}

const feedbackSchema = {
  body: z.object({
    tournamentId: z.string().min(1),
    round: z.number().int().min(1),
    adjudicatorId: z.string().min(1),
    score: z.number().min(0),
    comment: z.string().optional(),
    role: z.string().optional(),
    submittedEntityId: z.string().optional(),
    matter: z.number().optional(),
    manner: z.number().optional(),
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
