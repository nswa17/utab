import type { Request } from 'express'
import os from 'node:os'
import rateLimit from 'express-rate-limit'
import slowDown from 'express-slow-down'
import { env, rateLimitSettings } from '../config/environment.js'

type RateLimitConfig = {
  windowMs: number
  max: number
  message: string
}

type SlowDownConfig = {
  windowMs: number
  delayAfter: number
  delayStepMs: number
  maxDelayMs: number
}

const isTest = env.NODE_ENV === 'test'
const cpuCount = Math.max(1, os.cpus().length)

function skipLimiter(req: Request): boolean {
  if (isTest) return true
  if (req.method.toUpperCase() === 'OPTIONS') return true
  return false
}

function createRateLimiter(config: RateLimitConfig) {
  return rateLimit({
    windowMs: config.windowMs,
    max: () => Math.max(10, Math.round(config.max * loadAdaptiveFactor())),
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipLimiter,
    message: {
      data: null,
      errors: [{ name: 'TooManyRequests', message: config.message }],
    },
  })
}

function loadAdaptiveFactor(): number {
  const oneMinuteLoad = os.loadavg()[0] / cpuCount
  if (!Number.isFinite(oneMinuteLoad) || oneMinuteLoad <= 0) return 1
  if (oneMinuteLoad <= 0.35) return 1.4
  if (oneMinuteLoad <= 0.6) return 1.2
  if (oneMinuteLoad <= 0.9) return 1
  if (oneMinuteLoad <= 1.2) return 0.85
  return 0.7
}

function createSlowDown(config: SlowDownConfig) {
  return slowDown({
    windowMs: config.windowMs,
    delayAfter: config.delayAfter,
    delayMs: (used) => {
      if (used <= config.delayAfter) return 0
      const delayedHits = used - config.delayAfter
      return Math.min(delayedHits * config.delayStepMs, config.maxDelayMs)
    },
    maxDelayMs: config.maxDelayMs,
    skip: skipLimiter,
  })
}

export const apiRateLimiter = createRateLimiter({
  windowMs: rateLimitSettings.api.windowMs,
  max: rateLimitSettings.api.max,
  message: 'Too many requests',
})

export const apiSlowDown = createSlowDown({
  windowMs: rateLimitSettings.api.windowMs,
  delayAfter: rateLimitSettings.api.delayAfter,
  delayStepMs: rateLimitSettings.api.delayStepMs,
  maxDelayMs: rateLimitSettings.api.maxDelayMs,
})

export const authRateLimiter = createRateLimiter({
  windowMs: rateLimitSettings.auth.windowMs,
  max: rateLimitSettings.auth.max,
  message: 'Too many authentication attempts',
})

export const authSlowDown = createSlowDown({
  windowMs: rateLimitSettings.auth.windowMs,
  delayAfter: rateLimitSettings.auth.delayAfter,
  delayStepMs: rateLimitSettings.auth.delayStepMs,
  maxDelayMs: rateLimitSettings.auth.maxDelayMs,
})

export const submissionRateLimiter = createRateLimiter({
  windowMs: rateLimitSettings.submissions.windowMs,
  max: rateLimitSettings.submissions.max,
  message: 'Too many submission requests',
})

export const submissionSlowDown = createSlowDown({
  windowMs: rateLimitSettings.submissions.windowMs,
  delayAfter: rateLimitSettings.submissions.delayAfter,
  delayStepMs: rateLimitSettings.submissions.delayStepMs,
  maxDelayMs: rateLimitSettings.submissions.maxDelayMs,
})

export const rawResultRateLimiter = createRateLimiter({
  windowMs: rateLimitSettings.rawResults.windowMs,
  max: rateLimitSettings.rawResults.max,
  message: 'Too many raw result requests',
})

export const rawResultSlowDown = createSlowDown({
  windowMs: rateLimitSettings.rawResults.windowMs,
  delayAfter: rateLimitSettings.rawResults.delayAfter,
  delayStepMs: rateLimitSettings.rawResults.delayStepMs,
  maxDelayMs: rateLimitSettings.rawResults.maxDelayMs,
})
