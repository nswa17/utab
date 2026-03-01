export type ParsedDrawAllocationImportEntry = {
  line: number
  matchIndex?: number
  venueToken?: string
  govTeamToken?: string
  oppTeamToken?: string
  chairTokens?: string[]
  panelTokens?: string[]
  traineeTokens?: string[]
}

export type ParsedDrawAllocationImport = {
  entries: ParsedDrawAllocationImportEntry[]
  errors: string[]
}

export type DrawAllocationRowLike = {
  venue?: string
  teams: {
    gov: string
    opp: string
  }
  chairs?: string[]
  panels?: string[]
  trainees?: string[]
}

export type NamedEntity = {
  _id: string
  name: string
}

export type ApplyDrawAllocationImportParams = {
  allocation: DrawAllocationRowLike[]
  entries: ParsedDrawAllocationImportEntry[]
  teams: NamedEntity[]
  adjudicators: NamedEntity[]
  venues: NamedEntity[]
}

export type ApplyDrawAllocationImportResult = {
  allocation: DrawAllocationRowLike[]
  appliedRows: number
  errors: string[]
}

const matchHeaderKeys = ['match', 'match_no', 'match_no.', 'row', 'index']
const venueHeaderKeys = ['venue', 'room', 'table']
const govHeaderKeys = ['gov', 'team_gov', 'gov_team', 'government']
const oppHeaderKeys = ['opp', 'team_opp', 'opp_team', 'opposition']
const chairHeaderKeys = ['chair', 'chairs']
const panelHeaderKeys = ['panel', 'panels']
const traineeHeaderKeys = ['trainee', 'trainees']
const knownHeaderKeys = new Set([
  ...matchHeaderKeys,
  ...venueHeaderKeys,
  ...govHeaderKeys,
  ...oppHeaderKeys,
  ...chairHeaderKeys,
  ...panelHeaderKeys,
  ...traineeHeaderKeys,
])
const importHint = '大会データ準備で先に取り込んでください。'

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_')
}

function detectDelimiter(line: string): ',' | '\t' {
  const commaCount = line.split(',').length - 1
  const tabCount = line.split('\t').length - 1
  if (tabCount > commaCount) return '\t'
  return ','
}

function splitCells(line: string, delimiter: ',' | '\t'): string[] {
  return line.split(delimiter).map((cell) => cell.trim())
}

