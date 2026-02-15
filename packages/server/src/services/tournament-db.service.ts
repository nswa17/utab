import mongoose from 'mongoose'
import { env } from '../config/environment.js'
import { logger } from '../middleware/logging.js'

const connections = new Map<string, Promise<mongoose.Connection>>()

export async function getTournamentConnection(tournamentId: string): Promise<mongoose.Connection> {
  const existing = connections.get(tournamentId)
  if (existing) return existing

  const connection = mongoose.createConnection(env.MONGODB_URI, {
    dbName: `tournament-${tournamentId}`,
  })

  let connectPromise: Promise<mongoose.Connection>

  connection.on('error', (err) => {
    logger.error({ err, tournamentId }, 'tournament mongodb connection error')
  })
  connection.on('connected', () => {
    logger.info({ tournamentId }, 'tournament mongodb connected')
  })
  connection.on('disconnected', () => {
    if (connections.get(tournamentId) === connectPromise) {
      connections.delete(tournamentId)
    }
  })

  connectPromise = connection
    .asPromise()
    .then(() => connection)
    .catch(async (err) => {
      try {
        await connection.close()
      } catch (closeErr) {
        logger.error(
          { err: closeErr, tournamentId },
          'tournament mongodb disconnect error after failed connect'
        )
      }
      throw err
    })

  connections.set(tournamentId, connectPromise)
  try {
    return await connectPromise
  } catch (err) {
    if (connections.get(tournamentId) === connectPromise) {
      connections.delete(tournamentId)
    }
    throw err
  }
}

export async function closeTournamentConnections(): Promise<void> {
  const connectionEntries = Array.from(connections.entries())
  const resolved = await Promise.allSettled(
    connectionEntries.map(async ([tournamentId, connectionPromise]) => ({
      tournamentId,
      connection: await connectionPromise,
    }))
  )

  const tasks: Promise<void>[] = []
  for (const item of resolved) {
    if (item.status !== 'fulfilled') {
      logger.error({ err: item.reason }, 'tournament mongodb connection resolve error')
      continue
    }
    const { tournamentId, connection } = item.value
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
