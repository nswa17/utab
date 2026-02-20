import type { RequestHandler } from 'express'
import { Types } from 'mongoose'
import { AuditLogModel } from '../models/audit-log.js'
import { StyleModel } from '../models/style.js'
import { TournamentModel } from '../models/tournament.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { buildZip } from '../services/zip.js'
import { badRequest, notFound } from './shared/http-errors.js'

type CsvRecord = Record<string, string>

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function toCsvScalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value) || isPlainObject(value)) return JSON.stringify(value)
  return String(value)
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function flattenObject(value: Record<string, unknown>, prefix = '', out: CsvRecord = {}): CsvRecord {
  for (const key of Object.keys(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const child = value[key]
    if (isPlainObject(child)) {
      flattenObject(child, fullKey, out)
      continue
    }
    out[fullKey] = toCsvScalar(child)
  }
  return out
}

function toCsvRecord(row: unknown): CsvRecord {
  if (isPlainObject(row)) return flattenObject(row)
  return { value: toCsvScalar(row) }
}

function buildCsv(rows: unknown[]): string {
  if (rows.length === 0) return ''
  const records = rows.map((row) => toCsvRecord(row))
  const headers = Array.from(
    records.reduce((set, record) => {
      for (const key of Object.keys(record)) {
        set.add(key)
      }
      return set
    }, new Set<string>())
  )
  if (headers.length === 0) return ''
  const lines = [headers.join(',')]
  for (const record of records) {
    lines.push(
      headers
        .map((header) => {
          return escapeCsv(record[header] ?? '')
        })
        .join(',')
    )
  }
  return lines.join('\n')
}

function toJsonText(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function normalizeFilePart(value: string): string {
  const normalized = value.trim().replace(/[\\/:*?"<>|]/g, '_')
  return normalized.length > 0 ? normalized : 'tournament'
}

function parseJsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function extractFileNameFromCollection(collectionName: string): string {
  const normalized = collectionName.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
  return normalized.length > 0 ? normalized : 'collection'
}

export const exportTournamentBundle: RequestHandler = async (req, res, next) => {
  try {
    const tournamentId = String(req.params.id ?? '')
    if (!Types.ObjectId.isValid(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }

    const tournament = await TournamentModel.findById(tournamentId).lean().exec()
    if (!tournament) {
      notFound(res, 'Tournament not found')
      return
    }

    const [style, auditLogs, connection] = await Promise.all([
      typeof tournament.style === 'number'
        ? StyleModel.findOne({ id: tournament.style }).lean().exec()
        : Promise.resolve(null),
      AuditLogModel.find({ tournamentId }).sort({ createdAt: 1 }).lean().exec(),
      getTournamentConnection(tournamentId),
    ])

    const db = connection.db
    if (!db) {
      throw new Error('Tournament database is not ready')
    }

    const list = await db.listCollections({}, { nameOnly: true }).toArray()
    const collectionNames = list
      .map((item) => String(item.name ?? ''))
      .filter((name) => name.length > 0 && !name.startsWith('system.'))
      .sort((a, b) => a.localeCompare(b))

    const collectionEntries = await Promise.all(
      collectionNames.map(async (collectionName) => {
        const docs = await db.collection(collectionName).find({}).toArray()
        return {
          collectionName,
          docs: parseJsonClone(docs),
        }
      })
    )

    const generatedAt = new Date()
    const metadata = {
      format: 'utab.tournament.export/v2',
      generatedAt: generatedAt.toISOString(),
      tournamentId,
      tournamentName: tournament.name,
      exportedBy: req.session?.userId ?? null,
      collectionCount: collectionEntries.length,
      collectionNames: collectionEntries.map((entry) => entry.collectionName),
      fileLayout: {
        jsonDir: 'json/',
        csvDir: 'csv/',
      },
    }

    const zipEntries: Array<{ path: string; content: string }> = [
      { path: 'metadata.json', content: toJsonText(metadata) },
      { path: 'json/tournament.json', content: toJsonText(parseJsonClone(tournament)) },
      { path: 'csv/tournament.csv', content: buildCsv([parseJsonClone(tournament)]) },
      { path: 'json/audit-logs.json', content: toJsonText(parseJsonClone(auditLogs)) },
      { path: 'csv/audit-logs.csv', content: buildCsv(parseJsonClone(auditLogs)) },
    ]

    if (style) {
      zipEntries.push({
        path: 'json/style.json',
        content: toJsonText(parseJsonClone(style)),
      })
      zipEntries.push({
        path: 'csv/style.csv',
        content: buildCsv([parseJsonClone(style)]),
      })
    }

    const usedCollectionFileNames = new Set<string>()
    for (const entry of collectionEntries) {
      const baseFileName = extractFileNameFromCollection(entry.collectionName)
      let fileName = baseFileName
      let serial = 2
      while (usedCollectionFileNames.has(fileName)) {
        fileName = `${baseFileName}_${serial}`
        serial += 1
      }
      usedCollectionFileNames.add(fileName)
      zipEntries.push({
        path: `json/collections/${fileName}.json`,
        content: toJsonText(entry.docs),
      })
      zipEntries.push({
        path: `csv/collections/${fileName}.csv`,
        content: buildCsv(entry.docs),
      })
    }

    zipEntries.push({
      path: 'manifest.json',
      content: toJsonText({
        generatedAt: metadata.generatedAt,
        tournamentId,
        tournamentName: tournament.name,
        files: [...zipEntries.map((entry) => entry.path), 'manifest.json'],
      }),
    })

    const zip = buildZip(
      zipEntries.map((entry) => ({
        path: entry.path,
        content: entry.content,
        modifiedAt: generatedAt,
      }))
    )

    const safeName = normalizeFilePart(String(tournament.name ?? 'tournament')).slice(0, 80)
    const stamp = generatedAt.toISOString().replace(/[:.]/g, '-')
    const filename = `${safeName}-${tournamentId}-${stamp}.zip`
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.status(200).send(zip)
  } catch (err) {
    next(err)
  }
}
