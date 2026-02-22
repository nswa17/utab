import { describe, expect, it } from 'vitest'
import {
  formatCompiledSnapshotOptionLabel,
  formatCompiledSnapshotTimestamp,
  resolveLatestCompiledIdContainingRound,
  resolvePreviousCompiledId,
} from './compiled-snapshot'

describe('compiled-snapshot', () => {
  it('formats snapshot options as Round list + timestamp', () => {
    const label = formatCompiledSnapshotOptionLabel(
      {
        rounds: [2, 1, 2],
        createdAt: '2026-02-16T15:09:00.000Z',
      },
      'ja-JP'
    )
    expect(label.startsWith('Round 1, Round 2')).toBe(true)
    expect(label).toContain('(')
    expect(label).toContain(')')
  })

  it('falls back to placeholder timestamp when missing', () => {
    expect(formatCompiledSnapshotTimestamp(undefined)).toBe('--/-- --:--')
    expect(formatCompiledSnapshotTimestamp('invalid-date')).toBe('--/-- --:--')
  })

  it('resolves the previous snapshot id from current snapshot', () => {
    const previous = resolvePreviousCompiledId(
      [
        { compiledId: 'c3', rounds: [1, 2, 3], createdAt: '2026-02-16T12:00:00.000Z' },
        { compiledId: 'c2', rounds: [1, 2], createdAt: '2026-02-16T11:00:00.000Z' },
        { compiledId: 'c1', rounds: [1], createdAt: '2026-02-16T10:00:00.000Z' },
      ],
      'c3'
    )
    expect(previous).toBe('c2')
  })

  it('resolves the latest snapshot including target round with recency fallback', () => {
    const target = resolveLatestCompiledIdContainingRound(
      [
        { compiledId: 'c3', rounds: [1, 2, 3], createdAt: '2026-02-16T12:00:00.000Z' },
        { compiledId: 'c2', rounds: [1, 2], createdAt: '2026-02-16T11:00:00.000Z' },
        { compiledId: 'c1', rounds: [1], createdAt: '2026-02-16T10:00:00.000Z' },
      ],
      2
    )
    expect(target).toBe('c3')
    const fallback = resolveLatestCompiledIdContainingRound(
      [
        { compiledId: 'c2', rounds: [1, 2], createdAt: '2026-02-16T11:00:00.000Z' },
        { compiledId: 'c1', rounds: [1], createdAt: '2026-02-16T10:00:00.000Z' },
      ],
      99
    )
    expect(fallback).toBe('c2')
  })
})
