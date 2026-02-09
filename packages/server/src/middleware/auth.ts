import type { Request, RequestHandler } from 'express'
import { Types } from 'mongoose'
import { TournamentModel } from '../models/tournament.js'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { getTournamentAccessConfig } from '../services/tournament-access.service.js'

type TournamentAccessSession = {
  grantedAt: number
  expiresAt: number
  version: number
}
type TournamentGuardMode = 'view' | 'access'

const TOURNAMENT_ACCESS_ABSOLUTE_MS = 24 * 60 * 60 * 1000
const TOURNAMENT_ACCESS_IDLE_MS = 2 * 60 * 60 * 1000

function respondUnauthorized(res: any, message = 'Please login first') {
  res.status(401).json({ data: null, errors: [{ name: 'Unauthorized', message }] })
}

function respondForbidden(res: any, message = 'Forbidden') {
  res.status(403).json({ data: null, errors: [{ name: 'Forbidden', message }] })
}

function respondBadRequest(res: any, message = 'Invalid tournament id') {
  res.status(400).json({ data: null, errors: [{ name: 'BadRequest', message }] })
}

function respondNotFound(res: any, message = 'Tournament not found') {
  res.status(404).json({ data: null, errors: [{ name: 'NotFound', message }] })
}

function toStringValue(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (Array.isArray(value)) {
    return value.length > 0 ? String(value[0]) : null
  }
  return String(value)
}

function getTournamentId(req: Request, paramName = 'tournamentId'): string | null {
  const paramValue = (req.params as Record<string, unknown> | undefined)?.[paramName]
  const body = req.body as Record<string, unknown> | undefined
  const bodyValue = Array.isArray(body) ? body[0]?.tournamentId : body?.tournamentId
  const queryValue = (req.query as Record<string, unknown> | undefined)?.tournamentId
  const raw = paramValue ?? bodyValue ?? queryValue
  return toStringValue(raw)
}

function getTournamentAccessStore(req: Request): Record<string, TournamentAccessSession> {
  if (!req.session.tournamentAccess) {
    req.session.tournamentAccess = {}
  }
  return req.session.tournamentAccess
}

function normalizeTournamentAccessEntry(
  value: unknown
): TournamentAccessSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const grantedAt = Number(raw.grantedAt)
  const expiresAt = Number(raw.expiresAt)
  const version = Number(raw.version)

  if (!Number.isFinite(grantedAt) || !Number.isFinite(expiresAt) || !Number.isFinite(version)) {
    return null
  }

  return {
    grantedAt,
    expiresAt,
    version,
  }
}

function calculateExpiry(grantedAt: number, now: number): number {
  return Math.min(grantedAt + TOURNAMENT_ACCESS_ABSOLUTE_MS, now + TOURNAMENT_ACCESS_IDLE_MS)
}

export function grantTournamentAccess(
  req: Request,
  tournamentId: string,
  version: number
): TournamentAccessSession {
  const store = getTournamentAccessStore(req)
  const current = normalizeTournamentAccessEntry(store[tournamentId])
  const now = Date.now()
  const grantedAt = current && current.version === version ? current.grantedAt : now
  const next: TournamentAccessSession = {
    grantedAt,
    expiresAt: calculateExpiry(grantedAt, now),
    version,
  }
  store[tournamentId] = next
  return next
}

export function revokeTournamentAccess(req: Request, tournamentId: string): void {
  const store = getTournamentAccessStore(req)
  delete store[tournamentId]
}

export function getValidTournamentAccess(
  req: Request,
  tournamentId: string,
  version: number,
  options?: { touch?: boolean }
): TournamentAccessSession | null {
  const touch = options?.touch !== false
  const store = getTournamentAccessStore(req)
  const current = normalizeTournamentAccessEntry(store[tournamentId])
  if (!current) {
    delete store[tournamentId]
    return null
  }

  const now = Date.now()
  const absoluteDeadline = current.grantedAt + TOURNAMENT_ACCESS_ABSOLUTE_MS
  const expired = now > current.expiresAt || now > absoluteDeadline || current.version !== version
  if (expired) {
    delete store[tournamentId]
    return null
  }

  if (!touch) return current

  const next: TournamentAccessSession = {
    ...current,
    expiresAt: calculateExpiry(current.grantedAt, now),
  }
  store[tournamentId] = next
  return next
}

function ensureTournamentAccess(
  req: Request,
  tournamentId: string,
  version: number,
  options: { autoGrant: boolean }
): TournamentAccessSession | null {
  const existing = getValidTournamentAccess(req, tournamentId, version, { touch: true })
  if (existing) return existing
  if (!options.autoGrant) return null
  return grantTournamentAccess(req, tournamentId, version)
}

export async function hasTournamentAdminAccess(req: Request, tournamentId: string): Promise<boolean> {
  const role = req.session?.usertype
  if (role === 'superuser') return true
  if (!req.session?.userId || role !== 'organizer') return false

  const membership = await TournamentMemberModel.findOne({
    tournamentId: String(tournamentId),
    userId: String(req.session.userId),
  })
    .select({ role: 1, _id: 0 })
    .lean()
    .exec()

  return membership?.role === 'organizer'
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session?.userId) {
    respondUnauthorized(res)
    return
  }
  next()
}

export const requireOrganizer: RequestHandler = (req, res, next) => {
  if (!req.session?.userId) {
    respondUnauthorized(res)
    return
  }
  const role = req.session.usertype
  if (role === 'superuser' || role === 'organizer') {
    next()
    return
  }
  respondForbidden(res, 'Organizer access required')
}

export function requireTournamentAdmin(paramName = 'tournamentId'): RequestHandler {
  return async (req, res, next) => {
    try {
      const tournamentId = getTournamentId(req, paramName)
      if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
        respondBadRequest(res)
        return
      }

      const tournament = await TournamentModel.findById(tournamentId).lean().exec()
      if (!tournament) {
        respondNotFound(res)
        return
      }

      if (!(await hasTournamentAdminAccess(req, tournamentId))) {
        if (!req.session?.userId) {
          respondUnauthorized(res)
          return
        }
        respondForbidden(res, 'Tournament admin access required')
        return
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}

function createTournamentGuard(
  mode: TournamentGuardMode,
  paramName = 'tournamentId'
): RequestHandler {
  return async (req, res, next) => {
    try {
      const tournamentId = getTournamentId(req, paramName)
      if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
        respondBadRequest(res)
        return
      }

      const tournament = await TournamentModel.findById(tournamentId).lean().exec()
      if (!tournament) {
        respondNotFound(res)
        return
      }

      if (await hasTournamentAdminAccess(req, tournamentId)) {
        next()
        return
      }

      const accessConfig = getTournamentAccessConfig((tournament as any).auth)
      const access = ensureTournamentAccess(req, tournamentId, accessConfig.version, {
        autoGrant: !accessConfig.required,
      })

      if (mode === 'access' && !access) {
        respondUnauthorized(res, 'Tournament access required')
        return
      }

      if (mode === 'view' && accessConfig.required && !access) {
        respondUnauthorized(res, 'Tournament access required')
        return
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}

export function requireTournamentView(paramName = 'tournamentId'): RequestHandler {
  return createTournamentGuard('view', paramName)
}

export function requireTournamentAccess(paramName = 'tournamentId'): RequestHandler {
  return createTournamentGuard('access', paramName)
}

export const ensureSession: RequestHandler = (_req, _res, next) => {
  // Placeholder for future session checks (e.g., refresh logic)
  next()
}
