import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import { createTournamentStoreScope } from '@/utils/tournament-store-scope'
import type { Draw, DrawAllocationRow } from '@/types/draw'

export const useDrawsStore = defineStore('draws', () => {
  const draws = ref<Draw[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pendingRequests = ref(0)
  const fetchSequence = ref(0)
  const tournamentScope = createTournamentStoreScope()

  function beginRequest() {
    pendingRequests.value += 1
    loading.value = true
  }

  function endRequest() {
    pendingRequests.value = Math.max(0, pendingRequests.value - 1)
    loading.value = pendingRequests.value > 0
  }

  function advanceFetchSequence() {
    fetchSequence.value += 1
    return fetchSequence.value
  }

  async function fetchDraws(
    tournamentId: string,
    round?: number,
    options?: { forcePublic?: boolean }
  ) {
    tournamentScope.activate(tournamentId)
    const sequence = advanceFetchSequence()
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/draws', {
        params: {
          tournamentId,
          round,
          public: options?.forcePublic ? '1' : undefined,
        },
      })
      if (sequence !== fetchSequence.value) {
        return []
      }
      const fetched = Array.isArray(res.data?.data) ? res.data.data : []
      const normalizedRound = Number(round)
      const shouldMergeByRound = Number.isInteger(normalizedRound)
      if (!shouldMergeByRound) {
        draws.value = fetched
        return draws.value
      }
      const sameTournament = draws.value.filter(
        (item) => String(item.tournamentId) === String(tournamentId)
      )
      const mergedTournamentDraws = sameTournament
        .filter((item) => Number(item.round) !== normalizedRound)
        .concat(fetched)
      draws.value = mergedTournamentDraws
      return draws.value
    } catch (err: any) {
      if (sequence !== fetchSequence.value) {
        return []
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load draws'
      return []
    } finally {
      endRequest()
    }
  }

  async function upsertDraw(payload: {
    tournamentId: string
    round: number
    allocation: DrawAllocationRow[]
    userDefinedData?: Record<string, any>
    drawOpened?: boolean
    allocationOpened?: boolean
    locked?: boolean
  }) {
    beginRequest()
    error.value = null
    try {
      const res = await api.post('/draws', payload)
      const updated = res.data?.data
      if (updated && tournamentScope.isActive(payload.tournamentId)) {
        advanceFetchSequence()
        draws.value = draws.value.filter(
          (item) => String(item.tournamentId) === String(updated.tournamentId)
        )
        const index = draws.value.findIndex(
          (item) =>
            item._id === updated._id ||
            Number(item.round) === Number(updated.round)
        )
        if (index >= 0) {
          draws.value.splice(index, 1, updated)
        } else {
          draws.value.push(updated)
        }
      }
      return updated
    } catch (err: any) {
      if (tournamentScope.isActive(payload.tournamentId)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to save draw'
      }
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteDraw(drawId: string, tournamentId: string) {
    beginRequest()
    error.value = null
    try {
      const res = await api.delete(`/draws/${drawId}`, { params: { tournamentId } })
      const deleted = res.data?.data
      if (deleted?._id && tournamentScope.isActive(tournamentId)) {
        advanceFetchSequence()
        const index = draws.value.findIndex((item) => item._id === deleted._id)
        if (index >= 0) {
          draws.value.splice(index, 1)
        }
      }
      return deleted
    } catch (err: any) {
      if (tournamentScope.isActive(tournamentId)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete draw'
      }
      return null
    } finally {
      endRequest()
    }
  }

  return { draws, loading, error, fetchDraws, upsertDraw, deleteDraw }
})
