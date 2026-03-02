export interface AdjudicatorDetail {
  r: number
  available?: boolean
  conflicts?: string[]
  conflict_teams?: string[]
}

export interface AdjudicatorTemplate {
  available?: boolean
  conflicts?: string[]
  conflict_teams?: string[]
}

export interface Adjudicator {
  _id: string
  tournamentId: string
  name: string
  preev?: number
  template?: AdjudicatorTemplate
  details?: AdjudicatorDetail[]
  userDefinedData?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}
