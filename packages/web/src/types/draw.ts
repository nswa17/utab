import type { DrawTeamRecord } from '@/utils/draw-teams'

export interface DrawAllocationRow {
  venue?: string
  teams: DrawTeamRecord
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
