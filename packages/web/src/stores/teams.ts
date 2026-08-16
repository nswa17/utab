import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Team } from '@/types/team'

export const useTeamsStore = defineStore('teams', () => {
  const teams = ref<Team[]>([])
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

  async function fetchTeams(tournamentId: string) {
    const sequence = advanceFetchSequence()
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/teams', { params: { tournamentId } })
      if (sequence !== latestFetchSequence.value) {
        return
      }
      teams.value = res.data?.data ?? []
    } catch (err: any) {
      if (sequence !== latestFetchSequence.value) {
        return
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load teams'
    } finally {
      endRequest()
    }
  }

  async function createTeam(payload: {
    tournamentId: string
    name: string
    template?: any
    details?: any[]
    userDefinedData?: Record<string, any>
  }) {
    beginRequest()
    error.value = null
    try {
      const res = await api.post('/teams', payload)
      const created = res.data?.data
      if (created) {
        advanceFetchSequence()
        teams.value = [created, ...teams.value]
      }
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create team'
      return null
    } finally {
      endRequest()
    }
  }

  async function updateTeam(payload: {
    tournamentId: string
    teamId: string
    name?: string
    template?: any
    details?: any[]
    userDefinedData?: Record<string, any>
  }) {
    beginRequest()
    error.value = null
    try {
      const res = await api.patch(`/teams/${payload.teamId}`, {
        tournamentId: payload.tournamentId,
        name: payload.name,
        template: payload.template,
        details: payload.details,
        userDefinedData: payload.userDefinedData,
      })
      const updated = res.data?.data
      if (updated) {
        advanceFetchSequence()
        teams.value = teams.value.map((item) => (item._id === updated._id ? updated : item))
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update team'
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteTeam(tournamentId: string, teamId: string) {
    beginRequest()
    error.value = null
    try {
      await api.delete(`/teams/${teamId}`, { params: { tournamentId } })
      advanceFetchSequence()
      teams.value = teams.value.filter((item) => item._id !== teamId)
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete team'
      return false
    } finally {
      endRequest()
    }
  }

  async function bulkDeleteTeams(tournamentId: string, ids: string[]) {
    const normalizedIds = Array.from(
      new Set(ids.map((id) => String(id ?? '').trim()).filter((id) => id.length > 0))
    )
    if (normalizedIds.length === 0) return 0

    beginRequest()
    error.value = null
    try {
      const res = await api.delete('/teams', {
        params: { tournamentId, ids: normalizedIds.join(',') },
      })
      advanceFetchSequence()
      const deletedIds = new Set(normalizedIds)
      teams.value = teams.value.filter((item) => !deletedIds.has(String(item._id ?? '')))
      const deletedCount = Number(res.data?.data?.deletedCount)
      return Number.isFinite(deletedCount) ? deletedCount : normalizedIds.length
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete teams'
      return null
    } finally {
      endRequest()
    }
  }

  return {
    teams,
    loading,
    error,
    fetchTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    bulkDeleteTeams,
  }
})
