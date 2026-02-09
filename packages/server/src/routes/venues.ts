import { Router } from 'express'
import { z } from 'zod'
import {
  bulkDeleteVenues,
  bulkUpdateVenues,
  createVenue,
  deleteVenue,
  getVenue,
  listVenues,
  updateVenue,
} from '../controllers/venues.js'
import { requireTournamentAdmin, requireTournamentView } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const createBodySchema = z.object({
  tournamentId: z.string().min(1),
  name: z.string().min(1),
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
      details: z.any().optional(),
      userDefinedData: z.any().optional(),
    })
    .refine(
      (data) =>
        data.name !== undefined || data.details !== undefined || data.userDefinedData !== undefined,
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
        details: z.any().optional(),
        userDefinedData: z.any().optional(),
      })
      .refine(
        (data) =>
          data.name !== undefined || data.details !== undefined || data.userDefinedData !== undefined,
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
  listVenues
)
router.get(
  '/:id',
  requireTournamentView(),
  validateRequest(getSchema),
  getVenue
)
router.post('/', requireTournamentAdmin(), validateRequest(createSchema), createVenue)
router.patch('/', requireTournamentAdmin(), validateRequest(bulkUpdateSchema), bulkUpdateVenues)
router.patch('/:id', requireTournamentAdmin(), validateRequest(updateSchema), updateVenue)
router.delete('/', requireTournamentAdmin(), validateRequest(bulkDeleteSchema), bulkDeleteVenues)
router.delete('/:id', requireTournamentAdmin(), validateRequest(deleteSchema), deleteVenue)

export { router as venueRouter }
