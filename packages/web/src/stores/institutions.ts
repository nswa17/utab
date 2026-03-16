import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Institution } from '@/types/institution'

export const useInstitutionsStore = defineStore('institutions', () => {
  const institutions = ref<Institution[]>([])
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

  async function fetchInstitutions(tournamentId: string) {
    const sequence = advanceFetchSequence()
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/institutions', { params: { tournamentId } })
      if (sequence !== latestFetchSequence.value) {
        return []
      }
      institutions.value = res.data?.data ?? []
      return institutions.value
    } catch (err: any) {
      if (sequence !== latestFetchSequence.value) {
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
    beginRequest()
    error.value = null
    try {
      const res = await api.post('/institutions', payload)
      const created = res.data?.data
      if (created) {
        advanceFetchSequence()
        institutions.value = [created, ...institutions.value]
      }
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create institution'
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
    beginRequest()
    error.value = null
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
        advanceFetchSequence()
        institutions.value = institutions.value.map((item) =>
          item._id === updated._id ? updated : item
        )
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update institution'
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteInstitution(tournamentId: string, institutionId: string) {
    beginRequest()
    error.value = null
    try {
      await api.delete(`/institutions/${institutionId}`, { params: { tournamentId } })
      advanceFetchSequence()
      institutions.value = institutions.value.filter((item) => item._id !== institutionId)
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete institution'
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

    loading.value = true
    error.value = null
    try {
      const res = await api.delete('/institutions', {
        params: { tournamentId, ids: normalizedIds.join(',') },
      })
      const deletedIds = new Set(normalizedIds)
      institutions.value = institutions.value.filter(
        (item) => !deletedIds.has(String(item._id ?? ''))
      )
      const deletedCount = Number(res.data?.data?.deletedCount)
      return Number.isFinite(deletedCount) ? deletedCount : normalizedIds.length
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete institutions'
      return null
    } finally {
      loading.value = false
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
