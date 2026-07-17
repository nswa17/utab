export type AllocationHistoryRowLike = {
  teams?: { gov?: unknown; opp?: unknown }
  chairs?: unknown[]
  panels?: unknown[]
  trainees?: unknown[]
}

export type AllocationHistoryDrawLike = {
  tournamentId?: unknown
  round?: unknown
  allocation?: AllocationHistoryRowLike[]
}

function normalizedId(value: unknown): string {
  return String(value ?? '').trim()
}

function uniqueIds(values: unknown[]): string[] {
  return Array.from(new Set(values.map(normalizedId).filter(Boolean)))
}

export function priorAllocationRows(
  draws: AllocationHistoryDrawLike[],
  tournamentId: string,
  beforeRound: number
): AllocationHistoryRowLike[] {
  if (!Number.isInteger(beforeRound) || beforeRound <= 1) return []
  const normalizedTournamentId = normalizedId(tournamentId)
  return draws
    .filter(
      (draw) =>
        normalizedId(draw.tournamentId) === normalizedTournamentId && Number(draw.round) < beforeRound
    )
    .flatMap((draw) => (Array.isArray(draw.allocation) ? draw.allocation : []))
}

export function allocationRowAdjudicatorIds(row: AllocationHistoryRowLike): string[] {
  return uniqueIds([...(row.chairs ?? []), ...(row.panels ?? []), ...(row.trainees ?? [])])
}

function allocationRowChairPanelIds(row: AllocationHistoryRowLike): string[] {
  return uniqueIds([...(row.chairs ?? []), ...(row.panels ?? [])])
}

export function pastOpponentIdsFromAllocation(
  rows: AllocationHistoryRowLike[],
  teamId: string
): string[] {
  const normalizedTeamId = normalizedId(teamId)
  if (!normalizedTeamId) return []
  const opponents: string[] = []
  rows.forEach((row) => {
    const govId = normalizedId(row.teams?.gov)
    const oppId = normalizedId(row.teams?.opp)
    if (govId === normalizedTeamId && oppId) opponents.push(oppId)
    if (oppId === normalizedTeamId && govId) opponents.push(govId)
  })
  return uniqueIds(opponents)
}

export function pastSidesFromAllocation(rows: AllocationHistoryRowLike[], teamId: string): string[] {
  const normalizedTeamId = normalizedId(teamId)
  if (!normalizedTeamId) return []
  const sides: string[] = []
  rows.forEach((row) => {
    if (normalizedId(row.teams?.gov) === normalizedTeamId) sides.push('gov')
    if (normalizedId(row.teams?.opp) === normalizedTeamId) sides.push('opp')
  })
  return sides
}

export function teamAdjudicatorIdsFromAllocation(
  rows: AllocationHistoryRowLike[],
  teamId: string
): string[] {
  const normalizedTeamId = normalizedId(teamId)
  if (!normalizedTeamId) return []
  return uniqueIds(
    rows.flatMap((row) => {
      const teamIds = [normalizedId(row.teams?.gov), normalizedId(row.teams?.opp)]
      return teamIds.includes(normalizedTeamId) ? allocationRowAdjudicatorIds(row) : []
    })
  )
}

export function adjudicatorJudgedTeamIdsFromAllocation(
  rows: AllocationHistoryRowLike[],
  adjudicatorId: string
): string[] {
  const normalizedAdjudicatorId = normalizedId(adjudicatorId)
  if (!normalizedAdjudicatorId) return []
  return uniqueIds(
    rows.flatMap((row) =>
      allocationRowAdjudicatorIds(row).includes(normalizedAdjudicatorId)
        ? [row.teams?.gov, row.teams?.opp]
        : []
    )
  )
}

export function coAdjudicatorIdsFromAllocation(
  rows: AllocationHistoryRowLike[],
  adjudicatorId: string
): string[] {
  const normalizedAdjudicatorId = normalizedId(adjudicatorId)
  if (!normalizedAdjudicatorId) return []
  return uniqueIds(
    rows.flatMap((row) => {
      // Co-adjudication history is specifically Chair/Panel history. A trainee
      // is still shown in team judging history, but is not treated as a panel peer.
      const assignedIds = allocationRowChairPanelIds(row)
      return assignedIds.includes(normalizedAdjudicatorId)
        ? assignedIds.filter((id) => id !== normalizedAdjudicatorId)
        : []
    })
  )
}
