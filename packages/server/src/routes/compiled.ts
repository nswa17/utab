import { Router } from 'express'
import { z } from 'zod'
import {
  listCompiled,
  createCompiled,
  createCompiledPreview,
  listCompiledTeams,
  createCompiledTeams,
  listCompiledSpeakers,
  createCompiledSpeakers,
  listCompiledAdjudicators,
  createCompiledAdjudicators,
} from '../controllers/compiled.js'
import { requireTournamentAdmin, requireTournamentView } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'
import {
  compileAggregationPolicies,
  compileDuplicateMergePolicies,
  compileIncludeLabels,
  compileMissingDataPolicies,
  compileRankingMetrics,
  compileRankingPresets,
  compileWinnerPolicies,
} from '../types/compiled-options.js'

const router: Router = Router()

const listSchema = {
  query: z.object({
    tournamentId: z.string().min(1),
    latest: z.string().optional(),
  }),
}

const compileOptionsSchema = z
  .object({
    ranking_priority: z
      .object({
        preset: z.enum(compileRankingPresets).optional(),
        order: z.array(z.enum(compileRankingMetrics)).min(1).optional(),
      })
      .optional(),
    winner_policy: z.enum(compileWinnerPolicies).optional(),
    tie_points: z.number().min(0).optional(),
    duplicate_normalization: z
      .object({
        merge_policy: z.enum(compileDuplicateMergePolicies).optional(),
        poi_aggregation: z.enum(compileAggregationPolicies).optional(),
        best_aggregation: z.enum(compileAggregationPolicies).optional(),
      })
      .optional(),
    missing_data_policy: z.enum(compileMissingDataPolicies).optional(),
    include_labels: z.array(z.enum(compileIncludeLabels)).min(1).optional(),
    diff_baseline: z
      .discriminatedUnion('mode', [
        z.object({ mode: z.literal('latest') }),
        z.object({ mode: z.literal('compiled'), compiled_id: z.string().min(1) }),
      ])
      .optional(),
  })
  .optional()

const compileBodySchema = z.object({
  tournamentId: z.string().min(1),
  source: z.enum(['submissions', 'raw']).optional(),
  rounds: z.array(z.number().int().min(1)).optional(),
  options: compileOptionsSchema,
})

const createSchema = {
  body: z.object({
    ...compileBodySchema.shape,
    snapshot_name: z.string().max(200).optional(),
    snapshot_memo: z.string().max(2000).optional(),
    preview_signature: z.string().min(1).optional(),
    revision: z.string().min(1).optional(),
  }),
}

const previewSchema = {
  body: compileBodySchema,
}

router.get(
  '/',
  requireTournamentView(),
  validateRequest(listSchema),
  listCompiled
)
router.post('/preview', requireTournamentAdmin(), validateRequest(previewSchema), createCompiledPreview)
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
