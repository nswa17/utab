export interface Style {
  id: number
  name: string
  team_num?: number
  score_weights?: number[]
  side_labels?: Record<string, string>
  side_labels_short?: Record<string, string>
  speaker_sequence?: Array<{ side: string; role: string }>
  range?: unknown[]
  adjudicator_range?: Record<string, number>
  roles?: Record<string, unknown>
  user_defined_data?: Record<string, unknown>
}
