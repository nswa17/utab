import { Router } from 'express'
import { z } from 'zod'
import { listAuditLogs } from '../controllers/audit-logs.js'
import { requireAuth } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const listSchema = {
  query: z.object({
    tournamentId: z.string().min(1).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    actorUserId: z.string().min(1).optional(),
    action: z.string().min(1).optional(),
    targetType: z.string().min(1).optional(),
    targetId: z.string().min(1).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
}

router.get('/', requireAuth, validateRequest(listSchema), listAuditLogs)

export { router as auditLogRouter }
