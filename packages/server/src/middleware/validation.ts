import type { RequestHandler } from 'express'
import { ZodError, type ZodTypeAny } from 'zod'

interface RequestSchema {
  body?: ZodTypeAny
  query?: ZodTypeAny
  params?: ZodTypeAny
  headers?: ZodTypeAny
}

export function validateRequest(schema: RequestSchema): RequestHandler {
  return (req, res, next) => {
    try {
      if (schema.body) req.body = schema.body.parse(req.body)
      if (schema.query) req.query = schema.query.parse(req.query)
      if (schema.params) req.params = schema.params.parse(req.params)
      if (schema.headers) req.headers = schema.headers.parse(req.headers)
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          data: null,
          errors: error.issues.map((issue) => ({
            name: issue.code,
            message: issue.message,
            path: issue.path.join('.'),
          })),
        })
        return
      }
      next(error)
    }
  }
}
