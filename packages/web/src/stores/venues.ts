import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import { createTournamentStoreScope } from '@/utils/tournament-store-scope'
import type { Venue } from '@/types/venue'

export const useVenuesStore = defineStore('venues', () => {
  const venues = ref<Venue[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pendingRequests = ref(0)
  const tournamentScope = createTournamentStoreScope()

  function beginRequest() {
    pendingRequests.value += 1
    loading.value = true
  }

  function endRequest() {
    pendingRequests.value = Math.max(0, pendingRequests.value - 1)
    loading.value = pendingRequests.value > 0
  }

  async function fetchVenues(tournamentId: string) {
    const { scopeChanged, token } = tournamentScope.beginFetch(tournamentId)
    if (scopeChanged) venues.value = []
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/venues', { params: { tournamentId } })
      if (!tournamentScope.isFetchCurrent(token)) {
        return []
      }
      venues.value = res.data?.data ?? []
      return venues.value
    } catch (err: any) {
      if (!tournamentScope.isFetchCurrent(token)) {
        return []
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load venues'
      return []
    } finally {
      endRequest()
    }
  }

  async function createVenue(payload: {
    tournamentId: string
    name: string
    template?: any
    details?: any[]
    userDefinedData?: Record<string, any>
  }) {
    tournamentScope.claimIfEmpty(payload.tournamentId)
    beginRequest()
    if (tournamentScope.isActive(payload.tournamentId)) error.value = null
    try {
      const res = await api.post('/venues', payload)
      const created = res.data?.data
      if (created) {
        tournamentScope.invalidateFetches(payload.tournamentId)
        if (tournamentScope.isActive(payload.tournamentId)) {
          venues.value = [created, ...venues.value]
        }
      }
      return created
    } catch (err: any) {
      if (tournamentScope.isActive(payload.tournamentId)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create venue'
      }
      return null
    } finally {
      endRequest()
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
    tournamentScope.claimIfEmpty(payload.tournamentId)
    beginRequest()
    if (tournamentScope.isActive(payload.tournamentId)) error.value = null
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
        tournamentScope.invalidateFetches(payload.tournamentId)
        if (tournamentScope.isActive(payload.tournamentId)) {
          venues.value = venues.value.map((item) =>
            item._id === updated._id ? updated : item
          )
        }
      }
      return updated
    } catch (err: any) {
      if (tournamentScope.isActive(payload.tournamentId)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update venue'
      }
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteVenue(tournamentId: string, venueId: string) {
    tournamentScope.claimIfEmpty(tournamentId)
    beginRequest()
    if (tournamentScope.isActive(tournamentId)) error.value = null
    try {
      await api.delete(`/venues/${venueId}`, { params: { tournamentId } })
      tournamentScope.invalidateFetches(tournamentId)
      if (tournamentScope.isActive(tournamentId)) {
        venues.value = venues.value.filter((item) => item._id !== venueId)
      }
      return true
    } catch (err: any) {
      if (tournamentScope.isActive(tournamentId)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete venue'
      }
      return false
    } finally {
      endRequest()
    }
  }

  async function bulkDeleteVenues(tournamentId: string, ids: string[]) {
    const normalizedIds = Array.from(
      new Set(ids.map((id) => String(id ?? '').trim()).filter((id) => id.length > 0))
    )
    if (normalizedIds.length === 0) return 0

    tournamentScope.claimIfEmpty(tournamentId)
    beginRequest()
    if (tournamentScope.isActive(tournamentId)) error.value = null
    try {
      const res = await api.delete('/venues', {
        params: { tournamentId, ids: normalizedIds.join(',') },
      })
      const deletedCount = Number(res.data?.data?.deletedCount)
      tournamentScope.invalidateFetches(tournamentId)
      if (tournamentScope.isActive(tournamentId)) {
        const deletedIds = new Set(normalizedIds)
        venues.value = venues.value.filter((item) => !deletedIds.has(String(item._id ?? '')))
      }
      return Number.isFinite(deletedCount) ? deletedCount : normalizedIds.length
    } catch (err: any) {
      if (tournamentScope.isActive(tournamentId)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete venues'
      }
      return null
    } finally {
      endRequest()
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
