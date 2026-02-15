export function normalizeInstitutionPriorityMap(value: unknown): Record<number, number> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<number, number> = {}
  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    const parsedKey = Number(key)
    const parsedValue = Number(raw)
    if (!Number.isFinite(parsedKey)) return
    out[parsedKey] = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 1
  })
  return out
}

export function weightedCommonScore(
  left: number[],
  right: number[],
  priorityMap: Record<number, number>
): number {
  const rightSet = new Set(right)
  const common = Array.from(new Set(left.filter((value) => rightSet.has(value))))
  return common.reduce((total, id) => total + (priorityMap[id] ?? 1), 0)
}
