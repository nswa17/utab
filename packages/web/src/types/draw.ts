export interface DrawAllocationRow {
  venue?: string
  teams: {
    gov: string
    opp: string
  }
  chairs: string[]
  panels: string[]
  trainees: string[]
}

export interface Draw {
  _id: string
  tournamentId: string
  round: number
  allocation: DrawAllocationRow[]
  userDefinedData?: Record<string, any>
  drawOpened?: boolean
  allocationOpened?: boolean
  locked?: boolean
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}
