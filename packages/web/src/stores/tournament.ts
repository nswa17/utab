import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Tournament } from '@/types/tournament'
import { useAuthStore } from '@/stores/auth'

export const useTournamentStore = defineStore('tournament', () => {
  const tournaments = ref<Tournament[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchTournaments() {
    loading.value = true
    error.value = null
    try {
      const res = await api.get('/tournaments')
      tournaments.value = res.data?.data ?? []
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load tournaments'
    } finally {
      loading.value = false
    }
  }

  async function createTournament(payload: {
    name: string
    style: number
    options?: Record<string, unknown>
    total_round_num?: number
    current_round_num?: number
    preev_weights?: number[]
    auth?: Record<string, any>
    user_defined_data?: Record<string, any>
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/tournaments', payload)
      const created = res.data?.data
      if (created) {
        tournaments.value = [created, ...tournaments.value]
        // Keep organizer membership in sync so the new tournament appears immediately
        const auth = useAuthStore()
        const hasAccess = auth.tournaments.includes(created._id)
        if (!hasAccess) {
          auth.tournaments = [...auth.tournaments, created._id]
        }
      }
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create tournament'
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateTournament(payload: { tournamentId: string } & Record<string, any>) {
    loading.value = true
    error.value = null
    try {
      const res = await api.patch(`/tournaments/${payload.tournamentId}`, payload)
      const updated = res.data?.data
      if (updated) {
        tournaments.value = tournaments.value.map((item) =>
          item._id === updated._id ? updated : item
        )
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update tournament'
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteTournament(tournamentId: string) {
    loading.value = true
    error.value = null
    try {
      await api.delete(`/tournaments/${tournamentId}`)
      tournaments.value = tournaments.value.filter((item) => item._id !== tournamentId)
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete tournament'
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    tournaments,
    loading,
    error,
    fetchTournaments,
    createTournament,
    updateTournament,
    deleteTournament,
  }
})
