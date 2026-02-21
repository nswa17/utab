export type SlideLabel = 'teams' | 'speakers' | 'adjudicators' | 'poi' | 'best'
export type SlideType = 'listed' | 'single'
export type SlideStyle = 'pretty' | 'simple'

export type SlideSettings = {
  maxRankingRewarded: number
  type: SlideType
  style: SlideStyle
  credit: string
}

export type PresentationQuery = {
  compiledId: string
  label: SlideLabel
  type: SlideType
  style: SlideStyle
  max: number
  credit: string
}

export type SlideRow = {
  id: string
  name: string
  ranking: number
  subNames: string[]
  tie: boolean
  tieCount: number
}

export type TieGroup = {
  ranking: number
  count: number
  rows: SlideRow[]
}

export type SlideResultInput = {
  id?: unknown
  name?: unknown
  ranking?: unknown
  subNames?: unknown
}

const SLIDE_LABELS: SlideLabel[] = ['teams', 'speakers', 'adjudicators', 'poi', 'best']
const SLIDE_TYPES: SlideType[] = ['listed', 'single']
const SLIDE_STYLES: SlideStyle[] = ['pretty', 'simple']

export const DEFAULT_SLIDE_SETTINGS: SlideSettings = {
  maxRankingRewarded: 3,
  type: 'listed',
  style: 'pretty',
  credit: 'UTab',
}

function firstQueryValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? '')
  if (value === undefined || value === null) return ''
  return String(value)
}

export function normalizeSlideLabel(value: unknown, fallback: SlideLabel = 'teams'): SlideLabel {
  const token = firstQueryValue(value).trim() as SlideLabel
  return SLIDE_LABELS.includes(token) ? token : fallback
}

export function normalizeSlideType(value: unknown, fallback: SlideType = 'listed'): SlideType {
  const raw = firstQueryValue(value).trim()
  if (raw === 'pretty' || raw === 'simple') return 'single'
  const token = raw as SlideType
  return SLIDE_TYPES.includes(token) ? token : fallback
}

export function normalizeSlideStyle(
  value: unknown,
  fallback: SlideStyle = DEFAULT_SLIDE_SETTINGS.style
): SlideStyle {
  const raw = firstQueryValue(value).trim()
  const token = raw as SlideStyle
  return SLIDE_STYLES.includes(token) ? token : fallback
}

export function normalizeSlideMax(value: unknown, fallback = DEFAULT_SLIDE_SETTINGS.maxRankingRewarded): number {
  const raw = firstQueryValue(value).trim()
  if (!raw) return fallback
  const numeric = Number(raw)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(1, Math.round(numeric))
}

export function parsePresentationQuery(query: Record<string, unknown>): {
  parsed: PresentationQuery
  errors: string[]
} {
  const compiledId = firstQueryValue(query.compiledId).trim()
  const parsed: PresentationQuery = {
    compiledId,
    label: normalizeSlideLabel(query.label),
    type: normalizeSlideType(query.type),
    style: normalizeSlideStyle(query.style),
    max: normalizeSlideMax(query.max),
    credit: firstQueryValue(query.credit).trim() || DEFAULT_SLIDE_SETTINGS.credit,
  }
  const errors: string[] = []
  if (!compiledId) errors.push('missing_compiled_id')
  return { parsed, errors }
}

function normalizeSubNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0)
}

export function resolveSubNames(
  value: unknown,
  resolveDisplayName?: (token: string) => string
): string[] {
  const names = normalizeSubNames(value)
  if (!resolveDisplayName) return names
  return names.map((token) => resolveDisplayName(token))
}

function rowName(input: SlideResultInput): string {
  if (typeof input.name === 'string' && input.name.trim().length > 0) return input.name.trim()
  if (input.id !== undefined && input.id !== null && String(input.id).trim().length > 0) {
    return String(input.id).trim()
  }
  return 'Unknown'
}

function rowId(input: SlideResultInput): string {
  const id = String(input.id ?? '').trim()
  if (id.length > 0) return id
  return rowName(input)
}

