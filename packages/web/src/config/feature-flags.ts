function parseBooleanFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

export function isAdminReportsUxV3Enabled(): boolean {
  return parseBooleanFlag(import.meta.env.VITE_ADMIN_REPORTS_UX_V3, true)
}
