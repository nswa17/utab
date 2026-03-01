export type EntityImportType = 'teams' | 'adjudicators' | 'venues' | 'speakers' | 'institutions'

export type NamedEntity = {
  _id: string
  name: string
}

export type ParsedEntityCsv = {
  hasHeader: boolean
  headers: string[]
  rows: string[][]
}

type RoundHeaderKind = 'availability' | 'conflicts'

type CsvHeaderAnalysis = {
  hasHeader: boolean
  headers: string[]
  roundAvailabilityColumnByRound: Map<number, number>
  roundConflictColumnByRound: Map<number, number>
  errors: string[]
}

type CsvColumnReader = {
  errors: string[]
  hasRoundAvailabilityColumns: boolean
  hasRoundConflictColumns: boolean
  read: (row: string[], aliases: string[], fallbackIndex?: number) => string
  readRound: (row: string[], kind: RoundHeaderKind, round: number) => string
}

export type BuildEntityImportPayloadOptions = {
  type: EntityImportType
  text: string
  tournamentId: string
  roundNumbers: number[]
  teams: NamedEntity[]
  institutions: NamedEntity[]
  institutionCategoryLabel: (value?: string) => string
  institutionPriorityValue: (value?: number) => number
}

export type BuildEntityImportPayloadResult = {
  payload: Array<Record<string, unknown>>
  errors: string[]
}

const roundAvailabilityPattern = /^(?:available|availability)_r(\d+)$/
const roundConflictPattern = /^conflicts?_r(\d+)$/

const knownStaticHeaders = new Set([
  'name',
  'institution',
  'institutions',
  'category',
  'kind',
  'type',
  'priority',
  'speakers',
  'strength',
  'preev',
  'active',
  'available',
  'availability',
  'conflict',
  'conflicts',
])

function detectDelimiter(line: string): ',' | '\t' {
  const commaCount = line.split(',').length - 1
  const tabCount = line.split('\t').length - 1
  return tabCount > commaCount ? '\t' : ','
}

function splitCells(line: string, delimiter: ',' | '\t'): string[] {
  return line.split(delimiter).map((cell) => cell.trim())
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
}

function parseRoundHeader(value: string):
  | { kind: RoundHeaderKind; round: number }
  | null {
  const availabilityMatch = value.match(roundAvailabilityPattern)
  if (availabilityMatch) {
    return { kind: 'availability', round: Number(availabilityMatch[1]) }
  }
  const conflictMatch = value.match(roundConflictPattern)
  if (conflictMatch) {
    return { kind: 'conflicts', round: Number(conflictMatch[1]) }
  }
  return null
}

function isKnownHeader(value: string): boolean {
  if (knownStaticHeaders.has(value)) return true
  return parseRoundHeader(value) !== null
}

function parseEntityCsv(text: string): ParsedEntityCsv {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) return { hasHeader: false, headers: [], rows: [] }

  const delimiter = detectDelimiter(lines[0])
  const firstCells = splitCells(lines[0], delimiter)
  const normalizedFirstCells = firstCells.map(normalizeHeader)
  const hasHeader = normalizedFirstCells.some(isKnownHeader)

  const headers = hasHeader ? normalizedFirstCells : []
  const rows = lines
    .slice(hasHeader ? 1 : 0)
    .map((line) => splitCells(line, delimiter))

  return { hasHeader, headers, rows }
}

function analyzeHeaders(parsed: ParsedEntityCsv): CsvHeaderAnalysis {
  const roundAvailabilityColumnByRound = new Map<number, number>()
  const roundConflictColumnByRound = new Map<number, number>()
  const errors: string[] = []

  if (!parsed.hasHeader) {
    return {
      hasHeader: false,
      headers: [],
      roundAvailabilityColumnByRound,
      roundConflictColumnByRound,
      errors,
    }
  }

  const seenStaticHeaders = new Set<string>()

  parsed.headers.forEach((header, index) => {
    const roundHeader = parseRoundHeader(header)
    if (roundHeader) {
      const table =
        roundHeader.kind === 'availability'
          ? roundAvailabilityColumnByRound
          : roundConflictColumnByRound
      if (table.has(roundHeader.round)) {
        errors.push(
          `CSVヘッダー "${header}" が重複しています (round ${roundHeader.round})。`
        )
        return
      }
      table.set(roundHeader.round, index)
      return
    }

    if (!knownStaticHeaders.has(header)) return
    if (seenStaticHeaders.has(header)) {
      errors.push(`CSVヘッダー "${header}" が重複しています。`)
      return
    }
    seenStaticHeaders.add(header)
  })

  return {
    hasHeader: true,
    headers: parsed.headers,
    roundAvailabilityColumnByRound,
    roundConflictColumnByRound,
    errors,
  }
}

