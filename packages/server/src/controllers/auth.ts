import type { RequestHandler } from 'express'
import { hashPassword, verifyPassword } from '../services/hash.service.js'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { UserModel } from '../models/user.js'

type RegisterRole = 'organizer' | 'adjudicator' | 'speaker' | 'audience'
type MemberRole = RegisterRole

function toMemberRole(role: string): MemberRole | null {
  if (role === 'organizer' || role === 'adjudicator' || role === 'speaker' || role === 'audience') {
    return role
  }
  return null
}

async function ensureLegacyMemberships(user: {
  _id: unknown
  role: string
  tournaments?: string[]
}): Promise<void> {
  const role = toMemberRole(user.role)
  if (!role) return

  const tournamentIds = (user.tournaments ?? []).map((id) => String(id))
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

async function loadTournamentIds(userId: string): Promise<string[]> {
  const memberships = await TournamentMemberModel.find({ userId })
    .select({ tournamentId: 1, _id: 0 })
    .lean()
    .exec()
  return memberships.map((membership) => String(membership.tournamentId))
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

    await ensureLegacyMemberships(user)
    req.session.userId = user._id.toString()
    req.session.usertype = user.role
    const tournamentIds = await loadTournamentIds(req.session.userId)
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
    await ensureLegacyMemberships(user)
    const tournamentIds = await loadTournamentIds(req.session.userId)
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
