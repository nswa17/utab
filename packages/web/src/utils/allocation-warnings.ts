export type WarningSeverity = 'critical' | 'warn' | 'info'
export type WarningCategory = 'team' | 'adjudicator' | 'venue'
export type ConflictGroupCategory = 'institution' | 'region' | 'league'

export type WarningCode =
  | 'team_unavailable'
  | 'venue_unavailable'
  | 'team_side_imbalance'
  | 'team_same_institution'
  | 'team_different_win'
  | 'team_past_match'
  | 'team_past_match_same_institution'
  | 'adjudicator_unavailable'
  | 'adjudicator_institution_conflict'
  | 'adjudicator_personal_conflict'
  | 'adjudicator_already_judged'
  | 'adjudicator_same_institution'
  | 'adjudicator_none'
  | 'adjudicator_even_count'

export type WarningEntityRef = {
  rowIndex: number
  teamIds: string[]
  adjudicatorIds: string[]
  venueIds: string[]
}

export type AllocationWarning = {
  code: WarningCode
  severity: WarningSeverity
  category: WarningCategory
  targets: WarningEntityRef
  params: Record<string, string>
}

export type WarningSeverityCounts = {
  critical: number
  warn: number
  info: number
}

export type RowWarningState = {
  rowIndex: number
  warnings: AllocationWarning[]
  counts: WarningSeverityCounts
}

export type EntityWarningIndexEntry = {
  maxSeverity: WarningSeverity
  warningCount: number
  rowIndexes: number[]
}

export type DrawAllocationRowLike = {
  venue?: string | null
  teams: {
    gov?: string | null
    opp?: string | null
  }
  chairs?: string[]
  panels?: string[]
  trainees?: string[]
}

export type BuildRowWarningStatesInput = {
  allocation: DrawAllocationRowLike[]
  isTeamAvailable: (teamId: string) => boolean | undefined
  isAdjudicatorAvailable: (adjudicatorId: string) => boolean | undefined
  isVenueAvailable: (venueId: string) => boolean | undefined
  teamInstitutions: (teamId: string) => string[]
  adjudicatorInstitutions: (adjudicatorId: string) => string[]
  institutionCategory: (institutionId: string) => ConflictGroupCategory
  adjudicatorConflicts: (adjudicatorId: string) => string[]
  teamWin: (teamId: string) => number | undefined
  teamPastOpponents: (teamId: string) => string[]
  teamPastSides: (teamId: string) => string[]
  adjudicatorJudgedTeams: (adjudicatorId: string) => string[]
}

const severityWeight: Record<WarningSeverity, number> = {
  critical: 3,
  warn: 2,
  info: 1,
}

const conflictCategoryOrder: ConflictGroupCategory[] = ['institution', 'region', 'league']

function normalizeId(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeIdList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return values.map((value) => String(value ?? '').trim()).filter((value) => value.length > 0)
}

function normalizeConflictGroupCategory(value: unknown): ConflictGroupCategory {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'region') return 'region'
  if (normalized === 'league') return 'league'
  return 'institution'
}

function overlapConflictCategories(
  left: string[],
  right: string[],
  categoryOf: (institutionId: string) => ConflictGroupCategory
): ConflictGroupCategory[] {
  if (left.length === 0 || right.length === 0) return []
  const rightSet = new Set(right)
  const overlaps = new Set<ConflictGroupCategory>()
  left.forEach((institutionId) => {
    if (!rightSet.has(institutionId)) return
    overlaps.add(normalizeConflictGroupCategory(categoryOf(institutionId)))
  })
  return conflictCategoryOrder.filter((category) => overlaps.has(category))
}

function checkSided(pastSides: string[], side: 'gov' | 'opp') {
  const sides = normalizeIdList([...pastSides, side])
  const govCount = sides.filter((value) => value === 'gov').length
  const oppCount = sides.filter((value) => value === 'opp').length
  return Math.abs(govCount - oppCount) > 1
}

function createTargets(
  rowIndex: number,
  teamIds: string[] = [],
  adjudicatorIds: string[] = [],
  venueIds: string[] = []
): WarningEntityRef {
  return {
    rowIndex,
    teamIds: normalizeIdList(teamIds),
    adjudicatorIds: normalizeIdList(adjudicatorIds),
    venueIds: normalizeIdList(venueIds),
  }
}

function createWarning(
  rowIndex: number,
  code: WarningCode,
  severity: WarningSeverity,
  category: WarningCategory,
  targets: WarningEntityRef,
  params: Record<string, string>
): AllocationWarning {
  return { code, severity, category, targets, params }
}

export function warningSeverityCounts(warnings: AllocationWarning[]): WarningSeverityCounts {
  return warnings.reduce<WarningSeverityCounts>(
    (counts, warning) => {
      counts[warning.severity] += 1
      return counts
    },
    { critical: 0, warn: 0, info: 0 }
  )
}

