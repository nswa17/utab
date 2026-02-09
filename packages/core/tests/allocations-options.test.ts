import { describe, expect, it } from 'vitest'
import { standard as teamStandard, strict as teamStrict } from '../src/allocations/teams.js'
import {
  standard as adjudicatorStandard,
  traditional as adjudicatorTraditional,
} from '../src/allocations/adjudicators.js'

const teams = [
  { id: 1, details: [{ r: 1, available: true, institutions: [1], speakers: [] }] },
  { id: 2, details: [{ r: 1, available: true, institutions: [2], speakers: [] }] },
  { id: 3, details: [{ r: 1, available: true, institutions: [3], speakers: [] }] },
  { id: 4, details: [{ r: 1, available: true, institutions: [4], speakers: [] }] },
]

const compiledTeamResults = [
  { id: 1, win: 3, sum: 300, past_sides: ['gov', 'gov'], past_opponents: [2] },
  { id: 2, win: 2, sum: 285, past_sides: ['opp', 'opp'], past_opponents: [1] },
  { id: 3, win: 1, sum: 260, past_sides: ['gov', 'opp'], past_opponents: [4] },
  { id: 4, win: 0, sum: 240, past_sides: ['opp', 'gov'], past_opponents: [3] },
]

const adjudicators = [
  { id: 10, preev: 90, details: [{ r: 1, available: true, institutions: [], conflicts: [] }] },
  { id: 11, preev: 80, details: [{ r: 1, available: true, institutions: [], conflicts: [] }] },
  { id: 12, preev: 70, details: [{ r: 1, available: true, institutions: [], conflicts: [] }] },
  { id: 13, preev: 60, details: [{ r: 1, available: true, institutions: [], conflicts: [] }] },
]

const compiledAdjudicatorResults = [
  { id: 10, average: 8.5, score: 8.5, active_num: 3, judged_teams: [1], details: [{ score: 8.5 }] },
  { id: 11, average: 8.1, score: 8.1, active_num: 2, judged_teams: [2], details: [{ score: 8.1 }] },
  { id: 12, average: 7.8, score: 7.8, active_num: 1, judged_teams: [3], details: [{ score: 7.8 }] },
  { id: 13, average: 7.4, score: 7.4, active_num: 1, judged_teams: [4], details: [{ score: 7.4 }] },
]

const config = { name: 'options-seed', style: { team_num: 2 }, preev_weights: [0.5, 0.5, 0.5] }

function allocationTeamIds(draw: { allocation: Array<{ teams: number[] }> }) {
  return draw.allocation
    .flatMap((square) => square.teams)
    .filter((id): id is number => typeof id === 'number')
    .sort((a, b) => a - b)
}

describe('allocations option handling', () => {
  it('supports team allocation rank methods: original/weighted/custom', () => {
    const methods = [
      {
        name: 'original',
        options: { method: 'original', filters: ['by_strength', 'by_side', 'by_random'] },
      },
      {
        name: 'weighted',
        options: { method: 'weighted', filters: ['by_strength', 'by_side', 'by_random'] },
      },
      {
        name: 'custom',
        options: {
          method: 'custom',
          filters: ['by_strength', 'by_side', 'by_random'],
          weights: [1, 0.5, 0.25],
        },
      },
    ] as const

    for (const entry of methods) {
      const draw = teamStandard.get(1, teams, compiledTeamResults, entry.options, config)
      expect(draw.r).toBe(1)
      expect(draw.allocation).toHaveLength(2)
      expect(allocationTeamIds(draw)).toEqual([1, 2, 3, 4])
      draw.allocation.forEach((square: any) => {
        expect(square.teams).toHaveLength(2)
      })
    }
  })

  it('applies strict team allocation options deterministically with seeded random positioning', () => {
    const strictOptions = {
      pairing_method: 'fold',
      pullup_method: 'frombottom',
      position_method: 'random',
      avoid_conflict: false,
    }

    const first = teamStrict.get(1, teams, compiledTeamResults, config, strictOptions)
    const second = teamStrict.get(1, teams, compiledTeamResults, config, strictOptions)
    const strictIds = allocationTeamIds(first)

    expect(first.allocation).toEqual(second.allocation)
    expect(first.allocation).toHaveLength(2)
    expect(strictIds.length).toBeGreaterThan(0)
    expect(strictIds.every((id) => [1, 2, 3, 4].includes(id))).toBe(true)
    first.allocation.forEach((square: any) => {
      expect(square.teams).toHaveLength(2)
    })
  })

  it('supports adjudicator standard and traditional option paths', () => {
    const baseDraw = teamStandard.get(
      1,
      teams,
      compiledTeamResults,
      { method: 'straight', filters: ['by_strength'] },
      config
    )

    const standardAllocated = adjudicatorStandard.get(
      1,
      baseDraw,
      adjudicators,
      teams,
      compiledTeamResults,
      compiledAdjudicatorResults,
      { chairs: 1, panels: 0, trainees: 0 },
      config,
      { filters: ['by_strength', 'by_past', 'by_random'] }
    )
    expect(standardAllocated.allocation).toHaveLength(2)
    const chairIds = standardAllocated.allocation.flatMap((square: any) => square.chairs)
    expect(chairIds).toHaveLength(2)
    expect(new Set(chairIds).size).toBe(2)

    const traditionalAllocated = adjudicatorTraditional.get(
      1,
      baseDraw,
      adjudicators,
      teams,
      compiledTeamResults,
      compiledAdjudicatorResults,
      { chairs: 1, panels: 1, trainees: 0 },
      config,
      { assign: 'middle_to_slight', scatter: true }
    )
    expect(traditionalAllocated.allocation).toHaveLength(2)
    traditionalAllocated.allocation.forEach((square: any) => {
      expect(Array.isArray(square.chairs)).toBe(true)
      expect(Array.isArray(square.panels)).toBe(true)
    })
  })
})
