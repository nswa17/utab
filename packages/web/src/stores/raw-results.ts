import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { RawTeamResult, RawSpeakerResult, RawAdjudicatorResult } from '@/types/raw-results'

type RawLabel = 'teams' | 'speakers' | 'adjudicators'

export const useRawResultsStore = defineStore('raw-results', () => {
  const teamResults = ref<RawTeamResult[]>([])
  const speakerResults = ref<RawSpeakerResult[]>([])
  const adjudicatorResults = ref<RawAdjudicatorResult[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pendingRequests = ref(0)
  const latestFetchSequence = ref<Record<RawLabel, number>>({
    teams: 0,
    speakers: 0,
    adjudicators: 0,
  })

  function beginRequest() {
    pendingRequests.value += 1
    loading.value = true
  }

  function endRequest() {
    pendingRequests.value = Math.max(0, pendingRequests.value - 1)
    loading.value = pendingRequests.value > 0
  }

  function setResults(label: RawLabel, results: any[]) {
    if (label === 'teams') teamResults.value = results
    if (label === 'speakers') speakerResults.value = results
    if (label === 'adjudicators') adjudicatorResults.value = results
  }

  async function fetchRawResults(params: {
    tournamentId: string
    label: RawLabel
    round?: number
  }) {
    latestFetchSequence.value[params.label] += 1
    const sequence = latestFetchSequence.value[params.label]
    beginRequest()
    error.value = null
    try {
      const res = await api.get(`/raw-results/${params.label}`, {
        params: { tournamentId: params.tournamentId, round: params.round },
      })
      if (sequence !== latestFetchSequence.value[params.label]) {
        return []
      }
      const data = res.data?.data ?? []
      setResults(params.label, data)
      return data
    } catch (err: any) {
      if (sequence !== latestFetchSequence.value[params.label]) {
        return []
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load raw results'
      return []
    } finally {
      endRequest()
    }
  }

  async function createRawResults(label: RawLabel, payload: any | any[]) {
    beginRequest()
    error.value = null
    try {
      const res = await api.post(`/raw-results/${label}`, payload)
      const created = res.data?.data ?? []
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create raw results'
      return null
    } finally {
      endRequest()
    }
  }

  async function updateRawResult(label: RawLabel, rawId: string, payload: Record<string, any>) {
    beginRequest()
    error.value = null
    try {
      const res = await api.patch(`/raw-results/${label}/${rawId}`, payload)
      return res.data?.data ?? null
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update raw result'
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteRawResult(label: RawLabel, rawId: string, tournamentId: string) {
    beginRequest()
    error.value = null
    try {
      const res = await api.delete(`/raw-results/${label}/${rawId}`, {
        params: { tournamentId },
      })
      return res.data?.data ?? null
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete raw result'
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteRawResults(label: RawLabel, params: Record<string, any>) {
    beginRequest()
    error.value = null
    try {
      const res = await api.delete(`/raw-results/${label}`, { params })
      return res.data?.data ?? null
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete raw results'
      return null
    } finally {
      endRequest()
    }
  }

  return {
    teamResults,
    speakerResults,
    adjudicatorResults,
    loading,
    error,
    fetchRawResults,
    createRawResults,
    updateRawResult,
    deleteRawResult,
    deleteRawResults,
  }
})
