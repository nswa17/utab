import { describe, expect, it } from 'vitest'
import {
  buildEntityWarningIndex,
  buildFocusedEntitySet,
  buildRowWarningStates,
  warningEntityKey,
  type DrawAllocationRowLike,
} from './allocation-warnings'

const allocation: DrawAllocationRowLike[] = [
  {
    venue: 'venue-1',
    teams: { gov: 'team-1', opp: 'team-2' },
    chairs: ['adj-1'],
    panels: ['adj-2'],
    trainees: [],
  },
  {
    venue: null,
    teams: { gov: 'team-3', opp: 'team-4' },
    chairs: [],
    panels: [],
    trainees: [],
  },
]

const warnings = buildRowWarningStates({
  allocation,
  isTeamAvailable: (teamId) => {
    if (teamId === 'team-1') return false
    return true
  },
  isAdjudicatorAvailable: (adjudicatorId) => {
    if (adjudicatorId === 'adj-2') return false
    return true
  },
  isVenueAvailable: (venueId) => (venueId === 'venue-1' ? false : true),
  teamInstitutions: (teamId) => {
    if (teamId === 'team-1') return ['inst-a', 'region-a']
    if (teamId === 'team-2') return ['inst-a', 'region-a', 'league-a']
    if (teamId === 'team-5') return ['league-a']
    return []
  },
  adjudicatorInstitutions: (adjudicatorId) => {
    if (adjudicatorId === 'adj-1') return ['inst-a', 'region-a']
    if (adjudicatorId === 'adj-2') return ['region-a']
    return []
  },
  institutionCategory: (institutionId) => {
    if (institutionId.startsWith('region-')) return 'region'
    if (institutionId.startsWith('league-')) return 'league'
    return 'institution'
  },
  adjudicatorConflicts: (adjudicatorId) => (adjudicatorId === 'adj-1' ? ['team-2'] : []),
  teamWin: (teamId) => {
    if (teamId === 'team-1') return 3
    if (teamId === 'team-2') return 2
    return undefined
  },
  teamPastOpponents: (teamId) => (teamId === 'team-1' ? ['team-2', 'team-5'] : []),
  teamPastSides: (teamId) => {
    if (teamId === 'team-1') return ['gov', 'gov']
    if (teamId === 'team-2') return ['opp', 'opp']
    return []
  },
  adjudicatorJudgedTeams: (adjudicatorId) => (adjudicatorId === 'adj-1' ? ['team-1'] : []),
})

describe('allocation warnings', () => {
  it('generates expected warning codes with severity mapping', () => {
    const row0Codes = warnings[0].warnings.map((warning) => warning.code)
    expect(row0Codes).toContain('team_unavailable')
    expect(row0Codes).toContain('venue_unavailable')
    expect(row0Codes).toContain('team_same_institution')
    expect(row0Codes).toContain('team_different_win')
    expect(row0Codes).toContain('team_past_match')
    expect(row0Codes).toContain('team_past_match_same_institution')
    expect(row0Codes).toContain('adjudicator_institution_conflict')
    expect(row0Codes).toContain('adjudicator_personal_conflict')
    expect(row0Codes).toContain('adjudicator_already_judged')
    expect(row0Codes).toContain('adjudicator_unavailable')
    expect(row0Codes).toContain('adjudicator_same_institution')
    expect(row0Codes).toContain('adjudicator_even_count')

    const row1Codes = warnings[1].warnings.map((warning) => warning.code)
    expect(row1Codes).toEqual(['adjudicator_none'])

    const criticalCodes = warnings[0].warnings
      .filter((warning) => warning.severity === 'critical')
      .map((warning) => warning.code)
    expect(criticalCodes).toContain('team_unavailable')
    expect(criticalCodes).toContain('venue_unavailable')
    expect(criticalCodes).toContain('adjudicator_unavailable')

    const teamSameInstitutionCategories = warnings[0].warnings
      .filter((warning) => warning.code === 'team_same_institution')
      .map((warning) => warning.params.groupCategory)
    expect(teamSameInstitutionCategories).toContain('institution')
    expect(teamSameInstitutionCategories).toContain('region')

    const teamPastSameInstitutionCategories = warnings[0].warnings
      .filter((warning) => warning.code === 'team_past_match_same_institution')
      .map((warning) => warning.params.groupCategory)
    expect(teamPastSameInstitutionCategories).toContain('league')

    const adjudicatorConflictCategories = warnings[0].warnings
      .filter((warning) => warning.code === 'adjudicator_institution_conflict')
      .map((warning) => warning.params.groupCategory)
    expect(adjudicatorConflictCategories).toContain('institution')
    expect(adjudicatorConflictCategories).toContain('region')
  })

  it('computes severity counts per row', () => {
    expect(warnings[0].counts.critical).toBeGreaterThan(0)
    expect(warnings[0].counts.warn).toBeGreaterThan(0)
    expect(warnings[0].counts.info).toBeGreaterThan(0)
    expect(warnings[1].counts).toEqual({ critical: 1, warn: 0, info: 0 })
  })

  it('builds entity index with max severity and row references', () => {
    const index = buildEntityWarningIndex(warnings)
    const team1 = index.get(warningEntityKey('team', 'team-1'))
    const adj2 = index.get(warningEntityKey('adj', 'adj-2'))

    expect(team1?.maxSeverity).toBe('critical')
    expect(team1?.warningCount).toBeGreaterThan(1)
    expect(team1?.rowIndexes).toContain(0)

    expect(adj2?.maxSeverity).toBe('critical')
    expect(adj2?.rowIndexes).toContain(0)
  })

  it('extracts focused targets for team/adjudicator/venue warnings', () => {
    const teamWarning = warnings[0].warnings.find(
      (warning) =>
        warning.code === 'team_same_institution' && warning.params.groupCategory === 'institution'
    )!
    const adjudicatorWarning = warnings[0].warnings.find(
      (warning) => warning.code === 'adjudicator_personal_conflict'
    )!
    const venueWarning = warnings[0].warnings.find((warning) => warning.code === 'venue_unavailable')!

    const teamTargets = buildFocusedEntitySet(teamWarning)
    const adjudicatorTargets = buildFocusedEntitySet(adjudicatorWarning)
    const venueTargets = buildFocusedEntitySet(venueWarning)

    expect(teamTargets.has('team:team-1')).toBe(true)
    expect(teamTargets.has('team:team-2')).toBe(true)
    expect(adjudicatorTargets.has('adj:adj-1')).toBe(true)
    expect(adjudicatorTargets.has('team:team-2')).toBe(true)
    expect(venueTargets.has('venue:venue-1')).toBe(true)
  })
})
