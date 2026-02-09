export interface AdjudicatorDetail {
  r: number
  available?: boolean
  institutions?: string[]
  conflicts?: string[]
}

export interface Adjudicator {
  _id: string
  tournamentId: string
  name: string
  strength: number
  active: boolean
  preev?: number
  details?: AdjudicatorDetail[]
  userDefinedData?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}
