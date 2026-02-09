import { describe, it, expect } from 'vitest'
import {
  filterByRandom,
  filterBySide,
  filterByInstitution,
  filterByPastOpponent,
  filterByStrength,
} from '../src/allocations/teams/filters.js'

describe('allocations/teams/filters', () => {
  const compiledTeamResults = [
    { id: 1, win: 3, sum: 15, past_sides: ['gov', 'gov'], past_opponents: [2] },
    { id: 2, win: 0, sum: 0, past_sides: ['opp', 'opp'], past_opponents: [1] },
    { id: 3, win: 2, sum: 10, past_sides: ['gov', 'opp'], past_opponents: [] },
  ]

  const team = { id: 1, details: [{ r: 1, institutions: [1, 2] }] }
  const a = { id: 2, details: [{ r: 1, institutions: [1] }] }
  const b = { id: 3, details: [{ r: 1, institutions: [3] }] }

  it('filters by random deterministic order', () => {
    expect(filterByRandom(team, a, b, { r: 1 })).toBe(-1)
  })

  it('filters by side balance', () => {
    expect(filterBySide(team, a, b, { compiled_team_results: compiledTeamResults, r: 1 })).toBe(-1)
  })

  it('filters by institution overlap', () => {
    expect(filterByInstitution(team, a, b, { r: 1 })).toBe(1)
  })

  it('filters by past opponent', () => {
    expect(filterByPastOpponent(team, a, b, { compiled_team_results: compiledTeamResults })).toBe(1)
  })

  it('filters by strength', () => {
    expect(filterByStrength(team, a, b, { compiled_team_results: compiledTeamResults })).toBe(1)
  })
})
