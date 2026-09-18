import {
  drawTeamGroupKey,
  drawTeamId,
  drawTeamIds,
  drawTeamPositions,
  inferDrawTeamNum,
  normalizeDrawTeams,
  setDrawTeamId,
  type DrawTeamPosition,
  type DrawTeamRecord,
} from './draw-teams'

export type ParsedDrawAllocationImportEntry = {
  line: number
  matchIndex?: number
  venueToken?: string
  govTeamToken?: string
  oppTeamToken?: string
  ogTeamToken?: string
  ooTeamToken?: string
  cgTeamToken?: string
  coTeamToken?: string
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
  teams: DrawTeamRecord
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
  teamNum?: 2 | 4
}

export type ApplyDrawAllocationImportResult = {
  allocation: DrawAllocationRowLike[]
  appliedRows: number
  errors: string[]
}

const matchHeaderKeys = ['match', 'match_no', 'match_no.', 'row', 'index']
const venueHeaderKeys = ['venue', 'room', 'table']
const teamHeaderKeys: Record<DrawTeamPosition, string[]> = {
  gov: ['gov', 'team_gov', 'gov_team', 'government'],
  opp: ['opp', 'team_opp', 'opp_team', 'opposition'],
  og: ['og', 'opening_government', 'opening_gov', 'team_og'],
  oo: ['oo', 'opening_opposition', 'opening_opp', 'team_oo'],
  cg: ['cg', 'closing_government', 'closing_gov', 'team_cg'],
  co: ['co', 'closing_opposition', 'closing_opp', 'team_co'],
}
const chairHeaderKeys = ['chair', 'chairs']
const panelHeaderKeys = ['panel', 'panels']
const traineeHeaderKeys = ['trainee', 'trainees']
const knownHeaderKeys = new Set([
  ...matchHeaderKeys,
  ...venueHeaderKeys,
  ...Object.values(teamHeaderKeys).flat(),
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
  return tabCount > commaCount ? '\t' : ','
}

function splitCells(line: string, delimiter: ',' | '\t'): string[] {
  return line.split(delimiter).map((cell) => cell.trim())
}

function splitList(value: string): string[] {
  if (!value) return []
  return value.split(/[|;]+/).map((token) => token.trim()).filter(Boolean)
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values))
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = headers.indexOf(candidate)
    if (index >= 0) return index
  }
  return -1
}

function getCell(cells: string[], index: number): string {
  return index < 0 ? '' : (cells[index] ?? '')
}

