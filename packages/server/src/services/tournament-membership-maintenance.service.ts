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
    .lean()
    .exec()

  for (const user of users) {
    const role = normalizeMemberRole((user as any).role)
    if (!role) continue
    const tournamentIds = Array.isArray((user as any).tournaments)
      ? (user as any).tournaments.map((id: unknown) => String(id)).filter((id: string) => id.length > 0)
      : []
    for (const tournamentId of tournamentIds) {
      summary.membershipsCreatedFromUsers += await backfillMembership(
        tournamentId,
        String(user._id),
        role
      )
    }
  }

  const tournamentCreators = await TournamentModel.find({
    createdBy: { $exists: true, $ne: null },
  })
    .select({ _id: 1, createdBy: 1 })
    .lean()
    .exec()

  const creatorIds = Array.from(
    new Set(
      tournamentCreators
        .map((tournament) => (tournament as any).createdBy)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  )

  const creatorUsers = await UserModel.find({ _id: { $in: creatorIds } })
    .select({ _id: 1, role: 1 })
    .lean()
    .exec()
  const creatorRoleMap = new Map<string, MemberRole>()
  for (const user of creatorUsers) {
    const role = normalizeMemberRole((user as any).role)
    if (role) creatorRoleMap.set(String(user._id), role)
  }

  for (const tournament of tournamentCreators) {
    const creatorId = typeof (tournament as any).createdBy === 'string' ? (tournament as any).createdBy : null
    if (!creatorId) continue
    const role = creatorRoleMap.get(creatorId)
    if (role !== 'organizer') continue
    summary.membershipsCreatedFromCreatedBy += await backfillMembership(
      String(tournament._id),
      creatorId,
      'organizer'
    )
  }

  return summary
}
