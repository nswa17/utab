import { computed, onMounted, ref, watch, type Ref } from 'vue'

export function useParticipantIdentity(
  tournamentId: Ref<string>,
  mode: Ref<string>,
  suffix?: string
) {
  const identityId = ref('')

  const storageKey = computed(() => {
    if (!tournamentId.value || !mode.value) return ''
    const base = `utab:participant:${tournamentId.value}:${mode.value}`
    if (!suffix) return base
    return `${base}:${suffix}`
  })

  function loadFromStorage() {
    if (!storageKey.value) return
    identityId.value = localStorage.getItem(storageKey.value) ?? ''
  }

  onMounted(() => {
    loadFromStorage()
  })

  watch(storageKey, () => {
    loadFromStorage()
  })

  watch(identityId, (value) => {
    if (!storageKey.value) return
    if (!value) {
      localStorage.removeItem(storageKey.value)
      return
    }
    localStorage.setItem(storageKey.value, value)
  })

  return { identityId }
}
