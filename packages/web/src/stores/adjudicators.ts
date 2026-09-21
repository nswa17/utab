import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import { createTournamentStoreScope } from '@/utils/tournament-store-scope'
import type { Adjudicator } from '@/types/adjudicator'

export const useAdjudicatorsStore = defineStore('adjudicators', () => {
  const adjudicators = ref<Adjudicator[]>([])
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

  async function fetchAdjudicators(tournamentId: string) {
    tournamentScope.claimIfEmpty(tournamentId)
    const { scopeChanged, token } = tournamentScope.beginFetch(tournamentId)
    if (scopeChanged) adjudicators.value = []
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/adjudicators', { params: { tournamentId } })
      if (!tournamentScope.isFetchCurrent(token)) {
        return
      }
      adjudicators.value = res.data?.data ?? []
    } catch (err: any) {
      if (!tournamentScope.isFetchCurrent(token)) {
        return
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load adjudicators'
    } finally {
      endRequest()
    }
  }

  async function createAdjudicator(payload: {
    tournamentId: string
    name: string
    preev?: number
    template?: any
    details?: any[]
    userDefinedData?: Record<string, any>
  }) {
    tournamentScope.claimIfEmpty(payload.tournamentId)
    const scopeToken = tournamentScope.captureScope(payload.tournamentId)
    beginRequest()
    if (tournamentScope.isScopeCurrent(scopeToken)) error.value = null
    try {
      const res = await api.post('/adjudicators', payload)
      const created = res.data?.data
      if (created) {
        if (tournamentScope.isScopeCurrent(scopeToken)) {
          tournamentScope.invalidateFetches(payload.tournamentId)
          adjudicators.value = [created, ...adjudicators.value]
        }
      }
      return created
    } catch (err: any) {
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create adjudicator'
      }
      return null
    } finally {
      endRequest()
    }
  }

  async function updateAdjudicator(payload: {
    tournamentId: string
    adjudicatorId: string
    name?: string
    preev?: number
    template?: any
    details?: any[]
    userDefinedData?: Record<string, any>
  }) {
    tournamentScope.claimIfEmpty(payload.tournamentId)
    const scopeToken = tournamentScope.captureScope(payload.tournamentId)
    beginRequest()
    if (tournamentScope.isScopeCurrent(scopeToken)) error.value = null
    try {
      const res = await api.patch(`/adjudicators/${payload.adjudicatorId}`, {
        tournamentId: payload.tournamentId,
        name: payload.name,
        preev: payload.preev,
        template: payload.template,
        details: payload.details,
        userDefinedData: payload.userDefinedData,
      })
      const updated = res.data?.data
      if (updated) {
        if (tournamentScope.isScopeCurrent(scopeToken)) {
          tournamentScope.invalidateFetches(payload.tournamentId)
          adjudicators.value = adjudicators.value.map((item) =>
            item._id === updated._id ? updated : item
          )
        }
      }
      return updated
    } catch (err: any) {
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update adjudicator'
      }
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteAdjudicator(tournamentId: string, adjudicatorId: string) {
    tournamentScope.claimIfEmpty(tournamentId)
    const scopeToken = tournamentScope.captureScope(tournamentId)
    beginRequest()
    if (tournamentScope.isScopeCurrent(scopeToken)) error.value = null
    try {
      await api.delete(`/adjudicators/${adjudicatorId}`, { params: { tournamentId } })
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        tournamentScope.invalidateFetches(tournamentId)
        adjudicators.value = adjudicators.value.filter((item) => item._id !== adjudicatorId)
      }
      return true
    } catch (err: any) {
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete adjudicator'
      }
      return false
    } finally {
      endRequest()
    }
  }

  async function bulkDeleteAdjudicators(tournamentId: string, ids: string[]) {
    const normalizedIds = Array.from(
      new Set(ids.map((id) => String(id ?? '').trim()).filter((id) => id.length > 0))
    )
    if (normalizedIds.length === 0) return 0

    tournamentScope.claimIfEmpty(tournamentId)
    const scopeToken = tournamentScope.captureScope(tournamentId)
    beginRequest()
    if (tournamentScope.isScopeCurrent(scopeToken)) error.value = null
    try {
      const res = await api.delete('/adjudicators', {
        params: { tournamentId, ids: normalizedIds.join(',') },
      })
      const deletedCount = Number(res.data?.data?.deletedCount)
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        tournamentScope.invalidateFetches(tournamentId)
        const deletedIds = new Set(normalizedIds)
        adjudicators.value = adjudicators.value.filter(
        (item) => !deletedIds.has(String(item._id ?? ''))
      )
      }
      return Number.isFinite(deletedCount) ? deletedCount : normalizedIds.length
    } catch (err: any) {
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete adjudicators'
      }
      return null
    } finally {
      endRequest()
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
    bulkDeleteAdjudicators,
  }
})
