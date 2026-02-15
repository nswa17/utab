import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia } from 'pinia'
import { createAppRouter, setupRouterGuards } from './index'
import { useAuthStore } from '@/stores/auth'

function createOrganizerRouter(adminUiV2 = true) {
  const pinia = createPinia()
  const router = createAppRouter({ adminUiV2 })
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
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('supports primary v2 admin paths when feature flag is enabled', async () => {
    const router = createOrganizerRouter(true)

    await router.push('/admin/tournament-1')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/setup')

    await router.push('/admin/tournament-1/setup')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/setup')

    await router.push('/admin/tournament-1/operations')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/operations')

    await router.push('/admin/tournament-1/reports')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/reports')

    await router.push('/admin/tournament-1/rounds/1/result')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/rounds/1/result')
  })

  it('keeps legacy paths via compatibility redirects in v2 mode', async () => {
    const router = createOrganizerRouter(true)

    await router.push('/admin/tournament-1/home?section=data')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/setup')
    expect(router.currentRoute.value.query.section).toBe('data')

    await router.push('/admin/tournament-1/rounds')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/operations')

    await router.push('/admin/tournament-1/compiled')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/reports')

    await router.push('/admin/tournament-1/rounds/2/result')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/rounds/2/result')
  })

  it('keeps legacy paths as primary when feature flag is disabled', async () => {
    const router = createOrganizerRouter(false)

    await router.push('/admin/tournament-1')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/home')

    await router.push('/admin/tournament-1/home')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/home')

    await router.push('/admin/tournament-1/rounds')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/rounds')

    await router.push('/admin/tournament-1/compiled')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/compiled')

    await router.push('/admin/tournament-1/setup')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/setup')

    await router.push('/admin/tournament-1/operations')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/operations')

    await router.push('/admin/tournament-1/reports')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/reports')

    await router.push('/admin/tournament-1/rounds/3/result')
    expect(router.currentRoute.value.path).toBe('/admin/tournament-1/rounds/3/result')
  })
})
