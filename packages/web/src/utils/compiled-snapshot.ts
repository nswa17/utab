export type CompiledSnapshotOption = {
  compiledId: string
  rounds: number[]
  createdAt?: string
  snapshotName?: string
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime())
}

export function formatCompiledSnapshotTimestamp(value?: string, locale = 'ja-JP'): string {
  if (!value) return '--/-- --:--'
  const date = new Date(value)
  if (!isValidDate(date)) return '--/-- --:--'
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function normalizeRounds(rounds: number[]): number[] {
  return Array.from(
    new Set(
      rounds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1)
    )
  ).sort((left, right) => left - right)
}

function sortByRecency(options: CompiledSnapshotOption[]): CompiledSnapshotOption[] {
  return options
    .map((option, index) => ({
      ...option,
      index,
      timestamp: option.createdAt ? new Date(option.createdAt).getTime() : Number.NaN,
    }))
    .sort((left, right) => {
      const leftValid = Number.isFinite(left.timestamp)
      const rightValid = Number.isFinite(right.timestamp)
      if (leftValid && rightValid && left.timestamp !== right.timestamp) {
        return right.timestamp - left.timestamp
      }
      if (leftValid !== rightValid) return leftValid ? -1 : 1
      return left.index - right.index
    })
    .map(({ timestamp: _timestamp, index: _index, ...option }) => option)
}

export function formatCompiledSnapshotOptionLabel(
  option: Pick<CompiledSnapshotOption, 'rounds' | 'createdAt' | 'snapshotName'>,
  locale = 'ja-JP'
): string {
  const snapshotName = String(option.snapshotName ?? '').trim()
  if (snapshotName.length > 0) {
    const timestamp = formatCompiledSnapshotTimestamp(option.createdAt, locale)
    return `${snapshotName} (${timestamp})`
  }
  const rounds = normalizeRounds(option.rounds)
  const roundsText =
    rounds.length > 0 ? rounds.map((roundNumber) => `Round ${roundNumber}`).join(', ') : 'All Rounds'
  const timestamp = formatCompiledSnapshotTimestamp(option.createdAt, locale)
  return `${roundsText} (${timestamp})`
}

export function resolveLatestCompiledIdContainingRound(
  options: CompiledSnapshotOption[],
  targetRound?: number | null
): string {
  if (options.length === 0) return ''
  const sorted = sortByRecency(options)
  const normalizedTarget = Number(targetRound)
  if (Number.isInteger(normalizedTarget) && normalizedTarget >= 1) {
    const matched = sorted.find((option) => normalizeRounds(option.rounds).includes(normalizedTarget))
    if (matched) return matched.compiledId
  }
  return sorted[0]?.compiledId ?? ''
}

export function resolvePreviousCompiledId(
  options: CompiledSnapshotOption[],
  currentCompiledId?: string
): string {
  if (options.length === 0) return ''
  const sorted = sortByRecency(options)
  const currentId = String(currentCompiledId ?? '').trim()
  if (!currentId) return sorted[1]?.compiledId ?? ''
  const currentIndex = sorted.findIndex((option) => option.compiledId === currentId)
  if (currentIndex < 0) return sorted[1]?.compiledId ?? ''
  return sorted[currentIndex + 1]?.compiledId ?? ''
}
