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
import { useAuthStore } from '@/stores/auth'
import { useTournamentStore } from './tournament'

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

describe('tournament store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
    mockedApi.post.mockReset()
    mockedApi.patch.mockReset()
    mockedApi.delete.mockReset()
  })

  it('does not let a stale fetch overwrite a newly created tournament', async () => {
    const store = useTournamentStore()
    const auth = useAuthStore()
    auth.tournaments = ['existing']
    auth.organizerTournaments = ['existing']

    let resolveFetch: (value: any) => void = () => {}
    mockedApi.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
    )
    mockedApi.post.mockResolvedValueOnce({
      data: {
        data: {
          _id: 'new-tournament',
          name: 'New Tournament',
          style: 1,
        },
      },
    })

    const fetchPromise = store.fetchTournaments()
    const createPromise = store.createTournament({ name: 'New Tournament', style: 1 })
    await createPromise

    resolveFetch({
      data: {
        data: [
          {
            _id: 'stale-tournament',
            name: 'Stale Tournament',
            style: 1,
          },
        ],
      },
    })
    const staleResult = await fetchPromise

    expect(staleResult).toEqual([])
    expect(store.tournaments).toEqual([
      {
        _id: 'new-tournament',
        name: 'New Tournament',
        style: 1,
      },
    ])
    expect(auth.tournaments).toContain('new-tournament')
    expect(auth.organizerTournaments).toContain('new-tournament')
  })

  it('merges concurrent metadata patch responses by request intent', async () => {
    const store = useTournamentStore()
    store.tournaments = [
      {
        _id: 'tournament-1',
        name: 'Tournament',
        style: 1,
        user_defined_data: {
          hidden: false,
          break: { size: 8 },
          keep: { marker: 'preserve' },
        },
      } as any,
    ]

    const hiddenUpdate = createDeferred<any>()
    const breakUpdate = createDeferred<any>()
    mockedApi.patch
      .mockImplementationOnce(() => hiddenUpdate.promise)
      .mockImplementationOnce(() => breakUpdate.promise)

    const hiddenPromise = store.updateTournament({
      tournamentId: 'tournament-1',
      user_defined_data_patch: { hidden: true },
    })
    const breakPromise = store.updateTournament({
      tournamentId: 'tournament-1',
      user_defined_data_patch: { break: { size: 16 } },
    })

    breakUpdate.resolve({
      data: {
        data: {
          _id: 'tournament-1',
          name: 'Tournament',
          style: 1,
          user_defined_data: {
            hidden: false,
            break: { size: 16 },
            keep: { marker: 'preserve' },
          },
        },
      },
    })
    await breakPromise

    hiddenUpdate.resolve({
      data: {
        data: {
          _id: 'tournament-1',
          name: 'Tournament',
          style: 1,
          user_defined_data: {
            hidden: true,
            break: { size: 8 },
            keep: { marker: 'preserve' },
          },
        },
      },
    })
    await hiddenPromise

    expect(store.tournaments[0]?.user_defined_data).toEqual({
      hidden: true,
      break: { size: 16 },
      keep: { marker: 'preserve' },
    })
  })

  it('does not let an older tournament update error overwrite a newer refresh state', async () => {
    const store = useTournamentStore()
    const staleUpdate = createDeferred<any>()
    mockedApi.patch.mockImplementationOnce(() => staleUpdate.promise)
    mockedApi.get.mockResolvedValueOnce({
      data: {
        data: [{ _id: 'tournament-b', name: 'Tournament B', style: 1 }],
      },
    })

    const stalePromise = store.updateTournament({
      tournamentId: 'tournament-a',
      user_defined_data_patch: { hidden: true },
    })
    await store.fetchTournaments()
    expect(store.error).toBeNull()

    staleUpdate.reject({
      response: { data: { errors: [{ message: 'stale tournament A error' }] } },
    })
    expect(await stalePromise).toBeNull()
    expect(store.error).toBeNull()
    expect(store.tournaments).toEqual([
      { _id: 'tournament-b', name: 'Tournament B', style: 1 },
    ] as any)
  })

  it('keeps loading true until overlapping tournament requests finish', async () => {
    const store = useTournamentStore()
    let resolveFetch: (value: any) => void = () => {}
    let resolveCreate: (value: any) => void = () => {}

    mockedApi.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
    )
    mockedApi.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        })
    )

    const fetchPromise = store.fetchTournaments()
    const createPromise = store.createTournament({ name: 'Concurrent Tournament', style: 1 })

    expect(store.loading).toBe(true)

    resolveCreate({
      data: {
        data: {
          _id: 'created-tournament',
          name: 'Concurrent Tournament',
          style: 1,
        },
      },
    })
    await createPromise
    expect(store.loading).toBe(true)

    resolveFetch({ data: { data: [] } })
    await fetchPromise
    expect(store.loading).toBe(false)
  })
})