function createCsvColumnReader(parsed: ParsedEntityCsv): CsvColumnReader {
  const analysis = analyzeHeaders(parsed)
  const errors = [...analysis.errors]
  const aliasIndexCache = new Map<string, number | null>()

  const read = (row: string[], aliases: string[], fallbackIndex = -1): string => {
    if (!analysis.hasHeader) {
      if (fallbackIndex < 0) return ''
      return row[fallbackIndex] ?? ''
    }
    const normalizedAliases = aliases.map(normalizeHeader)
    const cacheKey = normalizedAliases.slice().sort().join('|')

    let resolved = aliasIndexCache.get(cacheKey)
    if (resolved === undefined) {
      const indexes = Array.from(
        new Set(
          normalizedAliases
            .map((alias) => analysis.headers.indexOf(alias))
            .filter((index) => index >= 0)
        )
      )
      if (indexes.length > 1) {
        errors.push(
          `CSVヘッダー [${aliases.join(', ')}] が曖昧です。どれか1つだけ指定してください。`
        )
        resolved = null
      } else {
        resolved = indexes.length === 1 ? indexes[0] : null
      }
      aliasIndexCache.set(cacheKey, resolved)
    }

    if (resolved === null) return ''
    return row[resolved] ?? ''
  }

  const readRound = (row: string[], kind: RoundHeaderKind, round: number): string => {
    if (!analysis.hasHeader) return ''
    const map =
      kind === 'availability'
        ? analysis.roundAvailabilityColumnByRound
        : analysis.roundConflictColumnByRound
    const index = map.get(round)
    if (index === undefined) return ''
    return row[index] ?? ''
  }

  return {
    errors,
    hasRoundAvailabilityColumns: analysis.roundAvailabilityColumnByRound.size > 0,
    hasRoundConflictColumns: analysis.roundConflictColumnByRound.size > 0,
    read,
    readRound,
  }
}

function splitList(value: string): string[] {
  return value
    .split(/[;|]/)
    .map((cell) => cell.trim())
    .filter(Boolean)
}

function toBooleanCell(value: string, defaultValue: boolean): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return defaultValue
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return defaultValue
}

function toFiniteNumber(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toPriority(value: string, fallback = 1): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

function normalizeRoundNumbers(roundNumbers: number[]): number[] {
  return Array.from(
    new Set(
      roundNumbers
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1)
    )
  ).sort((left, right) => left - right)
}

function resolveNamedEntityIds(values: string, lookup: Map<string, string>): string[] {
  const ids = splitList(values).map((token) => {
    const normalized = token.trim()
    if (!normalized) return ''
    return lookup.get(normalized) ?? lookup.get(normalized.toLowerCase()) ?? ''
  })
  return Array.from(new Set(ids.filter(Boolean)))
}

function createNamedEntityLookup(items: NamedEntity[]): Map<string, string> {
  const map = new Map<string, string>()
  items.forEach((item) => {
    const id = String(item._id)
    const name = String(item.name ?? '')
    if (!id) return
    map.set(id, id)
    if (name) {
      map.set(name, id)
      map.set(name.toLowerCase(), id)
    }
  })
  return map
}

