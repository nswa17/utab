import type { RequestHandler } from 'express'
import { Types } from 'mongoose'
import { ErasureRequestModel } from '../models/erasure-request.js'
import {
  executeAdjudicatorPersonalDataErase,
  executeSpeakerPersonalDataErase,
  type PersonalDataEraseInput,
} from './privacy.js'
import { badRequest, notFound } from './shared/http-errors.js'
import { ensureObjectId, ensureTournamentId } from './shared/request-validators.js'
import { ensureSensitiveActionReauthentication } from './shared/sensitive-action.js'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

type ErasureRequestCursorPayload = {
  createdAt: string
  id: string
}

function unauthorized(res: Parameters<RequestHandler>[1], message = 'Please login first') {
  res.status(401).json({ data: null, errors: [{ name: 'Unauthorized', message }] })
}

function conflict(res: Parameters<RequestHandler>[1], message: string) {
  res.status(409).json({ data: null, errors: [{ name: 'Conflict', message }] })
}

function normalizeTargetRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0)
    .slice(0, 20)
}

function resolveActorUserId(req: Parameters<RequestHandler>[0]): string | null {
  const sessionActor = String(req.session?.userId ?? '').trim()
  if (sessionActor.length > 0) return sessionActor

  const serviceActor = String(req.serviceAccount?.sub ?? '').trim()
  return serviceActor.length > 0 ? serviceActor : null
}

function normalizeReason(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function decodeCursor(value: string): ErasureRequestCursorPayload | null {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as ErasureRequestCursorPayload
    if (!decoded || typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string') {
      return null
    }
    if (!Types.ObjectId.isValid(decoded.id)) return null
    const parsedDate = new Date(decoded.createdAt)
    if (Number.isNaN(parsedDate.getTime())) return null
    return decoded
  } catch {
    return null
  }
}

function encodeCursor(input: ErasureRequestCursorPayload): string {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url')
}

