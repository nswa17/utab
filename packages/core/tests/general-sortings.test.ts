import { describe, it, expect } from 'vitest'
import {
  teamComparer,
  allocationSlightnessComparer,
  evaluateAdjudicator,
  sortAdjudicatorsWithPreev,
} from '../src/general/sortings.js'

describe('general/sortings', () => {
  it('orders teams by win, sum, and margin', () => {
    const results = [
      { id: 1, win: 1, sum: 100, margin: 10 },
      { id: 2, win: 2, sum: 80, margin: 5 },
      { id: 3, win: 1, sum: 90, margin: 20 },
      { id: 4, win: 1, sum: 90, margin: 5 },
    ]
    expect(teamComparer(results, 1, 2)).toBe(1)
    expect(teamComparer(results, 1, 3)).toBe(-1)
    expect(teamComparer(results, 3, 4)).toBe(-1)
  })

  it('prefers allocations with lower slightness', () => {
    const compiled = [
      { id: 1, win: 3, sum: 100 },
      { id: 2, win: 3, sum: 95 },
      { id: 3, win: 1, sum: 50 },
      { id: 4, win: 0, sum: 30 },
    ]
    const s1 = { id: 0, teams: [1, 2] }
    const s2 = { id: 1, teams: [3, 4] }
    expect(allocationSlightnessComparer(compiled, s1, s2)).toBe(1)
  })

  it('evaluates adjudicator with preev weights', () => {
    const compiled = [{ id: 1, details: [{ score: 80 }, { score: 70 }] }]
    const score = evaluateAdjudicator({ id: 1, preev: 50 }, compiled, [0.2])
    expect(score).toBe(70)
  })

  it('sorts adjudicators with preev and results', () => {
    const adjudicators = [
      { id: 1, preev: 10 },
      { id: 2, preev: 90 },
    ]
    const compiled = [
      { id: 1, details: [{ score: 30 }] },
      { id: 2, details: [{ score: 60 }] },
    ]
    const sorted = sortAdjudicatorsWithPreev(adjudicators, compiled, [0.5])
    expect(sorted.map((a) => a.id)).toEqual([2, 1])
  })
})
