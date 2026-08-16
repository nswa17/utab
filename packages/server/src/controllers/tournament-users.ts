import type { RequestHandler } from 'express'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { UserModel } from '../models/user.js'
import { hashPassword } from '../services/hash.service.js'
import { badRequest, isValidObjectId, notFound } from './shared/http-errors.js'

function sanitizeTournamentUserResponse(user: {
  _id: unknown
  username?: string
  role?: string
  tournaments?: unknown[]
}, membershipRole?: string) {
  return {
    userId: String(user._id),
    username: user.username,
    role: membershipRole ?? user.role,
    tournaments: Array.isArray(user.tournaments) ? user.tournaments.map((id) => String(id)) : [],
  }
}

async function throwAfterRollback(
  originalError: unknown,
  rollbackTasks: Promise<unknown>[],
  message: string
): Promise<never> {
  const rollbackResults = await Promise.allSettled(rollbackTasks)
  const rollbackErrors = rollbackResults
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason)
  if (rollbackErrors.length > 0) {
    throw new AggregateError([originalError, ...rollbackErrors], message)
  }
  throw originalError
}

export const addTournamentUser: RequestHandler = async (req, res, next) => {
  try {
    const { id: tournamentId } = req.params
    const { username, password, role } = req.body as {
      username: string
      password: string
      role: 'organizer' | 'adjudicator' | 'speaker' | 'audience'
    }

    if (!isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
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
      try {
        await TournamentMemberModel.create({
          tournamentId,
          userId: String(created._id),
          role,
        })
      } catch (membershipError) {
        await throwAfterRollback(
          membershipError,
          [
            UserModel.deleteOne({ _id: created._id }).exec(),
            TournamentMemberModel.deleteOne({
              tournamentId,
              userId: String(created._id),
            }).exec(),
          ],
          `Failed to add and roll back tournament user ${String(created._id)}`
        )
      }
      res.status(201).json({ data: sanitizeTournamentUserResponse(created.toJSON(), role), errors: [] })
      return
    }

    const originalTournaments = (existing.tournaments || []).map((t) => String(t))
    const previousMembership = await TournamentMemberModel.findOne({
      tournamentId,
      userId: String(existing._id),
    })
      .select({ role: 1, _id: 0 })
      .lean()
      .exec()
    const tournaments = new Set<string>(originalTournaments)
    tournaments.add(tournamentId)
    existing.tournaments = Array.from(tournaments)
    let saved = existing
    try {
      saved = await existing.save()
      await TournamentMemberModel.updateOne(
        { tournamentId, userId: String(existing._id) },
        { $set: { role } },
        { upsert: true }
      ).exec()
    } catch (membershipError) {
      const membershipRollback = previousMembership
        ? TournamentMemberModel.updateOne(
            { tournamentId, userId: String(existing._id) },
            { $set: { role: previousMembership.role } },
            { upsert: true }
          ).exec()
        : TournamentMemberModel.deleteOne({
            tournamentId,
            userId: String(existing._id),
          }).exec()
      await throwAfterRollback(
        membershipError,
        [
          UserModel.updateOne(
            { _id: existing._id },
            { $set: { tournaments: originalTournaments } }
          ).exec(),
          membershipRollback,
        ],
        `Failed to add and roll back tournament user ${String(existing._id)}`
      )
    }
    res.status(200).json({ data: sanitizeTournamentUserResponse(saved.toJSON(), role), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const removeTournamentUser: RequestHandler = async (req, res, next) => {
  try {
    const { id: tournamentId } = req.params
    const { username, userId } = req.query as { username?: string; userId?: string }

    if (!isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }

    if (!username && !userId) {
      badRequest(res, 'username or userId is required')
      return
    }
    if (userId && !isValidObjectId(userId)) {
      badRequest(res, 'Invalid user id')
      return
    }

    const query = userId ? { _id: userId } : { username }
    const user = await UserModel.findOne(query).exec()
    if (!user) {
      notFound(res, 'User not found')
      return
    }

    const originalTournaments = (user.tournaments || []).map((id) => String(id))
    const membership = await TournamentMemberModel.findOne({
      tournamentId,
      userId: String(user._id),
    })
      .select({ role: 1, _id: 0 })
      .lean()
      .exec()
    const tournaments = originalTournaments.filter((id) => id !== tournamentId)
    user.tournaments = tournaments
    let saved = user
    try {
      saved = await user.save()
      await TournamentMemberModel.deleteOne({
        tournamentId,
        userId: String(user._id),
      }).exec()
    } catch (membershipError) {
      const rollbackTasks: Promise<unknown>[] = [
        UserModel.updateOne(
          { _id: user._id },
          { $set: { tournaments: originalTournaments } }
        ).exec(),
      ]
      if (membership?.role) {
        rollbackTasks.push(
          TournamentMemberModel.updateOne(
            { tournamentId, userId: String(user._id) },
            { $set: { role: membership.role } },
            { upsert: true }
          ).exec()
        )
      }
      await throwAfterRollback(
        membershipError,
        rollbackTasks,
        `Failed to remove and roll back tournament user ${String(user._id)}`
      )
    }

    if (req.session?.userId && String(req.session.userId) === String(user._id)) {
      req.session.tournaments = (req.session.tournaments ?? []).filter(
        (id) => String(id) !== tournamentId
      )
    }

    res.json({
      data: sanitizeTournamentUserResponse(saved.toJSON(), membership?.role),
      errors: [],
    })
  } catch (err) {
    next(err)
  }
}
