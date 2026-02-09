import { describe, expect, it } from 'vitest'
import { makeMatchKey } from './match'

describe('makeMatchKey', () => {
  it('creates a stable key regardless of order', () => {
    expect(makeMatchKey('team-a', 'team-b')).toBe('team-a::team-b')
    expect(makeMatchKey('team-b', 'team-a')).toBe('team-a::team-b')
  })

  it('returns empty string for missing ids', () => {
    expect(makeMatchKey('', 'team-b')).toBe('')
    expect(makeMatchKey('team-a', '')).toBe('')
  })
})
