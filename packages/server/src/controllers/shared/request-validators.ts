import type { RequestHandler } from 'express'
import { badRequest, isValidObjectId } from './http-errors.js'

type Response = Parameters<RequestHandler>[1]

export function ensureTournamentId(
  res: Response,
  tournamentId: unknown,
  invalidMessage = 'Invalid tournament id'
): tournamentId is string {
  if (typeof tournamentId !== 'string' || !isValidObjectId(tournamentId)) {
    badRequest(res, invalidMessage)
    return false
  }
  return true
}

export function ensureObjectId(
  res: Response,
  id: unknown,
  invalidMessage: string
): id is string {
  if (typeof id !== 'string' || !isValidObjectId(id)) {
    badRequest(res, invalidMessage)
    return false
  }
  return true
}

export function requireSingleTournamentPayload(
  res: Response,
  payload: Array<{ tournamentId?: unknown }>,
  invalidMessage = 'Invalid tournament id'
): string | null {
  const tournamentId = payload[0]?.tournamentId
  if (!ensureTournamentId(res, tournamentId, invalidMessage)) return null
  if (!payload.every((item) => item.tournamentId === tournamentId)) {
    badRequest(res, 'Mixed tournament ids are not supported')
    return null
  }
  return tournamentId
}
