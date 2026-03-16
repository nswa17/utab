import { describe, expect, it } from 'vitest'
import { estimateAdjudicatorWarningBaseline } from './adjudicator-warning-baseline'

describe('adjudicator warning baseline', () => {
  it('finds the lexicographic minimum assignment exactly', () => {
    const result = estimateAdjudicatorWarningBaseline({
      rows: [
        { teamIds: ['team-1', 'team-2'], slotCount: 1 },
        { teamIds: ['team-3', 'team-4'], slotCount: 1 },
      ],
      adjudicatorIds: ['adj-1', 'adj-2'],
      filterOrder: ['by_conflict_team', 'by_past'],
      teamInstitutions: () => [],
      adjudicatorInstitutions: () => [],
      adjudicatorConflicts: (adjudicatorId) => (adjudicatorId === 'adj-1' ? ['team-1'] : []),
      adjudicatorJudgedTeams: (adjudicatorId) => (adjudicatorId === 'adj-2' ? ['team-4'] : []),
      institutionCategory: () => 'institution',
    })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.mode).toBe('exact')
    expect(result.entries).toEqual([
      { filter: 'by_conflict_team', count: 0 },
      { filter: 'by_past', count: 0 },
    ])
  })

  it('counts institution conflicts per team/category pair', () => {
    const result = estimateAdjudicatorWarningBaseline({
      rows: [{ teamIds: ['team-1', 'team-2'], slotCount: 1 }],
      adjudicatorIds: ['adj-1'],
      filterOrder: ['by_conflict_group'],
      teamInstitutions: (teamId) =>
        teamId === 'team-1' ? ['inst-a', 'league-a'] : teamId === 'team-2' ? ['inst-b'] : [],
      adjudicatorInstitutions: () => ['inst-a', 'league-a', 'inst-b'],
      adjudicatorConflicts: () => [],
      adjudicatorJudgedTeams: () => [],
      institutionCategory: (institutionId) =>
        institutionId.startsWith('league-') ? 'league' : 'institution',
    })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.entries).toEqual([{ filter: 'by_conflict_group', count: 3 }])
  })

  it('ignores non-warning filters and reports insufficient adjudicators', () => {
    const result = estimateAdjudicatorWarningBaseline({
      rows: [{ teamIds: ['team-1', 'team-2'], slotCount: 2 }],
      adjudicatorIds: ['adj-1'],
      filterOrder: ['by_strength', 'by_conflict_team'],
      teamInstitutions: () => [],
      adjudicatorInstitutions: () => [],
      adjudicatorConflicts: () => [],
      adjudicatorJudgedTeams: () => [],
      institutionCategory: () => 'institution',
    })

    expect(result).toEqual({
      status: 'unavailable',
      reason: 'not_enough_adjudicators',
      ignoredFilters: ['by_strength'],
      slotCount: 2,
      availableAdjudicatorCount: 1,
    })
  })
})
