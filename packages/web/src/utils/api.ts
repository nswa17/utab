import axios from 'axios'
import type { Router } from 'vue-router'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,
})

let interceptorsInstalled = false
let redirectingToLogin = false
let responseInterceptorId: number | null = null

export function setupApiInterceptors(router: Router) {
  if (interceptorsInstalled) return
  interceptorsInstalled = true

  responseInterceptorId = api.interceptors.response.use(
    (response) => response,
    async (error) => {
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
}
