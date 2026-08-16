import { describe, expect, it } from 'vitest'
import { isCompleteSpeakerSelection, normalizeBallotPrefillPayload } from './ballot-prefill'

describe('ballot prefill normalization', () => {
  it('keeps the winning team id when the current sides are reversed', () => {
    const normalized = normalizeBallotPrefillPayload(
      {
        teamAId: 'team-a',
        teamBId: 'team-b',
        winnerId: 'team-a',
        speakerIdsA: ['speaker-a'],
        speakerIdsB: ['speaker-b'],
        scoresA: [75],
        scoresB: [73],
      },
      'team-b',
      'team-a'
    )

    expect(normalized).toMatchObject({
      teamAId: 'team-b',
      teamBId: 'team-a',
      winnerId: 'team-a',
      speakerIdsA: ['speaker-b'],
      speakerIdsB: ['speaker-a'],
      scoresA: [73],
      scoresB: [75],
    })
  })

  it('rejects a winner id outside the saved matchup', () => {
    const normalized = normalizeBallotPrefillPayload(
      { teamAId: 'team-a', teamBId: 'team-b', winnerId: 'team-c', draw: false },
      'team-a',
      'team-b'
    )

    expect(normalized?.winnerId).toBeUndefined()
    expect(normalized?.draw).toBeUndefined()
  })

  it('requires one valid speaker per role only when a roster exists', () => {
    expect(isCompleteSpeakerSelection([], 2, ['speaker-a', 'speaker-b'])).toBe(false)
    expect(isCompleteSpeakerSelection(['speaker-a'], 2, ['speaker-a', 'speaker-b'])).toBe(false)
    expect(
      isCompleteSpeakerSelection(['speaker-a', 'speaker-b'], 2, ['speaker-a', 'speaker-b'])
    ).toBe(true)
    expect(isCompleteSpeakerSelection(['', ''], 2, [])).toBe(true)
  })
})
