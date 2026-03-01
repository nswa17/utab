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
    store.initialized = false
    mockedApi.post.mockResolvedValueOnce({ data: { data: { success: true } } })

    await store.logout()

    expect(mockedApi.post).toHaveBeenCalledWith('/auth/logout')
    expect(store.userId).toBeNull()
    expect(store.username).toBeNull()
    expect(store.role).toBeNull()
    expect(store.tournaments).toEqual([])
    expect(store.isAuthenticated).toBe(false)
    expect(store.initialized).toBe(true)
  })

  it('clears auth state even when logout request fails', async () => {
    const store = useAuthStore()
    store.userId = 'user-2'
    store.username = 'bob'
    store.role = 'organizer'
    store.tournaments = ['tournament-2']
    store.initialized = false
    mockedApi.post.mockRejectedValueOnce({
      response: { status: 401, data: { errors: [{ message: 'Please login first' }] } },
    })

    await expect(store.logout()).resolves.toBeUndefined()

    expect(mockedApi.post).toHaveBeenCalledWith('/auth/logout')
    expect(store.userId).toBeNull()
    expect(store.username).toBeNull()
    expect(store.role).toBeNull()
    expect(store.tournaments).toEqual([])
    expect(store.isAuthenticated).toBe(false)
    expect(store.initialized).toBe(true)
  })
})
