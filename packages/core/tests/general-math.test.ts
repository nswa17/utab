import seedrandom from 'seedrandom'
import { describe, it, expect } from 'vitest'
import {
  sum,
  average,
  adjustedAverage,
  countCommon,
  combinations,
  setMinus,
  shuffle,
} from '../src/general/math.js'

function referenceShuffle<T>(list: T[], seed?: string): T[] {
  const array = [...list]
  const rng = seedrandom(seed)
  let n = array.length
  while (n) {
    const i = Math.floor(rng() * n--)
    const t = array[n]
    array[n] = array[i]
    array[i] = t
  }
  return array
}

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

  it('uses successive seeded random values while shuffling', () => {
    const list = [1, 2, 3, 4, 5, 6]
    expect(shuffle(list, 'math-seed-1')).toEqual(referenceShuffle(list, 'math-seed-1'))
    expect(shuffle(list, 'math-seed-2')).toEqual(referenceShuffle(list, 'math-seed-2'))
  })
})
