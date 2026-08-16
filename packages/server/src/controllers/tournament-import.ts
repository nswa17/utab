import { Buffer } from 'node:buffer'
import { isDeepStrictEqual } from 'node:util'
import type { RequestHandler } from 'express'
import { Types } from 'mongoose'
import { getAuthenticatedActorId } from '../middleware/auth.js'
import { AuditLogModel } from '../models/audit-log.js'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { TournamentModel } from '../models/tournament.js'
import { StyleModel } from '../models/style.js'
import { UserModel } from '../models/user.js'
import { mergeTournamentAuth } from '../services/tournament-access.service.js'
import { dropTournamentDatabase, getTournamentConnection } from '../services/tournament-db.service.js'
import { extractZip } from '../services/zip.js'
import { badRequest } from './shared/http-errors.js'

type PlainObject = Record<string, unknown>

type ImportSummary = {
  tournament: Record<string, unknown>
  sourceTournamentId: string | null
  sourceTournamentName: string
  importedCollections: Array<{ name: string; count: number }>
  importedDocuments: number
  importedAuditLogs: number
}

class TournamentImportError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'TournamentImportError'
    this.statusCode = statusCode
  }
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/

function asRecord(value: unknown): PlainObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as PlainObject
}

function requireRecord(value: unknown, path: string): PlainObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TournamentImportError(400, `Invalid bundle entry: ${path}`)
  }
  return value as PlainObject
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TournamentImportError(400, `Invalid bundle entry: ${path}`)
  }
  return value
}

function parseJsonEntry(buffer: Buffer | undefined, path: string): unknown {
  if (!buffer) {
    throw new TournamentImportError(400, `Backup bundle is missing ${path}`)
  }
  try {
    return JSON.parse(buffer.toString('utf8'))
  } catch {
    throw new TournamentImportError(400, `Invalid JSON in ${path}`)
  }
}

function normalizeString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length > 0) return trimmed
  }
  return fallback
}

function normalizeNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return fallback
}

function normalizeNumberArray(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback
  const normalized = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
  return normalized.length > 0 ? normalized : fallback
}

const STYLE_SNAPSHOT_FIELDS = [
  'name',
  'team_num',
  'score_weights',
  'side_labels',
  'side_labels_short',
  'speaker_sequence',
  'range',
  'adjudicator_range',
  'roles',
  'user_defined_data',
] as const

function normalizeStyleSnapshot(value: unknown, expectedId: number): PlainObject {
  const snapshot = requireRecord(value, 'json/style.json')
  const snapshotId = Number(snapshot.id)
  if (!Number.isInteger(snapshotId) || snapshotId !== expectedId) {
    throw new TournamentImportError(400, 'Backup style does not match tournament style')
  }
  const name = normalizeString(snapshot.name)
  if (!name) throw new TournamentImportError(400, 'Backup style name is required')
  for (const field of ['score_weights', 'speaker_sequence', 'adjudicator_range', 'roles']) {
    if (snapshot[field] === undefined) {
      throw new TournamentImportError(400, `Backup style is missing ${field}`)
    }
  }
  const normalized: PlainObject = { id: expectedId, name }
  STYLE_SNAPSHOT_FIELDS.forEach((field) => {
    if (field === 'name' || snapshot[field] === undefined) return
    normalized[field] = snapshot[field]
  })
  return normalized
}

function comparableStyle(value: PlainObject): PlainObject {
  const comparable: PlainObject = {}
  STYLE_SNAPSHOT_FIELDS.forEach((field) => {
    if (value[field] !== undefined) comparable[field] = JSON.parse(JSON.stringify(value[field]))
  })
  return comparable
}

