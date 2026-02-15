import type { RequestHandler } from 'express'
import { badRequest, isValidObjectId, notFound } from './shared/http-errors.js'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { getVenueModel } from '../models/venue.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { isDuplicateKeyError } from '../services/mongo-error.service.js'
import { sanitizeVenueForPublic } from '../services/response-sanitizer.js'

export const listVenues: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const VenueModel = getVenueModel(connection)
    const venues = await VenueModel.find({ tournamentId }).lean().exec()
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    res.json({ data: isAdmin ? venues : venues.map((venue) => sanitizeVenueForPublic(venue)), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const getVenue: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }
    if (!isValidObjectId(id)) {
      badRequest(res, 'Invalid venue id')
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const VenueModel = getVenueModel(connection)
    const venue = await VenueModel.findById(id).lean().exec()
    if (!venue) {
      notFound(res, 'Venue not found')
      return
    }
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    res.json({ data: isAdmin ? venue : sanitizeVenueForPublic(venue), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createVenue: RequestHandler = async (req, res, next) => {
  try {
    if (Array.isArray(req.body)) {
      const payload = req.body as Array<{
        tournamentId: string
        name: string
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
      const VenueModel = getVenueModel(connection)
      const created = await VenueModel.insertMany(payload, { ordered: false })
      res.status(201).json({ data: created, errors: [] })
      return
    }

    const { tournamentId, name, details, userDefinedData } = req.body as {
      tournamentId: string
      name: string
      details?: unknown
      userDefinedData?: unknown
    }
    if (!isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const VenueModel = getVenueModel(connection)
    const created = await VenueModel.create({ tournamentId, name, details, userDefinedData })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: 'Venue name already exists' }] })
      return
    }
    next(err)
  }
}

export const bulkUpdateVenues: RequestHandler = async (req, res, next) => {
  try {
    if (!Array.isArray(req.body) || req.body.length === 0) {
      badRequest(res, 'Empty payload')
      return
    }
    const payload = req.body as Array<{
      id: string
      tournamentId: string
      name?: string
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
    const VenueModel = getVenueModel(connection)
    const ops = payload.map((item) => {
      const update: Record<string, unknown> = {}
      if (item.name !== undefined) update.name = item.name
      if (item.details !== undefined) update.details = item.details
      if (item.userDefinedData !== undefined) update.userDefinedData = item.userDefinedData
      return {
        updateOne: {
          filter: { _id: item.id, tournamentId },
          update: { $set: update },
        },
      }
    })
    await VenueModel.bulkWrite(ops, { ordered: false })
    const ids = payload.map((item) => item.id)
    const updated = await VenueModel.find({ _id: { $in: ids }, tournamentId }).lean().exec()
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const bulkDeleteVenues: RequestHandler = async (req, res, next) => {
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
    const VenueModel = getVenueModel(connection)
    const result = await VenueModel.deleteMany(filter).exec()
    res.json({ data: { deletedCount: result.deletedCount }, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const updateVenue: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId, name, details, userDefinedData } = req.body as {
      tournamentId: string
      name?: string
      details?: unknown
      userDefinedData?: unknown
    }
    if (!isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }
    if (!isValidObjectId(id)) {
      badRequest(res, 'Invalid venue id')
      return
    }
    const update: Record<string, unknown> = {}
    if (name !== undefined) update.name = name
    if (details !== undefined) update.details = details
    if (userDefinedData !== undefined) update.userDefinedData = userDefinedData

    const connection = await getTournamentConnection(tournamentId)
    const VenueModel = getVenueModel(connection)
    const updated = await VenueModel.findOneAndUpdate({ _id: id, tournamentId }, { $set: update }, { new: true })
      .lean()
      .exec()
    if (!updated) {
      notFound(res, 'Venue not found')
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteVenue: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }
    if (!isValidObjectId(id)) {
      badRequest(res, 'Invalid venue id')
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const VenueModel = getVenueModel(connection)
    const deleted = await VenueModel.findOneAndDelete({ _id: id, tournamentId }).lean().exec()
    if (!deleted) {
      notFound(res, 'Venue not found')
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