function parseMatchIndex(token: string): number | undefined {
  if (!token) return undefined
  const parsed = Number.parseInt(token, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function setParsedTeamToken(
  entry: ParsedDrawAllocationImportEntry,
  position: DrawTeamPosition,
  token: string
) {
  if (!token) return
  if (position === 'gov') entry.govTeamToken = token
  else if (position === 'opp') entry.oppTeamToken = token
  else if (position === 'og') entry.ogTeamToken = token
  else if (position === 'oo') entry.ooTeamToken = token
  else if (position === 'cg') entry.cgTeamToken = token
  else entry.coTeamToken = token
}

function parsedTeamToken(
  entry: ParsedDrawAllocationImportEntry,
  position: DrawTeamPosition
): string | undefined {
  if (position === 'gov') return entry.govTeamToken
  if (position === 'opp') return entry.oppTeamToken
  if (position === 'og') return entry.ogTeamToken ?? entry.govTeamToken
  if (position === 'oo') return entry.ooTeamToken ?? entry.oppTeamToken
  if (position === 'cg') return entry.cgTeamToken
  return entry.coTeamToken
}

export function parseDrawAllocationImportText(text: string): ParsedDrawAllocationImport {
  const lines = text
    .split(/\r?\n/)
    .map((raw, index) => ({ lineNo: index + 1, raw: raw.trim() }))
    .filter((row) => row.raw.length > 0)

  if (lines.length === 0) return { entries: [], errors: ['取り込み内容が空です。'] }

  const delimiter = detectDelimiter(lines[0].raw)
  const firstCells = splitCells(lines[0].raw, delimiter)
  const headers = firstCells.map(normalizeHeader)
  const hasHeader = headers.some((value) => knownHeaderKeys.has(value))
  if (!hasHeader) {
    return {
      entries: [],
      errors: ['1行目にCSVヘッダーが必要です。テンプレートをダウンロードして列名を揃えてください。'],
    }
  }

  const errors: string[] = []
  const entries: ParsedDrawAllocationImportEntry[] = []
  for (const row of lines.slice(1)) {
    const cells = splitCells(row.raw, delimiter)
    const matchCell = getCell(cells, findHeaderIndex(headers, matchHeaderKeys))
    const matchIndex = parseMatchIndex(matchCell)
    if (matchCell && matchIndex === undefined) {
      errors.push(`行 ${row.lineNo}: match は 1 以上の整数で指定してください。`)
      continue
    }

    const entry: ParsedDrawAllocationImportEntry = { line: row.lineNo }
    if (matchIndex !== undefined) entry.matchIndex = matchIndex

    const venueCell = getCell(cells, findHeaderIndex(headers, venueHeaderKeys))
    if (venueCell) entry.venueToken = venueCell

    ;(['gov', 'opp', 'og', 'oo', 'cg', 'co'] as DrawTeamPosition[]).forEach((position) => {
      const token = getCell(cells, findHeaderIndex(headers, teamHeaderKeys[position]))
      setParsedTeamToken(entry, position, token)
    })

    const chairCell = getCell(cells, findHeaderIndex(headers, chairHeaderKeys))
    const panelCell = getCell(cells, findHeaderIndex(headers, panelHeaderKeys))
    const traineeCell = getCell(cells, findHeaderIndex(headers, traineeHeaderKeys))
    if (chairCell) entry.chairTokens = uniqueList(splitList(chairCell))
    if (panelCell) entry.panelTokens = uniqueList(splitList(panelCell))
    if (traineeCell) entry.traineeTokens = uniqueList(splitList(traineeCell))

    const hasAnyValue =
      entry.venueToken !== undefined ||
      (['gov', 'opp', 'og', 'oo', 'cg', 'co'] as DrawTeamPosition[]).some(
        (position) => parsedTeamToken(entry, position) !== undefined
      ) ||
      entry.chairTokens !== undefined ||
      entry.panelTokens !== undefined ||
      entry.traineeTokens !== undefined
    if (!hasAnyValue) {
      errors.push(`行 ${row.lineNo}: 反映するセルがありません。`)
      continue
    }

    const hasLegacyPair = entry.govTeamToken !== undefined && entry.oppTeamToken !== undefined
    const hasBpGroup = ['og', 'oo', 'cg', 'co'].every(
      (position) => parsedTeamToken(entry, position as DrawTeamPosition) !== undefined
    )
    if (entry.matchIndex === undefined && !hasLegacyPair && !hasBpGroup) {
      errors.push(
        `行 ${row.lineNo}: match または完全なチーム組み合わせで対象行を指定してください。`
      )
      continue
    }
    entries.push(entry)
  }

  return { entries, errors }
}

function registerEntityToken(map: Map<string, string[]>, token: string, id: string) {
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
  const matches = tokenMap.get(token.trim().toLowerCase()) ?? []
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

function cloneAllocation(
  allocation: DrawAllocationRowLike[],
  teamNum?: 2 | 4
): DrawAllocationRowLike[] {
  return allocation.map((row) => ({
    venue: row.venue ?? '',
    teams: normalizeDrawTeams(row.teams, teamNum ?? inferDrawTeamNum(row.teams)),
    chairs: [...(row.chairs ?? [])],
    panels: [...(row.panels ?? [])],
    trainees: [...(row.trainees ?? [])],
  }))
}

function resolveRowIndex(
  entry: ParsedDrawAllocationImportEntry,
  allocation: DrawAllocationRowLike[],
  teamTokenMap: Map<string, string[]>,
  teamNum: 2 | 4,
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

  const resolvedIds: string[] = []
  for (const position of drawTeamPositions(teamNum)) {
    const token = parsedTeamToken(entry, position)
    if (!token) return -1
    const id = resolveEntityId(token, teamTokenMap, 'チーム', entry.line, errors)
    if (!id) return -1
    resolvedIds.push(id)
  }
  const targetKey = resolvedIds.slice().sort().join('::')
  const matchedIndexes = allocation
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => drawTeamGroupKey(row.teams, teamNum) === targetKey)
    .map(({ index }) => index)

  if (matchedIndexes.length === 0) {
    errors.push(`行 ${entry.line}: 指定されたチーム組み合わせが見つかりません。`)
    return -1
  }
  if (matchedIndexes.length > 1) {
    errors.push(`行 ${entry.line}: 指定されたチーム組み合わせが複数あります。match を指定してください。`)
    return -1
  }
  return matchedIndexes[0]
}

export function applyDrawAllocationImportEntries(
  params: ApplyDrawAllocationImportParams
): ApplyDrawAllocationImportResult {
  const { allocation, entries, teams, adjudicators, venues } = params
  const teamNum = params.teamNum ?? inferDrawTeamNum(allocation[0]?.teams)
  const errors: string[] = []
  const teamTokenMap = buildEntityTokenMap(teams)
  const adjudicatorTokenMap = buildEntityTokenMap(adjudicators)
  const venueTokenMap = buildEntityTokenMap(venues)

  const operations: Array<{
    rowIndex: number
    venue?: string
    teams: Partial<Record<DrawTeamPosition, string>>
    chairs?: string[]
    panels?: string[]
    trainees?: string[]
  }> = []

  for (const entry of entries) {
    const rowIndex = resolveRowIndex(entry, allocation, teamTokenMap, teamNum, errors)
    if (rowIndex < 0) continue
    const current = allocation[rowIndex]
    if (!current) continue

    const operation: {
      rowIndex: number
      venue?: string
      teams: Partial<Record<DrawTeamPosition, string>>
      chairs?: string[]
      panels?: string[]
      trainees?: string[]
    } = { rowIndex, teams: {} }

    if (entry.venueToken !== undefined) {
      const venueId = resolveEntityId(entry.venueToken, venueTokenMap, '会場', entry.line, errors)
      if (!venueId) continue
      operation.venue = venueId
    }

    for (const position of drawTeamPositions(teamNum)) {
      const token = parsedTeamToken(entry, position)
      if (token === undefined) continue
      const teamId = resolveEntityId(token, teamTokenMap, 'チーム', entry.line, errors)
      if (!teamId) continue
      operation.teams[position] = teamId
    }

    if (entry.chairTokens !== undefined) {
      operation.chairs = uniqueList(
        entry.chairTokens
          .map((token) => resolveEntityId(token, adjudicatorTokenMap, 'ジャッジ', entry.line, errors))
          .filter((value): value is string => Boolean(value))
      )
    }
    if (entry.panelTokens !== undefined) {
      operation.panels = uniqueList(
        entry.panelTokens
          .map((token) => resolveEntityId(token, adjudicatorTokenMap, 'ジャッジ', entry.line, errors))
          .filter((value): value is string => Boolean(value))
      )
    }
    if (entry.traineeTokens !== undefined) {
      operation.trainees = uniqueList(
        entry.traineeTokens
          .map((token) => resolveEntityId(token, adjudicatorTokenMap, 'ジャッジ', entry.line, errors))
          .filter((value): value is string => Boolean(value))
      )
    }

    const nextTeams = normalizeDrawTeams(current.teams, teamNum)
    Object.entries(operation.teams).forEach(([position, teamId]) => {
      setDrawTeamId(nextTeams, position as DrawTeamPosition, teamId ?? '', teamNum)
    })
    const nextTeamIds = drawTeamIds(nextTeams, teamNum)
    if (new Set(nextTeamIds).size !== nextTeamIds.length) {
      errors.push(`行 ${entry.line}: 同じチームを複数ポジションに割り当てることはできません。`)
      continue
    }

    const nextChairs = operation.chairs ?? [...(current.chairs ?? [])]
    const nextPanels = operation.panels ?? [...(current.panels ?? [])]
    const nextTrainees = operation.trainees ?? [...(current.trainees ?? [])]
    const roleIds = [...nextChairs, ...nextPanels, ...nextTrainees]
    if (new Set(roleIds).size !== roleIds.length) {
      errors.push(`行 ${entry.line}: 同じジャッジを複数ロールに重複指定できません。`)
      continue
    }

    operations.push(operation)
  }

  if (errors.length > 0) {
    return { allocation: cloneAllocation(allocation, teamNum), appliedRows: 0, errors }
  }

  const next = cloneAllocation(allocation, teamNum)
  for (const operation of operations) {
    const row = next[operation.rowIndex]
    if (!row) continue
    if (operation.venue !== undefined) row.venue = operation.venue
    Object.entries(operation.teams).forEach(([position, teamId]) => {
      setDrawTeamId(row.teams, position as DrawTeamPosition, teamId ?? '', teamNum)
    })
    if (operation.chairs !== undefined) row.chairs = operation.chairs
    if (operation.panels !== undefined) row.panels = operation.panels
    if (operation.trainees !== undefined) row.trainees = operation.trainees
  }

  return {
    allocation: next,
    appliedRows: new Set(operations.map((operation) => operation.rowIndex)).size,
    errors: [],
  }
}
