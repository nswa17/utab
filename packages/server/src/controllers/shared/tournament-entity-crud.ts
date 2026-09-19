import type { RequestHandler } from 'express'
import { Types } from 'mongoose'
import { hasTournamentAdminAccess } from '../../middleware/auth.js'
import { getTournamentConnection } from '../../services/tournament-db.service.js'
import { isDuplicateKeyError } from '../../services/mongo-error.service.js'
import {
  acquireEntityNamespaceLease,
  releaseEntityNamespaceLease,
  type EntityNamespaceLease,
} from '../../services/entity-namespace-guard.service.js'
import { badRequest, isValidObjectId, notFound } from './http-errors.js'
import {
  ensureObjectId,
  ensureTournamentId,
  requireSingleTournamentPayload,
} from './request-validators.js'

type PlainRecord = Record<string, unknown>
type TournamentConnection = Awaited<ReturnType<typeof getTournamentConnection>>

type CrudModel = {
  find: (filter: PlainRecord) => { lean: () => { exec: () => Promise<any[]> } }
  findOne: (filter: PlainRecord) => { lean: () => { exec: () => Promise<any | null> } }
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
  mutationNamespace: string
  uniqueField?: string
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

function parseBulkIdList(ids: unknown): string[] {
  if (typeof ids !== 'string') return []
  return ids
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
}

function buildCreateDoc(
  payload: PlainRecord,
  tournamentId: string,
  fields: readonly string[]
): PlainRecord {
  return {
    tournamentId,
    ...pickKnownFields(payload, fields),
  }
}

function buildUpdateDoc(payload: PlainRecord, fields: readonly string[]): PlainRecord {
  return pickKnownFields(payload, fields)
}

function hasOwn(source: PlainRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key)
}

function buildRestoreUpdate(record: PlainRecord, fields: readonly string[]): PlainRecord {
  const set: PlainRecord = {}
  const unset: PlainRecord = {}
  fields.forEach((field) => {
    if (hasOwn(record, field)) {
      set[field] = record[field]
      return
    }
    unset[field] = 1
  })
  return Object.keys(unset).length > 0 ? { $set: set, $unset: unset } : { $set: set }
}

function updatedAtFilter(record: PlainRecord): PlainRecord {
  const value = record.updatedAt
  if (value === undefined || value === null) {
    return { updatedAt: { $exists: false } }
  }
  return { updatedAt: value }
}

function buildRestoreUpdateWithTimestamp(
  record: PlainRecord,
  fields: readonly string[]
): PlainRecord {
  const update = buildRestoreUpdate(record, fields) as {
    $set: PlainRecord
    $unset?: PlainRecord
  }
  if (record.updatedAt === undefined || record.updatedAt === null) {
    update.$unset = { ...(update.$unset ?? {}), updatedAt: 1 }
  } else {
    update.$set = { ...update.$set, updatedAt: record.updatedAt }
  }
  return update
}

function bulkMatchedCount(result: unknown): number | null {
  const value = Number((result as { matchedCount?: unknown } | null)?.matchedCount)
  return Number.isFinite(value) ? value : null
}

