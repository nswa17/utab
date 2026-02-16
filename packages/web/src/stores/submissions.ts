import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import { i18n } from '@/i18n'
import type { Submission } from '@/types/submission'

const SUBMISSION_TIMEOUT_MS = 6000

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

export interface UpdateSubmissionPayload {
  tournamentId: string
  submissionId: string
  round?: number
  payload?: Record<string, unknown>
}

export interface DeleteSubmissionPayload {
  tournamentId: string
  submissionId: string
}

export const useSubmissionsStore = defineStore('submissions', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const submissions = ref<Submission[]>([])
  const pendingRequests = ref(0)
  const adminFetchSequence = ref(0)
  const participantFetchSequence = ref(0)

  function beginRequest() {
    pendingRequests.value += 1
    loading.value = true
  }

  function endRequest() {
    pendingRequests.value = Math.max(0, pendingRequests.value - 1)
    loading.value = pendingRequests.value > 0
  }

  async function postWithTimeout(path: string, payload: unknown, timeoutMs = SUBMISSION_TIMEOUT_MS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await api.post(path, payload, { signal: controller.signal })
      return res.data?.data ?? null
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') {
        error.value = i18n.global.t(
          '送信がタイムアウトしました。通信状況を確認してもう一度お試しください。'
        )
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
    const sequence = ++adminFetchSequence.value
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/submissions', { params })
      if (sequence !== adminFetchSequence.value) {
        return []
      }
      submissions.value = res.data?.data ?? []
      return submissions.value
    } catch (err: any) {
      if (sequence !== adminFetchSequence.value) {
        return []
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load submissions'
      return []
    } finally {
      endRequest()
    }
  }

  async function fetchParticipantSubmissions(params: {
    tournamentId: string
    submittedEntityId: string
    type?: 'ballot' | 'feedback'
    round?: number
  }) {
    const sequence = ++participantFetchSequence.value
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/submissions/mine', { params })
      if (sequence !== participantFetchSequence.value) {
        return []
      }
      submissions.value = res.data?.data ?? []
      return submissions.value
    } catch (err: any) {
      if (sequence !== participantFetchSequence.value) {
        return []
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load submissions'
      submissions.value = []
      return []
    } finally {
      endRequest()
    }
  }

  function clearSubmissions() {
    submissions.value = []
    error.value = null
  }

  async function submitBallot(payload: BallotSubmissionPayload) {
    beginRequest()
    error.value = null
    try {
      return await postWithTimeout('/submissions/ballots', payload)
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to submit ballot'
      return null
    } finally {
      endRequest()
    }
  }

  async function submitFeedback(payload: FeedbackSubmissionPayload) {
    beginRequest()
    error.value = null
    try {
      return await postWithTimeout('/submissions/feedback', payload)
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to submit feedback'
      return null
    } finally {
      endRequest()
    }
  }

  async function updateSubmission(payload: UpdateSubmissionPayload) {
    beginRequest()
    error.value = null
    try {
      const res = await api.patch(`/submissions/${payload.submissionId}`, {
        tournamentId: payload.tournamentId,
        round: payload.round,
        payload: payload.payload,
      })
      const updated = res.data?.data ?? null
      if (updated?._id) {
        submissions.value = submissions.value.map((item) => (item._id === updated._id ? updated : item))
      }
      return updated
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update submission'
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteSubmission(payload: DeleteSubmissionPayload) {
    beginRequest()
    error.value = null
    try {
      const res = await api.delete(`/submissions/${payload.submissionId}`, {
        params: { tournamentId: payload.tournamentId },
      })
      const deleted = res.data?.data ?? null
      if (deleted?._id) {
        submissions.value = submissions.value.filter((item) => item._id !== deleted._id)
      }
      return deleted
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete submission'
      return null
    } finally {
      endRequest()
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
    updateSubmission,
    deleteSubmission,
  }
})
