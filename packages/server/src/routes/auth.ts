import { Router } from 'express'
import { z } from 'zod'
import {
  listServiceTokenRevocations,
  login,
  logout,
  me,
  register,
  revokeServiceToken,
} from '../controllers/auth.js'
import { requireAuth, requireOrganizer } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const loginSchema = {
  body: z.object({
    username: z.string().trim().min(1),
    password: z.string().min(1),
  }),
}

const registerSchema = {
  body: z.object({
    username: z.string().trim().min(1),
    password: z.string().min(6),
    role: z.enum(['superuser', 'organizer', 'adjudicator', 'speaker', 'audience']),
  }),
}

const revokeTokenSchema = {
  body: z.object({
    jti: z.string().min(1).max(128),
    reason: z.string().min(1).max(500).optional(),
    expiresAt: z.string().datetime().optional(),
  }),
}

const listRevocationsSchema = {
  query: z.object({
    active: z.enum(['true', 'false']).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
}

router.post('/login', validateRequest(loginSchema), login)
router.post('/register', validateRequest(registerSchema), register)
router.get('/me', requireAuth, me)
router.post('/logout', logout)
router.get(
  '/service-token-revocations',
  requireOrganizer,
  validateRequest(listRevocationsSchema),
  listServiceTokenRevocations
)
router.post(
  '/service-token-revocations',
  requireOrganizer,
  validateRequest(revokeTokenSchema),
  revokeServiceToken
)

export { router as authRouter }
