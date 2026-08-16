import type { Submission } from '@/types/submission'

export type FeedbackExpectationSettings = {
  fromTeams: boolean
  fromAdjudicators: boolean
  evaluatorInTeam: 'team' | 'speaker'
  chairsAlwaysEvaluated: boolean
}

export type BallotSubmitterRole = 'chair' | 'panel' | 'trainee'

const DEFAULT_BALLOT_SUBMITTER_ROLES: BallotSubmitterRole[] = ['chair', 'panel']

export type SubmissionExpectationRow = {
  govTeamId: string
  oppTeamId: string
  teamIds: string[]
  chairIds: string[]
  panelIds: string[]
  traineeIds: string[]
  ballotSubmitterIds: string[]
  adjudicatorIds: string[]
}

export type SubmissionCoverage = {
  expected: number
  submitted: number
  missing: number
  duplicates: number
  unknown: number
}

export type RoundSubmissionCoverage = {
  ballot: SubmissionCoverage
  feedback: SubmissionCoverage
}

export type RoundSubmissionCoverageInput = {
  roundNumber: number
  allocation: unknown
  userDefinedData: unknown
  submissions: Submission[]
  resolveTeamSpeakerIds: (teamId: string, roundNumber: number) => string[]
}

function normalizeToken(value: unknown): string {
  return String(value ?? '').trim()
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

/**
 * Resolve the generic role policy for ballot submissions.  The absent-value
 * default preserves the historical chair + panel behaviour, while an empty
 * configured list intentionally means that no adjudicator role is expected to
 * submit a ballot.
 */
export function resolveBallotSubmitterRoles(userDefinedData: unknown): BallotSubmitterRole[] {
  const userDefined = asRecord(userDefinedData)
  if (Array.isArray(userDefined.ballot_submitter_roles)) {
    const roles: BallotSubmitterRole[] = []
    userDefined.ballot_submitter_roles.forEach((value) => {
      const role = String(value ?? '')
        .trim()
        .toLowerCase()
      if (role !== 'chair' && role !== 'panel' && role !== 'trainee') return
      if (!roles.includes(role)) roles.push(role)
    })
    return roles
  }

  // Compatibility for rounds saved before the role-set setting existed.
  if (typeof userDefined.allow_panel_ballot_submission === 'boolean') {
    return userDefined.allow_panel_ballot_submission
      ? [...DEFAULT_BALLOT_SUBMITTER_ROLES]
      : ['chair']
  }

  return [...DEFAULT_BALLOT_SUBMITTER_ROLES]
}

export function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(value.map((item) => normalizeToken(item)).filter((item) => item.length > 0))
  )
}

export function normalizeTeamPairKey(teamAId: string, teamBId: string): string {
  const left = normalizeToken(teamAId)
  const right = normalizeToken(teamBId)
  if (!left || !right) return ''
  const pair = [left, right].sort()
  return `${pair[0]}::${pair[1]}`
}

export function resolveFeedbackExpectationSettings(
  userDefinedData: unknown
): FeedbackExpectationSettings {
  const userDefined = asRecord(userDefinedData)
  return {
    fromTeams: userDefined.evaluate_from_teams !== false,
    fromAdjudicators: userDefined.evaluate_from_adjudicators !== false,
    evaluatorInTeam: userDefined.evaluator_in_team === 'speaker' ? 'speaker' : 'team',
    chairsAlwaysEvaluated: userDefined.chairs_always_evaluated === true,
  }
}

export function normalizeSubmissionExpectationRows(
  allocation: unknown,
  userDefinedData?: unknown
): SubmissionExpectationRow[] {
  if (!Array.isArray(allocation)) return []
  const ballotRoles = new Set(resolveBallotSubmitterRoles(userDefinedData))
  return allocation.map((raw) => {
    const row = asRecord(raw)
    const teams = asRecord(row.teams)
    const govTeamId = normalizeToken(teams.gov)
    const oppTeamId = normalizeToken(teams.opp)
    const teamIds = normalizeIdList([govTeamId, oppTeamId])
    const chairIds = normalizeIdList(row.chairs)
    const panelIds = normalizeIdList(row.panels)
    const traineeIds = normalizeIdList(row.trainees)
    const ballotSubmitterIds = normalizeIdList([
      ...(ballotRoles.has('chair') ? chairIds : []),
      ...(ballotRoles.has('panel') ? panelIds : []),
      ...(ballotRoles.has('trainee') ? traineeIds : []),
    ])
    const adjudicatorIds = normalizeIdList([...chairIds, ...panelIds, ...traineeIds])
    return {
      govTeamId,
      oppTeamId,
      teamIds,
      chairIds,
      panelIds,
      traineeIds,
      ballotSubmitterIds,
      adjudicatorIds,
    }
  })
}

function ballotSubmissionKey(actorId: string, teamAId: string, teamBId: string): string {
  const pairKey = normalizeTeamPairKey(teamAId, teamBId)
  if (!pairKey) return ''
  const actor = normalizeToken(actorId)
  if (!actor) return ''
  return `${actor}|${pairKey}`
}

function feedbackSubmissionKey(actorId: string, adjudicatorId: string): string {
  const actor = normalizeToken(actorId)
  const target = normalizeToken(adjudicatorId)
  if (!actor || !target) return ''
  return `${actor}|${target}`
}

