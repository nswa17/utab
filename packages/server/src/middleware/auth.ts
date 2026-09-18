import type { Request, RequestHandler } from 'express'
import { Types } from 'mongoose'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { TournamentModel } from '../models/tournament.js'
import { getTournamentAccessConfig } from '../services/tournament-access.service.js'

type Role = 'superuser' | 'organizer' | 'adjudicator' | 'speaker' | 'audience'
type TournamentMemberRole = Exclude<Role, 'superuser'>

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

export function getAuthenticatedActorId(req: Request): string | null {
  const sessionUserId = toStringValue(req.session?.userId)
  if (sessionUserId) return sessionUserId
  return toStringValue(req.serviceAccount?.sub)
}

export function getAuthenticatedActorRole(req: Request): Role | null {
  if (req.session?.usertype) return req.session.usertype
  if (req.serviceAccount?.role) return req.serviceAccount.role
  return null
}

function isAuthenticatedRequest(req: Request): boolean {
  return getAuthenticatedActorId(req) !== null
}

function getTournamentId(req: Request, paramName = 'tournamentId'): string | null {
  const paramValue = (req.params as Record<string, unknown> | undefined)?.[paramName]
  const body = req.body as Record<string, unknown> | undefined
  const bodyValue = Array.isArray(body) ? body[0]?.tournamentId : body?.tournamentId
  const queryValue = (req.query as Record<string, unknown> | undefined)?.tournamentId
  const raw = paramValue ?? bodyValue ?? queryValue
  return toStringValue(raw)
}

async function getTournamentMembershipRole(
  req: Request,
  tournamentId: string
): Promise<TournamentMemberRole | null> {
  const normalizedTournamentId = String(tournamentId)

  const serviceTournamentIds = req.serviceAccount?.tournamentIds
  if (serviceTournamentIds) {
    const hasTournamentAccess =
      serviceTournamentIds === '*' ||
      serviceTournamentIds.map((id) => String(id)).includes(normalizedTournamentId)
    if (!hasTournamentAccess) return null

    const role = req.serviceAccount?.role
    if (role === 'organizer') {
      return role
    }
    return null
  }

  const userId = toStringValue(req.session?.userId)
  if (!userId) return null

  const membership = await TournamentMemberModel.findOne({
    tournamentId: normalizedTournamentId,
    userId,
  })
    .select({ role: 1, _id: 0 })
    .lean()
    .exec()
  const role = membership?.role
  if (role === 'organizer' || role === 'adjudicator' || role === 'speaker' || role === 'audience') {
    return role
  }
  return null
}

async function hasTournamentMembership(
  req: Request,
  tournamentId: string,
  roles?: TournamentMemberRole[]
): Promise<boolean> {
  const membershipRole = await getTournamentMembershipRole(req, tournamentId)
  if (!membershipRole) return false
  if (!roles || roles.length === 0) return true
  return roles.includes(membershipRole)
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function isTournamentPublic(auth: unknown, publicRoles: Role[]): boolean {
  const authObject = asRecord(auth)
  const accessObject = asRecord(authObject.access)
  const hasAccessShape = Object.keys(accessObject).length > 0

  if (hasAccessShape) {
    const access = getTournamentAccessConfig(authObject)
    return access.required !== true
  }

  return publicRoles.some((publicRole) => asRecord(authObject[publicRole]).required !== true)
}

function hasSessionTournamentAccess(req: Request, tournamentId: string, auth: unknown): boolean {
  const sessionAccess = req.session?.tournamentAccess?.[String(tournamentId)]
  if (!sessionAccess) return false

  const now = Date.now()
  if (sessionAccess.expiresAt <= now) {
    delete req.session?.tournamentAccess?.[String(tournamentId)]
    return false
  }

  const config = getTournamentAccessConfig(auth)
  return sessionAccess.version === config.version
}

export async function hasTournamentAdminAccess(req: Request, tournamentId: string): Promise<boolean> {
  if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) return false
  if (!isAuthenticatedRequest(req)) return false

  const tournament = await TournamentModel.findById(tournamentId).lean().exec()
  if (!tournament) return false

  const role = getAuthenticatedActorRole(req)
  if (role === 'superuser') return true

  if (await hasTournamentMembership(req, tournamentId, ['organizer'])) {
    return true
  }
  return false
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!isAuthenticatedRequest(req)) {
    respondUnauthorized(res)
    return
  }
  next()
}

export const requireOrganizer: RequestHandler = (req, res, next) => {
  if (!isAuthenticatedRequest(req)) {
    respondUnauthorized(res)
    return
  }
  const role = getAuthenticatedActorRole(req)
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

      if (!isAuthenticatedRequest(req)) {
        respondUnauthorized(res)
        return
      }

      if (getAuthenticatedActorRole(req) === 'superuser') {
        next()
        return
      }

      if (await hasTournamentMembership(req, tournamentId, ['organizer'])) {
        next()
        return
      }

      respondForbidden(res, 'Tournament admin access required')
    } catch (err) {
      next(err)
    }
  }
}

export function requireTournamentView(paramName = 'tournamentId'): RequestHandler {
  return requireTournamentRole(['audience'], {
    sessionRoles: ['audience', 'speaker', 'adjudicator'],
    paramName,
  })
}

export function requireTournamentAccess(paramName = 'tournamentId'): RequestHandler {
  return requireTournamentRole(['audience'], {
    sessionRoles: ['audience', 'speaker', 'adjudicator'],
    paramName,
  })
}

export function requireTournamentRole(
  publicRoles: Role[],
  options?: { sessionRoles?: Role[]; paramName?: string }
): RequestHandler {
  const sessionRoles = options?.sessionRoles ?? publicRoles
  const paramName = options?.paramName ?? 'tournamentId'

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
      const authConfig = (tournament as any).auth
      const isPublic = isTournamentPublic(authConfig, publicRoles)

      if (getAuthenticatedActorRole(req) === 'superuser') {
        next()
        return
      }

      const membershipRole = await getTournamentMembershipRole(req, tournamentId)

      if (membershipRole === 'organizer') {
        next()
        return
      }

      if (membershipRole && sessionRoles.includes(membershipRole) && isPublic) {
        next()
        return
      }

      if (hasSessionTournamentAccess(req, tournamentId, authConfig)) {
        next()
        return
      }

      if (isPublic) {
        next()
        return
      }

      respondUnauthorized(res, 'Login required for this tournament')
    } catch (err) {
      next(err)
    }
  }
}

export const ensureSession: RequestHandler = (_req, _res, next) => {
  // Placeholder for future session checks (e.g., refresh logic)
  next()
}
