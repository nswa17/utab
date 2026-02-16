import { toFiniteNumber, type RankingTrend } from './diff-indicator'

type DiffMetric = {
  baseline: number | null
  delta: number | null
}

type RowDiff = {
  ranking: {
    baseline?: number
    delta?: number
    trend: RankingTrend
  }
  metrics: Record<string, DiffMetric>
}

const IGNORE_METRIC_KEYS = new Set([
  'id',
  'name',
  'institutions',
  'comments',
  'teams',
  'judged_teams',
  'details',
  'diff',
  'r',
  'round',
  '_id',
  'createdAt',
  'updatedAt',
])

function toRounded(value: number): number {
  return Math.round(value * 1000) / 1000
}

function rankingDiff(currentRow: Record<string, unknown>, baselineRow: Record<string, unknown> | null): RowDiff['ranking'] {
  const current = toFiniteNumber(currentRow.ranking)
  if (!baselineRow) {
    return {
      trend: current === null ? 'na' : 'new',
    }
  }
  const baseline = toFiniteNumber(baselineRow.ranking)
  if (current === null && baseline === null) return { trend: 'na' }
  if (current !== null && baseline === null) return { trend: 'new' }
  if (current === null && baseline !== null) return { baseline, trend: 'na' }
  const delta = toRounded((baseline as number) - (current as number))
  const trend: RankingTrend = delta > 0 ? 'improved' : delta < 0 ? 'worsened' : 'unchanged'
  return {
    baseline: baseline as number,
    delta,
    trend,
  }
}

function metricDiff(
  currentRow: Record<string, unknown>,
  baselineRow: Record<string, unknown> | null
): Record<string, DiffMetric> {
  if (!baselineRow) return {}
  const keys = new Set<string>([
    ...Object.keys(currentRow),
    ...Object.keys(baselineRow),
  ])
  const metrics: Record<string, DiffMetric> = {}
  keys.forEach((key) => {
    if (key === 'ranking' || IGNORE_METRIC_KEYS.has(key)) return
    const current = toFiniteNumber(currentRow[key])
    const baseline = toFiniteNumber(baselineRow[key])
    if (current === null && baseline === null) return
    metrics[key] = {
      baseline,
      delta:
        current !== null && baseline !== null ? toRounded(current - baseline) : null,
    }
  })
  return metrics
}

export function applyClientBaselineDiff<T extends Record<string, unknown>>(
  currentRows: T[],
  baselineRows: Array<Record<string, unknown>>
): Array<T & { diff: RowDiff }> {
  const baselineById = new Map<string, Record<string, unknown>>()
  baselineRows.forEach((row) => {
    const id = String(row?.id ?? '').trim()
    if (!id) return
    baselineById.set(id, row)
  })
  return currentRows.map((row) => {
    const id = String(row?.id ?? '').trim()
    const baselineRow = id ? baselineById.get(id) ?? null : null
    const diff: RowDiff = {
      ranking: rankingDiff(row, baselineRow),
      metrics: metricDiff(row, baselineRow),
    }
    return {
      ...row,
      diff,
    }
  })
}
