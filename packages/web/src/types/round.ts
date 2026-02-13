export type BreakCutoffTiePolicy = 'manual' | 'include_all' | 'strict'
export type BreakSeeding = 'high_low'

export interface BreakParticipant {
  teamId: string
  seed: number
}

export interface RoundBreakConfig {
  enabled: boolean
  source_rounds: number[]
  size: number
  cutoff_tie_policy: BreakCutoffTiePolicy
  seeding: BreakSeeding
  participants: BreakParticipant[]
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
  userDefinedData?: Record<string, any> & { break?: RoundBreakConfig }
  createdAt?: string
  updatedAt?: string
}
