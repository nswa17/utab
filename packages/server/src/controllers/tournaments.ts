import { Types } from 'mongoose'
import type { Request, RequestHandler } from 'express'
import {
  getValidTournamentAccess,
  grantTournamentAccess,
  hasTournamentAdminAccess,
  revokeTournamentAccess,
} from '../middleware/auth.js'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { TournamentModel } from '../models/tournament.js'
import { UserModel } from '../models/user.js'
import { sanitizeTournamentForPublic } from '../services/response-sanitizer.js'
import { verifyPassword } from '../services/hash.service.js'
import {
  getTournamentAccessConfig,
  mergeTournamentAuth,
  sanitizeTournamentAuth,
} from '../services/tournament-access.service.js'
import { dropTournamentDatabase } from '../services/tournament-db.service.js'

type TournamentBody = {
  name: string
  style: number
  options?: unknown
  total_round_num?: number
  current_round_num?: number
  preev_weights?: number[]
  auth?: unknown
  user_defined_data?: unknown
}

function invalidTournament(res: any) {
  res
    .status(400)
    .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
}

function tournamentNotFound(res: any) {
  res
    .status(404)
    .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
}

function sanitizeTournamentDocument(tournament: Record<string, unknown>) {
  return {
    ...tournament,
    auth: sanitizeTournamentAuth((tournament as any).auth),
  }
}

async function loadOrganizerTournamentIds(req: Request): Promise<Set<string>> {
  if (req.session?.usertype !== 'organizer' || !req.session.userId) {
    return new Set()
  }
  const memberships = await TournamentMemberModel.find({
    userId: req.session.userId,
    role: 'organizer',
  })
    .select({ tournamentId: 1, _id: 0 })
    .lean()
    .exec()
  return new Set(memberships.map((membership) => String(membership.tournamentId)))
}

function sanitizeTournamentResponseData(data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return data
  }
  return sanitizeTournamentDocument(data as Record<string, unknown>)
}

function sanitizeTournamentForViewer(
  tournament: Record<string, unknown>,
  isAdmin: boolean
): Record<string, unknown> {
  return isAdmin
    ? sanitizeTournamentDocument(tournament)
    : sanitizeTournamentForPublic(tournament)
}

function canViewTournament(
  req: Request,
  tournamentId: string,
  tournament: Record<string, unknown>,
  isAdmin: boolean
): boolean {
  if (isAdmin) {
    return true
  }

  const accessConfig = getTournamentAccessConfig((tournament as any).auth)
  if (!accessConfig.required) return true

  if (!req.session?.tournamentAccess) return false

  const access = getValidTournamentAccess(req, tournamentId, accessConfig.version, { touch: true })
  return Boolean(access)
}

