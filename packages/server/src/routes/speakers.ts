import { Router } from 'express'
import { z } from 'zod'
import {
  bulkDeleteSpeakers,
  bulkUpdateSpeakers,
  createSpeaker,
  deleteSpeaker,
  getSpeaker,
  listSpeakers,
  updateSpeaker,
} from '../controllers/speakers.js'
import { requireTournamentAdmin, requireTournamentView } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const createBodySchema = z.object({
  tournamentId: z.string().min(1),
  name: z.string().min(1),
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
      userDefinedData: z.any().optional(),
    })
    .refine((data) => data.name !== undefined || data.userDefinedData !== undefined, {
      message: 'update payload is required',
    }),
}

const bulkUpdateSchema = {
  body: z.array(
    z
      .object({
        id: z.string().min(1),
        tournamentId: z.string().min(1),
        name: z.string().min(1).optional(),
        userDefinedData: z.any().optional(),
      })
      .refine((data) => data.name !== undefined || data.userDefinedData !== undefined, {
        message: 'update payload is required',
      })
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
  listSpeakers
)
router.get(
  '/:id',
  requireTournamentView(),
  validateRequest(getSchema),
  getSpeaker
)
router.post('/', requireTournamentAdmin(), validateRequest(createSchema), createSpeaker)
router.patch('/', requireTournamentAdmin(), validateRequest(bulkUpdateSchema), bulkUpdateSpeakers)
router.patch('/:id', requireTournamentAdmin(), validateRequest(updateSchema), updateSpeaker)
router.delete('/', requireTournamentAdmin(), validateRequest(bulkDeleteSchema), bulkDeleteSpeakers)
router.delete('/:id', requireTournamentAdmin(), validateRequest(deleteSchema), deleteSpeaker)

export { router as speakerRouter }
