import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Result } from '@/types/result'

export const useResultsStore = defineStore('results', () => {
  const results = ref<Result[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchResults(tournamentId: string) {
    loading.value = true
    error.value = null
    try {
      const res = await api.get('/results', { params: { tournamentId } })
      results.value = res.data?.data ?? []
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load results'
    } finally {
      loading.value = false
    }
  }

  async function createResult(payload: {
    tournamentId: string
    round: number
    payload: Record<string, unknown>
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/results', payload)
      const created = res.data?.data
      if (created) {
        results.value = [created, ...results.value]
      }
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create result'
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateResult(payload: {
    tournamentId: string
    resultId: string
    round?: number
    payload?: Record<string, unknown>
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.patch(`/results/${payload.resultId}`, {
        tournamentId: payload.tournamentId,
        round: payload.round,
        payload: payload.payload,
      })
      const updated = res.data?.data
      if (updated) {
        results.value = results.value.map((item) => (item._id === updated._id ? updated : item))
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update result'
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteResult(tournamentId: string, resultId: string) {
    loading.value = true
    error.value = null
    try {
      await api.delete(`/results/${resultId}`, { params: { tournamentId } })
      results.value = results.value.filter((item) => item._id !== resultId)
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete result'
      return false
    } finally {
      loading.value = false
    }
  }

  return { results, loading, error, fetchResults, createResult, updateResult, deleteResult }
})
