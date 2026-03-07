import axios from 'axios'
import type { Router } from 'vue-router'

function trimTrailingSlash(value: string): string {
  if (value === '/') return value
  return value.replace(/\/+$/, '')
}

function normalizeApiPath(pathname: string): string {
  const normalized = trimTrailingSlash(pathname.trim())
  if (normalized === '' || normalized === '/') return '/api/v1'
  if (normalized === '/api') return '/api'
  if (normalized === '/api/v1') return '/api/v1'
  return normalized
}

export function normalizeApiBaseUrl(value?: string | null): string | null {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    const normalizedPath = normalizeApiPath(parsed.pathname)
    if (normalizedPath === '/api') {
      parsed.pathname = '/api'
    } else if (normalizedPath === '/api/v1') {
      parsed.pathname = '/api/v1'
    } else {
      parsed.pathname = normalizedPath
    }
    return trimTrailingSlash(parsed.toString())
  } catch {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimTrailingSlash(trimmed)
    }
  }

  return normalizeApiPath(trimmed.startsWith('/') ? trimmed : `/${trimmed}`)
}

function swapApiVersionPath(value: string): string | null {
  const normalized = normalizeApiBaseUrl(value)
  if (!normalized) return null
  if (normalized.endsWith('/api/v1')) return `${normalized.slice(0, -'/api/v1'.length)}/api`
  if (normalized === '/api/v1') return '/api'
  if (normalized.endsWith('/api')) return `${normalized.slice(0, -'/api'.length)}/api/v1`
  if (normalized === '/api') return '/api/v1'
  return null
}

function isLocalHostname(hostname: string): boolean {
  if (!hostname) return true
  if (hostname === 'localhost') return true
  if (hostname.endsWith('.localhost')) return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true
  if (hostname.includes(':')) return true
  return false
}

function deriveApiSubdomainOrigin(locationHref?: string | null): string | null {
  const href = String(locationHref ?? '').trim()
  if (!href) return null

  try {
    const current = new URL(href)
    if (isLocalHostname(current.hostname)) return null
    if (current.hostname.startsWith('api.')) return null
    return `${current.protocol}//api.${current.hostname}`
  } catch {
    return null
  }
}

function addCandidate(target: string[], value?: string | null) {
  const normalized = normalizeApiBaseUrl(value)
  if (!normalized) return
  if (target.includes(normalized)) return
  target.push(normalized)
}

function defaultLikeApiBaseUrl(value: string | null): boolean {
  return value === null || value === '/api' || value === '/api/v1'
}

export function buildApiBaseUrlCandidates(
  configuredApiBaseUrl?: string | null,
  locationHref?: string | null
): string[] {
  const normalizedConfigured = normalizeApiBaseUrl(configuredApiBaseUrl)
  const candidates: string[] = []
  const fallbackVariant = swapApiVersionPath(normalizedConfigured ?? '')

  addCandidate(candidates, normalizedConfigured)
  addCandidate(candidates, fallbackVariant)

  if (defaultLikeApiBaseUrl(normalizedConfigured)) {
    const preferredRelative = normalizedConfigured === '/api' ? '/api' : '/api/v1'
    const alternateRelative = preferredRelative === '/api' ? '/api/v1' : '/api'
    const derivedOrigin = deriveApiSubdomainOrigin(locationHref)

    addCandidate(candidates, preferredRelative)
    addCandidate(candidates, alternateRelative)
    if (derivedOrigin) {
      addCandidate(candidates, `${derivedOrigin}${preferredRelative}`)
      addCandidate(candidates, `${derivedOrigin}${alternateRelative}`)
    }
  }

  if (candidates.length === 0) {
    addCandidate(candidates, '/api/v1')
  }

  return candidates
}

const configuredApiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_URL)
const apiBaseUrlCandidates = buildApiBaseUrlCandidates(
  configuredApiBaseUrl,
  typeof window !== 'undefined' ? window.location.href : null
)
let activeApiBaseUrl = apiBaseUrlCandidates[0] ?? '/api/v1'

