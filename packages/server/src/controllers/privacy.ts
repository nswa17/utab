import type { RequestHandler } from 'express'
import { getAdjudicatorModel } from '../models/adjudicator.js'
import { getRoundModel } from '../models/round.js'
import { getDrawModel } from '../models/draw.js'
import { getRawAdjudicatorResultModel } from '../models/raw-adjudicator-result.js'
import { getRawSpeakerResultModel } from '../models/raw-speaker-result.js'
import { getSpeakerModel } from '../models/speaker.js'
import { getSubmissionModel } from '../models/submission.js'
import { getTeamModel } from '../models/team.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import {
  acquireRoundNamespaceLease,
  releaseRoundNamespaceLease,
  type RoundNamespaceLease,
} from '../services/round-namespace-guard.service.js'
import {
  acquireRoundMutationLeases,
  releaseRoundMutationLeases,
  type RoundMutationLease,
} from '../services/round-write-guard.service.js'
import {
  acquireEntityNamespaceLeases,
  releaseEntityNamespaceLeases,
  type EntityNamespaceLease,
} from '../services/entity-namespace-guard.service.js'
import { ensureSensitiveActionReauthentication } from './shared/sensitive-action.js'
import { notFound } from './shared/http-errors.js'
import { ensureObjectId, ensureTournamentId } from './shared/request-validators.js'

type EraseMode = 'anonymize' | 'hard_delete'

export type PersonalDataEraseInput = {
  tournamentId: string
  entityId: string
  reason: string
  approvedBy?: string
  targetRefs?: string[]
  eraseMode?: EraseMode
}

export type PersonalDataEraseResult = {
  tournamentId: string
  entityType: 'speaker' | 'adjudicator'
  entityId: string
  redacted: true
  eraseMode: EraseMode
  reason: string
  approvedBy: string | null
  targetRefs: string[]
  submissionCommentsCleared: number
}

function buildRedactedLabel(kind: 'speaker' | 'adjudicator', entityId: string): string {
  const suffix = entityId.slice(-6)
  if (kind === 'speaker') return `Deleted Speaker (${suffix})`
  return `Deleted Adjudicator (${suffix})`
}

function normalizeRefs(targetRefs: string[] | undefined): string[] {
  if (!Array.isArray(targetRefs)) return []
  return targetRefs
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0)
    .slice(0, 20)
}

type TournamentConnection = Awaited<ReturnType<typeof getTournamentConnection>>


type PrivacyMutationGuard = {
  namespaceLease: RoundNamespaceLease
  roundMutationLeases: RoundMutationLease[]
  entityLeases: EntityNamespaceLease[]
}

function createEraseConflict(message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number }
  error.name = 'EraseConflict'
  error.status = 409
  return error
}

async function releasePrivacyMutationGuard(
  connection: TournamentConnection,
  guard: PrivacyMutationGuard
): Promise<void> {
  const errors: unknown[] = []
  try {
    await releaseEntityNamespaceLeases(connection, guard.entityLeases)
  } catch (error) {
    errors.push(error)
  }
  try {
    await releaseRoundMutationLeases(connection, guard.roundMutationLeases)
  } catch (error) {
    errors.push(error)
  }
  try {
    const released = await releaseRoundNamespaceLease(connection, guard.namespaceLease)
    if (!released) errors.push(new Error('Failed to release privacy round namespace lease'))
  } catch (error) {
    errors.push(error)
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to release privacy mutation guard')
  }
}

