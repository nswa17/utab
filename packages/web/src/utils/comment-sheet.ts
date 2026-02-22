import type { Submission } from '@/types/submission'

export type CommentSheetRow = {
  round: number
  round_name: string
  submission_type: 'ballot' | 'feedback'
  submitted_entity_id: string
  submitted_entity_name: string
  matchup: string
  winner: string
  adjudicator: string
  score: string
  role: string
  comment: string
  created_at: string
  updated_at: string
}

export type CommentSheetResolvers = {
  resolveRoundName: (round: number) => string
  resolveTeamName: (id: string) => string
  resolveAdjudicatorName: (id: string) => string
  resolveEntityName: (id: string) => string
}

export type CommentSheetCsvLabels = Record<(typeof COMMENT_SHEET_CSV_KEYS)[number], string>

export const COMMENT_SHEET_CSV_KEYS = [
  'round',
  'round_name',
  'submission_type',
  'submitted_entity_id',
  'submitted_entity_name',
  'matchup',
  'winner',
  'adjudicator',
  'score',
  'role',
  'comment',
  'created_at',
  'updated_at',
] as const

export const DEFAULT_COMMENT_SHEET_CSV_LABELS: CommentSheetCsvLabels = {
  round: 'Round',
  round_name: 'Round Name',
  submission_type: 'Type',
  submitted_entity_id: 'Submitted Entity ID',
  submitted_entity_name: 'Submitted Entity',
  matchup: 'Match',
  winner: 'Winner',
  adjudicator: 'Adjudicator',
  score: 'Score',
  role: 'Role',
  comment: 'Comment',
  created_at: 'Created At',
  updated_at: 'Updated At',
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeFiniteNumber(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  const parsed = Number(value)
  return Number.isFinite(parsed) ? String(parsed) : ''
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function compareRows(left: CommentSheetRow, right: CommentSheetRow): number {
  if (left.round !== right.round) return left.round - right.round
  if (left.submission_type !== right.submission_type) {
    return left.submission_type === 'ballot' ? -1 : 1
  }
  if (left.created_at !== right.created_at) return left.created_at.localeCompare(right.created_at)
  return left.submitted_entity_id.localeCompare(right.submitted_entity_id)
}

export function buildCommentSheetRows(
  submissions: Submission[],
  resolvers: CommentSheetResolvers
): CommentSheetRow[] {
  const rows: CommentSheetRow[] = []
  submissions.forEach((submission) => {
    const round = Number(submission.round)
    if (!Number.isFinite(round)) return

    const payload = (submission.payload ?? {}) as Record<string, unknown>
    const comment = normalizeText(payload.comment)
    if (!comment) return

    const submittedEntityId = normalizeText(payload.submittedEntityId)
    const submittedEntityName = submittedEntityId
      ? normalizeText(resolvers.resolveEntityName(submittedEntityId))
      : ''

    const baseRow = {
      round,
      round_name: normalizeText(resolvers.resolveRoundName(round)),
      submitted_entity_id: submittedEntityId,
      submitted_entity_name: submittedEntityName,
      role: normalizeText(payload.role),
      comment,
      created_at: normalizeText(submission.createdAt),
      updated_at: normalizeText(submission.updatedAt),
    }

    if (submission.type === 'ballot') {
      const teamAId = normalizeText(payload.teamAId)
      const teamBId = normalizeText(payload.teamBId)
      const winnerId = normalizeText(payload.winnerId)
      const draw = payload.draw === true
      const teamA = teamAId ? normalizeText(resolvers.resolveTeamName(teamAId)) : ''
      const teamB = teamBId ? normalizeText(resolvers.resolveTeamName(teamBId)) : ''
      const winner = draw
        ? 'Draw'
        : winnerId
          ? normalizeText(resolvers.resolveTeamName(winnerId))
          : ''
      const matchup = teamA || teamB ? `${teamA || teamAId} vs ${teamB || teamBId}` : ''
      rows.push({
        ...baseRow,
        submission_type: 'ballot',
        matchup,
        winner,
        adjudicator: '',
        score: '',
      })
      return
    }

    if (submission.type === 'feedback') {
      const adjudicatorId = normalizeText(payload.adjudicatorId)
      const adjudicator = adjudicatorId
        ? normalizeText(resolvers.resolveAdjudicatorName(adjudicatorId))
        : ''
      rows.push({
        ...baseRow,
        submission_type: 'feedback',
        matchup: '',
        winner: '',
        adjudicator,
        score: normalizeFiniteNumber(payload.score),
      })
    }
  })
  return rows.sort(compareRows)
}

export function buildCommentSheetCsv(
  rows: CommentSheetRow[],
  labels: CommentSheetCsvLabels = DEFAULT_COMMENT_SHEET_CSV_LABELS
): string {
  const header = COMMENT_SHEET_CSV_KEYS.map((key) => escapeCsv(labels[key] ?? key)).join(',')
  const body = rows.map((row) =>
    COMMENT_SHEET_CSV_KEYS.map((key) => escapeCsv(String(row[key] ?? ''))).join(',')
  )
  return [header, ...body].join('\n')
}
