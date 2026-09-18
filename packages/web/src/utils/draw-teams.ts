import type { Style } from '@/types/style'

export type DrawTeamPosition = 'gov' | 'opp' | 'og' | 'oo' | 'cg' | 'co'

export type DrawTeamRecord = {
  gov?: string
  opp?: string
  og?: string
  oo?: string
  cg?: string
  co?: string
  [key: string]: string | undefined
}

export type DrawTeamPositionColumn = {
  key: DrawTeamPosition
  label: string
}

const TWO_TEAM_POSITIONS: DrawTeamPosition[] = ['gov', 'opp']
const FOUR_TEAM_POSITIONS: DrawTeamPosition[] = ['og', 'oo', 'cg', 'co']

const DEFAULT_LABELS: Record<DrawTeamPosition, string> = {
  gov: 'Gov',
  opp: 'Opp',
  og: 'OG',
  oo: 'OO',
  cg: 'CG',
  co: 'CO',
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeToken(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizedStyleLabel(
  source: unknown,
  key: DrawTeamPosition
): string | null {
  const record = asRecord(source)
  const direct = normalizeToken(record[key])
  if (direct) return direct

  const aliases: Partial<Record<DrawTeamPosition, string[]>> = {
    gov: ['government', 'proposition', 'prop', 'affirmative', 'aff'],
    opp: ['opposition', 'negative', 'neg'],
    og: ['opening_government', 'openinggovernment', 'opening_gov', 'openinggov'],
    oo: ['opening_opposition', 'openingopposition', 'opening_opp', 'openingopp'],
    cg: ['closing_government', 'closinggovernment', 'closing_gov', 'closinggov'],
    co: ['closing_opposition', 'closingopposition', 'closing_opp', 'closingopp'],
  }
  const normalizedKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const alias of aliases[key] ?? []) {
    const match = Object.entries(record).find(
      ([candidate]) => normalizedKey(candidate) === normalizedKey(alias)
    )
    const label = normalizeToken(match?.[1])
    if (label) return label
  }
  return null
}

export function editableDrawTeamNum(value: unknown): 2 | 4 | null {
  const parsed = Number(value)
  if (parsed === 2 || parsed === 4) return parsed
  return null
}

export function inferDrawTeamNum(value: unknown, fallback: 2 | 4 = 2): 2 | 4 {
  if (Array.isArray(value)) {
    if (value.length >= 4) return 4
    if (value.length >= 2) return 2
  }
  const record = asRecord(value)
  if (
    Object.prototype.hasOwnProperty.call(record, 'cg') ||
    Object.prototype.hasOwnProperty.call(record, 'co') ||
    Object.prototype.hasOwnProperty.call(record, 'og') ||
    Object.prototype.hasOwnProperty.call(record, 'oo')
  ) {
    return 4
  }
  return fallback
}

export function drawTeamPositions(teamNum: 2 | 4): DrawTeamPosition[] {
  return teamNum === 4 ? [...FOUR_TEAM_POSITIONS] : [...TWO_TEAM_POSITIONS]
}

export function normalizeDrawTeams(
  value: unknown,
  requestedTeamNum?: 2 | 4 | null
): DrawTeamRecord {
  const teamNum = requestedTeamNum ?? inferDrawTeamNum(value)
  const record: DrawTeamRecord = {}

  if (Array.isArray(value)) {
    if (teamNum === 4) {
      const [og = '', oo = '', cg = '', co = ''] = value
      record.og = normalizeToken(og)
      record.oo = normalizeToken(oo)
      record.cg = normalizeToken(cg)
      record.co = normalizeToken(co)
      record.gov = record.og
      record.opp = record.oo
      return record
    }
    const [gov = '', opp = ''] = value
    record.gov = normalizeToken(gov)
    record.opp = normalizeToken(opp)
    return record
  }

  const source = asRecord(value)
  if (teamNum === 4) {
    record.og = normalizeToken(source.og ?? source.gov)
    record.oo = normalizeToken(source.oo ?? source.opp)
    record.cg = normalizeToken(source.cg)
    record.co = normalizeToken(source.co)
    record.gov = record.og
    record.opp = record.oo
    return record
  }

  record.gov = normalizeToken(source.gov ?? source.og)
  record.opp = normalizeToken(source.opp ?? source.oo)
  return record
}

export function serializeDrawTeams(
  value: unknown,
  requestedTeamNum?: 2 | 4 | null
): Record<string, string> {
  const teamNum = requestedTeamNum ?? inferDrawTeamNum(value)
  const record = normalizeDrawTeams(value, teamNum)
  if (teamNum === 4) {
    return {
      og: normalizeToken(record.og ?? record.gov),
      oo: normalizeToken(record.oo ?? record.opp),
      cg: normalizeToken(record.cg),
      co: normalizeToken(record.co),
    }
  }
  return {
    gov: normalizeToken(record.gov),
    opp: normalizeToken(record.opp),
  }
}

export function drawTeamId(
  value: unknown,
  position: DrawTeamPosition,
  requestedTeamNum?: 2 | 4 | null
): string {
  const record = normalizeDrawTeams(value, requestedTeamNum)
  if (position === 'gov' && !record.gov) return normalizeToken(record.og)
  if (position === 'opp' && !record.opp) return normalizeToken(record.oo)
  return normalizeToken(record[position])
}

export function setDrawTeamId(
  record: DrawTeamRecord,
  position: DrawTeamPosition,
  teamId: string,
  teamNum: 2 | 4
): void {
  const value = normalizeToken(teamId)
  record[position] = value
  if (teamNum === 4) {
    if (position === 'og') record.gov = value
    if (position === 'oo') record.opp = value
    if (position === 'gov') record.og = value
    if (position === 'opp') record.oo = value
  }
}

export function drawTeamIds(
  value: unknown,
  requestedTeamNum?: 2 | 4 | null
): string[] {
  const teamNum = requestedTeamNum ?? inferDrawTeamNum(value)
  const record = normalizeDrawTeams(value, teamNum)
  return drawTeamPositions(teamNum)
    .map((position) => drawTeamId(record, position, teamNum))
    .filter(Boolean)
}

export function drawTeamGroupKey(
  value: unknown,
  requestedTeamNum?: 2 | 4 | null
): string {
  return drawTeamIds(value, requestedTeamNum).slice().sort().join('::')
}

export function drawTeamPositionColumns(
  style: Style | undefined,
  teamNum: 2 | 4
): DrawTeamPositionColumn[] {
  return drawTeamPositions(teamNum).map((key) => ({
    key,
    label:
      normalizedStyleLabel(style?.side_labels_short, key) ??
      normalizedStyleLabel(style?.side_labels, key) ??
      DEFAULT_LABELS[key],
  }))
}
