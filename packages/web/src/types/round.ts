import type { CompileOptions } from '@/types/compiled'

export type BreakCutoffTiePolicy = 'manual' | 'include_all' | 'strict'
export type BreakSeeding =
  | 'high_low'
  | 'reseed_each_round'
  | 'fixed_bracket'
  | 'random_within_tie_group'
  | 'random_full'

export interface BreakParticipant {
  teamId: string
  seed: number
}

export interface RoundBreakConfig {
  source_rounds: number[]
  size: number
  cutoff_tie_policy: BreakCutoffTiePolicy
  seeding: BreakSeeding
  participants: BreakParticipant[]
}

export interface RoundCompileConfig {
  source: 'submissions' | 'raw'
  source_rounds: number[]
  options: CompileOptions
}

export interface Round {
  _id: string
  tournamentId: string
  round: number
  name?: string
  motions?: string[]
  motionOpened?: boolean
  teamAllocationOpened?: boolean
  adjudicatorAllocationOpened?: boolean
  weightsOfAdjudicators?: {
    chair: number
    panel: number
    trainee: number
  }
  userDefinedData?: Record<string, any> & {
    break_round?: boolean
    break?: RoundBreakConfig
    compile?: RoundCompileConfig
  }
  createdAt?: string
  updatedAt?: string
}
