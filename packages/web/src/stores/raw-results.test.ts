import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '@/utils/api'
import { useRawResultsStore } from './raw-results'

type MockedApi = {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
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

describe('raw results store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
    mockedApi.post.mockReset()
    mockedApi.patch.mockReset()
    mockedApi.delete.mockReset()
  })

  it('keeps only the latest response for the same label when requests resolve out of order', async () => {
    const store = useRawResultsStore()
    const first = createDeferred<any>()
    const second = createDeferred<any>()

    mockedApi.get
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const staleRequest = store.fetchRawResults({
      tournamentId: 'tournament-1',
      label: 'teams',
      round: 1,
    })
    const latestRequest = store.fetchRawResults({
      tournamentId: 'tournament-2',
      label: 'teams',
      round: 2,
    })

    const latestRows = [{ _id: 'latest-team', tournamentId: 'tournament-2', r: 2 }]
    second.resolve({ data: { data: latestRows } })
    await latestRequest

    first.resolve({
      data: {
        data: [{ _id: 'stale-team', tournamentId: 'tournament-1', r: 1 }],
      },
    })
    const staleResult = await staleRequest

    expect(staleResult).toEqual([])
    expect(store.teamResults).toEqual(latestRows as any)
    expect(store.loading).toBe(false)
  })

  it('keeps loading true until concurrent label fetches finish', async () => {
    const store = useRawResultsStore()
    const teamsRequest = createDeferred<any>()
    const speakersRequest = createDeferred<any>()
    const adjudicatorsRequest = createDeferred<any>()

    mockedApi.get
      .mockImplementationOnce(() => teamsRequest.promise)
      .mockImplementationOnce(() => speakersRequest.promise)
      .mockImplementationOnce(() => adjudicatorsRequest.promise)

    const teamsPromise = store.fetchRawResults({ tournamentId: 'tournament-1', label: 'teams', round: 1 })
    const speakersPromise = store.fetchRawResults({
      tournamentId: 'tournament-1',
      label: 'speakers',
      round: 1,
    })
    const adjudicatorsPromise = store.fetchRawResults({
      tournamentId: 'tournament-1',
      label: 'adjudicators',
      round: 1,
    })

    expect(store.loading).toBe(true)

    teamsRequest.resolve({ data: { data: [] } })
    await teamsPromise
    expect(store.loading).toBe(true)

    speakersRequest.resolve({ data: { data: [] } })
    await speakersPromise
    expect(store.loading).toBe(true)

    adjudicatorsRequest.resolve({ data: { data: [] } })
    await adjudicatorsPromise
    expect(store.loading).toBe(false)
  })
})
