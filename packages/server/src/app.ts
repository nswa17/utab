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
  port,
} from './config/environment.js'
import { errorHandler, notFound } from './middleware/error.js'
import { connectDatabase } from './config/database.js'
import { csrfOriginCheck } from './middleware/csrf.js'
import { auditRequestLogger } from './middleware/audit-log.js'
import { ensureRateLimitIdentity } from './middleware/rate-limit-identity.js'
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
  app.use('/api', ensureRateLimitIdentity)
  app.use('/api', apiIpGuardRateLimiter)
  app.use('/api', apiSlowDown, apiRateLimiter)

  app.use('/api/auth', express.json({ limit: jsonBodyLimits.auth }))
  app.use('/api/auth', authSlowDown, authRateLimiter)

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

  app.use('/api/submissions', submissionSlowDown, submissionRateLimiter)
  app.use('/api/raw-results', rawResultSlowDown, rawResultRateLimiter)
  app.use('/api/submissions', express.json({ limit: jsonBodyLimits.submissions }))
  app.use('/api/raw-results', express.json({ limit: jsonBodyLimits.rawResults }))
  app.use('/api', express.json({ limit: jsonBodyLimits.default }))
  app.use(httpLogger)
  app.use(auditRequestLogger)

  app.use('/api', createRoutes())

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
