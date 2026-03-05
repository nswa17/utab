import express from 'express'
import session from 'express-session'
import MongoStore from 'connect-mongo'
import cors from 'cors'
import { httpLogger, logger } from './middleware/logging.js'
import { createRoutes } from './routes/index.js'
import {
  corsOrigins,
  env,
  isAllowedCorsOrigin,
  isProd,
  jsonBodyLimits,
  legacyApiSettings,
  port,
} from './config/environment.js'
import { errorHandler, notFound } from './middleware/error.js'
import { connectDatabase } from './config/database.js'
import { csrfOriginCheck } from './middleware/csrf.js'
import { auditRequestLogger } from './middleware/audit-log.js'
import { ensureRateLimitIdentity } from './middleware/rate-limit-identity.js'
import {
  attachServiceAccountPrincipal,
  enforceServiceAccountScope,
  requireServiceAccountIdempotencyKey,
} from './middleware/service-account-auth.js'
import { handleServiceAccountIdempotency } from './middleware/service-account-idempotency.js'
import {
  apiIpGuardRateLimiter,
  apiRateLimiter,
  apiSlowDown,
  authRateLimiter,
  authSlowDown,
  rawResultRateLimiter,
  rawResultSlowDown,
  submissionRateLimiter,
  submissionSlowDown,
} from './middleware/rate-limit.js'

export function createApp(): express.Express {
  const app = express()

  app.set('trust proxy', isProd ? 1 : false)

  app.use(
    cors({
      credentials: true,
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true)
          return
        }
        callback(null, isAllowedCorsOrigin(origin))
      },
    })
  )
  app.use(csrfOriginCheck)

  app.use(
    session({
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: env.MONGODB_URI, stringify: false }),
      proxy: isProd,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        maxAge: 1000 * 60 * 60 * 24, // 1 day
      },
    })
  )

  app.use(httpLogger)
  app.use(auditRequestLogger)

  function mountApiNamespace(prefix: '/api' | '/api/v1', options?: { deprecated?: boolean }) {
    app.use(prefix, attachServiceAccountPrincipal)
    app.use(prefix, enforceServiceAccountScope)
    app.use(prefix, requireServiceAccountIdempotencyKey)

    app.use(prefix, ensureRateLimitIdentity)
    app.use(prefix, apiIpGuardRateLimiter)
    app.use(prefix, apiSlowDown, apiRateLimiter)

    app.use(`${prefix}/auth`, express.json({ limit: jsonBodyLimits.auth }))
    app.use(`${prefix}/auth`, authSlowDown, authRateLimiter)

    app.use(`${prefix}/submissions`, submissionSlowDown, submissionRateLimiter)
    app.use(`${prefix}/raw-results`, rawResultSlowDown, rawResultRateLimiter)
    app.use(`${prefix}/submissions`, express.json({ limit: jsonBodyLimits.submissions }))
    app.use(`${prefix}/raw-results`, express.json({ limit: jsonBodyLimits.rawResults }))
    app.use(prefix, express.json({ limit: jsonBodyLimits.default }))
    app.use(prefix, handleServiceAccountIdempotency)

    if (options?.deprecated) {
      app.use(prefix, (_req, res, next) => {
        res.setHeader('Deprecation', 'true')
        res.setHeader('Sunset', legacyApiSettings.sunsetAt.toUTCString())
        res.setHeader('Link', '</api/v1>; rel="successor-version"')
        res.setHeader('Warning', '299 - "Deprecated API: use /api/v1"')
        next()
      })
    }

    app.use(prefix, createRoutes())
  }

  mountApiNamespace('/api/v1')
  if (legacyApiSettings.enabled) {
    mountApiNamespace('/api', { deprecated: true })
  }

  app.use(notFound)
  app.use(errorHandler)

  return app
}

export async function start() {
  const app = createApp()
  await connectDatabase()

  const server = app.listen(port, () => {
    logger.info({ port, corsOrigins }, 'server started')
  })

  return server
}
