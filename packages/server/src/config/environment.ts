import { z } from 'zod'

const positiveInt = z.coerce.number().int().positive()

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
  RATE_LIMIT_ID_COOKIE_NAME: z.string().min(1).default('utab_rlid'),
  RATE_LIMIT_ID_COOKIE_MAX_AGE_MS: positiveInt.default(30 * 24 * 60 * 60 * 1000),
  RATE_LIMIT_ID_SECRET: z.string().min(16).optional(),
  RATE_LIMIT_API_WINDOW_MS: positiveInt.default(15 * 60 * 1000),
  RATE_LIMIT_API_MAX: positiveInt.default(1000),
  RATE_LIMIT_API_DELAY_AFTER: positiveInt.default(200),
  RATE_LIMIT_API_DELAY_STEP_MS: positiveInt.default(25),
  RATE_LIMIT_API_MAX_DELAY_MS: positiveInt.default(1000),
  RATE_LIMIT_API_IP_GUARD_WINDOW_MS: positiveInt.default(60 * 1000),
  RATE_LIMIT_API_IP_GUARD_MAX: positiveInt.default(600),
  RATE_LIMIT_AUTH_WINDOW_MS: positiveInt.default(15 * 60 * 1000),
  RATE_LIMIT_AUTH_MAX: positiveInt.default(40),
  RATE_LIMIT_AUTH_DELAY_AFTER: positiveInt.default(10),
  RATE_LIMIT_AUTH_DELAY_STEP_MS: positiveInt.default(250),
  RATE_LIMIT_AUTH_MAX_DELAY_MS: positiveInt.default(4000),
  RATE_LIMIT_SUBMISSIONS_WINDOW_MS: positiveInt.default(5 * 60 * 1000),
  RATE_LIMIT_SUBMISSIONS_MAX: positiveInt.default(240),
  RATE_LIMIT_SUBMISSIONS_DELAY_AFTER: positiveInt.default(40),
  RATE_LIMIT_SUBMISSIONS_DELAY_STEP_MS: positiveInt.default(80),
  RATE_LIMIT_SUBMISSIONS_MAX_DELAY_MS: positiveInt.default(2500),
  RATE_LIMIT_RAW_RESULTS_WINDOW_MS: positiveInt.default(5 * 60 * 1000),
  RATE_LIMIT_RAW_RESULTS_MAX: positiveInt.default(120),
  RATE_LIMIT_RAW_RESULTS_DELAY_AFTER: positiveInt.default(20),
  RATE_LIMIT_RAW_RESULTS_DELAY_STEP_MS: positiveInt.default(120),
  RATE_LIMIT_RAW_RESULTS_MAX_DELAY_MS: positiveInt.default(3000),
  JSON_LIMIT_DEFAULT: z.string().default('256kb'),
  JSON_LIMIT_AUTH: z.string().default('32kb'),
  JSON_LIMIT_SUBMISSIONS: z.string().default('256kb'),
  JSON_LIMIT_RAW_RESULTS: z.string().default('1mb'),
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

export const rateLimitSettings = {
  api: {
    windowMs: env.RATE_LIMIT_API_WINDOW_MS,
    max: env.RATE_LIMIT_API_MAX,
    delayAfter: env.RATE_LIMIT_API_DELAY_AFTER,
    delayStepMs: env.RATE_LIMIT_API_DELAY_STEP_MS,
    maxDelayMs: env.RATE_LIMIT_API_MAX_DELAY_MS,
  },
  apiIpGuard: {
    windowMs: env.RATE_LIMIT_API_IP_GUARD_WINDOW_MS,
    max: env.RATE_LIMIT_API_IP_GUARD_MAX,
  },
  auth: {
    windowMs: env.RATE_LIMIT_AUTH_WINDOW_MS,
    max: env.RATE_LIMIT_AUTH_MAX,
    delayAfter: env.RATE_LIMIT_AUTH_DELAY_AFTER,
    delayStepMs: env.RATE_LIMIT_AUTH_DELAY_STEP_MS,
    maxDelayMs: env.RATE_LIMIT_AUTH_MAX_DELAY_MS,
  },
  submissions: {
    windowMs: env.RATE_LIMIT_SUBMISSIONS_WINDOW_MS,
    max: env.RATE_LIMIT_SUBMISSIONS_MAX,
    delayAfter: env.RATE_LIMIT_SUBMISSIONS_DELAY_AFTER,
    delayStepMs: env.RATE_LIMIT_SUBMISSIONS_DELAY_STEP_MS,
    maxDelayMs: env.RATE_LIMIT_SUBMISSIONS_MAX_DELAY_MS,
  },
  rawResults: {
    windowMs: env.RATE_LIMIT_RAW_RESULTS_WINDOW_MS,
    max: env.RATE_LIMIT_RAW_RESULTS_MAX,
    delayAfter: env.RATE_LIMIT_RAW_RESULTS_DELAY_AFTER,
    delayStepMs: env.RATE_LIMIT_RAW_RESULTS_DELAY_STEP_MS,
    maxDelayMs: env.RATE_LIMIT_RAW_RESULTS_MAX_DELAY_MS,
  },
} as const

export const rateLimitIdentitySettings = {
  cookieName: env.RATE_LIMIT_ID_COOKIE_NAME,
  cookieMaxAgeMs: env.RATE_LIMIT_ID_COOKIE_MAX_AGE_MS,
  secret: env.RATE_LIMIT_ID_SECRET ?? env.SESSION_SECRET,
} as const

export const jsonBodyLimits = {
  default: env.JSON_LIMIT_DEFAULT,
  auth: env.JSON_LIMIT_AUTH,
  submissions: env.JSON_LIMIT_SUBMISSIONS,
  rawResults: env.JSON_LIMIT_RAW_RESULTS,
} as const
