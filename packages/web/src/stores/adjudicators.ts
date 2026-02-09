import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Adjudicator } from '@/types/adjudicator'

export const useAdjudicatorsStore = defineStore('adjudicators', () => {
  const adjudicators = ref<Adjudicator[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAdjudicators(tournamentId: string) {
    loading.value = true
    error.value = null
    try {
      const res = await api.get('/adjudicators', { params: { tournamentId } })
      adjudicators.value = res.data?.data ?? []
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load adjudicators'
    } finally {
      loading.value = false
    }
  }

  async function createAdjudicator(payload: {
    tournamentId: string
    name: string
    strength: number
    active?: boolean
    preev?: number
    details?: any[]
    userDefinedData?: Record<string, any>
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/adjudicators', payload)
      const created = res.data?.data
      if (created) {
        adjudicators.value = [created, ...adjudicators.value]
      }
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create adjudicator'
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateAdjudicator(payload: {
    tournamentId: string
    adjudicatorId: string
    name?: string
    strength?: number
    active?: boolean
    preev?: number
    details?: any[]
    userDefinedData?: Record<string, any>
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.patch(`/adjudicators/${payload.adjudicatorId}`, {
        tournamentId: payload.tournamentId,
        name: payload.name,
        strength: payload.strength,
        active: payload.active,
        preev: payload.preev,
        details: payload.details,
        userDefinedData: payload.userDefinedData,
      })
      const updated = res.data?.data
      if (updated) {
        adjudicators.value = adjudicators.value.map((item) =>
          item._id === updated._id ? updated : item
        )
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update adjudicator'
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteAdjudicator(tournamentId: string, adjudicatorId: string) {
    loading.value = true
    error.value = null
    try {
      await api.delete(`/adjudicators/${adjudicatorId}`, { params: { tournamentId } })
      adjudicators.value = adjudicators.value.filter((item) => item._id !== adjudicatorId)
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete adjudicator'
      return false
    } finally {
      loading.value = false
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
  }
})