export function buildEntityImportPayload(
  options: BuildEntityImportPayloadOptions
): BuildEntityImportPayloadResult {
  const parsed = parseEntityCsv(options.text)
  const reader = createCsvColumnReader(parsed)
  const payload: Array<Record<string, unknown>> = []
  const rounds = normalizeRoundNumbers(options.roundNumbers)
  const teamLookup = createNamedEntityLookup(options.teams)
  const institutionLookup = createNamedEntityLookup(options.institutions)

  for (const row of parsed.rows) {
    if (options.type === 'teams') {
      const name = reader.read(row, ['name'], 0)
      if (!name) continue
      const institutionCell = reader.read(row, ['institution'], 1)
      const speakersCell = reader.read(row, ['speakers'], 2)
      const speakers = splitList(speakersCell).map((speakerName) => ({ name: speakerName }))

      const defaultAvailable = toBooleanCell(
        reader.read(row, ['available', 'availability'], 3),
        true
      )
      const institutionIds = resolveNamedEntityIds(institutionCell, institutionLookup)
      const details =
        rounds.length > 0 &&
        (defaultAvailable === false || reader.hasRoundAvailabilityColumns)
          ? rounds.map((round) => ({
              r: round,
              available: toBooleanCell(reader.readRound(row, 'availability', round), defaultAvailable),
              institutions: institutionIds,
              speakers: [] as string[],
            }))
          : undefined

      payload.push({
        tournamentId: options.tournamentId,
        name,
        institution: institutionCell || undefined,
        speakers,
        details,
      })
      continue
    }

    if (options.type === 'adjudicators') {
      const name = reader.read(row, ['name'], 0)
      if (!name) continue

      const strength = toFiniteNumber(reader.read(row, ['strength'], 1), 0)
      const preev = toFiniteNumber(reader.read(row, ['preev'], 2), 0)
      const active = toBooleanCell(reader.read(row, ['active'], 3), true)

      const institutionIds = resolveNamedEntityIds(
        reader.read(row, ['institutions', 'institution']),
        institutionLookup
      )
      const defaultAvailable = toBooleanCell(
        reader.read(row, ['available', 'availability'], 4),
        true
      )
      const baseConflicts = resolveNamedEntityIds(
        reader.read(row, ['conflicts', 'conflict'], 5),
        teamLookup
      )

      const includeDetails =
        rounds.length > 0 &&
        (defaultAvailable === false ||
          institutionIds.length > 0 ||
          baseConflicts.length > 0 ||
          reader.hasRoundAvailabilityColumns ||
          reader.hasRoundConflictColumns)

      const details = includeDetails
        ? rounds.map((round) => {
            const available = toBooleanCell(
              reader.readRound(row, 'availability', round),
              defaultAvailable
            )
            const roundConflicts = resolveNamedEntityIds(
              reader.readRound(row, 'conflicts', round),
              teamLookup
            )
            return {
              r: round,
              available,
              institutions: institutionIds,
              conflicts: Array.from(new Set([...baseConflicts, ...roundConflicts])),
            }
          })
        : undefined

      payload.push({
        tournamentId: options.tournamentId,
        name,
        strength,
        preev,
        active,
        details,
      })
      continue
    }

    if (options.type === 'venues') {
      const name = reader.read(row, ['name'], 0)
      if (!name) continue

      const priority = toPriority(reader.read(row, ['priority'], 1), 1)
      const defaultAvailable = toBooleanCell(
        reader.read(row, ['available', 'availability'], 2),
        true
      )
      const details =
        rounds.length > 0
          ? rounds.map((round) => ({
              r: round,
              available: toBooleanCell(reader.readRound(row, 'availability', round), defaultAvailable),
              priority,
            }))
          : undefined

      payload.push({
        tournamentId: options.tournamentId,
        name,
        details,
        userDefinedData: {
          availableDefault: defaultAvailable,
        },
      })
      continue
    }

    if (options.type === 'speakers') {
      const name = reader.read(row, ['name'], 0)
      if (!name) continue
      payload.push({ tournamentId: options.tournamentId, name })
      continue
    }

    const name = reader.read(row, ['name'], 0)
    if (!name) continue
    const category = options.institutionCategoryLabel(
      reader.read(row, ['category', 'kind', 'type'], 1) || undefined
    )
    const priority = options.institutionPriorityValue(
      toFiniteNumber(reader.read(row, ['priority'], 2), 1)
    )
    payload.push({
      tournamentId: options.tournamentId,
      name,
      category,
      priority,
    })
  }

  return { payload, errors: reader.errors }
}
