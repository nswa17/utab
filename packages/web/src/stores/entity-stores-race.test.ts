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
import { useTeamsStore } from './teams'
import { useResultsStore } from './results'

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

describe('entity stores race handling', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
    mockedApi.post.mockReset()
    mockedApi.patch.mockReset()
    mockedApi.delete.mockReset()
  })

  it('keeps only the latest teams response when tournament fetches resolve out of order', async () => {
    const store = useTeamsStore()
    const first = createDeferred<any>()
    const second = createDeferred<any>()

    mockedApi.get
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const staleRequest = store.fetchTeams('tournament-a')
    const latestRequest = store.fetchTeams('tournament-b')

    second.resolve({ data: { data: [{ _id: 'team-b', name: 'Team B' }] } })
    await latestRequest

    first.resolve({ data: { data: [{ _id: 'team-a', name: 'Team A' }] } })
    await staleRequest

    expect(store.teams).toEqual([{ _id: 'team-b', name: 'Team B' } as any])
    expect(store.loading).toBe(false)
  })

  it('keeps results loading true until concurrent fetches finish', async () => {
    const store = useResultsStore()
    const first = createDeferred<any>()
    const second = createDeferred<any>()

    mockedApi.get
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const firstRequest = store.fetchResults('tournament-a')
    const secondRequest = store.fetchResults('tournament-b')

    expect(store.loading).toBe(true)

    second.resolve({ data: { data: [] } })
    await secondRequest
    expect(store.loading).toBe(true)

    first.resolve({ data: { data: [] } })
    await firstRequest
    expect(store.loading).toBe(false)
  })

  it('does not let a stale teams fetch overwrite a created team', async () => {
    const store = useTeamsStore()
    const fetchDeferred = createDeferred<any>()

    mockedApi.get.mockImplementationOnce(() => fetchDeferred.promise)
    mockedApi.post.mockResolvedValueOnce({
      data: { data: { _id: 'team-created', name: 'Created Team' } },
    })

    const fetchPromise = store.fetchTeams('tournament-a')
    const createPromise = store.createTeam({
      tournamentId: 'tournament-a',
      name: 'Created Team',
    })

    await createPromise

    fetchDeferred.resolve({ data: { data: [{ _id: 'team-stale', name: 'Stale Team' }] } })
    await fetchPromise

    expect(store.teams).toEqual([{ _id: 'team-created', name: 'Created Team' } as any])
    expect(store.loading).toBe(false)
  })
})
