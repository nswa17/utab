import { describe, expect, it } from 'vitest'
import type { Submission } from '@/types/submission'
import {
  buildRoundSubmissionCoverage,
  expectedFeedbackCountForRow,
  normalizeSubmissionExpectationRows,
  resolveBallotSubmitterRoles,
  resolveFeedbackExpectationSettings,
} from './submission-expectations'

describe('submission expectation helpers', () => {
  it('uses the configured ballot submitter roles for expectations', () => {
    const [row] = normalizeSubmissionExpectationRows(
      [
        {
          teams: { gov: 'team-gov', opp: 'team-opp' },
          chairs: ['adj-chair'],
          panels: ['adj-panel'],
          trainees: ['adj-trainee'],
        },
      ],
      { ballot_submitter_roles: ['chair'] }
    )
    expect(row.ballotSubmitterIds).toEqual(['adj-chair'])
    expect(resolveBallotSubmitterRoles({ ballot_submitter_roles: [] })).toEqual([])
    expect(resolveBallotSubmitterRoles({ allow_panel_ballot_submission: false })).toEqual(['chair'])
  })

  it('counts expected feedback submissions for a single row with speaker evaluators', () => {
    const [row] = normalizeSubmissionExpectationRows([
      {
        teams: { gov: 'team-gov', opp: 'team-opp' },
        chairs: ['adj-chair'],
        panels: ['adj-panel'],
        trainees: ['adj-trainee'],
      },
    ])
    const settings = {
      fromTeams: true,
      fromAdjudicators: false,
      evaluatorInTeam: 'speaker' as const,
      chairsAlwaysEvaluated: true,
    }
    const count = expectedFeedbackCountForRow({
      roundNumber: 3,
      row,
      settings,
      resolveTeamSpeakerIds: (teamId) =>
        teamId === 'team-gov' ? ['spk-g1', 'spk-g2'] : ['spk-o1', 'spk-o2'],
    })
    expect(count).toBe(4)
  })

  it('summarizes expected/submitted/missing/duplicate/unknown by submission key', () => {
    const submissions: Submission[] = [
      {
        _id: 'b-1',
        tournamentId: 't-1',
        round: 1,
        type: 'ballot',
        payload: { teamAId: 'team-1', teamBId: 'team-2', submittedEntityId: 'adj-1' },
      },
      {
        _id: 'b-1-dup',
        tournamentId: 't-1',
        round: 1,
        type: 'ballot',
        payload: { teamAId: 'team-1', teamBId: 'team-2', submittedEntityId: 'adj-1' },
      },
      {
        _id: 'b-2',
        tournamentId: 't-1',
        round: 1,
        type: 'ballot',
        payload: { teamAId: 'team-2', teamBId: 'team-1', submittedEntityId: 'adj-2' },
      },
      {
        _id: 'b-unknown',
        tournamentId: 't-1',
        round: 1,
        type: 'ballot',
        payload: { teamAId: 'team-1', teamBId: 'team-2' },
      },
      {
        _id: 'b-unexpected',
        tournamentId: 't-1',
        round: 1,
        type: 'ballot',
        payload: { teamAId: 'team-1', teamBId: 'team-2', submittedEntityId: 'adj-9' },
      },
      {
        _id: 'f-team-1-chair',
        tournamentId: 't-1',
        round: 1,
        type: 'feedback',
        payload: { adjudicatorId: 'adj-1', submittedEntityId: 'team-1' },
      },
      {
        _id: 'f-team-1-chair-dup',
        tournamentId: 't-1',
        round: 1,
        type: 'feedback',
        payload: { adjudicatorId: 'adj-1', submittedEntityId: 'team-1' },
      },
      {
        _id: 'f-team-2-panel',
        tournamentId: 't-1',
        round: 1,
        type: 'feedback',
        payload: { adjudicatorId: 'adj-2' },
        submittedBy: 'team-2',
      },
      {
        _id: 'f-adj-1-to-adj-2',
        tournamentId: 't-1',
        round: 1,
        type: 'feedback',
        payload: { adjudicatorId: 'adj-2', submittedEntityId: 'adj-1' },
      },
      {
        _id: 'f-adj-2-to-adj-1',
        tournamentId: 't-1',
        round: 1,
        type: 'feedback',
        payload: { adjudicatorId: 'adj-1', submittedEntityId: 'adj-2' },
      },
      {
        _id: 'f-adj-self',
        tournamentId: 't-1',
        round: 1,
        type: 'feedback',
        payload: { adjudicatorId: 'adj-1', submittedEntityId: 'adj-1' },
      },
      {
        _id: 'f-unknown',
        tournamentId: 't-1',
        round: 1,
        type: 'feedback',
        payload: { adjudicatorId: 'adj-2' },
      },
      {
        _id: 'f-invalid',
        tournamentId: 't-1',
        round: 1,
        type: 'feedback',
        payload: { submittedEntityId: 'team-1' },
      },
    ]

    const coverage = buildRoundSubmissionCoverage({
      roundNumber: 1,
      allocation: [
        {
          teams: { gov: 'team-1', opp: 'team-2' },
          chairs: ['adj-1'],
          panels: ['adj-2'],
          trainees: ['adj-3'],
        },
      ],
      userDefinedData: {
        evaluate_from_teams: true,
        evaluate_from_adjudicators: true,
        evaluator_in_team: 'team',
        chairs_always_evaluated: false,
      },
      submissions,
      resolveTeamSpeakerIds: () => [],
    })

    expect(coverage.ballot).toEqual({
      expected: 2,
      submitted: 2,
      missing: 0,
      duplicates: 2,
      unknown: 1,
    })
    expect(coverage.feedback).toEqual({
      expected: 10,
      submitted: 4,
      missing: 6,
      duplicates: 3,
      unknown: 1,
    })
  })

  it('uses enabled-by-default settings when round flags are omitted', () => {
    const settings = resolveFeedbackExpectationSettings({})
    expect(settings).toEqual({
      fromTeams: true,
      fromAdjudicators: true,
      evaluatorInTeam: 'team',
      chairsAlwaysEvaluated: false,
    })
  })
})
