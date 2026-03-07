import { describe, expect, it } from 'vitest'
import { class_based, standard } from '../src/allocations/adjudicators.js'
import type { Draw } from '../src/types/allocations.js'

const teams = [
  { id: 1, details: [{ r: 1, available: true, conflicts: [101], speakers: [] }] },
  { id: 2, details: [{ r: 1, available: true, conflicts: [102], speakers: [] }] },
  { id: 3, details: [{ r: 1, available: true, conflicts: [103], speakers: [] }] },
  { id: 4, details: [{ r: 1, available: true, conflicts: [104], speakers: [] }] },
]

const compiledTeamResults = [
  { id: 1, win: 3, sum: 300, margin: 10, past_sides: ['gov'], past_opponents: [2] },
  { id: 2, win: 2, sum: 290, margin: 5, past_sides: ['opp'], past_opponents: [1] },
  { id: 3, win: 1, sum: 270, margin: 0, past_sides: ['gov'], past_opponents: [4] },
  { id: 4, win: 0, sum: 250, margin: -5, past_sides: ['opp'], past_opponents: [3] },
]

const baseDraw: Draw = {
  r: 1,
  allocation: [
    { id: 1, teams: [1, 2], chairs: [], panels: [], trainees: [] },
    { id: 2, teams: [3, 4], chairs: [], panels: [], trainees: [] },
  ],
}

const config = {
  name: 'class-based-test',
  style: { team_num: 2 },
  preev_weights: [0.5, 0.5, 0.5],
  institution_priority_map: {},
}

function compiledAdjudicatorResults(ids: number[], preevs: number[], judgedTeams: number[][] = []) {
  return ids.map((id, index) => ({
    id,
    average: preevs[index],
    score: preevs[index],
    active_num: 1,
    judged_teams: judgedTeams[index] ?? [],
    details: [],
  }))
}

describe('allocations/adjudicators class_based', () => {
  it('falls back to standard when every adjudicator is unclassified', () => {
    const adjudicators = [
      { id: 10, preev: 9, details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }] },
      { id: 11, preev: 8, details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }] },
      { id: 12, preev: 7, details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }] },
      { id: 13, preev: 6, details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }] },
    ]
    const compiled = compiledAdjudicatorResults(
      adjudicators.map((adjudicator) => adjudicator.id),
      adjudicators.map((adjudicator) => adjudicator.preev)
    )

    const standardDraw = standard.get(
      1,
      baseDraw,
      adjudicators,
      teams,
      compiledTeamResults,
      compiled,
      { chairs: 1, panels: 1, trainees: 0 },
      config,
      { filters: ['by_strength', 'by_random'] }
    )
    const classBasedDraw = class_based.get(
      1,
      baseDraw,
      adjudicators,
      teams,
      compiledTeamResults,
      compiled,
      { chairs: 1, panels: 1, trainees: 0 },
      config,
      { filters: ['by_strength', 'by_random'] }
    )

    expect(classBasedDraw).toEqual(standardDraw)
  })

  it('treats unclassified adjudicators as A when mixed with classed judges', () => {
    const adjudicators = [
      {
        id: 20,
        preev: 9,
        user_defined_data: { judge_class: 'A' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
      {
        id: 21,
        preev: 7,
        user_defined_data: { judge_class: 'C' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
      {
        id: 22,
        preev: 6,
        user_defined_data: { judge_class: 'C' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
      { id: 23, preev: 8, details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }] },
    ]
    const compiled = compiledAdjudicatorResults(
      adjudicators.map((adjudicator) => adjudicator.id),
      adjudicators.map((adjudicator) => adjudicator.preev)
    )

    const draw = class_based.get(
      1,
      baseDraw,
      adjudicators,
      teams,
      compiledTeamResults,
      compiled,
      { chairs: 1, panels: 0, trainees: 0 },
      config
    )

    const chairIds = draw.allocation.flatMap((square) => square.chairs ?? [])
    expect(chairIds).toEqual(expect.arrayContaining([20, 23]))
    expect(chairIds).not.toContain(21)
    expect(chairIds).not.toContain(22)
  })

  it('supports multiple chair/panel/trainee slots while keeping class C out of chairs', () => {
    const adjudicators = [
      {
        id: 30,
        preev: 9,
        user_defined_data: { judge_class: 'A' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
      {
        id: 31,
        preev: 8,
        user_defined_data: { judge_class: 'B' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
      {
        id: 32,
        preev: 7,
        user_defined_data: { judge_class: 'A' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
      {
        id: 33,
        preev: 6,
        user_defined_data: { judge_class: 'B' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
      {
        id: 34,
        preev: 5,
        user_defined_data: { judge_class: 'C' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
      {
        id: 35,
        preev: 4,
        user_defined_data: { judge_class: 'C' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
      {
        id: 36,
        preev: 3,
        user_defined_data: { judge_class: 'C' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
      {
        id: 37,
        preev: 2,
        user_defined_data: { judge_class: 'B' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
      {
        id: 38,
        preev: 1,
        user_defined_data: { judge_class: 'A' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
      {
        id: 39,
        preev: 0,
        user_defined_data: { judge_class: 'B' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
    ]
    const compiled = compiledAdjudicatorResults(
      adjudicators.map((adjudicator) => adjudicator.id),
      adjudicators.map((adjudicator) => adjudicator.preev)
    )

    const draw = class_based.get(
      1,
      baseDraw,
      adjudicators,
      teams,
      compiledTeamResults,
      compiled,
      { chairs: 2, panels: 2, trainees: 1 },
      config,
      { filters: ['by_strength'] }
    )

    draw.allocation.forEach((square) => {
      expect(square.chairs).toHaveLength(2)
      expect(square.panels).toHaveLength(2)
      expect(square.trainees).toHaveLength(1)
    })
    const chairIds = draw.allocation.flatMap((square) => square.chairs ?? [])
    expect(chairIds).not.toContain(34)
    expect(chairIds).not.toContain(35)
    expect(chairIds).not.toContain(36)
  })

  it('prioritizes class before past-history when selecting chairs and panels', () => {
    const draw: Draw = {
      r: 1,
      allocation: [{ id: 1, teams: [1, 2], chairs: [], panels: [], trainees: [] }],
    }
    const adjudicators = [
      {
        id: 40,
        preev: 4,
        user_defined_data: { judge_class: 'A' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
      {
        id: 41,
        preev: 8,
        user_defined_data: { judge_class: 'B' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
      {
        id: 42,
        preev: 2,
        user_defined_data: { judge_class: 'C' },
        details: [{ r: 1, available: true, conflicts: [], conflict_teams: [] }],
      },
    ]
    const compiled = compiledAdjudicatorResults(
      adjudicators.map((adjudicator) => adjudicator.id),
      adjudicators.map((adjudicator) => adjudicator.preev),
      [[1], [], []]
    )

    const result = class_based.get(
      1,
      draw,
      adjudicators,
      teams,
      compiledTeamResults,
      compiled,
      { chairs: 1, panels: 1, trainees: 0 },
      config
    )

    expect(result.allocation[0].chairs).toEqual([40])
    expect(result.allocation[0].panels).toEqual([42])
  })
})
