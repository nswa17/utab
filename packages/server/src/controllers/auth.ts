import type { RequestHandler } from 'express'
import { Types } from 'mongoose'
import { hashPassword, verifyPassword } from '../services/hash.service.js'
import { serviceAccountAuthSettings } from '../config/environment.js'
import { getAuthenticatedActorId } from '../middleware/auth.js'
import { ServiceTokenRevocationModel } from '../models/service-token-revocation.js'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { TournamentModel } from '../models/tournament.js'
import { UserModel } from '../models/user.js'

type RegisterRole = 'organizer' | 'adjudicator' | 'speaker' | 'audience'
type MemberRole = RegisterRole

function toMemberRole(role: string): MemberRole | null {
  if (role === 'organizer' || role === 'adjudicator' || role === 'speaker' || role === 'audience') {
    return role
  }
  return null
}

function normalizeTournamentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids = value
    .map((id) => String(id).trim())
    .filter((id) => id.length > 0)
  return Array.from(new Set(ids))
}

function uniqueIds(ids: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(ids).map((id) => String(id).trim()).filter((id) => id.length > 0)))
}

async function ensureLegacyMemberships(user: {
  _id: unknown
  role: string
  tournaments?: unknown[]
}): Promise<void> {
  const role = toMemberRole(user.role)
  if (!role) return

  const tournamentIds = normalizeTournamentIds(user.tournaments)
  if (tournamentIds.length === 0) return

  await Promise.all(
    tournamentIds.map((tournamentId) =>
      TournamentMemberModel.updateOne(
        { tournamentId, userId: String(user._id) },
        { $setOnInsert: { role } },
        { upsert: true }
      ).exec()
    )
  )
}

async function ensureCreatorMemberships(user: { _id: unknown; role: string }): Promise<void> {
  if (user.role !== 'organizer' && user.role !== 'superuser') return

  const userId = String(user._id).trim()
  if (!userId) return

  const createdByConditions: Array<string | Types.ObjectId> = [userId]
  if (Types.ObjectId.isValid(userId)) {
    createdByConditions.push(new Types.ObjectId(userId))
  }

  const createdTournaments = await TournamentModel.find({
    createdBy: { $in: createdByConditions },
  })
    .select({ _id: 1 })
    .lean()
    .exec()

  if (createdTournaments.length === 0) return

  await Promise.all(
    createdTournaments.map((tournament) =>
      TournamentMemberModel.updateOne(
        { tournamentId: String(tournament._id), userId },
        { $setOnInsert: { role: 'organizer' } },
        { upsert: true }
      ).exec()
    )
  )
}

async function loadTournamentIds(userId: string, legacyTournamentIds: string[] = []): Promise<string[]> {
  const memberships = await TournamentMemberModel.find({ userId })
    .select({ tournamentId: 1, _id: 0 })
    .lean()
    .exec()
  const membershipTournamentIds = memberships.map((membership) => String(membership.tournamentId))
  return uniqueIds([...legacyTournamentIds, ...membershipTournamentIds])
}

async function persistSession(req: Parameters<RequestHandler>[0]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
}

export const login: RequestHandler = async (req, res, next) => {
  try {
    const { username, password } = req.body as { username: string; password: string }
    const user = await UserModel.findOne({ username }).lean().exec()

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res
        .status(401)
        .json({ data: null, errors: [{ name: 'Unauthorized', message: 'Invalid credentials' }] })
      return
    }

    await Promise.all([ensureLegacyMemberships(user), ensureCreatorMemberships(user)])
    req.session.userId = user._id.toString()
    req.session.usertype = user.role
    const legacyTournamentIds = normalizeTournamentIds(user.tournaments)
    const tournamentIds = await loadTournamentIds(req.session.userId, legacyTournamentIds)
    req.session.tournaments = tournamentIds
    await persistSession(req)

    res.json({
      data: {
        userId: user._id,
        username: user.username,
        role: user.role,
        tournaments: tournamentIds,
      },
      errors: [],
    })
  } catch (err) {
    next(err)
  }
}

