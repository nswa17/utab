export const compileRankingMetrics = ['win', 'sum', 'margin', 'vote', 'average', 'sd'] as const
export const compileRankingPresets = ['current', 'custom'] as const
export const compileWinnerPolicies = [
  'winner_id_then_score',
  'score_only',
  'draw_on_missing',
] as const
export const compileDuplicateMergePolicies = ['latest', 'average', 'error'] as const
export const compileAggregationPolicies = ['average', 'max'] as const
export const compileMissingDataPolicies = ['warn', 'exclude', 'error'] as const
export const compileIncludeLabels = [
  'teams',
  'speakers',
  'adjudicators',
  'poi',
  'best',
] as const
export const compileDiffBaselineModes = ['latest', 'compiled'] as const

export type CompileRankingMetric = (typeof compileRankingMetrics)[number]
export type CompileRankingPreset = (typeof compileRankingPresets)[number]
export type CompileWinnerPolicy = (typeof compileWinnerPolicies)[number]
export type CompileDuplicateMergePolicy = (typeof compileDuplicateMergePolicies)[number]
export type CompileAggregationPolicy = (typeof compileAggregationPolicies)[number]
export type CompileMissingDataPolicy = (typeof compileMissingDataPolicies)[number]
export type CompileIncludeLabel = (typeof compileIncludeLabels)[number]

export interface CompileOptions {
  ranking_priority: {
    preset: CompileRankingPreset
    order: CompileRankingMetric[]
  }
  winner_policy: CompileWinnerPolicy
  tie_points: number
  duplicate_normalization: {
    merge_policy: CompileDuplicateMergePolicy
    poi_aggregation: CompileAggregationPolicy
    best_aggregation: CompileAggregationPolicy
  }
  missing_data_policy: CompileMissingDataPolicy
  include_labels: CompileIncludeLabel[]
  diff_baseline: { mode: 'latest' } | { mode: 'compiled'; compiled_id: string }
}

export interface CompileOptionsInput {
  ranking_priority?: {
    preset?: CompileRankingPreset
    order?: CompileRankingMetric[]
  }
  winner_policy?: CompileWinnerPolicy
  tie_points?: number
  duplicate_normalization?: {
    merge_policy?: CompileDuplicateMergePolicy
    poi_aggregation?: CompileAggregationPolicy
    best_aggregation?: CompileAggregationPolicy
  }
  missing_data_policy?: CompileMissingDataPolicy
  include_labels?: CompileIncludeLabel[]
  diff_baseline?: { mode: 'latest' } | { mode: 'compiled'; compiled_id: string }
}

export const DEFAULT_COMPILE_OPTIONS: CompileOptions = {
  ranking_priority: {
    preset: 'current',
    order: [...compileRankingMetrics],
  },
  winner_policy: 'winner_id_then_score',
  tie_points: 0.5,
  duplicate_normalization: {
    merge_policy: 'error',
    poi_aggregation: 'average',
    best_aggregation: 'average',
  },
  missing_data_policy: 'error',
  include_labels: [...compileIncludeLabels],
  diff_baseline: { mode: 'latest' },
}

function dedupe<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

export function normalizeCompileOptions(
  input?: CompileOptionsInput,
  fallback: CompileOptions = DEFAULT_COMPILE_OPTIONS
): CompileOptions {
  const rankingOrder = dedupe(input?.ranking_priority?.order ?? fallback.ranking_priority.order)
  const includeLabels = dedupe(input?.include_labels ?? fallback.include_labels)
  return {
    ranking_priority: {
      preset: input?.ranking_priority?.preset ?? fallback.ranking_priority.preset,
      order: rankingOrder.length > 0 ? rankingOrder : [...fallback.ranking_priority.order],
    },
    winner_policy: input?.winner_policy ?? fallback.winner_policy,
    tie_points:
      typeof input?.tie_points === 'number' && Number.isFinite(input.tie_points)
        ? input.tie_points
        : fallback.tie_points,
    duplicate_normalization: {
      merge_policy:
        input?.duplicate_normalization?.merge_policy ??
        fallback.duplicate_normalization.merge_policy,
      poi_aggregation:
        input?.duplicate_normalization?.poi_aggregation ??
        fallback.duplicate_normalization.poi_aggregation,
      best_aggregation:
        input?.duplicate_normalization?.best_aggregation ??
        fallback.duplicate_normalization.best_aggregation,
    },
    missing_data_policy: input?.missing_data_policy ?? fallback.missing_data_policy,
    include_labels: includeLabels.length > 0 ? includeLabels : [...fallback.include_labels],
    diff_baseline:
      input?.diff_baseline?.mode === 'compiled' && input.diff_baseline.compiled_id
        ? { mode: 'compiled', compiled_id: input.diff_baseline.compiled_id }
        : { mode: 'latest' },
  }
}
