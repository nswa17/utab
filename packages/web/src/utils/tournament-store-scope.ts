import { ref } from 'vue'

export function createTournamentStoreScope() {
  const activeTournamentId = ref<string | null>(null)

  function activate(tournamentId: string) {
    const normalized = String(tournamentId)
    const changed = activeTournamentId.value !== normalized
    activeTournamentId.value = normalized
    return changed
  }

  function isActive(tournamentId: string) {
    return activeTournamentId.value === String(tournamentId)
  }

  function clear() {
    activeTournamentId.value = null
  }

  return {
    activeTournamentId,
    activate,
    isActive,
    clear,
  }
}
