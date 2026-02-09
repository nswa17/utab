import type { Request, RequestHandler } from 'express'
import { AuditLogModel } from '../models/audit-log.js'
import { logger } from './logging.js'

type AuditEvent = {
  action: string
  targetType: string
  tournamentId?: string | null
  targetId?: string | null
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const RESOURCE_RULES: Array<{
  prefix: string
  targetType: string
  actions: Partial<Record<'POST' | 'PATCH' | 'DELETE', string>>
}> = [
  {
    prefix: '/api/teams',
    targetType: 'team',
    actions: { POST: 'team.create', PATCH: 'team.update', DELETE: 'team.delete' },
  },
  {
    prefix: '/api/speakers',
    targetType: 'speaker',
    actions: { POST: 'speaker.create', PATCH: 'speaker.update', DELETE: 'speaker.delete' },
  },
  {
    prefix: '/api/adjudicators',
    targetType: 'adjudicator',
    actions: { POST: 'adjudicator.create', PATCH: 'adjudicator.update', DELETE: 'adjudicator.delete' },
  },
  {
    prefix: '/api/venues',
    targetType: 'venue',
    actions: { POST: 'venue.create', PATCH: 'venue.update', DELETE: 'venue.delete' },
  },
  {
    prefix: '/api/institutions',
    targetType: 'institution',
    actions: { POST: 'institution.create', PATCH: 'institution.update', DELETE: 'institution.delete' },
  },
  {
    prefix: '/api/rounds',
    targetType: 'round',
    actions: { POST: 'round.create', PATCH: 'round.update', DELETE: 'round.delete' },
  },
  {
    prefix: '/api/results',
    targetType: 'result',
    actions: { POST: 'result.create', PATCH: 'result.update', DELETE: 'result.delete' },
  },
  {
    prefix: '/api/submissions',
    targetType: 'submission',
    actions: { POST: 'submission.create' },
  },
]

function toSingleString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? toSingleString(value[0]) : null
  }
  if (value && typeof value === 'object') {
    const candidate = value as { toHexString?: () => string; toString?: () => string }
    if (typeof candidate.toHexString === 'function') {
      return candidate.toHexString()
    }
    if (typeof candidate.toString === 'function' && candidate.toString !== Object.prototype.toString) {
      const converted = candidate.toString()
      if (converted && converted !== '[object Object]') {
        return converted
      }
    }
  }
  return null
}

function getRequestValue(req: Request, key: string): string | null {
  const params = req.params as Record<string, unknown> | undefined
  if (params && key in params) {
    const fromParams = toSingleString(params[key])
    if (fromParams) return fromParams
  }

  const query = req.query as Record<string, unknown> | undefined
  if (query && key in query) {
    const fromQuery = toSingleString(query[key])
    if (fromQuery) return fromQuery
  }

  const body = req.body as unknown
  if (Array.isArray(body)) {
    if (body.length > 0 && body[0] && typeof body[0] === 'object') {
      const fromBody = toSingleString((body[0] as Record<string, unknown>)[key])
      if (fromBody) return fromBody
    }
    return null
  }
  if (body && typeof body === 'object') {
    const fromBody = toSingleString((body as Record<string, unknown>)[key])
    if (fromBody) return fromBody
  }
  return null
}

function getResponseData(responseBody: unknown): unknown {
  if (!responseBody || typeof responseBody !== 'object' || Array.isArray(responseBody)) {
    return null
  }
  return (responseBody as Record<string, unknown>).data
}

function getResponseDataValue(responseBody: unknown, key: string): string | null {
  const data = getResponseData(responseBody)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null
  }
  return toSingleString((data as Record<string, unknown>)[key])
}

function extractTargetIdFromResponse(responseBody: unknown): string | null {
  const data = getResponseData(responseBody)
  if (!data) return null
  if (Array.isArray(data)) {
    const ids = data
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const record = item as Record<string, unknown>
        return toSingleString(record._id ?? record.id)
      })
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
    if (ids.length === 0) return null
    return ids.join(',')
  }
  if (typeof data === 'object') {
    const record = data as Record<string, unknown>
    return toSingleString(record._id ?? record.id ?? record.userId ?? record.tournamentId)
  }
  return null
}

function getHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null
  }
  return value ?? null
}

function normalizePath(path: string): string {
  if (path === '/api' || path.startsWith('/api/')) return path
  return `/api${path}`
}

