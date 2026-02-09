import mongoose from 'mongoose'
import { env } from './environment.js'
import { logger } from '../middleware/logging.js'
import { seedStyles } from '../seed/styles.js'

let connection: typeof mongoose | null = null

// Retry MongoDB connection so the server can start even if the DB container
// is still booting when we come up under docker-compose.
const MAX_RETRIES = 5
const RETRY_DELAY_MS = 2000

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
        await seedStyles()
      } catch (err) {
        logger.error({ err }, 'failed to seed styles')
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
  logger.info('mongodb disconnected')
}
