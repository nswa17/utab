export type AdjudicatorImportMode = 'replace' | 'append'

export type ParsedAdjudicatorImportEntry = {
  line: number
  matchIndex?: number
  govTeamToken?: string
  oppTeamToken?: string
  chairTokens: string[]
  panelTokens: string[]
  traineeTokens: string[]
}

export type ParsedAdjudicatorImport = {
  entries: ParsedAdjudicatorImportEntry[]
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

export type ApplyAdjudicatorImportParams = {
  allocation: DrawAllocationRowLike[]
  entries: ParsedAdjudicatorImportEntry[]
  teams: NamedEntity[]
  adjudicators: NamedEntity[]
  mode: AdjudicatorImportMode
}

export type ApplyAdjudicatorImportResult = {
  allocation: DrawAllocationRowLike[]
  appliedRows: number
  errors: string[]
}

const matchHeaderKeys = ['match', 'match_no', 'match_no.', 'room', 'row', 'index']
const govHeaderKeys = ['gov', 'team_gov', 'gov_team', 'government']
const oppHeaderKeys = ['opp', 'team_opp', 'opp_team', 'opposition']
const chairHeaderKeys = ['chair', 'chairs']
const panelHeaderKeys = ['panel', 'panels']
const traineeHeaderKeys = ['trainee', 'trainees']
const knownHeaderKeys = new Set([
  ...matchHeaderKeys,
  ...govHeaderKeys,
  ...oppHeaderKeys,
  ...chairHeaderKeys,
  ...panelHeaderKeys,
  ...traineeHeaderKeys,
])

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
  const unique: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    unique.push(value)
  }
  return unique
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = headers.indexOf(candidate)
    if (index >= 0) return index
  }
  return -1
}

function getCell(
  cells: string[],
  headers: string[],
  headerCandidates: string[],
  fallbackIndex: number
): string {
  if (headers.length === 0) return cells[fallbackIndex] ?? ''
  const index = findHeaderIndex(headers, headerCandidates)
  if (index < 0) return ''
  return cells[index] ?? ''
}

export function parseAdjudicatorImportText(text: string): ParsedAdjudicatorImport {
  const lines = text
    .split(/\r?\n/)
    .map((raw, idx) => ({ lineNo: idx + 1, raw: raw.trim() }))
    .filter((row) => row.raw.length > 0)

  if (lines.length === 0) {
    return { entries: [], errors: ['取り込み内容が空です。'] }
  }

  const delimiter = detectDelimiter(lines[0].raw)
  const firstCells = splitCells(lines[0].raw, delimiter)
  const normalizedFirstCells = firstCells.map(normalizeHeader)
  const hasHeader = normalizedFirstCells.some((value) => knownHeaderKeys.has(value))

  const headers = hasHeader ? normalizedFirstCells : []
  const bodyLines = hasHeader ? lines.slice(1) : lines
  const errors: string[] = []
  const entries: ParsedAdjudicatorImportEntry[] = []

  for (const row of bodyLines) {
    const cells = splitCells(row.raw, delimiter)
    const matchToken = getCell(cells, headers, matchHeaderKeys, 0)
    const govTeamToken = getCell(cells, headers, govHeaderKeys, -1).trim()
    const oppTeamToken = getCell(cells, headers, oppHeaderKeys, -1).trim()
    const chairTokens = uniqueList(splitList(getCell(cells, headers, chairHeaderKeys, 1)))
    const panelTokens = uniqueList(splitList(getCell(cells, headers, panelHeaderKeys, 2)))
    const traineeTokens = uniqueList(splitList(getCell(cells, headers, traineeHeaderKeys, 3)))

    const hasAnyRole = chairTokens.length > 0 || panelTokens.length > 0 || traineeTokens.length > 0
    if (!hasAnyRole) {
      errors.push(`行 ${row.lineNo}: チェア/パネル/トレーニーのいずれかを指定してください。`)
      continue
    }

    let matchIndex: number | undefined
    if (matchToken) {
      const parsedMatch = Number.parseInt(matchToken, 10)
      if (!Number.isFinite(parsedMatch) || parsedMatch <= 0) {
        errors.push(`行 ${row.lineNo}: match は 1 以上の整数で指定してください。`)
        continue
      }
      matchIndex = parsedMatch
    }

    if (!matchIndex && !(govTeamToken && oppTeamToken)) {
      errors.push(`行 ${row.lineNo}: match または gov/opp のペアを指定してください。`)
      continue
    }

    entries.push({
      line: row.lineNo,
      matchIndex,
      govTeamToken: govTeamToken || undefined,
      oppTeamToken: oppTeamToken || undefined,
      chairTokens,
      panelTokens,
      traineeTokens,
    })
  }

  return { entries, errors }
}

