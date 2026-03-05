import type { RequestHandler } from 'express'
import { getAdjudicatorModel } from '../models/adjudicator.js'
import { getDrawModel } from '../models/draw.js'
import { getRawAdjudicatorResultModel } from '../models/raw-adjudicator-result.js'
import { getRawSpeakerResultModel } from '../models/raw-speaker-result.js'
import { getSpeakerModel } from '../models/speaker.js'
import { getSubmissionModel } from '../models/submission.js'
import { getTeamModel } from '../models/team.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
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

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0)
}

type TournamentConnection = Awaited<ReturnType<typeof getTournamentConnection>>

async function removeSpeakerRefsFromTeams(
  connection: TournamentConnection,
  tournamentId: string,
  speakerId: string
): Promise<void> {
  const TeamModel = getTeamModel(connection)
  const teams = await TeamModel.find({
    tournamentId,
    $or: [{ 'template.speakers': speakerId }, { 'details.speakers': speakerId }],
  })
    .select({ _id: 1, template: 1, details: 1 })
    .lean()
    .exec()

  if (teams.length === 0) return

  const operations = teams
    .map((team: any) => {
      const currentTemplate = team?.template && typeof team.template === 'object' ? team.template : {}
      const nextTemplateSpeakers = normalizeStringList(currentTemplate.speakers).filter(
        (item) => item !== speakerId
      )
      const currentDetails = Array.isArray(team?.details) ? team.details : []
      const nextDetails = currentDetails.map((detail: any) => {
        const nextSpeakers = normalizeStringList(detail?.speakers).filter((item) => item !== speakerId)
        return {
          ...(detail && typeof detail === 'object' ? detail : {}),
          speakers: nextSpeakers,
        }
      })

      return {
        updateOne: {
          filter: { _id: team._id, tournamentId },
          update: {
            $set: {
              template: {
                ...currentTemplate,
                speakers: nextTemplateSpeakers,
              },
              details: nextDetails,
            },
          },
        },
      }
    })
    .filter((operation) => Boolean(operation))

  if (operations.length > 0) {
    await TeamModel.bulkWrite(operations, { ordered: false })
  }
}

async function removeAdjudicatorRefsFromDraws(
  connection: TournamentConnection,
  tournamentId: string,
  adjudicatorId: string
): Promise<void> {
  const DrawModel = getDrawModel(connection)
  const draws = await DrawModel.find({
    tournamentId,
    $or: [
      { 'allocation.chairs': adjudicatorId },
      { 'allocation.panels': adjudicatorId },
      { 'allocation.trainees': adjudicatorId },
    ],
  })
    .select({ _id: 1, allocation: 1 })
    .lean()
    .exec()

  if (draws.length === 0) return

  const operations = draws
    .map((draw: any) => {
      const allocation = Array.isArray(draw?.allocation) ? draw.allocation : []
      const nextAllocation = allocation.map((row: any) => ({
        ...(row && typeof row === 'object' ? row : {}),
        chairs: normalizeStringList(row?.chairs).filter((item) => item !== adjudicatorId),
        panels: normalizeStringList(row?.panels).filter((item) => item !== adjudicatorId),
        trainees: normalizeStringList(row?.trainees).filter((item) => item !== adjudicatorId),
      }))

      return {
        updateOne: {
          filter: { _id: draw._id, tournamentId },
          update: { $set: { allocation: nextAllocation } },
        },
      }
    })
    .filter((operation) => Boolean(operation))

  if (operations.length > 0) {
    await DrawModel.bulkWrite(operations, { ordered: false })
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
  const existing = await SpeakerModel.findOne({ _id: entityId, tournamentId })
    .select({ _id: 1 })
    .lean()
    .exec()
  if (!existing) return null

  const clearResult = await SubmissionModel.updateMany(
    {
      tournamentId,
      $or: [{ 'payload.submittedEntityId': entityId }, { submittedBy: entityId }],
    },
    { $unset: { 'payload.comment': '' } }
  ).exec()

  if (mode === 'hard_delete') {
    await Promise.all([
      removeSpeakerRefsFromTeams(connection, tournamentId, entityId),
      RawSpeakerResultModel.deleteMany({
        tournamentId,
        $or: [{ id: entityId }, { from_id: entityId }],
      }).exec(),
    ])
    await SpeakerModel.deleteOne({ _id: entityId, tournamentId }).exec()
  } else {
    await SpeakerModel.updateOne(
      { _id: entityId, tournamentId },
      {
        $set: {
          name: buildRedactedLabel('speaker', entityId),
          userDefinedData: {},
        },
      }
    ).exec()
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
  const existing = await AdjudicatorModel.findOne({ _id: entityId, tournamentId })
    .select({ _id: 1 })
    .lean()
    .exec()
  if (!existing) return null

  const clearResult = await SubmissionModel.updateMany(
    {
      tournamentId,
      $or: [
        { 'payload.adjudicatorId': entityId },
        { 'payload.submittedEntityId': entityId },
        { submittedBy: entityId },
      ],
    },
    { $unset: { 'payload.comment': '' } }
  ).exec()

  if (mode === 'hard_delete') {
    await Promise.all([
      removeAdjudicatorRefsFromDraws(connection, tournamentId, entityId),
      RawAdjudicatorResultModel.deleteMany({
        tournamentId,
        $or: [{ id: entityId }, { from_id: entityId }],
      }).exec(),
    ])
    await AdjudicatorModel.deleteOne({ _id: entityId, tournamentId }).exec()
  } else {
    await AdjudicatorModel.updateOne(
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