async function ensureImportedStyle(
  entryMap: Map<string, Buffer>,
  sourceStyleId: number
): Promise<{ styleId: number; createdStyleId: number | null }> {
  const styleEntry = entryMap.get('json/style.json')
  if (!styleEntry) {
    const existing = await StyleModel.exists({ id: sourceStyleId }).exec()
    if (!existing) {
      throw new TournamentImportError(400, 'Backup bundle is missing json/style.json')
    }
    return { styleId: sourceStyleId, createdStyleId: null }
  }

  const snapshot = normalizeStyleSnapshot(
    parseJsonEntry(styleEntry, 'json/style.json'),
    sourceStyleId
  )
  const existing = await StyleModel.findOne({ id: sourceStyleId }).lean().exec()
  if (!existing) {
    await StyleModel.create(snapshot)
    return { styleId: sourceStyleId, createdStyleId: sourceStyleId }
  }
  if (
    isDeepStrictEqual(
      comparableStyle(existing as PlainObject),
      comparableStyle(snapshot)
    )
  ) {
    return { styleId: sourceStyleId, createdStyleId: null }
  }

  const highest = await StyleModel.findOne().sort({ id: -1 }).select({ id: 1 }).lean().exec()
  let candidateId = Math.max(sourceStyleId + 1, Number(highest?.id ?? 0) + 1, 1)
  while (await StyleModel.exists({ id: candidateId }).exec()) candidateId += 1
  await StyleModel.create({ ...snapshot, id: candidateId })
  return { styleId: candidateId, createdStyleId: candidateId }
}

function deriveCollectionName(path: string): string {
  const fileName = path.split('/').pop() ?? ''
  const normalized = fileName.replace(/\.json$/i, '').trim()
  if (!normalized) {
    throw new TournamentImportError(400, `Invalid collection entry path: ${path}`)
  }
  return normalized
}

function extractFileNameFromCollection(collectionName: string): string {
  const normalized = collectionName.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
  return normalized.length > 0 ? normalized : 'collection'
}

function normalizeCollectionNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeString(item))
    .filter((item) => item.length > 0)
}

function normalizeCollectionPath(value: unknown): string {
  return normalizeString(value).replace(/\\/g, '/').replace(/^\/+/, '')
}

function normalizeCollectionFileMappings(value: unknown): Map<string, string> {
  if (!Array.isArray(value)) return new Map()
  const mappings = new Map<string, string>()
  value.forEach((entry, index) => {
    const record = requireRecord(entry, `metadata.collectionFiles[${index}]`)
    const path = normalizeCollectionPath(record.path)
    const collectionName = normalizeString(record.collectionName)
    if (!path || !collectionName || mappings.has(path)) {
      throw new TournamentImportError(400, 'Backup bundle collection metadata is inconsistent')
    }
    mappings.set(path, collectionName)
  })
  return mappings
}

function buildCollectionNameByPath(metadata: PlainObject): Map<string, string> {
  const explicitMappings = normalizeCollectionFileMappings(metadata.collectionFiles)
  if (explicitMappings.size > 0) {
    return explicitMappings
  }

  const metadataCollectionNames = normalizeCollectionNames(metadata.collectionNames)
  if (metadataCollectionNames.length === 0) {
    return new Map()
  }

  const usedCollectionFileNames = new Set<string>()
  const mappings = new Map<string, string>()
  metadataCollectionNames.forEach((collectionName) => {
    const baseFileName = extractFileNameFromCollection(collectionName)
    let fileName = baseFileName
    let serial = 2
    while (usedCollectionFileNames.has(fileName)) {
      fileName = `${baseFileName}_${serial}`
      serial += 1
    }
    usedCollectionFileNames.add(fileName)
    mappings.set(`json/collections/${fileName}.json`, collectionName)
  })
  return mappings
}

