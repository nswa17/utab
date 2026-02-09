import { Types } from 'mongoose'
import type { RequestHandler } from 'express'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { getRoundModel } from '../models/round.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { isDuplicateKeyError } from '../services/mongo-error.service.js'
import { sanitizeRoundForPublic } from '../services/response-sanitizer.js'

export const listRounds: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, public: publicParam } = req.query as {
      tournamentId?: string
      public?: string
    }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const rounds = await RoundModel.find({ tournamentId }).sort({ round: 1 }).lean().exec()
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    const forcePublic =
      publicParam === '1' || publicParam === 'true' || publicParam === 'yes' || publicParam === 'public'
    const data = isAdmin && !forcePublic ? rounds : rounds.map((round) => sanitizeRoundForPublic(round))
    res.json({ data, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const getRound: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId, public: publicParam } = req.query as {
      tournamentId?: string
      public?: string
    }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    if (!Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid round id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const round = await RoundModel.findById(id).lean().exec()
    if (!round) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Round not found' }] })
      return
    }
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    const forcePublic =
      publicParam === '1' || publicParam === 'true' || publicParam === 'yes' || publicParam === 'public'
    res.json({ data: isAdmin && !forcePublic ? round : sanitizeRoundForPublic(round), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createRound: RequestHandler = async (req, res, next) => {
  try {
    if (Array.isArray(req.body)) {
      const payload = req.body as Array<{
        tournamentId: string
        round: number
        name?: string
        motions?: string[]
        motionOpened?: boolean
        teamAllocationOpened?: boolean
        adjudicatorAllocationOpened?: boolean
        weightsOfAdjudicators?: { chair: number; panel: number; trainee: number }
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
      const RoundModel = getRoundModel(connection)
      const created = await RoundModel.insertMany(payload, { ordered: false })
      res.status(201).json({ data: created, errors: [] })
      return
    }

    const {
      tournamentId,
      round,
      name,
      motions,
      motionOpened,
      teamAllocationOpened,
      adjudicatorAllocationOpened,
      weightsOfAdjudicators,
      userDefinedData,
    } = req.body as {
      tournamentId: string
      round: number
      name?: string
      motions?: string[]
      motionOpened?: boolean
      teamAllocationOpened?: boolean
      adjudicatorAllocationOpened?: boolean
      weightsOfAdjudicators?: { chair: number; panel: number; trainee: number }
      userDefinedData?: unknown
    }

    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const created = await RoundModel.create({
      tournamentId,
      round,
      name,
      motions,
      motionOpened,
      teamAllocationOpened,
      adjudicatorAllocationOpened,
      weightsOfAdjudicators,
      userDefinedData,
    })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: 'Round already exists' }] })
      return
    }
    next(err)
  }
}

export const bulkUpdateRounds: RequestHandler = async (req, res, next) => {
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
      round?: number
      name?: string
      motions?: string[]
      motionOpened?: boolean
      teamAllocationOpened?: boolean
      adjudicatorAllocationOpened?: boolean
      weightsOfAdjudicators?: { chair: number; panel: number; trainee: number }
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
    const RoundModel = getRoundModel(connection)
    const ops = payload.map((item) => {
      const update: Record<string, unknown> = {}
      if (item.round !== undefined) update.round = item.round
      if (item.name !== undefined) update.name = item.name
      if (item.motions !== undefined) update.motions = item.motions
      if (item.motionOpened !== undefined) update.motionOpened = item.motionOpened
      if (item.teamAllocationOpened !== undefined) update.teamAllocationOpened = item.teamAllocationOpened
      if (item.adjudicatorAllocationOpened !== undefined)
        update.adjudicatorAllocationOpened = item.adjudicatorAllocationOpened
      if (item.weightsOfAdjudicators !== undefined) update.weightsOfAdjudicators = item.weightsOfAdjudicators
      if (item.userDefinedData !== undefined) update.userDefinedData = item.userDefinedData
      return {
        updateOne: {
          filter: { _id: item.id, tournamentId },
          update: { $set: update },
        },
      }
    })
    await RoundModel.bulkWrite(ops, { ordered: false })
    const ids = payload.map((item) => item.id)
    const updated = await RoundModel.find({ _id: { $in: ids }, tournamentId }).lean().exec()
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const bulkDeleteRounds: RequestHandler = async (req, res, next) => {
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
    const RoundModel = getRoundModel(connection)
    const result = await RoundModel.deleteMany(filter).exec()
    res.json({ data: { deletedCount: result.deletedCount }, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const updateRound: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const {
      tournamentId,
      round,
      name,
      motions,
      motionOpened,
      teamAllocationOpened,
      adjudicatorAllocationOpened,
      weightsOfAdjudicators,
      userDefinedData,
    } = req.body as {
      tournamentId: string
      round?: number
      name?: string
      motions?: string[]
      motionOpened?: boolean
      teamAllocationOpened?: boolean
      adjudicatorAllocationOpened?: boolean
      weightsOfAdjudicators?: { chair: number; panel: number; trainee: number }
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
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid round id' }] })
      return
    }

    const update: Record<string, unknown> = {}
    if (round !== undefined) update.round = round
    if (name !== undefined) update.name = name
    if (motions !== undefined) update.motions = motions
    if (motionOpened !== undefined) update.motionOpened = motionOpened
    if (teamAllocationOpened !== undefined) update.teamAllocationOpened = teamAllocationOpened
    if (adjudicatorAllocationOpened !== undefined)
      update.adjudicatorAllocationOpened = adjudicatorAllocationOpened
    if (weightsOfAdjudicators !== undefined) update.weightsOfAdjudicators = weightsOfAdjudicators
    if (userDefinedData !== undefined) update.userDefinedData = userDefinedData

    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const updated = await RoundModel.findOneAndUpdate({ _id: id, tournamentId }, { $set: update }, { new: true })
      .lean()
      .exec()
    if (!updated) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Round not found' }] })
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteRound: RequestHandler = async (req, res, next) => {
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
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid round id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const deleted = await RoundModel.findOneAndDelete({ _id: id, tournamentId }).lean().exec()
    if (!deleted) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Round not found' }] })
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
