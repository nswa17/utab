import { Types } from 'mongoose'
import type { Response } from 'express'

export function isValidObjectId(value: unknown): value is string {
  return typeof value === 'string' && Types.ObjectId.isValid(value)
}

export function badRequest(res: Response, message: string): void {
  res.status(400).json({ data: null, errors: [{ name: 'BadRequest', message }] })
}

export function notFound(res: Response, message: string): void {
  res.status(404).json({ data: null, errors: [{ name: 'NotFound', message }] })
}
