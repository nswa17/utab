import { Types } from 'mongoose'
import type { RequestHandler } from 'express'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { AuditLogModel } from '../models/audit-log.js'
import { badRequest, isValidObjectId } from './shared/http-errors.js'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

type AuditLogCursor = {
  createdAt: string
  id: string
}

function forbidden(res: any) {
  res.status(403).json({ data: null, errors: [{ name: 'Forbidden', message: 'Forbidden' }] })
}

function parseDateValue(value: string | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function decodeCursor(cursor: string): { createdAt: Date; id: Types.ObjectId } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8')
    const parsed = JSON.parse(raw) as Partial<AuditLogCursor>
    if (!parsed.createdAt || !parsed.id) return null
    const createdAt = new Date(parsed.createdAt)
    if (Number.isNaN(createdAt.getTime())) return null
    if (!isValidObjectId(parsed.id)) return null
    return { createdAt, id: new Types.ObjectId(parsed.id) }
  } catch {
    return null
  }
}

function encodeCursor(entry: { createdAt?: Date; _id?: unknown }): string | null {
  const createdAt = entry.createdAt
  const id = entry._id
  if (!(createdAt instanceof Date) || Number.isNaN(createdAt.getTime())) return null
  if (!id) return null
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id: String(id) } satisfies AuditLogCursor)
  ).toString('base64url')
}

export const listAuditLogs: RequestHandler = async (req, res, next) => {
  try {
    const {
      tournamentId,
      from,
      to,
      actorUserId,
      action,
      targetType,
      targetId,
      cursor,
      limit: rawLimit,
    } = req.query as {
      tournamentId?: string
      from?: string
      to?: string
      actorUserId?: string
      action?: string
      targetType?: string
      targetId?: string
      cursor?: string
      limit?: number
    }

    if (tournamentId && !isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }

    const fromDate = parseDateValue(from)
    if (from && !fromDate) {
      badRequest(res, 'Invalid from date')
      return
    }

    const toDate = parseDateValue(to)
    if (to && !toDate) {
      badRequest(res, 'Invalid to date')
      return
    }

    const limit =
      typeof rawLimit === 'number'
        ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
        : DEFAULT_LIMIT

    const isSuperuser = req.session?.usertype === 'superuser'
    if (!isSuperuser) {
      if (!tournamentId) {
        badRequest(res, 'tournamentId is required')
        return
      }
      if (!(await hasTournamentAdminAccess(req, tournamentId))) {
        forbidden(res)
        return
      }
    }

    const baseFilter: Record<string, unknown> = {}
    if (tournamentId) baseFilter.tournamentId = tournamentId
    if (actorUserId) baseFilter.actorUserId = actorUserId
    if (action) baseFilter.action = action
    if (targetType) baseFilter.targetType = targetType
    if (targetId) baseFilter.targetId = targetId
    if (fromDate || toDate) {
      const range: Record<string, Date> = {}
      if (fromDate) range.$gte = fromDate
      if (toDate) range.$lte = toDate
      baseFilter.createdAt = range
    }

    let finalFilter: Record<string, unknown> = baseFilter
    if (cursor) {
      const decodedCursor = decodeCursor(cursor)
      if (!decodedCursor) {
        badRequest(res, 'Invalid cursor')
        return
      }
      const cursorFilter = {
        $or: [
          { createdAt: { $lt: decodedCursor.createdAt } },
          { createdAt: decodedCursor.createdAt, _id: { $lt: decodedCursor.id } },
        ],
      }
      finalFilter = {
        $and: [baseFilter, cursorFilter],
      }
    }

    const logs = await AuditLogModel.find(finalFilter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec()

    const hasMore = logs.length > limit
    const items = hasMore ? logs.slice(0, limit) : logs
    const nextCursor = hasMore ? encodeCursor(items[items.length - 1] as { createdAt?: Date; _id?: unknown }) : null

    res.json({
      data: {
        items,
        nextCursor,
        limit,
      },
      errors: [],
    })
  } catch (err) {
    next(err)
  }
}
