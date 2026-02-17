import type { Request } from 'express'
import os from 'node:os'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import slowDown from 'express-slow-down'
import { env, rateLimitSettings } from '../config/environment.js'

type KeyGenerator = (req: Request) => string

type RateLimitConfig = {
  windowMs: number
  max: number
  message: string
  keyGenerator?: KeyGenerator
}

type SlowDownConfig = {
  windowMs: number
  delayAfter: number
  delayStepMs: number
  maxDelayMs: number
  keyGenerator?: KeyGenerator
}

const isTest = env.NODE_ENV === 'test'
const cpuCount = Math.max(1, os.cpus().length)

function skipLimiter(req: Request): boolean {
  if (isTest) return true
  if (req.method.toUpperCase() === 'OPTIONS') return true
  return false
}

function createRateLimiter(config: RateLimitConfig) {
  const keyGenerator = config.keyGenerator
  return rateLimit({
    windowMs: config.windowMs,
    max: () => Math.max(10, Math.round(config.max * loadAdaptiveFactor())),
    keyGenerator: keyGenerator ? (req) => keyGenerator(req) : undefined,
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
  const keyGenerator = config.keyGenerator
  return slowDown({
    windowMs: config.windowMs,
    keyGenerator: keyGenerator ? (req) => keyGenerator(req) : undefined,
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

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function normalizeIp(req: Request): string {
  const rawIp = typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : '0.0.0.0'
  return ipKeyGenerator(rawIp)
}

function normalizeKeyPart(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase())
}

function resolveUserKey(req: Request): string | null {
  const userId = String(req.session?.userId ?? '').trim()
  if (!userId) return null
  return `user:${normalizeKeyPart(userId)}`
}

function resolveClientKey(req: Request): string | null {
  const clientId = String((req as Request & { rateLimitClientId?: string }).rateLimitClientId ?? '').trim()
  if (!clientId) return null
  return `client:${normalizeKeyPart(clientId)}`
}

function resolveAuthAccountKey(req: Request): string | null {
  const body = toRecord(req.body)
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  if (!username) return null
  return `auth:${normalizeKeyPart(username)}:ip:${normalizeIp(req)}`
}

function ipOnlyKey(req: Request): string {
  return `ip:${normalizeIp(req)}`
}

function clientOrIpKey(req: Request): string {
  return resolveClientKey(req) ?? ipOnlyKey(req)
}

function userOrClientOrIpKey(req: Request): string {
  return resolveUserKey(req) ?? resolveClientKey(req) ?? ipOnlyKey(req)
}

function authAccountOrClientOrIpKey(req: Request): string {
  return resolveAuthAccountKey(req) ?? clientOrIpKey(req)
}

export const apiIpGuardRateLimiter = createRateLimiter({
  windowMs: rateLimitSettings.apiIpGuard.windowMs,
  max: rateLimitSettings.apiIpGuard.max,
  message: 'Too many requests from this network',
  keyGenerator: ipOnlyKey,
})

export const apiRateLimiter = createRateLimiter({
  windowMs: rateLimitSettings.api.windowMs,
  max: rateLimitSettings.api.max,
  message: 'Too many requests',
  keyGenerator: clientOrIpKey,
})

export const apiSlowDown = createSlowDown({
  windowMs: rateLimitSettings.api.windowMs,
  delayAfter: rateLimitSettings.api.delayAfter,
  delayStepMs: rateLimitSettings.api.delayStepMs,
  maxDelayMs: rateLimitSettings.api.maxDelayMs,
  keyGenerator: clientOrIpKey,
})

export const authRateLimiter = createRateLimiter({
  windowMs: rateLimitSettings.auth.windowMs,
  max: rateLimitSettings.auth.max,
  message: 'Too many authentication attempts',
  keyGenerator: authAccountOrClientOrIpKey,
})

export const authSlowDown = createSlowDown({
  windowMs: rateLimitSettings.auth.windowMs,
  delayAfter: rateLimitSettings.auth.delayAfter,
  delayStepMs: rateLimitSettings.auth.delayStepMs,
  maxDelayMs: rateLimitSettings.auth.maxDelayMs,
  keyGenerator: authAccountOrClientOrIpKey,
})

export const submissionRateLimiter = createRateLimiter({
  windowMs: rateLimitSettings.submissions.windowMs,
  max: rateLimitSettings.submissions.max,
  message: 'Too many submission requests',
  keyGenerator: userOrClientOrIpKey,
})

export const submissionSlowDown = createSlowDown({
  windowMs: rateLimitSettings.submissions.windowMs,
  delayAfter: rateLimitSettings.submissions.delayAfter,
  delayStepMs: rateLimitSettings.submissions.delayStepMs,
  maxDelayMs: rateLimitSettings.submissions.maxDelayMs,
  keyGenerator: userOrClientOrIpKey,
})

export const rawResultRateLimiter = createRateLimiter({
  windowMs: rateLimitSettings.rawResults.windowMs,
  max: rateLimitSettings.rawResults.max,
  message: 'Too many raw result requests',
  keyGenerator: userOrClientOrIpKey,
})

export const rawResultSlowDown = createSlowDown({
  windowMs: rateLimitSettings.rawResults.windowMs,
  delayAfter: rateLimitSettings.rawResults.delayAfter,
  delayStepMs: rateLimitSettings.rawResults.delayStepMs,
  maxDelayMs: rateLimitSettings.rawResults.maxDelayMs,
  keyGenerator: userOrClientOrIpKey,
})
