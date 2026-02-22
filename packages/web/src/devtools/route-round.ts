export type RouteRoundInput = {
  path: string
  query?: Record<string, unknown>
  fallback?: unknown
}

function parseRoundValue(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === undefined || value === null) return null
  const parsed = Number(String(value).trim())
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return parsed
}

function resolveRoundFromPath(path: string): number | null {
  const matched = path.match(/\/rounds\/(\d+)(?:\/|$)/)
  if (!matched) return null
  return parseRoundValue(matched[1])
}

export function resolvePreferredRound(input: RouteRoundInput): number | null {
  const fromQuery = parseRoundValue(input.query?.round)
  if (fromQuery !== null) return fromQuery

  const fromPath = resolveRoundFromPath(input.path)
  if (fromPath !== null) return fromPath

  return parseRoundValue(input.fallback)
}