async function acquirePrivacyMutationGuard(
  connection: TournamentConnection,
  tournamentId: string,
  entityNamespaces: readonly string[]
): Promise<PrivacyMutationGuard> {
  const namespaceLease = await acquireRoundNamespaceLease(connection, tournamentId)
  if (!namespaceLease) {
    throw createEraseConflict('Round namespace is being modified; retry privacy erasure')
  }

  let roundMutationLeases: RoundMutationLease[] = []
  let entityLeases: EntityNamespaceLease[] = []
  try {
    const roundDocs = await getRoundModel(connection)
      .find({ tournamentId })
      .select({ _id: 1, round: 1 })
      .lean()
      .exec()
    const acquiredRounds = await acquireRoundMutationLeases(
      connection,
      tournamentId,
      (roundDocs as any[]).map((roundDoc) => ({
        id: String(roundDoc._id),
        round: Number(roundDoc.round),
      }))
    )
    if (!acquiredRounds) {
      throw createEraseConflict('Round has active writes; retry privacy erasure')
    }
    roundMutationLeases = acquiredRounds

    const acquiredEntities = await acquireEntityNamespaceLeases(
      connection,
      tournamentId,
      entityNamespaces
    )
    if (!acquiredEntities) {
      throw createEraseConflict('Entity namespace is being modified; retry privacy erasure')
    }
    entityLeases = acquiredEntities

    return { namespaceLease, roundMutationLeases, entityLeases }
  } catch (error) {
    const cleanupErrors: unknown[] = []
    try {
      await releaseEntityNamespaceLeases(connection, entityLeases)
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError)
    }
    try {
      await releaseRoundMutationLeases(connection, roundMutationLeases)
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError)
    }
    try {
      const released = await releaseRoundNamespaceLease(connection, namespaceLease)
      if (!released) cleanupErrors.push(new Error('Failed to release privacy round namespace lease'))
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError)
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Failed to acquire privacy mutation guard cleanly'
      )
    }
    throw error
  }
}

async function removeSpeakerRefsFromTeams(
  connection: TournamentConnection,
  tournamentId: string,
  speakerId: string
): Promise<void> {
  const TeamModel = getTeamModel(connection)
  await TeamModel.updateMany(
    {
      tournamentId,
      $or: [{ 'template.speakers': speakerId }, { 'details.speakers': speakerId }],
    },
    {
      $pull: {
        'template.speakers': speakerId,
        'details.$[].speakers': speakerId,
      },
    }
  ).exec()
}

async function removeAdjudicatorRefsFromDraws(
  connection: TournamentConnection,
  tournamentId: string,
  adjudicatorId: string
): Promise<void> {
  const DrawModel = getDrawModel(connection)
  await DrawModel.updateMany(
    {
      tournamentId,
      $or: [
        { 'allocation.chairs': adjudicatorId },
        { 'allocation.panels': adjudicatorId },
        { 'allocation.trainees': adjudicatorId },
      ],
    },
    {
      $pull: {
        'allocation.$[].chairs': adjudicatorId,
        'allocation.$[].panels': adjudicatorId,
        'allocation.$[].trainees': adjudicatorId,
      },
      $inc: { __v: 1 },
    }
  ).exec()
}


type SubmissionCommentSnapshot = {
  id: unknown
  comment: unknown
}

type SpeakerTeamReferenceSnapshot = {
  teamId: unknown
  templateHadSpeaker: boolean
  detailRounds: number[]
}

type AdjudicatorDrawReferenceSnapshot = {
  drawId: unknown
  rows: Array<{
    index: number
    teams: unknown
    roles: Array<'chairs' | 'panels' | 'trainees'>
  }>
}

type SpeakerEraseSnapshot = {
  entity: any
  submissionComments: SubmissionCommentSnapshot[]
  teamReferences: SpeakerTeamReferenceSnapshot[]
  rawResults: any[]
}

type AdjudicatorEraseSnapshot = {
  entity: any
  submissionComments: SubmissionCommentSnapshot[]
  drawReferences: AdjudicatorDrawReferenceSnapshot[]
  rawResults: any[]
}

function extractSubmissionComments(rows: any[]): SubmissionCommentSnapshot[] {
  return rows.flatMap((row: any) => {
    const payload = row?.payload
    if (!payload || typeof payload !== 'object') return []
    if (!Object.prototype.hasOwnProperty.call(payload, 'comment')) return []
    return [{ id: row._id, comment: payload.comment }]
  })
}

async function restoreSubmissionComments(
  connection: TournamentConnection,
  tournamentId: string,
  snapshots: SubmissionCommentSnapshot[]
): Promise<void> {
  if (snapshots.length === 0) return
  const SubmissionModel = getSubmissionModel(connection)
  const ops = snapshots.map((snapshot) => ({
    updateOne: {
      filter: {
        _id: snapshot.id,
        tournamentId,
        'payload.comment': { $exists: false },
      },
      update: { $set: { 'payload.comment': snapshot.comment }, $inc: { __v: 1 } },
    },
  }))
  await SubmissionModel.bulkWrite(ops, { ordered: false })
}

