import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Institution } from '@/types/institution'

export const useInstitutionsStore = defineStore('institutions', () => {
  const institutions = ref<Institution[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchInstitutions(tournamentId: string) {
    loading.value = true
    error.value = null
    try {
      const res = await api.get('/institutions', { params: { tournamentId } })
      institutions.value = res.data?.data ?? []
      return institutions.value
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load institutions'
      return []
    } finally {
      loading.value = false
    }
  }

  async function createInstitution(payload: {
    tournamentId: string
    name: string
    category?: string
    priority?: number
    userDefinedData?: Record<string, any>
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/institutions', payload)
      const created = res.data?.data
      if (created) {
        institutions.value = [created, ...institutions.value]
      }
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create institution'
      return null
    } finally {
      loading.value = false
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
    loading.value = true
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
        institutions.value = institutions.value.map((item) =>
          item._id === updated._id ? updated : item
        )
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update institution'
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteInstitution(tournamentId: string, institutionId: string) {
    loading.value = true
    error.value = null
    try {
      await api.delete(`/institutions/${institutionId}`, { params: { tournamentId } })
      institutions.value = institutions.value.filter((item) => item._id !== institutionId)
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete institution'
      return false
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
  }
})
