import { Types } from 'mongoose'
import type { RequestHandler } from 'express'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { getSpeakerModel } from '../models/speaker.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { isDuplicateKeyError } from '../services/mongo-error.service.js'
import { sanitizeSpeakerForPublic } from '../services/response-sanitizer.js'

export const listSpeakers: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const SpeakerModel = getSpeakerModel(connection)
    const speakers = await SpeakerModel.find({ tournamentId }).lean().exec()
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    res.json({
      data: isAdmin ? speakers : speakers.map((speaker) => sanitizeSpeakerForPublic(speaker)),
      errors: [],
    })
  } catch (err) {
    next(err)
  }
}

export const getSpeaker: RequestHandler = async (req, res, next) => {
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
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid speaker id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const SpeakerModel = getSpeakerModel(connection)
    const speaker = await SpeakerModel.findById(id).lean().exec()
    if (!speaker) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Speaker not found' }] })
      return
    }
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    res.json({ data: isAdmin ? speaker : sanitizeSpeakerForPublic(speaker), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createSpeaker: RequestHandler = async (req, res, next) => {
  try {
    if (Array.isArray(req.body)) {
      const payload = req.body as Array<{
        tournamentId: string
        name: string
        userDefinedData?: unknown
      }>
      if (payload.length === 0) {
        res
          .status(400)
          .json({ data: null, errors: [{ name: 'BadRequest', message: 'Empty payload' }] })
        return
      }
      const tournamentId = payload[0].tournamentId
      if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
        res
          .status(400)
          .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
        return
      }
      if (!payload.every((item) => item.tournamentId === tournamentId)) {
        res.status(400).json({
          data: null,
          errors: [{ name: 'BadRequest', message: 'Mixed tournament ids are not supported' }],
        })
        return
      }
      const connection = await getTournamentConnection(tournamentId)
      const SpeakerModel = getSpeakerModel(connection)
      const created = await SpeakerModel.insertMany(payload, { ordered: false })
      res.status(201).json({ data: created, errors: [] })
      return
    }

    const { tournamentId, name, userDefinedData } = req.body as {
      tournamentId: string
      name: string
      userDefinedData?: unknown
    }
    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const SpeakerModel = getSpeakerModel(connection)
    const created = await SpeakerModel.create({ tournamentId, name, userDefinedData })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: 'Speaker name already exists' }] })
      return
    }
    next(err)
  }
}

export const bulkUpdateSpeakers: RequestHandler = async (req, res, next) => {
  try {
    if (!Array.isArray(req.body) || req.body.length === 0) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Empty payload' }] })
      return
    }
    const payload = req.body as Array<{
      id: string
      tournamentId: string
      name?: string
      userDefinedData?: unknown
    }>
    const tournamentId = payload[0].tournamentId
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    if (!payload.every((item) => item.tournamentId === tournamentId)) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'Mixed tournament ids are not supported' }],
      })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const SpeakerModel = getSpeakerModel(connection)
    const ops = payload.map((item) => {
      const update: Record<string, unknown> = {}
      if (item.name !== undefined) update.name = item.name
      if (item.userDefinedData !== undefined) update.userDefinedData = item.userDefinedData
      return {
        updateOne: {
          filter: { _id: item.id, tournamentId },
          update: { $set: update },
        },
      }
    })
    await SpeakerModel.bulkWrite(ops, { ordered: false })
    const ids = payload.map((item) => item.id)
    const updated = await SpeakerModel.find({ _id: { $in: ids }, tournamentId }).lean().exec()
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const bulkDeleteSpeakers: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, ids } = req.query as { tournamentId?: string; ids?: string }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    const idList =
      typeof ids === 'string' && ids.length > 0 ? ids.split(',').filter((id) => id.length > 0) : []
    const filter: Record<string, unknown> = { tournamentId }
    if (idList.length > 0) {
      filter._id = { $in: idList }
    }
    const connection = await getTournamentConnection(tournamentId)
    const SpeakerModel = getSpeakerModel(connection)
    const result = await SpeakerModel.deleteMany(filter).exec()
    res.json({ data: { deletedCount: result.deletedCount }, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const updateSpeaker: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId, name, userDefinedData } = req.body as {
      tournamentId: string
      name?: string
      userDefinedData?: unknown
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
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid speaker id' }] })
      return
    }
    const update: Record<string, unknown> = {}
    if (name !== undefined) update.name = name
    if (userDefinedData !== undefined) update.userDefinedData = userDefinedData

    const connection = await getTournamentConnection(tournamentId)
    const SpeakerModel = getSpeakerModel(connection)
    const updated = await SpeakerModel.findOneAndUpdate({ _id: id, tournamentId }, { $set: update }, { new: true })
      .lean()
      .exec()
    if (!updated) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Speaker not found' }] })
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteSpeaker: RequestHandler = async (req, res, next) => {
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
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid speaker id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const SpeakerModel = getSpeakerModel(connection)
    const deleted = await SpeakerModel.findOneAndDelete({ _id: id, tournamentId }).lean().exec()
    if (!deleted) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Speaker not found' }] })
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
