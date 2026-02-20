import { compileIncludeLabels, type CompileIncludeLabel } from '@/types/compiled'

type RoundDetailLike = {
  round?: number
  userDefinedData?: Record<string, any> | null
}

function normalizeRounds(rounds: number[]): number[] {
  return Array.from(
    new Set(
      rounds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1)
    )
  ).sort((left, right) => left - right)
}

function mergeIncludeLabels(
  target: Set<CompileIncludeLabel>,
  userDefinedData?: Record<string, any> | null
) {
  target.add('teams')

  const noSpeakerScore = userDefinedData?.no_speaker_score === true
  if (!noSpeakerScore) {
    target.add('speakers')
    if (userDefinedData?.poi !== false) target.add('poi')
    if (userDefinedData?.best !== false) target.add('best')
  }

  const feedbackEnabled =
    userDefinedData?.evaluate_from_adjudicators !== false ||
    userDefinedData?.evaluate_from_teams !== false
  if (feedbackEnabled) {
    target.add('adjudicators')
  }
}

function toOrderedIncludeLabels(labels: Set<CompileIncludeLabel>): CompileIncludeLabel[] {
  const ordered = compileIncludeLabels.filter((label) => labels.has(label))
  return ordered.length > 0 ? ordered : ['teams']
}

export function includeLabelsFromRoundDetails(userDefinedData?: Record<string, any> | null): CompileIncludeLabel[] {
  const labels = new Set<CompileIncludeLabel>()
  mergeIncludeLabels(labels, userDefinedData)
  return toOrderedIncludeLabels(labels)
}

export function includeLabelsFromRoundDetailsAny(
  rounds: RoundDetailLike[],
  targetRounds: number[]
): CompileIncludeLabel[] {
  const normalizedTargets = normalizeRounds(targetRounds)
  const targetRoundSet = new Set<number>(normalizedTargets)
  const labels = new Set<CompileIncludeLabel>()

  rounds.forEach((round) => {
    const roundNumber = Number(round?.round)
    if (!Number.isInteger(roundNumber) || roundNumber < 1) return
    if (targetRoundSet.size > 0 && !targetRoundSet.has(roundNumber)) return
    mergeIncludeLabels(labels, round?.userDefinedData ?? undefined)
  })

  if (labels.size === 0) {
    return includeLabelsFromRoundDetails(undefined)
  }
  return toOrderedIncludeLabels(labels)
}
