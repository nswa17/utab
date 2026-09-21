import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Tournament } from '@/types/tournament'
import { useAuthStore } from '@/stores/auth'

export const useTournamentStore = defineStore('tournament', () => {
  const tournaments = ref<Tournament[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pendingRequests = ref(0)
  const listSequence = ref(0)
  const operationSequence = ref(0)
  const updateIntentSequence = new Map<string, number>()

  function beginRequest() {
    pendingRequests.value += 1
    loading.value = true
  }

  function endRequest() {
    pendingRequests.value = Math.max(0, pendingRequests.value - 1)
    loading.value = pendingRequests.value > 0
  }

  function advanceListSequence() {
    listSequence.value += 1
    return listSequence.value
  }

  function beginOperation() {
    operationSequence.value += 1
    return operationSequence.value
  }

  function isOperationCurrent(sequence: number) {
    return sequence === operationSequence.value
  }

  function updateIntentKey(tournamentId: string, field: string) {
    return `${tournamentId}:${field}`
  }

  function registerUpdateIntent(payload: { tournamentId: string } & Record<string, any>, sequence: number) {
    Object.keys(payload).forEach((key) => {
      if (key === 'tournamentId') return
      if (key === 'user_defined_data_patch') {
        const patch = payload.user_defined_data_patch
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return
        Object.keys(patch).forEach((patchKey) => {
          updateIntentSequence.set(
            updateIntentKey(payload.tournamentId, `user_defined_data.${patchKey}`),
            sequence
          )
        })
        return
      }
      updateIntentSequence.set(updateIntentKey(payload.tournamentId, key), sequence)
    })
  }

  function ownsUpdateIntent(tournamentId: string, field: string, sequence: number) {
    return updateIntentSequence.get(updateIntentKey(tournamentId, field)) === sequence
  }

  async function fetchTournaments() {
    const operation = beginOperation()
    const sequence = advanceListSequence()
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/tournaments')
      if (sequence !== listSequence.value) {
        return []
      }
      tournaments.value = res.data?.data ?? []
      return tournaments.value
    } catch (err: any) {
      if (sequence !== listSequence.value || !isOperationCurrent(operation)) {
        return []
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load tournaments'
      return []
    } finally {
      endRequest()
    }
  }

  async function createTournament(payload: {
    name: string
    style: number
    options?: Record<string, unknown>
    total_round_num?: number
    current_round_num?: number
    preev_weights?: number[]
    auth?: Record<string, any>
    user_defined_data?: Record<string, any>
  }) {
    const operation = beginOperation()
    beginRequest()
    error.value = null
    try {
      const res = await api.post('/tournaments', payload)
      const created = res.data?.data
      if (created) {
        advanceListSequence()
        tournaments.value = [
          created,
          ...tournaments.value.filter((item) => item._id !== created._id),
        ]
        // Keep organizer membership in sync so the new tournament appears immediately
        const auth = useAuthStore()
        const hasAccess = auth.tournaments.includes(created._id)
        if (!hasAccess) {
          auth.tournaments = [...auth.tournaments, created._id]
        }
        const hasOrganizerAccess = auth.organizerTournaments.includes(created._id)
        if (!hasOrganizerAccess) {
          auth.organizerTournaments = [...auth.organizerTournaments, created._id]
        }
      }
      return created
    } catch (err: any) {
      if (isOperationCurrent(operation)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create tournament'
      }
      return null
    } finally {
      endRequest()
    }
  }

  async function updateTournament(payload: { tournamentId: string } & Record<string, any>) {
    const operation = beginOperation()
    registerUpdateIntent(payload, operation)
    beginRequest()
    error.value = null
    try {
      const res = await api.patch(`/tournaments/${payload.tournamentId}`, payload)
      const updated = res.data?.data
      if (updated) {
        advanceListSequence()
        const userDefinedDataPatch =
          payload.user_defined_data_patch &&
          typeof payload.user_defined_data_patch === 'object' &&
          !Array.isArray(payload.user_defined_data_patch)
            ? (payload.user_defined_data_patch as Record<string, any>)
            : null
        tournaments.value = tournaments.value.map((item) => {
          if (item._id !== updated._id) return item

          const merged: Record<string, any> = { ...item }
          Object.keys(payload).forEach((key) => {
            if (key === 'tournamentId' || key === 'user_defined_data_patch') return
            if (
              ownsUpdateIntent(payload.tournamentId, key, operation) &&
              Object.prototype.hasOwnProperty.call(updated, key)
            ) {
              merged[key] = updated[key]
            }
          })

          if (userDefinedDataPatch) {
            const mergedUserDefinedData: Record<string, any> = {
              ...(item.user_defined_data ?? {}),
            }
            Object.keys(userDefinedDataPatch).forEach((key) => {
              if (
                ownsUpdateIntent(
                  payload.tournamentId,
                  `user_defined_data.${key}`,
                  operation
                )
              ) {
                mergedUserDefinedData[key] = userDefinedDataPatch[key]
              }
            })
            merged.user_defined_data = mergedUserDefinedData
          }
          return merged as Tournament
        })
      }
      return updated
    } catch (err: any) {
      if (isOperationCurrent(operation)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update tournament'
      }
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteTournament(tournamentId: string) {
    const operation = beginOperation()
    beginRequest()
    error.value = null
    try {
      await api.delete(`/tournaments/${tournamentId}`)
      advanceListSequence()
      tournaments.value = tournaments.value.filter((item) => item._id !== tournamentId)
      const auth = useAuthStore()
      auth.tournaments = auth.tournaments.filter((item) => item !== tournamentId)
      auth.organizerTournaments = auth.organizerTournaments.filter((item) => item !== tournamentId)
      return true
    } catch (err: any) {
      if (isOperationCurrent(operation)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete tournament'
      }
      return false
    } finally {
      endRequest()
    }
  }

  return {
    tournaments,
    loading,
    error,
    fetchTournaments,
    createTournament,
    updateTournament,
    deleteTournament,
  }
})
