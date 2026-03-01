export type SetupCountSummary = {
  teams: number
  speakers: number
  adjudicators: number
  venues: number
  institutions: number
  rounds: number
}

export type FillSetupRequest = {
  targetTeams: number
  targetAdjudicators: number
  targetVenues: number
  targetInstitutions: number
  speakersPerTeam: number
}

export type FillSetupResponse = {
  tournamentId: string
  before: SetupCountSummary
  created: SetupCountSummary
  after: SetupCountSummary
  request: FillSetupRequest
}

export type SubmissionCountSummary = {
  ballot: number
  feedback: number
  total: number
}

export type FillRoundSubmissionsMode =
  | 'all'
  | 'ballot'
  | 'feedback'
  | 'team_feedback'
  | 'adjudicator_feedback'

export type FillRoundSubmissionsRequest = {
  round: number
  mode?: FillRoundSubmissionsMode
}

export type FillRoundSubmissionsResponse = {
  tournamentId: string
  round: number
  mode: FillRoundSubmissionsMode
  expected: SubmissionCountSummary
  before: SubmissionCountSummary
  created: SubmissionCountSummary
  after: SubmissionCountSummary
}

export type ClearRoundSubmissionsResponse = {
  tournamentId: string
  round: number
  before: SubmissionCountSummary
  deleted: SubmissionCountSummary
  after: SubmissionCountSummary
}

export type CopiedCollectionSummary = {
  name: string
  count: number
}

export type CopyTournamentResponse = {
  sourceTournamentId: string
  tournamentId: string
  sourceTournamentName: string
  tournamentName: string
  copiedCollections: CopiedCollectionSummary[]
  copiedDocuments: number
}

export class DevToolsServiceError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'DevToolsServiceError'
    this.statusCode = statusCode
  }
}
