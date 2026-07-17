import { describe, expect, it } from 'vitest'
import {
  adjudicatorJudgedTeamIdsFromAllocation,
  coAdjudicatorIdsFromAllocation,
  pastOpponentIdsFromAllocation,
  pastSidesFromAllocation,
  priorAllocationRows,
  teamAdjudicatorIdsFromAllocation,
} from './allocation-history'

const draws = [
  {
    tournamentId: 'tournament-1',
    round: 1,
    allocation: [
      {
        teams: { gov: 'team-a', opp: 'team-b' },
        chairs: ['adj-1'],
        panels: ['adj-2'],
        trainees: ['adj-3'],
      },
    ],
  },
  {
    tournamentId: 'tournament-1',
    round: 2,
    allocation: [
      {
        teams: { gov: 'team-c', opp: 'team-a' },
        chairs: ['adj-2'],
        panels: [],
        trainees: [],
      },
    ],
  },
  {
    tournamentId: 'other-tournament',
    round: 1,
    allocation: [
      {
        teams: { gov: 'team-a', opp: 'team-z' },
        chairs: ['adj-z'],
        panels: [],
        trainees: [],
      },
    ],
  },
]

describe('allocation history', () => {
  it('derives warnings data from prior draw rows without a compiled snapshot', () => {
    const rows = priorAllocationRows(draws, 'tournament-1', 3)

    expect(pastOpponentIdsFromAllocation(rows, 'team-a')).toEqual(['team-b', 'team-c'])
    expect(pastSidesFromAllocation(rows, 'team-a')).toEqual(['gov', 'opp'])
    expect(adjudicatorJudgedTeamIdsFromAllocation(rows, 'adj-2')).toEqual([
      'team-a',
      'team-b',
      'team-c',
    ])
    expect(teamAdjudicatorIdsFromAllocation(rows, 'team-a')).toEqual(['adj-1', 'adj-2', 'adj-3'])
  })

  it('lists prior Chair/Panel co-adjudicators and excludes trainees', () => {
    const rows = priorAllocationRows(draws, 'tournament-1', 3)
    expect(coAdjudicatorIdsFromAllocation(rows, 'adj-2')).toEqual(['adj-1'])
  })
})
