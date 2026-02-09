import type { RequestHandler } from 'express'
import { isAllowedCorsOrigin } from '../config/environment.js'

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) return value[0]
  return value
}

function toOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export const csrfOriginCheck: RequestHandler = (req, res, next) => {
  if (!STATE_CHANGING_METHODS.has(req.method.toUpperCase())) {
    next()
    return
  }

  const originHeader = firstHeaderValue(req.headers.origin)
  const refererHeader = firstHeaderValue(req.headers.referer)
  const requestOrigin = toOrigin(originHeader) ?? toOrigin(refererHeader)

  if (!requestOrigin) {
    // Non-browser clients and same-origin requests may omit both headers.
    next()
    return
  }

  if (!isAllowedCorsOrigin(requestOrigin)) {
    res.status(403).json({
      data: null,
      errors: [{ name: 'Forbidden', message: 'Origin/Referer is not allowed' }],
    })
    return
  }

  next()
}
