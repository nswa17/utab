import type { RequestHandler } from 'express'
import { StyleModel } from '../models/style.js'

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
    const update = req.body as Record<string, unknown>
    const updated = await StyleModel.findOneAndUpdate({ id: Number(id) }, { $set: update }, { new: true })
      .lean()
      .exec()
    if (!updated) {
      res.status(404).json({ data: null, errors: [{ name: 'NotFound', message: 'Style not found' }] })
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteStyle: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const deleted = await StyleModel.findOneAndDelete({ id: Number(id) }).lean().exec()
    if (!deleted) {
      res.status(404).json({ data: null, errors: [{ name: 'NotFound', message: 'Style not found' }] })
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
