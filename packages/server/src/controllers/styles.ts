import type { RequestHandler } from 'express'
import { StyleModel } from '../models/style.js'
import { TournamentModel } from '../models/tournament.js'
import { isDuplicateKeyError } from '../services/mongo-error.service.js'
import { badRequest, notFound } from './shared/http-errors.js'

function parseStyleId(raw: unknown): number | null {
  const parsed = Number(raw)
  if (!Number.isInteger(parsed)) return null
  return parsed
}

export const listStyles: RequestHandler = async (_req, res, next) => {
  try {
    const styles = await StyleModel.find().sort({ id: 1 }).lean().exec()
    res.json({ data: styles, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createStyle: RequestHandler = async (req, res, next) => {
  try {
    const created = await StyleModel.create(req.body)
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err: any) {
    if (err?.code === 11000) {
      res.status(409).json({ data: null, errors: [{ name: 'Conflict', message: 'Style id already exists' }] })
      return
    }
    next(err)
  }
}

export const updateStyle: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const styleId = parseStyleId(id)
    if (styleId === null) {
      badRequest(res, 'Invalid style id')
      return
    }
    const update = req.body as Record<string, unknown>
    const nextStyleId = update.id === undefined ? styleId : Number(update.id)
    if (nextStyleId !== styleId) {
      const referenced = await TournamentModel.exists({ style: styleId }).exec()
      if (referenced) {
        res.status(409).json({
          data: null,
          errors: [{ name: 'Conflict', message: 'Style is used by a tournament' }],
        })
        return
      }
    }
    const updated = await StyleModel.findOneAndUpdate(
      { id: styleId },
      { $set: update },
      { new: true, runValidators: true }
    )
      .lean()
      .exec()
    if (!updated) {
      notFound(res, 'Style not found')
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      res.status(409).json({ data: null, errors: [{ name: 'Conflict', message: 'Style id already exists' }] })
      return
    }
    next(err)
  }
}

export const deleteStyle: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const styleId = parseStyleId(id)
    if (styleId === null) {
      badRequest(res, 'Invalid style id')
      return
    }
    const referenced = await TournamentModel.exists({ style: styleId }).exec()
    if (referenced) {
      res.status(409).json({
        data: null,
        errors: [{ name: 'Conflict', message: 'Style is used by a tournament' }],
      })
      return
    }
    const deleted = await StyleModel.findOneAndDelete({ id: styleId }).lean().exec()
    if (!deleted) {
      notFound(res, 'Style not found')
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
