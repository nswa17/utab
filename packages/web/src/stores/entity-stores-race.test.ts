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
import { useRoundsStore } from './rounds'

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

  it('does not let a mutation from the previous tournament contaminate the newly fetched tournament', async () => {
    const store = useTeamsStore()
    const createDeferredResponse = createDeferred<any>()
    const fetchDeferredResponse = createDeferred<any>()

    mockedApi.post.mockImplementationOnce(() => createDeferredResponse.promise)
    mockedApi.get.mockImplementationOnce(() => fetchDeferredResponse.promise)

    const createPromise = store.createTeam({
      tournamentId: 'tournament-a',
      name: 'Late Team A',
    })
    const fetchPromise = store.fetchTeams('tournament-b')

    createDeferredResponse.resolve({
      data: {
        data: {
          _id: 'team-a-late',
          tournamentId: 'tournament-a',
          name: 'Late Team A',
        },
      },
    })
    await createPromise

    fetchDeferredResponse.resolve({
      data: {
        data: [
          {
            _id: 'team-b-current',
            tournamentId: 'tournament-b',
            name: 'Current Team B',
          },
        ],
      },
    })
    await fetchPromise

    expect(store.teams).toEqual([
      {
        _id: 'team-b-current',
        tournamentId: 'tournament-b',
        name: 'Current Team B',
      },
    ] as any)
    expect(store.error).toBeNull()
  })

  it('does not surface an error from a mutation belonging to the previous tournament', async () => {
    const store = useTeamsStore()
    const createDeferredResponse = createDeferred<any>()

    mockedApi.post.mockImplementationOnce(() => createDeferredResponse.promise)
    mockedApi.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            _id: 'team-b-current',
            tournamentId: 'tournament-b',
            name: 'Current Team B',
          },
        ],
      },
    })

    const createPromise = store.createTeam({
      tournamentId: 'tournament-a',
      name: 'Late Team A',
    })
    await store.fetchTeams('tournament-b')

    createDeferredResponse.reject({
      response: { data: { errors: [{ message: 'Tournament A write failed' }] } },
    })
    await createPromise

    expect(store.teams).toEqual([
      {
        _id: 'team-b-current',
        tournamentId: 'tournament-b',
        name: 'Current Team B',
      },
    ] as any)
    expect(store.error).toBeNull()
  })

  it('clears previous tournament data when a new tournament fetch starts and fails', async () => {
    const store = useTeamsStore()
    mockedApi.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            _id: 'team-a-current',
            tournamentId: 'tournament-a',
            name: 'Current Team A',
          },
        ],
      },
    })
    await store.fetchTeams('tournament-a')
    expect(store.teams).toHaveLength(1)

    const next = createDeferred<any>()
    mockedApi.get.mockImplementationOnce(() => next.promise)
    const fetchPromise = store.fetchTeams('tournament-b')
    expect(store.teams).toEqual([])

    next.reject({
      response: { data: { errors: [{ message: 'Tournament B fetch failed' }] } },
    })
    await fetchPromise

    expect(store.teams).toEqual([])
    expect(store.error).toBe('Tournament B fetch failed')
  })

  it('clears old results immediately when switching tournaments', async () => {
    const store = useResultsStore()
    mockedApi.get.mockResolvedValueOnce({
      data: {
        data: [{ _id: 'result-a', tournamentId: 'tournament-a', round: 1, payload: {} }],
      },
    })
    await store.fetchResults('tournament-a')
    expect(store.results).toHaveLength(1)

    const deferred = createDeferred<any>()
    mockedApi.get.mockImplementationOnce(() => deferred.promise)
    const nextFetch = store.fetchResults('tournament-b')

    expect(store.results).toEqual([])

    deferred.resolve({
      data: {
        data: [{ _id: 'result-b', tournamentId: 'tournament-b', round: 1, payload: {} }],
      },
    })
    await nextFetch
  })


  it('clears old rounds immediately when switching tournaments', async () => {
    const store = useRoundsStore()
    mockedApi.get.mockResolvedValueOnce({
      data: {
        data: [{ _id: 'round-a', tournamentId: 'tournament-a', round: 1, name: 'Round A' }],
      },
    })
    await store.fetchRounds('tournament-a')
    expect(store.rounds).toHaveLength(1)

    const deferred = createDeferred<any>()
    mockedApi.get.mockImplementationOnce(() => deferred.promise)
    const nextFetch = store.fetchRounds('tournament-b')

    expect(store.rounds).toEqual([])

    deferred.resolve({
      data: {
        data: [{ _id: 'round-b', tournamentId: 'tournament-b', round: 1, name: 'Round B' }],
      },
    })
    await nextFetch
  })



  it('claims round store scope on a mutation-only first use', async () => {
    const store = useRoundsStore()
    mockedApi.post.mockResolvedValueOnce({
      data: {
        data: {
          _id: 'round-created',
          tournamentId: 'tournament-a',
          round: 1,
          name: 'Created Round',
        },
      },
    })

    const created = await store.createRound({
      tournamentId: 'tournament-a',
      round: 1,
      name: 'Created Round',
    })

    expect(created?._id).toBe('round-created')
    expect(store.rounds).toEqual([
      {
        _id: 'round-created',
        tournamentId: 'tournament-a',
        round: 1,
        name: 'Created Round',
      },
    ] as any)
  })

  it('does not clear the active tournament round error when an inactive mutation starts', async () => {
    const store = useRoundsStore()
    mockedApi.get.mockRejectedValueOnce({
      response: { data: { errors: [{ message: 'Tournament B fetch failed' }] } },
    })
    await store.fetchRounds('tournament-b')
    expect(store.error).toBe('Tournament B fetch failed')

    mockedApi.post.mockResolvedValueOnce({
      data: {
        data: {
          _id: 'round-a-late',
          tournamentId: 'tournament-a',
          round: 1,
          name: 'Late A Round',
        },
      },
    })
    await store.createRound({
      tournamentId: 'tournament-a',
      round: 1,
      name: 'Late A Round',
    })

    expect(store.rounds).toEqual([])
    expect(store.error).toBe('Tournament B fetch failed')
  })

})
