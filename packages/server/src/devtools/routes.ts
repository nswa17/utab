import { Router } from 'express'
import { z } from 'zod'
import { requireTournamentAdmin } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'
import {
  clearRoundSubmissionsForRound,
  copyTournament,
  fillRoundSubmissionsForRound,
  fillSetup,
} from './controllers.js'

const router: Router = Router()

const paramsSchema = z.object({
  tournamentId: z.string().min(1),
})

const fillSetupSchema = {
  params: paramsSchema,
  body: z.object({
    targetTeams: z.number().int().min(0),
    targetAdjudicators: z.number().int().min(0),
    targetVenues: z.number().int().min(0),
    targetInstitutions: z.number().int().min(0),
    speakersPerTeam: z.number().int().min(1),
  }),
}

const fillRoundSubmissionsSchema = {
  params: paramsSchema,
  body: z.object({
    round: z.number().int().min(1),
  }),
}

const copyTournamentSchema = {
  params: paramsSchema,
  body: z.object({}),
}

router.post(
  '/tournaments/:tournamentId/fill-setup',
  requireTournamentAdmin(),
  validateRequest(fillSetupSchema),
  fillSetup
)

router.post(
  '/tournaments/:tournamentId/fill-round-submissions',
  requireTournamentAdmin(),
  validateRequest(fillRoundSubmissionsSchema),
  fillRoundSubmissionsForRound
)

router.post(
  '/tournaments/:tournamentId/clear-round-submissions',
  requireTournamentAdmin(),
  validateRequest(fillRoundSubmissionsSchema),
  clearRoundSubmissionsForRound
)

router.post(
  '/tournaments/:tournamentId/copy-tournament',
  requireTournamentAdmin(),
  validateRequest(copyTournamentSchema),
  copyTournament
)

export { router as devToolsRouter }
