import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'

export type UserRole = 'superuser' | 'organizer' | 'adjudicator' | 'speaker' | 'audience'

export const useAuthStore = defineStore('auth', () => {
  const userId = ref<string | null>(null)
  const username = ref<string | null>(null)
  const role = ref<UserRole | null>(null)
  const tournaments = ref<string[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false)

  const isAuthenticated = computed(() => Boolean(userId.value))

  async function login(name: string, password: string) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/auth/login', { username: name, password })
      userId.value = res.data?.data?.userId ?? null
      username.value = res.data?.data?.username ?? null
      role.value = res.data?.data?.role ?? null
      tournaments.value = res.data?.data?.tournaments ?? []
      initialized.value = true
      return true
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Login failed'
      initialized.value = true
      return false
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    await api.post('/auth/logout')
    userId.value = null
    username.value = null
    role.value = null
    tournaments.value = []
    initialized.value = true
  }

  async function fetchMe() {
    try {
      const res = await api.get('/auth/me')
      userId.value = res.data?.data?.userId ?? null
      username.value = res.data?.data?.username ?? null
      role.value = res.data?.data?.role ?? null
      tournaments.value = res.data?.data?.tournaments ?? []
    } catch {
      userId.value = null
      username.value = null
      role.value = null
      tournaments.value = []
    } finally {
      initialized.value = true
    }
  }

  return {
    userId,
    username,
    role,
    tournaments,
    loading,
    error,
    initialized,
    isAuthenticated,
    login,
    logout,
    fetchMe,
  }
})
