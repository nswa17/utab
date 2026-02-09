import { Router } from 'express'
import { z } from 'zod'
import {
  listRawTeamResults,
  createRawTeamResult,
  updateRawTeamResult,
  deleteRawTeamResult,
  deleteRawTeamResults,
  listRawSpeakerResults,
  createRawSpeakerResult,
  updateRawSpeakerResult,
  deleteRawSpeakerResult,
  deleteRawSpeakerResults,
  listRawAdjudicatorResults,
  createRawAdjudicatorResult,
  updateRawAdjudicatorResult,
  deleteRawAdjudicatorResult,
  deleteRawAdjudicatorResults,
} from '../controllers/raw-results.js'
import { requireTournamentAccess, requireTournamentAdmin } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const listSchema = {
  query: z.object({
    tournamentId: z.string().min(1),
    round: z.string().optional(),
    id: z.string().optional(),
    fromId: z.string().optional(),
  }),
}

const createTeamSchema = {
  body: z
    .object({
      tournamentId: z.string().min(1),
      id: z.string().min(1),
      from_id: z.string().min(1),
      r: z.number().int().min(1),
      weight: z.number().optional(),
      win: z.number(),
      opponents: z.array(z.string().min(1)),
      side: z.string(),
      user_defined_data: z.any().optional(),
    })
    .or(
      z.array(
        z.object({
          tournamentId: z.string().min(1),
          id: z.string().min(1),
          from_id: z.string().min(1),
          r: z.number().int().min(1),
          weight: z.number().optional(),
          win: z.number(),
          opponents: z.array(z.string().min(1)),
          side: z.string(),
          user_defined_data: z.any().optional(),
        })
      )
    ),
}

const createSpeakerSchema = {
  body: z
    .object({
      tournamentId: z.string().min(1),
      id: z.string().min(1),
      from_id: z.string().min(1),
      r: z.number().int().min(1),
      weight: z.number().optional(),
      scores: z.array(z.number()),
      user_defined_data: z.any().optional(),
    })
    .or(
      z.array(
        z.object({
          tournamentId: z.string().min(1),
          id: z.string().min(1),
          from_id: z.string().min(1),
          r: z.number().int().min(1),
          weight: z.number().optional(),
          scores: z.array(z.number()),
          user_defined_data: z.any().optional(),
        })
      )
    ),
}

const createAdjudicatorSchema = {
  body: z
    .object({
      tournamentId: z.string().min(1),
      id: z.string().min(1),
      from_id: z.string().min(1),
      r: z.number().int().min(1),
      weight: z.number().optional(),
      score: z.number(),
      judged_teams: z.array(z.string().min(1)),
      comment: z.string().optional(),
      user_defined_data: z.any().optional(),
    })
    .or(
      z.array(
        z.object({
          tournamentId: z.string().min(1),
          id: z.string().min(1),
          from_id: z.string().min(1),
          r: z.number().int().min(1),
          weight: z.number().optional(),
          score: z.number(),
          judged_teams: z.array(z.string().min(1)),
          comment: z.string().optional(),
          user_defined_data: z.any().optional(),
        })
      )
    ),
}

const updateSchema = {
  params: z.object({ id: z.string() }),
  body: z
    .record(z.any())
    .refine((data) => Object.keys(data).length > 0, {
      message: 'update payload is required',
    })
    .refine((data) => typeof data.tournamentId === 'string' && data.tournamentId.length > 0, {
      message: 'tournamentId is required',
    }),
}

const deleteSchema = {
  params: z.object({ id: z.string() }),
  query: z.object({ tournamentId: z.string().min(1) }),
}

const deleteManySchema = {
  query: z.object({
    tournamentId: z.string().min(1),
    round: z.string().optional(),
    id: z.string().optional(),
    fromId: z.string().optional(),
  }),
}

router.get(
  '/teams',
  requireTournamentAccess(),
  validateRequest(listSchema),
  listRawTeamResults
)
router.post('/teams', requireTournamentAdmin(), validateRequest(createTeamSchema), createRawTeamResult)
router.patch('/teams/:id', requireTournamentAdmin(), validateRequest(updateSchema), updateRawTeamResult)
router.delete('/teams', requireTournamentAdmin(), validateRequest(deleteManySchema), deleteRawTeamResults)
router.delete('/teams/:id', requireTournamentAdmin(), validateRequest(deleteSchema), deleteRawTeamResult)

router.get(
  '/speakers',
  requireTournamentAccess(),
  validateRequest(listSchema),
  listRawSpeakerResults
)
router.post(
  '/speakers',
  requireTournamentAdmin(),
  validateRequest(createSpeakerSchema),
  createRawSpeakerResult
)
router.patch(
  '/speakers/:id',
  requireTournamentAdmin(),
  validateRequest(updateSchema),
  updateRawSpeakerResult
)
router.delete(
  '/speakers',
  requireTournamentAdmin(),
  validateRequest(deleteManySchema),
  deleteRawSpeakerResults
)
router.delete(
  '/speakers/:id',
  requireTournamentAdmin(),
  validateRequest(deleteSchema),
  deleteRawSpeakerResult
)

router.get(
  '/adjudicators',
  requireTournamentAccess(),
  validateRequest(listSchema),
  listRawAdjudicatorResults
)
router.post(
  '/adjudicators',
  requireTournamentAdmin(),
  validateRequest(createAdjudicatorSchema),
  createRawAdjudicatorResult
)
router.patch(
  '/adjudicators/:id',
  requireTournamentAdmin(),
  validateRequest(updateSchema),
  updateRawAdjudicatorResult
)
router.delete(
  '/adjudicators',
  requireTournamentAdmin(),
  validateRequest(deleteManySchema),
  deleteRawAdjudicatorResults
)
router.delete(
  '/adjudicators/:id',
  requireTournamentAdmin(),
  validateRequest(deleteSchema),
  deleteRawAdjudicatorResult
)

export { router as rawResultRouter }
