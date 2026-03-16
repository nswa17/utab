type AwardKind = 'best' | 'poi'

export type AwardSelectionRange = {
  min: number
  max: number
}

export type AwardSelectionRanges = {
  best: AwardSelectionRange
  poi: AwardSelectionRange
}

export type AwardSelectionValidationRule = AwardSelectionRange & {
  enabled: boolean
}

export type AwardSelectionValidationRules = {
  best: AwardSelectionValidationRule
  poi: AwardSelectionValidationRule
}

export type BallotAwardSelectionInput = {
  bestA?: boolean[] | undefined
  bestB?: boolean[] | undefined
  poiA?: boolean[] | undefined
  poiB?: boolean[] | undefined
}

export type AwardSelectionCountViolation = {
  kind: AwardKind
  count: number
  min: number
  max: number
}

export const DEFAULT_AWARD_SELECTION_RANGES: AwardSelectionRanges = {
  best: {
    min: 1,
    max: 2,
  },
  poi: {
    min: 0,
    max: 2,
  },
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function asNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return fallback
  return parsed
}

function normalizeRange(
  minValue: unknown,
  maxValue: unknown,
  fallback: AwardSelectionRange
): AwardSelectionRange {
  const min = asNonNegativeInt(minValue, fallback.min)
  const max = Math.max(min, asNonNegativeInt(maxValue, fallback.max))
  return { min, max }
}

export function resolveAwardSelectionRanges(userDefinedData: unknown): AwardSelectionRanges {
  const source = asRecord(userDefinedData)
  return {
    best: normalizeRange(
      source.best_min_count,
      source.best_max_count,
      DEFAULT_AWARD_SELECTION_RANGES.best
    ),
    poi: normalizeRange(
      source.poi_min_count,
      source.poi_max_count,
      DEFAULT_AWARD_SELECTION_RANGES.poi
    ),
  }
}

export function buildAwardSelectionUserDefinedData(
  userDefinedData: unknown
): {
  best_min_count: number
  best_max_count: number
  poi_min_count: number
  poi_max_count: number
} {
  const ranges = resolveAwardSelectionRanges(userDefinedData)
  return {
    best_min_count: ranges.best.min,
    best_max_count: ranges.best.max,
    poi_min_count: ranges.poi.min,
    poi_max_count: ranges.poi.max,
  }
}

export function resolveRoundAwardSelectionRules(
  userDefinedData: unknown
): AwardSelectionValidationRules {
  const source = asRecord(userDefinedData)
  const ranges = resolveAwardSelectionRanges(source)
  const noSpeakerScore = source.no_speaker_score === true
  return {
    best: {
      enabled: !noSpeakerScore && source.best !== false,
      ...ranges.best,
    },
    poi: {
      enabled: !noSpeakerScore && source.poi !== false,
      ...ranges.poi,
    },
  }
}

function countSelectedFlags(values: boolean[] | undefined): number {
  if (!Array.isArray(values)) return 0
  return values.reduce((count, value) => count + (value ? 1 : 0), 0)
}

function hasSelectionInput(left: boolean[] | undefined, right: boolean[] | undefined): boolean {
  return Array.isArray(left) || Array.isArray(right)
}

export function validateBallotAwardSelectionCounts(
  input: BallotAwardSelectionInput,
  rules: AwardSelectionValidationRules
): AwardSelectionCountViolation | null {
  const bestCount = countSelectedFlags(input.bestA) + countSelectedFlags(input.bestB)
  if (
    rules.best.enabled &&
    hasSelectionInput(input.bestA, input.bestB) &&
    (bestCount < rules.best.min || bestCount > rules.best.max)
  ) {
    return {
      kind: 'best',
      count: bestCount,
      min: rules.best.min,
      max: rules.best.max,
    }
  }

  const poiCount = countSelectedFlags(input.poiA) + countSelectedFlags(input.poiB)
  if (
    rules.poi.enabled &&
    hasSelectionInput(input.poiA, input.poiB) &&
    (poiCount < rules.poi.min || poiCount > rules.poi.max)
  ) {
    return {
      kind: 'poi',
      count: poiCount,
      min: rules.poi.min,
      max: rules.poi.max,
    }
  }

  return null
}
