import { describe, expect, it } from 'vitest'
import {
  defaultAdjudicatorRange,
  defaultSpeakerRange,
  getRangeForIndex,
  normalizeScoreRanges,
  normalizeSingleRange,
} from './score'

describe('score utils', () => {
  it('normalizes ordered ranges', () => {
    const input = [
      { order: 2, value: { from: 1, to: 10, unit: 1, default: 5 } },
      { order: 1, value: { from: 60, to: 90, unit: 1, default: 75 } },
    ]
    const ranges = normalizeScoreRanges(input, defaultSpeakerRange)
    expect(ranges).toHaveLength(2)
    expect(ranges[0].from).toBe(60)
    expect(ranges[1].from).toBe(1)
  })

  it('uses fallback when values are missing', () => {
    const ranges = normalizeScoreRanges([{}], defaultSpeakerRange)
    expect(ranges[0]).toEqual(defaultSpeakerRange)
  })

  it('normalizes single range', () => {
    const range = normalizeSingleRange({ from: 2, to: 8, unit: 0.5, default: 4 }, defaultAdjudicatorRange)
    expect(range).toEqual({ from: 2, to: 8, unit: 0.5, default: 4 })
  })

  it('gets range for index with fallback', () => {
    const ranges = normalizeScoreRanges([{ value: { from: 1, to: 5, unit: 1, default: 3 } }])
    const range = getRangeForIndex(ranges, 2, defaultSpeakerRange)
    expect(range).toEqual({ from: 1, to: 5, unit: 1, default: 3 })
  })
})
