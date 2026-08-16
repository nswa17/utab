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
    expect(normalized.userDefinedData.allow_low_tie_win).toBe(false)
  })

  it('normalizes partial values and guards invalid enums', () => {
    const normalized = normalizeRoundDefaults({
      userDefinedData: {
        evaluate_from_adjudicators: false,
        evaluator_in_team: 'speaker',
        score_by_matter_manner: false,
        best_min_count: 2,
        best_max_count: 3,
        poi_min_count: 1,
        poi_max_count: 4,
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
          tie_points: 0.25,
          missing_data_policy: 'exclude',
          include_labels: ['teams', 'speakers'],
        },
      },
    })
    expect(normalized.userDefinedData.evaluate_from_adjudicators).toBe(false)
    expect(normalized.userDefinedData.evaluator_in_team).toBe('speaker')
    expect(normalized.userDefinedData.score_by_matter_manner).toBe(false)
    expect(normalized.userDefinedData.best_min_count).toBe(2)
    expect(normalized.userDefinedData.best_max_count).toBe(3)
    expect(normalized.userDefinedData.poi_min_count).toBe(1)
    expect(normalized.userDefinedData.poi_max_count).toBe(4)
    expect(normalized.break.source).toBe('raw')
    expect(normalized.break.size).toBe(16)
    expect(normalized.break.cutoff_tie_policy).toBe('include_all')
    expect(normalized.break.seeding).toBe('fixed_bracket')
    expect(normalized.compile.source).toBe('raw')
    expect(normalized.compile.source_rounds).toEqual([1, 2, 3])
    expect(normalized.compile.options.winner_policy).toBe('score_only')
    expect(normalized.compile.options.tie_points).toBe(0.5)
    expect(normalized.compile.options.missing_data_policy).toBe('exclude')
    expect(normalized.compile.options.include_labels).toEqual(['teams', 'speakers'])
  })

  it('maps legacy high_low seeding to reseed_each_round', () => {
    const normalized = normalizeRoundDefaults({
      break: {
        seeding: 'high_low',
      },
    })
    expect(normalized.break.seeding).toBe('reseed_each_round')
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
        best_min_count: 1,
        best_max_count: 2,
        poi_min_count: 0,
        poi_max_count: 2,
        allow_low_tie_win: true,
        ballot_submitter_roles: ['chair', 'panel'],
      },
      break: {
        source: 'submissions',
        size: 12,
        cutoff_tie_policy: 'strict',
        seeding: 'fixed_bracket',
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
    expect(payload.best_min_count).toBe(1)
    expect(payload.best_max_count).toBe(2)
    expect(payload.poi_min_count).toBe(0)
    expect(payload.poi_max_count).toBe(2)
    expect(payload.break.size).toBe(12)
    expect(payload.break.cutoff_tie_policy).toBe('strict')
    expect(payload.compile.source).toBe('raw')
    expect(payload.compile.source_rounds).toEqual([1])
    expect(payload.compile.options.winner_policy).toBe('score_only')
    expect(payload.compile.options.tie_points).toBe(0.5)
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
        best_min_count: 1,
        best_max_count: 2,
        poi_min_count: 0,
        poi_max_count: 2,
        allow_low_tie_win: false,
        ballot_submitter_roles: ['chair', 'panel'],
      },
      break: {
        source: 'submissions',
        size: 8,
        cutoff_tie_policy: 'manual',
        seeding: 'fixed_bracket',
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
            merge_policy: 'latest',
            poi_aggregation: 'max',
            best_aggregation: 'max',
          },
          missing_data_policy: 'error',
          include_labels: ['teams', 'speakers', 'adjudicators', 'poi', 'best'],
          diff_baseline: { mode: 'latest' },
        },
      },
    })
    expect(serialized).toEqual(defaultRoundDefaults())
  })
})
