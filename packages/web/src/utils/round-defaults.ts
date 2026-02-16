import {
  DEFAULT_COMPILE_OPTIONS,
  normalizeCompileOptions,
  type CompileOptions,
  type CompileOptionsInput,
} from '@/types/compiled'

type EvaluatorInTeam = 'team' | 'speaker'
type BreakSource = 'submissions' | 'raw'
type BreakCutoffTiePolicy = 'manual' | 'include_all' | 'strict'
type BreakSeeding = 'high_low'
type CompileSource = 'submissions' | 'raw'

export type RoundDefaults = {
  userDefinedData: {
    evaluate_from_adjudicators: boolean
    evaluate_from_teams: boolean
    chairs_always_evaluated: boolean
    evaluator_in_team: EvaluatorInTeam
    no_speaker_score: boolean
    score_by_matter_manner: boolean
    poi: boolean
    best: boolean
    allow_low_tie_win: boolean
  }
  break: {
    source: BreakSource
    size: number
    cutoff_tie_policy: BreakCutoffTiePolicy
    seeding: BreakSeeding
  }
  compile: {
    source: CompileSource
    source_rounds: number[]
    options: CompileOptions
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function asPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return parsed
}

function asRoundList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 1)
    )
  ).sort((left, right) => left - right)
}

export function defaultRoundDefaults(): RoundDefaults {
  return {
    userDefinedData: {
      evaluate_from_adjudicators: true,
      evaluate_from_teams: true,
      chairs_always_evaluated: false,
      evaluator_in_team: 'team',
      no_speaker_score: false,
      score_by_matter_manner: true,
      poi: true,
      best: true,
      allow_low_tie_win: true,
    },
    break: {
      source: 'submissions',
      size: 8,
      cutoff_tie_policy: 'manual',
      seeding: 'high_low',
    },
    compile: {
      source: 'submissions',
      source_rounds: [],
      options: normalizeCompileOptions(undefined, DEFAULT_COMPILE_OPTIONS),
    },
  }
}

export function normalizeRoundDefaults(input: unknown): RoundDefaults {
  const fallback = defaultRoundDefaults()
  const source = asRecord(input)
  const userDefinedSource = asRecord(source.userDefinedData)
  const breakSource = asRecord(source.break)
  const compileSource = asRecord(source.compile)
  const compileOptionsSource =
    compileSource.options && typeof compileSource.options === 'object'
      ? (compileSource.options as CompileOptionsInput)
      : (compileSource as CompileOptionsInput)
  return {
    userDefinedData: {
      evaluate_from_adjudicators: asBoolean(
        userDefinedSource.evaluate_from_adjudicators,
        fallback.userDefinedData.evaluate_from_adjudicators
      ),
      evaluate_from_teams: asBoolean(
        userDefinedSource.evaluate_from_teams,
        fallback.userDefinedData.evaluate_from_teams
      ),
      chairs_always_evaluated: asBoolean(
        userDefinedSource.chairs_always_evaluated,
        fallback.userDefinedData.chairs_always_evaluated
      ),
      evaluator_in_team:
        userDefinedSource.evaluator_in_team === 'speaker'
          ? 'speaker'
          : fallback.userDefinedData.evaluator_in_team,
      no_speaker_score: asBoolean(
        userDefinedSource.no_speaker_score,
        fallback.userDefinedData.no_speaker_score
      ),
      score_by_matter_manner: asBoolean(
        userDefinedSource.score_by_matter_manner,
        fallback.userDefinedData.score_by_matter_manner
      ),
      poi: asBoolean(userDefinedSource.poi, fallback.userDefinedData.poi),
      best: asBoolean(userDefinedSource.best, fallback.userDefinedData.best),
      allow_low_tie_win: asBoolean(
        userDefinedSource.allow_low_tie_win,
        fallback.userDefinedData.allow_low_tie_win
      ),
    },
    break: {
      source: breakSource.source === 'raw' ? 'raw' : fallback.break.source,
      size: asPositiveInt(breakSource.size, fallback.break.size),
      cutoff_tie_policy:
        breakSource.cutoff_tie_policy === 'include_all' || breakSource.cutoff_tie_policy === 'strict'
          ? breakSource.cutoff_tie_policy
          : fallback.break.cutoff_tie_policy,
      seeding: breakSource.seeding === 'high_low' ? 'high_low' : fallback.break.seeding,
    },
    compile: {
      source: compileSource.source === 'raw' ? 'raw' : fallback.compile.source,
      source_rounds: asRoundList(compileSource.source_rounds),
      options: normalizeCompileOptions(compileOptionsSource, fallback.compile.options),
    },
  }
}

export function serializeRoundDefaults(defaults: RoundDefaults): RoundDefaults {
  return normalizeRoundDefaults(defaults)
}

export function buildRoundUserDefinedFromDefaults(defaults: RoundDefaults) {
  const normalized = normalizeRoundDefaults(defaults)
  return {
    ...normalized.userDefinedData,
    hidden: false,
    break: {
      enabled: false,
      source: normalized.break.source,
      source_rounds: [],
      size: normalized.break.size,
      cutoff_tie_policy: normalized.break.cutoff_tie_policy,
      seeding: normalized.break.seeding,
      participants: [],
    },
    compile: {
      source: normalized.compile.source,
      source_rounds: [...normalized.compile.source_rounds],
      options: normalizeCompileOptions(normalized.compile.options, normalized.compile.options),
    },
  }
}
