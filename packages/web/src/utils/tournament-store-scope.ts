import { ref } from 'vue'

type TournamentScopeToken = {
  tournamentId: string
  activationGeneration: number
}

type TournamentFetchToken = TournamentScopeToken & {
  generation: number
}

export function createTournamentStoreScope() {
  const activeTournamentId = ref<string | null>(null)
  const activationGeneration = ref(0)
  const fetchGenerationByTournament = new Map<string, number>()

  function normalizeTournamentId(tournamentId: string) {
    return String(tournamentId)
  }

  function activate(tournamentId: string) {
    const normalized = normalizeTournamentId(tournamentId)
    const changed = activeTournamentId.value !== normalized
    if (changed) {
      activeTournamentId.value = normalized
      activationGeneration.value += 1
    }
    return changed
  }

  function claimIfEmpty(tournamentId: string) {
    if (activeTournamentId.value !== null) return false
    activeTournamentId.value = normalizeTournamentId(tournamentId)
    activationGeneration.value += 1
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

  function captureScope(tournamentId: string): TournamentScopeToken {
    return {
      tournamentId: normalizeTournamentId(tournamentId),
      activationGeneration: activationGeneration.value,
    }
  }

  function isScopeCurrent(token: TournamentScopeToken) {
    return (
      activeTournamentId.value === token.tournamentId &&
      activationGeneration.value === token.activationGeneration
    )
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
      token: {
        tournamentId: normalized,
        activationGeneration: activationGeneration.value,
        generation,
      },
    }
  }

  function invalidateFetches(tournamentId: string) {
    advanceGeneration(tournamentId)
  }

  function isFetchCurrent(token: TournamentFetchToken) {
    return (
      isScopeCurrent(token) &&
      fetchGenerationByTournament.get(token.tournamentId) === token.generation
    )
  }

  function clear() {
    if (activeTournamentId.value !== null) {
      activeTournamentId.value = null
      activationGeneration.value += 1
    }
  }

  return {
    activeTournamentId,
    activate,
    claimIfEmpty,
    isActive,
    captureScope,
    isScopeCurrent,
    beginFetch,
    invalidateFetches,
    isFetchCurrent,
    clear,
  }
}
