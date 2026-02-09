import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectDatabase, disconnectDatabase } from '../config/database.js'
import { TournamentModel } from '../models/tournament.js'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { UserModel } from '../models/user.js'
import { hashPassword } from '../services/hash.service.js'

type PlainObject = Record<string, unknown>
type MemberRole = 'organizer' | 'adjudicator' | 'speaker' | 'audience'

export type SecurityMigrationSummary = {
  tournamentsScanned: number
  tournamentsUpdated: number
  tournamentAccessRelaxed: number
  tournamentPasswordsHashed: number
  membershipsCreatedFromUsers: number
  membershipsCreatedFromCreatedBy: number
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../../../..')

dotenv.config({ path: path.join(rootDir, '.env') })
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.join(rootDir, '.env.development') })
}

const VALID_MEMBER_ROLES: Set<string> = new Set(['organizer', 'adjudicator', 'speaker', 'audience'])

function asRecord(value: unknown): PlainObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return { ...(value as PlainObject) }
}

function normalizeMemberRole(value: unknown): MemberRole | null {
  if (typeof value !== 'string') return null
  if (!VALID_MEMBER_ROLES.has(value)) return null
  return value as MemberRole
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return parsed
}

function toStableString(value: unknown): string {
  return JSON.stringify(value, Object.keys(asRecord(value)).sort())
}

async function normalizeTournamentAuth(
  authValue: unknown
): Promise<{
  nextAuth: PlainObject
  changed: boolean
  accessRelaxed: boolean
  passwordHashed: boolean
}> {
  const auth = asRecord(authValue)
  const access = asRecord(auth.access)
  const nextAuth: PlainObject = { ...auth }

  const currentRequired = access.required === true
  const version = toPositiveInt(access.version, 1)

  let passwordHash =
    typeof access.passwordHash === 'string' && access.passwordHash.length > 0
      ? access.passwordHash
      : undefined
  let passwordHashed = false
  if (!passwordHash && typeof access.password === 'string' && access.password.length > 0) {
    passwordHash = await hashPassword(access.password)
    passwordHashed = true
  }

  let required = currentRequired
  let accessRelaxed = false
  if (!passwordHash && required) {
    required = false
    accessRelaxed = true
  }

  const nextAccess: PlainObject = {
    required,
    version,
  }
  if (passwordHash) {
    nextAccess.passwordHash = passwordHash
  }

  nextAuth.access = nextAccess

  const changed = toStableString(access) !== toStableString(nextAccess)
  return { nextAuth, changed, accessRelaxed, passwordHashed }
}

async function backfillMembership(
  tournamentId: string,
  userId: string,
  role: MemberRole
): Promise<number> {
  const result = await TournamentMemberModel.updateOne(
    { tournamentId, userId },
    { $setOnInsert: { role } },
    { upsert: true }
  ).exec()
  return result.upsertedCount ?? 0
}

export async function runSecurityPhase8Migration(): Promise<SecurityMigrationSummary> {
  const summary: SecurityMigrationSummary = {
    tournamentsScanned: 0,
    tournamentsUpdated: 0,
    tournamentAccessRelaxed: 0,
    tournamentPasswordsHashed: 0,
    membershipsCreatedFromUsers: 0,
    membershipsCreatedFromCreatedBy: 0,
  }

  const tournaments = await TournamentModel.find().lean().exec()
  summary.tournamentsScanned = tournaments.length

  for (const tournament of tournaments) {
    const { nextAuth, changed, accessRelaxed, passwordHashed } = await normalizeTournamentAuth(
      (tournament as any).auth
    )

    if (changed) {
      await TournamentModel.updateOne({ _id: tournament._id }, { $set: { auth: nextAuth } }).exec()
      summary.tournamentsUpdated += 1
    }
    if (accessRelaxed) summary.tournamentAccessRelaxed += 1
    if (passwordHashed) summary.tournamentPasswordsHashed += 1
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

async function main() {
  await connectDatabase()
  try {
    const summary = await runSecurityPhase8Migration()
    // eslint-disable-next-line no-console
    console.log('Phase 8 security migration completed')
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await disconnectDatabase()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to run Phase 8 security migration', err)
    process.exitCode = 1
  })
}
