import { describe, expect, it } from 'vitest'
import { applyClientBaselineDiff } from './compiled-diff'

describe('compiled diff utilities', () => {
  it('computes ranking and metric diffs against selected baseline rows', () => {
    const rows = applyClientBaselineDiff(
      [
        { id: 'team-a', ranking: 1, win: 4, sum: 300.2 },
        { id: 'team-b', ranking: 3, win: 2, sum: 280.1 },
      ],
      [
        { id: 'team-a', ranking: 2, win: 3, sum: 298.5 },
        { id: 'team-b', ranking: 1, win: 4, sum: 285.1 },
      ]
    )

    expect(rows[0]?.diff.ranking).toEqual({
      baseline: 2,
      delta: 1,
      trend: 'improved',
    })
    expect(rows[0]?.diff.metrics.win).toEqual({
      baseline: 3,
      delta: 1,
    })
    expect(rows[0]?.diff.metrics.sum).toEqual({
      baseline: 298.5,
      delta: 1.7,
    })
    expect(rows[1]?.diff.ranking.trend).toBe('worsened')
  })

  it('marks rows as new when baseline does not contain the id', () => {
    const rows = applyClientBaselineDiff([{ id: 'team-c', ranking: 5 }], [])
    expect(rows[0]?.diff.ranking.trend).toBe('new')
    expect(rows[0]?.diff.metrics).toEqual({})
  })
})
