import { describe, it, expect } from 'vitest'
import {
  sum,
  average,
  adjustedAverage,
  countCommon,
  combinations,
  setMinus,
} from '../src/general/math.js'

describe('general/math', () => {
  it('computes sums and averages', () => {
    expect(sum([1, 2, 3])).toBe(6)
    expect(average([])).toBe(0)
    expect(adjustedAverage([1, null, 3])).toBe(2)
  })

  it('counts common elements', () => {
    expect(countCommon([1, 2, 2], [2, 3])).toBe(2)
  })

  it('creates combinations and set minus', () => {
    expect(combinations([1, 2, 3], 2)).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ])
    expect(setMinus([1, 2, 3], [2, 4])).toEqual([1, 3])
  })
})
