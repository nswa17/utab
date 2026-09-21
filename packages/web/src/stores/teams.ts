import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import { createTournamentStoreScope } from '@/utils/tournament-store-scope'
import type { Team } from '@/types/team'

export const useTeamsStore = defineStore('teams', () => {
  const teams = ref<Team[]>([])
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

  async function fetchTeams(tournamentId: string) {
    tournamentScope.claimIfEmpty(tournamentId)
    const { scopeChanged, token } = tournamentScope.beginFetch(tournamentId)
    if (scopeChanged) teams.value = []
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/teams', { params: { tournamentId } })
      if (!tournamentScope.isFetchCurrent(token)) {
        return
      }
      teams.value = res.data?.data ?? []
    } catch (err: any) {
      if (!tournamentScope.isFetchCurrent(token)) {
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
    tournamentScope.claimIfEmpty(payload.tournamentId)
    const scopeToken = tournamentScope.captureScope(payload.tournamentId)
    beginRequest()
    if (tournamentScope.isScopeCurrent(scopeToken)) error.value = null
    try {
      const res = await api.post('/teams', payload)
      const created = res.data?.data
      if (created) {
        if (tournamentScope.isScopeCurrent(scopeToken)) {
          tournamentScope.invalidateFetches(payload.tournamentId)
          teams.value = [created, ...teams.value]
        }
      }
      return created
    } catch (err: any) {
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create team'
      }
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
    tournamentScope.claimIfEmpty(payload.tournamentId)
    const scopeToken = tournamentScope.captureScope(payload.tournamentId)
    beginRequest()
    if (tournamentScope.isScopeCurrent(scopeToken)) error.value = null
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
        if (tournamentScope.isScopeCurrent(scopeToken)) {
          tournamentScope.invalidateFetches(payload.tournamentId)
          teams.value = teams.value.map((item) =>
            item._id === updated._id ? updated : item
          )
        }
      }
      return updated
    } catch (err: any) {
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update team'
      }
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteTeam(tournamentId: string, teamId: string) {
    tournamentScope.claimIfEmpty(tournamentId)
    const scopeToken = tournamentScope.captureScope(tournamentId)
    beginRequest()
    if (tournamentScope.isScopeCurrent(scopeToken)) error.value = null
    try {
      await api.delete(`/teams/${teamId}`, { params: { tournamentId } })
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        tournamentScope.invalidateFetches(tournamentId)
        teams.value = teams.value.filter((item) => item._id !== teamId)
      }
      return true
    } catch (err: any) {
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete team'
      }
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

    tournamentScope.claimIfEmpty(tournamentId)
    const scopeToken = tournamentScope.captureScope(tournamentId)
    beginRequest()
    if (tournamentScope.isScopeCurrent(scopeToken)) error.value = null
    try {
      const res = await api.delete('/teams', {
        params: { tournamentId, ids: normalizedIds.join(',') },
      })
      const deletedCount = Number(res.data?.data?.deletedCount)
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        tournamentScope.invalidateFetches(tournamentId)
        const deletedIds = new Set(normalizedIds)
        teams.value = teams.value.filter((item) => !deletedIds.has(String(item._id ?? '')))
      }
      return Number.isFinite(deletedCount) ? deletedCount : normalizedIds.length
    } catch (err: any) {
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete teams'
      }
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
