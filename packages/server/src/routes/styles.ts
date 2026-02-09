import { Router } from 'express'
import { z } from 'zod'
import { createStyle, deleteStyle, listStyles, updateStyle } from '../controllers/styles.js'
import { requireOrganizer } from '../middleware/auth.js'
import { validateRequest } from '../middleware/validation.js'

const router: Router = Router()

const createSchema = {
  body: z.object({
    id: z.number().int(),
    name: z.string().min(1),
    team_num: z.number().int().optional(),
    score_weights: z.any(),
    side_labels: z.any().optional(),
    side_labels_short: z.any().optional(),
    speaker_sequence: z.any(),
    range: z.any().optional(),
    adjudicator_range: z.any(),
    roles: z.any(),
    user_defined_data: z.any().optional(),
  }),
}

const updateSchema = {
  params: z.object({ id: z.string() }),
  body: z.record(z.any()).refine((data) => Object.keys(data).length > 0, {
    message: 'update payload is required',
  }),
}

const deleteSchema = { params: z.object({ id: z.string() }) }

router.get('/', listStyles)
router.post('/', requireOrganizer, validateRequest(createSchema), createStyle)
router.patch('/:id', requireOrganizer, validateRequest(updateSchema), updateStyle)
router.delete('/:id', requireOrganizer, validateRequest(deleteSchema), deleteStyle)

export { router as styleRouter }
