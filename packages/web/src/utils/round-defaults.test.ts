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
      compile: {
        source: 'raw',
        source_rounds: [3, 2, 2, 1, -1],
        options: {
          winner_policy: 'score_only',
          missing_data_policy: 'exclude',
          include_labels: ['teams', 'speakers'],
        },
      },
    })
    expect(normalized.userDefinedData.evaluate_from_adjudicators).toBe(false)
    expect(normalized.userDefinedData.evaluator_in_team).toBe('speaker')
    expect(normalized.userDefinedData.score_by_matter_manner).toBe(false)
    expect(normalized.break.source).toBe('raw')
    expect(normalized.break.size).toBe(16)
    expect(normalized.break.cutoff_tie_policy).toBe('include_all')
    expect(normalized.break.seeding).toBe('high_low')
    expect(normalized.compile.source).toBe('raw')
    expect(normalized.compile.source_rounds).toEqual([1, 2, 3])
    expect(normalized.compile.options.winner_policy).toBe('score_only')
    expect(normalized.compile.options.missing_data_policy).toBe('exclude')
    expect(normalized.compile.options.include_labels).toEqual(['teams', 'speakers'])
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
      compile: {
        source: 'raw',
        source_rounds: [1],
        options: {
          ranking_priority: {
            preset: 'custom',
            order: ['sum', 'win', 'margin', 'vote', 'average', 'sd'],
          },
          winner_policy: 'score_only',
          tie_points: 0.25,
          duplicate_normalization: {
            merge_policy: 'latest',
            poi_aggregation: 'max',
            best_aggregation: 'average',
          },
          missing_data_policy: 'exclude',
          include_labels: ['teams', 'speakers'],
          diff_baseline: { mode: 'latest' },
        },
      },
    })
    expect(payload.evaluate_from_teams).toBe(false)
    expect(payload.no_speaker_score).toBe(true)
    expect(payload.break.enabled).toBe(false)
    expect(payload.break.size).toBe(12)
    expect(payload.break.cutoff_tie_policy).toBe('strict')
    expect(payload.compile.source).toBe('raw')
    expect(payload.compile.source_rounds).toEqual([1])
    expect(payload.compile.options.winner_policy).toBe('score_only')
    expect(payload.compile.options.include_labels).toEqual(['teams', 'speakers'])
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
      compile: {
        source: 'submissions',
        source_rounds: [],
        options: {
          ranking_priority: {
            preset: 'current',
            order: ['win', 'sum', 'margin', 'vote', 'average', 'sd'],
          },
          winner_policy: 'winner_id_then_score',
          tie_points: 0.5,
          duplicate_normalization: {
            merge_policy: 'average',
            poi_aggregation: 'average',
            best_aggregation: 'average',
          },
          missing_data_policy: 'warn',
          include_labels: ['teams', 'speakers', 'adjudicators', 'poi', 'best'],
          diff_baseline: { mode: 'latest' },
        },
      },
    })
    expect(serialized).toEqual(defaultRoundDefaults())
  })
})
