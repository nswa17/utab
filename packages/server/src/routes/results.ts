import { Router } from 'express'
import { z } from 'zod'
import {
  createResult,
  deleteResult,
  getResult,
  listResults,
  updateResult,
} from '../controllers/results.js'
import { requireTournamentAdmin, requireTournamentView } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const createSchema = {
  body: z.object({
    tournamentId: z.string(),
    round: z.number().int().min(1),
    payload: z.record(z.any()),
  }),
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
      round: z.number().int().min(1).optional(),
      payload: z.record(z.any()).optional(),
    })
    .refine((data) => data.round !== undefined || data.payload !== undefined, {
      message: 'round or payload is required',
    }),
}

const deleteSchema = {
  params: z.object({ id: z.string() }),
  query: z.object({ tournamentId: z.string().min(1) }),
}

router.get(
  '/',
  requireTournamentView(),
  validateRequest(listSchema),
  listResults
)
router.get(
  '/:id',
  requireTournamentView(),
  validateRequest(getSchema),
  getResult
)
router.post('/', requireTournamentAdmin(), validateRequest(createSchema), createResult)
router.patch('/:id', requireTournamentAdmin(), validateRequest(updateSchema), updateResult)
router.delete('/:id', requireTournamentAdmin(), validateRequest(deleteSchema), deleteResult)

export { router as resultRouter }
