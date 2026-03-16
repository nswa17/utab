import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import { api } from '@/utils/api'
import { useAuthStore } from './auth'

type MockedApi = {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
}

const mockedApi = api as unknown as MockedApi

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
    mockedApi.post.mockReset()
  })

  it('clears auth state after successful logout', async () => {
    const store = useAuthStore()
    store.userId = 'user-1'
    store.username = 'alice'
    store.role = 'organizer'
    store.tournaments = ['tournament-1']
    store.organizerTournaments = ['tournament-1']
    store.initialized = false
    mockedApi.post.mockResolvedValueOnce({ data: { data: { success: true } } })

    await store.logout()

    expect(mockedApi.post).toHaveBeenCalledWith('/auth/logout')
    expect(store.userId).toBeNull()
    expect(store.username).toBeNull()
    expect(store.role).toBeNull()
    expect(store.tournaments).toEqual([])
    expect(store.organizerTournaments).toEqual([])
    expect(store.isAuthenticated).toBe(false)
    expect(store.initialized).toBe(true)
  })

  it('keeps auth state when logout request fails', async () => {
    const store = useAuthStore()
    store.userId = 'user-2'
    store.username = 'bob'
    store.role = 'organizer'
    store.tournaments = ['tournament-2']
    store.organizerTournaments = ['tournament-2']
    store.initialized = false
    const requestError = {
      response: { status: 401, data: { errors: [{ message: 'Please login first' }] } },
    }
    mockedApi.post.mockRejectedValueOnce(requestError)

    await expect(store.logout()).rejects.toBe(requestError)

    expect(mockedApi.post).toHaveBeenCalledWith('/auth/logout')
    expect(store.userId).toBe('user-2')
    expect(store.username).toBe('bob')
    expect(store.role).toBe('organizer')
    expect(store.tournaments).toEqual(['tournament-2'])
    expect(store.organizerTournaments).toEqual(['tournament-2'])
    expect(store.isAuthenticated).toBe(true)
    expect(store.initialized).toBe(false)
    expect(store.error).toBe('Please login first')
  })

  it('treats organizer tournament memberships as admin access even when the global role is not organizer', async () => {
    const store = useAuthStore()
    mockedApi.get.mockResolvedValueOnce({
      data: {
        data: {
          userId: 'user-3',
          username: 'carol',
          role: 'speaker',
          tournaments: ['tournament-3'],
          organizerTournaments: ['tournament-3'],
        },
      },
    })

    await store.fetchMe()

    expect(store.role).toBe('speaker')
    expect(store.tournaments).toEqual(['tournament-3'])
    expect(store.organizerTournaments).toEqual(['tournament-3'])
    expect(store.canAccessAdmin).toBe(true)
  })

  it('ignores a stale fetchMe failure that resolves after a successful login', async () => {
    const store = useAuthStore()
    let rejectFetchMe: (error: any) => void = () => {}
    let resolveLogin: (value: any) => void = () => {}

    mockedApi.get.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFetchMe = reject
        })
    )
    mockedApi.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve
        })
    )

    const fetchPromise = store.fetchMe()
    const loginPromise = store.login('dave', 'password123')

    resolveLogin({
      data: {
        data: {
          userId: 'user-4',
          username: 'dave',
          role: 'organizer',
          tournaments: ['tournament-4'],
          organizerTournaments: ['tournament-4'],
        },
      },
    })
    expect(await loginPromise).toBe(true)

    rejectFetchMe({ response: { data: { errors: [{ message: 'Please login first' }] } } })
    await fetchPromise

    expect(store.userId).toBe('user-4')
    expect(store.username).toBe('dave')
    expect(store.role).toBe('organizer')
    expect(store.tournaments).toEqual(['tournament-4'])
    expect(store.organizerTournaments).toEqual(['tournament-4'])
    expect(store.isAuthenticated).toBe(true)
  })

  it('ignores a stale fetchMe success that resolves after logout', async () => {
    const store = useAuthStore()
    store.userId = 'user-5'
    store.username = 'erin'
    store.role = 'organizer'
    store.tournaments = ['tournament-5']
    store.organizerTournaments = ['tournament-5']

    let resolveFetchMe: (value: any) => void = () => {}
    mockedApi.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetchMe = resolve
        })
    )
    mockedApi.post.mockResolvedValueOnce({ data: { data: { success: true } } })

    const fetchPromise = store.fetchMe()
    await store.logout()

    resolveFetchMe({
      data: {
        data: {
          userId: 'user-5',
          username: 'erin',
          role: 'organizer',
          tournaments: ['tournament-5'],
          organizerTournaments: ['tournament-5'],
        },
      },
    })
    await fetchPromise

    expect(store.userId).toBeNull()
    expect(store.username).toBeNull()
    expect(store.role).toBeNull()
    expect(store.tournaments).toEqual([])
    expect(store.organizerTournaments).toEqual([])
    expect(store.isAuthenticated).toBe(false)
  })
})
