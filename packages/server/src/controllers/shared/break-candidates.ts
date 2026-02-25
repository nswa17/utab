import type { BreakCutoffTiePolicy } from './break-config.js'

export type BreakCandidate = {
  teamId: string
  teamName: string
  ranking: number | null
  win: number
  sum: number
  margin: number
}

export type BreakCandidatePreview = BreakCandidate & {
  available: boolean
  tieGroup: number
  isCutoffTie: boolean
}

export function buildBreakCandidatesFromCompiledPayload(
  payload: { compiled_team_results?: any[] },
  teamNameById: Map<string, string>
): BreakCandidate[] {
  return (Array.isArray(payload.compiled_team_results) ? payload.compiled_team_results : [])
    .map((result: any) => {
      const teamId = String(result?.id ?? '').trim()
      if (!teamId) return null
      if (!teamNameById.has(teamId)) return null
      const rankingRaw = Number(result?.ranking)
      return {
        teamId,
        teamName: teamNameById.get(teamId) ?? teamId,
        ranking: Number.isFinite(rankingRaw) ? rankingRaw : null,
        win: Number(result?.win ?? 0),
        sum: Number(result?.sum ?? 0),
        margin: Number(result?.margin ?? 0),
      }
    })
    .filter((candidate): candidate is BreakCandidate => candidate !== null)
    .sort((left, right) => {
      if (left.ranking !== null && right.ranking !== null && left.ranking !== right.ranking) {
        return left.ranking - right.ranking
      }
      if (left.win !== right.win) return right.win - left.win
      if (left.sum !== right.sum) return right.sum - left.sum
      if (left.margin !== right.margin) return right.margin - left.margin
      return left.teamName.localeCompare(right.teamName)
    })
}

export function pickBreakTeamIdsFromCandidates(
  candidates: BreakCandidate[],
  size: number,
  cutoffTiePolicy: BreakCutoffTiePolicy
): string[] {
  if (candidates.length === 0 || size <= 0) return []
  if (cutoffTiePolicy === 'manual' || cutoffTiePolicy === 'strict') {
    return candidates.slice(0, size).map((candidate) => candidate.teamId)
  }
  const cutoff = candidates[Math.min(size - 1, candidates.length - 1)]
  if (!cutoff) {
    return candidates.slice(0, size).map((candidate) => candidate.teamId)
  }
  const cutoffRanking = cutoff.ranking
  if (cutoffRanking === null) return candidates.slice(0, size).map((candidate) => candidate.teamId)
  return candidates
    .filter((candidate) => candidate.ranking !== null && candidate.ranking <= cutoffRanking)
    .map((candidate) => candidate.teamId)
}

export function annotateBreakCandidatesForPreview(
  candidates: BreakCandidate[],
  requestedSize: number | null,
  availabilityByTeamId: Map<string, boolean> = new Map()
): BreakCandidatePreview[] {
  const preview: BreakCandidatePreview[] = candidates.map((candidate) => ({
    ...candidate,
    available: availabilityByTeamId.get(candidate.teamId) !== false,
    tieGroup: 0,
    isCutoffTie: false,
  }))

  let tieGroup = 0
  let lastRanking: number | null = null
  preview.forEach((candidate, index) => {
    if (index === 0 || candidate.ranking !== lastRanking) tieGroup += 1
    candidate.tieGroup = tieGroup
    lastRanking = candidate.ranking
  })

  if (requestedSize !== null && requestedSize > 0 && preview.length >= requestedSize) {
    const cutoff = preview[requestedSize - 1]
    const cutoffRanking = cutoff?.ranking ?? null
    if (cutoffRanking !== null) {
      const betterCount = preview.filter(
        (candidate) => candidate.ranking !== null && candidate.ranking < cutoffRanking
      ).length
      const atCutoff = preview.filter((candidate) => candidate.ranking === cutoffRanking).length
      const isTieOverflow = betterCount < requestedSize && betterCount + atCutoff > requestedSize
      if (isTieOverflow) {
        preview.forEach((candidate) => {
          candidate.isCutoffTie = candidate.ranking === cutoffRanking
        })
      }
    }
  }

  return preview
}
