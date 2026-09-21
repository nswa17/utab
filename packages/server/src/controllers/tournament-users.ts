import type { RequestHandler } from 'express'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { TournamentModel } from '../models/tournament.js'
import { UserModel } from '../models/user.js'
import { hashPassword } from '../services/hash.service.js'
import {
  acquireTournamentMembershipMutationLeases,
  releaseTournamentMembershipMutationLeases,
} from '../services/tournament-membership-guard.service.js'
import { badRequest, isValidObjectId, notFound } from './shared/http-errors.js'

function sanitizeTournamentUserResponse(
  user: {
    _id: unknown
    username?: string
    role?: string
    tournaments?: unknown[]
  },
  tournamentId: string,
  membershipRole?: string
) {
  const isMember = Array.isArray(user.tournaments)
    ? user.tournaments.some((id) => String(id) === tournamentId)
    : false
  return {
    userId: String(user._id),
    username: user.username,
    role: membershipRole ?? user.role,
    tournaments: isMember ? [tournamentId] : [],
  }
}

function sendMembershipMutationConflict(res: Parameters<RequestHandler>[1]) {
  res.status(409).json({
    data: null,
    errors: [{ name: 'Conflict', message: 'Tournament membership changed concurrently; retry' }],
  })
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

    const membershipLeases = await acquireTournamentMembershipMutationLeases(
      tournamentId,
      username
    )
    if (!membershipLeases) {
      sendMembershipMutationConflict(res)
      return
    }

    let responseStatus = 200
    let responseData: ReturnType<typeof sanitizeTournamentUserResponse>
    try {
      const tournamentExists = await TournamentModel.exists({ _id: tournamentId }).exec()
      if (!tournamentExists) {
        notFound(res, 'Tournament not found')
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
        responseStatus = 201
        responseData = sanitizeTournamentUserResponse(created.toJSON(), tournamentId, role)
      } else {
        const originalTournaments = (existing.tournaments || []).map((t) => String(t))
        const previousMembership = await TournamentMemberModel.findOne({
          tournamentId,
          userId: String(existing._id),
        })
          .select({ role: 1, _id: 0 })
          .lean()
          .exec()
        const alreadyHadTournament = originalTournaments.includes(tournamentId)
        let saved = existing
        try {
          saved =
            (await UserModel.findOneAndUpdate(
              { _id: existing._id },
              { $addToSet: { tournaments: tournamentId } },
              { new: true }
            ).exec()) ?? existing
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
              ...(alreadyHadTournament
                ? []
                : [
                    UserModel.updateOne(
                      { _id: existing._id },
                      { $pull: { tournaments: tournamentId } }
                    ).exec(),
                  ]),
              membershipRollback,
            ],
            `Failed to add and roll back tournament user ${String(existing._id)}`
          )
        }
        responseData = sanitizeTournamentUserResponse(saved.toJSON(), tournamentId, role)
      }
    } finally {
      await releaseTournamentMembershipMutationLeases(membershipLeases)
    }

    res.status(responseStatus).json({ data: responseData!, errors: [] })
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

    const membershipLeases = await acquireTournamentMembershipMutationLeases(
      tournamentId,
      String(user.username ?? '')
    )
    if (!membershipLeases) {
      sendMembershipMutationConflict(res)
      return
    }

    let saved = user
    let membership: { role?: string } | null = null
    try {
      const tournamentExists = await TournamentModel.exists({ _id: tournamentId }).exec()
      if (!tournamentExists) {
        notFound(res, 'Tournament not found')
        return
      }
      const refreshedUser = await UserModel.findOne({ _id: user._id }).exec()
      if (!refreshedUser) {
        notFound(res, 'User not found')
        return
      }
      saved = refreshedUser
      const originalTournaments = (refreshedUser.tournaments || []).map((id) => String(id))
      membership = await TournamentMemberModel.findOne({
        tournamentId,
        userId: String(refreshedUser._id),
      })
        .select({ role: 1, _id: 0 })
        .lean()
        .exec()
      const originallyHadTournament = originalTournaments.includes(tournamentId)
      try {
        saved =
          (await UserModel.findOneAndUpdate(
            { _id: refreshedUser._id },
            { $pull: { tournaments: tournamentId } },
            { new: true }
          ).exec()) ?? refreshedUser
        await TournamentMemberModel.deleteOne({
          tournamentId,
          userId: String(refreshedUser._id),
        }).exec()
      } catch (membershipError) {
        const rollbackTasks: Promise<unknown>[] = originallyHadTournament
          ? [
              UserModel.updateOne(
                { _id: refreshedUser._id },
                { $addToSet: { tournaments: tournamentId } }
              ).exec(),
            ]
          : []
        if (membership?.role) {
          rollbackTasks.push(
            TournamentMemberModel.updateOne(
              { tournamentId, userId: String(refreshedUser._id) },
              { $set: { role: membership.role } },
              { upsert: true }
            ).exec()
          )
        }
        await throwAfterRollback(
          membershipError,
          rollbackTasks,
          `Failed to remove and roll back tournament user ${String(refreshedUser._id)}`
        )
      }
    } finally {
      await releaseTournamentMembershipMutationLeases(membershipLeases)
    }

    if (req.session?.userId && String(req.session.userId) === String(user._id)) {
      req.session.tournaments = (req.session.tournaments ?? []).filter(
        (id) => String(id) !== tournamentId
      )
    }

    res.json({
      data: sanitizeTournamentUserResponse(saved.toJSON(), tournamentId, membership?.role),
      errors: [],
    })
  } catch (err) {
    next(err)
  }
}
