export interface VenueDetail {
  r: number
  available?: boolean
  priority?: number
}

export interface VenueTemplate {
  available?: boolean
  priority?: number
}

export interface Venue {
  _id: string
  tournamentId: string
  name: string
  template?: VenueTemplate
  details?: VenueDetail[]
  userDefinedData?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}
