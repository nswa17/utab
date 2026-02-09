import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import { api } from '@/utils/api'
import { useSubmissionsStore } from './submissions'

type MockedApi = {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
}

const mockedApi = api as unknown as MockedApi

describe('submissions store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
    mockedApi.post.mockReset()
  })

  it('handles timeout-like cancellation errors on ballot submission', async () => {
    const store = useSubmissionsStore()
    mockedApi.post.mockRejectedValueOnce({ code: 'ERR_CANCELED' })

    const result = await store.submitBallot({
      tournamentId: 'tournament-1',
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      scoresA: [75],
      scoresB: [72],
    })

    expect(result).toBeNull()
    expect(store.error).toContain('タイムアウト')
    expect(store.loading).toBe(false)
  })

  it('loads admin submissions list with filters', async () => {
    const store = useSubmissionsStore()
    const rows = [{ _id: 's-1', type: 'ballot', round: 1, payload: {} }]
    mockedApi.get.mockResolvedValueOnce({ data: { data: rows } })

    const data = await store.fetchSubmissions({
      tournamentId: 'tournament-1',
      type: 'ballot',
      round: 1,
    })

    expect(mockedApi.get).toHaveBeenCalledWith('/submissions', {
      params: {
        tournamentId: 'tournament-1',
        type: 'ballot',
        round: 1,
      },
    })
    expect(data).toEqual(rows)
    expect(store.submissions).toEqual(rows)
    expect(store.error).toBeNull()
  })

  it('clears stale participant submissions when fetch fails', async () => {
    const store = useSubmissionsStore()
    store.submissions = [{ _id: 'old-row' } as any]
    mockedApi.get.mockRejectedValueOnce({
      response: { data: { errors: [{ message: 'Forbidden' }] } },
    })

    const result = await store.fetchParticipantSubmissions({
      tournamentId: 'tournament-1',
      submittedEntityId: 'team-1',
      type: 'feedback',
      round: 2,
    })

    expect(mockedApi.get).toHaveBeenCalledWith('/submissions/mine', {
      params: {
        tournamentId: 'tournament-1',
        submittedEntityId: 'team-1',
        type: 'feedback',
        round: 2,
      },
    })
    expect(result).toEqual([])
    expect(store.submissions).toEqual([])
    expect(store.error).toBe('Forbidden')
  })

  it('submits feedback payloads with abort signal', async () => {
    const store = useSubmissionsStore()
    const created = { _id: 'feedback-1', type: 'feedback' }
    mockedApi.post.mockResolvedValueOnce({ data: { data: created } })

    const result = await store.submitFeedback({
      tournamentId: 'tournament-1',
      round: 2,
      adjudicatorId: 'adj-1',
      score: 8,
      submittedEntityId: 'team-1',
    })

    expect(mockedApi.post).toHaveBeenCalledWith(
      '/submissions/feedback',
      {
        tournamentId: 'tournament-1',
        round: 2,
        adjudicatorId: 'adj-1',
        score: 8,
        submittedEntityId: 'team-1',
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(result).toEqual(created)
    expect(store.error).toBeNull()
    expect(store.loading).toBe(false)
  })
})
