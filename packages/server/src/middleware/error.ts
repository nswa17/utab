import type { ErrorRequestHandler, RequestHandler } from 'express'
import { logger } from './logging.js'

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ data: null, errors: [{ name: 'NotFound', message: 'Route not found' }] })
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error({ err }, 'unhandled error')
  const status =
    typeof (err as { status?: unknown }).status === 'number' &&
    (err as { status: number }).status >= 400 &&
    (err as { status: number }).status < 600
      ? (err as { status: number }).status
      : 500
  res.status(status).json({
    data: null,
    errors: [
      { name: err.name || 'InternalServerError', message: err.message || 'Unexpected error' },
    ],
  })
}