async function restoreDeletedDocuments(Model: any, docs: any[]): Promise<void> {
  for (const doc of docs) {
    const existing = await Model.exists({ _id: doc._id })
    if (existing) continue
    await Model.create(doc)
  }
}

async function captureSpeakerEraseSnapshot(
  connection: TournamentConnection,
  tournamentId: string,
  entityId: string
): Promise<SpeakerEraseSnapshot | null> {
  const SpeakerModel = getSpeakerModel(connection)
  const SubmissionModel = getSubmissionModel(connection)
  const TeamModel = getTeamModel(connection)
  const RawSpeakerResultModel = getRawSpeakerResultModel(connection)

  const [entity, submissions, teams, rawResults] = await Promise.all([
    SpeakerModel.findOne({ _id: entityId, tournamentId }).lean().exec(),
    SubmissionModel.find({
      tournamentId,
      $or: [{ 'payload.submittedEntityId': entityId }, { submittedBy: entityId }],
      'payload.comment': { $exists: true },
    })
      .select({ _id: 1, 'payload.comment': 1 })
      .lean()
      .exec(),
    TeamModel.find({
      tournamentId,
      $or: [{ 'template.speakers': entityId }, { 'details.speakers': entityId }],
    })
      .select({ _id: 1, template: 1, details: 1 })
      .lean()
      .exec(),
    RawSpeakerResultModel.find({
      tournamentId,
      $or: [{ id: entityId }, { from_id: entityId }],
    })
      .lean()
      .exec(),
  ])

  if (!entity) return null

  const teamReferences: SpeakerTeamReferenceSnapshot[] = (teams as any[]).map((team: any) => ({
    teamId: team._id,
    templateHadSpeaker:
      Array.isArray(team?.template?.speakers) && team.template.speakers.includes(entityId),
    detailRounds: Array.isArray(team?.details)
      ? team.details
          .filter(
            (detail: any) =>
              Array.isArray(detail?.speakers) && detail.speakers.includes(entityId)
          )
          .map((detail: any) => Number(detail.r))
          .filter((round: number) => Number.isInteger(round))
      : [],
  }))

  return {
    entity,
    submissionComments: extractSubmissionComments(submissions as any[]),
    teamReferences,
    rawResults,
  }
}

async function restoreSpeakerTeamReferences(
  connection: TournamentConnection,
  tournamentId: string,
  speakerId: string,
  snapshots: SpeakerTeamReferenceSnapshot[]
): Promise<void> {
  const TeamModel = getTeamModel(connection)
  for (const snapshot of snapshots) {
    if (snapshot.templateHadSpeaker) {
      await TeamModel.updateOne(
        { _id: snapshot.teamId, tournamentId },
        { $addToSet: { 'template.speakers': speakerId } }
      ).exec()
    }
    if (snapshot.detailRounds.length > 0) {
      await TeamModel.updateOne(
        { _id: snapshot.teamId, tournamentId },
        { $addToSet: { 'details.$[detail].speakers': speakerId } },
        { arrayFilters: [{ 'detail.r': { $in: snapshot.detailRounds } }] }
      ).exec()
    }
  }
}

async function restoreSpeakerEraseSnapshot(
  connection: TournamentConnection,
  tournamentId: string,
  entityId: string,
  snapshot: SpeakerEraseSnapshot
): Promise<void> {
  const SpeakerModel = getSpeakerModel(connection)
  const RawSpeakerResultModel = getRawSpeakerResultModel(connection)
  const restoreErrors: unknown[] = []
  const attempt = async (operation: () => Promise<void>) => {
    try {
      await operation()
    } catch (error) {
      restoreErrors.push(error)
    }
  }

  await attempt(() => restoreDeletedDocuments(SpeakerModel, [snapshot.entity]))
  await attempt(() => restoreDeletedDocuments(RawSpeakerResultModel, snapshot.rawResults))
  await attempt(() =>
    restoreSpeakerTeamReferences(connection, tournamentId, entityId, snapshot.teamReferences)
  )
  await attempt(() =>
    restoreSubmissionComments(connection, tournamentId, snapshot.submissionComments)
  )

  if (restoreErrors.length > 0) {
    throw new AggregateError(restoreErrors, 'Failed to restore speaker erasure snapshot')
  }
}

