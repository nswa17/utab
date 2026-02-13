import { describe, expect, it } from 'vitest'
import { hasDecisiveBallotScores } from './ballot'

describe('ballot utils', () => {
  it('returns false when either side has no finite score', () => {
    expect(hasDecisiveBallotScores([], [75])).toBe(false)
    expect(hasDecisiveBallotScores([75], [])).toBe(false)
    expect(hasDecisiveBallotScores([Number.NaN], [75])).toBe(false)
  })

  it('returns false when totals are tied', () => {
    expect(hasDecisiveBallotScores([75], [75])).toBe(false)
    expect(hasDecisiveBallotScores([40, 35], [30, 45])).toBe(false)
  })

  it('returns true when totals are decisive', () => {
    expect(hasDecisiveBallotScores([76], [75])).toBe(true)
    expect(hasDecisiveBallotScores([40, 36], [30, 45])).toBe(true)
  })
})
