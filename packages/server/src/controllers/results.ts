import { Types } from 'mongoose'
import type { RequestHandler } from 'express'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { getResultModel } from '../models/result.js'
import { sanitizeResultForPublic } from '../services/response-sanitizer.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'

export const listResults: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
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
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    if (!Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid result id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const ResultModel = getResultModel(connection)
    const result = await ResultModel.findById(id).lean().exec()
    if (!result) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Result not found' }] })
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

    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

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

    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    if (!Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid result id' }] })
      return
    }

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
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Result not found' }] })
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
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    if (!Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid result id' }] })
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const ResultModel = getResultModel(connection)
    const deleted = await ResultModel.findOneAndDelete({ _id: id, tournamentId }).lean().exec()
    if (!deleted) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Result not found' }] })
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
