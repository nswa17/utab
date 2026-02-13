export type RankingTrend = 'improved' | 'worsened' | 'unchanged' | 'new' | 'na'

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function resolveRankingTrend(value: unknown): RankingTrend {
  if (value === 'improved' || value === 'worsened' || value === 'unchanged' || value === 'new') {
    return value
  }
  return 'na'
}

export function rankingTrendSymbol(trend: RankingTrend): string {
  if (trend === 'improved') return '▲'
  if (trend === 'worsened') return '▼'
  if (trend === 'unchanged') return '◆'
  if (trend === 'new') return '＋'
  return '・'
}

export function formatSignedDelta(value: unknown): string {
  const numeric = toFiniteNumber(value)
  if (numeric === null || numeric === 0) return ''
  const rounded = Math.round(numeric * 1000) / 1000
  return rounded > 0 ? `+${rounded}` : String(rounded)
}
