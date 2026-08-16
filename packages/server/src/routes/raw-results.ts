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
import { requireTournamentAdmin } from '../middleware/auth.js'
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

const rawTeamBodySchema = z.object({
  tournamentId: z.string().min(1),
  id: z.string().trim().min(1),
  from_id: z.string().trim().min(1),
  r: z.number().int().min(1),
  weight: z.number().optional(),
  win: z.number(),
  opponents: z.array(z.string().trim().min(1)),
  side: z.string().trim().min(1),
  user_defined_data: z.any().optional(),
})

const rawSpeakerBodySchema = z.object({
  tournamentId: z.string().min(1),
  id: z.string().trim().min(1),
  from_id: z.string().trim().min(1),
  r: z.number().int().min(1),
  weight: z.number().optional(),
  scores: z.array(z.number()),
  user_defined_data: z.any().optional(),
})

const rawAdjudicatorBodySchema = z.object({
  tournamentId: z.string().min(1),
  id: z.string().trim().min(1),
  from_id: z.string().trim().min(1),
  r: z.number().int().min(1),
  weight: z.number().optional(),
  score: z.number(),
  judged_teams: z.array(z.string().trim().min(1)),
  comment: z.string().optional(),
  user_defined_data: z.any().optional(),
})

function buildCreateSchema<T extends z.ZodRawShape>(body: z.ZodObject<T>) {
  return {
    body: body.or(z.array(body)),
  }
}

function buildUpdateSchema<T extends z.ZodRawShape>(body: z.ZodObject<T>) {
  return {
    params: z.object({ id: z.string() }),
    body: body
      .partial()
      .extend({ tournamentId: z.string().min(1) })
      .refine((data) => Object.keys(data).some((key) => key !== 'tournamentId'), {
        message: 'update payload is required',
      }),
  }
}

const createTeamSchema = buildCreateSchema(rawTeamBodySchema)
const createSpeakerSchema = buildCreateSchema(rawSpeakerBodySchema)
const createAdjudicatorSchema = buildCreateSchema(rawAdjudicatorBodySchema)
const updateTeamSchema = buildUpdateSchema(rawTeamBodySchema)
const updateSpeakerSchema = buildUpdateSchema(rawSpeakerBodySchema)
const updateAdjudicatorSchema = buildUpdateSchema(rawAdjudicatorBodySchema)

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

router.get('/teams', requireTournamentAdmin(), validateRequest(listSchema), listRawTeamResults)
router.post(
  '/teams',
  requireTournamentAdmin(),
  validateRequest(createTeamSchema),
  createRawTeamResult
)
router.patch(
  '/teams/:id',
  requireTournamentAdmin(),
  validateRequest(updateTeamSchema),
  updateRawTeamResult
)
router.delete(
  '/teams',
  requireTournamentAdmin(),
  validateRequest(deleteManySchema),
  deleteRawTeamResults
)
router.delete(
  '/teams/:id',
  requireTournamentAdmin(),
  validateRequest(deleteSchema),
  deleteRawTeamResult
)

router.get(
  '/speakers',
  requireTournamentAdmin(),
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
  validateRequest(updateSpeakerSchema),
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
  requireTournamentAdmin(),
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
  validateRequest(updateAdjudicatorSchema),
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
