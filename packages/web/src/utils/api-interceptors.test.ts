import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { api, resetApiInterceptorsForTests, setupApiInterceptors } from './api'

type TestRouter = {
  currentRoute: ReturnType<typeof ref>
  replace: ReturnType<typeof vi.fn>
}

async function setup(path: string) {
  const currentRoute = ref({ path, fullPath: path })
  const replace = vi.fn(async () => {})
  const router = { currentRoute, replace } as unknown as TestRouter

  resetApiInterceptorsForTests()
  setupApiInterceptors(router as any)
  const handlers = (api.interceptors.response as any).handlers as Array<{ rejected?: (error: any) => Promise<never> }>
  const rejected = handlers.at(-1)?.rejected as (
    error: any
  ) => Promise<never>

  return { rejected, replace }
}

describe('setupApiInterceptors', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('redirects to login on admin-route 401 responses with login-required message', async () => {
    const { rejected, replace } = await setup('/admin/abc')
    const error = {
      response: { status: 401, data: { errors: [{ message: 'Please login first' }] } },
      config: { url: '/teams' },
    }

    await expect(rejected(error)).rejects.toBe(error)
    expect(replace).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/admin/abc' },
    })
  })

  it('does not redirect on non-admin routes', async () => {
    const { rejected, replace } = await setup('/user/tournament-1')
    const error = {
      response: { status: 401, data: { errors: [{ message: 'Please login first' }] } },
      config: { url: '/teams' },
    }

    await expect(rejected(error)).rejects.toBe(error)
    expect(replace).not.toHaveBeenCalled()
  })

  it('does not redirect for auth endpoint failures', async () => {
    const { rejected, replace } = await setup('/admin/tournament-1')
    const error = {
      response: { status: 401, data: { errors: [{ message: 'Please login first' }] } },
      config: { url: '/auth/me' },
    }

    await expect(rejected(error)).rejects.toBe(error)
    expect(replace).not.toHaveBeenCalled()
  })
})
