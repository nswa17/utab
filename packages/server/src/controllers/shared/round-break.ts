function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function isRoundBreakEnabled(roundNumber: number, userDefinedData: unknown): boolean {
  void roundNumber
  const source = asRecord(userDefinedData)
  return source.break_round === true
}

export function withRoundBreakEnabled(
  roundNumber: number,
  userDefinedData: unknown,
  enabled?: boolean
): Record<string, unknown> {
  void roundNumber
  const current = asRecord(userDefinedData)
  const resolvedEnabled =
    typeof enabled === 'boolean' ? enabled : isRoundBreakEnabled(roundNumber, current)
  const breakConfig = asRecord(current.break)
  const { enabled: _legacyEnabled, ...nextBreakConfig } = breakConfig
  void _legacyEnabled
  const next: Record<string, unknown> = {
    ...current,
    break_round: resolvedEnabled,
  }
  if (Object.prototype.hasOwnProperty.call(current, 'break')) {
    next.break = nextBreakConfig
  }
  return next
}
