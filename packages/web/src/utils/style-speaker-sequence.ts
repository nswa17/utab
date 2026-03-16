import type { StyleSpeakerSequenceItem } from '@/types/style'

export type SpeakerRoleSide = 'gov' | 'opp'

export type SpeakerRoleSequenceEntry = {
  side: SpeakerRoleSide
  index: number
}

type SpeakerRoleCounts = Record<SpeakerRoleSide, number>

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function fallbackSpeakerRoleSequence(roleCounts: SpeakerRoleCounts): SpeakerRoleSequenceEntry[] {
  const sequence: SpeakerRoleSequenceEntry[] = []
  const maxLength = Math.max(roleCounts.gov, roleCounts.opp)
  for (let index = 0; index < maxLength; index += 1) {
    if (index < roleCounts.gov) sequence.push({ side: 'gov', index })
    if (index < roleCounts.opp) sequence.push({ side: 'opp', index })
  }
  return sequence
}

function parseSequenceToken(value: string): SpeakerRoleSequenceEntry | null {
  const match = value.trim().match(/^(gov|opp)-(\d+)$/i)
  if (!match) return null

  const side = match[1]?.toLowerCase()
  const order = Number(match[2])
  if ((side !== 'gov' && side !== 'opp') || !Number.isInteger(order) || order < 1) {
    return null
  }

  return {
    side,
    index: order - 1,
  }
}

function normalizeSequenceEntry(value: unknown): SpeakerRoleSequenceEntry | null {
  if (typeof value === 'string') return parseSequenceToken(value)

  const source = asRecord(value)
  if (typeof source.value === 'string') {
    return parseSequenceToken(source.value)
  }

  const side = typeof source.side === 'string' ? source.side.trim().toLowerCase() : ''
  if (side !== 'gov' && side !== 'opp') return null

  if (typeof source.role === 'string') {
    const byRoleToken = parseSequenceToken(`${side}-${source.role}`)
    if (byRoleToken) return byRoleToken
  }

  const roleOrder = Number(source.role ?? source.order)
  if (!Number.isInteger(roleOrder) || roleOrder < 1) return null

  return {
    side,
    index: roleOrder - 1,
  }
}

function sortSequenceItems(items: StyleSpeakerSequenceItem[]): StyleSpeakerSequenceItem[] {
  return items
    .map((item, index) => ({
      item,
      index,
      order: Number(asRecord(item).order),
    }))
    .sort((left, right) => {
      const leftHasOrder = Number.isFinite(left.order)
      const rightHasOrder = Number.isFinite(right.order)
      if (leftHasOrder && rightHasOrder && left.order !== right.order) return left.order - right.order
      if (leftHasOrder !== rightHasOrder) return leftHasOrder ? -1 : 1
      return left.index - right.index
    })
    .map((entry) => entry.item)
}

export function buildSpeakerRoleSequence(
  speakerSequence: StyleSpeakerSequenceItem[] | undefined,
  roleCounts: SpeakerRoleCounts
): SpeakerRoleSequenceEntry[] {
  const fallback = fallbackSpeakerRoleSequence(roleCounts)
  if (!Array.isArray(speakerSequence) || speakerSequence.length === 0) return fallback

  const sequence: SpeakerRoleSequenceEntry[] = []
  const seen = new Set<string>()

  sortSequenceItems(speakerSequence).forEach((rawEntry) => {
    const entry = normalizeSequenceEntry(rawEntry)
    if (!entry) return
    if (entry.index < 0 || entry.index >= roleCounts[entry.side]) return

    const key = `${entry.side}:${entry.index}`
    if (seen.has(key)) return
    seen.add(key)
    sequence.push(entry)
  })

  fallback.forEach((entry) => {
    const key = `${entry.side}:${entry.index}`
    if (seen.has(key)) return
    seen.add(key)
    sequence.push(entry)
  })

  return sequence
}