export function buildRowWarningStates(input: BuildRowWarningStatesInput): RowWarningState[] {
  return input.allocation.map((row, rowIndex) => {
    const warnings: AllocationWarning[] = []
    const govId = normalizeId(row.teams?.gov)
    const oppId = normalizeId(row.teams?.opp)
    const teamIds = [govId, oppId].filter((id) => id.length > 0)
    const adjudicatorIds = normalizeIdList([
      ...(row.chairs ?? []),
      ...(row.panels ?? []),
      ...(row.trainees ?? []),
    ])
    const venueId = normalizeId(row.venue)

    if (govId.length > 0 && input.isTeamAvailable(govId) === false) {
      warnings.push(
        createWarning(
          rowIndex,
          'team_unavailable',
          'critical',
          'team',
          createTargets(rowIndex, [govId]),
          { teamId: govId }
        )
      )
    }
    if (oppId.length > 0 && input.isTeamAvailable(oppId) === false) {
      warnings.push(
        createWarning(
          rowIndex,
          'team_unavailable',
          'critical',
          'team',
          createTargets(rowIndex, [oppId]),
          { teamId: oppId }
        )
      )
    }
    if (venueId.length > 0 && input.isVenueAvailable(venueId) === false) {
      warnings.push(
        createWarning(
          rowIndex,
          'venue_unavailable',
          'critical',
          'venue',
          createTargets(rowIndex, [], [], [venueId]),
          { venueId }
        )
      )
    }

    if (govId.length > 0 && checkSided(input.teamPastSides(govId), 'gov')) {
      warnings.push(
        createWarning(
          rowIndex,
          'team_side_imbalance',
          'info',
          'team',
          createTargets(rowIndex, [govId]),
          { teamId: govId, side: 'gov' }
        )
      )
    }
    if (oppId.length > 0 && checkSided(input.teamPastSides(oppId), 'opp')) {
      warnings.push(
        createWarning(
          rowIndex,
          'team_side_imbalance',
          'info',
          'team',
          createTargets(rowIndex, [oppId]),
          { teamId: oppId, side: 'opp' }
        )
      )
    }

    if (govId.length > 0 && oppId.length > 0) {
      const govInstitutionIds = input.teamInstitutions(govId)
      const oppInstitutionIds = input.teamInstitutions(oppId)
      const sameTeamConflictCategories = overlapConflictCategories(
        govInstitutionIds,
        oppInstitutionIds,
        input.institutionCategory
      )
      sameTeamConflictCategories.forEach((conflictCategory) => {
        warnings.push(
          createWarning(
            rowIndex,
            'team_same_institution',
            'warn',
            'team',
            createTargets(rowIndex, [govId, oppId]),
            {
              teamAId: govId,
              teamBId: oppId,
              groupCategory: conflictCategory,
            }
          )
        )
      })
      const winGov = input.teamWin(govId)
      const winOpp = input.teamWin(oppId)
      if (Number.isFinite(winGov) && Number.isFinite(winOpp) && winGov !== winOpp) {
        warnings.push(
          createWarning(
            rowIndex,
            'team_different_win',
            'info',
            'team',
            createTargets(rowIndex, [govId, oppId]),
            { teamAId: govId, teamBId: oppId }
          )
        )
      }
      const pastGov = input.teamPastOpponents(govId)
      const pastOpp = input.teamPastOpponents(oppId)
      if (pastGov.includes(oppId) || pastOpp.includes(govId)) {
        warnings.push(
          createWarning(
            rowIndex,
            'team_past_match',
            'warn',
            'team',
            createTargets(rowIndex, [govId, oppId]),
            { teamAId: govId, teamBId: oppId }
          )
        )
      }
      const pastSameInstitutionCategories = new Set<ConflictGroupCategory>()
      pastGov
        .filter((pastTeamId) => pastTeamId !== oppId)
        .forEach((pastTeamId) => {
          overlapConflictCategories(
            input.teamInstitutions(pastTeamId),
            oppInstitutionIds,
            input.institutionCategory
          ).forEach((category) => pastSameInstitutionCategories.add(category))
        })
      pastOpp
        .filter((pastTeamId) => pastTeamId !== govId)
        .forEach((pastTeamId) => {
          overlapConflictCategories(
            input.teamInstitutions(pastTeamId),
            govInstitutionIds,
            input.institutionCategory
          ).forEach((category) => pastSameInstitutionCategories.add(category))
        })
      const sortedPastSameInstitutionCategories = conflictCategoryOrder.filter((category) =>
        pastSameInstitutionCategories.has(category)
      )
      sortedPastSameInstitutionCategories.forEach((conflictCategory) => {
        warnings.push(
          createWarning(
            rowIndex,
            'team_past_match_same_institution',
            'warn',
            'team',
            createTargets(rowIndex, [govId, oppId]),
            {
              teamAId: govId,
              teamBId: oppId,
              groupCategory: conflictCategory,
            }
          )
        )
      })
    }

    for (const adjudicatorId of adjudicatorIds) {
      if (input.isAdjudicatorAvailable(adjudicatorId) === false) {
        warnings.push(
          createWarning(
            rowIndex,
            'adjudicator_unavailable',
            'critical',
            'adjudicator',
            createTargets(rowIndex, [], [adjudicatorId]),
            { adjudicatorId }
          )
        )
      }
    }

    for (const teamId of teamIds) {
      const teamInstitutionIds = input.teamInstitutions(teamId)
      for (const adjudicatorId of adjudicatorIds) {
        const adjudicatorInstitutionIds = input.adjudicatorInstitutions(adjudicatorId)
        const conflictCategories = overlapConflictCategories(
          teamInstitutionIds,
          adjudicatorInstitutionIds,
          input.institutionCategory
        )
        const conflictCategory = conflictCategories[0]
        if (conflictCategory) {
          warnings.push(
            createWarning(
              rowIndex,
              'adjudicator_institution_conflict',
              'warn',
              'adjudicator',
              createTargets(rowIndex, [teamId], [adjudicatorId]),
              {
                adjudicatorId,
                teamId,
                groupCategory: conflictCategory,
              }
            )
          )
        }
        if (input.adjudicatorConflicts(adjudicatorId).includes(teamId)) {
          warnings.push(
            createWarning(
              rowIndex,
              'adjudicator_personal_conflict',
              'warn',
              'adjudicator',
              createTargets(rowIndex, [teamId], [adjudicatorId]),
              { adjudicatorId, teamId }
            )
          )
        }
        if (input.adjudicatorJudgedTeams(adjudicatorId).includes(teamId)) {
          warnings.push(
            createWarning(
              rowIndex,
              'adjudicator_already_judged',
              'warn',
              'adjudicator',
              createTargets(rowIndex, [teamId], [adjudicatorId]),
              { adjudicatorId, teamId }
            )
          )
        }
      }
    }

    for (let index = 0; index < adjudicatorIds.length; index += 1) {
      for (let nested = index + 1; nested < adjudicatorIds.length; nested += 1) {
        const adjudicatorA = adjudicatorIds[index]
        const adjudicatorB = adjudicatorIds[nested]
        const conflictCategories = overlapConflictCategories(
          input.adjudicatorInstitutions(adjudicatorA),
          input.adjudicatorInstitutions(adjudicatorB),
          input.institutionCategory
        )
        const conflictCategory = conflictCategories[0]
        if (conflictCategory) {
          warnings.push(
            createWarning(
              rowIndex,
              'adjudicator_same_institution',
              'warn',
              'adjudicator',
              createTargets(rowIndex, [], [adjudicatorA, adjudicatorB]),
              {
                adjudicatorAId: adjudicatorA,
                adjudicatorBId: adjudicatorB,
                groupCategory: conflictCategory,
              }
            )
          )
        }
      }
    }

    if (adjudicatorIds.length === 0) {
      warnings.push(
        createWarning(
          rowIndex,
          'adjudicator_none',
          'critical',
          'adjudicator',
          createTargets(rowIndex),
          {}
        )
      )
    } else if (adjudicatorIds.length % 2 === 0) {
      warnings.push(
        createWarning(
          rowIndex,
          'adjudicator_even_count',
          'warn',
          'adjudicator',
          createTargets(rowIndex, [], adjudicatorIds),
          {}
        )
      )
    }

    return {
      rowIndex,
      warnings,
      counts: warningSeverityCounts(warnings),
    }
  })
}

