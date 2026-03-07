import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Venue } from '@/types/venue'

export const useVenuesStore = defineStore('venues', () => {
  const venues = ref<Venue[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchVenues(tournamentId: string) {
    loading.value = true
    error.value = null
    try {
      const res = await api.get('/venues', { params: { tournamentId } })
      venues.value = res.data?.data ?? []
      return venues.value
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load venues'
      return []
    } finally {
      loading.value = false
    }
  }

  async function createVenue(payload: {
    tournamentId: string
    name: string
    template?: any
    details?: any[]
    userDefinedData?: Record<string, any>
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/venues', payload)
      const created = res.data?.data
      if (created) {
        venues.value = [created, ...venues.value]
      }
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create venue'
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateVenue(payload: {
    tournamentId: string
    venueId: string
    name?: string
    template?: any
    details?: any[]
    userDefinedData?: Record<string, any>
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.patch(`/venues/${payload.venueId}`, {
        tournamentId: payload.tournamentId,
        name: payload.name,
        template: payload.template,
        details: payload.details,
        userDefinedData: payload.userDefinedData,
      })
      const updated = res.data?.data
      if (updated) {
        venues.value = venues.value.map((item) => (item._id === updated._id ? updated : item))
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update venue'
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteVenue(tournamentId: string, venueId: string) {
    loading.value = true
    error.value = null
    try {
      await api.delete(`/venues/${venueId}`, { params: { tournamentId } })
      venues.value = venues.value.filter((item) => item._id !== venueId)
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete venue'
      return false
    } finally {
      loading.value = false
    }
  }

  async function bulkDeleteVenues(tournamentId: string, ids: string[]) {
    const normalizedIds = Array.from(
      new Set(ids.map((id) => String(id ?? '').trim()).filter((id) => id.length > 0))
    )
    if (normalizedIds.length === 0) return 0

    loading.value = true
    error.value = null
    try {
      const res = await api.delete('/venues', {
        params: { tournamentId, ids: normalizedIds.join(',') },
      })
      const deletedIds = new Set(normalizedIds)
      venues.value = venues.value.filter((item) => !deletedIds.has(String(item._id ?? '')))
      const deletedCount = Number(res.data?.data?.deletedCount)
      return Number.isFinite(deletedCount) ? deletedCount : normalizedIds.length
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete venues'
      return null
    } finally {
      loading.value = false
    }
  }

  return {
    venues,
    loading,
    error,
    fetchVenues,
    createVenue,
    updateVenue,
    deleteVenue,
    bulkDeleteVenues,
  }
})
