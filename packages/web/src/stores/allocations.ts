import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'

export const useAllocationsStore = defineStore('allocations', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function requestTeams(payload: Record<string, any>) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/allocations/teams', payload)
      return res.data?.data ?? null
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to allocate teams'
      return null
    } finally {
      loading.value = false
    }
  }

  async function requestAdjudicators(payload: Record<string, any>) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/allocations/adjudicators', payload)
      return res.data?.data ?? null
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to allocate adjudicators'
      return null
    } finally {
      loading.value = false
    }
  }

  async function requestVenues(payload: Record<string, any>) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/allocations/venues', payload)
      return res.data?.data ?? null
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to allocate venues'
      return null
    } finally {
      loading.value = false
    }
  }

  return { loading, error, requestTeams, requestAdjudicators, requestVenues }
})
