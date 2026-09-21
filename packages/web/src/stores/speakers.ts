import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import { createTournamentStoreScope } from '@/utils/tournament-store-scope'
import type { Speaker } from '@/types/speaker'

export const useSpeakersStore = defineStore('speakers', () => {
  const speakers = ref<Speaker[]>([])
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

  async function fetchSpeakers(tournamentId: string) {
    tournamentScope.claimIfEmpty(tournamentId)
    const { scopeChanged, token } = tournamentScope.beginFetch(tournamentId)
    if (scopeChanged) speakers.value = []
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/speakers', { params: { tournamentId } })
      if (!tournamentScope.isFetchCurrent(token)) {
        return []
      }
      speakers.value = res.data?.data ?? []
      return speakers.value
    } catch (err: any) {
      if (!tournamentScope.isFetchCurrent(token)) {
        return []
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load speakers'
      return []
    } finally {
      endRequest()
    }
  }

  async function createSpeaker(payload: {
    tournamentId: string
    name: string
    userDefinedData?: Record<string, any>
  }) {
    tournamentScope.claimIfEmpty(payload.tournamentId)
    const scopeToken = tournamentScope.captureScope(payload.tournamentId)
    beginRequest()
    if (tournamentScope.isScopeCurrent(scopeToken)) error.value = null
    try {
      const res = await api.post('/speakers', payload)
      const created = res.data?.data
      if (created) {
        if (tournamentScope.isScopeCurrent(scopeToken)) {
          tournamentScope.invalidateFetches(payload.tournamentId)
          speakers.value = [created, ...speakers.value.filter((item) => item._id !== created._id)]
        }
      }
      return created
    } catch (err: any) {
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create speaker'
      }
      return null
    } finally {
      endRequest()
    }
  }

  async function updateSpeaker(payload: {
    tournamentId: string
    speakerId: string
    name?: string
    userDefinedData?: Record<string, any>
  }) {
    tournamentScope.claimIfEmpty(payload.tournamentId)
    const scopeToken = tournamentScope.captureScope(payload.tournamentId)
    beginRequest()
    if (tournamentScope.isScopeCurrent(scopeToken)) error.value = null
    try {
      const res = await api.patch(`/speakers/${payload.speakerId}`, {
        tournamentId: payload.tournamentId,
        name: payload.name,
        userDefinedData: payload.userDefinedData,
      })
      const updated = res.data?.data
      if (updated) {
        if (tournamentScope.isScopeCurrent(scopeToken)) {
          tournamentScope.invalidateFetches(payload.tournamentId)
          speakers.value = speakers.value.map((item) =>
            item._id === updated._id ? updated : item
          )
        }
      }
      return updated
    } catch (err: any) {
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update speaker'
      }
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteSpeaker(tournamentId: string, speakerId: string) {
    tournamentScope.claimIfEmpty(tournamentId)
    const scopeToken = tournamentScope.captureScope(tournamentId)
    beginRequest()
    if (tournamentScope.isScopeCurrent(scopeToken)) error.value = null
    try {
      await api.delete(`/speakers/${speakerId}`, { params: { tournamentId } })
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        tournamentScope.invalidateFetches(tournamentId)
        speakers.value = speakers.value.filter((item) => item._id !== speakerId)
      }
      return true
    } catch (err: any) {
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete speaker'
      }
      return false
    } finally {
      endRequest()
    }
  }

  async function bulkDeleteSpeakers(tournamentId: string, ids: string[]) {
    const normalizedIds = Array.from(
      new Set(ids.map((id) => String(id ?? '').trim()).filter((id) => id.length > 0))
    )
    if (normalizedIds.length === 0) return 0

    tournamentScope.claimIfEmpty(tournamentId)
    const scopeToken = tournamentScope.captureScope(tournamentId)
    beginRequest()
    if (tournamentScope.isScopeCurrent(scopeToken)) error.value = null
    try {
      const res = await api.delete('/speakers', {
        params: { tournamentId, ids: normalizedIds.join(',') },
      })
      const deletedCount = Number(res.data?.data?.deletedCount)
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        tournamentScope.invalidateFetches(tournamentId)
        const deletedIds = new Set(normalizedIds)
        speakers.value = speakers.value.filter((item) => !deletedIds.has(String(item._id ?? '')))
      }
      return Number.isFinite(deletedCount) ? deletedCount : normalizedIds.length
    } catch (err: any) {
      if (tournamentScope.isScopeCurrent(scopeToken)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete speakers'
      }
      return null
    } finally {
      endRequest()
    }
  }

  return {
    speakers,
    loading,
    error,
    fetchSpeakers,
    createSpeaker,
    updateSpeaker,
    deleteSpeaker,
    bulkDeleteSpeakers,
  }
})