export const register: RequestHandler = async (req, res, next) => {
  try {
    const { username, password, role } = req.body as {
      username: string
      password: string
      role: RegisterRole | 'superuser'
    }
    if (role === 'superuser') {
      res.status(403).json({
        data: null,
        errors: [{ name: 'Forbidden', message: 'Superuser registration is disabled' }],
      })
      return
    }
    const passwordHash = await hashPassword(password)
    const user = await UserModel.create({ username, passwordHash, role, tournaments: [] })
    res
      .status(201)
      .json({ data: { userId: user._id, username: user.username, role: user.role }, errors: [] })
  } catch (err: any) {
    if (err?.code === 11000) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: 'Username already exists' }] })
      return
    }
    next(err)
  }
}

export const me: RequestHandler = async (req, res, next) => {
  try {
    if (!req.session.userId) {
      res
        .status(401)
        .json({ data: null, errors: [{ name: 'Unauthorized', message: 'Please login first' }] })
      return
    }
    const user = await UserModel.findById(req.session.userId).lean().exec()
    if (!user) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'User not found' }] })
      return
    }
    await Promise.all([ensureLegacyMemberships(user), ensureCreatorMemberships(user)])
    const legacyTournamentIds = normalizeTournamentIds(user.tournaments)
    const tournamentIds = await loadTournamentIds(req.session.userId, legacyTournamentIds)
    req.session.tournaments = tournamentIds
    res.json({
      data: {
        userId: user._id,
        username: user.username,
        role: user.role,
        tournaments: tournamentIds,
      },
      errors: [],
    })
  } catch (err) {
    next(err)
  }
}

export const logout: RequestHandler = (req, res, next) => {
  const respondSuccess = () => {
    res.clearCookie('connect.sid')
    res.json({ data: { success: true }, errors: [] })
  }

  if (!req.session) {
    respondSuccess()
    return
  }

  req.session.destroy((err) => {
    if (err) {
      next(err)
      return
    }
    respondSuccess()
  })
}

function parseOptionalIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export const revokeServiceToken: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = getAuthenticatedActorId(req)
    const { jti, reason, expiresAt } = req.body as {
      jti: string
      reason?: string
      expiresAt?: string
    }

    const normalizedReason = typeof reason === 'string' ? reason.trim() : ''
    const explicitExpireAt = parseOptionalIsoDate(expiresAt)
    if (expiresAt !== undefined && !explicitExpireAt) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'Invalid expiresAt' }],
      })
      return
    }

    const expireAt = explicitExpireAt ?? new Date(Date.now() + serviceAccountAuthSettings.revocationTtlMs)
    if (expireAt.getTime() <= Date.now()) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'expiresAt must be in the future' }],
      })
      return
    }

    const existing = await ServiceTokenRevocationModel.findOne({ jti }).lean().exec()
    if (existing) {
      res.json({ data: existing, errors: [] })
      return
    }

    const created = await ServiceTokenRevocationModel.create({
      jti,
      reason: normalizedReason.length > 0 ? normalizedReason : undefined,
      revokedBy: actorUserId ?? undefined,
      revokedAt: new Date(),
      expireAt,
    })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const listServiceTokenRevocations: RequestHandler = async (req, res, next) => {
  try {
    const { limit, active } = req.query as { limit?: number; active?: 'true' | 'false' }
    const normalizedLimit =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.min(Math.max(limit, 1), 200)
        : 50

    const filter: Record<string, unknown> = {}
    const now = new Date()
    if (active === 'true') {
      filter.expireAt = { $gt: now }
    } else if (active === 'false') {
      filter.expireAt = { $lte: now }
    }
    const items = await ServiceTokenRevocationModel.find(filter)
      .sort({ revokedAt: -1, _id: -1 })
      .limit(normalizedLimit)
      .lean()
      .exec()
    res.json({ data: { items, limit: normalizedLimit }, errors: [] })
  } catch (err) {
    next(err)
  }
}
