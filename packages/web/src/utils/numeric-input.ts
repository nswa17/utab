/**
 * Vue casts values bound to `<input type="number">` to numbers at runtime.
 * Keep editor code tolerant of that conversion while preserving blank values.
 */
export function numericInputText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  return String(value).trim()
}
