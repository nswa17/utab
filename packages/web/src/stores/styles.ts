import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { Style } from '@/types/style'

export const useStylesStore = defineStore('styles', () => {
  const styles = ref<Style[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  function sortStylesForDisplay(list: Style[]): Style[] {
    return list
      .slice()
      .sort((left, right) => {
        const leftName = String(left?.name ?? '').trim().toUpperCase()
        const rightName = String(right?.name ?? '').trim().toUpperCase()
        const stylePriority = (name: string) => {
          if (name === 'PDA4') return 0
          if (name === 'PDA3') return 1
          return 2
        }
        const leftPriority = stylePriority(leftName)
        const rightPriority = stylePriority(rightName)
        if (leftPriority !== rightPriority) return leftPriority - rightPriority
        return Number(left?.id ?? 0) - Number(right?.id ?? 0)
      })
  }

  async function fetchStyles() {
    loading.value = true
    error.value = null
    try {
      const res = await api.get('/styles')
      styles.value = sortStylesForDisplay(res.data?.data ?? [])
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