function isPathWithin(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

function extractPathId(path: string, prefix: string): string | null {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = path.match(new RegExp(`^${escapedPrefix}/([^/]+)$`))
  return match ? toSingleString(match[1]) : null
}

function parseDate(value: unknown): Date | null {
  const asString = toSingleString(value)
  if (!asString) return null
  const parsed = new Date(asString)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function resolveAuditEvent(path: string, method: string, statusCode: number, responseBody: unknown): AuditEvent | null {
  if (!MUTATING_METHODS.has(method)) return null
  if (statusCode < 200 || statusCode >= 400) return null

  const tournamentActionMatch = path.match(/^\/api\/tournaments\/([^/]+)$/)
  if (method === 'POST' && path === '/api/auth/login') {
    return { action: 'auth.login', targetType: 'user' }
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    return { action: 'auth.logout', targetType: 'user' }
  }
  if (method === 'POST' && path === '/api/auth/register') {
    return { action: 'auth.register', targetType: 'user' }
  }
  if (method === 'POST' && path === '/api/tournaments') {
    return { action: 'tournament.create', targetType: 'tournament' }
  }
  if (tournamentActionMatch && method === 'PATCH') {
    const tournamentId = tournamentActionMatch[1]
    return {
      action: 'tournament.update',
      targetType: 'tournament',
      targetId: tournamentId,
      tournamentId,
    }
  }
  if (tournamentActionMatch && method === 'DELETE') {
    const tournamentId = tournamentActionMatch[1]
    return {
      action: 'tournament.delete',
      targetType: 'tournament',
      targetId: tournamentId,
      tournamentId,
    }
  }

  const tournamentAccessMatch = path.match(/^\/api\/tournaments\/([^/]+)\/access$/)
  if (tournamentAccessMatch && method === 'POST') {
    const tournamentId = tournamentAccessMatch[1]
    return {
      action: 'tournament.access.grant',
      targetType: 'tournament',
      targetId: tournamentId,
      tournamentId,
    }
  }

  const tournamentExitMatch = path.match(/^\/api\/tournaments\/([^/]+)\/exit$/)
  if (tournamentExitMatch && method === 'POST') {
    const tournamentId = tournamentExitMatch[1]
    return {
      action: 'tournament.access.revoke',
      targetType: 'tournament',
      targetId: tournamentId,
      tournamentId,
    }
  }

  if (method === 'POST' && isPathWithin(path, '/api/compiled')) {
    return { action: 'compiled.create', targetType: 'compiled' }
  }

  if (method === 'POST' && (path === '/api/draws' || path === '/api/draws/generate')) {
    if (statusCode !== 201) return null
    const createdAt = parseDate(getResponseDataValue(responseBody, 'createdAt'))
    const updatedAt = parseDate(getResponseDataValue(responseBody, 'updatedAt'))
    const isCreate =
      createdAt && updatedAt ? createdAt.getTime() === updatedAt.getTime() : path === '/api/draws/generate'
    return {
      action: isCreate ? 'draw.create' : 'draw.update',
      targetType: 'draw',
    }
  }

  if (method === 'DELETE' && isPathWithin(path, '/api/draws')) {
    return {
      action: 'draw.delete',
      targetType: 'draw',
      targetId: extractPathId(path, '/api/draws'),
    }
  }

  for (const rule of RESOURCE_RULES) {
    if (!isPathWithin(path, rule.prefix)) continue
    const action = rule.actions[method as keyof typeof rule.actions]
    if (!action) continue
    return {
      action,
      targetType: rule.targetType,
      targetId: extractPathId(path, rule.prefix),
    }
  }

  return null
}

function truncate(value: string | null, maxLength: number): string | undefined {
  if (!value) return undefined
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function resolveTournamentId(req: Request, event: AuditEvent, responseBody: unknown): string | undefined {
  const fromEvent = toSingleString(event.tournamentId)
  if (fromEvent) return truncate(fromEvent, 128)

  const fromRequest =
    getRequestValue(req, 'tournamentId') ??
    getRequestValue(req, 'id') // /tournaments/:id mutation endpoints
    getResponseDataValue(responseBody, 'tournamentId')
  if (fromRequest) return truncate(fromRequest, 128)

  if (event.targetType === 'tournament' && event.action === 'tournament.create') {
    const fromResponse = extractTargetIdFromResponse(responseBody)
    return truncate(fromResponse, 128)
  }

  return undefined
}

function resolveTargetId(
  req: Request,
  event: AuditEvent,
  responseBody: unknown,
  actorUserIdBefore: string | undefined
): string | undefined {
  const fromEvent = toSingleString(event.targetId)
  if (fromEvent) return truncate(fromEvent, 512)

  if (event.action === 'auth.logout') {
    return truncate(actorUserIdBefore ?? null, 128)
  }

  if (event.action === 'auth.login' || event.action === 'auth.register') {
    return truncate(getResponseDataValue(responseBody, 'userId'), 128)
  }

  const pathId = getRequestValue(req, 'id')
  if (pathId && !req.path.endsWith('/users')) {
    return truncate(pathId, 128)
  }

  const bulkIds = getRequestValue(req, 'ids')
  if (bulkIds) return truncate(bulkIds, 512)

  return truncate(extractTargetIdFromResponse(responseBody), 512)
}

export const auditRequestLogger: RequestHandler = (req, res, next) => {
  const actorUserIdBefore = req.session?.userId
  const actorRoleBefore = req.session?.usertype
  let responseBody: unknown

  const originalJson = res.json.bind(res)
  res.json = ((body: unknown) => {
    responseBody = body
    return originalJson(body)
  }) as typeof res.json

  res.on('finish', () => {
    const rawPath = typeof req.originalUrl === 'string' ? req.originalUrl.split('?')[0] : req.path
    const path = normalizePath(rawPath)
    const method = req.method.toUpperCase()
    const statusCode = res.statusCode
    const event = resolveAuditEvent(path, method, statusCode, responseBody)
    if (!event) return

    const actorUserId = req.session?.userId ?? actorUserIdBefore
    const actorRole = req.session?.usertype ?? actorRoleBefore
    const tournamentId = resolveTournamentId(req, event, responseBody)
    const targetId = resolveTargetId(req, event, responseBody, actorUserIdBefore)
    const ip = toSingleString(req.ip ?? req.socket.remoteAddress ?? null) ?? 'unknown'
    const userAgent = getHeaderValue(req.headers['user-agent']) ?? 'unknown'

    void AuditLogModel.create({
      tournamentId,
      action: event.action,
      actorUserId: truncate(actorUserId ?? null, 128),
      actorRole,
      targetType: event.targetType,
      targetId,
      ip: truncate(ip, 128),
      userAgent: truncate(userAgent, 512),
      metadata: {
        method,
        path,
        statusCode,
      },
    }).catch((err) => {
      logger.warn({ err, action: event.action, path }, 'failed to persist audit log')
    })
  })

  next()
}
