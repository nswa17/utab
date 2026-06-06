import { describe, expect, it } from 'vitest'
import { countDuplicateSubmissions } from './submission-duplicates'

describe('submission duplicate warning counts', () => {
  it('does not treat the same ballot submitter across different matches as duplicate', () => {
    const counts = countDuplicateSubmissions([
      {
        round: 1,
        type: 'ballot',
        payload: { submittedEntityId: 'adj-1', teamAId: 'team-1', teamBId: 'team-2' },
      },
      {
        round: 1,
        type: 'ballot',
        payload: { submittedEntityId: 'adj-1', teamAId: 'team-3', teamBId: 'team-4' },
      },
    ])

    expect(counts).toEqual({ ballotDuplicates: 0, feedbackDuplicates: 0 })
  })

  it('counts duplicate ballot pairs and duplicate feedback targets', () => {
    const counts = countDuplicateSubmissions([
      {
        round: 1,
        type: 'ballot',
        payload: { submittedEntityId: 'adj-1', teamAId: 'team-1', teamBId: 'team-2' },
      },
      {
        round: 1,
        type: 'ballot',
        payload: { submittedEntityId: 'adj-1', teamAId: 'team-2', teamBId: 'team-1' },
      },
      {
        round: 1,
        type: 'feedback',
        payload: { submittedEntityId: 'team-1', adjudicatorId: 'adj-1' },
      },
      {
        round: 1,
        type: 'feedback',
        payload: { submittedEntityId: 'team-1', adjudicatorId: 'adj-1' },
      },
    ])

    expect(counts).toEqual({ ballotDuplicates: 1, feedbackDuplicates: 1 })
  })
})
