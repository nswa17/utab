import type { RequestHandler } from 'express'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { getResultModel } from '../models/result.js'
import { sanitizeResultForPublic } from '../services/response-sanitizer.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { badRequest, isValidObjectId, notFound } from './shared/http-errors.js'

function ensureTournamentId(
  res: Parameters<RequestHandler>[1],
  tournamentId?: string
): tournamentId is string {
  if (!tournamentId || !isValidObjectId(tournamentId)) {
    badRequest(res, 'Invalid tournament id')
    return false
  }
  return true
}

function ensureResultId(res: Parameters<RequestHandler>[1], resultId: string): boolean {
  if (!isValidObjectId(resultId)) {
    badRequest(res, 'Invalid result id')
    return false
  }
  return true
}

export const listResults: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!ensureTournamentId(res, tournamentId)) return
    const connection = await getTournamentConnection(tournamentId)
    const ResultModel = getResultModel(connection)
    const results = await ResultModel.find({ tournamentId }).lean().exec()
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    res.json({ data: isAdmin ? results : results.map((result) => sanitizeResultForPublic(result)), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const getResult: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureResultId(res, id)) return
    const connection = await getTournamentConnection(tournamentId)
    const ResultModel = getResultModel(connection)
    const result = await ResultModel.findById(id).lean().exec()
    if (!result) {
      notFound(res, 'Result not found')
      return
    }
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    res.json({ data: isAdmin ? result : sanitizeResultForPublic(result), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createResult: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, payload } = req.body as {
      tournamentId: string
      round: number
      payload: unknown
    }

    if (!ensureTournamentId(res, tournamentId)) return

    const connection = await getTournamentConnection(tournamentId)
    const ResultModel = getResultModel(connection)
    const created = await ResultModel.create({
      tournamentId,
      round,
      payload,
      createdBy: req.session.userId,
    })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const updateResult: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId, round, payload } = req.body as {
      tournamentId: string
      round?: number
      payload?: unknown
    }

    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureResultId(res, id)) return

    const update: Record<string, unknown> = {}
    if (round !== undefined) update.round = round
    if (payload !== undefined) update.payload = payload

    const connection = await getTournamentConnection(tournamentId)
    const ResultModel = getResultModel(connection)
    const updated = await ResultModel.findOneAndUpdate(
      { _id: id, tournamentId },
      { $set: update },
      { new: true }
    )
      .lean()
      .exec()

    if (!updated) {
      notFound(res, 'Result not found')
      return
    }

    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteResult: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureResultId(res, id)) return

    const connection = await getTournamentConnection(tournamentId)
    const ResultModel = getResultModel(connection)
    const deleted = await ResultModel.findOneAndDelete({ _id: id, tournamentId }).lean().exec()
    if (!deleted) {
      notFound(res, 'Result not found')
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
