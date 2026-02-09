export interface Submission {
  _id: string
  tournamentId: string
  round: number
  type: 'ballot' | 'feedback'
  payload: Record<string, unknown>
  submittedBy?: string
  createdAt?: string
  updatedAt?: string
}
