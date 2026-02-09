import { describe, it, expect } from 'vitest'
import {
  filterByRandom,
  filterByStrength,
  filterByAttendance,
  filterByPast,
  filterByInstitution,
  filterByConflict,
  filterByBubble,
} from '../src/allocations/adjudicators/adjfilters.js'

describe('allocations/adjudicators/adjfilters', () => {
  const compiledAdjudicatorResults = [
    { id: 1, active_num: 3, judged_teams: [1, 2], details: [{ score: 80 }] },
    { id: 2, active_num: 1, judged_teams: [2], details: [{ score: 50 }] },
  ]
  const config = { preev_weights: [0.5] }

  const adjudicatorA = {
    id: 1,
    preev: 70,
    details: [{ r: 1, institutions: [1], conflicts: [1] }],
  }
  const adjudicatorB = {
    id: 2,
    preev: 40,
    details: [{ r: 1, institutions: [2], conflicts: [2] }],
  }

  const square1 = { id: 0, teams: [1, 2] }
  const square2 = { id: 1, teams: [3, 4] }
  const teams = [
    { id: 1, details: [{ r: 1, institutions: [1] }] },
    { id: 2, details: [{ r: 1, institutions: [3] }] },
    { id: 3, details: [{ r: 1, institutions: [2] }] },
    { id: 4, details: [{ r: 1, institutions: [4] }] },
  ]

  it('filters by random deterministic order', () => {
    expect(filterByRandom(square1, adjudicatorA, adjudicatorB, { r: 1 })).toBe(-1)
  })

  it('filters by strength using preev weights', () => {
    expect(
      filterByStrength(square1, adjudicatorA, adjudicatorB, {
        compiled_adjudicator_results: compiledAdjudicatorResults,
        config,
      })
    ).toBe(-1)
  })

  it('filters by attendance', () => {
    expect(
      filterByAttendance(square1, adjudicatorA, adjudicatorB, {
        compiled_adjudicator_results: compiledAdjudicatorResults,
      })
    ).toBe(1)
  })

  it('filters by past teams judged', () => {
    expect(
      filterByPast(adjudicatorA, square1, square2, {
        compiled_adjudicator_results: compiledAdjudicatorResults,
      })
    ).toBe(1)
  })

  it('filters by institution conflicts', () => {
    expect(
      filterByInstitution(adjudicatorA, square1, square2, {
        teams,
        r: 1,
      })
    ).toBe(1)
  })

  it('filters by explicit conflicts', () => {
    expect(
      filterByConflict(adjudicatorA, square1, square2, {
        r: 1,
      })
    ).toBe(1)
  })

  it('returns neutral for bubble filter', () => {
    expect(filterByBubble(square1, adjudicatorA, adjudicatorB, {})).toBe(0)
  })
})