function splitList(value: string): string[] {
  if (!value) return []
  return value
    .split(/[|;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function uniqueList(values: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  values.forEach((value) => {
    if (seen.has(value)) return
    seen.add(value)
    result.push(value)
  })
  return result
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = headers.indexOf(candidate)
    if (index >= 0) return index
  }
  return -1
}

function getCell(cells: string[], index: number): string {
  if (index < 0) return ''
  return cells[index] ?? ''
}

function parseMatchIndex(token: string): number | undefined {
  if (!token) return undefined
  const parsed = Number.parseInt(token, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

export function parseDrawAllocationImportText(text: string): ParsedDrawAllocationImport {
  const lines = text
    .split(/\r?\n/)
    .map((raw, index) => ({ lineNo: index + 1, raw: raw.trim() }))
    .filter((row) => row.raw.length > 0)

  if (lines.length === 0) {
    return { entries: [], errors: ['取り込み内容が空です。'] }
  }

  const delimiter = detectDelimiter(lines[0].raw)
  const firstCells = splitCells(lines[0].raw, delimiter)
  const normalizedFirstCells = firstCells.map(normalizeHeader)
  const hasHeader = normalizedFirstCells.some((value) => knownHeaderKeys.has(value))
  const headers = hasHeader ? normalizedFirstCells : []
  const body = hasHeader ? lines.slice(1) : lines
  const errors: string[] = []
  const entries: ParsedDrawAllocationImportEntry[] = []
  const legacyNoHeaderFormat = !hasHeader && firstCells.length <= 4

  for (const row of body) {
    const cells = splitCells(row.raw, delimiter)

    const matchCell = headers.length
      ? getCell(cells, findHeaderIndex(headers, matchHeaderKeys))
      : getCell(cells, 0)
    const matchIndex = parseMatchIndex(matchCell)
    if (matchCell && matchIndex === undefined) {
      errors.push(`行 ${row.lineNo}: match は 1 以上の整数で指定してください。`)
      continue
    }

    const venueCell = headers.length
      ? getCell(cells, findHeaderIndex(headers, venueHeaderKeys))
      : legacyNoHeaderFormat
        ? ''
        : getCell(cells, 1)
    const govCell = headers.length
      ? getCell(cells, findHeaderIndex(headers, govHeaderKeys))
      : legacyNoHeaderFormat
        ? ''
        : getCell(cells, 2)
    const oppCell = headers.length
      ? getCell(cells, findHeaderIndex(headers, oppHeaderKeys))
      : legacyNoHeaderFormat
        ? ''
        : getCell(cells, 3)
    const chairCell = headers.length
      ? getCell(cells, findHeaderIndex(headers, chairHeaderKeys))
      : legacyNoHeaderFormat
        ? getCell(cells, 1)
        : getCell(cells, 4)
    const panelCell = headers.length
      ? getCell(cells, findHeaderIndex(headers, panelHeaderKeys))
      : legacyNoHeaderFormat
        ? getCell(cells, 2)
        : getCell(cells, 5)
    const traineeCell = headers.length
      ? getCell(cells, findHeaderIndex(headers, traineeHeaderKeys))
      : legacyNoHeaderFormat
        ? getCell(cells, 3)
        : getCell(cells, 6)

    const entry: ParsedDrawAllocationImportEntry = {
      line: row.lineNo,
    }
    if (matchIndex !== undefined) entry.matchIndex = matchIndex
    if (venueCell) entry.venueToken = venueCell
    if (govCell) entry.govTeamToken = govCell
    if (oppCell) entry.oppTeamToken = oppCell
    if (chairCell) entry.chairTokens = uniqueList(splitList(chairCell))
    if (panelCell) entry.panelTokens = uniqueList(splitList(panelCell))
    if (traineeCell) entry.traineeTokens = uniqueList(splitList(traineeCell))

    const hasAnyValue =
      entry.venueToken !== undefined ||
      entry.govTeamToken !== undefined ||
      entry.oppTeamToken !== undefined ||
      entry.chairTokens !== undefined ||
      entry.panelTokens !== undefined ||
      entry.traineeTokens !== undefined
    if (!hasAnyValue) {
      errors.push(`行 ${row.lineNo}: 反映するセルがありません。`)
      continue
    }

    const hasRowLocator =
      entry.matchIndex !== undefined ||
      (entry.govTeamToken !== undefined && entry.oppTeamToken !== undefined)
    if (!hasRowLocator) {
      errors.push(`行 ${row.lineNo}: match または gov/opp のペアで対象行を指定してください。`)
      continue
    }

    entries.push(entry)
  }

  return { entries, errors }
}

function registerEntityToken(map: Map<string, string[]>, token: string, id: string) {
  if (!token) return
  const key = token.trim().toLowerCase()
  if (!key) return
  const list = map.get(key) ?? []
  if (!list.includes(id)) list.push(id)
  map.set(key, list)
}

function buildEntityTokenMap(entities: NamedEntity[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  entities.forEach((entity) => {
    registerEntityToken(map, entity._id, entity._id)
    registerEntityToken(map, entity.name, entity._id)
  })
  return map
}

function resolveEntityId(
  token: string,
  tokenMap: Map<string, string[]>,
  label: string,
  line: number,
  errors: string[]
): string | null {
  const key = token.trim().toLowerCase()
  if (!key) return null
  const matches = tokenMap.get(key) ?? []
  if (matches.length === 0) {
    errors.push(`行 ${line}: ${label} "${token}" が見つかりません。${importHint}`)
    return null
  }
  if (matches.length > 1) {
    errors.push(`行 ${line}: ${label} "${token}" は重複しているため特定できません。IDを指定してください。`)
    return null
  }
  return matches[0]
}

function cloneAllocation(allocation: DrawAllocationRowLike[]): DrawAllocationRowLike[] {
  return allocation.map((row) => ({
    venue: row.venue ?? '',
    teams: {
      gov: String(row.teams.gov ?? ''),
      opp: String(row.teams.opp ?? ''),
    },
    chairs: [...(row.chairs ?? [])],
    panels: [...(row.panels ?? [])],
    trainees: [...(row.trainees ?? [])],
  }))
}

function resolveRowIndex(
  entry: ParsedDrawAllocationImportEntry,
  allocation: DrawAllocationRowLike[],
  teamTokenMap: Map<string, string[]>,
  errors: string[]
) {
  if (entry.matchIndex !== undefined) {
    const rowIndex = entry.matchIndex - 1
    if (rowIndex < 0 || rowIndex >= allocation.length) {
      errors.push(`行 ${entry.line}: match ${entry.matchIndex} が範囲外です（1〜${allocation.length}）。`)
      return -1
    }
    return rowIndex
  }

  const govTeamId = resolveEntityId(
    String(entry.govTeamToken ?? ''),
    teamTokenMap,
    'チーム',
    entry.line,
    errors
  )
  const oppTeamId = resolveEntityId(
    String(entry.oppTeamToken ?? ''),
    teamTokenMap,
    'チーム',
    entry.line,
    errors
  )
  if (!govTeamId || !oppTeamId) return -1

  const matchedIndexes = allocation
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const gov = String(row.teams.gov)
      const opp = String(row.teams.opp)
      return (
        (gov === govTeamId && opp === oppTeamId) || (gov === oppTeamId && opp === govTeamId)
      )
    })
    .map(({ index }) => index)
  if (matchedIndexes.length === 0) {
    errors.push(`行 ${entry.line}: 指定された gov/opp の対戦が見つかりません。`)
    return -1
  }
  if (matchedIndexes.length > 1) {
    errors.push(`行 ${entry.line}: 指定された gov/opp の対戦が複数あります。match を指定してください。`)
    return -1
  }
  return matchedIndexes[0]
}

export function applyDrawAllocationImportEntries(
  params: ApplyDrawAllocationImportParams
): ApplyDrawAllocationImportResult {
  const { allocation, entries, teams, adjudicators, venues } = params
  const errors: string[] = []
  const teamTokenMap = buildEntityTokenMap(teams)
  const adjudicatorTokenMap = buildEntityTokenMap(adjudicators)
  const venueTokenMap = buildEntityTokenMap(venues)

  const operations: Array<{
    rowIndex: number
    venue?: string
    gov?: string
    opp?: string
    chairs?: string[]
    panels?: string[]
    trainees?: string[]
  }> = []

  for (const entry of entries) {
    const rowIndex = resolveRowIndex(entry, allocation, teamTokenMap, errors)
    if (rowIndex < 0) continue
    const current = allocation[rowIndex]
    if (!current) continue

    const operation: {
      rowIndex: number
      venue?: string
      gov?: string
      opp?: string
      chairs?: string[]
      panels?: string[]
      trainees?: string[]
    } = { rowIndex }

    if (entry.venueToken !== undefined) {
      const venueId = resolveEntityId(entry.venueToken, venueTokenMap, '会場', entry.line, errors)
      if (!venueId) continue
      operation.venue = venueId
    }

    if (entry.govTeamToken !== undefined) {
      const govId = resolveEntityId(entry.govTeamToken, teamTokenMap, 'チーム', entry.line, errors)
      if (!govId) continue
      operation.gov = govId
    }

    if (entry.oppTeamToken !== undefined) {
      const oppId = resolveEntityId(entry.oppTeamToken, teamTokenMap, 'チーム', entry.line, errors)
      if (!oppId) continue
      operation.opp = oppId
    }

    if (entry.chairTokens !== undefined) {
      const chairs = entry.chairTokens
        .map((token) => resolveEntityId(token, adjudicatorTokenMap, 'ジャッジ', entry.line, errors))
        .filter((value): value is string => Boolean(value))
      operation.chairs = uniqueList(chairs)
    }

    if (entry.panelTokens !== undefined) {
      const panels = entry.panelTokens
        .map((token) => resolveEntityId(token, adjudicatorTokenMap, 'ジャッジ', entry.line, errors))
        .filter((value): value is string => Boolean(value))
      operation.panels = uniqueList(panels)
    }

    if (entry.traineeTokens !== undefined) {
      const trainees = entry.traineeTokens
        .map((token) => resolveEntityId(token, adjudicatorTokenMap, 'ジャッジ', entry.line, errors))
        .filter((value): value is string => Boolean(value))
      operation.trainees = uniqueList(trainees)
    }

    const nextGov = operation.gov ?? String(current.teams.gov ?? '')
    const nextOpp = operation.opp ?? String(current.teams.opp ?? '')
    if (nextGov && nextOpp && nextGov === nextOpp) {
      errors.push(`行 ${entry.line}: 同じチームを両サイドに割り当てることはできません。`)
      continue
    }

    const nextChairs = operation.chairs ?? [...(current.chairs ?? [])]
    const nextPanels = operation.panels ?? [...(current.panels ?? [])]
    const nextTrainees = operation.trainees ?? [...(current.trainees ?? [])]
    let hasRoleDuplicate = false
    const seen = new Set<string>()
    for (const id of [...nextChairs, ...nextPanels, ...nextTrainees]) {
      if (seen.has(id)) {
        errors.push(`行 ${entry.line}: 同じジャッジを複数ロールに重複指定できません。`)
        hasRoleDuplicate = true
        break
      }
      seen.add(id)
    }
    if (hasRoleDuplicate) continue

    operations.push(operation)
  }

  if (errors.length > 0) {
    return { allocation: cloneAllocation(allocation), appliedRows: 0, errors }
  }

  const next = cloneAllocation(allocation)
  for (const operation of operations) {
    const row = next[operation.rowIndex]
    if (!row) continue
    if (operation.venue !== undefined) row.venue = operation.venue
    if (operation.gov !== undefined) row.teams.gov = operation.gov
    if (operation.opp !== undefined) row.teams.opp = operation.opp
    if (operation.chairs !== undefined) row.chairs = operation.chairs
    if (operation.panels !== undefined) row.panels = operation.panels
    if (operation.trainees !== undefined) row.trainees = operation.trainees
  }

  const appliedRows = new Set(operations.map((operation) => operation.rowIndex)).size
  return { allocation: next, appliedRows, errors: [] }
}
