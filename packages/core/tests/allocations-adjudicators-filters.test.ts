import { describe, it, expect } from 'vitest'
import {
  filterByRandom,
  filterByStrength,
  filterByAttendance,
  filterByPast,
  filterByConflictGroup,
  filterByConflictTeam,
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
    details: [{ r: 1, conflicts: [1], conflict_teams: [1] }],
  }
  const adjudicatorB = {
    id: 2,
    preev: 40,
    details: [{ r: 1, conflicts: [2], conflict_teams: [2] }],
  }

  const square1 = { id: 0, teams: [1, 2] }
  const square2 = { id: 1, teams: [3, 4] }
  const bubbleSquare = { id: 2, teams: [4, 5] }
  const topSquare = { id: 3, teams: [1, 2] }
  const teams = [
    { id: 1, details: [{ r: 1, conflicts: [1] }] },
    { id: 2, details: [{ r: 1, conflicts: [3] }] },
    { id: 3, details: [{ r: 1, conflicts: [2] }] },
    { id: 4, details: [{ r: 1, conflicts: [4] }] },
  ]
  const compiledTeamResults = [
    { id: 1, win: 4, sum: 320, margin: 40 },
    { id: 2, win: 4, sum: 315, margin: 35 },
    { id: 3, win: 3, sum: 305, margin: 28 },
    { id: 4, win: 3, sum: 300, margin: 24 },
    { id: 5, win: 2, sum: 290, margin: 16 },
    { id: 6, win: 2, sum: 286, margin: 14 },
    { id: 7, win: 1, sum: 272, margin: 5 },
    { id: 8, win: 1, sum: 268, margin: 2 },
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
      filterByConflictGroup(adjudicatorA, square1, square2, {
        teams,
        r: 1,
      })
    ).toBe(1)
  })

  it('filters by institution conflict priorities when provided', () => {
    const adjudicatorC = {
      id: 3,
      preev: 60,
      details: [{ r: 1, conflicts: [1, 2], conflict_teams: [] }],
    }
    expect(
      filterByConflictGroup(adjudicatorC, square1, square2, {
        teams,
        r: 1,
        config: {
          institution_priority_map: {
            1: 1,
            2: 3,
          },
        },
      })
    ).toBe(1)
  })

  it('filters by explicit conflicts', () => {
    expect(
      filterByConflictTeam(adjudicatorA, square1, square2, {
        r: 1,
      })
    ).toBe(1)
  })

  it('prioritizes stronger adjudicators for bubble rooms', () => {
    expect(
      filterByBubble(bubbleSquare, adjudicatorA, adjudicatorB, {
        compiled_team_results: compiledTeamResults,
        compiled_adjudicator_results: compiledAdjudicatorResults,
        config,
      })
    ).toBe(-1)
  })

  it('prefers weaker adjudicators for non-bubble extreme rooms', () => {
    expect(
      filterByBubble(topSquare, adjudicatorA, adjudicatorB, {
        compiled_team_results: compiledTeamResults,
        compiled_adjudicator_results: compiledAdjudicatorResults,
        config,
      })
    ).toBe(1)
  })
})
