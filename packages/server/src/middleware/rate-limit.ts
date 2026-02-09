import type { Request } from 'express'
import os from 'node:os'
import rateLimit from 'express-rate-limit'
import slowDown from 'express-slow-down'
import { env } from '../config/environment.js'

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
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests',
})

export const apiSlowDown = createSlowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 200,
  delayStepMs: 25,
  maxDelayMs: 1000,
})

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: 'Too many authentication attempts',
})

export const authSlowDown = createSlowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 10,
  delayStepMs: 250,
  maxDelayMs: 4000,
})

export const submissionRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 120,
  message: 'Too many submission requests',
})

export const submissionSlowDown = createSlowDown({
  windowMs: 5 * 60 * 1000,
  delayAfter: 20,
  delayStepMs: 100,
  maxDelayMs: 2500,
})

export const rawResultRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 80,
  message: 'Too many raw result requests',
})

export const rawResultSlowDown = createSlowDown({
  windowMs: 5 * 60 * 1000,
  delayAfter: 15,
  delayStepMs: 120,
  maxDelayMs: 3000,
})
