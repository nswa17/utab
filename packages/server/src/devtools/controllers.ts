import type { RequestHandler } from 'express'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { TournamentModel } from '../models/tournament.js'
import { UserModel } from '../models/user.js'
import { dropTournamentDatabase } from '../services/tournament-db.service.js'
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

  await Promise.all([
    UserModel.updateOne({ _id: userId }, { $addToSet: { tournaments: tournamentId } }).exec(),
    TournamentMemberModel.updateOne(
      { tournamentId, userId },
      { $setOnInsert: { role: 'organizer' } },
      { upsert: true }
    ).exec(),
  ])

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
  try {
    const tournamentId = String(req.params.tournamentId ?? '').trim()
    const actorUserId = req.session?.userId ? String(req.session.userId) : undefined
    const data = await copyTournamentWithData(tournamentId, actorUserId)
    copiedTournamentId = data.tournamentId
    await attachOrganizerMembership(req.session as any, data.tournamentId)
    res.status(201).json({ data, errors: [] })
  } catch (err) {
    if (err instanceof DevToolsServiceError) {
      respondServiceError(res, err.statusCode, err.message)
      return
    }
    if (copiedTournamentId) {
      const userId = req.session?.userId ? String(req.session.userId) : ''
      await Promise.allSettled([
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
    }
    next(err)
  }
}
