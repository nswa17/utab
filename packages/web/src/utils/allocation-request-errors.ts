export type AllocationAvailabilityRole = 'team' | 'adjudicator' | 'venue'

type AvailabilityCounts = Partial<Record<AllocationAvailabilityRole, number>>

type FormatAllocationRequestErrorOptions = {
  locale?: string | null
  errorName?: string | null
  message?: string | null
  availableCountByRole?: AvailabilityCounts
  requiredCountByRole?: AvailabilityCounts
}

const ENGLISH_NEED_MORE_PATTERN =
  /^At least (\d+) more available (team|adjudicator|venue)s are needed$/i
const JAPANESE_NEED_MORE_PATTERN =
  /^使用可能(チーム|ジャッジ|会場)が足りません。必要 (\d+|\{required\}) 人 \/ 使用可能 (\d+|\{available\}) 人です。人数設定か availability を見直してください。?$/
const NEED_MORE_NAME_PATTERN = /^NeedMore(Team|Adjudicator|Venue)$/i

function normalizeRoleToken(value: string | null | undefined): AllocationAvailabilityRole | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'team') return 'team'
  if (normalized === 'adjudicator') return 'adjudicator'
  if (normalized === 'venue') return 'venue'
  if (normalized === 'チーム') return 'team'
  if (normalized === 'ジャッジ') return 'adjudicator'
  if (normalized === '会場') return 'venue'
  return null
}

function toFiniteNumber(value: string | number | null | undefined): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isJapaneseLocale(locale: string | null | undefined): boolean {
  return String(locale ?? 'en')
    .trim()
    .toLowerCase()
    .startsWith('ja')
}

function roleLabel(role: AllocationAvailabilityRole, locale: string | null | undefined): string {
  if (isJapaneseLocale(locale)) {
    if (role === 'team') return 'チーム'
    if (role === 'adjudicator') return 'ジャッジ'
    return '会場'
  }
  if (role === 'team') return 'teams'
  if (role === 'adjudicator') return 'adjudicators'
  return 'venues'
}

function formatAvailabilityMessage(
  role: AllocationAvailabilityRole,
  required: number,
  available: number,
  locale: string | null | undefined
): string {
  if (isJapaneseLocale(locale)) {
    return `使用可能${roleLabel(role, locale)}が足りません。必要 ${required} 人 / 使用可能 ${available} 人です。人数設定か availability を見直してください。`
  }
  return `Not enough available ${roleLabel(role, locale)}. Required ${required}; available ${available}. Review the headcount settings or availability.`
}

export function formatAllocationRequestError(
  options: FormatAllocationRequestErrorOptions
): string | null {
  const message = String(options.message ?? '').trim()
  const locale = options.locale ?? 'en'

  let role: AllocationAvailabilityRole | null = null
  let required: number | null = null
  let available: number | null = null

  const englishMatch = message.match(ENGLISH_NEED_MORE_PATTERN)
  if (englishMatch) {
    role = normalizeRoleToken(englishMatch[2])
    const shortage = toFiniteNumber(englishMatch[1])
    available =
      role !== null ? toFiniteNumber(options.availableCountByRole?.[role] ?? null) : null
    if (shortage !== null && available !== null) {
      required = available + shortage
    }
  }

  const japaneseMatch = message.match(JAPANESE_NEED_MORE_PATTERN)
  if (japaneseMatch) {
    role = normalizeRoleToken(japaneseMatch[1])
    required = toFiniteNumber(japaneseMatch[2])
    available = toFiniteNumber(japaneseMatch[3])
  }

  if (!role) {
    const nameMatch = String(options.errorName ?? '').trim().match(NEED_MORE_NAME_PATTERN)
    role = normalizeRoleToken(nameMatch?.[1])
  }

  if (!role) return null
  if (required === null) {
    required = toFiniteNumber(options.requiredCountByRole?.[role] ?? null)
  }
  if (available === null) {
    available = toFiniteNumber(options.availableCountByRole?.[role] ?? null)
  }
  if (required === null || available === null) return null

  return formatAvailabilityMessage(role, required, available, locale)
}
