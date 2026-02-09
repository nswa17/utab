export interface VenueDetail {
  r: number
  available?: boolean
  priority?: number
}

export interface Venue {
  _id: string
  tournamentId: string
  name: string
  details?: VenueDetail[]
  userDefinedData?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}
