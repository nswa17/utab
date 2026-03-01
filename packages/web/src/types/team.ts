export interface TeamDetail {
  r: number
  available?: boolean
  conflicts?: string[]
  speakers?: string[]
}

export interface TeamTemplate {
  available?: boolean
  conflicts?: string[]
  speakers?: string[]
}

export interface Team {
  _id: string
  tournamentId: string
  name: string
  template?: TeamTemplate
  details?: TeamDetail[]
  userDefinedData?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}
