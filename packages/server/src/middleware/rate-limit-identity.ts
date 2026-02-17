import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, RequestHandler, Response } from 'express'
import { isProd, rateLimitIdentitySettings } from '../config/environment.js'

const COOKIE_PATH = '/'
const CLIENT_ID_BYTES = 16
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/

function signClientId(clientId: string): string {
  return createHmac('sha256', rateLimitIdentitySettings.secret)
    .update(clientId)
    .digest('base64url')
}

function buildToken(clientId: string): string {
  return `${clientId}.${signClientId(clientId)}`
}

function parseCookieHeader(rawCookieHeader: string | string[] | undefined): string {
  if (Array.isArray(rawCookieHeader)) {
    return rawCookieHeader.join(';')
  }
  return rawCookieHeader ?? ''
}

function readCookieValue(cookieHeader: string, name: string): string | null {
  const pairs = cookieHeader.split(';')
  for (const pair of pairs) {
    const trimmed = pair.trim()
    if (!trimmed.startsWith(`${name}=`)) continue
    const value = trimmed.slice(name.length + 1)
    if (!value) return null
    try {
      return decodeURIComponent(value)
    } catch {
      return null
    }
  }
  return null
}

function verifyToken(token: string): string | null {
  const lastDot = token.lastIndexOf('.')
  if (lastDot <= 0 || lastDot >= token.length - 1) return null

  const clientId = token.slice(0, lastDot)
  const signature = token.slice(lastDot + 1)
  if (!CLIENT_ID_PATTERN.test(clientId) || signature.length === 0) return null

  const expected = signClientId(clientId)
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (signatureBuffer.length !== expectedBuffer.length) return null

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null
  return clientId
}

function issueIdentityCookie(res: Response): void {
  const clientId = randomBytes(CLIENT_ID_BYTES).toString('base64url')
  const token = buildToken(clientId)
  res.cookie(rateLimitIdentitySettings.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: rateLimitIdentitySettings.cookieMaxAgeMs,
    path: COOKIE_PATH,
  })
}

export const ensureRateLimitIdentity: RequestHandler = (req, res, next) => {
  if (req.method.toUpperCase() === 'OPTIONS') {
    next()
    return
  }

  const cookieHeader = parseCookieHeader(req.headers.cookie)
  const rawToken = readCookieValue(cookieHeader, rateLimitIdentitySettings.cookieName)

  if (rawToken) {
    const clientId = verifyToken(rawToken)
    if (clientId) {
      ;(req as Request & { rateLimitClientId?: string }).rateLimitClientId = clientId
      next()
      return
    }
  }

  issueIdentityCookie(res)
  next()
}
