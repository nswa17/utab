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
