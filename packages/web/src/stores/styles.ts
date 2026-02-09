import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Style } from '@/types/style'

export const useStylesStore = defineStore('styles', () => {
  const styles = ref<Style[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchStyles() {
    loading.value = true
    error.value = null
    try {
      const res = await api.get('/styles')
      styles.value = res.data?.data ?? []
      return styles.value
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load styles'
      return []
    } finally {
      loading.value = false
    }
  }

  return { styles, loading, error, fetchStyles }
})
