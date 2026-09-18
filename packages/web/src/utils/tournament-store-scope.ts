import { ref } from 'vue'

type TournamentFetchToken = {
  tournamentId: string
  generation: number
}

export function createTournamentStoreScope() {
  const activeTournamentId = ref<string | null>(null)
  const fetchGenerationByTournament = new Map<string, number>()

  function normalizeTournamentId(tournamentId: string) {
    return String(tournamentId)
  }

  function activate(tournamentId: string) {
    const normalized = normalizeTournamentId(tournamentId)
    const changed = activeTournamentId.value !== normalized
    activeTournamentId.value = normalized
    return changed
  }

  function claimIfEmpty(tournamentId: string) {
    if (activeTournamentId.value !== null) return false
    activeTournamentId.value = normalizeTournamentId(tournamentId)
    return true
  }

  function isActive(tournamentId: string) {
    const normalized = normalizeTournamentId(tournamentId)
    return activeTournamentId.value === null || activeTournamentId.value === normalized
  }

  function advanceGeneration(tournamentId: string) {
    const normalized = normalizeTournamentId(tournamentId)
    const next = (fetchGenerationByTournament.get(normalized) ?? 0) + 1
    fetchGenerationByTournament.set(normalized, next)
    return next
  }

  function beginFetch(tournamentId: string): {
    scopeChanged: boolean
    token: TournamentFetchToken
  } {
    const normalized = normalizeTournamentId(tournamentId)
    const scopeChanged = activate(normalized)
    const generation = advanceGeneration(normalized)
    return {
      scopeChanged,
      token: { tournamentId: normalized, generation },
    }
  }

  function invalidateFetches(tournamentId: string) {
    advanceGeneration(tournamentId)
  }

  function isFetchCurrent(token: TournamentFetchToken) {
    return (
      isActive(token.tournamentId) &&
      fetchGenerationByTournament.get(token.tournamentId) === token.generation
    )
  }

  function clear() {
    activeTournamentId.value = null
  }

  return {
    activeTournamentId,
    activate,
    claimIfEmpty,
    isActive,
    beginFetch,
    invalidateFetches,
    isFetchCurrent,
    clear,
  }
}
