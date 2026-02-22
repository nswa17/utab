import { api } from '@/utils/api'

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

export async function requestFillSetup(
  tournamentId: string,
  payload: FillSetupRequest
): Promise<FillSetupResponse> {
  const response = await api.post(`/dev-tools/tournaments/${tournamentId}/fill-setup`, payload)
  return response.data?.data as FillSetupResponse
}

export async function requestFillRoundSubmissions(
  tournamentId: string,
  payload: FillRoundSubmissionsRequest
): Promise<FillRoundSubmissionsResponse> {
  const response = await api.post(
    `/dev-tools/tournaments/${tournamentId}/fill-round-submissions`,
    payload
  )
  return response.data?.data as FillRoundSubmissionsResponse
}
