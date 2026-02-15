import { describe, expect, it } from 'vitest'
import { powerpair } from '../src/allocations/teams.js'

describe('allocations/teams/powerpair', () => {
  it('creates bracketed pairings and records pullup metadata', () => {
    const teams = [
      { id: 1, details: [{ r: 1, available: true, institutions: [1], speakers: [] }] },
      { id: 2, details: [{ r: 1, available: true, institutions: [1], speakers: [] }] },
      { id: 3, details: [{ r: 1, available: true, institutions: [2], speakers: [] }] },
      { id: 4, details: [{ r: 1, available: true, institutions: [2], speakers: [] }] },
      { id: 5, details: [{ r: 1, available: true, institutions: [2], speakers: [] }] },
      { id: 6, details: [{ r: 1, available: true, institutions: [3], speakers: [] }] },
    ]
    const compiledTeamResults = [
      { id: 1, win: 3, sum: 90, margin: 10, past_sides: [], past_opponents: [] },
      { id: 2, win: 3, sum: 85, margin: 5, past_sides: [], past_opponents: [] },
      { id: 3, win: 2, sum: 80, margin: 4, past_sides: [], past_opponents: [] },
      { id: 4, win: 2, sum: 78, margin: 3, past_sides: [], past_opponents: [] },
      { id: 5, win: 2, sum: 76, margin: 2, past_sides: [], past_opponents: [] },
      { id: 6, win: 1, sum: 60, margin: -4, past_sides: [], past_opponents: [] },
    ]
    const config = {
      name: 'seeded-open',
      style: { team_num: 2 },
      institution_priority_map: { 1: 1, 2: 1, 3: 1 },
    }

    const draw = powerpair.get(
      1,
      teams,
      compiledTeamResults,
      {
        odd_bracket: 'pullup_top',
        pairing_method: 'fold',
        avoid_conflicts: 'off',
      },
      config
    )

    expect(draw.allocation).toHaveLength(3)
    expect(draw.allocation.map((row: any) => row.teams)).toEqual([
      [1, 2],
      [3, 6],
      [4, 5],
    ])
    expect(draw.user_defined_data?.powerpair?.pullups).toHaveLength(1)
    expect(draw.user_defined_data?.powerpair?.pullups?.[0]).toMatchObject({
      team_id: 6,
      from_points: 1,
      to_points: 2,
    })
  })

  it('applies one-up-one-down swaps to reduce adjacent conflicts', () => {
    const teams = [
      { id: 1, details: [{ r: 1, available: true, institutions: [1], speakers: [] }] },
      { id: 2, details: [{ r: 1, available: true, institutions: [2], speakers: [] }] },
      { id: 3, details: [{ r: 1, available: true, institutions: [1], speakers: [] }] },
      { id: 4, details: [{ r: 1, available: true, institutions: [2], speakers: [] }] },
    ]
    const compiledTeamResults = [
      { id: 1, win: 2, sum: 40, margin: 5, past_sides: [], past_opponents: [] },
      { id: 2, win: 2, sum: 39, margin: 4, past_sides: [], past_opponents: [] },
      { id: 3, win: 2, sum: 38, margin: 3, past_sides: [], past_opponents: [] },
      { id: 4, win: 2, sum: 37, margin: 2, past_sides: [], past_opponents: [] },
    ]
    const config = {
      name: 'conflict-open',
      style: { team_num: 2 },
      institution_priority_map: { 1: 1, 2: 1 },
    }

    const draw = powerpair.get(
      1,
      teams,
      compiledTeamResults,
      {
        pairing_method: 'slide',
        avoid_conflicts: 'one_up_one_down',
        max_swap_iterations: 8,
      },
      config
    )

    draw.allocation.forEach((row: any) => {
      const left = teams.find((team) => team.id === row.teams[0])?.details?.[0]?.institutions?.[0]
      const right = teams.find((team) => team.id === row.teams[1])?.details?.[0]?.institutions?.[0]
      expect(left).not.toBe(right)
    })
  })

  it('rejects non two-team styles', () => {
    const teams = [
      { id: 1, details: [{ r: 1, available: true, institutions: [], speakers: [] }] },
      { id: 2, details: [{ r: 1, available: true, institutions: [], speakers: [] }] },
      { id: 3, details: [{ r: 1, available: true, institutions: [], speakers: [] }] },
      { id: 4, details: [{ r: 1, available: true, institutions: [], speakers: [] }] },
    ]
    const compiledTeamResults = teams.map((team) => ({
      id: team.id,
      win: 0,
      sum: 0,
      margin: 0,
      past_sides: [],
      past_opponents: [],
    }))

    expect(() =>
      powerpair.get(
        1,
        teams,
        compiledTeamResults,
        {},
        { name: 'bp-open', style: { team_num: 4 }, institution_priority_map: {} }
      )
    ).toThrow('powerpair supports only style.team_num=2')
  })
})
