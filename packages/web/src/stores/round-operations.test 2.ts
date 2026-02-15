import { describe, expect, it } from 'vitest'
import { countSubmissionActors, resolveRoundOperationStatus } from './round-operations'

describe('round operations helpers', () => {
  it('resolves status by operational priority', () => {
    expect(
      resolveRoundOperationStatus({
        hasSubmissions: false,
        hasCompiled: false,
        hasDraw: false,
        isPublished: false,
      })
    ).toBe('preparing')
    expect(
      resolveRoundOperationStatus({
        hasSubmissions: true,
        hasCompiled: false,
        hasDraw: false,
        isPublished: false,
      })
    ).toBe('collecting')
    expect(
      resolveRoundOperationStatus({
        hasSubmissions: true,
        hasCompiled: true,
        hasDraw: false,
        isPublished: false,
      })
    ).toBe('compiled')
    expect(
      resolveRoundOperationStatus({
        hasSubmissions: true,
        hasCompiled: true,
        hasDraw: true,
        isPublished: false,
      })
    ).toBe('generated')
    expect(
      resolveRoundOperationStatus({
        hasSubmissions: true,
        hasCompiled: true,
        hasDraw: true,
        isPublished: true,
      })
    ).toBe('finalized')
  })

  it('counts unique non-empty submission actors', () => {
    const count = countSubmissionActors(
      [
        { actor: 'team-1' },
        { actor: 'team-1' },
        { actor: 'judge-1' },
        { actor: '' },
      ],
      (item) => item.actor
    )
    expect(count).toBe(2)
  })
})
