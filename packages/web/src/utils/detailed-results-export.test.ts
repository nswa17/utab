import { describe, expect, it } from 'vitest'
import type { Submission } from '@/types/submission'
import {
  buildDetailedResultsExportCsv,
  buildDetailedResultsExportRows,
} from './detailed-results-export'

const submissions: Submission[] = [
  {
    _id: 'ballot-1',
    tournamentId: 'tournament-1',
    round: 2,
    type: 'ballot',
    createdAt: '2026-07-17T10:00:00.000Z',
    payload: {
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      submittedEntityId: 'adj-1',
      speakerIdsA: ['speaker-a1'],
      scoresA: [75],
      matterA: [38],
      mannerA: [37],
      bestA: [true],
      poiA: [false],
      speakerIdsB: ['speaker-b1'],
      matterB: [36],
      mannerB: [35],
      poiB: [true],
      comment: 'Useful feedback',
    },
  },
  {
    _id: 'feedback-1',
    tournamentId: 'tournament-1',
    round: 2,
    type: 'feedback',
    payload: {
      submittedEntityId: 'team-a',
      adjudicatorId: 'adj-2',
      score: 7,
      matter: 4,
      manner: 3,
    },
  },
]

const resolvers = {
  resolveRoundName: (round: number) => `Round ${round}`,
  resolveTeamName: (id: string) => ({ 'team-a': 'Team A', 'team-b': 'Team B' })[id] ?? id,
  resolveSpeakerName: (id: string) => ({ 'speaker-a1': 'Alice', 'speaker-b1': 'Bob' })[id] ?? id,
  resolveAdjudicatorName: (id: string) => ({ 'adj-1': 'Judge One', 'adj-2': 'Judge Two' })[id] ?? id,
  resolveEntityName: (id: string) =>
    ({ 'adj-1': 'Judge One', 'team-a': 'Team A' })[id] ?? id,
  resolveBallotSide: (_round: number, _teamA: string, _teamB: string, slot: 'A' | 'B') =>
    slot === 'A' ? 'Gov' : 'Opp',
}

describe('detailed results export', () => {
  it('keeps speaker-level Matter/Manner and voter award provenance', () => {
    const rows = buildDetailedResultsExportRows(submissions, resolvers)
    const alice = rows.find((row) => row.speaker_name === 'Alice')
    const bob = rows.find((row) => row.speaker_name === 'Bob')

    expect(alice).toMatchObject({
      record_type: 'ballot_speaker',
      voted_by_name: 'Judge One',
      side: 'Gov',
      matter: '38',
      manner: '37',
      score: '75',
      best_debater: 'true',
      poi: 'false',
    })
    expect(bob).toMatchObject({
      side: 'Opp',
      score: '71',
      best_debater: '',
      poi: 'true',
    })
    expect(rows.find((row) => row.record_type === 'feedback')).toMatchObject({
      voted_by_name: 'Team A',
      feedback_target_name: 'Judge Two',
      score: '7',
    })
  })

  it('builds a spreadsheet-safe all-results CSV with the provenance columns', () => {
    const csv = buildDetailedResultsExportCsv(buildDetailedResultsExportRows(submissions, resolvers))
    expect(csv).toContain('Voted by')
    expect(csv).toContain('Best Debater')
    expect(csv).toContain('Judge One')
    expect(csv).toContain('Useful feedback')
  })
})
