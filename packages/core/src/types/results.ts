import type { Side, StyleConfig, UserDefinedData } from './domain.js'

export interface RawSpeakerResult {
  id: number
  from_id: number
  r: number
  weight?: number
  scores: number[]
  user_defined_data?: UserDefinedData
}

export interface RawAdjudicatorResult {
  id: number
  from_id: number
  r: number
  weight?: number
  score: number
  judged_teams: number[]
  comment?: string
  user_defined_data?: UserDefinedData
}

export interface RawTeamResult {
  id: number
  from_id: number
  r: number
  weight?: number
  win: number
  opponents: number[]
  side: Side | string
  user_defined_data?: UserDefinedData
}

export interface SpeakerRoundResult {
  r: number
  id: number
  scores: number[]
  average: number
  sum: number
  ranking?: number
  user_defined_data_collection: UserDefinedData[]
}

export interface AdjudicatorRoundResult {
  r: number
  id: number
  score: number
  judged_teams: number[]
  comments: string[]
  ranking?: number
  user_defined_data_collection: UserDefinedData[]
}

export interface TeamRoundResult {
  r: number
  id: number
  win: number
  opponents: number[]
  side: Side | string
  sum: number | null
  opponent_average: number | null
  vote: number | null
  vote_rate: number | null
  acc: number
  margin: number | null
  ranking?: number
  user_defined_data_collection: UserDefinedData[]
}

export interface CompiledSpeakerResult {
  id: number
  average: number
  sum: number
  sd: number
  ranking?: number
  details: SpeakerRoundResult[]
}

export interface CompiledAdjudicatorResult {
  id: number
  average: number
  sd: number
  ranking?: number
  judged_teams: number[]
  active_num: number
  details: AdjudicatorRoundResult[]
}

export interface CompiledTeamResult {
  id: number
  win: number
  vote: number
  vote_rate: number
  ranking?: number
  details: TeamRoundResult[]
  past_opponents: number[]
  past_sides: Array<Side | string>
  sum: number | null
  margin: number | null
  average_margin: number | null
  average: number | null
  sd: number | null
  opponent_average: number | null
}

export interface ResultsSummaryStyle
  extends Pick<StyleConfig, 'team_num' | 'score_weights'> {}
