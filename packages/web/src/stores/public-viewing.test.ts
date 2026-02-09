import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '@/utils/api'
import { useRoundsStore } from './rounds'
import { useDrawsStore } from './draws'
import { useCompiledStore } from './compiled'

type MockedApi = {
  get: ReturnType<typeof vi.fn>
}

const mockedApi = api as unknown as MockedApi

describe('public viewing stores', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
  })

  it('requests public rounds when forcePublic is enabled', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { data: [] } })
    const store = useRoundsStore()

    await store.fetchRounds('tournament-1', { forcePublic: true })

    expect(mockedApi.get).toHaveBeenCalledWith('/rounds', {
      params: {
        tournamentId: 'tournament-1',
        public: '1',
      },
    })
  })

  it('requests public draws when forcePublic is enabled', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { data: [] } })
    const store = useDrawsStore()

    await store.fetchDraws('tournament-1', 3, { forcePublic: true })

    expect(mockedApi.get).toHaveBeenCalledWith('/draws', {
      params: {
        tournamentId: 'tournament-1',
        round: 3,
        public: '1',
      },
    })
  })

  it('extracts latest compiled payload and resets state on failure', async () => {
    const store = useCompiledStore()
    mockedApi.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            payload: {
              compiled_team_results: [{ id: 'team-1' }],
            },
          },
        ],
      },
    })

    const loaded = await store.fetchLatest('tournament-1')
    expect(mockedApi.get).toHaveBeenCalledWith('/compiled', {
      params: { tournamentId: 'tournament-1', latest: '1' },
    })
    expect(loaded).toEqual({ compiled_team_results: [{ id: 'team-1' }] })

    mockedApi.get.mockRejectedValueOnce({
      response: { data: { errors: [{ message: 'No compiled data' }] } },
    })
    const failed = await store.fetchLatest('tournament-1')
    expect(failed).toBeNull()
    expect(store.compiled).toBeNull()
    expect(store.error).toBe('No compiled data')
  })
})
