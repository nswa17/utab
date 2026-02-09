import { describe, it, expect } from 'vitest'
import { strictMatching } from '../src/allocations/teams/strict_matchings.js'

describe('allocations/teams/strict_matchings', () => {
  it('returns empty object when no teams are provided', () => {
    const result = strictMatching([], [], { style: { team_num: 2 } })
    expect(result).toEqual({})
  })

  it('returns matchings for available teams', () => {
    const teams = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
    const compiledTeamResults = [
      { id: 1, win: 2, past_sides: ['gov'] },
      { id: 2, win: 2, past_sides: ['opp'] },
      { id: 3, win: 1, past_sides: ['gov'] },
      { id: 4, win: 1, past_sides: ['opp'] },
    ]
    const config = { name: 'seed', style: { team_num: 2 } }
    const result = strictMatching(teams, compiledTeamResults, config, {
      pairing_method: 'sort',
      pullup_method: 'fromtop',
      position_method: 'adjusted',
      avoid_conflict: false,
    })
    expect(Array.isArray(result)).toBe(true)
    const matches = result as number[][]
    expect(matches).toHaveLength(2)
    matches.forEach((match) => expect(match).toHaveLength(2))
  })
})
