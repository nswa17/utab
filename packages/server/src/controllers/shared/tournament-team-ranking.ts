import {
  DEFAULT_COMPILE_OPTIONS,
  compileAdjudicatorRankingMetrics,
  compileRankingMetrics,
  type CompileAdjudicatorRankingMetric,
  type CompileOptions,
  type CompileRankingMetric,
} from '../../types/compiled-options.js'

type TournamentTeamRankingConfig = {
  order: CompileRankingMetric[]
}

type TournamentAdjudicatorRankingConfig = {
  order: CompileAdjudicatorRankingMetric[]
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function defaultTournamentTeamRankingConfig(): TournamentTeamRankingConfig {
  return {
    order: [...DEFAULT_COMPILE_OPTIONS.ranking_priority.order],
  }
}

function defaultTournamentAdjudicatorRankingConfig(): TournamentAdjudicatorRankingConfig {
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
  tournamentUserDefinedData: unknown
): CompileOptions['ranking_priority'] {
  const source = asRecord(tournamentUserDefinedData)
  const normalized = normalizeTournamentTeamRankingConfig(source.team_ranking_priority)
  return {
    preset: 'custom',
    order: [...normalized.order],
  }
}

export function resolveTournamentAdjudicatorRankingPriority(
  tournamentUserDefinedData: unknown
): CompileOptions['adjudicator_ranking_priority'] {
  const source = asRecord(tournamentUserDefinedData)
  const normalized = normalizeTournamentAdjudicatorRankingConfig(source.adjudicator_ranking_priority)
  return {
    order: [...normalized.order],
  }
}

export function withTournamentTeamRankingPriority(
  compileOptions: CompileOptions,
  tournamentUserDefinedData: unknown
): CompileOptions {
  return {
    ...compileOptions,
    ranking_priority: resolveTournamentTeamRankingPriority(tournamentUserDefinedData),
    adjudicator_ranking_priority: resolveTournamentAdjudicatorRankingPriority(
      tournamentUserDefinedData
    ),
  }
}
