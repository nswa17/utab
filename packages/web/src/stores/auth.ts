import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'

export type UserRole = 'superuser' | 'organizer' | 'adjudicator' | 'speaker' | 'audience'

export const useAuthStore = defineStore('auth', () => {
  const userId = ref<string | null>(null)
  const username = ref<string | null>(null)
  const role = ref<UserRole | null>(null)
  const tournaments = ref<string[]>([])
  const organizerTournaments = ref<string[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false)
  const authRequestSequence = ref(0)

  const isAuthenticated = computed(() => Boolean(userId.value))
  const canAccessAdmin = computed(
    () =>
      isAuthenticated.value &&
      (role.value === 'superuser' ||
        role.value === 'organizer' ||
        organizerTournaments.value.length > 0)
  )

  function clearAuthState() {
    userId.value = null
    username.value = null
    role.value = null
    tournaments.value = []
    organizerTournaments.value = []
  }

  function nextAuthRequestSequence() {
    authRequestSequence.value += 1
    return authRequestSequence.value
  }

  async function login(name: string, password: string) {
    const sequence = nextAuthRequestSequence()
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/auth/login', { username: name, password })
      if (sequence !== authRequestSequence.value) return false
      userId.value = res.data?.data?.userId ?? null
      username.value = res.data?.data?.username ?? null
      role.value = res.data?.data?.role ?? null
      tournaments.value = res.data?.data?.tournaments ?? []
      organizerTournaments.value = res.data?.data?.organizerTournaments ?? []
      initialized.value = true
      return true
    } catch (err: any) {
      if (sequence !== authRequestSequence.value) return false
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Login failed'
      initialized.value = true
      return false
    } finally {
      if (sequence === authRequestSequence.value) {
        loading.value = false
      }
    }
  }

  async function logout() {
    const sequence = nextAuthRequestSequence()
    error.value = null
    try {
      await api.post('/auth/logout')
      if (sequence !== authRequestSequence.value) return
      clearAuthState()
      initialized.value = true
    } catch (err: any) {
      if (sequence !== authRequestSequence.value) return
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Logout failed'
      throw err
    }
  }

  async function fetchMe() {
    const sequence = nextAuthRequestSequence()
    try {
      const res = await api.get('/auth/me')
      if (sequence !== authRequestSequence.value) return
      userId.value = res.data?.data?.userId ?? null
      username.value = res.data?.data?.username ?? null
      role.value = res.data?.data?.role ?? null
      tournaments.value = res.data?.data?.tournaments ?? []
      organizerTournaments.value = res.data?.data?.organizerTournaments ?? []
    } catch {
      if (sequence !== authRequestSequence.value) return
      clearAuthState()
    } finally {
      if (sequence === authRequestSequence.value) {
        initialized.value = true
      }
    }
  }

  return {
    userId,
    username,
    role,
    tournaments,
    organizerTournaments,
    loading,
    error,
    initialized,
    isAuthenticated,
    canAccessAdmin,
    login,
    logout,
    fetchMe,
  }
})
