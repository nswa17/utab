import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from './index'

function createUserRouter() {
  return createAppRouter({ history: createMemoryHistory(), stubComponents: true })
}

describe('user navigation routes', () => {
  it('supports canonical user routes', async () => {
    const router = createUserRouter()

    await router.push('/user')
    expect(router.currentRoute.value.path).toBe('/user')

    await router.push('/user/tournament-1')
    expect(router.currentRoute.value.path).toBe('/user/tournament-1/home')

    await router.push('/user/tournament-1/home')
    expect(router.currentRoute.value.path).toBe('/user/tournament-1/home')

    await router.push('/user/tournament-1/rounds/1/ballot/entry')
    expect(router.currentRoute.value.path).toBe('/user/tournament-1/rounds/1/ballot/entry')

    await router.push('/user/tournament-1/rounds/1/feedback/adjudicator-1')
    expect(router.currentRoute.value.path).toBe('/user/tournament-1/rounds/1/feedback/adjudicator-1')
  })

  it('does not resolve removed legacy user routes', async () => {
    const router = createUserRouter()
    const legacyPaths = [
      '/user/tournament-1/dashboard',
      '/user/tournament-1/results',
      '/user/tournament-1/rounds/1/home',
      '/user/tournament-1/rounds/1/draw',
      '/user/tournament-1/rounds/1/ballot/home',
      '/user/tournament-1/rounds/1/feedback/home',
    ]

    for (const path of legacyPaths) {
      await router.push(path)
      expect(router.currentRoute.value.matched.length).toBe(0)
    }
  })
})