async function captureAdjudicatorEraseSnapshot(
  connection: TournamentConnection,
  tournamentId: string,
  entityId: string
): Promise<AdjudicatorEraseSnapshot | null> {
  const AdjudicatorModel = getAdjudicatorModel(connection)
  const SubmissionModel = getSubmissionModel(connection)
  const DrawModel = getDrawModel(connection)
  const RawAdjudicatorResultModel = getRawAdjudicatorResultModel(connection)

  const [entity, submissions, draws, rawResults] = await Promise.all([
    AdjudicatorModel.findOne({ _id: entityId, tournamentId }).lean().exec(),
    SubmissionModel.find({
      tournamentId,
      $or: [
        { 'payload.adjudicatorId': entityId },
        { 'payload.submittedEntityId': entityId },
        { submittedBy: entityId },
      ],
      'payload.comment': { $exists: true },
    })
      .select({ _id: 1, 'payload.comment': 1 })
      .lean()
      .exec(),
    DrawModel.find({
      tournamentId,
      $or: [
        { 'allocation.chairs': entityId },
        { 'allocation.panels': entityId },
        { 'allocation.trainees': entityId },
      ],
    })
      .select({ _id: 1, allocation: 1 })
      .lean()
      .exec(),
    RawAdjudicatorResultModel.find({
      tournamentId,
      $or: [{ id: entityId }, { from_id: entityId }],
    })
      .lean()
      .exec(),
  ])

  if (!entity) return null

  const drawReferences: AdjudicatorDrawReferenceSnapshot[] = (draws as any[]).map((draw: any) => ({
    drawId: draw._id,
    rows: (Array.isArray(draw?.allocation) ? draw.allocation : []).flatMap(
      (row: any, index: number) => {
        const roles = (['chairs', 'panels', 'trainees'] as const).filter(
          (role) => Array.isArray(row?.[role]) && row[role].includes(entityId)
        )
        return roles.length > 0 ? [{ index, teams: row?.teams, roles }] : []
      }
    ),
  }))

  return {
    entity,
    submissionComments: extractSubmissionComments(submissions as any[]),
    drawReferences,
    rawResults,
  }
}

async function restoreAdjudicatorDrawReferences(
  connection: TournamentConnection,
  tournamentId: string,
  adjudicatorId: string,
  snapshots: AdjudicatorDrawReferenceSnapshot[]
): Promise<void> {
  const DrawModel = getDrawModel(connection)
  for (const snapshot of snapshots) {
    for (const row of snapshot.rows) {
      for (const role of row.roles) {
        const path = `allocation.${row.index}.${role}`
        const teamsPath = `allocation.${row.index}.teams`
        const result = await DrawModel.updateOne(
          {
            _id: snapshot.drawId,
            tournamentId,
            [teamsPath]: row.teams,
          },
          {
            $addToSet: { [path]: adjudicatorId },
            $inc: { __v: 1 },
          }
        ).exec()
        if (result.matchedCount !== 1) {
          throw new Error('Draw allocation changed while restoring adjudicator references')
        }
      }
    }
  }
}

async function restoreAdjudicatorEraseSnapshot(
  connection: TournamentConnection,
  tournamentId: string,
  entityId: string,
  snapshot: AdjudicatorEraseSnapshot
): Promise<void> {
  const AdjudicatorModel = getAdjudicatorModel(connection)
  const RawAdjudicatorResultModel = getRawAdjudicatorResultModel(connection)
  const restoreErrors: unknown[] = []
  const attempt = async (operation: () => Promise<void>) => {
    try {
      await operation()
    } catch (error) {
      restoreErrors.push(error)
    }
  }

  await attempt(() => restoreDeletedDocuments(AdjudicatorModel, [snapshot.entity]))
  await attempt(() => restoreDeletedDocuments(RawAdjudicatorResultModel, snapshot.rawResults))
  await attempt(() =>
    restoreAdjudicatorDrawReferences(
      connection,
      tournamentId,
      entityId,
      snapshot.drawReferences
    )
  )
  await attempt(() =>
    restoreSubmissionComments(connection, tournamentId, snapshot.submissionComments)
  )

  if (restoreErrors.length > 0) {
    throw new AggregateError(restoreErrors, 'Failed to restore adjudicator erasure snapshot')
  }
}

