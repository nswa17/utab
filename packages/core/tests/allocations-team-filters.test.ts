import { describe, it, expect } from 'vitest'
import {
  filterByRandom,
  filterBySide,
  filterByConflictGroup,
  filterByPastOpponent,
  filterBySiblingPastOpponentSchool,
  filterByStrength,
} from '../src/allocations/teams/filters.js'

describe('allocations/teams/filters', () => {
  const compiledTeamResults = [
    { id: 1, win: 3, sum: 15, past_sides: ['gov', 'gov'], past_opponents: [2] },
    { id: 2, win: 0, sum: 0, past_sides: ['opp', 'opp'], past_opponents: [1] },
    { id: 3, win: 2, sum: 10, past_sides: ['gov', 'opp'], past_opponents: [] },
  ]

  const team = { id: 1, details: [{ r: 1, conflicts: [1, 2] }] }
  const a = { id: 2, details: [{ r: 1, conflicts: [1] }] }
  const b = { id: 3, details: [{ r: 1, conflicts: [3] }] }

  it('filters by random deterministic order', () => {
    expect(filterByRandom(team, a, b, { r: 1 })).toBe(-1)
  })

  it('filters by side balance', () => {
    expect(filterBySide(team, a, b, { compiled_team_results: compiledTeamResults, r: 1 })).toBe(-1)
  })

  it('filters by institution overlap', () => {
    expect(filterByConflictGroup(team, a, b, { r: 1 })).toBe(1)
  })

  it('prioritizes lower numeric conflict priority over multiple lower-importance overlaps', () => {
    const compared = filterByConflictGroup(
      { id: 10, details: [{ r: 1, conflicts: [1, 2, 3] }] },
      { id: 11, details: [{ r: 1, conflicts: [1] }] },
      { id: 12, details: [{ r: 1, conflicts: [2, 3] }] },
      {
        r: 1,
        config: {
          institution_priority_map: {
            1: 1,
            2: 2,
            3: 2,
          },
        },
      }
    )
    expect(compared).toBe(1)
  })

  it('filters by past opponent', () => {
    expect(filterByPastOpponent(team, a, b, { compiled_team_results: compiledTeamResults })).toBe(1)
  })

  it('avoids schools that sibling teams have already faced', () => {
    const teams = [
      { id: 1, details: [{ r: 1, conflicts: [1] }] },
      { id: 2, details: [{ r: 1, conflicts: [1] }] },
      { id: 3, details: [{ r: 1, conflicts: [2] }] },
      { id: 4, details: [{ r: 1, conflicts: [3] }] },
    ]
    const compiled = [
      { id: 1, win: 3, sum: 15, past_sides: [], past_opponents: [] },
      { id: 2, win: 3, sum: 14, past_sides: [], past_opponents: [3] },
      { id: 3, win: 2, sum: 11, past_sides: [], past_opponents: [2] },
      { id: 4, win: 2, sum: 10, past_sides: [], past_opponents: [] },
    ]
    const compared = filterBySiblingPastOpponentSchool(teams[0], teams[2], teams[3], {
      teams,
      compiled_team_results: compiled,
      r: 1,
      config: {
        institution_category_map: {
          1: 'institution',
          2: 'institution',
          3: 'institution',
        },
      },
    })
    expect(compared).toBe(1)
  })

  it('filters by strength', () => {
    expect(filterByStrength(team, a, b, { compiled_team_results: compiledTeamResults })).toBe(1)
  })
})
