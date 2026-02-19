import type { RequestHandler } from 'express'
import { hasTournamentAdminAccess } from '../../middleware/auth.js'
import { getTournamentConnection } from '../../services/tournament-db.service.js'
import { isDuplicateKeyError } from '../../services/mongo-error.service.js'
import { badRequest, notFound } from './http-errors.js'
import { ensureObjectId, ensureTournamentId, requireSingleTournamentPayload } from './request-validators.js'

type PlainRecord = Record<string, unknown>
type TournamentConnection = Awaited<ReturnType<typeof getTournamentConnection>>

type CrudModel = {
  find: (filter: PlainRecord) => { lean: () => { exec: () => Promise<any[]> } }
  findById: (id: string) => { lean: () => { exec: () => Promise<any | null> } }
  insertMany: (docs: PlainRecord[], options: { ordered: boolean }) => Promise<any[]>
  create: (doc: PlainRecord) => Promise<{ toJSON: () => any }>
  bulkWrite: (ops: any[], options: { ordered: boolean }) => Promise<unknown>
  deleteMany: (filter: PlainRecord) => { exec: () => Promise<{ deletedCount?: number }> }
  findOneAndUpdate: (
    filter: PlainRecord,
    update: PlainRecord,
    options: { new: boolean }
  ) => { lean: () => { exec: () => Promise<any | null> } }
  findOneAndDelete: (filter: PlainRecord) => { lean: () => { exec: () => Promise<any | null> } }
}

type CrudOptions = {
  fields: readonly string[]
  getModel: (connection: TournamentConnection) => CrudModel
  sanitizeForPublic: (value: unknown) => unknown
  invalidEntityIdMessage: string
  notFoundMessage: string
  duplicateConflictMessage: string
}

function pickKnownFields(source: PlainRecord, keys: readonly string[]): PlainRecord {
  const out: PlainRecord = {}
  keys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(source, key)) return
    if (source[key] === undefined) return
    out[key] = source[key]
  })
  return out
}

function buildDeleteFilter(tournamentId: string, ids?: string): PlainRecord {
  const filter: PlainRecord = { tournamentId }
  const idList = typeof ids === 'string' && ids.length > 0 ? ids.split(',').filter((id) => id.length > 0) : []
  if (idList.length > 0) {
    filter._id = { $in: idList }
  }
  return filter
}

function buildCreateDoc(payload: PlainRecord, tournamentId: string, fields: readonly string[]): PlainRecord {
  return {
    tournamentId,
    ...pickKnownFields(payload, fields),
  }
}

function buildUpdateDoc(payload: PlainRecord, fields: readonly string[]): PlainRecord {
  return pickKnownFields(payload, fields)
}

