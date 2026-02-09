import mongoose from 'mongoose'
import { env } from '../config/environment.js'
import { logger } from '../middleware/logging.js'

const connections = new Map<string, mongoose.Connection>()

export async function getTournamentConnection(tournamentId: string): Promise<mongoose.Connection> {
  const existing = connections.get(tournamentId)
  if (existing) return existing

  const connection = mongoose.createConnection(env.MONGODB_URI, {
    dbName: `tournament-${tournamentId}`,
  })

  connection.on('error', (err) => {
    logger.error({ err, tournamentId }, 'tournament mongodb connection error')
  })
  connection.on('connected', () => {
    logger.info({ tournamentId }, 'tournament mongodb connected')
  })
  connection.on('disconnected', () => {
    connections.delete(tournamentId)
  })

  await connection.asPromise()
  connections.set(tournamentId, connection)
  return connection
}

export async function closeTournamentConnections(): Promise<void> {
  const tasks: Promise<void>[] = []
  for (const [tournamentId, connection] of connections.entries()) {
    tasks.push(
      connection
        .close()
        .then(() => logger.info({ tournamentId }, 'tournament mongodb disconnected'))
        .catch((err) => logger.error({ err, tournamentId }, 'tournament mongodb disconnect error'))
    )
  }
  await Promise.all(tasks)
  connections.clear()
}

export async function dropTournamentDatabase(tournamentId: string): Promise<void> {
  const connection = await getTournamentConnection(tournamentId)
  try {
    if (!connection.db) {
      logger.warn({ tournamentId }, 'tournament mongodb db not ready')
      return
    }
    await connection.db.dropDatabase()
    logger.info({ tournamentId }, 'tournament mongodb dropped')
  } catch (err) {
    logger.error({ err, tournamentId }, 'tournament mongodb drop error')
  } finally {
    try {
      await connection.close()
      logger.info({ tournamentId }, 'tournament mongodb disconnected after drop')
    } catch (err) {
      logger.error({ err, tournamentId }, 'tournament mongodb disconnect error after drop')
    }
    connections.delete(tournamentId)
  }
}
