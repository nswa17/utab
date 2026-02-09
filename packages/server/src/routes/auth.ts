import { Router } from 'express'
import { z } from 'zod'
import { login, logout, me, register } from '../controllers/auth.js'
import { requireAuth } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const loginSchema = {
  body: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  }),
}

const registerSchema = {
  body: z.object({
    username: z.string().min(1),
    password: z.string().min(6),
    role: z.enum(['superuser', 'organizer', 'adjudicator', 'speaker', 'audience']),
  }),
}

router.post('/login', validateRequest(loginSchema), login)
router.post('/register', validateRequest(registerSchema), register)
router.get('/me', requireAuth, me)
router.post('/logout', requireAuth, logout)

export { router as authRouter }
