export interface Institution {
  _id: string
  tournamentId: string
  name: string
  userDefinedData?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}
