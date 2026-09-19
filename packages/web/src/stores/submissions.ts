import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import { createTournamentStoreScope } from '@/utils/tournament-store-scope'
import type { Submission } from '@/types/submission'

export interface BallotSubmissionPayload {
  tournamentId: string
  round: number
  teamAId: string
  teamBId: string
  winnerId?: string
  draw?: boolean
  speakerIdsA?: string[]
  speakerIdsB?: string[]
  scoresA: number[]
  scoresB: number[]
  comment?: string
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
  const tournamentScope = createTournamentStoreScope()

  function beginRequest() {
    pendingRequests.value += 1
    loading.value = true
  }

  function endRequest() {
    pendingRequests.value = Math.max(0, pendingRequests.value - 1)
    loading.value = pendingRequests.value > 0
  }

  function invalidateFetchSequences() {
    adminFetchSequence.value += 1
    participantFetchSequence.value += 1
  }

  async function postSubmission(path: string, payload: unknown) {
    const res = await api.post(path, payload)
    return res.data?.data ?? null
  }

  async function findExistingParticipantSubmission(params: {
    tournamentId: string
    submittedEntityId?: string
    type: 'ballot' | 'feedback'
    round: number
    matches: (submission: Submission) => boolean
  }): Promise<Submission | null> {
    const submittedEntityId = String(params.submittedEntityId ?? '').trim()
    if (!submittedEntityId) return null

    try {
      const res = await api.get('/submissions/mine', {
        params: {
          tournamentId: params.tournamentId,
          submittedEntityId,
          type: params.type,
          round: params.round,
        },
      })
      const rows = Array.isArray(res.data?.data) ? (res.data.data as Submission[]) : []
      return rows.find(params.matches) ?? null
    } catch {
      return null
    }
  }

  async function reconcileBallotSubmission(
    payload: BallotSubmissionPayload
  ): Promise<Submission | null> {
    const expectedPair = [String(payload.teamAId), String(payload.teamBId)].sort()
    return findExistingParticipantSubmission({
      tournamentId: payload.tournamentId,
      submittedEntityId: payload.submittedEntityId,
      type: 'ballot',
      round: payload.round,
      matches: (submission) => {
        const submittedPayload = submission.payload as Record<string, unknown> | undefined
        const pair = [
          String(submittedPayload?.teamAId ?? ''),
          String(submittedPayload?.teamBId ?? ''),
        ].sort()
        return pair[0] === expectedPair[0] && pair[1] === expectedPair[1]
      },
    })
  }

  async function reconcileFeedbackSubmission(
    payload: FeedbackSubmissionPayload
  ): Promise<Submission | null> {
    return findExistingParticipantSubmission({
      tournamentId: payload.tournamentId,
      submittedEntityId: payload.submittedEntityId,
      type: 'feedback',
      round: payload.round,
      matches: (submission) => {
        const submittedPayload = submission.payload as Record<string, unknown> | undefined
        return String(submittedPayload?.adjudicatorId ?? '') === String(payload.adjudicatorId)
      },
    })
  }

