import { describe, expect, it } from 'vitest'
import {
  buildRoundUserDefinedFromDefaults,
  defaultRoundDefaults,
  normalizeRoundDefaults,
  serializeRoundDefaults,
} from './round-defaults'

describe('round defaults', () => {
  it('falls back to defaults when input is invalid', () => {
    const normalized = normalizeRoundDefaults(null)
    expect(normalized).toEqual(defaultRoundDefaults())
  })

  it('normalizes partial values and guards invalid enums', () => {
    const normalized = normalizeRoundDefaults({
      userDefinedData: {
        evaluate_from_adjudicators: false,
        evaluator_in_team: 'speaker',
        score_by_matter_manner: false,
      },
      break: {
        source: 'raw',
        size: 16,
        cutoff_tie_policy: 'include_all',
        seeding: 'unsupported',
      },
    })
    expect(normalized.userDefinedData.evaluate_from_adjudicators).toBe(false)
    expect(normalized.userDefinedData.evaluator_in_team).toBe('speaker')
    expect(normalized.userDefinedData.score_by_matter_manner).toBe(false)
    expect(normalized.break.source).toBe('raw')
    expect(normalized.break.size).toBe(16)
    expect(normalized.break.cutoff_tie_policy).toBe('include_all')
    expect(normalized.break.seeding).toBe('high_low')
  })

  it('builds round userDefined payload with break template', () => {
    const payload = buildRoundUserDefinedFromDefaults({
      userDefinedData: {
        evaluate_from_adjudicators: true,
        evaluate_from_teams: false,
        chairs_always_evaluated: false,
        evaluator_in_team: 'team',
        no_speaker_score: true,
        score_by_matter_manner: false,
        poi: false,
        best: true,
        allow_low_tie_win: true,
      },
      break: {
        source: 'submissions',
        size: 12,
        cutoff_tie_policy: 'strict',
        seeding: 'high_low',
      },
    })
    expect(payload.evaluate_from_teams).toBe(false)
    expect(payload.no_speaker_score).toBe(true)
    expect(payload.break.enabled).toBe(false)
    expect(payload.break.size).toBe(12)
    expect(payload.break.cutoff_tie_policy).toBe('strict')
  })

  it('serializes through normalizer for stable persisted shape', () => {
    const serialized = serializeRoundDefaults({
      userDefinedData: {
        evaluate_from_adjudicators: true,
        evaluate_from_teams: true,
        chairs_always_evaluated: false,
        evaluator_in_team: 'team',
        no_speaker_score: false,
        score_by_matter_manner: true,
        poi: true,
        best: true,
        allow_low_tie_win: true,
      },
      break: {
        source: 'submissions',
        size: 8,
        cutoff_tie_policy: 'manual',
        seeding: 'high_low',
      },
    })
    expect(serialized).toEqual(defaultRoundDefaults())
  })
})
