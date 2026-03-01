import {
  DEFAULT_COMPILE_OPTIONS,
  compileAdjudicatorRankingMetrics,
  compileRankingMetrics,
  type CompileAdjudicatorRankingMetric,
  type CompileOptions,
  type CompileRankingMetric,
} from '@/types/compiled'

export type TournamentTeamRankingConfig = {
  order: CompileRankingMetric[]
}

export type TournamentAdjudicatorRankingConfig = {
  order: CompileAdjudicatorRankingMetric[]
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function defaultTournamentTeamRankingConfig(): TournamentTeamRankingConfig {
  return {
    order: [...DEFAULT_COMPILE_OPTIONS.ranking_priority.order],
  }
}

export function defaultTournamentAdjudicatorRankingConfig(): TournamentAdjudicatorRankingConfig {
  return {
    order: [...DEFAULT_COMPILE_OPTIONS.adjudicator_ranking_priority.order],
  }
}

export function normalizeTournamentTeamRankingConfig(input: unknown): TournamentTeamRankingConfig {
  const source = asRecord(input)
  const rawOrder = Array.isArray(source.order) ? source.order : []
  const normalizedOrder = Array.from(
    new Set(
      rawOrder.filter((metric): metric is CompileRankingMetric =>
        compileRankingMetrics.includes(metric as CompileRankingMetric)
      )
    )
  )
  return {
    order:
      normalizedOrder.length > 0
        ? normalizedOrder
        : [...defaultTournamentTeamRankingConfig().order],
  }
}

export function normalizeTournamentAdjudicatorRankingConfig(
  input: unknown
): TournamentAdjudicatorRankingConfig {
  const source = asRecord(input)
  const rawOrder = Array.isArray(source.order) ? source.order : []
  const normalizedOrder = Array.from(
    new Set(
      rawOrder.filter((metric): metric is CompileAdjudicatorRankingMetric =>
        compileAdjudicatorRankingMetrics.includes(metric as CompileAdjudicatorRankingMetric)
      )
    )
  )
  return {
    order:
      normalizedOrder.length > 0
        ? normalizedOrder
        : [...defaultTournamentAdjudicatorRankingConfig().order],
  }
}

export function resolveTournamentTeamRankingPriority(
  input: unknown
): CompileOptions['ranking_priority'] {
  const normalized = normalizeTournamentTeamRankingConfig(input)
  return {
    preset: 'custom',
    order: [...normalized.order],
  }
}

export function resolveTournamentAdjudicatorRankingPriority(
  input: unknown
): CompileOptions['adjudicator_ranking_priority'] {
  const normalized = normalizeTournamentAdjudicatorRankingConfig(input)
  return {
    order: [...normalized.order],
  }
}
