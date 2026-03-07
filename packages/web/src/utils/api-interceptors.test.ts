import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  api,
  buildApiBaseUrlCandidates,
  normalizeApiBaseUrl,
  resetApiInterceptorsForTests,
  setupApiInterceptors,
} from './api'

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
    resetApiInterceptorsForTests()
  })

  it('uses the versioned API base URL by default', () => {
    expect(api.defaults.baseURL).toBe('/api/v1')
  })

  it('builds fallback candidates for same-origin and api subdomain deployments', () => {
    expect(buildApiBaseUrlCandidates(undefined, 'https://tab.example.com/admin')).toEqual([
      '/api/v1',
      '/api',
      'https://api.tab.example.com/api/v1',
      'https://api.tab.example.com/api',
    ])
  })

  it('keeps explicit API hosts first and falls back to the legacy path on the same host', () => {
    expect(
      buildApiBaseUrlCandidates('https://api.tab.example.com/api/v1', 'https://tab.example.com')
    ).toEqual([
      'https://api.tab.example.com/api/v1',
      'https://api.tab.example.com/api',
    ])
    expect(normalizeApiBaseUrl('https://api.tab.example.com/api/')).toBe(
      'https://api.tab.example.com/api'
    )
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

  it('retries GET requests against the legacy path when /api/v1 is not mounted yet', async () => {
    const { rejected, replace } = await setup('/admin/tournament-1')
    const request = vi.spyOn(api, 'request').mockResolvedValue({ data: { data: [] } } as any)
    const error = {
      response: {
        status: 404,
        data: { errors: [{ message: 'Route not found' }] },
        headers: { 'content-type': 'application/json' },
      },
      config: { url: '/tournaments', method: 'get', baseURL: '/api/v1' },
    }

    await expect(rejected(error)).resolves.toEqual({ data: { data: [] } })
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/tournaments',
        method: 'get',
        baseURL: '/api',
        __utabApiBaseRetryCount: 1,
      })
    )
    expect(api.defaults.baseURL).toBe('/api')
    expect(replace).not.toHaveBeenCalled()
  })

  it('does not retry POST requests when the endpoint is missing', async () => {
    const { rejected } = await setup('/admin/tournament-1')
    const request = vi.spyOn(api, 'request').mockResolvedValue({ data: null } as any)
    const error = {
      response: {
        status: 404,
        data: { errors: [{ message: 'Route not found' }] },
        headers: { 'content-type': 'application/json' },
      },
      config: { url: '/tournaments', method: 'post', baseURL: '/api/v1' },
    }

    await expect(rejected(error)).rejects.toBe(error)
    expect(request).not.toHaveBeenCalled()
    expect(api.defaults.baseURL).toBe('/api/v1')
  })
})
