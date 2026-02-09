export interface Round {
  _id: string
  tournamentId: string
  round: number
  name?: string
  motions?: string[]
  motionOpened?: boolean
  teamAllocationOpened?: boolean
  adjudicatorAllocationOpened?: boolean
  weightsOfAdjudicators?: {
    chair: number
    panel: number
    trainee: number
  }
  userDefinedData?: Record<string, any>
  createdAt?: string
  updatedAt?: string
}