export const api = axios.create({
  baseURL: activeApiBaseUrl,
  withCredentials: true,
})

let interceptorsInstalled = false
let redirectingToLogin = false
let responseInterceptorId: number | null = null
let requestInterceptorInstalled = false

function ensureRequestInterceptor() {
  if (requestInterceptorInstalled) return
  requestInterceptorInstalled = true

  api.interceptors.request.use((config) => {
    if (!config.baseURL) {
      config.baseURL = activeApiBaseUrl
    }
    return config
  })
}

function promoteApiBaseUrl(nextBaseUrl: string) {
  activeApiBaseUrl = nextBaseUrl
  api.defaults.baseURL = nextBaseUrl
}

function looksLikeApiRouteNotFound(error: any): boolean {
  const status = Number(error?.response?.status)
  if (status !== 404) return false
  const message = String(error?.response?.data?.errors?.[0]?.message ?? '').trim()
  if (/route not found/i.test(message)) return true

  const contentType = String(
    error?.response?.headers?.['content-type'] ?? error?.response?.headers?.['Content-Type'] ?? ''
  ).toLowerCase()
  if (contentType.includes('application/json')) return false
  return !Array.isArray(error?.response?.data?.errors)
}

function nextApiBaseUrl(currentBaseUrl?: string | null): string | null {
  const normalized = normalizeApiBaseUrl(currentBaseUrl)
  const currentIndex = normalized ? apiBaseUrlCandidates.indexOf(normalized) : -1
  const nextIndex = currentIndex >= 0 ? currentIndex + 1 : 1
  if (nextIndex < 0 || nextIndex >= apiBaseUrlCandidates.length) return null
  return apiBaseUrlCandidates[nextIndex] ?? null
}

function shouldRetryWithFallbackApiBase(error: any): boolean {
  const retryCount = Number(error?.config?.__utabApiBaseRetryCount ?? 0)
  if (retryCount >= apiBaseUrlCandidates.length - 1) return false

  const method = String(error?.config?.method ?? 'get').toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) return false

  if (!error?.response) return true
  return looksLikeApiRouteNotFound(error)
}

export function setupApiInterceptors(router: Router) {
  ensureRequestInterceptor()
  if (interceptorsInstalled) return
  interceptorsInstalled = true

  responseInterceptorId = api.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (shouldRetryWithFallbackApiBase(error)) {
        const nextBaseUrl = nextApiBaseUrl(error?.config?.baseURL)
        if (nextBaseUrl) {
          promoteApiBaseUrl(nextBaseUrl)
          return api.request({
            ...error.config,
            baseURL: nextBaseUrl,
            __utabApiBaseRetryCount: Number(error?.config?.__utabApiBaseRetryCount ?? 0) + 1,
          })
        }
      }

      const status = error?.response?.status
      const message = String(error?.response?.data?.errors?.[0]?.message ?? '')
      const url = String(error?.config?.url ?? '')
      const currentRoute = router.currentRoute.value
      const isAdminRoute = currentRoute.path.startsWith('/admin')
      const isAuthRequest =
        url.includes('/auth/login') || url.includes('/auth/logout') || url.includes('/auth/me')
      const isOnLogin = currentRoute.path === '/login'
      const shouldRedirect = status === 401 && /please login first/i.test(message) && isAdminRoute

      if (shouldRedirect && !isOnLogin && !isAuthRequest && !redirectingToLogin) {
        redirectingToLogin = true
        try {
          await router.replace({
            path: '/login',
            query: { redirect: currentRoute.fullPath || '/' },
          })
        } finally {
          redirectingToLogin = false
        }
      }

      return Promise.reject(error)
    }
  )
}

export function resetApiInterceptorsForTests() {
  if (responseInterceptorId !== null) {
    api.interceptors.response.eject(responseInterceptorId)
    responseInterceptorId = null
  }
  interceptorsInstalled = false
  redirectingToLogin = false
  promoteApiBaseUrl(apiBaseUrlCandidates[0] ?? '/api/v1')
}
