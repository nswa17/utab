import { Router } from 'express'
import { z } from 'zod'
import {
  bulkDeleteTeams,
  bulkUpdateTeams,
  createTeam,
  deleteTeam,
  getTeam,
  listTeams,
  updateTeam,
} from '../controllers/teams.js'
import { requireTournamentAdmin, requireTournamentView } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const createBodySchema = z.object({
  tournamentId: z.string(),
  name: z.string().min(1),
  institution: z.string().optional(),
  speakers: z.array(z.object({ name: z.string().min(1) })).optional(),
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
      institution: z.string().optional(),
      speakers: z.array(z.object({ name: z.string().min(1) })).optional(),
      details: z.any().optional(),
      userDefinedData: z.any().optional(),
    })
    .refine(
      (data) =>
        data.name !== undefined ||
        data.institution !== undefined ||
        data.speakers !== undefined ||
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
        institution: z.string().optional(),
        speakers: z.array(z.object({ name: z.string().min(1) })).optional(),
        details: z.any().optional(),
        userDefinedData: z.any().optional(),
      })
      .refine(
        (data) =>
          data.name !== undefined ||
          data.institution !== undefined ||
          data.speakers !== undefined ||
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
  listTeams
)
router.get(
  '/:id',
  requireTournamentView(),
  validateRequest(getSchema),
  getTeam
)
router.post('/', requireTournamentAdmin(), validateRequest(createSchema), createTeam)
router.patch('/', requireTournamentAdmin(), validateRequest(bulkUpdateSchema), bulkUpdateTeams)
router.patch('/:id', requireTournamentAdmin(), validateRequest(updateSchema), updateTeam)
router.delete('/', requireTournamentAdmin(), validateRequest(bulkDeleteSchema), bulkDeleteTeams)
router.delete('/:id', requireTournamentAdmin(), validateRequest(deleteSchema), deleteTeam)

export { router as teamRouter }
