import { describe, expect, it } from 'vitest'
import { createPinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter, setupRouterGuards } from './index'
import { useAuthStore } from '@/stores/auth'

function createOrganizerRouter() {
  const pinia = createPinia()
  const router = createAppRouter({ history: createMemoryHistory(), stubComponents: true })
  setupRouterGuards(router, pinia)
  const auth = useAuthStore(pinia)
  auth.initialized = true
  auth.userId = 'organizer-1'
  auth.username = 'organizer'
  auth.role = 'organizer'
  auth.tournaments = []
  return router
}

describe('admin navigation routes', () => {
  it('supports canonical admin routes', async () => {
    const router = createOrganizerRouter()

    await router.push('/admin/tournament-1')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/setup')

    await router.push('/admin/tournament-1/setup')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/setup')

    await router.push('/admin/tournament-1/operations')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/operations')

    await router.push('/admin/tournament-1/reports')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/reports')

    await router.push('/admin/tournament-1/rounds/1')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/rounds/1/allocation')

    await router.push('/admin/tournament-1/rounds/1/allocation')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/rounds/1/allocation')

    await router.push('/admin/tournament-1/rounds/1/result')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/rounds/1/result')
  })

  it('supports canonical admin embed routes', async () => {
    const router = createOrganizerRouter()

    await router.push('/admin-embed/tournament-1/rounds/settings')
    expect(router.currentRoute.value.path).toBe('/admin-embed/tournament-1/rounds/settings')

    await router.push('/admin-embed/tournament-1/rounds/2/allocation')
    expect(router.currentRoute.value.path).toBe('/admin-embed/tournament-1/rounds/2/allocation')

    await router.push('/admin-embed/tournament-1/rounds/2/result')
    expect(router.currentRoute.value.path).toBe('/admin-embed/tournament-1/rounds/2/result')

    await router.push('/admin-embed/tournament-1/submissions')
    expect(router.currentRoute.value.path).toBe('/admin-embed/tournament-1/submissions')

    await router.push('/admin-embed/tournament-1/reports')
    expect(router.currentRoute.value.path).toBe('/admin-embed/tournament-1/reports')
  })

  it('does not resolve removed legacy admin routes', async () => {
    const router = createOrganizerRouter()
    const legacyPaths = [
      '/admin/tournament-1/home',
      '/admin/tournament-1/rounds',
      '/admin/tournament-1/compiled',
      '/admin/tournament-1/submissions',
      '/admin/tournament-1/reports/presentation?compiledId=abc',
      '/admin/tournament-1/compiled/presentation?compiledId=legacy',
      '/admin/tournament-1/results',
      '/admin-embed/tournament-1/reports/presentation?compiledId=embed-1',
    ]

    for (const path of legacyPaths) {
      await router.push(path)
      expect(router.currentRoute.value.matched.length).toBe(0)
    }
  })
})
