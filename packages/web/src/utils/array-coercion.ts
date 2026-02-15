export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item)).filter(Boolean)
}

export function toBooleanArray(value: unknown): boolean[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => Boolean(item))
}
