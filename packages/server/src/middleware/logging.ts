import fs from 'node:fs'
import path from 'node:path'
import pino, { type StreamEntry } from 'pino'
import pinoHttp from 'pino-http'
import { env, isProd } from '../config/environment.js'

const logLevel = env.UTAB_LOG_LEVEL ?? (isProd ? 'info' : 'debug')
const logOptions = { level: logLevel, base: undefined, timestamp: pino.stdTimeFunctions.isoTime }
const logFile = env.UTAB_LOG_FILE

const logger = (() => {
  if (!logFile) {
    return pino(logOptions)
  }

  const logDir = path.dirname(logFile)
  if (logDir && logDir !== '.') {
    fs.mkdirSync(logDir, { recursive: true })
  }

  const streams: StreamEntry[] = [
    { stream: process.stdout },
    { stream: pino.destination({ dest: logFile, sync: false }) },
  ]

  return pino(logOptions, pino.multistream(streams))
})()
// pino-http ships a CommonJS default export; guard the access so TS/NodeNext agree
const createHttpLogger: typeof import('pino-http').default =
  typeof pinoHttp === 'function'
    ? (pinoHttp as unknown as typeof import('pino-http').default)
    : (pinoHttp as { default: typeof import('pino-http').default }).default

export const httpLogger = createHttpLogger({ logger })
export { logger }