function rowRanking(input: SlideResultInput): number {
  const ranking = Number(input.ranking)
  if (!Number.isFinite(ranking)) return Number.NaN
  return Math.max(1, Math.round(ranking))
}

export function buildSlideRows(
  source: SlideResultInput[],
  maxRankingRewarded: number = DEFAULT_SLIDE_SETTINGS.maxRankingRewarded
): SlideRow[] {
  const threshold = Math.max(1, Math.round(maxRankingRewarded || DEFAULT_SLIDE_SETTINGS.maxRankingRewarded))
  const collator = new Intl.Collator(['ja', 'en'], { numeric: true, sensitivity: 'base' })

  const rows = source
    .map((input) => ({
      id: rowId(input),
      name: rowName(input),
      ranking: rowRanking(input),
      subNames: normalizeSubNames(input.subNames),
    }))
    .filter((row) => Number.isFinite(row.ranking) && row.ranking <= threshold)
    .sort((left, right) => {
      if (left.ranking !== right.ranking) return left.ranking - right.ranking
      return collator.compare(left.name, right.name)
    })

  const tieCountByRanking = new Map<number, number>()
  rows.forEach((row) => {
    tieCountByRanking.set(row.ranking, (tieCountByRanking.get(row.ranking) ?? 0) + 1)
  })

  return rows.map((row) => {
    const tieCount = tieCountByRanking.get(row.ranking) ?? 1
    return {
      ...row,
      tie: tieCount > 1,
      tieCount,
    }
  })
}

export function buildTieGroups(rows: SlideRow[]): TieGroup[] {
  const grouped = new Map<number, SlideRow[]>()
  rows.forEach((row) => {
    const list = grouped.get(row.ranking) ?? []
    list.push(row)
    grouped.set(row.ranking, list)
  })

  return Array.from(grouped.entries())
    .map(([ranking, tieRows]) => ({
      ranking,
      count: tieRows.length,
      rows: tieRows,
    }))
    .filter((group) => group.count > 1)
    .sort((left, right) => left.ranking - right.ranking)
}

export function chunkSlideRows(rows: SlideRow[], type: SlideType): SlideRow[][] {
  const size = type === 'listed' ? 4 : 1
  const chunks: SlideRow[][] = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }
  return chunks
}

export function buildSubPrizeResultsFromCompiled(
  compiledDoc: Record<string, any> | null | undefined,
  kind: 'poi' | 'best'
): any[] {
  if (!compiledDoc) return []
  const base = Array.isArray(compiledDoc.compiled_speaker_results)
    ? compiledDoc.compiled_speaker_results
    : []
  const aggregation =
    kind === 'poi'
      ? compiledDoc.compile_options?.duplicate_normalization?.poi_aggregation
      : compiledDoc.compile_options?.duplicate_normalization?.best_aggregation

  const results = base.map((result: any) => {
    let total = 0
    const details = Array.isArray(result?.details) ? result.details : []
    details.forEach((detail: any) => {
      const collection = Array.isArray(detail?.user_defined_data_collection)
        ? detail.user_defined_data_collection
        : []
      if (collection.length === 0) return
      const counts = collection.map((userDefinedData: any) => {
        const entries = Array.isArray(userDefinedData?.[kind]) ? userDefinedData[kind] : []
        return entries.filter((entry: any) => entry?.value).length
      })
      if (counts.length === 0) return
      if (aggregation === 'max') {
        total += Math.max(...counts)
      } else {
        total += counts.reduce((sum: number, count: number) => sum + count, 0) / counts.length
      }
    })
    return { ...result, [kind]: total }
  })

  results.sort((left: any, right: any) => (right?.[kind] ?? 0) - (left?.[kind] ?? 0))

  let rank = 0
  let stay = 0
  let previousValue: number | null = null
  results.forEach((row: any) => {
    const value = Number(row?.[kind] ?? 0)
    if (previousValue === null || value !== previousValue) {
      rank += stay + 1
      stay = 0
      previousValue = value
    } else {
      stay += 1
    }
    row.ranking = rank
  })

  return results
}
