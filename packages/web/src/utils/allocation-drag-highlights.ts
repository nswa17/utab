export type AllocationDragKind = 'team' | 'adjudicator' | 'venue'
export type AllocationDragHighlightTone = 'conflict' | 'history'

export type AllocationDragPayload = {
  kind: AllocationDragKind
  id: string
} | null

export type AllocationDragHighlightIndex = {
  team: Map<string, AllocationDragHighlightTone>
  adjudicator: Map<string, AllocationDragHighlightTone>
  venue: Map<string, AllocationDragHighlightTone>
}

export type BuildAllocationDragHighlightIndexInput = {
  drag: AllocationDragPayload
  teamIds: string[]
  adjudicatorIds: string[]
  teamInstitutions: (teamId: string) => string[]
  adjudicatorInstitutions: (adjudicatorId: string) => string[]
  adjudicatorConflicts: (adjudicatorId: string) => string[]
  teamPastOpponents: (teamId: string) => string[]
  adjudicatorJudgedTeams: (adjudicatorId: string) => string[]
}

const tonePriority: Record<AllocationDragHighlightTone, number> = {
  history: 1,
  conflict: 2,
}

function normalizeIds(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function hasOverlap(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return false
  const rightSet = new Set(right)
  return left.some((value) => rightSet.has(value))
}

function createEmptyIndex(): AllocationDragHighlightIndex {
  return {
    team: new Map<string, AllocationDragHighlightTone>(),
    adjudicator: new Map<string, AllocationDragHighlightTone>(),
    venue: new Map<string, AllocationDragHighlightTone>(),
  }
}

function setHighlight(
  map: Map<string, AllocationDragHighlightTone>,
  id: string,
  tone: AllocationDragHighlightTone
) {
  const normalizedId = String(id ?? '').trim()
  if (!normalizedId) return
  const current = map.get(normalizedId)
  if (!current || tonePriority[tone] > tonePriority[current]) {
    map.set(normalizedId, tone)
  }
}

export function buildAllocationDragHighlightIndex(
  input: BuildAllocationDragHighlightIndexInput
): AllocationDragHighlightIndex {
  const drag = input.drag
  if (!drag) return createEmptyIndex()

  const index = createEmptyIndex()
  const teamIds = normalizeIds(input.teamIds)
  const adjudicatorIds = normalizeIds(input.adjudicatorIds)

  if (drag.kind === 'team') {
    const draggedTeamId = String(drag.id ?? '').trim()
    if (!draggedTeamId) return index
    const draggedInstitutions = normalizeIds(input.teamInstitutions(draggedTeamId))
    const pastOpponentSet = new Set(normalizeIds(input.teamPastOpponents(draggedTeamId)))

    teamIds.forEach((teamId) => {
      if (teamId === draggedTeamId) return
      if (hasOverlap(draggedInstitutions, normalizeIds(input.teamInstitutions(teamId)))) {
        setHighlight(index.team, teamId, 'conflict')
      }
      if (pastOpponentSet.has(teamId)) {
        setHighlight(index.team, teamId, 'history')
      }
    })

    adjudicatorIds.forEach((adjudicatorId) => {
      if (
        hasOverlap(
          draggedInstitutions,
          normalizeIds(input.adjudicatorInstitutions(adjudicatorId))
        )
      ) {
        setHighlight(index.adjudicator, adjudicatorId, 'conflict')
      }
      if (normalizeIds(input.adjudicatorConflicts(adjudicatorId)).includes(draggedTeamId)) {
        setHighlight(index.adjudicator, adjudicatorId, 'conflict')
      }
      if (normalizeIds(input.adjudicatorJudgedTeams(adjudicatorId)).includes(draggedTeamId)) {
        setHighlight(index.adjudicator, adjudicatorId, 'history')
      }
    })

    return index
  }

  if (drag.kind === 'adjudicator') {
    const draggedAdjudicatorId = String(drag.id ?? '').trim()
    if (!draggedAdjudicatorId) return index
    const draggedInstitutions = normalizeIds(input.adjudicatorInstitutions(draggedAdjudicatorId))
    const draggedConflictTeams = new Set(
      normalizeIds(input.adjudicatorConflicts(draggedAdjudicatorId))
    )
    const judgedTeamSet = new Set(normalizeIds(input.adjudicatorJudgedTeams(draggedAdjudicatorId)))

    teamIds.forEach((teamId) => {
      if (hasOverlap(draggedInstitutions, normalizeIds(input.teamInstitutions(teamId)))) {
        setHighlight(index.team, teamId, 'conflict')
      }
      if (draggedConflictTeams.has(teamId)) {
        setHighlight(index.team, teamId, 'conflict')
      }
      if (judgedTeamSet.has(teamId)) {
        setHighlight(index.team, teamId, 'history')
      }
    })

    adjudicatorIds.forEach((adjudicatorId) => {
      if (adjudicatorId === draggedAdjudicatorId) return
      if (
        hasOverlap(
          draggedInstitutions,
          normalizeIds(input.adjudicatorInstitutions(adjudicatorId))
        )
      ) {
        setHighlight(index.adjudicator, adjudicatorId, 'conflict')
      }
    })
  }

  return index
}

export function allocationDragHighlightToneForIds(
  index: AllocationDragHighlightIndex,
  kind: AllocationDragKind,
  ids: string[]
): AllocationDragHighlightTone | null {
  const normalizedIds = normalizeIds(ids)
  if (normalizedIds.length === 0) return null
  const map =
    kind === 'team' ? index.team : kind === 'adjudicator' ? index.adjudicator : index.venue

  let selectedTone: AllocationDragHighlightTone | null = null
  normalizedIds.forEach((id) => {
    const tone = map.get(id)
    if (!tone) return
    if (!selectedTone || tonePriority[tone] > tonePriority[selectedTone]) {
      selectedTone = tone
    }
  })

  return selectedTone
}
