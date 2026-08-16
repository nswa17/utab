import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Adjudicator } from '@/types/adjudicator'

export const useAdjudicatorsStore = defineStore('adjudicators', () => {
  const adjudicators = ref<Adjudicator[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pendingRequests = ref(0)
  const latestFetchSequence = ref(0)

  function beginRequest() {
    pendingRequests.value += 1
    loading.value = true
  }

  function endRequest() {
    pendingRequests.value = Math.max(0, pendingRequests.value - 1)
    loading.value = pendingRequests.value > 0
  }

  function advanceFetchSequence() {
    latestFetchSequence.value += 1
    return latestFetchSequence.value
  }

  async function fetchAdjudicators(tournamentId: string) {
    const sequence = advanceFetchSequence()
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/adjudicators', { params: { tournamentId } })
      if (sequence !== latestFetchSequence.value) {
        return
      }
      adjudicators.value = res.data?.data ?? []
    } catch (err: any) {
      if (sequence !== latestFetchSequence.value) {
        return
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load adjudicators'
    } finally {
      endRequest()
    }
  }

  async function createAdjudicator(payload: {
    tournamentId: string
    name: string
    preev?: number
    template?: any
    details?: any[]
    userDefinedData?: Record<string, any>
  }) {
    beginRequest()
    error.value = null
    try {
      const res = await api.post('/adjudicators', payload)
      const created = res.data?.data
      if (created) {
        advanceFetchSequence()
        adjudicators.value = [created, ...adjudicators.value]
      }
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create adjudicator'
      return null
    } finally {
      endRequest()
    }
  }

  async function updateAdjudicator(payload: {
    tournamentId: string
    adjudicatorId: string
    name?: string
    preev?: number
    template?: any
    details?: any[]
    userDefinedData?: Record<string, any>
  }) {
    beginRequest()
    error.value = null
    try {
      const res = await api.patch(`/adjudicators/${payload.adjudicatorId}`, {
        tournamentId: payload.tournamentId,
        name: payload.name,
        preev: payload.preev,
        template: payload.template,
        details: payload.details,
        userDefinedData: payload.userDefinedData,
      })
      const updated = res.data?.data
      if (updated) {
        advanceFetchSequence()
        adjudicators.value = adjudicators.value.map((item) =>
          item._id === updated._id ? updated : item
        )
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update adjudicator'
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteAdjudicator(tournamentId: string, adjudicatorId: string) {
    beginRequest()
    error.value = null
    try {
      await api.delete(`/adjudicators/${adjudicatorId}`, { params: { tournamentId } })
      advanceFetchSequence()
      adjudicators.value = adjudicators.value.filter((item) => item._id !== adjudicatorId)
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete adjudicator'
      return false
    } finally {
      endRequest()
    }
  }

  async function bulkDeleteAdjudicators(tournamentId: string, ids: string[]) {
    const normalizedIds = Array.from(
      new Set(ids.map((id) => String(id ?? '').trim()).filter((id) => id.length > 0))
    )
    if (normalizedIds.length === 0) return 0

    beginRequest()
    error.value = null
    try {
      const res = await api.delete('/adjudicators', {
        params: { tournamentId, ids: normalizedIds.join(',') },
      })
      advanceFetchSequence()
      const deletedIds = new Set(normalizedIds)
      adjudicators.value = adjudicators.value.filter(
        (item) => !deletedIds.has(String(item._id ?? ''))
      )
      const deletedCount = Number(res.data?.data?.deletedCount)
      return Number.isFinite(deletedCount) ? deletedCount : normalizedIds.length
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete adjudicators'
      return null
    } finally {
      endRequest()
    }
  }

  return {
    adjudicators,
    loading,
    error,
    fetchAdjudicators,
    createAdjudicator,
    updateAdjudicator,
    deleteAdjudicator,
    bulkDeleteAdjudicators,
  }
})