function createBulkMutationConflictError(): Error & { code: string } {
  const error = new Error('Bulk update changed concurrently; retry')
  return Object.assign(error, { code: 'UTAB_BULK_MUTATION_CONFLICT' })
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
  const uniqueField = options.uniqueField ?? 'name'

  const sendDuplicateConflict = (res: Parameters<RequestHandler>[1]) => {
    res.status(409).json({
      data: null,
      errors: [{ name: 'Conflict', message: options.duplicateConflictMessage }],
    })
  }

  const acquireMutationLeaseOrRespond = async (
    connection: TournamentConnection,
    tournamentId: string,
    res: Parameters<RequestHandler>[1]
  ): Promise<EntityNamespaceLease | null> => {
    const lease = await acquireEntityNamespaceLease(
      connection,
      tournamentId,
      options.mutationNamespace
    )
    if (lease) return lease
    res.status(409).json({
      data: null,
      errors: [{ name: 'Conflict', message: 'Entity namespace changed concurrently; retry' }],
    })
    return null
  }

  const releaseMutationLease = async (
    connection: TournamentConnection,
    lease: EntityNamespaceLease
  ): Promise<void> => {
    const released = await releaseEntityNamespaceLease(connection, lease)
    if (!released) {
      throw new Error('Failed to release entity namespace lease')
    }
  }

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

  const get: RequestHandler = async (req, res, next) => {
    try {
      const { id } = req.params
      const { tournamentId } = req.query as { tournamentId?: string }
      if (!ensureTournamentId(res, tournamentId)) return
      if (!ensureObjectId(res, id, options.invalidEntityIdMessage)) return
      const connection = await getTournamentConnection(tournamentId)
      const Model = options.getModel(connection)
      const record = await Model.findOne({ _id: id, tournamentId }).lean().exec()
      if (!record) {
        notFound(res, options.notFoundMessage)
        return
      }
      const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
      res.json({ data: isAdmin ? record : options.sanitizeForPublic(record), errors: [] })
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
        const mutationLease = await acquireMutationLeaseOrRespond(connection, tournamentId, res)
        if (!mutationLease) return
        let mutationLeaseReleased = false
        try {
          const Model = options.getModel(connection)
          const docs: PlainRecord[] = payload.map((item) => ({
          _id: new Types.ObjectId(),
          ...buildCreateDoc(item, tournamentId, options.fields),
        }))
        const proposedValues = docs.map((doc) => String(doc[uniqueField] ?? ''))
        if (new Set(proposedValues).size !== proposedValues.length) {
          sendDuplicateConflict(res)
          return
        }
        const existing = await Model.find({ tournamentId }).lean().exec()
        const existingValues = new Set(
          existing.map((record) => String(record?.[uniqueField] ?? ''))
        )
        if (proposedValues.some((value) => existingValues.has(value))) {
          sendDuplicateConflict(res)
          return
        }
        let created: any[]
        try {
          created = await Model.insertMany(docs, { ordered: true })
        } catch (createError) {
          try {
            await Model.deleteMany({
              tournamentId,
              _id: { $in: docs.map((doc) => doc._id) },
            }).exec()
          } catch (rollbackError) {
            throw new AggregateError(
              [createError, rollbackError],
              'Failed to roll back bulk entity creation'
            )
          }
          throw createError
        }
          await releaseMutationLease(connection, mutationLease)
          mutationLeaseReleased = true
          res.status(201).json({ data: created, errors: [] })
        } finally {
          if (!mutationLeaseReleased) {
            await releaseMutationLease(connection, mutationLease)
          }
        }
        return
      }

      const payload = req.body as { tournamentId?: string } & PlainRecord
      const tournamentId = payload.tournamentId
      if (!ensureTournamentId(res, tournamentId)) return
      const connection = await getTournamentConnection(tournamentId)
      const mutationLease = await acquireMutationLeaseOrRespond(connection, tournamentId, res)
      if (!mutationLease) return
      let mutationLeaseReleased = false
      try {
        const Model = options.getModel(connection)
        const created = await Model.create(buildCreateDoc(payload, tournamentId, options.fields))
        await releaseMutationLease(connection, mutationLease)
        mutationLeaseReleased = true
        res.status(201).json({ data: created.toJSON(), errors: [] })
      } finally {
        if (!mutationLeaseReleased) {
          await releaseMutationLease(connection, mutationLease)
        }
      }
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
      if (payload.some((item) => !isValidObjectId(item.id))) {
        badRequest(res, options.invalidEntityIdMessage)
        return
      }
      const ids = payload.map((item) => String(item.id))
      if (new Set(ids).size !== ids.length) {
        badRequest(res, 'Bulk update ids must be unique')
        return
      }

      const connection = await getTournamentConnection(tournamentId)
      const mutationLease = await acquireMutationLeaseOrRespond(connection, tournamentId, res)
      if (!mutationLease) return
      let mutationLeaseReleased = false
      try {
        const Model = options.getModel(connection)
        const existing = await Model.find({ tournamentId }).lean().exec()
      const existingById = new Map(existing.map((record) => [String(record?._id ?? ''), record]))
      if (ids.some((id) => !existingById.has(id))) {
        notFound(res, options.notFoundMessage)
        return
      }
      const updateById = new Map(
        payload.map((item) => [String(item.id), buildUpdateDoc(item, options.fields)])
      )
      const finalUniqueValues = new Map<string, string>()
      for (const record of existing) {
        const id = String(record?._id ?? '')
        const update = updateById.get(id)
        const value = String(update?.[uniqueField] ?? record?.[uniqueField] ?? '')
        const ownerId = finalUniqueValues.get(value)
        if (ownerId && ownerId !== id) {
          sendDuplicateConflict(res)
          return
        }
        finalUniqueValues.set(value, id)
      }
      const operationTimestamp = new Date()
      const changedUniqueIds = payload
        .filter((item) => {
          const update = updateById.get(String(item.id)) ?? {}
          const current = existingById.get(String(item.id)) ?? {}
          return (
            hasOwn(update, uniqueField) &&
            String(update[uniqueField]) !== String(current[uniqueField])
          )
        })
        .map((item) => String(item.id))
      const changedUniqueIdSet = new Set(changedUniqueIds)
      const occupiedUniqueValues = new Set<string>([
        ...existing.map((record) => String(record?.[uniqueField] ?? '')),
        ...Array.from(finalUniqueValues.keys()),
      ])
      const temporaryUniqueValueById = new Map<string, string>()
      changedUniqueIds.forEach((id, index) => {
        let suffix = index
        let candidate = `__utab_bulk_${id}_${suffix}__`
        while (occupiedUniqueValues.has(candidate)) {
          suffix += 1
          candidate = `__utab_bulk_${id}_${suffix}__`
        }
        occupiedUniqueValues.add(candidate)
        temporaryUniqueValueById.set(id, candidate)
      })
      const stageOps = changedUniqueIds.map((id) => ({
        updateOne: {
          filter: {
            _id: id,
            tournamentId,
            ...updatedAtFilter(existingById.get(id) ?? {}),
          },
          update: {
            $set: {
              [uniqueField]: temporaryUniqueValueById.get(id),
              updatedAt: operationTimestamp,
            },
          },
          timestamps: false,
        },
      }))
      const ops = payload.map((item) => {
        const id = String(item.id)
        return {
          updateOne: {
            filter: {
              _id: item.id,
              tournamentId,
              ...(changedUniqueIdSet.has(id)
                ? { updatedAt: operationTimestamp }
                : updatedAtFilter(existingById.get(id) ?? {})),
            },
            update: {
              $set: {
                ...buildUpdateDoc(item, options.fields),
                updatedAt: operationTimestamp,
              },
            },
            timestamps: false,
          },
        }
      })
      const rollbackStageOps = changedUniqueIds.map((id) => ({
        updateOne: {
          filter: { _id: id, tournamentId, updatedAt: operationTimestamp },
          update: {
            $set: {
              [uniqueField]: temporaryUniqueValueById.get(id),
              updatedAt: operationTimestamp,
            },
          },
          timestamps: false,
        },
      }))
      const restoreOps = payload.map((item) => ({
        updateOne: {
          filter: {
            _id: item.id,
            tournamentId,
            updatedAt: operationTimestamp,
          },
          update: buildRestoreUpdateWithTimestamp(
            existingById.get(String(item.id)) ?? {},
            options.fields
          ),
          timestamps: false,
        },
      }))

      let mutationStarted = false
      try {
        if (stageOps.length > 0) {
          mutationStarted = true
          const stageResult = await Model.bulkWrite(stageOps, { ordered: true })
          const matched = bulkMatchedCount(stageResult)
          if (matched !== null && matched !== stageOps.length) {
            throw createBulkMutationConflictError()
          }
        }
        mutationStarted = true
        const updateResult = await Model.bulkWrite(ops, { ordered: true })
        const matched = bulkMatchedCount(updateResult)
        if (matched !== null && matched !== ops.length) {
          throw createBulkMutationConflictError()
        }
      } catch (updateError) {
        if (mutationStarted) {
          const rollbackErrors: unknown[] = []
          if (rollbackStageOps.length > 0) {
            try {
              await Model.bulkWrite(rollbackStageOps, { ordered: true })
            } catch (rollbackStageError) {
              rollbackErrors.push(rollbackStageError)
            }
          }
          try {
            await Model.bulkWrite(restoreOps, { ordered: true })
          } catch (rollbackRestoreError) {
            rollbackErrors.push(rollbackRestoreError)
          }
          if (rollbackErrors.length > 0) {
            throw new AggregateError(
              [updateError, ...rollbackErrors],
              'Failed to roll back bulk entity update'
            )
          }
        }
        throw updateError
      }

        const updated = await Model.find({ _id: { $in: ids }, tournamentId })
          .lean()
          .exec()
        await releaseMutationLease(connection, mutationLease)
        mutationLeaseReleased = true
        res.json({ data: updated, errors: [] })
      } finally {
        if (!mutationLeaseReleased) {
          await releaseMutationLease(connection, mutationLease)
        }
      }
    } catch (err: any) {
      if (err?.code === 'UTAB_BULK_MUTATION_CONFLICT') {
        res.status(409).json({
          data: null,
          errors: [{ name: 'Conflict', message: 'Bulk update changed concurrently; retry' }],
        })
        return
      }
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

  const bulkDelete: RequestHandler = async (req, res, next) => {
    try {
      const { tournamentId, ids } = req.query as { tournamentId?: string; ids?: string }
      if (!ensureTournamentId(res, tournamentId)) return
      const idList = parseBulkIdList(ids)
      if (idList.length === 0) {
        badRequest(res, 'Bulk delete ids are required')
        return
      }
      if (idList.some((id) => !isValidObjectId(id))) {
        badRequest(res, options.invalidEntityIdMessage)
        return
      }
      const connection = await getTournamentConnection(tournamentId)
      const mutationLease = await acquireMutationLeaseOrRespond(connection, tournamentId, res)
      if (!mutationLease) return
      let mutationLeaseReleased = false
      try {
        const Model = options.getModel(connection)
        const result = await Model.deleteMany({ tournamentId, _id: { $in: idList } }).exec()
        await releaseMutationLease(connection, mutationLease)
        mutationLeaseReleased = true
        res.json({ data: { deletedCount: result.deletedCount }, errors: [] })
      } finally {
        if (!mutationLeaseReleased) {
          await releaseMutationLease(connection, mutationLease)
        }
      }
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

  const update: RequestHandler = async (req, res, next) => {
    try {
      const { id } = req.params
      const payload = req.body as { tournamentId?: string } & PlainRecord
      const tournamentId = payload.tournamentId
      if (!ensureTournamentId(res, tournamentId)) return
      if (!ensureObjectId(res, id, options.invalidEntityIdMessage)) return

      const connection = await getTournamentConnection(tournamentId)
      const mutationLease = await acquireMutationLeaseOrRespond(connection, tournamentId, res)
      if (!mutationLease) return
      let mutationLeaseReleased = false
      try {
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
        await releaseMutationLease(connection, mutationLease)
        mutationLeaseReleased = true
        res.json({ data: updated, errors: [] })
      } finally {
        if (!mutationLeaseReleased) {
          await releaseMutationLease(connection, mutationLease)
        }
      }
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

  const deleteOne: RequestHandler = async (req, res, next) => {
    try {
      const { id } = req.params
      const { tournamentId } = req.query as { tournamentId?: string }
      if (!ensureTournamentId(res, tournamentId)) return
      if (!ensureObjectId(res, id, options.invalidEntityIdMessage)) return

      const connection = await getTournamentConnection(tournamentId)
      const mutationLease = await acquireMutationLeaseOrRespond(connection, tournamentId, res)
      if (!mutationLease) return
      let mutationLeaseReleased = false
      try {
        const Model = options.getModel(connection)
        const deleted = await Model.findOneAndDelete({ _id: id, tournamentId }).lean().exec()
        if (!deleted) {
          notFound(res, options.notFoundMessage)
          return
        }
        await releaseMutationLease(connection, mutationLease)
        mutationLeaseReleased = true
        res.json({ data: deleted, errors: [] })
      } finally {
        if (!mutationLeaseReleased) {
          await releaseMutationLease(connection, mutationLease)
        }
      }
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
