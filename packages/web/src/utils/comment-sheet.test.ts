import { describe, expect, it } from 'vitest'
import type { Submission } from '@/types/submission'
import {
  buildCommentSheetCsv,
  buildCommentSheetRows,
  type CommentSheetResolvers,
} from './comment-sheet'

const resolvers: CommentSheetResolvers = {
  resolveRoundName: (round) => `Round ${round}`,
  resolveTeamName: (id) =>
    ({
      'team-a': 'Team A',
      'team-b': 'Team B',
    })[id] ?? id,
  resolveAdjudicatorName: (id) =>
    ({
      'adj-a': 'Judge A',
    })[id] ?? id,
  resolveEntityName: (id) =>
    ({
      'adj-a': 'Judge A',
      'team-a': 'Team A',
    })[id] ?? id,
}

describe('comment sheet utility', () => {
  it('builds comment rows from ballot and feedback submissions', () => {
    const submissions: Submission[] = [
      {
        _id: '1',
        tournamentId: 't',
        round: 1,
        type: 'ballot',
        payload: {
          teamAId: 'team-a',
          teamBId: 'team-b',
          winnerId: 'team-a',
          submittedEntityId: 'adj-a',
          role: 'chair',
          comment: 'Close debate.',
        },
        createdAt: '2026-02-13T10:00:00.000Z',
        updatedAt: '2026-02-13T10:00:00.000Z',
      },
      {
        _id: '2',
        tournamentId: 't',
        round: 1,
        type: 'feedback',
        payload: {
          adjudicatorId: 'adj-a',
          score: 8,
          submittedEntityId: 'team-a',
          comment: 'Very clear adjudication.',
        },
        createdAt: '2026-02-13T10:01:00.000Z',
        updatedAt: '2026-02-13T10:01:00.000Z',
      },
      {
        _id: '3',
        tournamentId: 't',
        round: 2,
        type: 'ballot',
        payload: {
          teamAId: 'team-a',
          teamBId: 'team-b',
          comment: '   ',
        },
      },
    ]

    const rows = buildCommentSheetRows(submissions, resolvers)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      round: 1,
      round_name: 'Round 1',
      submission_type: 'ballot',
      submitted_entity_id: 'adj-a',
      submitted_entity_name: 'Judge A',
      matchup: 'Team A vs Team B',
      winner: 'Team A',
      role: 'adjudicator',
      comment: 'Close debate.',
    })
    expect(rows[1]).toMatchObject({
      round: 1,
      round_name: 'Round 1',
      submission_type: 'feedback',
      submitted_entity_id: 'team-a',
      submitted_entity_name: 'Team A',
      adjudicator: 'Judge A',
      score: '8',
      comment: 'Very clear adjudication.',
    })
  })

  it('escapes CSV fields correctly', () => {
    const submissions: Submission[] = [
      {
        _id: '1',
        tournamentId: 't',
        round: 1,
        type: 'feedback',
        payload: {
          adjudicatorId: 'adj-a',
          score: 7.5,
          submittedEntityId: 'team-a',
          comment: 'Includes comma, quote "and" newline\nsecond line',
        },
      },
    ]
    const csv = buildCommentSheetCsv(buildCommentSheetRows(submissions, resolvers))
    expect(csv).toContain('"Includes comma, quote ""and"" newline')
    expect(csv).toContain('\nsecond line"')
  })
})
