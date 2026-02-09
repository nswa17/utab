import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Speaker } from '@/types/speaker'

export const useSpeakersStore = defineStore('speakers', () => {
  const speakers = ref<Speaker[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchSpeakers(tournamentId: string) {
    loading.value = true
    error.value = null
    try {
      const res = await api.get('/speakers', { params: { tournamentId } })
      speakers.value = res.data?.data ?? []
      return speakers.value
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load speakers'
      return []
    } finally {
      loading.value = false
    }
  }

  async function createSpeaker(payload: {
    tournamentId: string
    name: string
    userDefinedData?: Record<string, any>
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/speakers', payload)
      const created = res.data?.data
      if (created) {
        speakers.value = [created, ...speakers.value]
      }
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create speaker'
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateSpeaker(payload: {
    tournamentId: string
    speakerId: string
    name?: string
    userDefinedData?: Record<string, any>
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.patch(`/speakers/${payload.speakerId}`, {
        tournamentId: payload.tournamentId,
        name: payload.name,
        userDefinedData: payload.userDefinedData,
      })
      const updated = res.data?.data
      if (updated) {
        speakers.value = speakers.value.map((item) => (item._id === updated._id ? updated : item))
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update speaker'
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteSpeaker(tournamentId: string, speakerId: string) {
    loading.value = true
    error.value = null
    try {
      await api.delete(`/speakers/${speakerId}`, { params: { tournamentId } })
      speakers.value = speakers.value.filter((item) => item._id !== speakerId)
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete speaker'
      return false
    } finally {
      loading.value = false
    }
  }

  return { speakers, loading, error, fetchSpeakers, createSpeaker, updateSpeaker, deleteSpeaker }
})
