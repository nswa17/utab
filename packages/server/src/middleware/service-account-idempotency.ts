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


async function persistTerminalResponse(input: {
  actorId: string
  idempotencyKey: string
  statusCode: number
  responseBody: unknown
}): Promise<void> {
  const { actorId, idempotencyKey, statusCode, responseBody } = input
  let lastError: unknown = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await ServiceAccountIdempotencyModel.updateOne(
        { actorId, idempotencyKey, status: 'in_progress' },
        {
          $set: {
            status: 'completed',
            responseStatus: statusCode,
            responseBody,
            completedAt: new Date(),
          },
        }
      ).exec()

      if (result.matchedCount === 1) return

      const existing = await ServiceAccountIdempotencyModel.findOne({
        actorId,
        idempotencyKey,
      })
        .lean()
        .exec()
      if (existing?.status === 'completed') return

      throw new Error('Idempotency record was not available for completion')
    } catch (error) {
      lastError = error
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)))
      }
    }
  }

  logger.error(
    { err: lastError, actorId, idempotencyKey, statusCode },
    'failed to durably persist terminal idempotency response'
  )
  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to durably persist terminal idempotency response')
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

    const originalJson = res.json.bind(res)
    let terminalResponseStarted = false

    res.json = ((body: unknown) => {
      if (terminalResponseStarted) {
        return originalJson(body)
      }
      terminalResponseStarted = true

      const statusCode = res.statusCode
      void persistTerminalResponse({
        actorId,
        idempotencyKey,
        statusCode,
        responseBody: body,
      }).then(
        () => {
          originalJson(body)
        },
        (error) => {
          logger.error(
            { err: error, actorId, idempotencyKey, statusCode },
            'withholding terminal response because idempotency completion was not durable'
          )
          if (res.headersSent) {
            res.destroy(error instanceof Error ? error : undefined)
            return
          }
          res.status(503)
          originalJson({
            data: null,
            errors: [
              {
                name: 'ServiceUnavailable',
                message:
                  'Unable to durably record the idempotent response; the request may have been applied and this key is blocked',
              },
            ],
          })
        }
      )

      return res
    }) as typeof res.json

    next()
  } catch (err) {
    next(err)
  }
}
