import { describe, expect, it } from 'vitest'
import {
  buildSubmissionDelayRows,
  buildJudgeStrictnessRows,
  buildSubmissionSpeedRows,
  buildVolatilityRows,
  formatVolatilityTrajectory,
} from './insights'

describe('insights utilities', () => {
  it('builds volatility rows from round rankings', () => {
    const rows = buildVolatilityRows([
      {
        id: 'team-a',
        details: [
          { r: 1, ranking: 1 },
          { r: 2, ranking: 4 },
          { r: 3, ranking: 2 },
        ],
      },
      {
        id: 'team-b',
        details: [
          { r: 1, ranking: 2 },
          { r: 2, ranking: 2 },
          { r: 3, ranking: 3 },
        ],
      },
    ])

    expect(rows).toHaveLength(2)
    expect(rows[0]?.id).toBe('team-a')
    expect(rows[0]?.score).toBe(2.5)
    expect(rows[0]?.maxJump).toBe(3)
    expect(rows[0]?.abrupt).toBe(true)
    expect(rows[0]?.trajectory).toEqual([1, 4, 2])
  })

  it('falls back to overall ranking when round details are missing', () => {
    const rows = buildVolatilityRows([{ id: 'team-a', ranking: 3 }])
    expect(rows[0]?.score).toBe(0)
    expect(rows[0]?.trajectory).toEqual([3])
  })

  it('formats trajectory text', () => {
    expect(formatVolatilityTrajectory([1, 3, 2])).toBe('1→3→2')
    expect(formatVolatilityTrajectory([])).toBe('—')
  })

  it('builds judge strictness rows with z-score outliers', () => {
    const rows = buildJudgeStrictnessRows([
      { id: 'adj-a', average: 72 },
      { id: 'adj-b', average: 75 },
      { id: 'adj-c', average: 84 },
    ])
    expect(rows[0]?.id).toBe('adj-c')
    expect(rows[0]?.direction).toBe('lenient')
    expect(rows[0]?.outlier).toBe(true)
    expect(rows[rows.length - 1]?.id).toBe('adj-b')
  })

  it('builds submission speed rows by round', () => {
    const rows = buildSubmissionSpeedRows([
      { round: 1, createdAt: '2026-02-16T09:00:00.000Z' },
      { round: 1, createdAt: '2026-02-16T09:10:00.000Z' },
      { round: 1, createdAt: '2026-02-16T09:50:00.000Z' },
      { round: 2, createdAt: '2026-02-16T10:00:00.000Z' },
      { round: 2, createdAt: '2026-02-16T10:05:00.000Z' },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]?.round).toBe(1)
    expect(rows[0]?.sampleCount).toBe(3)
    expect(rows[0]?.medianMinutes).toBe(10)
    expect(rows[0]?.p90Minutes).toBe(42)
    expect(rows[0]?.status).toBe('warn')
  })

  it('builds delayed submission drill-down rows', () => {
    const rows = buildSubmissionDelayRows([
      {
        round: 1,
        createdAt: '2026-02-16T09:00:00.000Z',
        type: 'ballot',
        payload: { submittedEntityId: 'adj-a' },
      },
      {
        round: 1,
        createdAt: '2026-02-16T09:46:00.000Z',
        type: 'ballot',
        payload: { submittedEntityId: 'adj-b' },
      },
      {
        round: 1,
        createdAt: '2026-02-16T09:38:00.000Z',
        type: 'feedback',
        payload: { submittedEntityId: 'team-a' },
      },
      {
        round: 2,
        createdAt: '2026-02-16T10:00:00.000Z',
        type: 'feedback',
        payload: { submittedEntityId: 'team-c' },
      },
      {
        round: 2,
        createdAt: '2026-02-16T10:35:00.000Z',
        type: 'feedback',
        payload: { submittedEntityId: 'team-d' },
      },
    ])
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      round: 1,
      id: 'adj-b',
      type: 'ballot',
      elapsedMinutes: 46,
    })
    expect(rows[1]).toMatchObject({
      round: 1,
      id: 'team-a',
      type: 'feedback',
      elapsedMinutes: 38,
    })
    expect(rows[2]).toMatchObject({
      round: 2,
      id: 'team-d',
      type: 'feedback',
      elapsedMinutes: 35,
    })
  })
})