  async function fetchSubmissions(params: {
    tournamentId: string
    type?: 'ballot' | 'feedback'
    round?: number
  }) {
    tournamentScope.claimIfEmpty(params.tournamentId)
    const scopeChanged = tournamentScope.activate(params.tournamentId)
    if (scopeChanged) submissions.value = []
    const sequence = ++adminFetchSequence.value
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/submissions', { params })
      if (
        sequence !== adminFetchSequence.value ||
        !tournamentScope.isActive(params.tournamentId)
      ) {
        return []
      }
      submissions.value = res.data?.data ?? []
      return submissions.value
    } catch (err: any) {
      if (
        sequence !== adminFetchSequence.value ||
        !tournamentScope.isActive(params.tournamentId)
      ) {
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
    const scopeChanged = tournamentScope.activate(params.tournamentId)
    if (scopeChanged) submissions.value = []
    const sequence = ++participantFetchSequence.value
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/submissions/mine', { params })
      if (
        sequence !== participantFetchSequence.value ||
        !tournamentScope.isActive(params.tournamentId)
      ) {
        return []
      }
      submissions.value = res.data?.data ?? []
      return submissions.value
    } catch (err: any) {
      if (
        sequence !== participantFetchSequence.value ||
        !tournamentScope.isActive(params.tournamentId)
      ) {
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
    tournamentScope.clear()
    invalidateFetchSequences()
    submissions.value = []
    error.value = null
  }

  function clearError() {
    error.value = null
  }

  async function submitBallot(payload: BallotSubmissionPayload) {
    tournamentScope.claimIfEmpty(payload.tournamentId)
    beginRequest()
    error.value = null
    try {
      return await postSubmission('/submissions/ballots', payload)
    } catch (err: any) {
      const isDuplicate = Number(err?.response?.status) === 409
      const isAmbiguousNetworkFailure = !err?.response
      if (isDuplicate || isAmbiguousNetworkFailure) {
        const existing = await reconcileBallotSubmission(payload)
        if (existing) {
          error.value = null
          return existing
        }
      }
      if (tournamentScope.isActive(payload.tournamentId)) {
        error.value =
          err?.response?.data?.errors?.[0]?.message ??
          (isAmbiguousNetworkFailure
            ? '送信結果を確認できませんでした。再送する場合、既に送信済みなら自動的に照合されます。'
            : 'Failed to submit ballot')
      }
      return null
    } finally {
      endRequest()
    }
  }

  async function submitFeedback(payload: FeedbackSubmissionPayload) {
    tournamentScope.claimIfEmpty(payload.tournamentId)
    beginRequest()
    error.value = null
    try {
      return await postSubmission('/submissions/feedback', payload)
    } catch (err: any) {
      const isDuplicate = Number(err?.response?.status) === 409
      const isAmbiguousNetworkFailure = !err?.response
      if (isDuplicate || isAmbiguousNetworkFailure) {
        const existing = await reconcileFeedbackSubmission(payload)
        if (existing) {
          error.value = null
          return existing
        }
      }
      if (tournamentScope.isActive(payload.tournamentId)) {
        error.value =
          err?.response?.data?.errors?.[0]?.message ??
          (isAmbiguousNetworkFailure
            ? '送信結果を確認できませんでした。再送する場合、既に送信済みなら自動的に照合されます。'
            : 'Failed to submit feedback')
      }
      return null
    } finally {
      endRequest()
    }
  }

  async function updateSubmission(payload: UpdateSubmissionPayload) {
    tournamentScope.claimIfEmpty(payload.tournamentId)
    beginRequest()
    error.value = null
    try {
      const res = await api.patch(`/submissions/${payload.submissionId}`, {
        tournamentId: payload.tournamentId,
        round: payload.round,
        payload: payload.payload,
      })
      const updated = res.data?.data ?? null
      if (updated?._id && tournamentScope.isActive(payload.tournamentId)) {
        invalidateFetchSequences()
        submissions.value = submissions.value.map((item) => (item._id === updated._id ? updated : item))
      }
      return updated
    } catch (err: any) {
      if (tournamentScope.isActive(payload.tournamentId)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to update submission'
      }
      return null
    } finally {
      endRequest()
    }
  }

  async function deleteSubmission(payload: DeleteSubmissionPayload) {
    tournamentScope.claimIfEmpty(payload.tournamentId)
    beginRequest()
    error.value = null
    try {
      const res = await api.delete(`/submissions/${payload.submissionId}`, {
        params: { tournamentId: payload.tournamentId },
      })
      const deleted = res.data?.data ?? null
      if (deleted?._id && tournamentScope.isActive(payload.tournamentId)) {
        invalidateFetchSequences()
        submissions.value = submissions.value.filter((item) => item._id !== deleted._id)
      }
      return deleted
    } catch (err: any) {
      if (tournamentScope.isActive(payload.tournamentId)) {
        error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete submission'
      }
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
    clearError,
    submitBallot,
    submitFeedback,
    updateSubmission,
    deleteSubmission,
  }
})
