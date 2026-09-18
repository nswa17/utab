import { ref } from 'vue'

export function createTournamentStoreScope() {
  const activeTournamentId = ref<string | null>(null)

  function activate(tournamentId: string) {
    activeTournamentId.value = String(tournamentId)
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
