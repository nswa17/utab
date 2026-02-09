import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Team } from '@/types/team'

export const useTeamsStore = defineStore('teams', () => {
  const teams = ref<Team[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchTeams(tournamentId: string) {
    loading.value = true
    error.value = null
    try {
      const res = await api.get('/teams', { params: { tournamentId } })
      teams.value = res.data?.data ?? []
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load teams'
    } finally {
      loading.value = false
    }
  }

  async function createTeam(payload: {
    tournamentId: string
    name: string
    institution?: string
    speakers?: { name: string }[]
    details?: any[]
    userDefinedData?: Record<string, any>
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/teams', payload)
      const created = res.data?.data
      if (created) {
        teams.value = [created, ...teams.value]
      }
      return created
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to create team'
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateTeam(payload: {
    tournamentId: string
    teamId: string
    name?: string
    institution?: string
    speakers?: { name: string }[]
    details?: any[]
    userDefinedData?: Record<string, any>
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.patch(`/teams/${payload.teamId}`, {
        tournamentId: payload.tournamentId,
        name: payload.name,
        institution: payload.institution,
        speakers: payload.speakers,
        details: payload.details,
        userDefinedData: payload.userDefinedData,
      })
      const updated = res.data?.data
      if (updated) {
        teams.value = teams.value.map((item) => (item._id === updated._id ? updated : item))
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update team'
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteTeam(tournamentId: string, teamId: string) {
    loading.value = true
    error.value = null
    try {
      await api.delete(`/teams/${teamId}`, { params: { tournamentId } })
      teams.value = teams.value.filter((item) => item._id !== teamId)
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete team'
      return false
    } finally {
      loading.value = false
    }
  }

  return { teams, loading, error, fetchTeams, createTeam, updateTeam, deleteTeam }
})