function expectedBallotKeys(rows: SubmissionExpectationRow[]): Set<string> {
  const keys = new Set<string>()
  rows.forEach((row) => {
    row.ballotSubmitterIds.forEach((submittedEntityId) => {
      const key = ballotSubmissionKey(submittedEntityId, row.govTeamId, row.oppTeamId)
      if (key) keys.add(key)
    })
  })
  return keys
}

function expectedFeedbackKeysForRow(params: {
  roundNumber: number
  row: SubmissionExpectationRow
  settings: FeedbackExpectationSettings
  resolveTeamSpeakerIds: (teamId: string, roundNumber: number) => string[]
}): Set<string> {
  const { roundNumber, row, settings, resolveTeamSpeakerIds } = params
  const keys = new Set<string>()

  const targetsFromTeams = settings.chairsAlwaysEvaluated
    ? row.chairIds
    : normalizeIdList([...row.chairIds, ...row.panelIds])

  if (settings.fromTeams && targetsFromTeams.length > 0) {
    const teamEvaluators =
      settings.evaluatorInTeam === 'speaker'
        ? normalizeIdList(
            row.teamIds.flatMap((teamId) => resolveTeamSpeakerIds(teamId, roundNumber))
          )
        : row.teamIds
    teamEvaluators.forEach((submittedEntityId) => {
      targetsFromTeams.forEach((adjudicatorId) => {
        const key = feedbackSubmissionKey(submittedEntityId, adjudicatorId)
        if (key) keys.add(key)
      })
    })
  }

  if (settings.fromAdjudicators && row.adjudicatorIds.length > 1) {
    row.adjudicatorIds.forEach((submittedEntityId) => {
      row.adjudicatorIds.forEach((adjudicatorId) => {
        if (submittedEntityId === adjudicatorId) return
        const key = feedbackSubmissionKey(submittedEntityId, adjudicatorId)
        if (key) keys.add(key)
      })
    })
  }

  return keys
}

function expectedFeedbackKeys(params: {
  roundNumber: number
  rows: SubmissionExpectationRow[]
  settings: FeedbackExpectationSettings
  resolveTeamSpeakerIds: (teamId: string, roundNumber: number) => string[]
}): Set<string> {
  const keys = new Set<string>()
  params.rows.forEach((row) => {
    expectedFeedbackKeysForRow({
      roundNumber: params.roundNumber,
      row,
      settings: params.settings,
      resolveTeamSpeakerIds: params.resolveTeamSpeakerIds,
    }).forEach((key) => keys.add(key))
  })
  return keys
}

export function expectedFeedbackCountForRow(params: {
  roundNumber: number
  row: SubmissionExpectationRow
  settings: FeedbackExpectationSettings
  resolveTeamSpeakerIds: (teamId: string, roundNumber: number) => string[]
}): number {
  return expectedFeedbackKeysForRow(params).size
}

function resolveSubmissionActorId(submission: Submission): string {
  const payloadActor = normalizeToken(submission?.payload?.submittedEntityId)
  if (payloadActor) return payloadActor
  return normalizeToken(submission?.submittedBy)
}

function analyzeSubmissionCoverage(params: {
  submissions: Submission[]
  type: 'ballot' | 'feedback'
  expectedKeys: Set<string>
  toKey: (submission: Submission, actorId: string) => string
}): SubmissionCoverage {
  const submittedKeys = new Set<string>()
  let duplicates = 0
  let unknown = 0

  params.submissions.forEach((submission) => {
    if (submission.type !== params.type) return
    const actorId = resolveSubmissionActorId(submission)
    if (!actorId) {
      unknown += 1
      return
    }
    const key = params.toKey(submission, actorId)
    if (!key) {
      duplicates += 1
      return
    }
    if (!params.expectedKeys.has(key)) {
      duplicates += 1
      return
    }
    if (submittedKeys.has(key)) {
      duplicates += 1
      return
    }
    submittedKeys.add(key)
  })

  const expected = params.expectedKeys.size
  const submitted = submittedKeys.size
  return {
    expected,
    submitted,
    missing: Math.max(0, expected - submitted),
    duplicates,
    unknown,
  }
}

export function buildRoundSubmissionCoverage(
  input: RoundSubmissionCoverageInput
): RoundSubmissionCoverage {
  const rows = normalizeSubmissionExpectationRows(input.allocation, input.userDefinedData)
  const settings = resolveFeedbackExpectationSettings(input.userDefinedData)
  const ballotKeys = expectedBallotKeys(rows)
  const feedbackKeys = expectedFeedbackKeys({
    roundNumber: input.roundNumber,
    rows,
    settings,
    resolveTeamSpeakerIds: input.resolveTeamSpeakerIds,
  })

  return {
    ballot: analyzeSubmissionCoverage({
      submissions: input.submissions,
      type: 'ballot',
      expectedKeys: ballotKeys,
      toKey: (submission, actorId) => {
        const payload = asRecord(submission.payload)
        return ballotSubmissionKey(
          actorId,
          String(payload.teamAId ?? ''),
          String(payload.teamBId ?? '')
        )
      },
    }),
    feedback: analyzeSubmissionCoverage({
      submissions: input.submissions,
      type: 'feedback',
      expectedKeys: feedbackKeys,
      toKey: (submission, actorId) => {
        const payload = asRecord(submission.payload)
        return feedbackSubmissionKey(actorId, String(payload.adjudicatorId ?? ''))
      },
    }),
  }
}