function reviveZipValue(
  value: unknown,
  options: { targetTournamentId?: string; tournamentIdAsObjectId?: boolean },
  key?: string
): unknown {
  if (typeof value === 'string') {
    if (key === '_id' && Types.ObjectId.isValid(value)) {
      return new Types.ObjectId(value)
    }
    if (key === 'tournamentId' && options.targetTournamentId) {
      return options.tournamentIdAsObjectId === false
        ? options.targetTournamentId
        : new Types.ObjectId(options.targetTournamentId)
    }
    if (ISO_DATE_PATTERN.test(value)) {
      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => reviveZipValue(item, options))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const record = value as PlainObject
  const out: PlainObject = {}
  for (const [childKey, childValue] of Object.entries(record)) {
    out[childKey] = reviveZipValue(childValue, options, childKey)
  }
  return out
}

function reviveTournamentDocument(doc: unknown, tournamentId: string): PlainObject {
  return requireRecord(
    reviveZipValue(doc, {
      targetTournamentId: tournamentId,
      tournamentIdAsObjectId: true,
    }),
    'json/collections/*.json'
  )
}

function reviveAuditLogDocument(doc: unknown, tournamentId: string): PlainObject {
  const revived = requireRecord(
    reviveZipValue(doc, {
      targetTournamentId: tournamentId,
      tournamentIdAsObjectId: false,
    }),
    'json/audit-logs.json'
  )
  return {
    ...revived,
    _id: new Types.ObjectId(),
    tournamentId,
  }
}

async function attachOrganizerMembership(
  session: Record<string, unknown> | undefined,
  tournamentId: string
): Promise<void> {
  const userId = normalizeString(session?.userId)
  if (!userId) return

  await Promise.all([
    UserModel.updateOne({ _id: userId }, { $addToSet: { tournaments: tournamentId } }).exec(),
    TournamentMemberModel.updateOne(
      { tournamentId, userId },
      { $setOnInsert: { role: 'organizer' } },
      { upsert: true }
    ).exec(),
  ])

  const current = Array.isArray(session?.tournaments)
    ? session.tournaments.map((value) => String(value))
    : []
  if (!current.includes(tournamentId)) {
    ;(session as PlainObject).tournaments = [...current, tournamentId]
  }
}

async function importTournamentFromBundle(
  buffer: Buffer,
  actorUserId?: string,
  session?: Record<string, unknown>
): Promise<ImportSummary> {
  let zipEntries
  try {
    zipEntries = extractZip(buffer)
  } catch (error) {
    throw new TournamentImportError(
      400,
      error instanceof Error ? error.message : 'Invalid backup zip file'
    )
  }
  if (zipEntries.length === 0) {
    throw new TournamentImportError(400, 'Backup bundle is empty')
  }

  const entryMap = new Map(zipEntries.map((entry) => [entry.path, entry.content]))
  const metadata = requireRecord(parseJsonEntry(entryMap.get('metadata.json'), 'metadata.json'), 'metadata.json')
  const format = normalizeString(metadata.format)
  if (format !== 'utab.tournament.export/v2') {
    throw new TournamentImportError(400, 'Unsupported backup format')
  }

  const tournamentSnapshot = requireRecord(
    parseJsonEntry(entryMap.get('json/tournament.json'), 'json/tournament.json'),
    'json/tournament.json'
  )
  const auditLogs = requireArray(
    parseJsonEntry(entryMap.get('json/audit-logs.json'), 'json/audit-logs.json'),
    'json/audit-logs.json'
  )

  const collectionJsonEntries = zipEntries.filter(
    (entry) => entry.path.startsWith('json/collections/') && entry.path.endsWith('.json')
  )
  const collectionNameByPath = buildCollectionNameByPath(metadata)
  if (collectionNameByPath.size > 0 && collectionNameByPath.size !== collectionJsonEntries.length) {
    throw new TournamentImportError(400, 'Backup bundle collection metadata is inconsistent')
  }

  const mergedAuth = await mergeTournamentAuth(undefined, tournamentSnapshot.auth, { isCreate: true })
  if (mergedAuth.error) {
    throw new TournamentImportError(400, mergedAuth.error)
  }
  const sourceStyleId = normalizeNumber(tournamentSnapshot.style, 1)

  const createdTournament = await TournamentModel.create({
    name: normalizeString(tournamentSnapshot.name, normalizeString(metadata.tournamentName, 'Tournament')),
    style: sourceStyleId,
    options: asRecord(tournamentSnapshot.options),
    total_round_num: normalizeNumber(tournamentSnapshot.total_round_num, 4),
    current_round_num: normalizeNumber(tournamentSnapshot.current_round_num, 1),
    preev_weights: normalizeNumberArray(tournamentSnapshot.preev_weights, [0, 0, 0, 0, 0, 0]),
    auth: mergedAuth.auth,
    user_defined_data: asRecord(tournamentSnapshot.user_defined_data),
    createdBy: actorUserId ?? (normalizeString(tournamentSnapshot.createdBy) || undefined),
  })

  const tournamentId = String(createdTournament._id)
  let createdStyleId: number | null = null

  try {
    const importedStyle = await ensureImportedStyle(entryMap, sourceStyleId)
    createdStyleId = importedStyle.createdStyleId
    if (importedStyle.styleId !== sourceStyleId) {
      createdTournament.style = importedStyle.styleId
      await createdTournament.save()
    }
    const connection = await getTournamentConnection(tournamentId)
    const db = connection.db
    if (!db) {
      throw new TournamentImportError(500, 'Tournament database is not ready')
    }

    const importedCollections: Array<{ name: string; count: number }> = []
    let importedDocuments = 0

    for (let index = 0; index < collectionJsonEntries.length; index += 1) {
      const entry = collectionJsonEntries[index]
      const collectionName =
        collectionNameByPath.size > 0
          ? collectionNameByPath.get(entry.path)
          : deriveCollectionName(entry.path)
      if (!collectionName) {
        throw new TournamentImportError(400, 'Backup bundle collection metadata is inconsistent')
      }
      const docs = requireArray(parseJsonEntry(entry.content, entry.path), entry.path)
      const revivedDocs = docs.map((doc) => reviveTournamentDocument(doc, tournamentId))
      if (revivedDocs.length > 0) {
        await db.collection(collectionName).insertMany(revivedDocs, { ordered: true })
      }
      importedCollections.push({ name: collectionName, count: revivedDocs.length })
      importedDocuments += revivedDocs.length
    }

    const revivedAuditLogs = auditLogs.map((entry) => reviveAuditLogDocument(entry, tournamentId))
    if (revivedAuditLogs.length > 0) {
      await AuditLogModel.insertMany(revivedAuditLogs, { ordered: true })
    }

    await attachOrganizerMembership(session, tournamentId)

    return {
      tournament: createdTournament.toJSON() as Record<string, unknown>,
      sourceTournamentId: normalizeString(metadata.tournamentId) || null,
      sourceTournamentName: normalizeString(metadata.tournamentName),
      importedCollections,
      importedDocuments,
      importedAuditLogs: revivedAuditLogs.length,
    }
  } catch (error) {
    const cleanupTasks: Promise<unknown>[] = [
      TournamentModel.deleteOne({ _id: tournamentId }).exec(),
      AuditLogModel.deleteMany({ tournamentId }).exec(),
      TournamentMemberModel.deleteMany({ tournamentId }).exec(),
      dropTournamentDatabase(tournamentId),
    ]
    if (actorUserId) {
      cleanupTasks.push(
        UserModel.updateMany(
          { _id: actorUserId },
          { $pull: { tournaments: tournamentId } }
        ).exec()
      )
    }
    if (createdStyleId !== null) {
      cleanupTasks.push(StyleModel.deleteOne({ id: createdStyleId }).exec())
    }
    await Promise.allSettled(cleanupTasks)
    throw error
  }
}

export const importTournamentBundle: RequestHandler = async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      badRequest(res, 'Backup zip file is required')
      return
    }

    const actorUserId = getAuthenticatedActorId(req) ?? undefined
    const data = await importTournamentFromBundle(
      req.body,
      actorUserId,
      req.session as unknown as Record<string, unknown> | undefined
    )
    res.status(201).json({ data, errors: [] })
  } catch (error) {
    if (error instanceof TournamentImportError) {
      res.status(error.statusCode).json({
        data: null,
        errors: [{ name: error.statusCode >= 500 ? 'InternalError' : 'BadRequest', message: error.message }],
      })
      return
    }
    next(error)
  }
}
