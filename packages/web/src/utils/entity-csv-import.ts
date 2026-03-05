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
  adjudicators?: NamedEntity[]
  venues?: NamedEntity[]
  speakers: NamedEntity[]
  institutions: NamedEntity[]
  existingEntities?: NamedEntity[]
  institutionCategoryLabel: (value?: string) => string
  institutionPriorityValue: (value?: number) => number
}

export type BuildEntityImportPayloadEntry = {
  line: number
  payload: Record<string, unknown>
}

export type BuildEntityImportPayloadResult = {
  payload: Array<Record<string, unknown>>
  payloadEntries: BuildEntityImportPayloadEntry[]
  errors: string[]
  warnings: string[]
  missingEntityWarnings: MissingEntityWarning[]
  duplicateNameWarnings: DuplicateNameWarning[]
}

export type MissingEntityKind = 'institution' | 'speaker' | 'team'

export type MissingEntityWarning = {
  line: number
  field: string
  kind: MissingEntityKind
  values: string[]
}

export type DuplicateNameWarning = {
  line: number
  name: string
  type: EntityImportType
  source: 'existing' | 'csv'
  firstLine?: number
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
  'preev',
  'available',
  'availability',
  'conflict',
  'conflicts',
  'conflict_team',
  'conflict_teams',
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

type NamedEntityResolveResult = {
  ids: string[]
  unknownTokens: string[]
}

function resolveNamedEntityIds(values: string, lookup: Map<string, string>): NamedEntityResolveResult {
  const ids = new Set<string>()
  const unknownTokens = new Set<string>()

  splitList(values).forEach((token) => {
    const normalized = token.trim()
    if (!normalized) return
    const id = lookup.get(normalized) ?? lookup.get(normalized.toLowerCase())
    if (id) {
      ids.add(id)
      return
    }
    unknownTokens.add(normalized)
  })

  return {
    ids: Array.from(ids),
    unknownTokens: Array.from(unknownTokens),
  }
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

function entityImportTypeLabel(type: EntityImportType): string {
  const labels: Record<EntityImportType, string> = {
    teams: 'チーム',
    adjudicators: 'ジャッジ',
    venues: '会場',
    speakers: 'スピーカー',
    institutions: 'コンフリクトグループ',
  }
  return labels[type]
}

function detectDuplicateNameWarnings(
  type: EntityImportType,
  entries: BuildEntityImportPayloadEntry[],
  existingEntities: NamedEntity[]
): DuplicateNameWarning[] {
  const warnings: DuplicateNameWarning[] = []
  const existingNames = new Set(existingEntities.map((entity) => String(entity.name ?? '').trim()).filter(Boolean))
  const firstLineByName = new Map<string, number>()

  entries.forEach((entry) => {
    const name = String(entry.payload.name ?? '').trim()
    if (!name) return
    if (existingNames.has(name)) {
      warnings.push({ line: entry.line, name, type, source: 'existing' })
      return
    }
    const firstLine = firstLineByName.get(name)
    if (firstLine !== undefined) {
      warnings.push({ line: entry.line, name, type, source: 'csv', firstLine })
      return
    }
    firstLineByName.set(name, entry.line)
  })

  return warnings
}

function duplicateNameWarningMessage(warning: DuplicateNameWarning): string {
  const label = entityImportTypeLabel(warning.type)
  if (warning.source === 'existing') {
    return `CSV ${warning.line}行目: 既存の${label}名と重複しています\n- ${warning.name}`
  }
  return `CSV ${warning.line}行目: CSV内で${label}名が重複しています (CSV ${warning.firstLine}行目)\n- ${warning.name}`
}

export function buildEntityImportPayload(
  options: BuildEntityImportPayloadOptions
): BuildEntityImportPayloadResult {
  const parsed = parseEntityCsv(options.text)
  if (!parsed.hasHeader) {
    return {
      payload: [],
      payloadEntries: [],
      errors: ['1行目にCSVヘッダーが必要です。テンプレートをダウンロードして列名を揃えてください。'],
      warnings: [],
      missingEntityWarnings: [],
      duplicateNameWarnings: [],
    }
  }
  const reader = createCsvColumnReader(parsed)
  const errors = reader.errors
  const warnings: string[] = []
  const missingEntityWarnings: MissingEntityWarning[] = []
  const payloadEntries: BuildEntityImportPayloadEntry[] = []
  const payload: Array<Record<string, unknown>> = []
  const rounds = normalizeRoundNumbers(options.roundNumbers)
  const teamLookup = createNamedEntityLookup(options.teams)
  const speakerLookup = createNamedEntityLookup(options.speakers)
  const institutionLookup = createNamedEntityLookup(options.institutions)
  let adjudicatorConflictTeamsDependsOnTeams = false

  const pushUnknownEntityWarning = (
    line: number,
    field: string,
    unknownTokens: string[],
    kind: MissingEntityKind
  ) => {
    if (unknownTokens.length === 0) return
    warnings.push(`CSV ${line}行目: ${field} に未登録の${kind}があります\n- ${unknownTokens.join('\n- ')}`)
    missingEntityWarnings.push({ line, field, kind, values: [...unknownTokens] })
  }

  for (const [rowIndex, row] of parsed.rows.entries()) {
    const line = rowIndex + 2
    if (options.type === 'teams') {
      const name = reader.read(row, ['name'], 0)
      if (!name) continue
      const institutionCell = reader.read(row, ['institution'], 1)
      const speakersCell = reader.read(row, ['speakers'], 2)
      const speakerResult = resolveNamedEntityIds(speakersCell, speakerLookup)

      const defaultAvailable = toBooleanCell(
        reader.read(row, ['available', 'availability'], 3),
        true
      )
      const institutionResult = resolveNamedEntityIds(institutionCell, institutionLookup)
      const speakerIds = speakerResult.ids
      const institutionIds = institutionResult.ids

      pushUnknownEntityWarning(line, 'institution', institutionResult.unknownTokens, 'institution')
      pushUnknownEntityWarning(line, 'speakers', speakerResult.unknownTokens, 'speaker')

      const details =
        rounds.length > 0 &&
        (defaultAvailable === false ||
          institutionIds.length > 0 ||
          speakerIds.length > 0 ||
          reader.hasRoundAvailabilityColumns)
          ? rounds.map((round) => ({
              r: round,
              available: toBooleanCell(reader.readRound(row, 'availability', round), defaultAvailable),
              conflicts: institutionIds,
              speakers: speakerIds,
            }))
          : undefined

      const teamPayload = {
        tournamentId: options.tournamentId,
        name,
        template: {
          available: defaultAvailable,
          conflicts: institutionIds,
          speakers: speakerIds,
        },
        details,
      }
      payloadEntries.push({ line, payload: teamPayload })
      payload.push(teamPayload)
      continue
    }

    if (options.type === 'adjudicators') {
      const name = reader.read(row, ['name'], 0)
      if (!name) continue

      const preev = toFiniteNumber(reader.read(row, ['preev'], 1), 0)

      const institutionResult = resolveNamedEntityIds(
        reader.read(row, ['conflicts', 'conflict', 'institutions', 'institution']),
        institutionLookup
      )
      const defaultAvailable = toBooleanCell(
        reader.read(row, ['available', 'availability'], 2),
        true
      )
      const baseConflictTeamResult = resolveNamedEntityIds(
        reader.read(row, ['conflict_teams', 'conflict_team'], 3),
        teamLookup
      )
      const institutionIds = institutionResult.ids
      const baseConflictTeams = baseConflictTeamResult.ids

      pushUnknownEntityWarning(line, 'conflicts', institutionResult.unknownTokens, 'institution')
      pushUnknownEntityWarning(
        line,
        'conflict_teams',
        baseConflictTeamResult.unknownTokens,
        'team'
      )
      if (baseConflictTeamResult.unknownTokens.length > 0) {
        adjudicatorConflictTeamsDependsOnTeams = true
      }

      const includeDetails =
        rounds.length > 0 &&
        (defaultAvailable === false ||
          institutionIds.length > 0 ||
          baseConflictTeams.length > 0 ||
          reader.hasRoundAvailabilityColumns ||
          reader.hasRoundConflictColumns)

      const details = includeDetails
        ? rounds.map((round) => {
            const available = toBooleanCell(
              reader.readRound(row, 'availability', round),
              defaultAvailable
            )
            const roundConflictResult = resolveNamedEntityIds(
              reader.readRound(row, 'conflicts', round),
              teamLookup
            )
            pushUnknownEntityWarning(
              line,
              `conflicts_r${round}`,
              roundConflictResult.unknownTokens,
              'team'
            )
            if (roundConflictResult.unknownTokens.length > 0) {
              adjudicatorConflictTeamsDependsOnTeams = true
            }
            return {
              r: round,
              available,
              conflicts: institutionIds,
              conflict_teams: Array.from(new Set([...baseConflictTeams, ...roundConflictResult.ids])),
            }
          })
        : undefined

      const adjudicatorPayload = {
        tournamentId: options.tournamentId,
        name,
        preev,
        template: {
          available: defaultAvailable,
          conflicts: institutionIds,
          conflict_teams: baseConflictTeams,
        },
        details,
      }
      payloadEntries.push({ line, payload: adjudicatorPayload })
      payload.push(adjudicatorPayload)
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

      const venuePayload = {
        tournamentId: options.tournamentId,
        name,
        template: {
          available: defaultAvailable,
          priority,
        },
        details,
        userDefinedData: {
          availableDefault: defaultAvailable,
        },
      }
      payloadEntries.push({ line, payload: venuePayload })
      payload.push(venuePayload)
      continue
    }

    if (options.type === 'speakers') {
      const name = reader.read(row, ['name'], 0)
      if (!name) continue
      const speakerPayload = { tournamentId: options.tournamentId, name }
      payloadEntries.push({ line, payload: speakerPayload })
      payload.push(speakerPayload)
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
    const institutionPayload = {
      tournamentId: options.tournamentId,
      name,
      category,
      priority,
    }
    payloadEntries.push({ line, payload: institutionPayload })
    payload.push(institutionPayload)
  }

  if (adjudicatorConflictTeamsDependsOnTeams) {
    errors.push(
      'adjudicators CSV で conflict_teams / conflicts_r* を使う場合は、先に teams を取り込んでください。'
    )
  }

  const duplicateNameWarnings = detectDuplicateNameWarnings(
    options.type,
    payloadEntries,
    options.existingEntities ?? []
  )
  duplicateNameWarnings.forEach((warning) => {
    warnings.push(duplicateNameWarningMessage(warning))
  })

  return {
    payload,
    payloadEntries,
    errors,
    warnings,
    missingEntityWarnings,
    duplicateNameWarnings,
  }
}
