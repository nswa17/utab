export type AwardExportRowInput = {
  category: string
  ranking: number
  place?: string
  id: string
  name: string
  team?: string
  metric_name: string
  metric_value: string | number
}

export type ParticipantExportRowInput = {
  participant_type: 'team' | 'speaker' | 'adjudicator'
  id: string
  name: string
  team?: string
  institutions?: string[]
  active?: boolean
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function toRanking(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function buildAwardExportCsv(rows: AwardExportRowInput[]): string {
  const header = [
    'category',
    'ranking',
    'place',
    'id',
    'name',
    'team',
    'metric_name',
    'metric_value',
  ]
  const normalized = rows
    .map((row) => ({
      category: toText(row.category),
      ranking: toRanking(row.ranking),
      place: toText(row.place),
      id: toText(row.id),
      name: toText(row.name),
      team: toText(row.team),
      metric_name: toText(row.metric_name),
      metric_value: toText(row.metric_value),
    }))
    .filter((row) => row.ranking !== null && row.name.length > 0)
    .sort((left, right) => {
      if (left.category !== right.category) return left.category.localeCompare(right.category)
      if (left.ranking !== right.ranking) return (left.ranking ?? 0) - (right.ranking ?? 0)
      return left.name.localeCompare(right.name)
    })

  const body = normalized.map((row) =>
    [
      row.category,
      String(row.ranking ?? ''),
      row.place,
      row.id,
      row.name,
      row.team,
      row.metric_name,
      row.metric_value,
    ]
      .map((value) => escapeCsv(value))
      .join(',')
  )
  return [header.join(','), ...body].join('\n')
}

export function buildParticipantExportCsv(rows: ParticipantExportRowInput[]): string {
  const header = ['participant_type', 'id', 'name', 'team', 'institutions', 'active']
  const normalized = rows
    .map((row) => ({
      participant_type: row.participant_type,
      id: toText(row.id),
      name: toText(row.name),
      team: toText(row.team),
      institutions: Array.isArray(row.institutions)
        ? row.institutions.map((value) => toText(value)).filter(Boolean).join('|')
        : '',
      active:
        row.active === true ? 'true' : row.active === false ? 'false' : '',
    }))
    .filter((row) => row.id.length > 0 && row.name.length > 0)
    .sort((left, right) => {
      if (left.participant_type !== right.participant_type) {
        return left.participant_type.localeCompare(right.participant_type)
      }
      return left.name.localeCompare(right.name)
    })

  const body = normalized.map((row) =>
    [
      row.participant_type,
      row.id,
      row.name,
      row.team,
      row.institutions,
      row.active,
    ]
      .map((value) => escapeCsv(value))
      .join(',')
  )
  return [header.join(','), ...body].join('\n')
}
