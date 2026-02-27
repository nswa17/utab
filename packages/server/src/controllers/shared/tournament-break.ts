import { normalizeBreakSourceRounds, type BreakCutoffTiePolicy, type BreakSeeding } from './break-config.js'

export type TournamentBreakSource = 'submissions' | 'raw'

export type TournamentBreakConfig = {
  source: TournamentBreakSource
  source_rounds: number[]
  size: number
  cutoff_tie_policy: BreakCutoffTiePolicy
  seeding: BreakSeeding
}

const DEFAULT_TOURNAMENT_BREAK_CONFIG: TournamentBreakConfig = {
  source: 'submissions',
  source_rounds: [],
  size: 8,
  cutoff_tie_policy: 'include_all',
  seeding: 'fixed_bracket',
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeBreakSeeding(value: unknown, fallback: BreakSeeding): BreakSeeding {
  if (value === 'high_low') return 'reseed_each_round'
  if (value === 'reseed_each_round') return 'reseed_each_round'
  if (value === 'fixed_bracket') return 'fixed_bracket'
  if (value === 'random_within_tie_group') return 'random_within_tie_group'
  if (value === 'random_full') return 'random_full'
  return fallback
}

export function defaultTournamentBreakConfig(): TournamentBreakConfig {
  return { ...DEFAULT_TOURNAMENT_BREAK_CONFIG }
}

export function hasTournamentBreakPolicy(input: unknown): boolean {
  const source = asRecord(input)
  return Object.keys(source).length > 0
}

export function normalizeTournamentBreakConfig(
  targetRound: number,
  input: unknown
): TournamentBreakConfig {
  const source = asRecord(input)
  const defaults = defaultTournamentBreakConfig()
  const sizeRaw = Number(source.size)
  return {
    source: source.source === 'raw' ? 'raw' : defaults.source,
    source_rounds: normalizeBreakSourceRounds(targetRound, source.source_rounds),
    size: Number.isInteger(sizeRaw) && sizeRaw >= 1 ? sizeRaw : defaults.size,
    cutoff_tie_policy:
      source.cutoff_tie_policy === 'manual' ||
      source.cutoff_tie_policy === 'include_all' ||
      source.cutoff_tie_policy === 'strict'
        ? (source.cutoff_tie_policy as BreakCutoffTiePolicy)
        : defaults.cutoff_tie_policy,
    seeding: normalizeBreakSeeding(source.seeding, defaults.seeding),
  }
}
