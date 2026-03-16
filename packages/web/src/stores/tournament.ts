import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Tournament } from '@/types/tournament'
import { useAuthStore } from '@/stores/auth'

export const useTournamentStore = defineStore('tournament', () => {
  const tournaments = ref<Tournament[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pendingRequests = ref(0)
  const listSequence = ref(0)

  function beginRequest() {
    pendingRequests.value += 1
    loading.value = true
  }

  function endRequest() {
    pendingRequests.value = Math.max(0, pendingRequests.value - 1)
    loading.value = pendingRequests.value > 0
  }

  function advanceListSequence() {
    listSequence.value += 1
    return listSequence.value
  }

  async function fetchTournaments() {
    const sequence = advanceListSequence()
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/tournaments')
      if (sequence !== listSequence.value) {
        return []
      }
      tournaments.value = res.data?.data ?? []
      return tournaments.value
    } catch (err: any) {
      if (sequence !== listSequence.value) {
        return []
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load tournaments'
      return []
    } finally {
      endRequest()
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
    beginRequest()
    error.value = null
    try {
      const res = await api.post('/tournaments', payload)
      const created = res.data?.data
      if (created) {
        advanceListSequence()
        tournaments.value = [created, ...tournaments.value]
        // Keep organizer membership in sync so the new tournament appears immediately
        const auth = useAuthStore()
        const hasAccess = auth.tournaments.includes(created._id)
        if (!hasAccess) {
          auth.tournaments = [...auth.tournaments, created._id]
        }
        const hasOrganizerAccess = auth.organizerTournaments.includes(created._id)
        if (!hasOrganizerAccess) {
          auth.organizerTournaments = [...auth.organizerTournaments, created._id]
        }
      }
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create tournament'
      return null
    } finally {
      endRequest()
    }
  }

  async function updateTournament(payload: { tournamentId: string } & Record<string, any>) {
    beginRequest()
    error.value = null
    try {
      const res = await api.patch(`/tournaments/${payload.tournamentId}`, payload)
      const updated = res.data?.data
      if (updated) {
        advanceListSequence()
        tournaments.value = tournaments.value.map((item) =>
          item._id === updated._id ? updated : item
        )
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update tournament'
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteTournament(tournamentId: string) {
    beginRequest()
    error.value = null
    try {
      await api.delete(`/tournaments/${tournamentId}`)
      advanceListSequence()
      tournaments.value = tournaments.value.filter((item) => item._id !== tournamentId)
      const auth = useAuthStore()
      auth.tournaments = auth.tournaments.filter((item) => item !== tournamentId)
      auth.organizerTournaments = auth.organizerTournaments.filter((item) => item !== tournamentId)
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete tournament'
      return false
    } finally {
      endRequest()
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
