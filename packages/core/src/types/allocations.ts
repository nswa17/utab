import type { UserDefinedData } from './domain.js'

export interface AllocationSquare {
  id: number
  teams: number[]
  chairs?: number[]
  panels?: number[]
  trainees?: number[]
  venue?: number | null
}

export interface Draw {
  r: number
  allocation: AllocationSquare[]
  user_defined_data?: UserDefinedData
}

export interface LegacySquareTeams {
  og: number
  oo: number
  cg?: number
  co?: number
}

export interface LegacyAllocationSquare
  extends Omit<AllocationSquare, 'teams'> {
  teams: LegacySquareTeams
}

export interface LegacyDraw {
  r: number
  allocation: LegacyAllocationSquare[]
  user_defined_data?: UserDefinedData
}

export interface NumbersOfAdjudicators {
  chairs: number
  panels: number
  trainees: number
}

export interface AllocationConfig {
  name?: string
  style: {
    team_num: number
    score_weights?: number[]
  }
  preev_weights?: number[]
  institution_priority_map?: Record<number, number>
  institution_category_map?: Record<number, string>
}
