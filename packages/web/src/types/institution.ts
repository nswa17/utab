export interface Institution {
  _id: string
  tournamentId: string
  name: string
  category?: string
  priority?: number
  userDefinedData?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}
