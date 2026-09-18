import { ref } from 'vue'

export function createTournamentStoreScope() {
  const activeTournamentId = ref<string | null>(null)

  function activate(tournamentId: string) {
    const normalized = String(tournamentId)
    const changed =
      activeTournamentId.value !== null && activeTournamentId.value !== normalized
    activeTournamentId.value = normalized
    return changed
  }

  function isActive(tournamentId: string) {
    const normalized = String(tournamentId)
    return activeTournamentId.value === null || activeTournamentId.value === normalized
  }

  function clear() {
    activeTournamentId.value = ''
  }

  return {
    activeTournamentId,
    activate,
    isActive,
    clear,
  }
}
