import { Router } from 'express'
import { z } from 'zod'
import {
  accessTournament,
  createTournament,
  deleteTournament,
  exitTournamentAccess,
  getTournament,
  listTournaments,
  updateTournament,
} from '../controllers/tournaments.js'
import { addTournamentUser, removeTournamentUser } from '../controllers/tournament-users.js'
import {
  requireOrganizer,
  requireTournamentAdmin,
  requireTournamentView,
} from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const createSchema = {
  body: z.object({
    name: z.string().min(1),
    style: z.number(),
    options: z.record(z.any()).optional(),
    total_round_num: z.number().int().optional(),
    current_round_num: z.number().int().optional(),
    preev_weights: z.array(z.number()).optional(),
    auth: z.record(z.any()).optional(),
    user_defined_data: z.record(z.any()).optional(),
  }),
}

const idParamSchema = { params: z.object({ id: z.string() }) }
const updateSchema = {
  params: z.object({ id: z.string() }),
  body: z.record(z.any()).refine((data) => Object.keys(data).length > 0, {
    message: 'update payload is required',
  }),
}
const accessSchema = {
  params: z.object({ id: z.string() }),
  body: z.object({
    action: z.enum(['enter', 'skip']).optional(),
    password: z.string().optional(),
  }),
}
const tournamentUserSchema = {
  params: z.object({ id: z.string() }),
  body: z.object({
    username: z.string().min(1),
    password: z.string().min(6),
    role: z.enum(['organizer', 'adjudicator', 'speaker', 'audience']),
  }),
}

const tournamentUserDeleteSchema = {
  params: z.object({ id: z.string() }),
  query: z
    .object({
      username: z.string().min(1).optional(),
      userId: z.string().min(1).optional(),
    })
    .refine((data) => data.username !== undefined || data.userId !== undefined, {
      message: 'username or userId is required',
    }),
}

router.get('/', listTournaments)
router.get(
  '/:id',
  requireTournamentView('id'),
  validateRequest(idParamSchema),
  getTournament
)
router.post('/', requireOrganizer, validateRequest(createSchema), createTournament)
router.patch('/:id', requireTournamentAdmin('id'), validateRequest(updateSchema), updateTournament)
router.delete('/:id', requireTournamentAdmin('id'), validateRequest(idParamSchema), deleteTournament)
router.post('/:id/access', validateRequest(accessSchema), accessTournament)
router.post('/:id/exit', validateRequest(idParamSchema), exitTournamentAccess)
router.post(
  '/:id/users',
  requireTournamentAdmin('id'),
  validateRequest(tournamentUserSchema),
  addTournamentUser
)
router.delete(
  '/:id/users',
  requireTournamentAdmin('id'),
  validateRequest(tournamentUserDeleteSchema),
  removeTournamentUser
)

export { router as tournamentRouter }
