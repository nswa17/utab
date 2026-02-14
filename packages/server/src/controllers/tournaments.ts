import { Types } from 'mongoose'
import type { RequestHandler } from 'express'
import { TournamentModel } from '../models/tournament.js'
import { UserModel } from '../models/user.js'
import { dropTournamentDatabase } from '../services/tournament-db.service.js'
import { verifyPassword } from '../services/hash.service.js'
import { getTournamentAccessConfig } from '../services/tournament-access.service.js'

export const listTournaments: RequestHandler = async (_req, res, next) => {
  try {
    const tournaments = await TournamentModel.find().lean().exec()
    res.json({ data: tournaments, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const getTournament: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    if (!Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    const tournament = await TournamentModel.findById(id).lean().exec()
    if (!tournament) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
      return
    }
    res.json({ data: tournament, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createTournament: RequestHandler = async (req, res, next) => {
  try {
    const {
      name,
      style,
      options,
      total_round_num,
      current_round_num,
      preev_weights,
      auth,
      user_defined_data,
    } = req.body as {
      name: string
      style: number
      options?: unknown
      total_round_num?: number
      current_round_num?: number
      preev_weights?: number[]
      auth?: unknown
      user_defined_data?: unknown
    }
    const created = await TournamentModel.create({
      name,
      style,
      options,
      total_round_num,
      current_round_num,
      preev_weights,
      auth,
      user_defined_data,
      createdBy: req.session?.userId,
    })
    if (req.session?.userId) {
      const tournamentId = created._id.toString()
      await UserModel.updateOne({ _id: req.session.userId }, { $addToSet: { tournaments: tournamentId } }).exec()
      const current = req.session.tournaments ?? []
      if (!current.includes(tournamentId)) {
        req.session.tournaments = [...current, tournamentId]
      }
    }
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const updateTournament: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    if (!Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    const update = req.body as Record<string, unknown>
    const updated = await TournamentModel.findOneAndUpdate({ _id: id }, { $set: update }, { new: true })
      .lean()
      .exec()
    if (!updated) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteTournament: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    if (!Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    const deleted = await TournamentModel.findOneAndDelete({ _id: id }).lean().exec()
    if (!deleted) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
      return
    }
    const deletedId = String(deleted._id)
    await UserModel.updateMany({}, { $pull: { tournaments: deletedId } }).exec()
    if (req.session?.tournaments) {
      req.session.tournaments = req.session.tournaments.filter((t) => String(t) !== deletedId)
    }
    await dropTournamentDatabase(deletedId)
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const accessTournament: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { action, password } = req.body as {
      action?: 'enter' | 'skip'
      password?: string
    }

    if (!Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const tournament = await TournamentModel.findById(id).lean().exec()
    if (!tournament) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
      return
    }

    const access = getTournamentAccessConfig((tournament as any).auth)
    const sessionAccess = req.session.tournamentAccess ?? {}

    if (!access.required || action === 'skip') {
      req.session.tournamentAccess = {
        ...sessionAccess,
        [id]: {
          grantedAt: Date.now(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          version: access.version,
        },
      }
      res.json({ data: { tournamentId: id, granted: true, required: access.required }, errors: [] })
      return
    }

    if (!password || password.length === 0) {
      res.status(401).json({
        data: null,
        errors: [{ name: 'Unauthorized', message: 'Tournament access password is required' }],
      })
      return
    }

    let valid = false
    if (access.passwordHash) {
      valid = await verifyPassword(password, access.passwordHash)
    } else if (access.password) {
      valid = access.password === password
    }

    if (!valid) {
      res
        .status(401)
        .json({ data: null, errors: [{ name: 'Unauthorized', message: 'Invalid tournament password' }] })
      return
    }

    req.session.tournamentAccess = {
      ...sessionAccess,
      [id]: {
        grantedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        version: access.version,
      },
    }

    res.json({ data: { tournamentId: id, granted: true, required: access.required }, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const exitTournamentAccess: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    if (!Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const current = req.session.tournamentAccess ?? {}
    const nextAccess = { ...current }
    delete nextAccess[id]
    req.session.tournamentAccess = nextAccess

    res.json({ data: { tournamentId: id, success: true }, errors: [] })
  } catch (err) {
    next(err)
  }
}
