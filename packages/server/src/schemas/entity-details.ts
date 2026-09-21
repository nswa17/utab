import { z } from 'zod'

const positiveRoundSchema = z.number().int().min(1)

export const teamTemplateSchema = z
  .object({
    available: z.boolean().optional(),
    conflicts: z.array(z.string().min(1)).optional(),
    speakers: z.array(z.string().min(1)).optional(),
  })
  .passthrough()

export const adjudicatorTemplateSchema = z
  .object({
    available: z.boolean().optional(),
    conflicts: z.array(z.string().min(1)).optional(),
    conflict_teams: z.array(z.string().min(1)).optional(),
  })
  .passthrough()

export const venueTemplateSchema = z
  .object({
    available: z.boolean().optional(),
    priority: z.number().finite().optional(),
  })
  .passthrough()

export const teamDetailSchema = z
  .object({
    r: positiveRoundSchema,
    available: z.boolean().optional(),
    conflicts: z.array(z.string().min(1)).optional(),
    speakers: z.array(z.string().min(1)).optional(),
  })
  .passthrough()

export const adjudicatorDetailSchema = z
  .object({
    r: positiveRoundSchema,
    available: z.boolean().optional(),
    conflicts: z.array(z.string().min(1)).optional(),
    conflict_teams: z.array(z.string().min(1)).optional(),
  })
  .passthrough()

export const venueDetailSchema = z
  .object({
    r: positiveRoundSchema,
    available: z.boolean().optional(),
    priority: z.number().finite().optional(),
  })
  .passthrough()

function rejectDuplicateRounds(details: Array<{ r: number }>, ctx: z.RefinementCtx) {
  const firstIndexByRound = new Map<number, number>()
  details.forEach((detail, index) => {
    const firstIndex = firstIndexByRound.get(detail.r)
    if (firstIndex !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'r'],
        message: `duplicate round ${detail.r}; already defined at index ${firstIndex}`,
      })
      return
    }
    firstIndexByRound.set(detail.r, index)
  })
}

export const teamDetailsSchema = z.array(teamDetailSchema).superRefine(rejectDuplicateRounds)
export const adjudicatorDetailsSchema = z
  .array(adjudicatorDetailSchema)
  .superRefine(rejectDuplicateRounds)
export const venueDetailsSchema = z.array(venueDetailSchema).superRefine(rejectDuplicateRounds)
