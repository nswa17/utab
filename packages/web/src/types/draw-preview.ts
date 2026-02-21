export type DrawPreviewSubmissionRow = {
  key: string
  submissionId?: string
  submittedByLabel: string
  summaryLabel: string
  submittedAtLabel: string
}

export type DrawPreviewSubmissionDetail = {
  team: DrawPreviewSubmissionRow[]
  judge: DrawPreviewSubmissionRow[]
}

export type DrawPreviewRow = {
  key: string
  matchIndex: number
  venuePriority: number
  venueLabel: string
  govName: string
  oppName: string
  winLabel: string
  winTotal: number
  winGap: number
  chairsLabel: string
  panelsLabel: string
  traineesLabel: string
  teamSubmissionCount?: number
  teamSubmissionExpectedCount?: number
  judgeSubmissionCount?: number
  judgeSubmissionExpectedCount?: number
  submissionDetail?: DrawPreviewSubmissionDetail
}
