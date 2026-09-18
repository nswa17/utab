import { describe, expect, it } from 'vitest'
import {
  sanitizeAdjudicatorForPublic,
  sanitizeDrawForPublic,
  sanitizeInstitutionForPublic,
  sanitizeRoundForPublic,
  sanitizeSpeakerForPublic,
  sanitizeTeamForPublic,
  sanitizeTournamentForPublic,
  sanitizeVenueForPublic,
} from '../src/services/response-sanitizer.js'

describe('sanitizeDrawForPublic', () => {
  it('keeps gov/opp teams when draw is opened', () => {
    const sanitized = sanitizeDrawForPublic({
      tournamentId: 't1',
      round: 1,
      drawOpened: true,
      allocationOpened: false,
      allocation: [
        {
          venue: 'v1',
          teams: { gov: 'team-gov', opp: 'team-opp' },
          chairs: ['adj-1'],
        },
      ],
    }) as any

    expect(sanitized.allocation).toHaveLength(1)
    expect(sanitized.allocation[0].teams.gov).toBe('team-gov')
    expect(sanitized.allocation[0].teams.opp).toBe('team-opp')
    expect(sanitized.allocation[0].chairs).toEqual([])
  })

  it('normalizes 4-team arrays and preserves labels for opened draws', () => {
    const sanitized = sanitizeDrawForPublic({
      tournamentId: 't1',
      round: 2,
      drawOpened: true,
      allocationOpened: true,
      allocation: [
        {
          venue: 'v2',
          teams: ['og-team', 'oo-team', 'cg-team', 'co-team'],
          chairs: ['adj-1'],
          panels: ['adj-2'],
          trainees: ['adj-3'],
        },
      ],
    }) as any

    expect(sanitized.allocation).toHaveLength(1)
    expect(sanitized.allocation[0].teams).toEqual({
      gov: 'og-team',
      opp: 'oo-team',
      og: 'og-team',
      oo: 'oo-team',
      cg: 'cg-team',
      co: 'co-team',
    })
    expect(sanitized.allocation[0].chairs).toEqual(['adj-1'])
    expect(sanitized.allocation[0].panels).toEqual(['adj-2'])
    expect(sanitized.allocation[0].trainees).toEqual(['adj-3'])
  })

  it('masks team labels when draw is not opened', () => {
    const sanitized = sanitizeDrawForPublic({
      tournamentId: 't1',
      round: 3,
      drawOpened: false,
      allocationOpened: true,
      allocation: [
        {
          teams: ['og-team', 'oo-team', 'cg-team', 'co-team'],
          chairs: ['adj-1'],
        },
      ],
    }) as any

    expect(sanitized.allocation).toHaveLength(1)
    expect(sanitized.allocation[0].teams).toEqual({
      gov: '',
      opp: '',
      og: '',
      oo: '',
      cg: '',
      co: '',
    })
    expect(sanitized.allocation[0].chairs).toEqual(['adj-1'])
  })

  it('returns an empty allocation when both draw and allocation are closed', () => {
    const sanitized = sanitizeDrawForPublic({
      tournamentId: 't1',
      round: 4,
      drawOpened: false,
      allocationOpened: false,
      allocation: [
        {
          teams: { gov: 'team-gov', opp: 'team-opp' },
          chairs: ['adj-1'],
        },
      ],
    }) as any

    expect(sanitized.allocation).toEqual([])
  })
})

describe('sanitizeTournamentForPublic', () => {
  it('exposes only participant-facing style overrides', () => {
    const sanitized = sanitizeTournamentForPublic({
      _id: 't1',
      name: 'Open',
      style: 1,
      total_round_num: 5,
      current_round_num: 2,
      createdBy: 'user-1',
      auth: {
        access: {
          required: true,
          passwordHash: 'secret-hash',
        },
      },
      user_defined_data: {
        hidden: true,
        privateMemo: 'hidden',
      },
      options: {
        privateFlag: 'hidden',
        style: {
          team_num: 4,
          score_weights: [1, 1, 1, 1],
          side_labels: ['OG', 'OO', 'CG', 'CO'],
          side_labels_short: ['OG', 'OO', 'CG', 'CO'],
          speaker_sequence: ['og-1'],
          range: [{ order: 1, value: { from: 70, to: 80, unit: 1 } }],
          adjudicator_range: { from: 1, to: 10, unit: 1 },
          roles: { og: [{ order: 1, long: 'Speaker', abbr: 'S' }] },
          privateStyleFlag: 'hidden',
        },
      },
    }) as any

    expect(sanitized).toEqual({
      _id: 't1',
      name: 'Open',
      style: 1,
      total_round_num: 5,
      current_round_num: 2,
      options: {
        style: {
          team_num: 4,
          score_weights: [1, 1, 1, 1],
          side_labels: ['OG', 'OO', 'CG', 'CO'],
          side_labels_short: ['OG', 'OO', 'CG', 'CO'],
          speaker_sequence: ['og-1'],
          range: [{ order: 1, value: { from: 70, to: 80, unit: 1 } }],
          adjudicator_range: { from: 1, to: 10, unit: 1 },
          roles: { og: [{ order: 1, long: 'Speaker', abbr: 'S' }] },
        },
      },
      hidden: true,
      auth: { access: { required: true } },
    })
  })
})