function registerEntityToken(map: Map<string, string[]>, token: string, id: string) {
  if (!token) return
  const key = token.trim().toLowerCase()
  if (!key) return
  const current = map.get(key) ?? []
  if (!current.includes(id)) current.push(id)
  map.set(key, current)
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
    errors.push(`行 ${line}: ${label} "${token}" が見つかりません。`)
    return null
  }
  if (matches.length > 1) {
    errors.push(`行 ${line}: ${label} "${token}" は重複しているため特定できません。`)
    return null
  }
  return matches[0]
}

function cloneAllocation(allocation: DrawAllocationRowLike[]): DrawAllocationRowLike[] {
  return allocation.map((row) => ({
    venue: row.venue,
    teams: { gov: row.teams.gov, opp: row.teams.opp },
    chairs: [...(row.chairs ?? [])],
    panels: [...(row.panels ?? [])],
    trainees: [...(row.trainees ?? [])],
  }))
}

function mergeUnique(base: string[], addition: string[]): string[] {
  const result = [...base]
  const seen = new Set(result)
  for (const value of addition) {
    if (seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

export function applyAdjudicatorImportEntries(
  params: ApplyAdjudicatorImportParams
): ApplyAdjudicatorImportResult {
  const { allocation, entries, teams, adjudicators, mode } = params
  const errors: string[] = []
  const teamTokenMap = buildEntityTokenMap(teams)
  const adjudicatorTokenMap = buildEntityTokenMap(adjudicators)
  const operations: Array<{
    rowIndex: number
    chairs: string[]
    panels: string[]
    trainees: string[]
  }> = []

  for (const entry of entries) {
    let rowIndex = -1
    if (entry.matchIndex !== undefined) {
      rowIndex = entry.matchIndex - 1
      if (rowIndex < 0 || rowIndex >= allocation.length) {
        errors.push(
          `行 ${entry.line}: match ${entry.matchIndex} が範囲外です（1〜${allocation.length}）。`
        )
        continue
      }
    } else {
      const govTeamId = resolveEntityId(
        String(entry.govTeamToken ?? ''),
        teamTokenMap,
        'gov team',
        entry.line,
        errors
      )
      const oppTeamId = resolveEntityId(
        String(entry.oppTeamToken ?? ''),
        teamTokenMap,
        'opp team',
        entry.line,
        errors
      )
      if (!govTeamId || !oppTeamId) continue
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
        continue
      }
      if (matchedIndexes.length > 1) {
        errors.push(`行 ${entry.line}: 指定された gov/opp の対戦が複数あります。match を指定してください。`)
        continue
      }
      rowIndex = matchedIndexes[0]
    }

    const chairs = entry.chairTokens
      .map((token) =>
        resolveEntityId(token, adjudicatorTokenMap, 'adjudicator', entry.line, errors)
      )
      .filter((value): value is string => Boolean(value))
    const panels = entry.panelTokens
      .map((token) =>
        resolveEntityId(token, adjudicatorTokenMap, 'adjudicator', entry.line, errors)
      )
      .filter((value): value is string => Boolean(value))
    const trainees = entry.traineeTokens
      .map((token) =>
        resolveEntityId(token, adjudicatorTokenMap, 'adjudicator', entry.line, errors)
      )
      .filter((value): value is string => Boolean(value))

    const roleDuplicates = new Set<string>()
    const roleSeen = new Set<string>()
    for (const id of [...chairs, ...panels, ...trainees]) {
      if (roleSeen.has(id)) roleDuplicates.add(id)
      roleSeen.add(id)
    }
    if (roleDuplicates.size > 0) {
      errors.push(`行 ${entry.line}: 同じジャッジを複数ロールに重複指定できません。`)
      continue
    }

    operations.push({
      rowIndex,
      chairs,
      panels,
      trainees,
    })
  }

  if (errors.length > 0) {
    return { allocation: cloneAllocation(allocation), appliedRows: 0, errors }
  }

  const nextAllocation = cloneAllocation(allocation)
  for (const operation of operations) {
    const row = nextAllocation[operation.rowIndex]
    if (!row) continue
    if (mode === 'append') {
      row.chairs = mergeUnique(row.chairs ?? [], operation.chairs)
      row.panels = mergeUnique(row.panels ?? [], operation.panels)
      row.trainees = mergeUnique(row.trainees ?? [], operation.trainees)
    } else {
      row.chairs = [...operation.chairs]
      row.panels = [...operation.panels]
      row.trainees = [...operation.trainees]
    }
  }

  const appliedRows = new Set(operations.map((operation) => operation.rowIndex)).size
  return { allocation: nextAllocation, appliedRows, errors: [] }
}
