import { Router } from 'express'
import { z } from 'zod'
import { deleteDraw, generateDraw, listDraws, upsertDraw } from '../controllers/draws.js'
import { requireTournamentAdmin, requireTournamentView } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const allocationRowSchema = z.object({
  venue: z.string().optional(),
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

const listSchema = {
  query: z.object({
    tournamentId: z.string().min(1),
    round: z.coerce.number().int().min(1).optional(),
    public: z.string().optional(),
  }),
}

const upsertSchema = {
  body: z.object({
    tournamentId: z.string().min(1),
    round: z.number().int().min(1),
    allocation: z.array(allocationRowSchema),
    drawOpened: z.boolean().optional(),
    allocationOpened: z.boolean().optional(),
    locked: z.boolean().optional(),
  }),
}

const generateSchema = {
  body: z.object({
    tournamentId: z.string().min(1),
    round: z.number().int().min(1),
    options: z.record(z.any()).optional(),
    save: z.boolean().optional(),
  }),
}

const deleteSchema = {
  params: z.object({ id: z.string() }),
  query: z.object({ tournamentId: z.string().min(1) }),
}

router.get(
  '/',
  requireTournamentView(),
  validateRequest(listSchema),
  listDraws
)
router.post('/generate', requireTournamentAdmin(), validateRequest(generateSchema), generateDraw)
router.post('/', requireTournamentAdmin(), validateRequest(upsertSchema), upsertDraw)
router.delete('/:id', requireTournamentAdmin(), validateRequest(deleteSchema), deleteDraw)

export { router as drawRouter }
