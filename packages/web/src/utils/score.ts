export type ScoreRange = {
  from: number
  to: number
  unit: number
  default: number
}

const DEFAULT_SPEAKER_RANGE: ScoreRange = {
  from: 0,
  to: 100,
  unit: 1,
  default: 75,
}

const DEFAULT_ADJUDICATOR_RANGE: ScoreRange = {
  from: 0,
  to: 10,
  unit: 1,
  default: 5,
}

type RangeWithOrder = ScoreRange & { order: number }

function toNumber(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : fallback
}

function normalizeRangeValue(value: any, fallback: ScoreRange): ScoreRange | null {
  if (!value || typeof value !== 'object') return null
  return {
    from: toNumber(value.from, fallback.from),
    to: toNumber(value.to, fallback.to),
    unit: toNumber(value.unit, fallback.unit),
    default: toNumber(value.default, fallback.default),
  }
}

export function normalizeScoreRanges(
  input: unknown,
  fallback: ScoreRange = DEFAULT_SPEAKER_RANGE
): ScoreRange[] {
  if (!Array.isArray(input)) return []

  const normalized = input
    .map((entry, index) => {
      if (entry && typeof entry === 'object' && 'value' in entry) {
        const value = normalizeRangeValue((entry as any).value, fallback)
        if (!value) return null
        return {
          ...value,
          order: toNumber((entry as any).order, index + 1),
        }
      }
      const value = normalizeRangeValue(entry, fallback)
      if (!value) return null
      return { ...value, order: index + 1 }
    })
    .filter((entry): entry is RangeWithOrder => Boolean(entry))
    .sort((a, b) => a.order - b.order)

  return normalized.map(({ order: _order, ...range }) => range)
}

export function normalizeSingleRange(
  input: unknown,
  fallback: ScoreRange = DEFAULT_ADJUDICATOR_RANGE
): ScoreRange {
  const normalized = normalizeRangeValue(input, fallback)
  return normalized ?? fallback
}

export function getRangeForIndex(
  ranges: ScoreRange[],
  index: number,
  fallback: ScoreRange = DEFAULT_SPEAKER_RANGE
): ScoreRange {
  if (ranges.length === 0) return fallback
  if (index < ranges.length) return ranges[index]
  return ranges[ranges.length - 1] ?? fallback
}

export const defaultSpeakerRange = DEFAULT_SPEAKER_RANGE
export const defaultAdjudicatorRange = DEFAULT_ADJUDICATOR_RANGE
