type BreakRoundResolverParams = {
  roundUserDefinedData?: unknown
  drawUserDefinedData?: unknown
  allocation?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function uniqueTeamIds(teamIds: string[]): string[] {
  return Array.from(
    new Set(
      teamIds
        .map((teamId) => String(teamId ?? '').trim())
        .filter((teamId) => teamId.length > 0)
    )
  )
}

function breakConfigFromUserDefinedData(value: unknown): Record<string, unknown> {
  return asRecord(asRecord(value).break)
}

function hasBreakConfigSignal(breakConfig: Record<string, unknown>): boolean {
  if (breakConfig.enabled === true) return true
  if (readBreakParticipantTeamIds(breakConfig.participants).length > 0) return true
  if (readBreakParticipantTeamIds(breakConfig.stage_participants).length > 0) return true
  if (breakConfig.derived_from_previous_round === true) return true
  const previousRound = Number(breakConfig.previous_round)
  if (Number.isInteger(previousRound) && previousRound >= 1) return true
  return false
}

export function readBreakParticipantTeamIds(participants: unknown): string[] {
  if (!Array.isArray(participants)) return []
  return uniqueTeamIds(participants.map((entry: any) => String(entry?.teamId ?? '')))
}

export function readAllocationTeamIds(allocation: unknown): string[] {
  if (!Array.isArray(allocation)) return []
  const teamIds: string[] = []
  allocation.forEach((row: any) => {
    if (!row || typeof row !== 'object') return
    const teams = row.teams
    if (Array.isArray(teams)) {
      teams.forEach((teamId: unknown) => {
        teamIds.push(String(teamId ?? ''))
      })
      return
    }
    teamIds.push(String((teams as any)?.gov ?? ''))
    teamIds.push(String((teams as any)?.opp ?? ''))
  })
  return uniqueTeamIds(teamIds)
}

export function isBreakRoundLike(params: BreakRoundResolverParams): boolean {
  const roundBreak = breakConfigFromUserDefinedData(params.roundUserDefinedData)
  const drawUserDefined = asRecord(params.drawUserDefinedData)
  const drawBreak = breakConfigFromUserDefinedData(params.drawUserDefinedData)
  const drawTeamAlgorithm = String(drawUserDefined.team_allocation_algorithm ?? '').trim()
  if (drawTeamAlgorithm === 'break') return true
  if (hasBreakConfigSignal(roundBreak)) return true
  if (hasBreakConfigSignal(drawBreak)) return true
  return false
}

export function resolveBreakStageTeamIds(params: BreakRoundResolverParams): string[] {
  const roundBreak = breakConfigFromUserDefinedData(params.roundUserDefinedData)
  const drawBreak = breakConfigFromUserDefinedData(params.drawUserDefinedData)
  const stageParticipants = readBreakParticipantTeamIds(drawBreak.stage_participants)
  if (stageParticipants.length > 0) return stageParticipants

  const drawParticipants = readBreakParticipantTeamIds(drawBreak.participants)
  if (drawParticipants.length > 0) return drawParticipants

  const roundParticipants = readBreakParticipantTeamIds(roundBreak.participants)
  if (roundParticipants.length > 0) return roundParticipants

  return readAllocationTeamIds(params.allocation)
}
