import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'
import { isDuplicateKeyError } from './mongo-error.service.js'

export const TOURNAMENT_MEMBERSHIP_LOCK_COLLECTION = 'tournament_membership_locks'
export const TOURNAMENT_MEMBERSHIP_LEASE_STALE_MS = 5 * 60 * 1000

const tournamentMembershipLockSchema = new Schema(
  {
    _id: { type: String, required: true },
    locked: { type: Boolean, default: false },
    epoch: { type: Number, default: 0 },
    touchedAt: { type: Date, default: null },
  },
  { versionKey: false, collection: TOURNAMENT_MEMBERSHIP_LOCK_COLLECTION }
)

type TournamentMembershipLock = InferSchemaType<typeof tournamentMembershipLockSchema>

const TournamentMembershipLockModel =
  (models.TournamentMembershipMutationLock as Model<TournamentMembershipLock> | undefined) ??
  model<TournamentMembershipLock>(
    'TournamentMembershipMutationLock',
    tournamentMembershipLockSchema
  )

export type TournamentMembershipLease = {
  key: string
  epoch: number
}

function membershipLockKey(tournamentId: string, username: string): string {
  return `${tournamentId}:member:${username.trim()}`
}

function lifecycleLockKey(tournamentId: string): string {
  return `${tournamentId}:lifecycle`
}

async function acquireTournamentMembershipLeaseByKey(
  key: string
): Promise<TournamentMembershipLease | null> {
  try {
    await TournamentMembershipLockModel.updateOne(
      { _id: key },
      { $setOnInsert: { locked: false, epoch: 0, touchedAt: new Date() } },
      { upsert: true }
    ).exec()
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error
  }

  const staleBefore = new Date(Date.now() - TOURNAMENT_MEMBERSHIP_LEASE_STALE_MS)
  const claimed = await TournamentMembershipLockModel.findOneAndUpdate(
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

export async function acquireTournamentMembershipLease(
  tournamentId: string,
  username: string
): Promise<TournamentMembershipLease | null> {
  return acquireTournamentMembershipLeaseByKey(membershipLockKey(tournamentId, username))
}

export async function acquireTournamentMembershipLifecycleLease(
  tournamentId: string
): Promise<TournamentMembershipLease | null> {
  return acquireTournamentMembershipLeaseByKey(lifecycleLockKey(tournamentId))
}

export type TournamentMembershipMutationLeases = {
  lifecycle: TournamentMembershipLease
  member: TournamentMembershipLease
}

export async function acquireTournamentMembershipMutationLeases(
  tournamentId: string,
  username: string
): Promise<TournamentMembershipMutationLeases | null> {
  const lifecycle = await acquireTournamentMembershipLifecycleLease(tournamentId)
  if (!lifecycle) return null

  const member = await acquireTournamentMembershipLease(tournamentId, username)
  if (member) return { lifecycle, member }

  const released = await releaseTournamentMembershipLease(lifecycle)
  if (!released) {
    throw new Error('Failed to release tournament membership lifecycle lease')
  }
  return null
}

export async function releaseTournamentMembershipMutationLeases(
  leases: TournamentMembershipMutationLeases
): Promise<boolean> {
  const memberReleased = await releaseTournamentMembershipLease(leases.member)
  const lifecycleReleased = await releaseTournamentMembershipLease(leases.lifecycle)
  return memberReleased && lifecycleReleased
}

export async function releaseTournamentMembershipLease(
  lease: TournamentMembershipLease
): Promise<boolean> {
  const result = await TournamentMembershipLockModel.updateOne(
    { _id: lease.key, locked: true, epoch: lease.epoch },
    { $set: { locked: false, touchedAt: new Date() } }
  ).exec()
  return result.matchedCount === 1
}
