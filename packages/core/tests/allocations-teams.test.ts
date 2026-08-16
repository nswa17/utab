import { describe, it, expect } from 'vitest'
import { standard, min_warnings } from '../src/allocations/teams.js'
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

  it('minimizes selected warning counts for two-team pairings', () => {
    const teams = [
      { id: 1, details: [{ r: 1, available: true, conflicts: [1], speakers: [] }] },
      { id: 2, details: [{ r: 1, available: true, conflicts: [2], speakers: [] }] },
      { id: 3, details: [{ r: 1, available: true, conflicts: [3], speakers: [] }] },
      { id: 4, details: [{ r: 1, available: true, conflicts: [4], speakers: [] }] },
    ]
    const compiledTeamResults = [
      { id: 1, win: 1, sum: 20, past_sides: ['gov'], past_opponents: [2] },
      { id: 2, win: 1, sum: 19, past_sides: ['opp'], past_opponents: [1] },
      { id: 3, win: 0, sum: 15, past_sides: ['gov'], past_opponents: [] },
      { id: 4, win: 0, sum: 14, past_sides: ['opp'], past_opponents: [] },
    ]
    const config = { style: { team_num: 2 } }

    const draw = min_warnings.get(
      1,
      teams,
      compiledTeamResults,
      { filters: ['by_past_opponent', 'by_strength'] },
      config
    )

    expect(draw.allocation).toHaveLength(2)
    expect(draw.allocation.some((row) => row.teams.includes(1) && row.teams.includes(2))).toBe(
      false
    )
  })

  it('avoids repeating a school pairing across sibling teams', () => {
    const teams = [
      { id: 1, details: [{ r: 1, available: true, conflicts: [1], speakers: [] }] },
      { id: 2, details: [{ r: 1, available: true, conflicts: [1], speakers: [] }] },
      { id: 3, details: [{ r: 1, available: true, conflicts: [2], speakers: [] }] },
      { id: 4, details: [{ r: 1, available: true, conflicts: [2], speakers: [] }] },
      { id: 5, details: [{ r: 1, available: true, conflicts: [3], speakers: [] }] },
      { id: 6, details: [{ r: 1, available: true, conflicts: [3], speakers: [] }] },
      { id: 7, details: [{ r: 1, available: true, conflicts: [4], speakers: [] }] },
      { id: 8, details: [{ r: 1, available: true, conflicts: [4], speakers: [] }] },
    ]
    const compiledTeamResults = teams.map((team) => ({
      id: team.id,
      win: 1,
      sum: 10,
      past_sides: [],
      past_opponents: team.id === 1 ? [3] : team.id === 3 ? [1] : [],
    }))

    const draw = min_warnings.get(
      1,
      teams,
      compiledTeamResults,
      { filters: ['by_conflict_group', 'by_sibling_past_opponent_school'] },
      {
        style: { team_num: 2 },
        institution_category_map: {
          1: 'institution',
          2: 'institution',
          3: 'institution',
          4: 'institution',
        },
      }
    )

    const schoolByTeam = new Map(teams.map((team) => [team.id, team.details[0].conflicts[0]]))
    draw.allocation.forEach((row) => {
      const schoolA = schoolByTeam.get(row.teams[0])
      const schoolB = schoolByTeam.get(row.teams[1])
      expect(schoolA).not.toBe(schoolB)
      expect(new Set([schoolA, schoolB])).not.toEqual(new Set([1, 2]))
    })
  })

  it('avoids repeated school pairings in a 34-team field', () => {
    const schoolCount = 17
    const teams = Array.from({ length: schoolCount * 2 }, (_, index) => ({
      id: index + 1,
      details: [
        {
          r: 1,
          available: true,
          conflicts: [Math.floor(index / 2) + 1],
          speakers: [],
        },
      ],
    }))
    const pastOpponents = new Map<number, number[]>()
    const forbiddenSchoolPairs = new Set<string>()
    for (let school = 1; school <= schoolCount; school += 1) {
      const nextSchool = school === schoolCount ? 1 : school + 1
      const teamId = (school - 1) * 2 + 1
      const nextTeamId = (nextSchool - 1) * 2 + 1
      pastOpponents.set(teamId, [...(pastOpponents.get(teamId) ?? []), nextTeamId])
      pastOpponents.set(nextTeamId, [...(pastOpponents.get(nextTeamId) ?? []), teamId])
      forbiddenSchoolPairs.add([school, nextSchool].sort((left, right) => left - right).join('-'))
    }
    const compiledTeamResults = teams.map((team) => ({
      id: team.id,
      win: 1,
      sum: 10,
      past_sides: [],
      past_opponents: pastOpponents.get(team.id) ?? [],
    }))
    const institutionCategoryMap = Object.fromEntries(
      Array.from({ length: schoolCount }, (_, index) => [index + 1, 'institution'])
    )

    const draw = min_warnings.get(
      1,
      teams,
      compiledTeamResults,
      { filters: ['by_conflict_group', 'by_sibling_past_opponent_school'] },
      {
        style: { team_num: 2 },
        institution_category_map: institutionCategoryMap,
      }
    )

    expect(draw.allocation).toHaveLength(17)
    draw.allocation.forEach((row) => {
      const schoolA = Math.floor((row.teams[0] - 1) / 2) + 1
      const schoolB = Math.floor((row.teams[1] - 1) / 2) + 1
      expect(schoolA).not.toBe(schoolB)
      expect(
        forbiddenSchoolPairs.has([schoolA, schoolB].sort((left, right) => left - right).join('-'))
      ).toBe(false)
    })
  })

  it('rejects min_warnings for non-two-team styles', () => {
    expect(() =>
      min_warnings.get(
        1,
        [
          { id: 1, details: [{ r: 1, available: true, conflicts: [], speakers: [] }] },
          { id: 2, details: [{ r: 1, available: true, conflicts: [], speakers: [] }] },
          { id: 3, details: [{ r: 1, available: true, conflicts: [], speakers: [] }] },
          { id: 4, details: [{ r: 1, available: true, conflicts: [], speakers: [] }] },
        ],
        [
          { id: 1, win: 1, sum: 10, past_sides: [], past_opponents: [] },
          { id: 2, win: 1, sum: 10, past_sides: [], past_opponents: [] },
          { id: 3, win: 1, sum: 10, past_sides: [], past_opponents: [] },
          { id: 4, win: 1, sum: 10, past_sides: [], past_opponents: [] },
        ],
        { filters: ['by_strength'] },
        { style: { team_num: 4 } }
      )
    ).toThrow('min_warnings supports only 2-team formats')
  })

  it('rejects min_warnings when the available team count is odd', () => {
    expect(() =>
      min_warnings.get(
        1,
        [
          { id: 1, details: [{ r: 1, available: true, conflicts: [], speakers: [] }] },
          { id: 2, details: [{ r: 1, available: true, conflicts: [], speakers: [] }] },
          { id: 3, details: [{ r: 1, available: true, conflicts: [], speakers: [] }] },
        ],
        [
          { id: 1, win: 1, sum: 10, past_sides: [], past_opponents: [] },
          { id: 2, win: 1, sum: 10, past_sides: [], past_opponents: [] },
          { id: 3, win: 0, sum: 10, past_sides: [], past_opponents: [] },
        ],
        { filters: ['by_strength'] },
        { style: { team_num: 2 } }
      )
    ).toThrow('min_warnings requires an even number of available teams')
  })
})
