import type { Submission } from '@/types/submission'

export type DetailedResultsExportRow = {
  record_type: 'ballot_speaker' | 'ballot_summary' | 'feedback'
  round: number
  round_name: string
  submission_id: string
  submitted_at: string
  voted_by_id: string
  voted_by_name: string
  matchup: string
  team_a: string
  team_b: string
  side: string
  winner: string
  speaker_order: string
  speaker_id: string
  speaker_name: string
  matter: string
  manner: string
  score: string
  best_debater: string
  poi: string
  feedback_target_id: string
  feedback_target_name: string
  comment: string
}

export type DetailedResultsExportResolvers = {
  resolveRoundName: (round: number) => string
  resolveTeamName: (teamId: string) => string
  resolveSpeakerName: (speakerId: string) => string
  resolveAdjudicatorName: (adjudicatorId: string) => string
  resolveEntityName: (entityId: string) => string
  resolveBallotSide: (round: number, teamAId: string, teamBId: string, slot: 'A' | 'B') => string
}

export const DETAILED_RESULTS_EXPORT_COLUMNS = [
  'record_type',
  'round',
  'round_name',
  'submission_id',
  'submitted_at',
  'voted_by_id',
  'voted_by_name',
  'matchup',
  'team_a',
  'team_b',
  'side',
  'winner',
  'speaker_order',
  'speaker_id',
  'speaker_name',
  'matter',
  'manner',
  'score',
  'best_debater',
  'poi',
  'feedback_target_id',
  'feedback_target_name',
  'comment',
] as const

export type DetailedResultsExportLabels = Record<
  (typeof DETAILED_RESULTS_EXPORT_COLUMNS)[number],
  string
>

export const DEFAULT_DETAILED_RESULTS_EXPORT_LABELS: DetailedResultsExportLabels = {
  record_type: 'Record type',
  round: 'Round',
  round_name: 'Round name',
  submission_id: 'Submission ID',
  submitted_at: 'Submitted at',
  voted_by_id: 'Voted by ID',
  voted_by_name: 'Voted by',
  matchup: 'Match',
  team_a: 'Team A',
  team_b: 'Team B',
  side: 'Side',
  winner: 'Winner',
  speaker_order: 'Speaker order',
  speaker_id: 'Speaker ID',
  speaker_name: 'Speaker',
  matter: 'Matter',
  manner: 'Manner',
  score: 'Score',
  best_debater: 'Best Debater',
  poi: 'POI',
  feedback_target_id: 'Feedback target ID',
  feedback_target_name: 'Feedback target',
  comment: 'Comment',
}

function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function numberText(value: unknown): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? String(parsed) : ''
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function boolText(value: unknown): string {
  return value === true ? 'true' : value === false ? 'false' : ''
}

function resolveOrFallback(resolve: (id: string) => string, id: string): string {
  if (!id) return ''
  return text(resolve(id)) || id
}

function rowSortKey(row: DetailedResultsExportRow): [number, string, string, string] {
  return [row.round, row.submitted_at, row.submission_id, row.speaker_order]
}

function compareRows(left: DetailedResultsExportRow, right: DetailedResultsExportRow): number {
  const leftKey = rowSortKey(left)
  const rightKey = rowSortKey(right)
  for (let index = 0; index < leftKey.length; index += 1) {
    const leftPart = leftKey[index]
    const rightPart = rightKey[index]
    if (leftPart === rightPart) continue
    return typeof leftPart === 'number' && typeof rightPart === 'number'
      ? leftPart - rightPart
      : String(leftPart).localeCompare(String(rightPart))
  }
  return left.record_type.localeCompare(right.record_type)
}

function createBaseRow(
  submission: Submission,
  resolvers: DetailedResultsExportResolvers
): Omit<
  DetailedResultsExportRow,
  | 'record_type'
  | 'matchup'
  | 'team_a'
  | 'team_b'
  | 'side'
  | 'winner'
  | 'speaker_order'
  | 'speaker_id'
  | 'speaker_name'
  | 'matter'
  | 'manner'
  | 'score'
  | 'best_debater'
  | 'poi'
  | 'feedback_target_id'
  | 'feedback_target_name'
> {
  const payload = (submission.payload ?? {}) as Record<string, unknown>
  const votedById = text(payload.submittedEntityId) || text(submission.submittedBy)
  return {
    round: Number(submission.round),
    round_name: text(resolvers.resolveRoundName(Number(submission.round))),
    submission_id: text(submission._id),
    submitted_at: text(submission.createdAt),
    voted_by_id: votedById,
    voted_by_name: votedById ? resolveOrFallback(resolvers.resolveEntityName, votedById) : '',
    comment: text(payload.comment),
  }
}

