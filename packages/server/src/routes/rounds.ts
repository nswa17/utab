import { Router } from 'express'
import { z } from 'zod'
import {
  bulkDeleteRounds,
  bulkUpdateRounds,
  createRound,
  deleteRound,
  getRound,
  listRounds,
  updateRound,
} from '../controllers/rounds.js'
import { requireTournamentAdmin, requireTournamentView } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const createBodySchema = z.object({
  tournamentId: z.string().min(1),
  round: z.number().int().min(1),
  name: z.string().optional(),
  motions: z.array(z.string()).optional(),
  motionOpened: z.boolean().optional(),
  teamAllocationOpened: z.boolean().optional(),
  adjudicatorAllocationOpened: z.boolean().optional(),
  weightsOfAdjudicators: z.object({ chair: z.number(), panel: z.number(), trainee: z.number() }).optional(),
  userDefinedData: z.any().optional(),
})

const createSchema = {
  body: createBodySchema.or(z.array(createBodySchema)),
}

const listSchema = {
  query: z.object({
    tournamentId: z.string().min(1),
    public: z.string().optional(),
  }),
}
const getSchema = {
  params: z.object({ id: z.string() }),
  query: z.object({ tournamentId: z.string().min(1), public: z.string().optional() }),
}

const updateSchema = {
  params: z.object({ id: z.string() }),
  body: z
    .object({
      tournamentId: z.string().min(1),
      round: z.number().int().min(1).optional(),
      name: z.string().optional(),
      motions: z.array(z.string()).optional(),
      motionOpened: z.boolean().optional(),
      teamAllocationOpened: z.boolean().optional(),
      adjudicatorAllocationOpened: z.boolean().optional(),
      weightsOfAdjudicators: z
        .object({ chair: z.number(), panel: z.number(), trainee: z.number() })
        .optional(),
      userDefinedData: z.any().optional(),
    })
    .refine(
      (data) =>
        data.round !== undefined ||
        data.name !== undefined ||
        data.motions !== undefined ||
        data.motionOpened !== undefined ||
        data.teamAllocationOpened !== undefined ||
        data.adjudicatorAllocationOpened !== undefined ||
        data.weightsOfAdjudicators !== undefined ||
        data.userDefinedData !== undefined,
      { message: 'update payload is required' }
    ),
}

const bulkUpdateSchema = {
  body: z.array(
    z
      .object({
        id: z.string().min(1),
        tournamentId: z.string().min(1),
        round: z.number().int().min(1).optional(),
        name: z.string().optional(),
        motions: z.array(z.string()).optional(),
        motionOpened: z.boolean().optional(),
        teamAllocationOpened: z.boolean().optional(),
        adjudicatorAllocationOpened: z.boolean().optional(),
        weightsOfAdjudicators: z
          .object({ chair: z.number(), panel: z.number(), trainee: z.number() })
          .optional(),
        userDefinedData: z.any().optional(),
      })
      .refine(
        (data) =>
          data.round !== undefined ||
          data.name !== undefined ||
          data.motions !== undefined ||
          data.motionOpened !== undefined ||
          data.teamAllocationOpened !== undefined ||
          data.adjudicatorAllocationOpened !== undefined ||
          data.weightsOfAdjudicators !== undefined ||
          data.userDefinedData !== undefined,
        { message: 'update payload is required' }
      )
  ),
}

const deleteSchema = {
  params: z.object({ id: z.string() }),
  query: z.object({ tournamentId: z.string().min(1) }),
}

const bulkDeleteSchema = {
  query: z.object({
    tournamentId: z.string().min(1),
    ids: z.string().optional(),
  }),
}

router.get(
  '/',
  requireTournamentView(),
  validateRequest(listSchema),
  listRounds
)
router.get(
  '/:id',
  requireTournamentView(),
  validateRequest(getSchema),
  getRound
)
router.post('/', requireTournamentAdmin(), validateRequest(createSchema), createRound)
router.patch('/', requireTournamentAdmin(), validateRequest(bulkUpdateSchema), bulkUpdateRounds)
router.patch('/:id', requireTournamentAdmin(), validateRequest(updateSchema), updateRound)
router.delete('/', requireTournamentAdmin(), validateRequest(bulkDeleteSchema), bulkDeleteRounds)
router.delete('/:id', requireTournamentAdmin(), validateRequest(deleteSchema), deleteRound)

export { router as roundRouter }