export function warningEntityKey(kind: 'team' | 'adj' | 'venue', id: string) {
  return `${kind}:${id}`
}

export function warningTargetEntityKeys(warning: AllocationWarning): string[] {
  const keys: string[] = []
  warning.targets.teamIds.forEach((teamId) => keys.push(warningEntityKey('team', teamId)))
  warning.targets.adjudicatorIds.forEach((adjudicatorId) =>
    keys.push(warningEntityKey('adj', adjudicatorId))
  )
  warning.targets.venueIds.forEach((venueId) => keys.push(warningEntityKey('venue', venueId)))
  return Array.from(new Set(keys))
}

export function buildEntityWarningIndex(rowStates: RowWarningState[]) {
  const index = new Map<string, EntityWarningIndexEntry>()
  rowStates.forEach((rowState) => {
    rowState.warnings.forEach((warning) => {
      warningTargetEntityKeys(warning).forEach((key) => {
        const current = index.get(key)
        if (!current) {
          index.set(key, {
            maxSeverity: warning.severity,
            warningCount: 1,
            rowIndexes: [rowState.rowIndex],
          })
          return
        }
        current.warningCount += 1
        if (!current.rowIndexes.includes(rowState.rowIndex)) {
          current.rowIndexes.push(rowState.rowIndex)
          current.rowIndexes.sort((left, right) => left - right)
        }
        if (severityWeight[warning.severity] > severityWeight[current.maxSeverity]) {
          current.maxSeverity = warning.severity
        }
      })
    })
  })
  return index
}

export function buildFocusedEntitySet(warning: AllocationWarning | null) {
  return warning ? new Set(warningTargetEntityKeys(warning)) : new Set<string>()
}
