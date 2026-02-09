import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  MONGODB_URI: z.string().url().default('mongodb://localhost/utab'),
  SESSION_SECRET: z.string().min(16).default('change-me-session-secret'),
  CORS_ORIGIN: z.string().min(1),
  UTAB_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional(),
  UTAB_LOG_FILE: z.string().min(1).optional(),
})

export const env = envSchema.parse(process.env)

export const isProd = env.NODE_ENV === 'production'
export const port = Number(env.PORT)

function normalizeOrigin(value: string): string {
  const parsed = new URL(value)
  return parsed.origin
}

const originCandidates = env.CORS_ORIGIN.split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0)

if (originCandidates.length === 0) {
  throw new Error('CORS_ORIGIN must contain at least one origin')
}

export const corsOrigins = originCandidates.map((value) => normalizeOrigin(value))

export function isAllowedCorsOrigin(origin: string): boolean {
  return corsOrigins.includes(origin)
}
