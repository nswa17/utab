import type { RequestHandler } from 'express'
import { Types } from 'mongoose'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { TournamentModel } from '../models/tournament.js'
import { UserModel } from '../models/user.js'
import { dropTournamentDatabase } from '../services/tournament-db.service.js'
import {
  acquireTournamentMembershipLifecycleLease,
  releaseTournamentMembershipLease,
  type TournamentMembershipLease,
} from '../services/tournament-membership-guard.service.js'
import { copyTournamentWithData } from './copy-tournament.service.js'
import { clearRoundSubmissions, fillRoundSubmissions } from './fill-round-submissions.service.js'
import { fillTournamentSetupData } from './fill-setup.service.js'
import { DevToolsServiceError, type FillRoundSubmissionsMode } from './types.js'

function respondServiceError(
  res: Parameters<RequestHandler>[1],
  statusCode: number,
  message: string
) {
  const name = statusCode >= 500 ? 'InternalError' : statusCode === 400 ? 'BadRequest' : 'Error'
  res.status(statusCode).json({
    data: null,
    errors: [{ name, message }],
  })
}

async function attachOrganizerMembership(
  session: Record<string, unknown> | undefined,
  tournamentId: string
): Promise<void> {
  const userId = String(session?.userId ?? '').trim()
  if (!userId) return

  const membershipWrites = await Promise.allSettled([
    UserModel.updateOne({ _id: userId }, { $addToSet: { tournaments: tournamentId } }).exec(),
    TournamentMemberModel.updateOne(
      { tournamentId, userId },
      { $setOnInsert: { role: 'organizer' } },
      { upsert: true }
    ).exec(),
  ])
  const membershipErrors = membershipWrites
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason)
  if (membershipErrors.length > 0) {
    throw new AggregateError(
      membershipErrors,
      `Failed to attach organizer membership for tournament ${tournamentId}`
    )
  }

  const current = Array.isArray(session?.tournaments)
    ? session?.tournaments.map((value) => String(value))
    : []
  if (!current.includes(tournamentId)) {
    ;(session as any).tournaments = [...current, tournamentId]
  }
}

export const fillSetup: RequestHandler = async (req, res, next) => {
  try {
    const tournamentId = String(req.params.tournamentId ?? '').trim()
    const data = await fillTournamentSetupData(tournamentId, req.body as any)
    res.json({ data, errors: [] })
  } catch (err) {
    if (err instanceof DevToolsServiceError) {
      respondServiceError(res, err.statusCode, err.message)
      return
    }
    next(err)
  }
}

export const fillRoundSubmissionsForRound: RequestHandler = async (req, res, next) => {
  try {
    const tournamentId = String(req.params.tournamentId ?? '').trim()
    const round = Number((req.body as any)?.round)
    const mode = ((req.body as any)?.mode ?? 'all') as FillRoundSubmissionsMode
    const actorUserId = req.session?.userId ? String(req.session.userId) : undefined
    const data = await fillRoundSubmissions(tournamentId, round, actorUserId, mode)
    res.json({ data, errors: [] })
  } catch (err) {
    if (err instanceof DevToolsServiceError) {
      respondServiceError(res, err.statusCode, err.message)
      return
    }
    next(err)
  }
}

export const clearRoundSubmissionsForRound: RequestHandler = async (req, res, next) => {
  try {
    const tournamentId = String(req.params.tournamentId ?? '').trim()
    const round = Number((req.body as any)?.round)
    const data = await clearRoundSubmissions(tournamentId, round)
    res.json({ data, errors: [] })
  } catch (err) {
    if (err instanceof DevToolsServiceError) {
      respondServiceError(res, err.statusCode, err.message)
      return
    }
    next(err)
  }
}

export const copyTournament: RequestHandler = async (req, res, next) => {
  let copiedTournamentId = ''
  let membershipLifecycleLease: TournamentMembershipLease | null = null
  try {
    const tournamentId = String(req.params.tournamentId ?? '').trim()
    const actorUserId = req.session?.userId ? String(req.session.userId) : undefined
    const targetTournamentId = new Types.ObjectId().toHexString()
    membershipLifecycleLease = await acquireTournamentMembershipLifecycleLease(targetTournamentId)
    if (!membershipLifecycleLease) {
      res.status(409).json({
        data: null,
        errors: [{ name: 'Conflict', message: 'Tournament lifecycle is busy; retry copy' }],
      })
      return
    }

    const data = await copyTournamentWithData(tournamentId, actorUserId, targetTournamentId)
    copiedTournamentId = data.tournamentId
    await attachOrganizerMembership(req.session as any, data.tournamentId)

    const released = await releaseTournamentMembershipLease(membershipLifecycleLease)
    membershipLifecycleLease = null
    if (!released) {
      throw new Error('Failed to release tournament membership lifecycle lease after copy')
    }

    res.status(201).json({ data, errors: [] })
  } catch (err) {
    if (err instanceof DevToolsServiceError) {
      respondServiceError(res, err.statusCode, err.message)
      return
    }
    if (copiedTournamentId) {
      const userId = req.session?.userId ? String(req.session.userId) : ''
      const cleanupResults = await Promise.allSettled([
        TournamentModel.deleteOne({ _id: copiedTournamentId }).exec(),
        TournamentMemberModel.deleteMany({ tournamentId: copiedTournamentId }).exec(),
        userId
          ? UserModel.updateMany(
              { _id: userId },
              { $pull: { tournaments: copiedTournamentId } }
            ).exec()
          : Promise.resolve(),
        dropTournamentDatabase(copiedTournamentId),
      ])
      const cleanupErrors = cleanupResults
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason)
      if (cleanupErrors.length > 0) {
        next(
          new AggregateError(
            [err, ...cleanupErrors],
            `Failed to roll back copied tournament ${copiedTournamentId}`
          )
        )
        return
      }
    }
    next(err)
  } finally {
    if (membershipLifecycleLease) {
      await releaseTournamentMembershipLease(membershipLifecycleLease)
    }
  }
}
