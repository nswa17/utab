export type ScoreChangeRoundEntry = { r: number; name: string }

type BuildRoundsInput = {
  tournament?: any
  results: any[]
  roundLabel: (round: number) => string
  roundFilter?: number[]
}

type BuildSeriesInput = {
  results: any[]
  rounds: ScoreChangeRoundEntry[]
  scoreKey: string
  fallbackRoundName: string
  entryName: (result: any) => string
}

type ScoreChangeSeries = {
  name: string
  data: Array<number | null>
  type: 'line'
}

type ScoreChangeSeriesResult = {
  rounds: ScoreChangeRoundEntry[]
  series: ScoreChangeSeries[]
}

export function normalizeRoundNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim().length === 0) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim().length === 0) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function buildScoreChangeRounds(input: BuildRoundsInput): ScoreChangeRoundEntry[] {
  const roundFilterSet =
    Array.isArray(input.roundFilter) && input.roundFilter.length > 0
      ? new Set(
          input.roundFilter
            .map((round) => normalizeRoundNumber(round))
            .filter((round): round is number => round !== null)
        )
      : null
  const tournamentRounds = Array.isArray(input.tournament?.rounds) ? input.tournament.rounds : []
  if (tournamentRounds.length > 0) {
    const seen = new Set<number>()
    return tournamentRounds
      .map((round: any) => {
        const roundNumber = normalizeRoundNumber(round?.r ?? round?.round)
        if (roundNumber === null || seen.has(roundNumber)) return null
        if (roundFilterSet && !roundFilterSet.has(roundNumber)) return null
        seen.add(roundNumber)
        const roundName =
          typeof round?.name === 'string' && round.name.trim().length > 0
            ? round.name
            : input.roundLabel(roundNumber)
        return { r: roundNumber, name: roundName }
      })
      .filter((entry: ScoreChangeRoundEntry | null): entry is ScoreChangeRoundEntry => entry !== null)
  }

  const roundSet = new Set<number>()
  input.results.forEach((result) => {
    const details = Array.isArray(result?.details) ? result.details : []
    details.forEach((detail: any) => {
      const roundNumber = normalizeRoundNumber(detail?.r)
      if (roundNumber === null) return
      if (roundFilterSet && !roundFilterSet.has(roundNumber)) return
      roundSet.add(roundNumber)
    })
  })

  return Array.from(roundSet)
    .sort((left, right) => left - right)
    .map((round) => ({ r: round, name: input.roundLabel(round) }))
}

export function buildScoreChangeSeries(input: BuildSeriesInput): ScoreChangeSeriesResult {
  const hasExplicitRounds = input.rounds.length > 0
  const rounds = hasExplicitRounds ? input.rounds : [{ r: 1, name: input.fallbackRoundName }]

  const series = input.results.map((result) => {
    const details = Array.isArray(result?.details) ? result.details : []
    const data = rounds.map((round) => {
      const detail = details.find(
        (item: any) => normalizeRoundNumber(item?.r) === round.r
      )
      const detailValue = toFiniteNumber(detail?.[input.scoreKey])
      if (detailValue !== null) return detailValue
      if (!hasExplicitRounds) return toFiniteNumber(result?.[input.scoreKey])
      return null
    })
    return {
      name: input.entryName(result),
      data,
      type: 'line' as const,
    }
  })

  return { rounds, series }
}
