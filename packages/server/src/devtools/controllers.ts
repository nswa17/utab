import type { RequestHandler } from 'express'
import { fillRoundSubmissions } from './fill-round-submissions.service.js'
import { fillTournamentSetupData } from './fill-setup.service.js'
import { DevToolsServiceError } from './types.js'

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
    const actorUserId = req.session?.userId ? String(req.session.userId) : undefined
    const data = await fillRoundSubmissions(tournamentId, round, actorUserId)
    res.json({ data, errors: [] })
  } catch (err) {
    if (err instanceof DevToolsServiceError) {
      respondServiceError(res, err.statusCode, err.message)
      return
    }
    next(err)
  }
}
