import { Types } from 'mongoose'
import { TournamentModel } from '../models/tournament.js'
import { dropTournamentDatabase, getTournamentConnection } from '../services/tournament-db.service.js'
import {
  DevToolsServiceError,
  type CopiedCollectionSummary,
  type CopyTournamentResponse,
} from './types.js'

function parseJsonClone<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function copiedTournamentName(name: unknown): string {
  const normalized = String(name ?? '').trim() || 'Tournament'
  return `${normalized} (Copy)`
}

function normalizeCollectionName(value: unknown): string {
  return String(value ?? '').trim()
}

function shouldSkipCollection(name: string): boolean {
  return !name || name.startsWith('system.')
}

function remapTournamentId(value: unknown, targetTournamentId: string): unknown {
  if (typeof value === 'string') return targetTournamentId
  return new Types.ObjectId(targetTournamentId)
}

function remapDocumentTournamentId(
  document: Record<string, unknown>,
  targetTournamentId: string
): Record<string, unknown> {
  if (!Object.prototype.hasOwnProperty.call(document, 'tournamentId')) return document
  return {
    ...document,
    tournamentId: remapTournamentId((document as any).tournamentId, targetTournamentId),
  }
}

async function copyTournamentCollections(
  sourceTournamentId: string,
  targetTournamentId: string
): Promise<CopiedCollectionSummary[]> {
  const sourceConnection = await getTournamentConnection(sourceTournamentId)
  const targetConnection = await getTournamentConnection(targetTournamentId)
  const sourceDb = sourceConnection.db
  const targetDb = targetConnection.db

  if (!sourceDb || !targetDb) {
    throw new DevToolsServiceError(500, 'Tournament database is not ready')
  }

  const collections = await sourceDb.listCollections({}, { nameOnly: true }).toArray()
  const copied: CopiedCollectionSummary[] = []

  for (const collectionMeta of collections) {
    const name = normalizeCollectionName(collectionMeta?.name)
    if (shouldSkipCollection(name)) continue

    const sourceCollection = sourceDb.collection(name)
    const targetCollection = targetDb.collection(name)
    const sourceDocuments = (await sourceCollection.find({}).toArray()) as Array<Record<string, unknown>>

    if (sourceDocuments.length === 0) {
      copied.push({ name, count: 0 })
      continue
    }

    const targetDocuments = sourceDocuments.map((document) =>
      remapDocumentTournamentId(document, targetTournamentId)
    )

    await targetCollection.insertMany(targetDocuments, { ordered: true })
    copied.push({ name, count: targetDocuments.length })
  }

  return copied
}

export async function copyTournamentWithData(
  sourceTournamentId: string,
  actorUserId?: string
): Promise<CopyTournamentResponse> {
  const sourceTournament = await TournamentModel.findById(sourceTournamentId).lean().exec()
  if (!sourceTournament) {
    throw new DevToolsServiceError(404, 'Tournament not found')
  }

  const createdTournament = await TournamentModel.create({
    name: copiedTournamentName((sourceTournament as any)?.name),
    style: Number((sourceTournament as any)?.style ?? 1),
    options: parseJsonClone((sourceTournament as any)?.options ?? {}),
    total_round_num: Number((sourceTournament as any)?.total_round_num ?? 4),
    current_round_num: Number((sourceTournament as any)?.current_round_num ?? 1),
    preev_weights: parseJsonClone((sourceTournament as any)?.preev_weights ?? [0, 0, 0, 0, 0, 0]),
    auth: parseJsonClone((sourceTournament as any)?.auth ?? { access: { required: false, version: 1 } }),
    user_defined_data: parseJsonClone((sourceTournament as any)?.user_defined_data ?? {}),
    createdBy:
      actorUserId || String((sourceTournament as any)?.createdBy ?? '').trim() || undefined,
  })

  const targetTournamentId = String(createdTournament._id)
  try {
    const copiedCollections = await copyTournamentCollections(sourceTournamentId, targetTournamentId)
    const copiedDocuments = copiedCollections.reduce((sum, item) => sum + item.count, 0)

    return {
      sourceTournamentId,
      tournamentId: targetTournamentId,
      sourceTournamentName: String((sourceTournament as any)?.name ?? ''),
      tournamentName: String((createdTournament as any)?.name ?? ''),
      copiedCollections,
      copiedDocuments,
    }
  } catch (error) {
    await TournamentModel.deleteOne({ _id: targetTournamentId }).exec()
    await dropTournamentDatabase(targetTournamentId)
    throw error
  }
}
