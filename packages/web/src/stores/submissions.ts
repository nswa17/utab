import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Submission } from '@/types/submission'

const SUBMISSION_TIMEOUT_MS = 6000
const SUBMISSION_TIMEOUT_MESSAGE = '送信がタイムアウトしました。通信状況を確認してもう一度お試しください。'

export interface BallotSubmissionPayload {
  tournamentId: string
  round: number
  teamAId: string
  teamBId: string
  winnerId?: string
  speakerIdsA?: string[]
  speakerIdsB?: string[]
  scoresA: number[]
  scoresB: number[]
  comment?: string
  role?: string
  submittedEntityId?: string
  matterA?: number[]
  mannerA?: number[]
  matterB?: number[]
  mannerB?: number[]
  bestA?: boolean[]
  bestB?: boolean[]
  poiA?: boolean[]
  poiB?: boolean[]
}

export interface FeedbackSubmissionPayload {
  tournamentId: string
  round: number
  adjudicatorId: string
  score: number
  comment?: string
  role?: string
  submittedEntityId?: string
  matter?: number
  manner?: number
}

export const useSubmissionsStore = defineStore('submissions', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const submissions = ref<Submission[]>([])

  async function postWithTimeout(path: string, payload: unknown, timeoutMs = SUBMISSION_TIMEOUT_MS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await api.post(path, payload, { signal: controller.signal })
      return res.data?.data ?? null
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') {
        error.value = SUBMISSION_TIMEOUT_MESSAGE
        return null
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  async function fetchSubmissions(params: {
    tournamentId: string
    type?: 'ballot' | 'feedback'
    round?: number
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.get('/submissions', { params })
      submissions.value = res.data?.data ?? []
      return submissions.value
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load submissions'
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchParticipantSubmissions(params: {
    tournamentId: string
    submittedEntityId: string
    type?: 'ballot' | 'feedback'
    round?: number
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await api.get('/submissions/mine', { params })
      submissions.value = res.data?.data ?? []
      return submissions.value
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load submissions'
      submissions.value = []
      return []
    } finally {
      loading.value = false
    }
  }

  function clearSubmissions() {
    submissions.value = []
    error.value = null
  }

  async function submitBallot(payload: BallotSubmissionPayload) {
    loading.value = true
    error.value = null
    try {
      return await postWithTimeout('/submissions/ballots', payload)
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to submit ballot'
      return null
    } finally {
      loading.value = false
    }
  }

  async function submitFeedback(payload: FeedbackSubmissionPayload) {
    loading.value = true
    error.value = null
    try {
      return await postWithTimeout('/submissions/feedback', payload)
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to submit feedback'
      return null
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    submissions,
    fetchSubmissions,
    fetchParticipantSubmissions,
    clearSubmissions,
    submitBallot,
    submitFeedback,
  }
})
