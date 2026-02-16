function parseBooleanFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

export function isAdminUiV2Enabled(): boolean {
  return parseBooleanFlag(import.meta.env.VITE_ADMIN_UI_V2, true)
}

export function isLegacyAdminReadOnlyEnabled(): boolean {
  return parseBooleanFlag(import.meta.env.VITE_ADMIN_UI_LEGACY_READONLY, false)
}

export function isAdminReportsUxV3Enabled(): boolean {
  return parseBooleanFlag(import.meta.env.VITE_ADMIN_REPORTS_UX_V3, true)
}
