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

export type InstitutionPriorityHistogram = Record<number, number>

function toValidPriority(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1
}

function uniqueCommonInstitutionIds(left: number[], right: number[]): number[] {
  const rightSet = new Set(right)
  return Array.from(new Set(left.filter((value) => rightSet.has(value))))
}

export function buildInstitutionPriorityHistogram(
  left: number[],
  right: number[],
  priorityMap: Record<number, number>
): InstitutionPriorityHistogram {
  const histogram: InstitutionPriorityHistogram = {}
  uniqueCommonInstitutionIds(left, right).forEach((institutionId) => {
    const priority = toValidPriority(priorityMap[institutionId])
    histogram[priority] = (histogram[priority] ?? 0) + 1
  })
  return histogram
}

export function mergeInstitutionPriorityHistograms(
  left: InstitutionPriorityHistogram,
  right: InstitutionPriorityHistogram
): InstitutionPriorityHistogram {
  const merged: InstitutionPriorityHistogram = { ...left }
  Object.entries(right).forEach(([priority, count]) => {
    const parsedPriority = Number(priority)
    if (!Number.isFinite(parsedPriority)) return
    merged[parsedPriority] = (merged[parsedPriority] ?? 0) + Number(count || 0)
  })
  return merged
}

export function compareInstitutionPriorityHistograms(
  left: InstitutionPriorityHistogram,
  right: InstitutionPriorityHistogram
): number {
  const priorities = Array.from(
    new Set([...Object.keys(left), ...Object.keys(right)].map((value) => Number(value)))
  )
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)

  for (const priority of priorities) {
    const leftCount = left[priority] ?? 0
    const rightCount = right[priority] ?? 0
    if (leftCount < rightCount) return -1
    if (leftCount > rightCount) return 1
  }
  return 0
}

export function weightedCommonScore(
  left: number[],
  right: number[],
  priorityMap: Record<number, number>
): number {
  return uniqueCommonInstitutionIds(left, right).reduce(
    (total, id) => total + toValidPriority(priorityMap[id]),
    0
  )
}
