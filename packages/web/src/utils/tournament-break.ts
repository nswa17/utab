import type { BreakCutoffTiePolicy, BreakSeeding } from '@/types/round'

export type TournamentBreakSource = 'submissions' | 'raw'

export type TournamentBreakConfig = {
  source: TournamentBreakSource
  source_rounds: number[]
  size: number
  cutoff_tie_policy: BreakCutoffTiePolicy
  seeding: BreakSeeding
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeSeeding(value: unknown, fallback: BreakSeeding): BreakSeeding {
  if (value === 'high_low') return 'reseed_each_round'
  if (value === 'reseed_each_round') return 'reseed_each_round'
  if (value === 'fixed_bracket') return 'fixed_bracket'
  if (value === 'random_within_tie_group') return 'random_within_tie_group'
  if (value === 'random_full') return 'random_full'
  return fallback
}

function normalizeSourceRounds(rounds: unknown): number[] {
  if (!Array.isArray(rounds)) return []
  return Array.from(
    new Set(
      rounds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1)
    )
  ).sort((left, right) => left - right)
}

export function defaultTournamentBreakConfig(): TournamentBreakConfig {
  return {
    source: 'submissions',
    source_rounds: [],
    size: 8,
    cutoff_tie_policy: 'include_all',
    seeding: 'fixed_bracket',
  }
}

export function normalizeTournamentBreakConfig(input: unknown): TournamentBreakConfig {
  const source = asRecord(input)
  const fallback = defaultTournamentBreakConfig()
  const sizeRaw = Number(source.size)
  return {
    source: source.source === 'raw' ? 'raw' : fallback.source,
    source_rounds: normalizeSourceRounds(source.source_rounds),
    size: Number.isInteger(sizeRaw) && sizeRaw >= 1 ? sizeRaw : fallback.size,
    cutoff_tie_policy:
      source.cutoff_tie_policy === 'manual' ||
      source.cutoff_tie_policy === 'include_all' ||
      source.cutoff_tie_policy === 'strict'
        ? (source.cutoff_tie_policy as BreakCutoffTiePolicy)
        : fallback.cutoff_tie_policy,
    seeding: normalizeSeeding(source.seeding, fallback.seeding),
  }
}

export function isRoundBreakEnabled(roundUserDefinedData: unknown): boolean {
  const source = asRecord(roundUserDefinedData)
  return source.break_round === true
}

export function withRoundBreakEnabled(
  roundUserDefinedData: unknown,
  enabled: boolean
): Record<string, unknown> {
  const source = asRecord(roundUserDefinedData)
  const breakConfig = asRecord(source.break)
  const { enabled: _legacyEnabled, ...nextBreakConfig } = breakConfig
  void _legacyEnabled
  const next: Record<string, unknown> = {
    ...source,
    break_round: enabled,
  }
  if (Object.prototype.hasOwnProperty.call(source, 'break')) {
    next.break = nextBreakConfig
  }
  return next
}
