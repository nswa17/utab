import crypto from 'node:crypto'
import type { Request, RequestHandler, Response } from 'express'
import { serviceAccountAuthSettings } from '../config/environment.js'
import { ServiceAccountIdempotencyModel } from '../models/service-account-idempotency.js'
import { isDuplicateKeyError } from '../services/mongo-error.service.js'
import { logger } from './logging.js'

const IDEMPOTENT_METHODS = new Set(['POST', 'PATCH', 'DELETE'])
const IDEMPOTENCY_REPLAYED_HEADER = 'Idempotency-Replayed'
const IDEMPOTENCY_KEY_HEADER = 'x-idempotency-key'
const MAX_IDEMPOTENCY_KEY_LENGTH = 200

type ExistingIdempotencyRecord = {
  method: string
  path: string
  requestHash: string
  status: 'in_progress' | 'completed'
  responseStatus?: number
  responseBody?: unknown
}

function toHeaderString(value: unknown): string | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    return toHeaderString(value[0])
  }
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function getIdempotencyKey(req: Request): string | null {
  const raw = toHeaderString(req.headers[IDEMPOTENCY_KEY_HEADER])
  if (!raw) return null
  if (raw.length > MAX_IDEMPOTENCY_KEY_LENGTH) return null
  return raw
}

function conflict(res: Response, message: string) {
  res.status(409).json({ data: null, errors: [{ name: 'Conflict', message }] })
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item))
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  const objectValue = value as Record<string, unknown>
  return Object.keys(objectValue)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      const nextValue = objectValue[key]
      if (nextValue === undefined) return acc
      acc[key] = canonicalize(nextValue)
      return acc
    }, {})
}

function resolvePath(req: Request): string {
  const originalUrl = typeof req.originalUrl === 'string' ? req.originalUrl : req.url
  const [pathOnly] = originalUrl.split('?')
  return pathOnly
}

function buildRequestHash(req: Request): { path: string; hash: string } {
  const path = resolvePath(req)
  const payload = {
    method: req.method.toUpperCase(),
    path,
    query: canonicalize(req.query),
    body: canonicalize(req.body ?? null),
  }
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  return { path, hash }
}

function isSameRequest(record: ExistingIdempotencyRecord, method: string, path: string, hash: string): boolean {
  return record.method === method && record.path === path && record.requestHash === hash
}

function respondFromStoredRecord(res: Response, record: ExistingIdempotencyRecord) {
  res.setHeader(IDEMPOTENCY_REPLAYED_HEADER, 'true')
  res.status(record.responseStatus ?? 200).json(record.responseBody ?? { data: null, errors: [] })
}

async function handleExistingRecord(
  res: Response,
  existing: ExistingIdempotencyRecord,
  method: string,
  path: string,
  hash: string
): Promise<'handled' | 'continue'> {
  if (!isSameRequest(existing, method, path, hash)) {
    conflict(res, 'X-Idempotency-Key is already used for a different request')
    return 'handled'
  }
  if (existing.status === 'completed') {
    respondFromStoredRecord(res, existing)
    return 'handled'
  }
  conflict(res, 'A request with this X-Idempotency-Key is still in progress')
  return 'handled'
}

export const handleServiceAccountIdempotency: RequestHandler = async (req, res, next) => {
  try {
    const principal = req.serviceAccount
    if (!principal) {
      next()
      return
    }

    const method = req.method.toUpperCase()
    if (!IDEMPOTENT_METHODS.has(method)) {
      next()
      return
    }

    const idempotencyKey = getIdempotencyKey(req)
    if (!idempotencyKey) {
      next()
      return
    }

    const { path, hash } = buildRequestHash(req)
    const actorId = principal.sub
    const orgId = principal.orgId
    const expireAt = new Date(Date.now() + serviceAccountAuthSettings.idempotencyTtlMs)

    const existing = await ServiceAccountIdempotencyModel.findOne({ actorId, idempotencyKey }).lean().exec()
    if (existing) {
      const handled = await handleExistingRecord(res, existing as ExistingIdempotencyRecord, method, path, hash)
      if (handled === 'handled') return
    }

    try {
      await ServiceAccountIdempotencyModel.create({
        actorId,
        orgId,
        idempotencyKey,
        method,
        path,
        requestHash: hash,
        status: 'in_progress',
        expireAt,
      })
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err
      const duplicated = await ServiceAccountIdempotencyModel.findOne({ actorId, idempotencyKey }).lean().exec()
      if (duplicated) {
        const handled = await handleExistingRecord(
          res,
          duplicated as ExistingIdempotencyRecord,
          method,
          path,
          hash
        )
        if (handled === 'handled') return
      }
      throw err
    }

    let responseBody: unknown
    let hasJsonResponse = false
    const originalJson = res.json.bind(res)
    res.json = ((body: unknown) => {
      hasJsonResponse = true
      responseBody = body
      return originalJson(body)
    }) as typeof res.json

    res.on('finish', () => {
      const statusCode = res.statusCode
      if (statusCode >= 500) {
        void ServiceAccountIdempotencyModel.deleteOne({
          actorId,
          idempotencyKey,
          status: 'in_progress',
        })
          .exec()
          .catch((err) => {
            logger.warn({ err, actorId, idempotencyKey }, 'failed to delete idempotency record after 5xx')
          })
        return
      }

      const storedResponse = hasJsonResponse ? responseBody : { data: null, errors: [] }
      void ServiceAccountIdempotencyModel.updateOne(
        { actorId, idempotencyKey, status: 'in_progress' },
        {
          $set: {
            status: 'completed',
            responseStatus: statusCode,
            responseBody: storedResponse,
            completedAt: new Date(),
          },
        }
      )
        .exec()
        .catch((err) => {
          logger.warn({ err, actorId, idempotencyKey }, 'failed to complete idempotency record')
        })
    })

    next()
  } catch (err) {
    next(err)
  }
}
