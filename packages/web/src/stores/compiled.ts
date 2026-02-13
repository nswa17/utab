import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type { CompileOptions } from '@/types/compiled'

function extractPayload(value: any): Record<string, any> | null {
  if (!value) return null
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    return extractPayload(value[0])
  }
  if (typeof value === 'object' && value.payload) {
    const payload = extractPayload(value.payload) ?? {}
    const enriched: Record<string, any> = { ...payload }
    const id = String((value as Record<string, any>)._id ?? '').trim()
    if (id) enriched._id = id
    if (value.createdAt) enriched.createdAt = value.createdAt
    if (value.updatedAt) enriched.updatedAt = value.updatedAt
    return enriched
  }
  return value as Record<string, any>
}

export const useCompiledStore = defineStore('compiled', () => {
  const compiled = ref<Record<string, any> | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchLatest(tournamentId: string) {
    loading.value = true
    error.value = null
    try {
      const res = await api.get('/compiled', { params: { tournamentId, latest: '1' } })
      compiled.value = extractPayload(res.data?.data)
      return compiled.value
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load compiled results'
      compiled.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  async function runCompile(
    tournamentId: string,
    options?: {
      source?: 'submissions' | 'raw'
      rounds?: number[]
      options?: CompileOptions
    }
  ) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/compiled', { tournamentId, ...options })
      compiled.value = extractPayload(res.data?.data)
      return compiled.value
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to compile results'
      return null
    } finally {
      loading.value = false
    }
  }

  return { compiled, loading, error, fetchLatest, runCompile }
})
