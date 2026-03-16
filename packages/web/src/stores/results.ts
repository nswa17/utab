import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Result } from '@/types/result'

export const useResultsStore = defineStore('results', () => {
  const results = ref<Result[]>([])
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

  async function fetchResults(tournamentId: string) {
    const sequence = advanceFetchSequence()
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/results', { params: { tournamentId } })
      if (sequence !== latestFetchSequence.value) {
        return
      }
      results.value = res.data?.data ?? []
    } catch (err: any) {
      if (sequence !== latestFetchSequence.value) {
        return
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load results'
    } finally {
      endRequest()
    }
  }

  async function createResult(payload: {
    tournamentId: string
    round: number
    payload: Record<string, unknown>
  }) {
    beginRequest()
    error.value = null
    try {
      const res = await api.post('/results', payload)
      const created = res.data?.data
      if (created) {
        advanceFetchSequence()
        results.value = [created, ...results.value]
      }
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create result'
      return null
    } finally {
      endRequest()
    }
  }

  async function updateResult(payload: {
    tournamentId: string
    resultId: string
    round?: number
    payload?: Record<string, unknown>
  }) {
    beginRequest()
    error.value = null
    try {
      const res = await api.patch(`/results/${payload.resultId}`, {
        tournamentId: payload.tournamentId,
        round: payload.round,
        payload: payload.payload,
      })
      const updated = res.data?.data
      if (updated) {
        advanceFetchSequence()
        results.value = results.value.map((item) => (item._id === updated._id ? updated : item))
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update result'
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteResult(tournamentId: string, resultId: string) {
    beginRequest()
    error.value = null
    try {
      await api.delete(`/results/${resultId}`, { params: { tournamentId } })
      advanceFetchSequence()
      results.value = results.value.filter((item) => item._id !== resultId)
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete result'
      return false
    } finally {
      endRequest()
    }
  }

  return { results, loading, error, fetchResults, createResult, updateResult, deleteResult }
})
