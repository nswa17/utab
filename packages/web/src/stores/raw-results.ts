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
    loading.value = true
    error.value = null
    try {
      const res = await api.get(`/raw-results/${params.label}`, {
        params: { tournamentId: params.tournamentId, round: params.round },
      })
      const data = res.data?.data ?? []
      setResults(params.label, data)
      return data
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load raw results'
      return []
    } finally {
      loading.value = false
    }
  }

  async function createRawResults(label: RawLabel, payload: any | any[]) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post(`/raw-results/${label}`, payload)
      const created = res.data?.data ?? []
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create raw results'
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateRawResult(label: RawLabel, rawId: string, payload: Record<string, any>) {
    loading.value = true
    error.value = null
    try {
      const res = await api.patch(`/raw-results/${label}/${rawId}`, payload)
      return res.data?.data ?? null
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update raw result'
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteRawResult(label: RawLabel, rawId: string, tournamentId: string) {
    loading.value = true
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
      loading.value = false
    }
  }

  async function deleteRawResults(label: RawLabel, params: Record<string, any>) {
    loading.value = true
    error.value = null
    try {
      const res = await api.delete(`/raw-results/${label}`, { params })
      return res.data?.data ?? null
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete raw results'
      return null
    } finally {
      loading.value = false
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
