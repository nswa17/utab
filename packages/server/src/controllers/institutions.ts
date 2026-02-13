import { Types } from 'mongoose'
import type { RequestHandler } from 'express'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { getInstitutionModel } from '../models/institution.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { isDuplicateKeyError } from '../services/mongo-error.service.js'
import { sanitizeInstitutionForPublic } from '../services/response-sanitizer.js'

export const listInstitutions: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const InstitutionModel = getInstitutionModel(connection)
    const institutions = await InstitutionModel.find({ tournamentId }).lean().exec()
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    res.json({
      data: isAdmin
        ? institutions
        : institutions.map((institution) => sanitizeInstitutionForPublic(institution)),
      errors: [],
    })
  } catch (err) {
    next(err)
  }
}

export const getInstitution: RequestHandler = async (req, res, next) => {
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
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid institution id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const InstitutionModel = getInstitutionModel(connection)
    const institution = await InstitutionModel.findById(id).lean().exec()
    if (!institution) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Institution not found' }] })
      return
    }
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    res.json({ data: isAdmin ? institution : sanitizeInstitutionForPublic(institution), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createInstitution: RequestHandler = async (req, res, next) => {
  try {
    if (Array.isArray(req.body)) {
      const payload = req.body as Array<{
        tournamentId: string
        name: string
        category?: string
        priority?: number
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
      const InstitutionModel = getInstitutionModel(connection)
      const created = await InstitutionModel.insertMany(payload, { ordered: false })
      res.status(201).json({ data: created, errors: [] })
      return
    }

    const { tournamentId, name, category, priority, userDefinedData } = req.body as {
      tournamentId: string
      name: string
      category?: string
      priority?: number
      userDefinedData?: unknown
    }
    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const InstitutionModel = getInstitutionModel(connection)
    const created = await InstitutionModel.create({
      tournamentId,
      name,
      category,
      priority,
      userDefinedData,
    })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: 'Institution name already exists' }] })
      return
    }
    next(err)
  }
}

export const bulkUpdateInstitutions: RequestHandler = async (req, res, next) => {
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
      category?: string
      priority?: number
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
    const InstitutionModel = getInstitutionModel(connection)
    const ops = payload.map((item) => {
      const update: Record<string, unknown> = {}
      if (item.name !== undefined) update.name = item.name
      if (item.category !== undefined) update.category = item.category
      if (item.priority !== undefined) update.priority = item.priority
      if (item.userDefinedData !== undefined) update.userDefinedData = item.userDefinedData
      return {
        updateOne: {
          filter: { _id: item.id, tournamentId },
          update: { $set: update },
        },
      }
    })
    await InstitutionModel.bulkWrite(ops, { ordered: false })
    const ids = payload.map((item) => item.id)
    const updated = await InstitutionModel.find({ _id: { $in: ids }, tournamentId }).lean().exec()
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const bulkDeleteInstitutions: RequestHandler = async (req, res, next) => {
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
    const InstitutionModel = getInstitutionModel(connection)
    const result = await InstitutionModel.deleteMany(filter).exec()
    res.json({ data: { deletedCount: result.deletedCount }, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const updateInstitution: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId, name, category, priority, userDefinedData } = req.body as {
      tournamentId: string
      name?: string
      category?: string
      priority?: number
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
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid institution id' }] })
      return
    }
    const update: Record<string, unknown> = {}
    if (name !== undefined) update.name = name
    if (category !== undefined) update.category = category
    if (priority !== undefined) update.priority = priority
    if (userDefinedData !== undefined) update.userDefinedData = userDefinedData

    const connection = await getTournamentConnection(tournamentId)
    const InstitutionModel = getInstitutionModel(connection)
    const updated = await InstitutionModel.findOneAndUpdate({ _id: id, tournamentId }, { $set: update }, { new: true })
      .lean()
      .exec()
    if (!updated) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Institution not found' }] })
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteInstitution: RequestHandler = async (req, res, next) => {
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
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid institution id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const InstitutionModel = getInstitutionModel(connection)
    const deleted = await InstitutionModel.findOneAndDelete({ _id: id, tournamentId }).lean().exec()
    if (!deleted) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Institution not found' }] })
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
