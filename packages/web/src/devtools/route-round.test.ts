import { describe, expect, it } from 'vitest'
import { resolvePreferredRound } from './route-round'

describe('resolvePreferredRound', () => {
  it('prefers round query over path round', () => {
    const resolved = resolvePreferredRound({
      path: '/admin/tournament-1/rounds/3/allocation',
      query: { round: '2' },
      fallback: 1,
    })
    expect(resolved).toBe(2)
  })

  it('falls back to path round when query is missing', () => {
    const resolved = resolvePreferredRound({
      path: '/admin/tournament-1/rounds/4/result',
      query: {},
      fallback: 1,
    })
    expect(resolved).toBe(4)
  })

  it('uses fallback when both query and path are invalid', () => {
    const resolved = resolvePreferredRound({
      path: '/admin/tournament-1/operations',
      query: { round: 'x' },
      fallback: '7',
    })
    expect(resolved).toBe(7)
  })

  it('returns null when no valid round source is present', () => {
    const resolved = resolvePreferredRound({
      path: '/admin/tournament-1/operations',
      query: { round: '-1' },
      fallback: 'NaN',
    })
    expect(resolved).toBeNull()
  })
})
