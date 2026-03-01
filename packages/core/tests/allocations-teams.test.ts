import { describe, it, expect } from 'vitest'
import { standard } from '../src/allocations/teams.js'
import { filterByConflictGroup } from '../src/allocations/teams/filters.js'

describe('allocations/teams', () => {
  it('creates a draw allocation for two teams', () => {
    const teams = [
      {
        id: 1,
        details: [{ r: 1, available: true, conflicts: [1], speakers: [] }],
      },
      {
        id: 2,
        details: [{ r: 1, available: true, conflicts: [2], speakers: [] }],
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
      details: [{ r: 1, conflicts: [1, 2] }],
    }
    const candidateA = {
      id: 11,
      details: [{ r: 1, conflicts: [1] }],
    }
    const candidateB = {
      id: 12,
      details: [{ r: 1, conflicts: [2] }],
    }
    const compared = filterByConflictGroup(baseTeam, candidateA, candidateB, {
      r: 1,
      config: {
        institution_priority_map: {
          1: 1,
          2: 4,
        },
      },
    })
    expect(compared).toBe(1)
  })

  it('optionally spreads Gov/Opp assignments across teams from the same school', () => {
    const teams = [
      { id: 1, details: [{ r: 1, available: true, conflicts: [1], speakers: [] }] },
      { id: 2, details: [{ r: 1, available: true, conflicts: [1], speakers: [] }] },
      { id: 3, details: [{ r: 1, available: true, conflicts: [2], speakers: [] }] },
      { id: 4, details: [{ r: 1, available: true, conflicts: [3], speakers: [] }] },
    ]
    const compiledTeamResults = [
      { id: 1, win: 3, sum: 30, past_sides: ['opp', 'opp', 'opp'], past_opponents: [2, 3, 4] },
      { id: 2, win: 2, sum: 20, past_sides: ['opp', 'opp', 'opp'], past_opponents: [1, 3, 4] },
      { id: 3, win: 3, sum: 29, past_sides: ['gov', 'opp'], past_opponents: [1, 2] },
      { id: 4, win: 2, sum: 19, past_sides: ['gov', 'opp'], past_opponents: [1, 2] },
    ]
    const config = {
      style: { team_num: 2 },
      institution_category_map: { 1: 'institution', 2: 'institution', 3: 'institution' },
    }

    const withoutSpread = standard.get(
      1,
      teams,
      compiledTeamResults,
      { filters: ['by_strength'], method: 'straight', spread_sides_by_school: false },
      config
    )
    const withSpread = standard.get(
      1,
      teams,
      compiledTeamResults,
      { filters: ['by_strength'], method: 'straight', spread_sides_by_school: true },
      config
    )

    const sideByTeamWithout = new Map<number, 'gov' | 'opp'>()
    withoutSpread.allocation.forEach((row) => {
      sideByTeamWithout.set(row.teams[0], 'gov')
      sideByTeamWithout.set(row.teams[1], 'opp')
    })
    const sideByTeamWith = new Map<number, 'gov' | 'opp'>()
    withSpread.allocation.forEach((row) => {
      sideByTeamWith.set(row.teams[0], 'gov')
      sideByTeamWith.set(row.teams[1], 'opp')
    })

    const sameSchoolTeamIds = [1, 2]
    const withoutGov = sameSchoolTeamIds.filter((id) => sideByTeamWithout.get(id) === 'gov').length
    const withGov = sameSchoolTeamIds.filter((id) => sideByTeamWith.get(id) === 'gov').length

    expect(withoutGov).toBe(2)
    expect(withGov).toBe(1)
  })
})
