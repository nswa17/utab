export type RoundOperationStatus = 'preparing' | 'collecting' | 'compiled' | 'generated' | 'finalized'

export function resolveRoundOperationStatus(input: {
  hasSubmissions: boolean
  hasCompiled: boolean
  hasDraw: boolean
  isPublished: boolean
}): RoundOperationStatus {
  if (input.isPublished) return 'finalized'
  if (input.hasDraw) return 'generated'
  if (input.hasCompiled) return 'compiled'
  if (input.hasSubmissions) return 'collecting'
  return 'preparing'
}

export function countSubmissionActors<T>(
  list: T[],
  keyResolver: (item: T) => string
): number {
  const actorKeys = new Set<string>()
  list.forEach((item) => {
    const key = keyResolver(item).trim()
    if (!key) return
    actorKeys.add(key)
  })
  return actorKeys.size
}
