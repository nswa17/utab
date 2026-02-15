import { Router } from 'express'
import { z } from 'zod'
import {
  createAllocation,
  createAdjudicatorAllocation,
  createBreakAllocation,
  createTeamAllocation,
  createVenueAllocation,
} from '../controllers/allocations.js'
import { requireTournamentAdmin } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const allocationRowSchema = z.object({
  id: z.number().int().optional(),
  venue: z.string().nullable().optional(),
  teams: z.union([
    z.object({
      gov: z.string().min(1),
      opp: z.string().min(1),
    }),
    z.array(z.string().min(1)).min(2),
  ]),
  chairs: z.array(z.string()).optional().default([]),
  panels: z.array(z.string()).optional().default([]),
  trainees: z.array(z.string()).optional().default([]),
})

const baseBodySchema = z.object({
  tournamentId: z.string().min(1),
  round: z.number().int().min(1),
  options: z.record(z.any()).optional(),
  rounds: z.array(z.number().int().min(1)).optional(),
})

const baseBodyWithSnapshotSchema = baseBodySchema.extend({
  snapshotId: z.string().min(1),
})

const allocationBodySchema = baseBodyWithSnapshotSchema.extend({
  allocation: z.array(allocationRowSchema),
})

router.post(
  '/',
  requireTournamentAdmin(),
  validateRequest({ body: baseBodyWithSnapshotSchema }),
  createAllocation
)
router.post(
  '/teams',
  requireTournamentAdmin(),
  validateRequest({ body: baseBodyWithSnapshotSchema }),
  createTeamAllocation
)
router.post('/break', requireTournamentAdmin(), validateRequest({ body: baseBodySchema }), createBreakAllocation)
router.post(
  '/adjudicators',
  requireTournamentAdmin(),
  validateRequest({ body: allocationBodySchema }),
  createAdjudicatorAllocation
)
router.post(
  '/venues',
  requireTournamentAdmin(),
  validateRequest({ body: allocationBodySchema }),
  createVenueAllocation
)

export { router as allocationRouter }
