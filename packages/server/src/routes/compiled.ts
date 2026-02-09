import { Router } from 'express'
import { z } from 'zod'
import {
  listCompiled,
  createCompiled,
  listCompiledTeams,
  createCompiledTeams,
  listCompiledSpeakers,
  createCompiledSpeakers,
  listCompiledAdjudicators,
  createCompiledAdjudicators,
} from '../controllers/compiled.js'
import { requireTournamentAdmin, requireTournamentView } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const listSchema = {
  query: z.object({
    tournamentId: z.string().min(1),
    latest: z.string().optional(),
  }),
}

const createSchema = {
  body: z.object({
    tournamentId: z.string().min(1),
    source: z.enum(['submissions', 'raw']).optional(),
    rounds: z.array(z.number().int().min(1)).optional(),
  }),
}

router.get(
  '/',
  requireTournamentView(),
  validateRequest(listSchema),
  listCompiled
)
router.post('/', requireTournamentAdmin(), validateRequest(createSchema), createCompiled)
router.get(
  '/teams',
  requireTournamentView(),
  validateRequest(listSchema),
  listCompiledTeams
)
router.post('/teams', requireTournamentAdmin(), validateRequest(createSchema), createCompiledTeams)
router.get(
  '/speakers',
  requireTournamentView(),
  validateRequest(listSchema),
  listCompiledSpeakers
)
router.post(
  '/speakers',
  requireTournamentAdmin(),
  validateRequest(createSchema),
  createCompiledSpeakers
)
router.get(
  '/adjudicators',
  requireTournamentView(),
  validateRequest(listSchema),
  listCompiledAdjudicators
)
router.post(
  '/adjudicators',
  requireTournamentAdmin(),
  validateRequest(createSchema),
  createCompiledAdjudicators
)

export { router as compiledRouter }
