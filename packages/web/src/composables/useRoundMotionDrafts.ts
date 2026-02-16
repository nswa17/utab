import { reactive } from 'vue'

const sharedRoundMotionDrafts = reactive<Record<string, string>>({})

function normalizeRoundId(roundId: string) {
  return String(roundId ?? '').trim()
}

function normalizeMotion(motion: string) {
  return String(motion ?? '')
}

export function getRoundMotionDraft(roundId: string, fallback = '') {
  const key = normalizeRoundId(roundId)
  if (!key) return normalizeMotion(fallback)
  if (!Object.prototype.hasOwnProperty.call(sharedRoundMotionDrafts, key)) {
    sharedRoundMotionDrafts[key] = normalizeMotion(fallback)
  }
  return sharedRoundMotionDrafts[key]
}

export function setRoundMotionDraft(roundId: string, motion: string) {
  const key = normalizeRoundId(roundId)
  if (!key) return
  sharedRoundMotionDrafts[key] = normalizeMotion(motion)
}

export function syncRoundMotionDraft(roundId: string, savedMotion: string, previousSavedMotion = '') {
  const key = normalizeRoundId(roundId)
  if (!key) return
  const normalizedSavedMotion = normalizeMotion(savedMotion)
  if (!Object.prototype.hasOwnProperty.call(sharedRoundMotionDrafts, key)) {
    sharedRoundMotionDrafts[key] = normalizedSavedMotion
    return
  }
  const currentDraft = normalizeMotion(sharedRoundMotionDrafts[key]).trim()
  const previousSaved = normalizeMotion(previousSavedMotion).trim()
  if (currentDraft === previousSaved) {
    sharedRoundMotionDrafts[key] = normalizedSavedMotion
  }
}
