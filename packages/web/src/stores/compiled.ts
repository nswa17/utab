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
  const pendingRequests = ref(0)
  const latestFetchSequence = ref(0)
  const latestPreviewSequence = ref(0)

  function beginRequest() {
    pendingRequests.value += 1
    loading.value = true
  }

  function endRequest() {
    pendingRequests.value = Math.max(0, pendingRequests.value - 1)
    loading.value = pendingRequests.value > 0
  }

  function advanceFetchSequence() {
    latestFetchSequence.value += 1
    return latestFetchSequence.value
  }

  function advancePreviewSequence() {
    latestPreviewSequence.value += 1
    return latestPreviewSequence.value
  }

  async function fetchLatest(tournamentId: string) {
    const sequence = advanceFetchSequence()
    beginRequest()
    error.value = null
    try {
      const res = await api.get('/compiled', { params: { tournamentId, latest: '1' } })
      if (sequence !== latestFetchSequence.value) {
        return null
      }
      compiled.value = extractPayload(res.data?.data)
      return compiled.value
    } catch (err: any) {
      if (sequence !== latestFetchSequence.value) {
        return null
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to load compiled results'
      compiled.value = null
      return null
    } finally {
      endRequest()
    }
  }

  async function runPreview(
    tournamentId: string,
    options?: CompileRunRequest
  ) {
    const sequence = advancePreviewSequence()
    beginRequest()
    error.value = null
    try {
      const source: CompileSource = options?.source === 'raw' ? 'raw' : 'submissions'
      const res = await api.post('/compiled/preview', { tournamentId, ...options })
      if (sequence !== latestPreviewSequence.value) {
        return null
      }
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
      if (sequence !== latestPreviewSequence.value) {
        return null
      }
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to preview compile results'
      previewState.value = null
      return null
    } finally {
      endRequest()
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
    beginRequest()
    error.value = null
    try {
      const res = await api.post('/compiled', toSavePayload(tournamentId, options))
      advanceFetchSequence()
      advancePreviewSequence()
      compiled.value = extractPayload(res.data?.data)
      previewState.value = null
      return compiled.value
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to save compiled results'
      return null
    } finally {
      endRequest()
    }
  }

  async function runCompile(tournamentId: string, options?: CompileRunRequest) {
    return saveCompiled(tournamentId, options)
  }

  async function deleteCompiled(tournamentId: string, compiledId: string) {
    beginRequest()
    error.value = null
    try {
      const targetId = String(compiledId).trim()
      if (!targetId) {
        error.value = 'Invalid compiled result id'
        return null
      }
      const res = await api.delete(`/compiled/${targetId}`, { params: { tournamentId } })
      const deletedPayload = extractPayload(res.data?.data)
      advanceFetchSequence()
      advancePreviewSequence()
      if (compiled.value && String(compiled.value._id ?? '').trim() === targetId) {
        compiled.value = null
      }
      return deletedPayload
    } catch (err: any) {
      error.value = err?.response?.data?.errors?.[0]?.message ?? 'Failed to delete compiled result'
      return null
    } finally {
      endRequest()
    }
  }

  function clearPreview() {
    advancePreviewSequence()
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
    deleteCompiled,
    clearPreview,
  }
})
