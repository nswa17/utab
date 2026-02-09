import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Round } from '@/types/round'

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

  return { rounds, loading, error, fetchRounds, createRound, updateRound, deleteRound }
})
