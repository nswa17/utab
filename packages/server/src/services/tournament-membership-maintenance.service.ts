import { Types } from 'mongoose'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { TournamentModel } from '../models/tournament.js'
import { UserModel } from '../models/user.js'

type MemberRole = 'organizer' | 'adjudicator' | 'speaker' | 'audience'

export type TournamentMembershipMaintenanceSummary = {
  membershipsCreatedFromUsers: number
  membershipsCreatedFromCreatedBy: number
}

const VALID_MEMBER_ROLES: Set<string> = new Set(['organizer', 'adjudicator', 'speaker', 'audience'])

function normalizeMemberRole(value: unknown): MemberRole | null {
  if (typeof value !== 'string') return null
  if (!VALID_MEMBER_ROLES.has(value)) return null
  return value as MemberRole
}

function normalizeBackfillRole(value: unknown): MemberRole | null {
  if (value === 'superuser') return 'organizer'
  return normalizeMemberRole(value)
}

function normalizeId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (value instanceof Types.ObjectId) {
    return value.toHexString()
  }

  if (value && typeof value === 'object') {
    const record = value as {
      _bsontype?: unknown
      toHexString?: () => string
      toString?: () => string
    }
    if (record._bsontype === 'ObjectId') {
      if (typeof record.toHexString === 'function') {
        const hex = record.toHexString().trim()
        return hex.length > 0 ? hex : null
      }
      if (typeof record.toString === 'function') {
        const asString = record.toString().trim()
        return asString.length > 0 ? asString : null
      }
    }
  }

  return null
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const normalized = value
    .map((entry) => normalizeId(entry))
    .filter((entry): entry is string => entry !== null)
  return Array.from(new Set(normalized))
}

async function backfillMembership(tournamentId: string, userId: string, role: MemberRole): Promise<number> {
  const result = await TournamentMemberModel.updateOne(
    { tournamentId, userId },
    { $setOnInsert: { role } },
    { upsert: true }
  ).exec()
  return result.upsertedCount ?? 0
}

export async function runTournamentMembershipMaintenance(): Promise<TournamentMembershipMaintenanceSummary> {
  const summary: TournamentMembershipMaintenanceSummary = {
    membershipsCreatedFromUsers: 0,
    membershipsCreatedFromCreatedBy: 0,
  }

  const users = await UserModel.find()
    .select({ _id: 1, role: 1, tournaments: 1 })
    .lean<Array<{ _id: unknown; role?: unknown; tournaments?: unknown[] }>>()
    .exec()

  for (const user of users) {
    const userId = normalizeId(user._id)
    if (!userId) continue
    const role = normalizeBackfillRole(user.role)
    if (!role) continue
    const tournamentIds = normalizeIdList(user.tournaments)
    for (const tournamentId of tournamentIds) {
      summary.membershipsCreatedFromUsers += await backfillMembership(tournamentId, userId, role)
    }
  }

  const tournamentCreators = await TournamentModel.find({
    createdBy: { $exists: true, $ne: null },
  })
    .select({ _id: 1, createdBy: 1 })
    .lean<Array<{ _id: unknown; createdBy?: unknown }>>()
    .exec()

  const creatorIds = Array.from(
    new Set(
      tournamentCreators
        .map((tournament) => normalizeId(tournament.createdBy))
        .filter((value): value is string => value !== null)
    )
  )

  const creatorUsers = await UserModel.find({ _id: { $in: creatorIds } })
    .select({ _id: 1, role: 1 })
    .lean<Array<{ _id: unknown; role?: unknown }>>()
    .exec()
  const creatorRoleMap = new Map<string, MemberRole>()
  for (const user of creatorUsers) {
    const userId = normalizeId(user._id)
    const role = normalizeBackfillRole(user.role)
    if (userId && role) creatorRoleMap.set(userId, role)
  }

  for (const tournament of tournamentCreators) {
    const tournamentId = normalizeId(tournament._id)
    const creatorId = normalizeId(tournament.createdBy)
    if (!tournamentId) continue
    if (!creatorId) continue
    const role = creatorRoleMap.get(creatorId)
    if (role !== 'organizer') continue
    summary.membershipsCreatedFromCreatedBy += await backfillMembership(
      tournamentId,
      creatorId,
      'organizer'
    )
  }

  return summary
}
