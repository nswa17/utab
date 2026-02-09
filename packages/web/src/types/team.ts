export interface Speaker {
  name: string
}

export interface TeamDetail {
  r: number
  available?: boolean
  institutions?: string[]
  speakers?: string[]
}

export interface Team {
  _id: string
  tournamentId: string
  name: string
  institution?: string
  speakers: Speaker[]
  details?: TeamDetail[]
  userDefinedData?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}
