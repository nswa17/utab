import type { RequestHandler } from 'express'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { UserModel } from '../models/user.js'
import { getAdjudicatorModel } from '../models/adjudicator.js'
import { getSpeakerModel } from '../models/speaker.js'
import { getTeamModel } from '../models/team.js'
import { hashPassword } from '../services/hash.service.js'
import { badRequest, isValidObjectId, notFound } from './shared/http-errors.js'

function sanitizeTournamentUserResponse(user: {
  _id: unknown
  username?: string
  role?: string
  tournaments?: unknown[]
}, membershipRole?: string, entityBinding?: { entityType?: string; entityId?: string }) {
  return {
    userId: String(user._id),
    username: user.username,
    role: membershipRole ?? user.role,
    tournaments: Array.isArray(user.tournaments) ? user.tournaments.map((id) => String(id)) : [],
    entityType: entityBinding?.entityType,
    entityId: entityBinding?.entityId,
  }
}

async function validateParticipantEntityBinding(
  tournamentId: string,
  role: 'organizer' | 'adjudicator' | 'speaker' | 'audience',
  entityType?: 'team' | 'speaker' | 'adjudicator',
  entityId?: string
): Promise<{ entityType?: 'team' | 'speaker' | 'adjudicator'; entityId?: string } | null> {
  if (!entityType && !entityId) return {}
  if (!entityType || !entityId || !isValidObjectId(entityId)) return null

  const { getTournamentConnection } = await import('../services/tournament-db.service.js')
  const connection = await getTournamentConnection(tournamentId)
  if (role === 'adjudicator') {
    if (entityType !== 'adjudicator') return null
    const exists = await getAdjudicatorModel(connection).exists({ _id: entityId, tournamentId }).exec()
    return exists ? { entityType, entityId } : null
  }
  if (role === 'speaker') {
    if (entityType === 'speaker') {
      const exists = await getSpeakerModel(connection).exists({ _id: entityId, tournamentId }).exec()
      return exists ? { entityType, entityId } : null
    }
    if (entityType === 'team') {
      const exists = await getTeamModel(connection).exists({ _id: entityId, tournamentId }).exec()
      return exists ? { entityType, entityId } : null
    }
    return null
  }
  return null
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
    const { username, password, role, entityType, entityId } = req.body as {
      username: string
      password: string
      role: 'organizer' | 'adjudicator' | 'speaker' | 'audience'
      entityType?: 'team' | 'speaker' | 'adjudicator'
      entityId?: string
    }

    if (!isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }

    const entityBinding = await validateParticipantEntityBinding(
      tournamentId,
      role,
      entityType,
      entityId
    )
    if (entityBinding === null) {
      badRequest(res, 'Invalid participant entity binding')
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
          ...entityBinding,
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
      res.status(201).json({
        data: sanitizeTournamentUserResponse(created.toJSON(), role, entityBinding),
        errors: [],
      })
      return
    }

    const originalTournaments = (existing.tournaments || []).map((t) => String(t))
    const previousMembership = await TournamentMemberModel.findOne({
      tournamentId,
      userId: String(existing._id),
    })
      .select({ role: 1, entityType: 1, entityId: 1, _id: 0 })
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
        {
          $set: {
            role,
            ...(entityBinding.entityType && entityBinding.entityId
              ? {
                  entityType: entityBinding.entityType,
                  entityId: entityBinding.entityId,
                }
              : {}),
          },
          ...(!entityBinding.entityType
            ? { $unset: { entityType: '', entityId: '' } }
            : {}),
        },
        { upsert: true }
      ).exec()
    } catch (membershipError) {
      const membershipRollback = previousMembership
        ? TournamentMemberModel.updateOne(
            { tournamentId, userId: String(existing._id) },
            {
              $set: {
                role: previousMembership.role,
                ...(previousMembership.entityType && previousMembership.entityId
                  ? {
                      entityType: previousMembership.entityType,
                      entityId: previousMembership.entityId,
                    }
                  : {}),
              },
              ...(!previousMembership.entityType
                ? { $unset: { entityType: '', entityId: '' } }
                : {}),
            },
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
    res.status(200).json({
      data: sanitizeTournamentUserResponse(saved.toJSON(), role, entityBinding),
      errors: [],
    })
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
      .select({ role: 1, entityType: 1, entityId: 1, _id: 0 })
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
            {
              $set: {
                role: membership.role,
                ...(membership.entityType && membership.entityId
                  ? { entityType: membership.entityType, entityId: membership.entityId }
                  : {}),
              },
              ...(!membership.entityType
                ? { $unset: { entityType: '', entityId: '' } }
                : {}),
            },
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
      data: sanitizeTournamentUserResponse(saved.toJSON(), membership?.role, {
        entityType: membership?.entityType ?? undefined,
        entityId: membership?.entityId ?? undefined,
      }),
      errors: [],
    })
  } catch (err) {
    next(err)
  }
}
