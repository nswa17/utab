import express, { Router } from 'express'
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
import { exportTournamentBundle } from '../controllers/tournament-export.js'
import { importTournamentBundle } from '../controllers/tournament-import.js'
import { addTournamentUser, removeTournamentUser } from '../controllers/tournament-users.js'
import {
  requireOrganizer,
  requireTournamentAdmin,
  requireTournamentView,
} from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const tournamentOptionsSchema = z.record(z.any()).superRefine((options, ctx) => {
  const style = options.style
  if (!style || typeof style !== 'object' || Array.isArray(style)) return
  const teamNum = (style as Record<string, unknown>).team_num
  if (teamNum === undefined) return
  if (
    typeof teamNum === 'number' &&
    Number.isFinite(teamNum) &&
    Number.isInteger(teamNum) &&
    teamNum >= 2
  ) {
    return
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['style', 'team_num'],
    message: 'team_num must be an integer greater than or equal to 2',
  })
})

const tournamentBodySchema = z.object({
  name: z.string().trim().min(1),
  style: z.number(),
  options: tournamentOptionsSchema.optional(),
  total_round_num: z.number().int().optional(),
  current_round_num: z.number().int().optional(),
  preev_weights: z.array(z.number()).optional(),
  auth: z.record(z.any()).optional(),
  user_defined_data: z.record(z.any()).optional(),
})

const createSchema = {
  body: tournamentBodySchema,
}

const idParamSchema = { params: z.object({ id: z.string() }) }
const updateSchema = {
  params: z.object({ id: z.string() }),
  body: tournamentBodySchema.partial().refine((data) => Object.keys(data).length > 0, {
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
    username: z.string().trim().min(1),
    password: z.string().min(6),
    role: z.enum(['organizer', 'adjudicator', 'speaker', 'audience']),
  }),
}

const tournamentUserDeleteSchema = {
  params: z.object({ id: z.string() }),
  query: z
    .object({
      username: z.string().trim().min(1).optional(),
      userId: z.string().min(1).optional(),
    })
    .refine((data) => data.username !== undefined || data.userId !== undefined, {
      message: 'username or userId is required',
    }),
}

router.get('/', listTournaments)
router.get('/:id', requireTournamentView('id'), validateRequest(idParamSchema), getTournament)
router.get(
  '/:id/export',
  requireTournamentAdmin('id'),
  validateRequest(idParamSchema),
  exportTournamentBundle
)
router.post(
  '/import',
  requireOrganizer,
  express.raw({
    type: ['application/zip', 'application/octet-stream', 'application/x-zip-compressed'],
    limit: '128mb',
  }),
  importTournamentBundle
)
router.post('/', requireOrganizer, validateRequest(createSchema), createTournament)
router.patch('/:id', requireTournamentAdmin('id'), validateRequest(updateSchema), updateTournament)
router.delete(
  '/:id',
  requireTournamentAdmin('id'),
  validateRequest(idParamSchema),
  deleteTournament
)
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