export function createTournamentEntityCrudHandlers(options: CrudOptions): {
  list: RequestHandler
  get: RequestHandler
  create: RequestHandler
  bulkUpdate: RequestHandler
  bulkDelete: RequestHandler
  update: RequestHandler
  deleteOne: RequestHandler
} {
  const list: RequestHandler = async (req, res, next) => {
    try {
      const { tournamentId } = req.query as { tournamentId?: string }
      if (!ensureTournamentId(res, tournamentId)) return
      const connection = await getTournamentConnection(tournamentId)
      const Model = options.getModel(connection)
      const records = await Model.find({ tournamentId }).lean().exec()
      const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
      res.json({
        data: isAdmin ? records : records.map((record) => options.sanitizeForPublic(record)),
        errors: [],
      })
    } catch (err) {
      next(err)
    }
  }

  const get: RequestHandler = async (req, res, next) => {
    try {
      const { id } = req.params
      const { tournamentId } = req.query as { tournamentId?: string }
      if (!ensureTournamentId(res, tournamentId)) return
      if (!ensureObjectId(res, id, options.invalidEntityIdMessage)) return
      const connection = await getTournamentConnection(tournamentId)
      const Model = options.getModel(connection)
      const record = await Model.findById(id).lean().exec()
      if (!record) {
        notFound(res, options.notFoundMessage)
        return
      }
      const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
      res.json({ data: isAdmin ? record : options.sanitizeForPublic(record), errors: [] })
    } catch (err) {
      next(err)
    }
  }

  const create: RequestHandler = async (req, res, next) => {
    try {
      if (Array.isArray(req.body)) {
        const payload = req.body as Array<{ tournamentId?: unknown } & PlainRecord>
        if (payload.length === 0) {
          badRequest(res, 'Empty payload')
          return
        }
        const tournamentId = requireSingleTournamentPayload(res, payload)
        if (!tournamentId) return
        const connection = await getTournamentConnection(tournamentId)
        const Model = options.getModel(connection)
        const docs = payload.map((item) => buildCreateDoc(item, tournamentId, options.fields))
        const created = await Model.insertMany(docs, { ordered: false })
        res.status(201).json({ data: created, errors: [] })
        return
      }

      const payload = req.body as { tournamentId?: string } & PlainRecord
      const tournamentId = payload.tournamentId
      if (!ensureTournamentId(res, tournamentId)) return
      const connection = await getTournamentConnection(tournamentId)
      const Model = options.getModel(connection)
      const created = await Model.create(buildCreateDoc(payload, tournamentId, options.fields))
      res.status(201).json({ data: created.toJSON(), errors: [] })
    } catch (err: any) {
      if (isDuplicateKeyError(err)) {
        res.status(409).json({
          data: null,
          errors: [{ name: 'Conflict', message: options.duplicateConflictMessage }],
        })
        return
      }
      next(err)
    }
  }

  const bulkUpdate: RequestHandler = async (req, res, next) => {
    try {
      if (!Array.isArray(req.body) || req.body.length === 0) {
        badRequest(res, 'Empty payload')
        return
      }

      const payload = req.body as Array<{ id: string; tournamentId?: unknown } & PlainRecord>
      const tournamentId = requireSingleTournamentPayload(res, payload)
      if (!tournamentId) return

      const connection = await getTournamentConnection(tournamentId)
      const Model = options.getModel(connection)
      const ops = payload.map((item) => ({
        updateOne: {
          filter: { _id: item.id, tournamentId },
          update: { $set: buildUpdateDoc(item, options.fields) },
        },
      }))
      await Model.bulkWrite(ops, { ordered: false })

      const ids = payload.map((item) => item.id)
      const updated = await Model.find({ _id: { $in: ids }, tournamentId }).lean().exec()
      res.json({ data: updated, errors: [] })
    } catch (err) {
      next(err)
    }
  }

  const bulkDelete: RequestHandler = async (req, res, next) => {
    try {
      const { tournamentId, ids } = req.query as { tournamentId?: string; ids?: string }
      if (!ensureTournamentId(res, tournamentId)) return
      const connection = await getTournamentConnection(tournamentId)
      const Model = options.getModel(connection)
      const result = await Model.deleteMany(buildDeleteFilter(tournamentId, ids)).exec()
      res.json({ data: { deletedCount: result.deletedCount }, errors: [] })
    } catch (err) {
      next(err)
    }
  }

  const update: RequestHandler = async (req, res, next) => {
    try {
      const { id } = req.params
      const payload = req.body as { tournamentId?: string } & PlainRecord
      const tournamentId = payload.tournamentId
      if (!ensureTournamentId(res, tournamentId)) return
      if (!ensureObjectId(res, id, options.invalidEntityIdMessage)) return

      const connection = await getTournamentConnection(tournamentId)
      const Model = options.getModel(connection)
      const updated = await Model.findOneAndUpdate(
        { _id: id, tournamentId },
        { $set: buildUpdateDoc(payload, options.fields) },
        { new: true }
      )
        .lean()
        .exec()

      if (!updated) {
        notFound(res, options.notFoundMessage)
        return
      }
      res.json({ data: updated, errors: [] })
    } catch (err) {
      next(err)
    }
  }

  const deleteOne: RequestHandler = async (req, res, next) => {
    try {
      const { id } = req.params
      const { tournamentId } = req.query as { tournamentId?: string }
      if (!ensureTournamentId(res, tournamentId)) return
      if (!ensureObjectId(res, id, options.invalidEntityIdMessage)) return

      const connection = await getTournamentConnection(tournamentId)
      const Model = options.getModel(connection)
      const deleted = await Model.findOneAndDelete({ _id: id, tournamentId }).lean().exec()
      if (!deleted) {
        notFound(res, options.notFoundMessage)
        return
      }
      res.json({ data: deleted, errors: [] })
    } catch (err) {
      next(err)
    }
  }

  return {
    list,
    get,
    create,
    bulkUpdate,
    bulkDelete,
    update,
    deleteOne,
  }
}
