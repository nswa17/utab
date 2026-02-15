export type BreakCutoffTiePolicy = 'manual' | 'include_all' | 'strict'
export type BreakSeeding = 'high_low'
export type BreakParticipant = { teamId: string; seed: number }
export type BreakConfig = {
  enabled: boolean
  source_rounds: number[]
  size: number
  cutoff_tie_policy: BreakCutoffTiePolicy
  seeding: BreakSeeding
  participants: BreakParticipant[]
}

type NormalizeBreakOptions = {
  dedupeParticipants?: boolean
  defaultSize?: number
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function normalizeBreakSourceRounds(roundNumber: number, sourceRounds: unknown): number[] {
  if (!Array.isArray(sourceRounds)) return []
  return Array.from(
    new Set(
      sourceRounds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1 && value < roundNumber)
    )
  ).sort((left, right) => left - right)
}

export function normalizeBreakParticipants(
  participants: unknown,
  options: NormalizeBreakOptions = {}
): BreakParticipant[] {
  if (!Array.isArray(participants)) return []
  const dedupe = options.dedupeParticipants === true
  const teamIdSet = dedupe ? new Set<string>() : null
  const seedSet = dedupe ? new Set<number>() : null
  const normalized: BreakParticipant[] = []

  for (const raw of participants) {
    const teamId = String((raw as any)?.teamId ?? '').trim()
    const seed = Number((raw as any)?.seed)
    if (teamId.length === 0 || !Number.isInteger(seed) || seed < 1) continue
    if (teamIdSet?.has(teamId) || seedSet?.has(seed)) continue
    teamIdSet?.add(teamId)
    seedSet?.add(seed)
    normalized.push({ teamId, seed })
  }

  return normalized.sort((left, right) => left.seed - right.seed)
}

export function normalizeBreakConfig(
  roundNumber: number,
  input: unknown,
  options: NormalizeBreakOptions = {}
): BreakConfig {
  const source = asRecord(input)
  const enabled = source.enabled === true
  const sizeRaw = Number(source.size)
  const sizeDefault = Number.isInteger(options.defaultSize) ? Number(options.defaultSize) : 8
  const size = Number.isInteger(sizeRaw) && sizeRaw >= 1 ? sizeRaw : sizeDefault
  const cutoff_tie_policy: BreakCutoffTiePolicy =
    source.cutoff_tie_policy === 'include_all' || source.cutoff_tie_policy === 'strict'
      ? (source.cutoff_tie_policy as BreakCutoffTiePolicy)
      : 'manual'
  return {
    enabled,
    source_rounds: normalizeBreakSourceRounds(roundNumber, source.source_rounds),
    size,
    cutoff_tie_policy,
    seeding: 'high_low',
    participants: normalizeBreakParticipants(source.participants, options),
  }
}
