import { count, countCommon } from '../../general/math.js'
import { findOne } from '../sys.js'
import { accessDetail } from '../../general/tools.js'
import {
  buildInstitutionPriorityHistogram,
  compareInstitutionPriorityHistograms,
  normalizeInstitutionPriorityMap,
} from '../common/institution-priority.js'
import type { AllocationConfig } from '../../types/allocations.js'
import type { CompiledTeamResult } from '../../types/results.js'
import type { TeamEntity } from '../../types/domain.js'

type TeamFilterEntity = Pick<TeamEntity, 'id' | 'details'>

interface TeamFilterContext {
  compiled_team_results: CompiledTeamResult[]
  r: number
  config?: AllocationConfig
}

export function filterByRandom(
  _team: { id: number },
  a: { id: number },
  b: { id: number },
  { r }: Pick<TeamFilterContext, 'r'>
): number {
  const value = (entity: { id: number }) => entity.id % (r + 2760)
  return value(a) > value(b) ? 1 : -1
}

export function filterBySide(
  team: TeamFilterEntity,
  a: TeamFilterEntity,
  b: TeamFilterEntity,
  { compiled_team_results, r }: TeamFilterContext
): number {
  const getResult = (id: number) => findOne(compiled_team_results, id)
  const teamAPastSides = getResult(a.id).past_sides ?? []
  const teamBPastSides = getResult(b.id).past_sides ?? []
  const teamPastSides = getResult(team.id).past_sides ?? []
  const aSide = count(teamAPastSides, 'gov') - count(teamAPastSides, 'opp')
  const bSide = count(teamBPastSides, 'gov') - count(teamBPastSides, 'opp')
  const tSide = count(teamPastSides, 'gov') - count(teamPastSides, 'opp')
  const aFit = aSide * tSide < 0
  const bFit = bSide * tSide < 0
  if (aFit && !bFit) return -1
  if (bFit && !aFit) return 1
  return 0
}

export function filterByStrength(
  team: TeamFilterEntity,
  a: TeamFilterEntity,
  b: TeamFilterEntity,
  { compiled_team_results }: Pick<TeamFilterContext, 'compiled_team_results'>
): number {
  const getResult = (id: number) => findOne(compiled_team_results, id)
  const aWin = getResult(a.id).win
  const bWin = getResult(b.id).win
  const teamWin = getResult(team.id).win
  const aWinDiff = Math.abs(teamWin - aWin)
  const bWinDiff = Math.abs(teamWin - bWin)
  if (aWinDiff > bWinDiff) return 1
  if (aWinDiff < bWinDiff) return -1
  const aSum = Number(getResult(a.id).sum ?? 0)
  const bSum = Number(getResult(b.id).sum ?? 0)
  const teamSum = Number(getResult(team.id).sum ?? 0)
  const aSumDiff = Math.abs(teamSum - aSum)
  const bSumDiff = Math.abs(teamSum - bSum)
  if (aSumDiff > bSumDiff) return 1
  if (aSumDiff < bSumDiff) return -1
  return 0
}

export function filterByInstitution(
  team: TeamFilterEntity,
  a: TeamFilterEntity,
  b: TeamFilterEntity,
  { r, config }: Pick<TeamFilterContext, 'r' | 'config'>
): number {
  const aInstitutions = accessDetail(a, r).institutions as number[]
  const bInstitutions = accessDetail(b, r).institutions as number[]
  const teamInstitutions = accessDetail(team, r).institutions as number[]
  const priorityMap = normalizeInstitutionPriorityMap(config?.institution_priority_map)
  if (Object.keys(priorityMap).length > 0) {
    const aHistogram = buildInstitutionPriorityHistogram(
      aInstitutions || [],
      teamInstitutions || [],
      priorityMap
    )
    const bHistogram = buildInstitutionPriorityHistogram(
      bInstitutions || [],
      teamInstitutions || [],
      priorityMap
    )
    return compareInstitutionPriorityHistograms(aHistogram, bHistogram)
  }
  const aConflicts = countCommon(aInstitutions || [], teamInstitutions || [])
  const bConflicts = countCommon(bInstitutions || [], teamInstitutions || [])
  if (aConflicts < bConflicts) return -1
  if (aConflicts > bConflicts) return 1
  return 0
}

export function filterByPastOpponent(
  team: TeamFilterEntity,
  a: TeamFilterEntity,
  b: TeamFilterEntity,
  { compiled_team_results }: Pick<TeamFilterContext, 'compiled_team_results'>
): number {
  const getResult = (id: number) => findOne(compiled_team_results, id)
  const aPast = count(getResult(a.id).past_opponents ?? [], team.id)
  const bPast = count(getResult(b.id).past_opponents ?? [], team.id)
  if (aPast > bPast) return 1
  if (aPast < bPast) return -1
  return 0
}

export default {
  filterByRandom,
  filterBySide,
  filterByInstitution,
  filterByPastOpponent,
  filterByStrength,
}
