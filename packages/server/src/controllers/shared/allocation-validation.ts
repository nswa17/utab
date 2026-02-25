import { z } from 'zod'

type TeamAlgorithm = 'standard' | 'strict' | 'powerpair' | 'break'
type AdjudicatorAlgorithm = 'standard' | 'traditional'
type DetailEntityKind = 'team' | 'adjudicator' | 'venue'

const teamStandardFilters = ['by_strength', 'by_side', 'by_past_opponent', 'by_institution', 'by_random'] as const
const adjudicatorStandardFilters = [
  'by_bubble',
  'by_strength',
  'by_attendance',
  'by_conflict',
  'by_institution',
  'by_past',
  'by_random',
] as const

const nonNegativeNumberSchema = z.number().finite().min(0)
const nonNegativeIntegerSchema = z.number().int().min(0)
const positiveRoundSchema = z.number().int().min(1)

const teamStandardOptionsSchema = z
  .object({
    method: z.enum(['original', 'straight', 'weighted', 'custom']).optional(),
    filters: z.array(z.enum(teamStandardFilters)).optional(),
    weights: z.array(nonNegativeNumberSchema).optional(),
  })
  .strict()

const strictConflictWeightsSchema = z
  .object({
    institution: nonNegativeNumberSchema.optional(),
    past_opponent: nonNegativeNumberSchema.optional(),
  })
  .strict()

const teamStrictOptionsSchema = z
  .object({
    pairing_method: z.enum(['random', 'fold', 'slide', 'sort', 'adjusted']).optional(),
    pullup_method: z.enum(['fromtop', 'frombottom', 'random']).optional(),
    position_method: z.enum(['random', 'adjusted']).optional(),
    avoid_conflict: z.boolean().optional(),
    conflict_weights: strictConflictWeightsSchema.optional(),
    max_swap_iterations: nonNegativeIntegerSchema.optional(),
  })
  .strict()

const teamPowerpairOptionsSchema = z
  .object({
    odd_bracket: z.enum(['pullup_top', 'pullup_bottom', 'pullup_random']).optional(),
    pairing_method: z.enum(['slide', 'fold', 'random']).optional(),
    avoid_conflicts: z.union([z.literal('one_up_one_down'), z.literal('off'), z.boolean()]).optional(),
    conflict_weights: strictConflictWeightsSchema.optional(),
    max_swap_iterations: nonNegativeIntegerSchema.optional(),
  })
  .strict()

const teamBreakOptionsSchema = z.object({}).strict()

const adjudicatorStandardOptionsSchema = z
  .object({
    filters: z.array(z.enum(adjudicatorStandardFilters)).optional(),
  })
  .strict()

const adjudicatorTraditionalOptionsSchema = z
  .object({
    assign: z
      .enum([
        'high_to_high',
        'high_to_slight',
        'high_to_close',
        'middle_to_high',
        'middle_to_slight',
        'middle_to_close',
      ])
      .optional(),
    scatter: z.boolean().optional(),
  })
  .strict()

const numbersOfAdjudicatorsSchema = z
  .object({
    chairs: nonNegativeIntegerSchema.optional(),
    panels: nonNegativeIntegerSchema.optional(),
    trainees: nonNegativeIntegerSchema.optional(),
  })
  .strict()

const venueOptionsSchema = z
  .object({
    shuffle: z.boolean().optional(),
  })
  .strict()

const allocationOptionsEnvelopeSchema = z
  .object({
    team_allocation_algorithm: z.enum(['standard', 'strict', 'powerpair', 'break']).optional(),
    team_allocation_algorithm_options: z.unknown().optional(),
    adjudicator_allocation_algorithm: z.enum(['standard', 'traditional']).optional(),
    adjudicator_allocation_algorithm_options: z.unknown().optional(),
    numbers_of_adjudicators: z.unknown().optional(),
    venue_allocation_algorithm_options: z.unknown().optional(),
  })
  .strict()

const teamDetailSchema = z
  .object({
    r: positiveRoundSchema,
    available: z.boolean().optional(),
    institutions: z.array(z.string().min(1)).optional(),
    speakers: z.array(z.string().min(1)).optional(),
  })
  .passthrough()

const adjudicatorDetailSchema = z
  .object({
    r: positiveRoundSchema,
    available: z.boolean().optional(),
    institutions: z.array(z.string().min(1)).optional(),
    conflicts: z.array(z.string().min(1)).optional(),
  })
  .passthrough()

const venueDetailSchema = z
  .object({
    r: positiveRoundSchema,
    available: z.boolean().optional(),
    priority: z.number().finite().optional(),
  })
  .passthrough()