export const listTournaments: RequestHandler = async (req, res, next) => {
  try {
    const role = req.session?.usertype
    const organizerTournamentIds = await loadOrganizerTournamentIds(req)
    const tournaments = await TournamentModel.find().lean().exec()
    const visibleTournaments: Record<string, unknown>[] = []
    for (const tournament of tournaments) {
      const tournamentRecord = tournament as Record<string, unknown>
      const tournamentId = String((tournament as any)._id)
      const isAdmin =
        role === 'superuser' || (role === 'organizer' && organizerTournamentIds.has(tournamentId))
      if (!canViewTournament(req, tournamentId, tournamentRecord, isAdmin)) {
        continue
      }
      visibleTournaments.push(sanitizeTournamentForViewer(tournamentRecord, isAdmin))
    }
    res.json({ data: visibleTournaments, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const getTournament: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    if (!Types.ObjectId.isValid(id)) {
      invalidTournament(res)
      return
    }
    const tournament = await TournamentModel.findById(id).lean().exec()
    if (!tournament) {
      tournamentNotFound(res)
      return
    }
    const isAdmin = await hasTournamentAdminAccess(req, id)
    const sanitized = sanitizeTournamentForViewer(tournament as Record<string, unknown>, isAdmin)
    res.json({ data: sanitized, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createTournament: RequestHandler = async (req, res, next) => {
  try {
    const {
      name,
      style,
      options,
      total_round_num,
      current_round_num,
      preev_weights,
      auth,
      user_defined_data,
    } = req.body as TournamentBody

    const mergedAuth = await mergeTournamentAuth({}, auth, { isCreate: true })
    if (mergedAuth.error) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: mergedAuth.error }] })
      return
    }

    const created = await TournamentModel.create({
      name,
      style,
      options,
      total_round_num,
      current_round_num,
      preev_weights,
      auth: mergedAuth.auth,
      user_defined_data,
      createdBy: req.session?.userId,
    })
    const tournamentId = created._id.toString()
    if (req.session?.userId && req.session.usertype === 'organizer') {
      await TournamentMemberModel.updateOne(
        { tournamentId, userId: req.session.userId },
        { $set: { role: 'organizer' } },
        { upsert: true }
      ).exec()
    }
    if (req.session?.userId) {
      await UserModel.updateOne({ _id: req.session.userId }, { $addToSet: { tournaments: tournamentId } }).exec()
      const current = req.session.tournaments ?? []
      if (!current.includes(tournamentId)) {
        req.session.tournaments = [...current, tournamentId]
      }
    }
    res.status(201).json({ data: sanitizeTournamentResponseData(created.toJSON()), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const updateTournament: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    if (!Types.ObjectId.isValid(id)) {
      invalidTournament(res)
      return
    }

    const current = await TournamentModel.findById(id).lean().exec()
    if (!current) {
      tournamentNotFound(res)
      return
    }

    const update = req.body as Record<string, unknown>
    if (Object.prototype.hasOwnProperty.call(update, 'auth')) {
      const mergedAuth = await mergeTournamentAuth((current as any).auth, update.auth)
      if (mergedAuth.error) {
        res
          .status(400)
          .json({ data: null, errors: [{ name: 'BadRequest', message: mergedAuth.error }] })
        return
      }
      update.auth = mergedAuth.auth
    }

    const updated = await TournamentModel.findOneAndUpdate({ _id: id }, { $set: update }, { new: true })
      .lean()
      .exec()
    if (!updated) {
      tournamentNotFound(res)
      return
    }
    res.json({ data: sanitizeTournamentResponseData(updated), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteTournament: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    if (!Types.ObjectId.isValid(id)) {
      invalidTournament(res)
      return
    }
    const deleted = await TournamentModel.findOneAndDelete({ _id: id }).lean().exec()
    if (!deleted) {
      tournamentNotFound(res)
      return
    }
    const deletedId = String(deleted._id)
    await TournamentMemberModel.deleteMany({ tournamentId: deletedId }).exec()
    await UserModel.updateMany({}, { $pull: { tournaments: deletedId } }).exec()
    if (req.session?.tournaments) {
      req.session.tournaments = req.session.tournaments.filter((t) => String(t) !== deletedId)
    }
    revokeTournamentAccess(req, deletedId)
    await dropTournamentDatabase(deletedId)
    res.json({ data: sanitizeTournamentResponseData(deleted), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const accessTournament: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    if (!Types.ObjectId.isValid(id)) {
      invalidTournament(res)
      return
    }

    const tournament = await TournamentModel.findById(id).lean().exec()
    if (!tournament) {
      tournamentNotFound(res)
      return
    }

    const { action, password } = req.body as {
      action?: 'enter' | 'skip'
      password?: string
    }
    const normalizedAction = action === 'skip' ? 'skip' : 'enter'

    const accessConfig = getTournamentAccessConfig((tournament as any).auth)
    const isAdmin = await hasTournamentAdminAccess(req, id)

    if (!isAdmin) {
      if (normalizedAction === 'skip' && accessConfig.required) {
        res.status(403).json({
          data: null,
          errors: [{ name: 'Forbidden', message: 'Tournament password is required' }],
        })
        return
      }

      if (normalizedAction === 'enter' && accessConfig.required) {
        if (!accessConfig.password && !accessConfig.passwordHash) {
          res.status(400).json({
            data: null,
            errors: [{ name: 'BadRequest', message: 'Tournament access password is not configured' }],
          })
          return
        }
        const inputPassword = typeof password === 'string' ? password : ''
        const verified = accessConfig.password
          ? inputPassword === accessConfig.password
          : accessConfig.passwordHash
            ? await verifyPassword(inputPassword, accessConfig.passwordHash)
            : false
        if (!verified) {
          res.status(401).json({
            data: null,
            errors: [{ name: 'Unauthorized', message: 'Invalid tournament password' }],
          })
          return
        }
      }
    }

    const granted = grantTournamentAccess(req, id, accessConfig.version)
    res.json({
      data: {
        tournamentId: id,
        required: accessConfig.required,
        version: accessConfig.version,
        grantedAt: granted.grantedAt,
        expiresAt: granted.expiresAt,
      },
      errors: [],
    })
  } catch (err) {
    next(err)
  }
}

export const exitTournamentAccess: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    if (!Types.ObjectId.isValid(id)) {
      invalidTournament(res)
      return
    }
    const tournament = await TournamentModel.findById(id).lean().exec()
    if (!tournament) {
      tournamentNotFound(res)
      return
    }
    revokeTournamentAccess(req, id)
    res.json({ data: { tournamentId: id, revoked: true }, errors: [] })
  } catch (err) {
    next(err)
  }
}
