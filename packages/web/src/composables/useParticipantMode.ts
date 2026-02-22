import { computed } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

export const PARTICIPANT_MODES = ['audience', 'speaker', 'adjudicator'] as const
export type ParticipantMode = (typeof PARTICIPANT_MODES)[number]

const DEFAULT_MODE: ParticipantMode = 'audience'

function firstQueryToken(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const token = value.find((item) => typeof item === 'string')
    return typeof token === 'string' ? token : ''
  }
  return ''
}

export function normalizeParticipantMode(value: unknown): ParticipantMode {
  const token = firstQueryToken(value).trim()
  if (token === 'speaker' || token === 'adjudicator' || token === 'audience') return token
  return DEFAULT_MODE
}

export function useParticipantMode(route: RouteLocationNormalizedLoaded) {
  const participantMode = computed<ParticipantMode>(() => normalizeParticipantMode(route.query.mode))
  return { participantMode }
}

export function appendParticipantMode(
  params: URLSearchParams,
  mode: ParticipantMode,
  options: { alwaysInclude?: boolean } = {}
) {
  if (mode === DEFAULT_MODE && options.alwaysInclude !== true) return
  params.set('mode', mode)
}

