import mongoose from 'mongoose'
import { env } from './environment.js'
import { logger } from '../middleware/logging.js'
import { seedStyles } from '../seed/styles.js'
import { runStartupDataMaintenance } from '../services/startup-data-maintenance.service.js'
import { AuditLogModel } from '../models/audit-log.js'
import { ErasureRequestModel } from '../models/erasure-request.js'
import { ServiceAccountIdempotencyModel } from '../models/service-account-idempotency.js'
import { ServiceTokenRevocationModel } from '../models/service-token-revocation.js'
import { StyleModel } from '../models/style.js'
import { TournamentMemberModel } from '../models/tournament-member.js'
import { UserModel } from '../models/user.js'

let connection: typeof mongoose | null = null
let startupMaintenanceApplied = false
let globalIndexesReady = false

// Retry MongoDB connection so the server can start even if the DB container
// is still booting when we come up under docker-compose.
const MAX_RETRIES = 5
const RETRY_DELAY_MS = 2000

async function ensureGlobalIndexes(): Promise<void> {
  if (globalIndexesReady) return
  await Promise.all([
    UserModel.createIndexes(),
    TournamentMemberModel.createIndexes(),
    StyleModel.createIndexes(),
    ServiceTokenRevocationModel.createIndexes(),
    ServiceAccountIdempotencyModel.createIndexes(),
    AuditLogModel.createIndexes(),
    ErasureRequestModel.createIndexes(),
  ])
  globalIndexesReady = true
}

export async function connectDatabase(): Promise<typeof mongoose> {
  if (connection) return connection

  mongoose.set('strictQuery', true)

  let attempt = 0
  while (!connection) {
    attempt += 1
    try {
      connection = await mongoose.connect(env.MONGODB_URI, {
        autoIndex: !env.NODE_ENV || env.NODE_ENV === 'development',
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      })

      logger.info({ uri: env.MONGODB_URI, attempt }, 'mongodb connected')
      try {
        await ensureGlobalIndexes()
        await seedStyles()
      } catch (err) {
        logger.error({ err }, 'failed to seed styles')
      }
      if (!startupMaintenanceApplied) {
        try {
          const summary = await runStartupDataMaintenance()
          startupMaintenanceApplied = true
          logger.info({ summary }, 'startup data maintenance applied')
        } catch (err) {
          logger.error({ err }, 'failed to apply startup data maintenance')
        }
      }
      return connection
    } catch (err) {
      logger.warn({ err, attempt }, 'mongodb connection failed')
      if (attempt >= MAX_RETRIES) {
        logger.error({ err }, 'mongodb connection retries exhausted')
        throw err
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }

  return connection
}

export async function disconnectDatabase(): Promise<void> {
  if (!connection) return
  await connection.disconnect()
  connection = null
  globalIndexesReady = false
  logger.info('mongodb disconnected')
}
