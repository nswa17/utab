import { describe, it, expect } from 'vitest'
import { standard } from '../src/allocations/teams.js'
import { filterByInstitution } from '../src/allocations/teams/filters.js'

describe('allocations/teams', () => {
  it('creates a draw allocation for two teams', () => {
    const teams = [
      {
        id: 1,
        details: [{ r: 1, available: true, institutions: [1], speakers: [] }],
      },
      {
        id: 2,
        details: [{ r: 1, available: true, institutions: [2], speakers: [] }],
      },
    ]

    const compiledTeamResults = [
      {
        id: 1,
        win: 2,
        sum: 10,
        past_sides: ['gov', 'gov'],
        past_opponents: [2, 2],
      },
      {
        id: 2,
        win: 0,
        sum: 0,
        past_sides: ['opp', 'opp'],
        past_opponents: [1, 1],
      },
    ]

    const config = { style: { team_num: 2 } }

    const draw = standard.get(1, teams, compiledTeamResults, {}, config)
    expect(draw.r).toBe(1)
    expect(draw.allocation).toHaveLength(1)
    expect(draw.allocation[0].teams).toEqual([2, 1])
  })

  it('uses institution priorities when comparing institution conflicts', () => {
    const baseTeam = {
      id: 10,
      details: [{ r: 1, institutions: [1, 2] }],
    }
    const candidateA = {
      id: 11,
      details: [{ r: 1, institutions: [1] }],
    }
    const candidateB = {
      id: 12,
      details: [{ r: 1, institutions: [2] }],
    }
    const compared = filterByInstitution(baseTeam, candidateA, candidateB, {
      r: 1,
      config: {
        institution_priority_map: {
          1: 1,
          2: 4,
        },
      },
    })
    expect(compared).toBe(-1)
  })
})
