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

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

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

  it('keeps only the latest rounds response when fetches resolve out of order', async () => {
    const store = useRoundsStore()
    const first = createDeferred<any>()
    const second = createDeferred<any>()

    mockedApi.get
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const staleRequest = store.fetchRounds('tournament-1')
    const latestRequest = store.fetchRounds('tournament-2')

    const latestRounds = [{ _id: 'round-2', tournamentId: 'tournament-2', round: 1 }]
    second.resolve({ data: { data: latestRounds } })
    await latestRequest

    first.resolve({
      data: {
        data: [{ _id: 'round-1', tournamentId: 'tournament-1', round: 1 }],
      },
    })
    const staleResult = await staleRequest

    expect(staleResult).toEqual([])
    expect(store.rounds).toEqual(latestRounds as any)
    expect(store.loading).toBe(false)
  })

  it('keeps rounds loading true until concurrent fetches finish', async () => {
    const store = useRoundsStore()
    const first = createDeferred<any>()
    const second = createDeferred<any>()

    mockedApi.get
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const firstRequest = store.fetchRounds('tournament-1')
    const secondRequest = store.fetchRounds('tournament-2')

    expect(store.loading).toBe(true)

    second.resolve({ data: { data: [] } })
    await secondRequest
    expect(store.loading).toBe(true)

    first.resolve({ data: { data: [] } })
    await firstRequest
    expect(store.loading).toBe(false)
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
