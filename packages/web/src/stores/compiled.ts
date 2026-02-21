import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/utils/api'
import type {
  CompileRunRequest,
  CompileSaveRequest,
  CompileSource,
  CompiledPreviewState,
} from '@/types/compiled'

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
  const previewState = ref<CompiledPreviewState | null>(null)
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

  async function runPreview(
    tournamentId: string,
    options?: CompileRunRequest
  ) {
    loading.value = true
    error.value = null
    try {
      const source: CompileSource = options?.source === 'raw' ? 'raw' : 'submissions'
      const res = await api.post('/compiled/preview', { tournamentId, ...options })
      const previewPayload = extractPayload(res.data?.data?.preview)
      const previewSignature = String(res.data?.data?.preview_signature ?? '').trim()
      const revision = String(res.data?.data?.revision ?? '').trim()
      if (!previewPayload || !previewSignature || !revision) {
        error.value = 'Failed to load compile preview'
        previewState.value = null
        return null
      }
      previewState.value = {
        preview: previewPayload,
        previewSignature,
        revision,
        source,
      }
      return previewPayload
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to preview compile results'
      previewState.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  function toSavePayload(tournamentId: string, options?: CompileSaveRequest) {
    const payload: Record<string, unknown> = { tournamentId }
    if (options?.source) payload.source = options.source
    if (Array.isArray(options?.rounds)) payload.rounds = options.rounds
    if (options?.options) payload.options = options.options
    if (typeof options?.snapshotName === 'string') payload.snapshot_name = options.snapshotName
    if (typeof options?.snapshotMemo === 'string') payload.snapshot_memo = options.snapshotMemo
    if (typeof options?.previewSignature === 'string') payload.preview_signature = options.previewSignature
    if (typeof options?.revision === 'string') payload.revision = options.revision
    return payload
  }

  async function saveCompiled(
    tournamentId: string,
    options?: CompileSaveRequest
  ) {
    loading.value = true
    error.value = null
    try {
      const res = await api.post('/compiled', toSavePayload(tournamentId, options))
      compiled.value = extractPayload(res.data?.data)
      previewState.value = null
      return compiled.value
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to save compiled results'
      return null
    } finally {
      loading.value = false
    }
  }

  async function runCompile(tournamentId: string, options?: CompileRunRequest) {
    return saveCompiled(tournamentId, options)
  }

  function clearPreview() {
    previewState.value = null
  }

  return {
    compiled,
    previewState,
    loading,
    error,
    fetchLatest,
    runPreview,
    saveCompiled,
    runCompile,
    clearPreview,
  }
})
