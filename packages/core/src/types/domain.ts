export type UserDefinedData = Record<string, unknown>

export type Side = 'gov' | 'opp' | 'og' | 'oo' | 'cg' | 'co'

export interface StyleConfig {
  id?: string
  name?: string
  team_num: number
  positions?: string[]
  positions_short?: string[]
  score_weights: number[]
}

export interface RoundDetailBase {
  r: number
  available?: boolean
  [key: string]: unknown
}

export interface TeamRoundDetail extends RoundDetailBase {
  conflicts?: number[]
  speakers?: number[]
}

export interface AdjudicatorRoundDetail extends RoundDetailBase {
  conflicts?: number[]
  conflict_teams?: number[]
}

export interface VenueRoundDetail extends RoundDetailBase {
  priority?: number
}

export interface TeamEntity {
  id: number
  name?: string
  details: TeamRoundDetail[]
  user_defined_data?: UserDefinedData
}

export interface AdjudicatorEntity {
  id: number
  name?: string
  preev: number
  details: AdjudicatorRoundDetail[]
  user_defined_data?: UserDefinedData
}

export interface VenueEntity {
  id: number
  name?: string
  details: VenueRoundDetail[]
  user_defined_data?: UserDefinedData
}

export interface SpeakerEntity {
  id: number
  name?: string
  user_defined_data?: UserDefinedData
}

export interface InstitutionEntity {
  id: number
  name?: string
  category?: string
  priority?: number
  user_defined_data?: UserDefinedData
}
