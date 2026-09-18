import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import { createTournamentStoreScope } from '@/utils/tournament-store-scope'
import type { Institution } from '@/types/institution'

export const useInstitutionsStore = defineStore('institutions', () => {
  const institutions = ref<Institution[]>([])
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

  async function fetchInstitutions(tournamentId: string) {
    const { scopeChanged, token } = tournamentScope.beginFetch(tournamentId)
    if (scopeChanged) institutions.value = []
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/institutions', { params: { tournamentId } })
      if (!tournamentScope.isFetchCurrent(token)) {
        return []
      }
      institutions.value = res.data?.data ?? []
      return institutions.value
    } catch (err: any) {
      if (!tournamentScope.isFetchCurrent(token)) {
        return []
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load institutions'
      return []
    } finally {
      endRequest()
    }
  }

  async function createInstitution(payload: {
    tournamentId: string
    name: string
    category?: string
    priority?: number
    userDefinedData?: Record<string, any>
  }) {
    tournamentScope.claimIfEmpty(payload.tournamentId)
    beginRequest()
    if (tournamentScope.isActive(payload.tournamentId)) error.value = null
    try {
      const res = await api.post('/institutions', payload)
      const created = res.data?.data
      if (created) {
        tournamentScope.invalidateFetches(payload.tournamentId)
        if (tournamentScope.isActive(payload.tournamentId)) {
          institutions.value = [created, ...institutions.value]
        }
      }
      return created
    } catch (err: any) {
      if (tournamentScope.isActive(payload.tournamentId)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create institution'
      }
      return null
    } finally {
      endRequest()
    }
  }

  async function updateInstitution(payload: {
    tournamentId: string
    institutionId: string
    name?: string
    category?: string
    priority?: number
    userDefinedData?: Record<string, any>
  }) {
    tournamentScope.claimIfEmpty(payload.tournamentId)
    beginRequest()
    if (tournamentScope.isActive(payload.tournamentId)) error.value = null
    try {
      const res = await api.patch(`/institutions/${payload.institutionId}`, {
        tournamentId: payload.tournamentId,
        name: payload.name,
        category: payload.category,
        priority: payload.priority,
        userDefinedData: payload.userDefinedData,
      })
      const updated = res.data?.data
      if (updated) {
        tournamentScope.invalidateFetches(payload.tournamentId)
        if (tournamentScope.isActive(payload.tournamentId)) {
          institutions.value = institutions.value.map((item) =>
            item._id === updated._id ? updated : item
          )
        }
      }
      return updated
    } catch (err: any) {
      if (tournamentScope.isActive(payload.tournamentId)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update institution'
      }
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteInstitution(tournamentId: string, institutionId: string) {
    tournamentScope.claimIfEmpty(tournamentId)
    beginRequest()
    if (tournamentScope.isActive(tournamentId)) error.value = null
    try {
      await api.delete(`/institutions/${institutionId}`, { params: { tournamentId } })
      tournamentScope.invalidateFetches(tournamentId)
      if (tournamentScope.isActive(tournamentId)) {
        institutions.value = institutions.value.filter((item) => item._id !== institutionId)
      }
      return true
    } catch (err: any) {
      if (tournamentScope.isActive(tournamentId)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete institution'
      }
      return false
    } finally {
      endRequest()
    }
  }

  async function bulkDeleteInstitutions(tournamentId: string, ids: string[]) {
    const normalizedIds = Array.from(
      new Set(ids.map((id) => String(id ?? '').trim()).filter((id) => id.length > 0))
    )
    if (normalizedIds.length === 0) return 0

    tournamentScope.claimIfEmpty(tournamentId)
    beginRequest()
    if (tournamentScope.isActive(tournamentId)) error.value = null
    try {
      const res = await api.delete('/institutions', {
        params: { tournamentId, ids: normalizedIds.join(',') },
      })
      const deletedCount = Number(res.data?.data?.deletedCount)
      tournamentScope.invalidateFetches(tournamentId)
      if (tournamentScope.isActive(tournamentId)) {
        const deletedIds = new Set(normalizedIds)
        institutions.value = institutions.value.filter(
        (item) => !deletedIds.has(String(item._id ?? ''))
      )
      }
      return Number.isFinite(deletedCount) ? deletedCount : normalizedIds.length
    } catch (err: any) {
      if (tournamentScope.isActive(tournamentId)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete institutions'
      }
      return null
    } finally {
      endRequest()
    }
  }

  return {
    institutions,
    loading,
    error,
    fetchInstitutions,
    createInstitution,
    updateInstitution,
    deleteInstitution,
    bulkDeleteInstitutions,
  }
})
