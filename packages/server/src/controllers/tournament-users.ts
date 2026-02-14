import { Types } from 'mongoose'
import type { RequestHandler } from 'express'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { UserModel } from '../models/user.js'
import { hashPassword } from '../services/hash.service.js'

function sanitizeTournamentUserResponse(user: {
  _id: unknown
  username?: string
  role?: string
  tournaments?: unknown[]
}) {
  return {
    userId: String(user._id),
    username: user.username,
    role: user.role,
    tournaments: Array.isArray(user.tournaments) ? user.tournaments.map((id) => String(id)) : [],
  }
}

export const addTournamentUser: RequestHandler = async (req, res, next) => {
  try {
    const { id: tournamentId } = req.params
    const { username, password, role } = req.body as {
      username: string
      password: string
      role: 'organizer' | 'adjudicator' | 'speaker' | 'audience'
    }

    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const existing = await UserModel.findOne({ username }).exec()
    if (!existing) {
      const passwordHash = await hashPassword(password)
      const created = await UserModel.create({
        username,
        passwordHash,
        role,
        tournaments: [tournamentId],
      })
      await TournamentMemberModel.create({
        tournamentId,
        userId: String(created._id),
        role,
      })
      res.status(201).json({ data: sanitizeTournamentUserResponse(created.toJSON()), errors: [] })
      return
    }

    const tournaments = new Set<string>((existing.tournaments || []).map((t) => String(t)))
    tournaments.add(tournamentId)
    if (password) {
      existing.passwordHash = await hashPassword(password)
    }
    if (role) {
      existing.role = role
    }
    existing.tournaments = Array.from(tournaments)
    const saved = await existing.save()
    await TournamentMemberModel.updateOne(
      { tournamentId, userId: String(existing._id) },
      { $set: { role } },
      { upsert: true }
    ).exec()
    res.status(200).json({ data: sanitizeTournamentUserResponse(saved.toJSON()), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const removeTournamentUser: RequestHandler = async (req, res, next) => {
  try {
    const { id: tournamentId } = req.params
    const { username, userId } = req.query as { username?: string; userId?: string }

    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    if (!username && !userId) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'username or userId is required' }],
      })
      return
    }

    const query = userId ? { _id: userId } : { username }
    const user = await UserModel.findOne(query).exec()
    if (!user) {
      res.status(404).json({ data: null, errors: [{ name: 'NotFound', message: 'User not found' }] })
      return
    }

    const tournaments = (user.tournaments || []).filter((id) => String(id) !== tournamentId)
    user.tournaments = tournaments
    const saved = await user.save()
    await TournamentMemberModel.deleteOne({
      tournamentId,
      userId: String(user._id),
    }).exec()

    if (req.session?.userId && String(req.session.userId) === String(user._id)) {
      req.session.tournaments = (req.session.tournaments ?? []).filter(
        (id) => String(id) !== tournamentId
      )
    }

    res.json({ data: sanitizeTournamentUserResponse(saved.toJSON()), errors: [] })
  } catch (err) {
    next(err)
  }
}
