export interface Result {
  _id: string
  tournamentId: string
  round: number
  payload: Record<string, unknown>
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}
