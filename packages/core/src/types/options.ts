import type { NumbersOfAdjudicators } from './allocations.js'

export interface TeamDrawAlgorithmOptions {
  filters?: string[]
  method?: 'original' | 'straight' | 'weighted' | 'custom'
  weights?: number[]
  pairing_method?: string
  pullup_method?: string
  position_method?: string
  avoid_conflict?: boolean
  odd_bracket?: string
  avoid_conflicts?: string | boolean
  conflict_weights?: { institution?: number; past_opponent?: number }
  max_swap_iterations?: number
}

export interface AdjudicatorDrawAlgorithmOptions {
  filters?: string[]
  assign?:
    | 'high_to_high'
    | 'high_to_slight'
    | 'high_to_close'
    | 'middle_to_high'
    | 'middle_to_slight'
    | 'middle_to_close'
  scatter?: boolean
}

export interface VenueDrawAlgorithmOptions {
  shuffle?: boolean
}

export interface DrawGetOptions {
  team_allocation_algorithm?: 'standard' | 'strict' | 'powerpair'
  team_allocation_algorithm_options?: TeamDrawAlgorithmOptions
  adjudicator_allocation_algorithm?: 'standard' | 'traditional'
  adjudicator_allocation_algorithm_options?: AdjudicatorDrawAlgorithmOptions
  venue_allocation_algorithm_options?: VenueDrawAlgorithmOptions
  numbers_of_adjudicators?: NumbersOfAdjudicators
}
