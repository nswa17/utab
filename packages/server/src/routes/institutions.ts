import { Router } from 'express'
import { z } from 'zod'
import {
  bulkDeleteInstitutions,
  bulkUpdateInstitutions,
  createInstitution,
  deleteInstitution,
  getInstitution,
  listInstitutions,
  updateInstitution,
} from '../controllers/institutions.js'
import { requireTournamentAdmin, requireTournamentView } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const createBodySchema = z.object({
  tournamentId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().trim().min(1).optional(),
  priority: z.number().finite().min(0).optional(),
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
      category: z.string().trim().min(1).optional(),
      priority: z.number().finite().min(0).optional(),
      userDefinedData: z.any().optional(),
    })
    .refine(
      (data) =>
        data.name !== undefined ||
        data.category !== undefined ||
        data.priority !== undefined ||
        data.userDefinedData !== undefined,
      {
      message: 'update payload is required',
      }
    ),
}

const bulkUpdateSchema = {
  body: z.array(
    z
      .object({
        id: z.string().min(1),
        tournamentId: z.string().min(1),
        name: z.string().min(1).optional(),
        category: z.string().trim().min(1).optional(),
        priority: z.number().finite().min(0).optional(),
        userDefinedData: z.any().optional(),
      })
      .refine(
        (data) =>
          data.name !== undefined ||
          data.category !== undefined ||
          data.priority !== undefined ||
          data.userDefinedData !== undefined,
        {
          message: 'update payload is required',
        }
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
  listInstitutions
)
router.get(
  '/:id',
  requireTournamentView(),
  validateRequest(getSchema),
  getInstitution
)
router.post('/', requireTournamentAdmin(), validateRequest(createSchema), createInstitution)
router.patch('/', requireTournamentAdmin(), validateRequest(bulkUpdateSchema), bulkUpdateInstitutions)
router.patch('/:id', requireTournamentAdmin(), validateRequest(updateSchema), updateInstitution)
router.delete('/', requireTournamentAdmin(), validateRequest(bulkDeleteSchema), bulkDeleteInstitutions)
router.delete('/:id', requireTournamentAdmin(), validateRequest(deleteSchema), deleteInstitution)

export { router as institutionRouter }
