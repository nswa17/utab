import { describe, expect, it } from 'vitest'
import { estimateTeamWarningBaseline } from './team-warning-baseline'

describe('team warning baseline', () => {
  it('finds the lexicographic minimum exactly for small fields', () => {
    const wins: Record<string, number> = {
      A: 1,
      B: 1,
      C: 0,
      D: 0,
    }
    const pastOpponents: Record<string, string[]> = {
      A: ['B'],
      B: ['A'],
      C: [],
      D: [],
    }

    const result = estimateTeamWarningBaseline({
      teamIds: ['A', 'B', 'C', 'D'],
      teamNum: 2,
      filterOrder: ['by_past_opponent', 'by_strength'],
      teamWin: (teamId) => wins[teamId],
      teamPastOpponents: (teamId) => pastOpponents[teamId] ?? [],
      teamPastSides: () => [],
      teamInstitutions: () => [],
      institutionCategory: () => 'institution',
    })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.mode).toBe('exact')
    expect(result.entries).toEqual([
      { filter: 'by_past_opponent', count: 0 },
      { filter: 'by_strength', count: 2 },
    ])
  })

  it('chooses the better side orientation for side-imbalance counts', () => {
    const result = estimateTeamWarningBaseline({
      teamIds: ['A', 'B'],
      teamNum: 2,
      filterOrder: ['by_side'],
      teamWin: () => undefined,
      teamPastOpponents: () => [],
      teamPastSides: (teamId) => (teamId === 'A' ? ['gov', 'gov'] : ['opp', 'opp']),
      teamInstitutions: () => [],
      institutionCategory: () => 'institution',
    })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.entries).toEqual([{ filter: 'by_side', count: 0 }])
  })

  it('avoids repeating a school pairing when different teams met before', () => {
    const teamIds = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2']
    const schoolByTeam: Record<string, string> = {
      A1: 'school-a',
      A2: 'school-a',
      B1: 'school-b',
      B2: 'school-b',
      C1: 'school-c',
      C2: 'school-c',
      D1: 'school-d',
      D2: 'school-d',
    }
    const pastOpponents: Record<string, string[]> = {
      A1: ['B1'],
      B1: ['A1'],
    }

    const result = estimateTeamWarningBaseline({
      teamIds,
      schoolHistoryTeamIds: teamIds,
      teamNum: 2,
      filterOrder: ['by_conflict_group', 'by_sibling_past_opponent_school'],
      teamWin: () => undefined,
      teamPastOpponents: (teamId) => pastOpponents[teamId] ?? [],
      teamPastSides: () => [],
      teamInstitutions: (teamId) => [schoolByTeam[teamId]],
      institutionCategory: () => 'institution',
    })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.entries).toEqual([
      { filter: 'by_conflict_group', count: 0 },
      { filter: 'by_sibling_past_opponent_school', count: 0 },
    ])
  })

  it('falls back to estimated mode for large fields and keeps ignored filters separate', () => {
    const teamIds = Array.from({ length: 8 }, (_, index) => `T${index + 1}`)
    const wins = Object.fromEntries(teamIds.map((teamId, index) => [teamId, Math.floor(index / 2)]))

    const result = estimateTeamWarningBaseline({
      teamIds,
      teamNum: 2,
      filterOrder: ['by_strength', 'by_random', 'spread_sides_by_school'],
      teamWin: (teamId) => wins[teamId],
      teamPastOpponents: () => [],
      teamPastSides: () => [],
      teamInstitutions: () => [],
      institutionCategory: () => 'institution',
      exactTeamThreshold: 6,
    })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.mode).toBe('estimated')
    expect(result.entries).toEqual([{ filter: 'by_strength', count: 0 }])
    expect(result.ignoredFilters).toEqual(['by_random', 'spread_sides_by_school'])
  })

  it('reports unsupported configurations cleanly', () => {
    const result = estimateTeamWarningBaseline({
      teamIds: ['A', 'B', 'C', 'D'],
      teamNum: 4,
      filterOrder: ['by_strength'],
      teamWin: () => undefined,
      teamPastOpponents: () => [],
      teamPastSides: () => [],
      teamInstitutions: () => [],
      institutionCategory: () => 'institution',
    })

    expect(result).toEqual({
      status: 'unavailable',
      reason: 'requires_two_team_style',
      ignoredFilters: [],
      pairedTeamCount: 0,
      unpairedTeamCount: 4,
    })
  })
})
