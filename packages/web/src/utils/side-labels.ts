import type { Style } from '@/types/style'

type Side = 'gov' | 'opp'

const SIDE_ALIASES: Record<Side, string[]> = {
  gov: ['gov', 'government', 'proposition', 'prop', 'affirmative', 'aff'],
  opp: ['opp', 'opposition', 'negative', 'neg'],
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function pickLabel(source: unknown, side: Side): string | null {
  if (!source || typeof source !== 'object') return null
  const entries = Object.entries(source as Record<string, unknown>)
  for (const alias of SIDE_ALIASES[side]) {
    const matched = entries.find(([key]) => normalizeKey(key) === normalizeKey(alias))
    const label = matched?.[1]
    if (typeof label === 'string' && label.trim()) {
      return label
    }
  }
  return null
}

export function getSideLabel(style: Style | undefined, side: Side, fallback: string): string {
  return (
    pickLabel(style?.side_labels, side) ??
    pickLabel(style?.side_labels_short, side) ??
    fallback
  )
}

export function getSideShortLabel(style: Style | undefined, side: Side, fallback: string): string {
  return (
    pickLabel(style?.side_labels_short, side) ??
    pickLabel(style?.side_labels, side) ??
    fallback
  )
}
