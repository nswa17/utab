import type { Request, Response } from 'express'
import { UserModel } from '../../models/user.js'
import { verifyPassword } from '../../services/hash.service.js'

function unauthorized(res: Response, message = 'Please login first') {
  res.status(401).json({ data: null, errors: [{ name: 'Unauthorized', message }] })
}

function badRequest(res: Response, message: string) {
  res.status(400).json({ data: null, errors: [{ name: 'BadRequest', message }] })
}

/**
 * Sensitive operations (PII erase/send approval) require interactive re-authentication.
 * Service-account callers are exempt because they are already authenticated by JWT + scopes.
 */
export async function ensureSensitiveActionReauthentication(
  req: Request,
  res: Response,
  reauthPassword: unknown
): Promise<boolean> {
  if (req.serviceAccount) return true

  const actorUserId = String(req.session?.userId ?? '').trim()
  if (!actorUserId) {
    unauthorized(res)
    return false
  }

  if (typeof reauthPassword !== 'string' || reauthPassword.length === 0) {
    badRequest(res, 'reauthPassword is required for this operation')
    return false
  }

  const user = await UserModel.findById(actorUserId).select({ passwordHash: 1 }).lean().exec()
  if (!user || typeof user.passwordHash !== 'string' || user.passwordHash.length === 0) {
    unauthorized(res, 'User not found')
    return false
  }

  const passwordMatched = await verifyPassword(reauthPassword, user.passwordHash)
  if (!passwordMatched) {
    unauthorized(res, 'Re-authentication failed')
    return false
  }

  return true
}
