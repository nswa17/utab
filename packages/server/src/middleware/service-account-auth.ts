import type { RequestHandler, Response } from 'express'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import { serviceAccountAuthSettings } from '../config/environment.js'
import { ServiceTokenRevocationModel } from '../models/service-token-revocation.js'
import type {
  ServiceAccountPrincipal,
  ServiceAccountRole,
  ServiceAccountScope,
} from '../types/service-account.js'

const ALL_SCOPES: ServiceAccountScope[] = ['read', 'create', 'upsert', 'delete']
const SCOPES = new Set<ServiceAccountScope>(ALL_SCOPES)
const ROLES = new Set<ServiceAccountRole>(['superuser', 'organizer'])
const IDEMPOTENCY_KEY_HEADER = 'x-idempotency-key'
const IDEMPOTENCY_METHODS = new Set(['POST', 'PATCH', 'DELETE'])

const REQUIRED_SCOPE_BY_METHOD: Partial<Record<string, ServiceAccountScope>> = {
  GET: 'read',
  HEAD: 'read',
  OPTIONS: 'read',
  POST: 'create',
  PATCH: 'upsert',
  PUT: 'upsert',
  DELETE: 'delete',
}

type ServiceAccountClaims = JwtPayload & {
  org_id?: unknown
  scopes?: unknown
  role?: unknown
  tournament_ids?: unknown
}

function unauthorized(res: Response, message: string) {
  res.status(401).json({ data: null, errors: [{ name: 'Unauthorized', message }] })
}

function forbidden(res: Response, message: string) {
  res.status(403).json({ data: null, errors: [{ name: 'Forbidden', message }] })
}

function badRequest(res: Response, message: string) {
  res.status(400).json({ data: null, errors: [{ name: 'BadRequest', message }] })
}

function toNonEmptyString(value: unknown): string | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    return toNonEmptyString(value[0])
  }
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeRole(value: unknown): ServiceAccountRole | null {
  const normalized = toNonEmptyString(value)?.toLowerCase()
  if (!normalized) return 'organizer'
  if (!ROLES.has(normalized as ServiceAccountRole)) return null
  return normalized as ServiceAccountRole
}

function parseScopes(value: unknown): ServiceAccountScope[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,]+/)
      : []
  const scopes = Array.from(
    new Set(
      items
        .map((item) => toNonEmptyString(item)?.toLowerCase())
        .filter((item): item is ServiceAccountScope => Boolean(item && SCOPES.has(item as ServiceAccountScope)))
    )
  )
  // Fail-safe default: tokens without an explicit scope claim are treated as read-only.
  return scopes.length > 0 ? scopes : ['read']
}

function parseTournamentIds(value: unknown): '*' | string[] {
  if (value === '*') return '*'
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  const tournamentIds = Array.from(
    new Set(
      values
        .map((item) => toNonEmptyString(item))
        .filter((item): item is string => Boolean(item))
    )
  )
  return tournamentIds
}

async function isRevokedToken(jti: string): Promise<boolean> {
  if (serviceAccountAuthSettings.revokedJtis.has(jti)) return true
  const revoked = await ServiceTokenRevocationModel.findOne({ jti }).select({ _id: 1 }).lean().exec()
  return Boolean(revoked)
}

async function verifyServiceAccountToken(token: string): Promise<ServiceAccountPrincipal | null> {
  const verificationOptions: jwt.VerifyOptions = {
    algorithms: ['HS256'],
    audience: serviceAccountAuthSettings.audience,
  }
  if (serviceAccountAuthSettings.issuer) {
    verificationOptions.issuer = serviceAccountAuthSettings.issuer
  }

  const decoded = jwt.verify(token, serviceAccountAuthSettings.secret, verificationOptions)
  if (!decoded || typeof decoded === 'string') return null

  const claims = decoded as ServiceAccountClaims
  const sub = toNonEmptyString(claims.sub)
  const orgId = toNonEmptyString(claims.org_id)
  const jti = toNonEmptyString(claims.jti)
  const role = normalizeRole(claims.role)
  const expiresAt = typeof claims.exp === 'number' ? claims.exp * 1000 : null

  if (!sub || !orgId || !jti || !role || !expiresAt) return null
  if (await isRevokedToken(jti)) return null

  return {
    kind: 'service_account',
    sub,
    role,
    orgId,
    scopes: parseScopes(claims.scopes),
    jti,
    audience: claims.aud ?? serviceAccountAuthSettings.audience,
    expiresAt,
    tournamentIds: parseTournamentIds(claims.tournament_ids),
  }
}

export const attachServiceAccountPrincipal: RequestHandler = async (req, res, next) => {
  const rawAuthHeader = req.headers.authorization
  if (!rawAuthHeader) {
    next()
    return
  }

  const authHeader = String(rawAuthHeader).trim()
  const [scheme, token, ...rest] = authHeader.split(/\s+/)
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
    unauthorized(res, 'Invalid Authorization header')
    return
  }

  try {
    const principal = await verifyServiceAccountToken(token)
    if (!principal) {
      unauthorized(res, 'Invalid service account token')
      return
    }
    req.serviceAccount = principal
    next()
  } catch {
    unauthorized(res, 'Invalid service account token')
  }
}

export const enforceServiceAccountScope: RequestHandler = (req, res, next) => {
  const principal = req.serviceAccount
  if (!principal) {
    next()
    return
  }
  const requiredScope = REQUIRED_SCOPE_BY_METHOD[req.method.toUpperCase()]
  if (!requiredScope) {
    next()
    return
  }
  if (principal.scopes.includes(requiredScope)) {
    next()
    return
  }
  forbidden(res, `Scope '${requiredScope}' is required`)
}

export const requireServiceAccountIdempotencyKey: RequestHandler = (req, res, next) => {
  if (!req.serviceAccount) {
    next()
    return
  }
  const method = req.method.toUpperCase()
  if (!IDEMPOTENCY_METHODS.has(method)) {
    next()
    return
  }
  const idempotencyKey = toNonEmptyString(req.headers[IDEMPOTENCY_KEY_HEADER])
  if (!idempotencyKey) {
    badRequest(res, 'X-Idempotency-Key header is required')
    return
  }
  if (idempotencyKey.length > 200) {
    badRequest(res, 'X-Idempotency-Key is too long')
    return
  }
  next()
}
