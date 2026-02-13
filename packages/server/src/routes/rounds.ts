import { Router } from 'express'
import { z } from 'zod'
import {
  bulkDeleteRounds,
  bulkUpdateRounds,
  createRound,
  deleteRound,
  getRound,
  listRounds,
  previewBreakCandidates,
  updateRound,
  updateRoundBreak,
} from '../controllers/rounds.js'
import { requireTournamentAdmin, requireTournamentView } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const createBodySchema = z.object({
  tournamentId: z.string().min(1),
  round: z.number().int().min(1),
  name: z.string().optional(),
  motions: z.array(z.string()).optional(),
  motionOpened: z.boolean().optional(),
  teamAllocationOpened: z.boolean().optional(),
  adjudicatorAllocationOpened: z.boolean().optional(),
  weightsOfAdjudicators: z.object({ chair: z.number(), panel: z.number(), trainee: z.number() }).optional(),
  userDefinedData: z.any().optional(),
})

const createSchema = {
  body: createBodySchema.or(z.array(createBodySchema)),
}

const listSchema = {
  query: z.object({
    tournamentId: z.string().min(1),
    public: z.string().optional(),
  }),
}
const getSchema = {
  params: z.object({ id: z.string() }),
  query: z.object({ tournamentId: z.string().min(1), public: z.string().optional() }),
}

const updateSchema = {
  params: z.object({ id: z.string() }),
  body: z
    .object({
      tournamentId: z.string().min(1),
      round: z.number().int().min(1).optional(),
      name: z.string().optional(),
      motions: z.array(z.string()).optional(),
      motionOpened: z.boolean().optional(),
      teamAllocationOpened: z.boolean().optional(),
      adjudicatorAllocationOpened: z.boolean().optional(),
      weightsOfAdjudicators: z
        .object({ chair: z.number(), panel: z.number(), trainee: z.number() })
        .optional(),
      userDefinedData: z.any().optional(),
    })
    .refine(
      (data) =>
        data.round !== undefined ||
        data.name !== undefined ||
        data.motions !== undefined ||
        data.motionOpened !== undefined ||
        data.teamAllocationOpened !== undefined ||
        data.adjudicatorAllocationOpened !== undefined ||
        data.weightsOfAdjudicators !== undefined ||
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
        round: z.number().int().min(1).optional(),
        name: z.string().optional(),
        motions: z.array(z.string()).optional(),
        motionOpened: z.boolean().optional(),
        teamAllocationOpened: z.boolean().optional(),
        adjudicatorAllocationOpened: z.boolean().optional(),
        weightsOfAdjudicators: z
          .object({ chair: z.number(), panel: z.number(), trainee: z.number() })
          .optional(),
        userDefinedData: z.any().optional(),
      })
      .refine(
        (data) =>
          data.round !== undefined ||
          data.name !== undefined ||
          data.motions !== undefined ||
          data.motionOpened !== undefined ||
          data.teamAllocationOpened !== undefined ||
          data.adjudicatorAllocationOpened !== undefined ||
          data.weightsOfAdjudicators !== undefined ||
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

const breakCandidatesSchema = {
  params: z.object({ id: z.string() }),
  body: z.object({
    tournamentId: z.string().min(1),
    source: z.enum(['submissions', 'raw']).optional(),
    sourceRounds: z.array(z.number().int().min(1)).optional(),
    size: z.number().int().min(1).optional(),
  }),
}

const breakConfigSchema = z
  .object({
    enabled: z.boolean(),
    source_rounds: z.array(z.number().int().min(1)),
    size: z.number().int().min(1),
    cutoff_tie_policy: z.enum(['manual', 'include_all', 'strict']),
    seeding: z.enum(['high_low']),
    participants: z.array(
      z.object({
        teamId: z.string().min(1),
        seed: z.number().int().min(1),
      })
    ),
  })
  .superRefine((value, ctx) => {
    const teamIds = new Set<string>()
    const seeds = new Set<number>()
    for (const participant of value.participants) {
      if (teamIds.has(participant.teamId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate participant teamId: ${participant.teamId}`,
        })
      }
      if (seeds.has(participant.seed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate participant seed: ${participant.seed}`,
        })
      }
      teamIds.add(participant.teamId)
      seeds.add(participant.seed)
    }
  })

const updateBreakSchema = {
  params: z.object({ id: z.string() }),
  body: z.object({
    tournamentId: z.string().min(1),
    break: breakConfigSchema,
    syncTeamAvailability: z.boolean().optional(),
  }),
}

router.get(
  '/',
  requireTournamentView(),
  validateRequest(listSchema),
  listRounds
)
router.get(
  '/:id',
  requireTournamentView(),
  validateRequest(getSchema),
  getRound
)
router.post('/', requireTournamentAdmin(), validateRequest(createSchema), createRound)
router.patch('/', requireTournamentAdmin(), validateRequest(bulkUpdateSchema), bulkUpdateRounds)
router.patch('/:id', requireTournamentAdmin(), validateRequest(updateSchema), updateRound)
router.post(
  '/:id/break/candidates',
  requireTournamentAdmin(),
  validateRequest(breakCandidatesSchema),
  previewBreakCandidates
)
router.patch('/:id/break', requireTournamentAdmin(), validateRequest(updateBreakSchema), updateRoundBreak)
router.delete('/', requireTournamentAdmin(), validateRequest(bulkDeleteSchema), bulkDeleteRounds)
router.delete('/:id', requireTournamentAdmin(), validateRequest(deleteSchema), deleteRound)

export { router as roundRouter }
