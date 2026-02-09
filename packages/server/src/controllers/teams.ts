import { Types } from 'mongoose'
import type { RequestHandler } from 'express'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { getTeamModel } from '../models/team.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { isDuplicateKeyError } from '../services/mongo-error.service.js'
import { sanitizeTeamForPublic } from '../services/response-sanitizer.js'

export const listTeams: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const TeamModel = getTeamModel(connection)
    const teams = await TeamModel.find({ tournamentId }).lean().exec()
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    res.json({ data: isAdmin ? teams : teams.map((team) => sanitizeTeamForPublic(team)), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const getTeam: RequestHandler = async (req, res, next) => {
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
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid team id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const TeamModel = getTeamModel(connection)
    const team = await TeamModel.findById(id).lean().exec()
    if (!team) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Team not found' }] })
      return
    }
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    res.json({ data: isAdmin ? team : sanitizeTeamForPublic(team), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createTeam: RequestHandler = async (req, res, next) => {
  try {
    if (Array.isArray(req.body)) {
      const payload = req.body as Array<{
        tournamentId: string
        name: string
        institution?: string
        speakers?: { name: string }[]
        details?: unknown
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
      const TeamModel = getTeamModel(connection)
      const created = await TeamModel.insertMany(payload, { ordered: false })
      res.status(201).json({ data: created, errors: [] })
      return
    }

    const { tournamentId, name, institution, speakers, details, userDefinedData } = req.body as {
      tournamentId: string
      name: string
      institution?: string
      speakers?: { name: string }[]
      details?: unknown
      userDefinedData?: unknown
    }

    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const TeamModel = getTeamModel(connection)
    const created = await TeamModel.create({
      tournamentId,
      name,
      institution,
      speakers,
      details,
      userDefinedData,
    })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: 'Team name already exists' }] })
      return
    }
    next(err)
  }
}

export const bulkUpdateTeams: RequestHandler = async (req, res, next) => {
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
      institution?: string
      speakers?: { name: string }[]
      details?: unknown
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
    const TeamModel = getTeamModel(connection)
    const ops = payload.map((item) => {
      const update: Record<string, unknown> = {}
      if (item.name !== undefined) update.name = item.name
      if (item.institution !== undefined) update.institution = item.institution
      if (item.speakers !== undefined) update.speakers = item.speakers
      if (item.details !== undefined) update.details = item.details
      if (item.userDefinedData !== undefined) update.userDefinedData = item.userDefinedData
      return {
        updateOne: {
          filter: { _id: item.id, tournamentId },
          update: { $set: update },
        },
      }
    })
    await TeamModel.bulkWrite(ops, { ordered: false })
    const ids = payload.map((item) => item.id)
    const updated = await TeamModel.find({ _id: { $in: ids }, tournamentId }).lean().exec()
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const bulkDeleteTeams: RequestHandler = async (req, res, next) => {
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
    const TeamModel = getTeamModel(connection)
    const result = await TeamModel.deleteMany(filter).exec()
    res.json({ data: { deletedCount: result.deletedCount }, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const updateTeam: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId, name, institution, speakers, details, userDefinedData } = req.body as {
      tournamentId: string
      name?: string
      institution?: string
      speakers?: { name: string }[]
      details?: unknown
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
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid team id' }] })
      return
    }

    const update: Record<string, unknown> = {}
    if (name !== undefined) update.name = name
    if (institution !== undefined) update.institution = institution
    if (speakers !== undefined) update.speakers = speakers
    if (details !== undefined) update.details = details
    if (userDefinedData !== undefined) update.userDefinedData = userDefinedData

    const connection = await getTournamentConnection(tournamentId)
    const TeamModel = getTeamModel(connection)
    const updated = await TeamModel.findOneAndUpdate(
      { _id: id, tournamentId },
      { $set: update },
      { new: true }
    )
      .lean()
      .exec()

    if (!updated) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Team not found' }] })
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteTeam: RequestHandler = async (req, res, next) => {
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
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid team id' }] })
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const TeamModel = getTeamModel(connection)
    const deleted = await TeamModel.findOneAndDelete({ _id: id, tournamentId }).lean().exec()
    if (!deleted) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Team not found' }] })
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
