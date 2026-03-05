import { Router } from 'express'
import { z } from 'zod'
import {
  approveErasureRequest,
  cancelErasureRequest,
  createErasureRequest,
  executeErasureRequest,
  listErasureRequests,
  rejectErasureRequest,
} from '../controllers/erasure-requests.js'
import { requireTournamentAdmin } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const listSchema = {
  query: z.object({
    tournamentId: z.string().min(1),
    status: z
      .enum(['requested', 'approved', 'rejected', 'running', 'completed', 'failed', 'cancelled'])
      .optional(),
    targetType: z.enum(['speaker', 'adjudicator']).optional(),
    targetId: z.string().min(1).optional(),
    requestedBy: z.string().min(1).max(128).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(500).optional(),
  }),
}

const createSchema = {
  body: z.object({
    tournamentId: z.string().min(1),
    targetType: z.enum(['speaker', 'adjudicator']),
    targetId: z.string().min(1),
    reason: z.string().min(5).max(500),
    targetRefs: z.array(z.string().min(1).max(256)).max(20).optional(),
    eraseMode: z.enum(['anonymize', 'hard_delete']).optional(),
  }),
}

const idParamSchema = { params: z.object({ id: z.string().min(1) }) }

const approveSchema = {
  params: idParamSchema.params,
  body: z.object({
    tournamentId: z.string().min(1),
    approvedBy: z.string().min(1).max(128).optional(),
    reauthPassword: z.string().min(1).max(200).optional(),
  }),
}

const executeSchema = {
  params: idParamSchema.params,
  body: z.object({
    tournamentId: z.string().min(1),
    reauthPassword: z.string().min(1).max(200).optional(),
  }),
}

const rejectSchema = {
  params: idParamSchema.params,
  body: z.object({
    tournamentId: z.string().min(1),
    reason: z.string().min(1).max(500).optional(),
    reauthPassword: z.string().min(1).max(200).optional(),
  }),
}

const cancelSchema = {
  params: idParamSchema.params,
  body: z.object({
    tournamentId: z.string().min(1),
    reason: z.string().min(1).max(500).optional(),
    reauthPassword: z.string().min(1).max(200).optional(),
  }),
}

router.get('/erasure-requests', requireTournamentAdmin(), validateRequest(listSchema), listErasureRequests)
router.post('/erasure-requests', requireTournamentAdmin(), validateRequest(createSchema), createErasureRequest)
router.patch(
  '/erasure-requests/:id/approve',
  requireTournamentAdmin(),
  validateRequest(approveSchema),
  approveErasureRequest
)
router.patch(
  '/erasure-requests/:id/reject',
  requireTournamentAdmin(),
  validateRequest(rejectSchema),
  rejectErasureRequest
)
router.patch(
  '/erasure-requests/:id/cancel',
  requireTournamentAdmin(),
  validateRequest(cancelSchema),
  cancelErasureRequest
)
router.post(
  '/erasure-requests/:id/execute',
  requireTournamentAdmin(),
  validateRequest(executeSchema),
  executeErasureRequest
)

export { router as privacyRouter }