export async function executeSpeakerPersonalDataErase(
  input: PersonalDataEraseInput
): Promise<PersonalDataEraseResult | null> {
  const { tournamentId, entityId, reason, approvedBy, targetRefs, eraseMode } = input
  const connection = await getTournamentConnection(tournamentId)
  const SpeakerModel = getSpeakerModel(connection)
  const SubmissionModel = getSubmissionModel(connection)
  const RawSpeakerResultModel = getRawSpeakerResultModel(connection)

  const mode: EraseMode = eraseMode === 'hard_delete' ? 'hard_delete' : 'anonymize'
  const snapshot = await captureSpeakerEraseSnapshot(connection, tournamentId, entityId)
  if (!snapshot) return null

  let clearResult: { modifiedCount?: number } = { modifiedCount: 0 }
  try {
    clearResult = await SubmissionModel.updateMany(
      {
        tournamentId,
        $or: [{ 'payload.submittedEntityId': entityId }, { submittedBy: entityId }],
      },
      { $unset: { 'payload.comment': '' }, $inc: { __v: 1 } }
    ).exec()

    if (mode === 'hard_delete') {
      await Promise.all([
        removeSpeakerRefsFromTeams(connection, tournamentId, entityId),
        RawSpeakerResultModel.deleteMany({
          tournamentId,
          $or: [{ id: entityId }, { from_id: entityId }],
        }).exec(),
      ])
      const deleteResult = await SpeakerModel.deleteOne({ _id: entityId, tournamentId }).exec()
      if (deleteResult.deletedCount !== 1) {
        const err = new Error('Speaker changed while hard-delete erasure was running')
        err.name = 'EraseConflict'
        ;(err as any).status = 409
        throw err
      }
    } else {
      const updateResult = await SpeakerModel.updateOne(
        { _id: entityId, tournamentId },
        {
          $set: {
            name: buildRedactedLabel('speaker', entityId),
            userDefinedData: {},
          },
        }
      ).exec()
      if (updateResult.matchedCount !== 1) {
        const err = new Error('Speaker changed while anonymization was running')
        err.name = 'EraseConflict'
        ;(err as any).status = 409
        throw err
      }
    }
  } catch (operationError) {
    try {
      if (mode === 'hard_delete') {
        await restoreSpeakerEraseSnapshot(connection, tournamentId, entityId, snapshot)
      } else {
        await restoreSubmissionComments(connection, tournamentId, snapshot.submissionComments)
      }
    } catch (rollbackError) {
      throw new AggregateError(
        [operationError, rollbackError],
        'Speaker personal-data erasure failed and rollback was incomplete'
      )
    }
    throw operationError
  }

  return {
    tournamentId,
    entityType: 'speaker',
    entityId,
    redacted: true,
    eraseMode: mode,
    reason,
    approvedBy: approvedBy ?? null,
    targetRefs: normalizeRefs(targetRefs),
    submissionCommentsCleared: clearResult.modifiedCount ?? 0,
  }
}

