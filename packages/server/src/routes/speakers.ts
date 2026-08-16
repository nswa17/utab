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
import { eraseSpeakerPersonalData } from '../controllers/privacy.js'
import { requireTournamentAdmin, requireTournamentView } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const createBodySchema = z.object({
  tournamentId: z.string().min(1),
  name: z.string().trim().min(1),
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
      name: z.string().trim().min(1).optional(),
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
        name: z.string().trim().min(1).optional(),
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

const erasePersonalDataSchema = {
  params: z.object({ id: z.string().min(1) }),
  query: z.object({ tournamentId: z.string().min(1) }),
  body: z.object({
    reason: z.string().min(5).max(500),
    approvedBy: z.string().min(1).max(128).optional(),
    targetRefs: z.array(z.string().min(1).max(256)).max(20).optional(),
    eraseMode: z.enum(['anonymize', 'hard_delete']).optional(),
    reauthPassword: z.string().min(1).max(200).optional(),
  }),
}

const bulkDeleteSchema = {
  query: z.object({
    tournamentId: z.string().min(1),
    ids: z.string().optional(),
  }),
}

router.get('/', requireTournamentView(), validateRequest(listSchema), listSpeakers)
router.get('/:id', requireTournamentView(), validateRequest(getSchema), getSpeaker)
router.post('/', requireTournamentAdmin(), validateRequest(createSchema), createSpeaker)
router.patch('/', requireTournamentAdmin(), validateRequest(bulkUpdateSchema), bulkUpdateSpeakers)
router.patch('/:id', requireTournamentAdmin(), validateRequest(updateSchema), updateSpeaker)
router.delete(
  '/:id/personal-data',
  requireTournamentAdmin(),
  validateRequest(erasePersonalDataSchema),
  eraseSpeakerPersonalData
)
router.delete('/', requireTournamentAdmin(), validateRequest(bulkDeleteSchema), bulkDeleteSpeakers)
router.delete('/:id', requireTournamentAdmin(), validateRequest(deleteSchema), deleteSpeaker)

export { router as speakerRouter }
