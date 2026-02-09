import { describe, it, expect } from 'vitest'
import { galeShapley } from '../src/allocations/adjudicators/matchings.js'

describe('allocations/adjudicators/matchings', () => {
  it('produces stable matching with cap=1', () => {
    const gs = [1, 2]
    const as = [10, 11, 12]
    const gRanks = {
      1: [10, 11, 12],
      2: [10, 11, 12],
    }
    const aRanks = {
      10: [2, 1],
      11: [1, 2],
      12: [1, 2],
    }
    const matching = galeShapley(gs, as, gRanks, aRanks, 1)
    expect(matching[1]).toEqual([11])
    expect(matching[2]).toEqual([10])
  })

  it('returns empty matches when cap is zero', () => {
    const matching = galeShapley([1], [10], { 1: [10] }, { 10: [1] }, 0)
    expect(matching[1]).toEqual([])
  })

  it('throws when gs size exceeds as size', () => {
    expect(() =>
      galeShapley([1, 2, 3], [10], { 1: [10], 2: [10], 3: [10] }, { 10: [1, 2, 3] })
    ).toThrow()
  })
})
