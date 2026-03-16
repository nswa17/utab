import { describe, expect, it } from 'vitest'
import { formatAllocationRequestError } from './allocation-request-errors'

describe('formatAllocationRequestError', () => {
  it('formats English NeedMore adjudicator errors with local counts', () => {
    expect(
      formatAllocationRequestError({
        locale: 'ja',
        message: 'At least 2 more available adjudicators are needed',
        availableCountByRole: { adjudicator: 3 },
      })
    ).toBe(
      '使用可能ジャッジが足りません。必要 5 人 / 使用可能 3 人です。人数設定か availability を見直してください。'
    )
  })

  it('fills placeholder-style Japanese adjudicator errors from fallback counts', () => {
    expect(
      formatAllocationRequestError({
        locale: 'ja',
        errorName: 'NeedMoreAdjudicator',
        message:
          '使用可能ジャッジが足りません。必要 {required} 人 / 使用可能 {available} 人です。人数設定か availability を見直してください。',
        availableCountByRole: { adjudicator: 0 },
        requiredCountByRole: { adjudicator: 1 },
      })
    ).toBe(
      '使用可能ジャッジが足りません。必要 1 人 / 使用可能 0 人です。人数設定か availability を見直してください。'
    )
  })

  it('returns an English message outside Japanese locale', () => {
    expect(
      formatAllocationRequestError({
        locale: 'en',
        message: 'At least 1 more available venues are needed',
        availableCountByRole: { venue: 2 },
      })
    ).toBe(
      'Not enough available venues. Required 3; available 2. Review the headcount settings or availability.'
    )
  })

  it('returns null for unrelated errors', () => {
    expect(
      formatAllocationRequestError({
        locale: 'ja',
        message: 'Route not found',
      })
    ).toBeNull()
  })
})
