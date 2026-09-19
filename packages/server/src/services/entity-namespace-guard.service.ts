import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'
import { isDuplicateKeyError } from './mongo-error.service.js'

export const ENTITY_NAMESPACE_LOCK_COLLECTION = 'entity_namespace_locks'
export const ENTITY_NAMESPACE_LEASE_STALE_MS = 5 * 60 * 1000

const entityNamespaceLockSchema = new Schema(
  {
    _id: { type: String, required: true },
    locked: { type: Boolean, default: false },
    epoch: { type: Number, default: 0 },
    touchedAt: { type: Date, default: null },
  },
  { versionKey: false, collection: ENTITY_NAMESPACE_LOCK_COLLECTION }
)

type EntityNamespaceLock = InferSchemaType<typeof entityNamespaceLockSchema>

function getEntityNamespaceLockModel(connection: Connection): Model<EntityNamespaceLock> {
  return (
    (connection.models.EntityNamespaceLock as Model<EntityNamespaceLock> | undefined) ??
    connection.model<EntityNamespaceLock>('EntityNamespaceLock', entityNamespaceLockSchema)
  )
}

export type EntityNamespaceLease = {
  key: string
  epoch: number
}

function lockKey(tournamentId: string, namespace: string): string {
  return `${namespace}:${tournamentId}`
}

export async function acquireEntityNamespaceLease(
  connection: Connection,
  tournamentId: string,
  namespace: string
): Promise<EntityNamespaceLease | null> {
  const LockModel = getEntityNamespaceLockModel(connection)
  const key = lockKey(tournamentId, namespace)

  try {
    await LockModel.updateOne(
      { _id: key },
      { $setOnInsert: { locked: false, epoch: 0, touchedAt: new Date() } },
      { upsert: true }
    ).exec()
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error
  }

  const staleBefore = new Date(Date.now() - ENTITY_NAMESPACE_LEASE_STALE_MS)
  const claimed = await LockModel.findOneAndUpdate(
    {
      _id: key,
      $or: [
        { locked: { $ne: true } },
        { touchedAt: { $lt: staleBefore } },
        { touchedAt: null },
      ],
    },
    {
      $set: { locked: true, touchedAt: new Date() },
      $inc: { epoch: 1 },
    },
    { new: true }
  )
    .lean()
    .exec()

  if (!claimed) return null
  return { key, epoch: Number((claimed as any).epoch ?? 0) }
}

export async function releaseEntityNamespaceLease(
  connection: Connection,
  lease: EntityNamespaceLease
): Promise<boolean> {
  const LockModel = getEntityNamespaceLockModel(connection)
  const result = await LockModel.updateOne(
    {
      _id: lease.key,
      locked: true,
      epoch: lease.epoch,
    },
    { $set: { locked: false, touchedAt: new Date() } }
  ).exec()
  return result.matchedCount === 1
}