describe('participant public entity DTOs', () => {
  it('reconstructs the Team DTO instead of passing through private template/details fields', () => {
    const sanitized = sanitizeTeamForPublic({
      _id: 'team-1',
      tournamentId: 't1',
      name: 'Team One',
      institution: 'legacy-institution',
      template: {
        speakers: ['speaker-1', 'speaker-2'],
        privateTemplateField: 'hidden',
      },
      details: [{ r: 1, privateRoundField: true }],
      userDefinedData: { privateMemo: 'hidden' },
      createdBy: 'user-1',
    }) as any

    expect(sanitized).toEqual({
      _id: 'team-1',
      tournamentId: 't1',
      name: 'Team One',
      template: { speakers: ['speaker-1', 'speaker-2'] },
    })
  })

  it('keeps simple entity DTOs name-only apart from ids', () => {
    const source = {
      _id: 'entity-1',
      tournamentId: 't1',
      name: 'Public Name',
      preev: 9,
      category: 'private-category',
      priority: 1,
      details: [{ r: 1 }],
      userDefinedData: { memo: 'hidden' },
    }

    expect(sanitizeSpeakerForPublic(source)).toEqual({
      _id: 'entity-1',
      tournamentId: 't1',
      name: 'Public Name',
    })
    expect(sanitizeAdjudicatorForPublic(source)).toEqual({
      _id: 'entity-1',
      tournamentId: 't1',
      name: 'Public Name',
    })
    expect(sanitizeVenueForPublic(source)).toEqual({
      _id: 'entity-1',
      tournamentId: 't1',
      name: 'Public Name',
    })
    expect(sanitizeInstitutionForPublic(source)).toEqual({
      _id: 'entity-1',
      tournamentId: 't1',
      name: 'Public Name',
    })
  })
})

describe('sanitizeRoundForPublic', () => {
  it('reconstructs only participant-safe round settings and gates motions', () => {
    const hiddenMotion = sanitizeRoundForPublic({
      _id: 'round-1',
      tournamentId: 't1',
      round: 1,
      name: 'Round 1',
      motions: ['Secret motion'],
      motionOpened: false,
      teamAllocationOpened: false,
      adjudicatorAllocationOpened: true,
      userDefinedData: {
        hidden: false,
        evaluate_from_adjudicators: false,
        evaluate_from_teams: true,
        chairs_always_evaluated: true,
        no_speaker_score: true,
        allow_low_tie_win: false,
        allow_score_winner_mismatch: false,
        score_by_matter_manner: false,
        poi: false,
        best: false,
        evaluator_in_team: 'speaker',
        ballot_submitter_roles: ['chair', 'trainee'],
        privateMemo: 'hidden',
        break: { participants: ['private'] },
      },
      weightsOfAdjudicators: { chair: 1, panel: 0.5, trainee: 0 },
    }) as any

    expect(hiddenMotion).toEqual({
      _id: 'round-1',
      tournamentId: 't1',
      round: 1,
      name: 'Round 1',
      motions: [],
      motionOpened: false,
      teamAllocationOpened: false,
      adjudicatorAllocationOpened: true,
      userDefinedData: {
        hidden: false,
        evaluate_from_adjudicators: false,
        evaluate_from_teams: true,
        chairs_always_evaluated: true,
        no_speaker_score: true,
        allow_low_tie_win: false,
        allow_score_winner_mismatch: false,
        score_by_matter_manner: false,
        poi: false,
        best: false,
        evaluator_in_team: 'speaker',
        ballot_submitter_roles: ['chair', 'trainee'],
      },
    })

    const openedMotion = sanitizeRoundForPublic({
      tournamentId: 't1',
      round: 2,
      motions: ['Public motion'],
      motionOpened: true,
      userDefinedData: {},
    }) as any
    expect(openedMotion.motions).toEqual(['Public motion'])
  })

  it('preserves the legacy draw default while exposing explicit enablement', () => {
    const defaultRound = sanitizeRoundForPublic({
      tournamentId: 't1',
      round: 1,
      userDefinedData: {},
    }) as any
    const drawEnabledRound = sanitizeRoundForPublic({
      tournamentId: 't1',
      round: 2,
      userDefinedData: { allow_low_tie_win: true },
    }) as any

    expect(defaultRound.userDefinedData.allow_low_tie_win).toBe(true)
    expect(drawEnabledRound.userDefinedData.allow_low_tie_win).toBe(true)
  })
})
