import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Round, RoundBreakConfig } from '@/types/round'

type BreakCandidate = {
  teamId: string
  teamName: string
  ranking: number | null
  win: number
  sum: number
  margin: number
  available: boolean
  tieGroup: number
  isCutoffTie: boolean
}

type BreakCandidatesResponse = {
  roundId: string
  round: number
  source: 'submissions' | 'raw'
  sourceRounds: number[]
  size: number | null
  candidates: BreakCandidate[]
}

export const useRoundsStore = defineStore('rounds', () => {
  const rounds = ref<Round[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchRounds(tournamentId: string, options?: { forcePublic?: boolean }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.get('/rounds', {
        params: {
          tournamentId,
          public: options?.forcePublic ? '1' : undefined,
        },
      })
      rounds.value = res.data?.data ?? []
      return rounds.value
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load rounds'
      return []
    } finally {
      loading.value = false
    }
  }

  async function createRound(payload: {
    tournamentId: string
    round: number
    name?: string
    motions?: string[]
    motionOpened?: boolean
    teamAllocationOpened?: boolean
    adjudicatorAllocationOpened?: boolean
    weightsOfAdjudicators?: { chair: number; panel: number; trainee: number }
    userDefinedData?: Record<string, any>
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/rounds', payload)
      const created = res.data?.data
      if (created) {
        rounds.value = [...rounds.value, created].sort((a, b) => a.round - b.round)
      }
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create round'
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateRound(payload: {
    tournamentId: string
    roundId: string
    round?: number
    name?: string
    motions?: string[]
    motionOpened?: boolean
    teamAllocationOpened?: boolean
    adjudicatorAllocationOpened?: boolean
    weightsOfAdjudicators?: { chair: number; panel: number; trainee: number }
    userDefinedData?: Record<string, any>
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.patch(`/rounds/${payload.roundId}`, payload)
      const updated = res.data?.data
      if (updated) {
        rounds.value = rounds.value.map((item) => (item._id === updated._id ? updated : item))
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update round'
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteRound(tournamentId: string, roundId: string) {
    loading.value = true
    error.value = null
    try {
      await api.delete(`/rounds/${roundId}`, { params: { tournamentId } })
      rounds.value = rounds.value.filter((item) => item._id !== roundId)
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete round'
      return false
    } finally {
      loading.value = false
    }
  }

  async function fetchBreakCandidates(payload: {
    tournamentId: string
    roundId: string
    source?: 'submissions' | 'raw'
    sourceRounds?: number[]
    size?: number
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post(`/rounds/${payload.roundId}/break/candidates`, {
        tournamentId: payload.tournamentId,
        source: payload.source,
        sourceRounds: payload.sourceRounds,
        size: payload.size,
      })
      return (res.data?.data ?? null) as BreakCandidatesResponse | null
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load break candidates'
      return null
    } finally {
      loading.value = false
    }
  }

  async function saveBreakRound(payload: {
    tournamentId: string
    roundId: string
    breakConfig: RoundBreakConfig
    syncTeamAvailability?: boolean
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.patch(`/rounds/${payload.roundId}/break`, {
        tournamentId: payload.tournamentId,
        break: payload.breakConfig,
        syncTeamAvailability: payload.syncTeamAvailability ?? true,
      })
      const updatedRound = res.data?.data?.round as Round | undefined
      if (updatedRound?._id) {
        rounds.value = rounds.value.map((item) => (item._id === updatedRound._id ? updatedRound : item))
      }
      return res.data?.data ?? null
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to save break settings'
      return null
    } finally {
      loading.value = false
    }
  }

  return {
    rounds,
    loading,
    error,
    fetchRounds,
    createRound,
    updateRound,
    deleteRound,
    fetchBreakCandidates,
    saveBreakRound,
  }
})
