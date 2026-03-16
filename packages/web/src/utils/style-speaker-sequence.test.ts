import { describe, expect, it } from 'vitest'
import { buildSpeakerRoleSequence } from './style-speaker-sequence'

describe('buildSpeakerRoleSequence', () => {
  it('falls back to alternating side order when speaker_sequence is missing', () => {
    expect(buildSpeakerRoleSequence(undefined, { gov: 3, opp: 3 })).toEqual([
      { side: 'gov', index: 0 },
      { side: 'opp', index: 0 },
      { side: 'gov', index: 1 },
      { side: 'opp', index: 1 },
      { side: 'gov', index: 2 },
      { side: 'opp', index: 2 },
    ])
  })

  it('uses ordered style speaker_sequence tokens for reply speeches', () => {
    expect(
      buildSpeakerRoleSequence(
        [
          { order: 1, value: 'gov-1' },
          { order: 2, value: 'opp-1' },
          { order: 3, value: 'gov-2' },
          { order: 4, value: 'opp-2' },
          { order: 5, value: 'opp-3' },
          { order: 6, value: 'gov-3' },
        ],
        { gov: 3, opp: 3 }
      )
    ).toEqual([
      { side: 'gov', index: 0 },
      { side: 'opp', index: 0 },
      { side: 'gov', index: 1 },
      { side: 'opp', index: 1 },
      { side: 'opp', index: 2 },
      { side: 'gov', index: 2 },
    ])
  })

  it('accepts side/role entries and appends missing roles safely', () => {
    expect(
      buildSpeakerRoleSequence(
        [
          { order: 2, side: 'opp', role: 1 },
          { order: 1, side: 'gov', role: 1 },
          { order: 3, side: 'gov', role: 2 },
        ],
        { gov: 2, opp: 2 }
      )
    ).toEqual([
      { side: 'gov', index: 0 },
      { side: 'opp', index: 0 },
      { side: 'gov', index: 1 },
      { side: 'opp', index: 1 },
    ])
  })
})
