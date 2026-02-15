export type IdMaps = {
  map: Map<string, number>
  reverse: Map<number, string>
}

type RoundDetail = { r: number; [key: string]: unknown }

export function buildIdMaps(docs: Array<{ _id: unknown }>): IdMaps {
  const map = new Map<string, number>()
  const reverse = new Map<number, string>()
  docs.forEach((doc, idx) => {
    const id = String(doc._id)
    const num = idx + 1
    map.set(id, num)
    reverse.set(num, id)
  })
  return { map, reverse }
}

export function normalizeScoreWeights(scoreWeights: unknown): number[] {
  if (Array.isArray(scoreWeights)) {
    if (scoreWeights.every((v) => typeof v === 'number')) return scoreWeights
    if (
      scoreWeights.every(
        (v) =>
          v &&
          typeof v === 'object' &&
          !Array.isArray(v) &&
          'value' in (v as Record<string, unknown>)
      )
    ) {
      return scoreWeights.map((v) => Number((v as { value: unknown }).value))
    }
  }
  return [1]
}

export function normalizeInstitutionPriority(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 1
  return parsed
}

function normalizeAdjudicatorCount(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}

function adjudicatorsRequiredPerSquare(numbers: {
  chairs?: unknown
  panels?: unknown
  trainees?: unknown
}): number {
  return (
    normalizeAdjudicatorCount(numbers.chairs) +
    normalizeAdjudicatorCount(numbers.panels) +
    normalizeAdjudicatorCount(numbers.trainees)
  )
}

export function hasSufficientAdjudicators(
  availableCount: number,
  allocationSquares: number,
  numbers: { chairs?: unknown; panels?: unknown; trainees?: unknown }
): boolean {
  if (allocationSquares <= 0) return false
  const requiredPerSquare = adjudicatorsRequiredPerSquare(numbers)
  if (requiredPerSquare <= 0) return false
  return availableCount >= allocationSquares * requiredPerSquare
}

export function extractDrawUserDefinedData(draw: any): Record<string, unknown> | undefined {
  const candidate = draw?.userDefinedData ?? draw?.user_defined_data
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined
  return candidate as Record<string, unknown>
}

export function ensureRounds(round: number): number[] {
  if (round <= 1) return []
  return Array.from({ length: round - 1 }, (_, i) => i + 1)
}

export function buildDetailsForRounds(
  details: Array<{ r?: number; [key: string]: unknown }> | undefined,
  rounds: number[],
  defaults: Record<string, unknown>,
  mapInstitutions?: (id: string) => number | undefined,
  mapSpeakers?: (id: string) => number | undefined,
  mapConflicts?: (id: string) => number | undefined
): RoundDetail[] {
  return rounds.map((r): RoundDetail => {
    const existing = details?.find((d) => d.r === r) ?? {}
    const merged: RoundDetail = { r, ...defaults, ...existing }
    if (mapInstitutions && Array.isArray(merged.institutions)) {
      merged.institutions = merged.institutions
        .map((id: string) => mapInstitutions(id))
        .filter((v: number | undefined): v is number => v !== undefined)
    }
    if (mapSpeakers && Array.isArray(merged.speakers)) {
      merged.speakers = merged.speakers
        .map((id: string) => mapSpeakers(id))
        .filter((v: number | undefined): v is number => v !== undefined)
    }
    if (mapConflicts && Array.isArray(merged.conflicts)) {
      merged.conflicts = merged.conflicts
        .map((id: string) => mapConflicts(id))
        .filter((v: number | undefined): v is number => v !== undefined)
    }
    return merged
  })
}
