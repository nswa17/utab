import type { Style } from '@/types/style'
import type { Tournament } from '@/types/tournament'

const STYLE_OVERRIDE_KEYS = [
  'team_num',
  'score_weights',
  'side_labels',
  'side_labels_short',
  'speaker_sequence',
  'range',
  'adjudicator_range',
  'roles',
  'user_defined_data',
] as const

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function normalizeTournamentTeamNum(value: unknown, fallback = 2): number {
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed >= 2) return parsed
  const parsedFallback = Number(fallback)
  return Number.isInteger(parsedFallback) && parsedFallback >= 2 ? parsedFallback : 2
}

export function resolveTournamentStyle(
  baseStyle: Style | undefined,
  tournament: Tournament | undefined
): Style | undefined {
  if (!baseStyle) return undefined
  const styleOptions = asRecord(asRecord(tournament?.options)?.style)
  if (!styleOptions) return baseStyle

  const overrides: Record<string, unknown> = {}
  STYLE_OVERRIDE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(styleOptions, key)) {
      overrides[key] = styleOptions[key]
    }
  })
  const overridesScoreLayout = Array.isArray(overrides.score_weights)
  return {
    ...baseStyle,
    ...overrides,
    ...(overridesScoreLayout && overrides.roles === undefined ? { roles: undefined } : {}),
    ...(overridesScoreLayout && overrides.range === undefined ? { range: [] } : {}),
  } as Style
}
