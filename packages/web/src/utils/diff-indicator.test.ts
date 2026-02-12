import { describe, expect, it } from 'vitest'
import {
  formatSignedDelta,
  rankingTrendSymbol,
  resolveRankingTrend,
  toFiniteNumber,
} from './diff-indicator'

describe('diff-indicator utilities', () => {
  it('parses finite numbers safely', () => {
    expect(toFiniteNumber(1.25)).toBe(1.25)
    expect(toFiniteNumber('2.5')).toBe(2.5)
    expect(toFiniteNumber('not-number')).toBeNull()
  })

  it('normalizes ranking trend values', () => {
    expect(resolveRankingTrend('improved')).toBe('improved')
    expect(resolveRankingTrend('worsened')).toBe('worsened')
    expect(resolveRankingTrend('unexpected')).toBe('na')
  })

  it('returns symbols for ranking trend', () => {
    expect(rankingTrendSymbol('improved')).toBe('▲')
    expect(rankingTrendSymbol('worsened')).toBe('▼')
    expect(rankingTrendSymbol('unchanged')).toBe('◆')
    expect(rankingTrendSymbol('new')).toBe('＋')
    expect(rankingTrendSymbol('na')).toBe('・')
  })

  it('formats signed deltas', () => {
    expect(formatSignedDelta(2)).toBe('+2')
    expect(formatSignedDelta(-1.2349)).toBe('-1.235')
    expect(formatSignedDelta(0)).toBe('')
    expect(formatSignedDelta(undefined)).toBe('')
  })
})
