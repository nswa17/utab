import fs from 'node:fs'
import path from 'node:path'
import pino, { Logger } from 'pino'

const LOG_CATEGORIES = ['controllers', 'draws', 'results', 'checks', 'general'] as const
export type LogCategory = (typeof LOG_CATEGORIES)[number]

const logLevel = process.env.UTAB_LOG_LEVEL ?? 'info'
const logFile = process.env.UTAB_LOG_FILE

const destination = logFile ? pino.destination({ dest: logFile, sync: false }) : undefined
const rootLogger = pino(
  { level: logLevel, base: undefined, timestamp: pino.stdTimeFunctions.isoTime },
  destination
)

const categoryLoggers: Record<LogCategory, Logger> = LOG_CATEGORIES.reduce(
  (acc, category) => {
    acc[category] = rootLogger.child({ category })
    return acc
  },
  {} as Record<LogCategory, Logger>
)

export function getLogger(category: LogCategory = 'general'): Logger {
  return categoryLoggers[category]
}

export function sillyLogger(
  fn: Function,
  argsLike: IArguments | any[],
  part: LogCategory = 'general',
  filename = ''
): void {
  const logger = getLogger(part)
  const args = Array.from(argsLike as any[])
  const meta = {
    fn: fn?.name || 'anonymous',
    file: filename ? path.basename(filename) : undefined,
    args,
  }
  logger.debug(meta, 'function call')
}

export function ensureLogDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export default rootLogger
