import { describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter, setupRouterGuards } from './index'
import { useAuthStore } from '@/stores/auth'

function createRouterWithAuth() {
  const pinia = createPinia()
  const router = createAppRouter({ history: createMemoryHistory(), stubComponents: true })
  setupRouterGuards(router, pinia)
  const auth = useAuthStore(pinia)
  return { router, auth }
}

describe('router guards', () => {
  it('redirects unauthenticated admin access to login with redirect path', async () => {
    const { router, auth } = createRouterWithAuth()
    const fetchMe = vi.spyOn(auth, 'fetchMe').mockImplementation(async () => {
      auth.userId = null
      auth.username = null
      auth.role = null
      auth.tournaments = []
      auth.initialized = true
    })

    await router.push('/admin')
    await router.isReady()

    expect(fetchMe).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/admin')
  })

  it('blocks non-admin users from admin routes', async () => {
    const { router, auth } = createRouterWithAuth()
    auth.initialized = true
    auth.userId = 'user-1'
    auth.username = 'speaker-user'
    auth.role = 'speaker'
    auth.tournaments = []
    const fetchMe = vi.spyOn(auth, 'fetchMe')

    await router.push('/admin')
    await router.isReady()

    expect(fetchMe).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/user')
  })

  it('allows organizers to access admin routes', async () => {
    const { router, auth } = createRouterWithAuth()
    auth.initialized = true
    auth.userId = 'user-2'
    auth.username = 'organizer-user'
    auth.role = 'organizer'
    auth.tournaments = []

    await router.push('/admin')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/admin')
  })
})
