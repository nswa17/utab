import { describe, expect, it } from 'vitest'
import { buildScoreChangeRounds, buildScoreChangeSeries } from './score-change'

describe('score-change utilities', () => {
  it('does not fallback to total score for rounds without detail when rounds are explicit', () => {
    const rounds = buildScoreChangeRounds({
      tournament: {
        rounds: [
          { round: 1, name: 'Round 1' },
          { round: 2, name: 'Round 2' },
          { round: 3, name: 'Round 3' },
        ],
      },
      results: [],
      roundLabel: (round) => `Round ${round}`,
    })
    const { series } = buildScoreChangeSeries({
      results: [
        {
          id: 'team-a',
          name: 'Team A',
          sum: 150,
          details: [
            { r: 1, sum: 70 },
            { r: 2, sum: 80 },
          ],
        },
      ],
      rounds,
      scoreKey: 'sum',
      fallbackRoundName: 'Total',
      entryName: (result) => String(result?.name ?? result?.id ?? 'Entry'),
    })
    expect(series[0]?.data).toEqual([70, 80, null])
  })

  it('matches details when round numbers are strings', () => {
    const rounds = buildScoreChangeRounds({
      tournament: { rounds: [{ round: 1 }, { round: 2 }] },
      results: [],
      roundLabel: (round) => `Round ${round}`,
    })
    const { series } = buildScoreChangeSeries({
      results: [
        {
          id: 'speaker-a',
          average: 150,
          details: [
            { r: '1', average: 74.5 },
            { r: '2', average: 75.5 },
          ],
        },
      ],
      rounds,
      scoreKey: 'average',
      fallbackRoundName: 'Total',
      entryName: (result) => String(result?.name ?? result?.id ?? 'Entry'),
    })
    expect(series[0]?.data).toEqual([74.5, 75.5])
  })

  it('falls back to overall score only when no explicit rounds exist', () => {
    const rounds = buildScoreChangeRounds({
      tournament: {},
      results: [{ id: 'team-a', sum: 123 }],
      roundLabel: (round) => `Round ${round}`,
    })
    const { rounds: safeRounds, series } = buildScoreChangeSeries({
      results: [{ id: 'team-a', name: 'Team A', sum: 123 }],
      rounds,
      scoreKey: 'sum',
      fallbackRoundName: 'Total',
      entryName: (result) => String(result?.name ?? result?.id ?? 'Entry'),
    })
    expect(safeRounds).toEqual([{ r: 1, name: 'Total' }])
    expect(series[0]?.data).toEqual([123])
  })
})
