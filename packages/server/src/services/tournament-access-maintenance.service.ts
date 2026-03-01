import { TournamentModel } from '../models/tournament.js'
import { hashPassword } from './hash.service.js'

type PlainObject = Record<string, unknown>

export type TournamentAccessMaintenanceSummary = {
  tournamentsScanned: number
  tournamentsUpdated: number
  tournamentAccessRelaxed: number
  tournamentPasswordsHashed: number
}

function asRecord(value: unknown): PlainObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return { ...(value as PlainObject) }
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
  if (passwordHash) nextAccess.passwordHash = passwordHash
  nextAuth.access = nextAccess

  const changed = toStableString(access) !== toStableString(nextAccess)
  return { nextAuth, changed, accessRelaxed, passwordHashed }
}

export async function runTournamentAccessMaintenance(): Promise<TournamentAccessMaintenanceSummary> {
  const summary: TournamentAccessMaintenanceSummary = {
    tournamentsScanned: 0,
    tournamentsUpdated: 0,
    tournamentAccessRelaxed: 0,
    tournamentPasswordsHashed: 0,
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

  return summary
}