export type ValidatedAllocationOptions = {
  team_allocation_algorithm: TeamAlgorithm
  team_allocation_algorithm_options: Record<string, unknown>
  adjudicator_allocation_algorithm: AdjudicatorAlgorithm
  adjudicator_allocation_algorithm_options: Record<string, unknown>
  numbers_of_adjudicators: { chairs: number; panels: number; trainees: number }
  venue_allocation_algorithm_options: { shuffle?: boolean }
}

type ZodIssueLike = { path: (string | number)[]; message: string }

function formatIssue(issue: ZodIssueLike): string {
  const path = issue.path.map(String).join('.')
  return path.length > 0 ? `${path}: ${issue.message}` : issue.message
}

export function createBadRequestError(message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number }
  err.status = 400
  return err
}

function parseWithMessage<T>(
  parser: z.ZodType<T>,
  value: unknown,
  contextLabel: string
): T {
  const parsed = parser.safeParse(value)
  if (parsed.success) return parsed.data
  const firstIssue = parsed.error.issues[0]
  const detail = firstIssue ? formatIssue(firstIssue) : 'invalid value'
  throw createBadRequestError(`${contextLabel}: ${detail}`)
}

export function validateAllocationOptions(rawOptions: unknown): ValidatedAllocationOptions {
  const parsedEnvelope = parseWithMessage(
    allocationOptionsEnvelopeSchema,
    rawOptions ?? {},
    'Invalid allocation options'
  )

  const teamAlgorithm = (parsedEnvelope.team_allocation_algorithm ?? 'standard') as TeamAlgorithm
  const adjudicatorAlgorithm = (parsedEnvelope.adjudicator_allocation_algorithm ??
    'standard') as AdjudicatorAlgorithm

  const teamOptions =
    teamAlgorithm === 'strict'
      ? parseWithMessage(
          teamStrictOptionsSchema,
          parsedEnvelope.team_allocation_algorithm_options ?? {},
          'Invalid team strict options'
        )
      : teamAlgorithm === 'powerpair'
        ? parseWithMessage(
            teamPowerpairOptionsSchema,
            parsedEnvelope.team_allocation_algorithm_options ?? {},
            'Invalid team powerpair options'
          )
        : teamAlgorithm === 'break'
          ? parseWithMessage(
              teamBreakOptionsSchema,
              parsedEnvelope.team_allocation_algorithm_options ?? {},
              'Invalid team break options'
            )
        : parseWithMessage(
            teamStandardOptionsSchema,
            parsedEnvelope.team_allocation_algorithm_options ?? {},
            'Invalid team standard options'
          )

  const adjudicatorOptions =
    adjudicatorAlgorithm === 'traditional'
      ? parseWithMessage(
          adjudicatorTraditionalOptionsSchema,
          parsedEnvelope.adjudicator_allocation_algorithm_options ?? {},
          'Invalid adjudicator traditional options'
        )
      : parseWithMessage(
          adjudicatorStandardOptionsSchema,
          parsedEnvelope.adjudicator_allocation_algorithm_options ?? {},
          'Invalid adjudicator standard options'
        )

  const numbers = parseWithMessage(
    numbersOfAdjudicatorsSchema,
    parsedEnvelope.numbers_of_adjudicators ?? { chairs: 1, panels: 2, trainees: 0 },
    'Invalid numbers_of_adjudicators'
  )
  const venueOptions = parseWithMessage(
    venueOptionsSchema,
    parsedEnvelope.venue_allocation_algorithm_options ?? {},
    'Invalid venue options'
  )

  return {
    team_allocation_algorithm: teamAlgorithm,
    team_allocation_algorithm_options: teamOptions,
    adjudicator_allocation_algorithm: adjudicatorAlgorithm,
    adjudicator_allocation_algorithm_options: adjudicatorOptions,
    numbers_of_adjudicators: {
      chairs: numbers.chairs ?? 1,
      panels: numbers.panels ?? 2,
      trainees: numbers.trainees ?? 0,
    },
    venue_allocation_algorithm_options: venueOptions,
  }
}

export function validateEntityDetailsShape(
  kind: DetailEntityKind,
  entityLabel: string,
  details: unknown
): void {
  if (details === undefined || details === null) return
  if (!Array.isArray(details)) {
    throw createBadRequestError(`Invalid ${kind} details format for ${entityLabel}: details must be an array`)
  }

  details.forEach((detail, index) => {
    const schema =
      kind === 'team' ? teamDetailSchema : kind === 'adjudicator' ? adjudicatorDetailSchema : venueDetailSchema
    const parsed = schema.safeParse(detail)
    if (parsed.success) return
    const firstIssue = parsed.error.issues[0]
    const detailMessage = firstIssue ? formatIssue(firstIssue) : 'invalid detail'
    throw createBadRequestError(
      `Invalid ${kind} details format for ${entityLabel} at details[${index}]: ${detailMessage}`
    )
  })
}
