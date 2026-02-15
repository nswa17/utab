import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Draw, DrawAllocationRow } from '@/types/draw'

export const useDrawsStore = defineStore('draws', () => {
  const draws = ref<Draw[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchDraws(
    tournamentId: string,
    round?: number,
    options?: { forcePublic?: boolean }
  ) {
    loading.value = true
    error.value = null
    try {
      const res = await api.get('/draws', {
        params: {
          tournamentId,
          round,
          public: options?.forcePublic ? '1' : undefined,
        },
      })
      draws.value = res.data?.data ?? []
      return draws.value
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load draws'
      return []
    } finally {
      loading.value = false
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
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/draws', payload)
      const updated = res.data?.data
      if (updated) {
        const index = draws.value.findIndex(
          (item) => item._id === updated._id || item.round === updated.round
        )
        if (index >= 0) {
          draws.value.splice(index, 1, updated)
        } else {
          draws.value.push(updated)
        }
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to save draw'
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteDraw(drawId: string, tournamentId: string) {
    loading.value = true
    error.value = null
    try {
      const res = await api.delete(`/draws/${drawId}`, { params: { tournamentId } })
      const deleted = res.data?.data
      if (deleted?._id) {
        const index = draws.value.findIndex((item) => item._id === deleted._id)
        if (index >= 0) {
          draws.value.splice(index, 1)
        }
      }
      return deleted
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete draw'
      return null
    } finally {
      loading.value = false
    }
  }

  return { draws, loading, error, fetchDraws, upsertDraw, deleteDraw }
})
