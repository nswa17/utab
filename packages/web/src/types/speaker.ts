export interface Speaker {
  _id: string
  tournamentId: string
  name: string
  userDefinedData?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}
