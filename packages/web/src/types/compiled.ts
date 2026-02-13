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

export const DEFAULT_COMPILE_OPTIONS: CompileOptions = {
  ranking_priority: {
    preset: 'current',
    order: [...compileRankingMetrics],
  },
  winner_policy: 'winner_id_then_score',
  tie_points: 0.5,
  duplicate_normalization: {
    merge_policy: 'average',
    poi_aggregation: 'average',
    best_aggregation: 'average',
  },
  missing_data_policy: 'warn',
  include_labels: [...compileIncludeLabels],
  diff_baseline: { mode: 'latest' },
}
