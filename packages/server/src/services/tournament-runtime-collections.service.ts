export const TOURNAMENT_RUNTIME_COLLECTIONS = new Set([
  'entity_namespace_locks',
  'round_namespace_locks',
])

export function isTournamentRuntimeCollection(name: string): boolean {
  return TOURNAMENT_RUNTIME_COLLECTIONS.has(String(name ?? '').trim())
}
