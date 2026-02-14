import type { Request, RequestHandler } from 'express'
import { Types } from 'mongoose'
import { TournamentModel } from '../models/tournament.js'
import { getTournamentAccessConfig } from '../services/tournament-access.service.js'

type Role = 'superuser' | 'organizer' | 'adjudicator' | 'speaker' | 'audience'

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

function hasTournamentMembership(req: Request, tournamentId: string): boolean {
  const tournaments = (req.session?.tournaments ?? []).map((id) => String(id))
  return tournaments.includes(String(tournamentId))
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
  if (!req.session?.userId) return false

  const tournament = await TournamentModel.findById(tournamentId).lean().exec()
  if (!tournament) return false

  const role = req.session.usertype
  if (role === 'superuser') return true

  const isCreator =
    role === 'organizer' && String(tournament.createdBy) === String(req.session.userId)
  if (role === 'organizer' && (hasTournamentMembership(req, tournamentId) || isCreator)) {
    return true
  }
  return false
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

      if (!req.session?.userId) {
        respondUnauthorized(res)
        return
      }

      const role = req.session.usertype
      if (role === 'superuser') {
        next()
        return
      }

      const isCreator = role === 'organizer' && String(tournament.createdBy) === String(req.session.userId)

      if (role === 'organizer' && (hasTournamentMembership(req, tournamentId) || isCreator)) {
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

      const role = req.session?.usertype
      if (role === 'superuser') {
        next()
        return
      }

      const isCreator = role === 'organizer' && String(tournament.createdBy) === String(req.session.userId)

      if (role === 'organizer' && (hasTournamentMembership(req, tournamentId) || isCreator)) {
        next()
        return
      }

      if (role && sessionRoles.includes(role) && hasTournamentMembership(req, tournamentId)) {
        next()
        return
      }

      if (hasSessionTournamentAccess(req, tournamentId, (tournament as any).auth)) {
        next()
        return
      }

      const authConfig = (tournament as any).auth ?? {}
      const isPublic = publicRoles.some((publicRole) => authConfig?.[publicRole]?.required !== true)
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
