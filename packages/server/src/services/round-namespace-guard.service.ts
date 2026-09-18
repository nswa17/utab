import { Schema, type Connection, type InferSchemaType, type Model } from 'mongoose'
import { isDuplicateKeyError } from './mongo-error.service.js'

export const ROUND_NAMESPACE_LOCK_COLLECTION = 'round_namespace_locks'

const roundNamespaceLockSchema = new Schema(
  {
    _id: { type: String, required: true },
    locked: { type: Boolean, default: false },
    epoch: { type: Number, default: 0 },
    touchedAt: { type: Date, default: null },
  },
  { versionKey: false, collection: ROUND_NAMESPACE_LOCK_COLLECTION }
)

type RoundNamespaceLock = InferSchemaType<typeof roundNamespaceLockSchema>

function getRoundNamespaceLockModel(connection: Connection): Model<RoundNamespaceLock> {
  return (
    (connection.models.RoundNamespaceLock as Model<RoundNamespaceLock> | undefined) ??
    connection.model<RoundNamespaceLock>('RoundNamespaceLock', roundNamespaceLockSchema)
  )
}

export type RoundNamespaceLease = {
  tournamentId: string
  epoch: number
}

export async function acquireRoundNamespaceLease(
  connection: Connection,
  tournamentId: string
): Promise<RoundNamespaceLease | null> {
  const LockModel = getRoundNamespaceLockModel(connection)
  try {
    await LockModel.updateOne(
      { _id: tournamentId },
      { $setOnInsert: { locked: false, epoch: 0, touchedAt: new Date() } },
      { upsert: true }
    ).exec()
  } catch (error) {
    // Two processes can initialize the per-tournament lock document at the
    // same time. The unique _id makes one upsert lose; both may proceed to
    // the atomic claim below.
    if (!isDuplicateKeyError(error)) throw error
  }

  const claimed = await LockModel.findOneAndUpdate(
    { _id: tournamentId, locked: { $ne: true } },
    {
      $set: { locked: true, touchedAt: new Date() },
      $inc: { epoch: 1 },
    },
    { new: true }
  )
    .lean()
    .exec()

  if (!claimed) return null
  return { tournamentId, epoch: Number((claimed as any).epoch ?? 0) }
}

export async function releaseRoundNamespaceLease(
  connection: Connection,
  lease: RoundNamespaceLease
): Promise<boolean> {
  const LockModel = getRoundNamespaceLockModel(connection)
  const result = await LockModel.updateOne(
    {
      _id: lease.tournamentId,
      locked: true,
      epoch: lease.epoch,
    },
    { $set: { locked: false, touchedAt: new Date() } }
  ).exec()
  return result.matchedCount === 1
}
