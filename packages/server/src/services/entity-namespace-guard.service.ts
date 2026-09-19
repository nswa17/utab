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


export async function releaseEntityNamespaceLeases(
  connection: Connection,
  leases: readonly EntityNamespaceLease[]
): Promise<void> {
  const results = await Promise.allSettled(
    leases.map((lease) => releaseEntityNamespaceLease(connection, lease))
  )
  const errors: unknown[] = []
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      errors.push(result.reason)
      return
    }
    if (!result.value) {
      errors.push(new Error(`Failed to release entity namespace lease ${leases[index]?.key ?? ''}`))
    }
  })
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to release entity namespace leases')
  }
}

export async function acquireEntityNamespaceLeases(
  connection: Connection,
  tournamentId: string,
  namespaces: readonly string[]
): Promise<EntityNamespaceLease[] | null> {
  const orderedNamespaces = Array.from(new Set(namespaces)).sort()
  const acquired: EntityNamespaceLease[] = []
  for (const namespace of orderedNamespaces) {
    const lease = await acquireEntityNamespaceLease(connection, tournamentId, namespace)
    if (lease) {
      acquired.push(lease)
      continue
    }
    await releaseEntityNamespaceLeases(connection, acquired)
    return null
  }
  return acquired
}