export function buildDetailedResultsExportRows(
  submissions: Submission[],
  resolvers: DetailedResultsExportResolvers
): DetailedResultsExportRow[] {
  const rows: DetailedResultsExportRow[] = []

  submissions.forEach((submission) => {
    const round = Number(submission.round)
    if (!Number.isInteger(round) || round < 1) return
    const payload = (submission.payload ?? {}) as Record<string, unknown>
    const base = createBaseRow(submission, resolvers)

    if (submission.type === 'feedback') {
      const targetId = text(payload.adjudicatorId)
      rows.push({
        ...base,
        record_type: 'feedback',
        matchup: '',
        team_a: '',
        team_b: '',
        side: '',
        winner: '',
        speaker_order: '',
        speaker_id: '',
        speaker_name: '',
        matter: numberText(payload.matter),
        manner: numberText(payload.manner),
        score: numberText(payload.score),
        best_debater: '',
        poi: '',
        feedback_target_id: targetId,
        feedback_target_name: targetId
          ? resolveOrFallback(resolvers.resolveAdjudicatorName, targetId)
          : '',
      })
      return
    }

    if (submission.type !== 'ballot') return
    const teamAId = text(payload.teamAId)
    const teamBId = text(payload.teamBId)
    const teamA = teamAId ? resolveOrFallback(resolvers.resolveTeamName, teamAId) : ''
    const teamB = teamBId ? resolveOrFallback(resolvers.resolveTeamName, teamBId) : ''
    const winnerId = payload.draw === true ? '' : text(payload.winnerId)
    const winner = payload.draw === true ? 'Draw' : winnerId ? resolveOrFallback(resolvers.resolveTeamName, winnerId) : ''
    const matchup = teamA || teamB ? `${teamA || teamAId} vs ${teamB || teamBId}` : ''

    const appendSpeakerRows = (slot: 'A' | 'B', teamId: string) => {
      const suffix = slot
      const speakerIds = list(payload[`speakerIds${suffix}`])
      const scores = list(payload[`scores${suffix}`])
      const matter = list(payload[`matter${suffix}`])
      const manner = list(payload[`manner${suffix}`])
      const best = list(payload[`best${suffix}`])
      const poi = list(payload[`poi${suffix}`])
      const length = Math.max(
        speakerIds.length,
        scores.length,
        matter.length,
        manner.length,
        best.length,
        poi.length
      )
      const side = resolvers.resolveBallotSide(round, teamAId, teamBId, slot)

      for (let index = 0; index < length; index += 1) {
        const speakerId = text(speakerIds[index])
        const matterValue = numberText(matter[index])
        const mannerValue = numberText(manner[index])
        const scoreValue = numberText(scores[index]) ||
          (matterValue && mannerValue ? String(Number(matterValue) + Number(mannerValue)) : '')
        rows.push({
          ...base,
          record_type: 'ballot_speaker',
          matchup,
          team_a: teamA,
          team_b: teamB,
          side,
          winner,
          speaker_order: String(index + 1),
          speaker_id: speakerId,
          speaker_name: speakerId ? resolveOrFallback(resolvers.resolveSpeakerName, speakerId) : '',
          matter: matterValue,
          manner: mannerValue,
          score: scoreValue,
          best_debater: boolText(best[index]),
          poi: boolText(poi[index]),
          feedback_target_id: '',
          feedback_target_name: '',
        })
      }
      return length
    }

    const speakerRowCount = appendSpeakerRows('A', teamAId) + appendSpeakerRows('B', teamBId)
    if (speakerRowCount === 0) {
      rows.push({
        ...base,
        record_type: 'ballot_summary',
        matchup,
        team_a: teamA,
        team_b: teamB,
        side: '',
        winner,
        speaker_order: '',
        speaker_id: '',
        speaker_name: '',
        matter: '',
        manner: '',
        score: '',
        best_debater: '',
        poi: '',
        feedback_target_id: '',
        feedback_target_name: '',
      })
    }
  })

  return rows.sort(compareRows)
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function buildDetailedResultsExportCsv(
  rows: DetailedResultsExportRow[],
  labels: DetailedResultsExportLabels = DEFAULT_DETAILED_RESULTS_EXPORT_LABELS
): string {
  const header = DETAILED_RESULTS_EXPORT_COLUMNS.map((key) => escapeCsv(labels[key] ?? key)).join(',')
  const body = rows.map((row) =>
    DETAILED_RESULTS_EXPORT_COLUMNS.map((key) => escapeCsv(String(row[key] ?? ''))).join(',')
  )
  return [header, ...body].join('\n')
}
