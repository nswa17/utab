import type { RequestHandler } from 'express'
import { badRequest, isValidObjectId, notFound } from './shared/http-errors.js'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { getAdjudicatorModel } from '../models/adjudicator.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { isDuplicateKeyError } from '../services/mongo-error.service.js'
import { sanitizeAdjudicatorForPublic } from '../services/response-sanitizer.js'

export const listAdjudicators: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const AdjudicatorModel = getAdjudicatorModel(connection)
    const adjudicators = await AdjudicatorModel.find({ tournamentId }).lean().exec()
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    res.json({
      data: isAdmin
        ? adjudicators
        : adjudicators.map((adjudicator) => sanitizeAdjudicatorForPublic(adjudicator)),
      errors: [],
    })
  } catch (err) {
    next(err)
  }
}

export const getAdjudicator: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }
    if (!isValidObjectId(id)) {
      badRequest(res, 'Invalid adjudicator id')
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const AdjudicatorModel = getAdjudicatorModel(connection)
    const adjudicator = await AdjudicatorModel.findById(id).lean().exec()
    if (!adjudicator) {
      notFound(res, 'Adjudicator not found')
      return
    }
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    res.json({ data: isAdmin ? adjudicator : sanitizeAdjudicatorForPublic(adjudicator), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createAdjudicator: RequestHandler = async (req, res, next) => {
  try {
    if (Array.isArray(req.body)) {
      const payload = req.body as Array<{
        tournamentId: string
        name: string
        strength: number
        active?: boolean
        preev?: number
        details?: unknown
        userDefinedData?: unknown
      }>
      if (payload.length === 0) {
        badRequest(res, 'Empty payload')
        return
      }
      const tournamentId = payload[0].tournamentId
      if (!tournamentId || !isValidObjectId(tournamentId)) {
        badRequest(res, 'Invalid tournament id')
        return
      }
      if (!payload.every((item) => item.tournamentId === tournamentId)) {
        badRequest(res, 'Mixed tournament ids are not supported')
        return
      }
      const connection = await getTournamentConnection(tournamentId)
      const AdjudicatorModel = getAdjudicatorModel(connection)
      const created = await AdjudicatorModel.insertMany(payload, { ordered: false })
      res.status(201).json({ data: created, errors: [] })
      return
    }

    const { tournamentId, name, strength, active, preev, details, userDefinedData } = req.body as {
      tournamentId: string
      name: string
      strength: number
      active?: boolean
      preev?: number
      details?: unknown
      userDefinedData?: unknown
    }

    if (!isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const AdjudicatorModel = getAdjudicatorModel(connection)
    const created = await AdjudicatorModel.create({
      tournamentId,
      name,
      strength,
      active,
      preev,
      details,
      userDefinedData,
    })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: 'Adjudicator already exists' }] })
      return
    }
    next(err)
  }
}

export const bulkUpdateAdjudicators: RequestHandler = async (req, res, next) => {
  try {
    if (!Array.isArray(req.body) || req.body.length === 0) {
      badRequest(res, 'Empty payload')
      return
    }
    const payload = req.body as Array<{
      id: string
      tournamentId: string
      name?: string
      strength?: number
      active?: boolean
      preev?: number
      details?: unknown
      userDefinedData?: unknown
    }>
    const tournamentId = payload[0].tournamentId
    if (!tournamentId || !isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }
    if (!payload.every((item) => item.tournamentId === tournamentId)) {
      badRequest(res, 'Mixed tournament ids are not supported')
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const AdjudicatorModel = getAdjudicatorModel(connection)
    const ops = payload.map((item) => {
      const update: Record<string, unknown> = {}
      if (item.name !== undefined) update.name = item.name
      if (item.strength !== undefined) update.strength = item.strength
      if (item.active !== undefined) update.active = item.active
      if (item.preev !== undefined) update.preev = item.preev
      if (item.details !== undefined) update.details = item.details
      if (item.userDefinedData !== undefined) update.userDefinedData = item.userDefinedData
      return {
        updateOne: {
          filter: { _id: item.id, tournamentId },
          update: { $set: update },
        },
      }
    })
    await AdjudicatorModel.bulkWrite(ops, { ordered: false })
    const ids = payload.map((item) => item.id)
    const updated = await AdjudicatorModel.find({ _id: { $in: ids }, tournamentId }).lean().exec()
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const bulkDeleteAdjudicators: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, ids } = req.query as { tournamentId?: string; ids?: string }
    if (!tournamentId || !isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }
    const idList =
      typeof ids === 'string' && ids.length > 0 ? ids.split(',').filter((id) => id.length > 0) : []
    const filter: Record<string, unknown> = { tournamentId }
    if (idList.length > 0) {
      filter._id = { $in: idList }
    }
    const connection = await getTournamentConnection(tournamentId)
    const AdjudicatorModel = getAdjudicatorModel(connection)
    const result = await AdjudicatorModel.deleteMany(filter).exec()
    res.json({ data: { deletedCount: result.deletedCount }, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const updateAdjudicator: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId, name, strength, active, preev, details, userDefinedData } = req.body as {
      tournamentId: string
      name?: string
      strength?: number
      active?: boolean
      preev?: number
      details?: unknown
      userDefinedData?: unknown
    }

    if (!isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }
    if (!isValidObjectId(id)) {
      badRequest(res, 'Invalid adjudicator id')
      return
    }

    const update: Record<string, unknown> = {}
    if (name !== undefined) update.name = name
    if (strength !== undefined) update.strength = strength
    if (active !== undefined) update.active = active
    if (preev !== undefined) update.preev = preev
    if (details !== undefined) update.details = details
    if (userDefinedData !== undefined) update.userDefinedData = userDefinedData

    const connection = await getTournamentConnection(tournamentId)
    const AdjudicatorModel = getAdjudicatorModel(connection)
    const updated = await AdjudicatorModel.findOneAndUpdate(
      { _id: id, tournamentId },
      { $set: update },
      { new: true }
    )
      .lean()
      .exec()
    if (!updated) {
      notFound(res, 'Adjudicator not found')
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteAdjudicator: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }
    if (!isValidObjectId(id)) {
      badRequest(res, 'Invalid adjudicator id')
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const AdjudicatorModel = getAdjudicatorModel(connection)
    const deleted = await AdjudicatorModel.findOneAndDelete({ _id: id, tournamentId }).lean().exec()
    if (!deleted) {
      notFound(res, 'Adjudicator not found')
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
