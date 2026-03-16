import { describe, expect, it } from 'vitest'
import { validateAllocationOptions } from '../src/controllers/shared/allocation-validation.js'

describe('validateAllocationOptions', () => {
  it('accepts class_based adjudicator allocation with arbitrary adjudicator counts', () => {
    const validated = validateAllocationOptions({
      adjudicator_allocation_algorithm: 'class_based',
      adjudicator_allocation_algorithm_options: {
        filters: ['by_strength', 'by_past'],
      },
      numbers_of_adjudicators: {
        chairs: 2,
        panels: 2,
        trainees: 1,
      },
    })

    expect(validated.adjudicator_allocation_algorithm).toBe('class_based')
    expect(validated.numbers_of_adjudicators).toEqual({
      chairs: 2,
      panels: 2,
      trainees: 1,
    })
    expect(validated.adjudicator_allocation_algorithm_options).toEqual({
      filters: ['by_strength', 'by_past'],
    })
  })

  it('accepts random team and adjudicator allocation with empty option payloads', () => {
    const validated = validateAllocationOptions({
      team_allocation_algorithm: 'random',
      team_allocation_algorithm_options: {},
      adjudicator_allocation_algorithm: 'random',
      adjudicator_allocation_algorithm_options: {},
      numbers_of_adjudicators: {
        chairs: 1,
        panels: 1,
        trainees: 0,
      },
    })

    expect(validated.team_allocation_algorithm).toBe('random')
    expect(validated.team_allocation_algorithm_options).toEqual({})
    expect(validated.adjudicator_allocation_algorithm).toBe('random')
    expect(validated.adjudicator_allocation_algorithm_options).toEqual({})
  })

  it('rejects non-warning team filters for min_warnings', () => {
    expect(() =>
      validateAllocationOptions({
        team_allocation_algorithm: 'min_warnings',
        team_allocation_algorithm_options: {
          filters: ['by_random'],
        },
      })
    ).toThrow('Invalid team min_warnings options')
  })
})
