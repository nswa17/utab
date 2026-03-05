import type { RequestHandler } from 'express'
import { TournamentModel } from '../models/tournament.js'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { UserModel } from '../models/user.js'
import { getAuthenticatedActorId, getAuthenticatedActorRole } from '../middleware/auth.js'
import { dropTournamentDatabase } from '../services/tournament-db.service.js'
import { verifyPassword } from '../services/hash.service.js'
import {
  getTournamentAccessConfig,
  mergeTournamentAuth,
} from '../services/tournament-access.service.js'
import { sanitizeTournamentForPublic } from '../services/response-sanitizer.js'
import { badRequest, isValidObjectId, notFound } from './shared/http-errors.js'

function hasTournamentMembership(req: any, tournamentId: string): boolean {
  const normalizedTournamentId = String(tournamentId)
  const sessionTournaments = (req.session?.tournaments ?? []).map((id: unknown) => String(id))
  if (sessionTournaments.includes(normalizedTournamentId)) return true

  const serviceTournamentIds = req.serviceAccount?.tournamentIds
  if (!serviceTournamentIds) return false
  if (serviceTournamentIds === '*') return true
  return serviceTournamentIds.map((id: unknown) => String(id)).includes(normalizedTournamentId)
}

function ensureTournamentId(res: Parameters<RequestHandler>[1], tournamentId: string): boolean {
  if (!isValidObjectId(tournamentId)) {
    badRequest(res, 'Invalid tournament id')
    return false
  }
  return true
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function normalizeId(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

async function resolveTournamentCreatorNameMap(
  tournaments: Array<Record<string, unknown>>
): Promise<Map<string, string>> {
  const creatorIds = Array.from(
    new Set(
      tournaments
        .map((tournament) => normalizeId(tournament.createdBy))
        .filter((creatorId) => creatorId.length > 0)
    )
  )
  if (creatorIds.length === 0) return new Map()

  const users = await UserModel.find({ _id: { $in: creatorIds } })
    .select({ _id: 1, username: 1 })
    .lean<Array<{ _id: unknown; username?: unknown }>>()
    .exec()

  const creatorNameMap = new Map<string, string>()
  for (const user of users) {
    const userId = normalizeId(user._id)
    const username = typeof user.username === 'string' ? user.username.trim() : ''
    if (!userId || !username) continue
    creatorNameMap.set(userId, username)
  }
  return creatorNameMap
}

function hasTournamentOrganizerAccess(req: any, tournament: any): boolean {
  const role = getAuthenticatedActorRole(req)
  if (role === 'superuser') return true

  const tournamentId = String(tournament?._id)
  return role === 'organizer' && hasTournamentMembership(req, tournamentId)
}

function canViewTournament(req: any, tournament: any): boolean {
  if (hasTournamentOrganizerAccess(req, tournament)) return true

  const userDefinedData = asRecord(tournament?.user_defined_data)
  if (userDefinedData.hidden === true) return false
  return true
}

export const listTournaments: RequestHandler = async (req, res, next) => {
  try {
    const tournaments = await TournamentModel.find().lean().exec()
    const visibleTournaments = tournaments.filter((tournament) => canViewTournament(req, tournament))
    const isSuperuser = getAuthenticatedActorRole(req) === 'superuser'
    const creatorNameMap = isSuperuser
      ? await resolveTournamentCreatorNameMap(visibleTournaments as Array<Record<string, unknown>>)
      : null

    const data = visibleTournaments.map((tournament) => {
      const payload = hasTournamentOrganizerAccess(req, tournament)
        ? tournament
        : sanitizeTournamentForPublic(tournament)
      if (!isSuperuser || !creatorNameMap) return payload
      const creatorId = normalizeId((tournament as any)?.createdBy)
      return {
        ...payload,
        createdByName: creatorId ? (creatorNameMap.get(creatorId) ?? null) : null,
      }
    })
    res.json({ data, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const getTournament: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    if (!ensureTournamentId(res, id)) return
    const tournament = await TournamentModel.findById(id).lean().exec()
    if (!tournament) {
      notFound(res, 'Tournament not found')
      return
    }
    const data = hasTournamentOrganizerAccess(req, tournament)
      ? tournament
      : sanitizeTournamentForPublic(tournament)
    res.json({ data, errors: [] })
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
    } = req.body as {
      name: string
      style: number
      options?: unknown
      total_round_num?: number
      current_round_num?: number
      preev_weights?: number[]
      auth?: unknown
      user_defined_data?: unknown
    }
    const mergedAuth = await mergeTournamentAuth(undefined, auth, { isCreate: true })
    if (mergedAuth.error) {
      res.status(400).json({ data: null, errors: [{ name: 'ValidationError', message: mergedAuth.error }] })
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
      createdBy: getAuthenticatedActorId(req),
    })
    if (req.session?.userId) {
      const tournamentId = created._id.toString()
      await Promise.all([
        UserModel.updateOne({ _id: req.session.userId }, { $addToSet: { tournaments: tournamentId } }).exec(),
        TournamentMemberModel.updateOne(
          { tournamentId, userId: req.session.userId },
          { $setOnInsert: { role: 'organizer' } },
          { upsert: true }
        ).exec(),
      ])
      const current = req.session.tournaments ?? []
      if (!current.includes(tournamentId)) {
        req.session.tournaments = [...current, tournamentId]
      }
    }
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const updateTournament: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    if (!ensureTournamentId(res, id)) return
    const update = { ...(req.body as Record<string, unknown>) }
    const existing = await TournamentModel.findById(id).lean().exec()
    if (!existing) {
      notFound(res, 'Tournament not found')
      return
    }

    if (Object.prototype.hasOwnProperty.call(update, 'auth')) {
      const mergedAuth = await mergeTournamentAuth((existing as any).auth, update.auth)
      if (mergedAuth.error) {
        res.status(400).json({ data: null, errors: [{ name: 'ValidationError', message: mergedAuth.error }] })
        return
      }
      update.auth = mergedAuth.auth
    }

    const updated = await TournamentModel.findOneAndUpdate({ _id: id }, { $set: update }, { new: true })
      .lean()
      .exec()
    if (!updated) {
      notFound(res, 'Tournament not found')
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteTournament: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    if (!ensureTournamentId(res, id)) return
    const deleted = await TournamentModel.findOneAndDelete({ _id: id }).lean().exec()
    if (!deleted) {
      notFound(res, 'Tournament not found')
      return
    }
    const deletedId = String(deleted._id)
    await Promise.all([
      UserModel.updateMany({}, { $pull: { tournaments: deletedId } }).exec(),
      TournamentMemberModel.deleteMany({ tournamentId: deletedId }).exec(),
    ])
    if (req.session?.tournaments) {
      req.session.tournaments = req.session.tournaments.filter((t) => String(t) !== deletedId)
    }
    await dropTournamentDatabase(deletedId)
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const accessTournament: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { action, password } = req.body as {
      action?: 'enter' | 'skip'
      password?: string
    }

    if (!ensureTournamentId(res, id)) return

    const tournament = await TournamentModel.findById(id).lean().exec()
    if (!tournament) {
      notFound(res, 'Tournament not found')
      return
    }

    const access = getTournamentAccessConfig((tournament as any).auth)
    const sessionAccess = req.session.tournamentAccess ?? {}

    if (!access.required || action === 'skip') {
      const grantedAt = Date.now()
      const expiresAt = grantedAt + 24 * 60 * 60 * 1000
      const entry = {
        grantedAt,
        expiresAt,
        version: access.version,
      }
      req.session.tournamentAccess = {
        ...sessionAccess,
        [id]: entry,
      }
      res.json({
        data: {
          tournamentId: id,
          granted: true,
          required: access.required,
          version: entry.version,
          expiresAt: entry.expiresAt,
        },
        errors: [],
      })
      return
    }

    if (!password || password.length === 0) {
      res.status(401).json({
        data: null,
        errors: [{ name: 'Unauthorized', message: 'Tournament access password is required' }],
      })
      return
    }

    let valid = false
    if (access.passwordHash) {
      valid = await verifyPassword(password, access.passwordHash)
    } else if (access.password) {
      valid = access.password === password
    }

    if (!valid) {
      res
        .status(401)
        .json({ data: null, errors: [{ name: 'Unauthorized', message: 'Invalid tournament password' }] })
      return
    }

    const grantedAt = Date.now()
    const expiresAt = grantedAt + 24 * 60 * 60 * 1000
    const entry = {
      grantedAt,
      expiresAt,
      version: access.version,
    }
    req.session.tournamentAccess = {
      ...sessionAccess,
      [id]: entry,
    }

    res.json({
      data: {
        tournamentId: id,
        granted: true,
        required: access.required,
        version: entry.version,
        expiresAt: entry.expiresAt,
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
    if (!ensureTournamentId(res, id)) return

    const current = req.session.tournamentAccess ?? {}
    const nextAccess = { ...current }
    delete nextAccess[id]
    req.session.tournamentAccess = nextAccess

    res.json({ data: { tournamentId: id, success: true }, errors: [] })
  } catch (err) {
    next(err)
  }
}
