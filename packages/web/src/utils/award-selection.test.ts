import { describe, expect, it } from 'vitest'
import {
  buildAwardSelectionUserDefinedData,
  resolveRoundAwardSelectionValidationRules,
  validateAwardSelectionCounts,
} from './award-selection'

describe('award selection utilities', () => {
  it('uses PDA-friendly defaults when values are missing', () => {
    expect(buildAwardSelectionUserDefinedData(undefined)).toEqual({
      best_min_count: 1,
      best_max_count: 2,
      poi_min_count: 0,
      poi_max_count: 2,
    })
  })

  it('normalizes invalid ranges to non-negative min/max pairs', () => {
    expect(
      buildAwardSelectionUserDefinedData({
        best_min_count: 3,
        best_max_count: 1,
        poi_min_count: -1,
        poi_max_count: 1,
      })
    ).toEqual({
      best_min_count: 3,
      best_max_count: 3,
      poi_min_count: 0,
      poi_max_count: 1,
    })
  })

  it('disables award validation when speaker scores are disabled', () => {
    expect(
      resolveRoundAwardSelectionValidationRules({
        no_speaker_score: true,
        best: true,
        poi: true,
      })
    ).toEqual({
      best: { enabled: false, min: 1, max: 2 },
      poi: { enabled: false, min: 0, max: 2 },
    })
  })

  it('reports the first violated selection count', () => {
    const violation = validateAwardSelectionCounts(
      {
        bestA: [false, false],
        bestB: [false, false],
        poiA: [true, true],
        poiB: [true],
      },
      {
        best: { enabled: true, min: 1, max: 2 },
        poi: { enabled: true, min: 0, max: 2 },
      }
    )
    expect(violation).toEqual({
      kind: 'best',
      count: 0,
      min: 1,
      max: 2,
    })
  })
})
