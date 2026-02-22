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

export type FillRoundSubmissionsRequest = {
  round: number
}

export type FillRoundSubmissionsResponse = {
  tournamentId: string
  round: number
  expected: SubmissionCountSummary
  before: SubmissionCountSummary
  created: SubmissionCountSummary
  after: SubmissionCountSummary
}

export class DevToolsServiceError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'DevToolsServiceError'
    this.statusCode = statusCode
  }
}
