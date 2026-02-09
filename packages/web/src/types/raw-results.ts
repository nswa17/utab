export interface RawTeamResult {
  _id?: string
  tournamentId: string
  id: string
  from_id: string
  r: number
  weight?: number
  win: number
  side?: string
  opponents?: string[]
  scores?: number[]
  judged_teams?: string[]
  user_defined_data?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}

export interface RawSpeakerResult {
  _id?: string
  tournamentId: string
  id: string
  from_id: string
  r: number
  weight?: number
  scores: number[]
  user_defined_data?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}

export interface RawAdjudicatorResult {
  _id?: string
  tournamentId: string
  id: string
  from_id: string
  r: number
  weight?: number
  score: number
  judged_teams?: string[]
  comment?: string
  user_defined_data?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}
