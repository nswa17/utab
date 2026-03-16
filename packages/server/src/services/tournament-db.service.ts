import mongoose from 'mongoose'
import { env } from '../config/environment.js'
import { logger } from '../middleware/logging.js'
import { getAdjudicatorModel } from '../models/adjudicator.js'
import { getCompiledModel } from '../models/compiled.js'
import { getDrawModel } from '../models/draw.js'
import { getInstitutionModel } from '../models/institution.js'
import { getRawAdjudicatorResultModel } from '../models/raw-adjudicator-result.js'
import { getRawSpeakerResultModel } from '../models/raw-speaker-result.js'
import { getRawTeamResultModel } from '../models/raw-team-result.js'
import { getResultModel } from '../models/result.js'
import { getRoundModel } from '../models/round.js'
import { getSpeakerModel } from '../models/speaker.js'
import { getSubmissionModel } from '../models/submission.js'
import { getTeamModel } from '../models/team.js'
import { getVenueModel } from '../models/venue.js'

const connections = new Map<string, Promise<mongoose.Connection>>()

async function ensureTournamentIndexes(connection: mongoose.Connection): Promise<void> {
  await Promise.all([
    getTeamModel(connection).createIndexes(),
    getSpeakerModel(connection).createIndexes(),
    getAdjudicatorModel(connection).createIndexes(),
    getVenueModel(connection).createIndexes(),
    getInstitutionModel(connection).createIndexes(),
    getRoundModel(connection).createIndexes(),
    getDrawModel(connection).createIndexes(),
    getSubmissionModel(connection).createIndexes(),
    getRawTeamResultModel(connection).createIndexes(),
    getRawSpeakerResultModel(connection).createIndexes(),
    getRawAdjudicatorResultModel(connection).createIndexes(),
    getCompiledModel(connection).createIndexes(),
    getResultModel(connection).createIndexes(),
  ])
}

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
    .then(async () => {
      await ensureTournamentIndexes(connection)
      return connection
    })
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
