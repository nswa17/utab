import { Router } from 'express'
import { z } from 'zod'
import {
  bulkDeleteAdjudicators,
  bulkUpdateAdjudicators,
  createAdjudicator,
  deleteAdjudicator,
  getAdjudicator,
  listAdjudicators,
  updateAdjudicator,
} from '../controllers/adjudicators.js'
import { requireTournamentAdmin, requireTournamentView } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const createBodySchema = z.object({
  tournamentId: z.string(),
  name: z.string().min(1),
  strength: z.number().nonnegative(),
  active: z.boolean().optional(),
  preev: z.number().optional(),
  details: z.any().optional(),
  userDefinedData: z.any().optional(),
})

const createSchema = {
  body: createBodySchema.or(z.array(createBodySchema)),
}

const listSchema = { query: z.object({ tournamentId: z.string().min(1) }) }
const getSchema = {
  params: z.object({ id: z.string() }),
  query: z.object({ tournamentId: z.string().min(1) }),
}

const updateSchema = {
  params: z.object({ id: z.string() }),
  body: z
    .object({
      tournamentId: z.string().min(1),
      name: z.string().min(1).optional(),
      strength: z.number().nonnegative().optional(),
      active: z.boolean().optional(),
      preev: z.number().optional(),
      details: z.any().optional(),
      userDefinedData: z.any().optional(),
    })
    .refine(
      (data) =>
        data.name !== undefined ||
        data.strength !== undefined ||
        data.active !== undefined ||
        data.preev !== undefined ||
        data.details !== undefined ||
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
        name: z.string().min(1).optional(),
        strength: z.number().nonnegative().optional(),
        active: z.boolean().optional(),
        preev: z.number().optional(),
        details: z.any().optional(),
        userDefinedData: z.any().optional(),
      })
      .refine(
        (data) =>
          data.name !== undefined ||
          data.strength !== undefined ||
          data.active !== undefined ||
          data.preev !== undefined ||
          data.details !== undefined ||
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
  listAdjudicators
)
router.get(
  '/:id',
  requireTournamentView(),
  validateRequest(getSchema),
  getAdjudicator
)
router.post('/', requireTournamentAdmin(), validateRequest(createSchema), createAdjudicator)
router.patch('/', requireTournamentAdmin(), validateRequest(bulkUpdateSchema), bulkUpdateAdjudicators)
router.patch('/:id', requireTournamentAdmin(), validateRequest(updateSchema), updateAdjudicator)
router.delete('/', requireTournamentAdmin(), validateRequest(bulkDeleteSchema), bulkDeleteAdjudicators)
router.delete('/:id', requireTournamentAdmin(), validateRequest(deleteSchema), deleteAdjudicator)

export { router as adjudicatorRouter }
