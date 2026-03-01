import { computed, proxyRefs, ref } from 'vue'
import type { CompileSource } from '@/types/compiled'

type PreviewMeta = {
  previewSignature: string
  revision: string
  source: CompileSource
}

export function useCompileWorkflow(initialSource: CompileSource = 'submissions') {
  const currentInputKey = ref('')
  const previewInputKey = ref('')
  const previewSignature = ref('')
  const previewRevision = ref('')
  const previewSource = ref<CompileSource>(initialSource)
  const saveModalOpen = ref(false)
  const snapshotNameDraft = ref('')
  const snapshotMemoDraft = ref('')

  const hasPreview = computed(
    () => previewSignature.value.length > 0 && previewRevision.value.length > 0
  )
  const previewStale = computed(
    () =>
      hasPreview.value &&
      currentInputKey.value.length > 0 &&
      previewInputKey.value.length > 0 &&
      currentInputKey.value !== previewInputKey.value
  )
  const canSave = computed(() => hasPreview.value && !previewStale.value)

  function setCurrentInputKey(value: string) {
    currentInputKey.value = value
  }

  function applyPreview(meta: PreviewMeta, inputKey: string) {
    previewSignature.value = meta.previewSignature
    previewRevision.value = meta.revision
    previewSource.value = meta.source
    previewInputKey.value = inputKey
    saveModalOpen.value = false
  }

  function clearPreview() {
    previewSignature.value = ''
    previewRevision.value = ''
    previewInputKey.value = ''
    previewSource.value = initialSource
  }

  function openSaveModal(defaultName: string): boolean {
    if (!canSave.value) return false
    snapshotNameDraft.value = defaultName
    saveModalOpen.value = true
    return true
  }

  function closeSaveModal() {
    saveModalOpen.value = false
  }

  function markSaved() {
    saveModalOpen.value = false
    snapshotNameDraft.value = ''
    snapshotMemoDraft.value = ''
    clearPreview()
  }

  return proxyRefs({
    previewSource,
    saveModalOpen,
    snapshotNameDraft,
    snapshotMemoDraft,
    hasPreview,
    previewStale,
    canSave,
    setCurrentInputKey,
    applyPreview,
    clearPreview,
    openSaveModal,
    closeSaveModal,
    markSaved,
    previewSignature,
    previewRevision,
  })
}
