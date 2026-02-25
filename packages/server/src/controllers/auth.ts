import type { RequestHandler } from 'express'
import { Types } from 'mongoose'
import { hashPassword, verifyPassword } from '../services/hash.service.js'
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
  req.session.destroy((err) => {
    if (err) {
      next(err)
      return
    }
    res.json({ data: { success: true }, errors: [] })
  })
}
