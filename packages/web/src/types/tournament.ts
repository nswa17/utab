export interface Tournament {
  _id: string
  name: string
  style: number
  hidden?: boolean
  options?: Record<string, unknown>
  total_round_num?: number
  current_round_num?: number
  preev_weights?: number[]
  auth?: Record<string, any>
  user_defined_data?: Record<string, any>
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}