export async function executeAdjudicatorPersonalDataErase(
  input: PersonalDataEraseInput
): Promise<PersonalDataEraseResult | null> {
  const { tournamentId, entityId, reason, approvedBy, targetRefs, eraseMode } = input
  const connection = await getTournamentConnection(tournamentId)
  const AdjudicatorModel = getAdjudicatorModel(connection)
  const SubmissionModel = getSubmissionModel(connection)
  const RawAdjudicatorResultModel = getRawAdjudicatorResultModel(connection)

  const mode: EraseMode = eraseMode === 'hard_delete' ? 'hard_delete' : 'anonymize'
  const snapshot = await captureAdjudicatorEraseSnapshot(connection, tournamentId, entityId)
  if (!snapshot) return null

  let clearResult: { modifiedCount?: number } = { modifiedCount: 0 }
  try {
    clearResult = await SubmissionModel.updateMany(
      {
        tournamentId,
        $or: [
          { 'payload.adjudicatorId': entityId },
          { 'payload.submittedEntityId': entityId },
          { submittedBy: entityId },
        ],
      },
      { $unset: { 'payload.comment': '' }, $inc: { __v: 1 } }
    ).exec()

    if (mode === 'hard_delete') {
      await Promise.all([
        removeAdjudicatorRefsFromDraws(connection, tournamentId, entityId),
        RawAdjudicatorResultModel.deleteMany({
          tournamentId,
          $or: [{ id: entityId }, { from_id: entityId }],
        }).exec(),
      ])
      const deleteResult = await AdjudicatorModel.deleteOne({ _id: entityId, tournamentId }).exec()
      if (deleteResult.deletedCount !== 1) {
        const err = new Error('Adjudicator changed while hard-delete erasure was running')
        err.name = 'EraseConflict'
        ;(err as any).status = 409
        throw err
      }
    } else {
      const updateResult = await AdjudicatorModel.updateOne(
        { _id: entityId, tournamentId },
        {
          $set: {
            name: buildRedactedLabel('adjudicator', entityId),
            preev: 0,
            template: { available: false, conflicts: [], conflict_teams: [] },
            details: [],
            userDefinedData: {},
          },
        }
      ).exec()
      if (updateResult.matchedCount !== 1) {
        const err = new Error('Adjudicator changed while anonymization was running')
        err.name = 'EraseConflict'
        ;(err as any).status = 409
        throw err
      }
    }
  } catch (operationError) {
    try {
      if (mode === 'hard_delete') {
        await restoreAdjudicatorEraseSnapshot(connection, tournamentId, entityId, snapshot)
      } else {
        await restoreSubmissionComments(connection, tournamentId, snapshot.submissionComments)
      }
    } catch (rollbackError) {
      throw new AggregateError(
        [operationError, rollbackError],
        'Adjudicator personal-data erasure failed and rollback was incomplete'
      )
    }
    throw operationError
  }

  return {
    tournamentId,
    entityType: 'adjudicator',
    entityId,
    redacted: true,
    eraseMode: mode,
    reason,
    approvedBy: approvedBy ?? null,
    targetRefs: normalizeRefs(targetRefs),
    submissionCommentsCleared: clearResult.modifiedCount ?? 0,
  }
}

export const eraseSpeakerPersonalData: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    const { reason, approvedBy, targetRefs, eraseMode, reauthPassword } = req.body as {
      reason: string
      approvedBy?: string
      targetRefs?: string[]
      eraseMode?: EraseMode
      reauthPassword?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureObjectId(res, id, 'Invalid speaker id')) return
    if (!(await ensureSensitiveActionReauthentication(req, res, reauthPassword))) return

    const result = await executeSpeakerPersonalDataErase({
      tournamentId,
      entityId: id,
      reason,
      approvedBy,
      targetRefs,
      eraseMode,
    })
    if (!result) {
      notFound(res, 'Speaker not found')
      return
    }
    res.json({ data: result, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const eraseAdjudicatorPersonalData: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    const { reason, approvedBy, targetRefs, eraseMode, reauthPassword } = req.body as {
      reason: string
      approvedBy?: string
      targetRefs?: string[]
      eraseMode?: EraseMode
      reauthPassword?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureObjectId(res, id, 'Invalid adjudicator id')) return
    if (!(await ensureSensitiveActionReauthentication(req, res, reauthPassword))) return

    const result = await executeAdjudicatorPersonalDataErase({
      tournamentId,
      entityId: id,
      reason,
      approvedBy,
      targetRefs,
      eraseMode,
    })
    if (!result) {
      notFound(res, 'Adjudicator not found')
      return
    }
    res.json({ data: result, errors: [] })
  } catch (err) {
    next(err)
  }
}