export const listErasureRequests: RequestHandler = async (req, res, next) => {
  try {
    const {
      tournamentId,
      status,
      targetType,
      targetId,
      requestedBy,
      limit: rawLimit,
      cursor,
    } = req.query as {
      tournamentId?: string
      status?: string
      targetType?: string
      targetId?: string
      requestedBy?: string
      limit?: number
      cursor?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return

    const limit =
      typeof rawLimit === 'number'
        ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
        : DEFAULT_LIMIT

    const filter: Record<string, unknown> = { tournamentId }
    if (status) filter.status = status
    if (targetType) filter.targetType = targetType
    if (targetId) filter.targetId = targetId
    if (requestedBy) filter.requestedBy = requestedBy

    if (typeof cursor === 'string' && cursor.trim().length > 0) {
      const decodedCursor = decodeCursor(cursor)
      if (!decodedCursor) {
        badRequest(res, 'Invalid cursor')
        return
      }
      const cursorCreatedAt = new Date(decodedCursor.createdAt)
      const cursorId = new Types.ObjectId(decodedCursor.id)
      filter.$or = [
        { createdAt: { $lt: cursorCreatedAt } },
        { createdAt: cursorCreatedAt, _id: { $lt: cursorId } },
      ]
    }

    const rows = await ErasureRequestModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec()
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const last = items.at(-1)
    const nextCursor =
      hasMore && last
        ? encodeCursor({
            createdAt: new Date(last.createdAt).toISOString(),
            id: String(last._id),
          })
        : null

    res.json({ data: { items, limit, hasMore, nextCursor }, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createErasureRequest: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = resolveActorUserId(req)
    if (!actorUserId) {
      unauthorized(res)
      return
    }

    const { tournamentId, targetType, targetId, reason, targetRefs, eraseMode } = req.body as {
      tournamentId?: string
      targetType?: 'speaker' | 'adjudicator'
      targetId?: string
      reason?: string
      targetRefs?: string[]
      eraseMode?: 'anonymize' | 'hard_delete'
    }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureObjectId(res, targetId, 'Invalid target id')) return
    if (targetType !== 'speaker' && targetType !== 'adjudicator') {
      badRequest(res, 'Invalid target type')
      return
    }

    const created = await ErasureRequestModel.create({
      tournamentId,
      targetType,
      targetId,
      reason,
      targetRefs: normalizeTargetRefs(targetRefs),
      eraseMode: eraseMode ?? 'anonymize',
      status: 'requested',
      requestedBy: actorUserId,
      requestedAt: new Date(),
    })

    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const approveErasureRequest: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = resolveActorUserId(req)
    if (!actorUserId) {
      unauthorized(res)
      return
    }

    const { id } = req.params
    const { tournamentId, approvedBy, reauthPassword } = req.body as {
      tournamentId?: string
      approvedBy?: string
      reauthPassword?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureObjectId(res, id, 'Invalid erasure request id')) return
    if (!(await ensureSensitiveActionReauthentication(req, res, reauthPassword))) return

    const existing = await ErasureRequestModel.findOne({ _id: id, tournamentId }).lean().exec()
    if (!existing) {
      notFound(res, 'Erasure request not found')
      return
    }
    if (existing.status !== 'requested') {
      conflict(res, 'Erasure request is not in requested status')
      return
    }

    const approvedByValue = String(approvedBy ?? '').trim() || actorUserId
    const updated = await ErasureRequestModel.findOneAndUpdate(
      { _id: id, tournamentId, status: 'requested' },
      {
        $set: {
          status: 'approved',
          approvedBy: approvedByValue,
          approvedAt: new Date(),
          errorMessage: undefined,
        },
      },
      { new: true }
    )
      .lean()
      .exec()
    if (!updated) {
      conflict(res, 'Erasure request changed while approving')
      return
    }

    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const rejectErasureRequest: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = resolveActorUserId(req)
    if (!actorUserId) {
      unauthorized(res)
      return
    }

    const { id } = req.params
    const { tournamentId, reason, reauthPassword } = req.body as {
      tournamentId?: string
      reason?: string
      reauthPassword?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureObjectId(res, id, 'Invalid erasure request id')) return
    if (!(await ensureSensitiveActionReauthentication(req, res, reauthPassword))) return

    const existing = await ErasureRequestModel.findOne({ _id: id, tournamentId }).lean().exec()
    if (!existing) {
      notFound(res, 'Erasure request not found')
      return
    }
    if (existing.status !== 'requested') {
      conflict(res, 'Erasure request is not in requested status')
      return
    }

    const rejectionReason = normalizeReason(reason)
    const setPayload: Record<string, unknown> = {
      status: 'rejected',
      rejectedBy: actorUserId,
      rejectedAt: new Date(),
    }
    if (rejectionReason) setPayload.rejectionReason = rejectionReason

    const updated = await ErasureRequestModel.findOneAndUpdate(
      { _id: id, tournamentId, status: 'requested' },
      {
        $set: setPayload,
        $unset: {
          approvedBy: '',
          approvedAt: '',
          executedBy: '',
          executedAt: '',
          result: '',
          errorMessage: '',
        },
      },
      { new: true }
    )
      .lean()
      .exec()
    if (!updated) {
      conflict(res, 'Erasure request changed while rejecting')
      return
    }

    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const cancelErasureRequest: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = resolveActorUserId(req)
    if (!actorUserId) {
      unauthorized(res)
      return
    }

    const { id } = req.params
    const { tournamentId, reason, reauthPassword } = req.body as {
      tournamentId?: string
      reason?: string
      reauthPassword?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureObjectId(res, id, 'Invalid erasure request id')) return
    if (!(await ensureSensitiveActionReauthentication(req, res, reauthPassword))) return

    const existing = await ErasureRequestModel.findOne({ _id: id, tournamentId }).lean().exec()
    if (!existing) {
      notFound(res, 'Erasure request not found')
      return
    }
    if (!['requested', 'approved'].includes(existing.status)) {
      conflict(res, 'Erasure request cannot be cancelled from current status')
      return
    }

    const cancellationReason = normalizeReason(reason)
    const setPayload: Record<string, unknown> = {
      status: 'cancelled',
      rejectedBy: actorUserId,
      rejectedAt: new Date(),
    }
    if (cancellationReason) setPayload.rejectionReason = cancellationReason

    const updated = await ErasureRequestModel.findOneAndUpdate(
      {
        _id: id,
        tournamentId,
        status: { $in: ['requested', 'approved'] },
      },
      {
        $set: setPayload,
        $unset: {
          approvedBy: '',
          approvedAt: '',
          executedBy: '',
          executedAt: '',
          result: '',
          errorMessage: '',
        },
      },
      { new: true }
    )
      .lean()
      .exec()
    if (!updated) {
      conflict(res, 'Erasure request changed while cancelling')
      return
    }

    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const executeErasureRequest: RequestHandler = async (req, res, next) => {
  try {
    const actorUserId = resolveActorUserId(req)
    if (!actorUserId) {
      unauthorized(res)
      return
    }

    const { id } = req.params
    const { tournamentId, reauthPassword } = req.body as {
      tournamentId?: string
      reauthPassword?: string
    }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureObjectId(res, id, 'Invalid erasure request id')) return
    if (!(await ensureSensitiveActionReauthentication(req, res, reauthPassword))) return

    const existing = await ErasureRequestModel.findOne({ _id: id, tournamentId }).lean().exec()
    if (!existing) {
      notFound(res, 'Erasure request not found')
      return
    }
    if (existing.status !== 'approved') {
      conflict(res, 'Erasure request must be approved before execution')
      return
    }

    const transitionResult = await ErasureRequestModel.updateOne(
      { _id: id, tournamentId, status: 'approved' },
      {
        $set: {
          status: 'running',
          executedBy: actorUserId,
          errorMessage: undefined,
        },
      }
    ).exec()
    if (transitionResult.modifiedCount !== 1) {
      conflict(res, 'Erasure request changed while starting execution')
      return
    }

    const eraseInput: PersonalDataEraseInput = {
      tournamentId,
      entityId: existing.targetId,
      reason: existing.reason,
      approvedBy: existing.approvedBy ?? undefined,
      targetRefs: Array.isArray(existing.targetRefs) ? existing.targetRefs : [],
      eraseMode:
        existing.eraseMode === 'hard_delete' || existing.eraseMode === 'anonymize'
          ? existing.eraseMode
          : 'anonymize',
    }

    const result =
      existing.targetType === 'speaker'
        ? await executeSpeakerPersonalDataErase(eraseInput)
        : await executeAdjudicatorPersonalDataErase(eraseInput)

    if (!result) {
      await ErasureRequestModel.updateOne(
        { _id: id, tournamentId },
        {
          $set: {
            status: 'failed',
            executedBy: actorUserId,
            executedAt: new Date(),
            errorMessage: `${existing.targetType} target not found`,
          },
        }
      ).exec()
      notFound(res, `${existing.targetType} target not found`)
      return
    }

    const completed = await ErasureRequestModel.findOneAndUpdate(
      { _id: id, tournamentId },
      {
        $set: {
          status: 'completed',
          executedBy: actorUserId,
          executedAt: new Date(),
          result,
          errorMessage: undefined,
        },
      },
      { new: true }
    )
      .lean()
      .exec()
    if (!completed) {
      notFound(res, 'Erasure request not found')
      return
    }

    res.json({ data: completed, errors: [] })
  } catch (err) {
    next(err)
  }
}
