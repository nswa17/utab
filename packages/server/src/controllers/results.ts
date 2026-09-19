import type { RequestHandler } from 'express'
import type { Connection } from 'mongoose'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { getResultModel } from '../models/result.js'
import { getRoundModel } from '../models/round.js'
import { sanitizeResultForPublic } from '../services/response-sanitizer.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import {
  acquireRoundWriteLease,
  acquireRoundWriteLeases,
  releaseRoundWriteLease,
  releaseRoundWriteLeases,
  type RoundWriteLease,
} from '../services/round-write-guard.service.js'
import { notFound } from './shared/http-errors.js'
import { ensureObjectId, ensureTournamentId } from './shared/request-validators.js'

export const listResults: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!ensureTournamentId(res, tournamentId)) return
    const connection = await getTournamentConnection(tournamentId)
    const ResultModel = getResultModel(connection)
    const results = await ResultModel.find({ tournamentId }).lean().exec()
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    res.json({ data: isAdmin ? results : results.map((result) => sanitizeResultForPublic(result)), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const getResult: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureObjectId(res, id, 'Invalid result id')) return
    const connection = await getTournamentConnection(tournamentId)
    const ResultModel = getResultModel(connection)
    const result = await ResultModel.findOne({ _id: id, tournamentId }).lean().exec()
    if (!result) {
      notFound(res, 'Result not found')
      return
    }
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    res.json({ data: isAdmin ? result : sanitizeResultForPublic(result), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createResult: RequestHandler = async (req, res, next) => {
  let roundWriteLease: RoundWriteLease | null = null
  let leaseConnection: Connection | null = null
  try {
    const { tournamentId, round, payload } = req.body as {
      tournamentId: string
      round: number
      payload: unknown
    }

    if (!ensureTournamentId(res, tournamentId)) return

    const connection = await getTournamentConnection(tournamentId)
    const ResultModel = getResultModel(connection)
    const roundDoc = await getRoundModel(connection)
      .findOne({ tournamentId, round })
      .select({ _id: 1 })
      .lean()
      .exec()
    if (!roundDoc) {
      notFound(res, 'Round not found')
      return
    }

    roundWriteLease = await acquireRoundWriteLease(
      connection,
      tournamentId,
      round,
      String((roundDoc as any)._id)
    )
    if (!roundWriteLease) {
      res.status(409).json({
        data: null,
        errors: [{ name: 'Conflict', message: 'Round changed concurrently; retry result save' }],
      })
      return
    }
    leaseConnection = connection

    const created = await ResultModel.create({
      tournamentId,
      round,
      payload,
      createdBy: req.session.userId,
    })
    if (roundWriteLease && leaseConnection) {
      await releaseRoundWriteLease(leaseConnection, roundWriteLease)
      roundWriteLease = null
    }
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err) {
    next(err)
  } finally {
    if (roundWriteLease && leaseConnection) {
      try {
        await releaseRoundWriteLease(leaseConnection, roundWriteLease)
      } catch {
        // Stale write counters self-heal before structural round mutation.
      }
    }
  }
}

export const updateResult: RequestHandler = async (req, res, next) => {
  let roundWriteLeases: RoundWriteLease[] = []
  let leaseConnection: Connection | null = null
  try {
    const { id } = req.params
    const { tournamentId, round, payload } = req.body as {
      tournamentId: string
      round?: number
      payload?: unknown
    }

    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureObjectId(res, id, 'Invalid result id')) return

    const connection = await getTournamentConnection(tournamentId)
    const ResultModel = getResultModel(connection)
    const existing = await ResultModel.findOne({ _id: id, tournamentId }).lean().exec()
    if (!existing) {
      notFound(res, 'Result not found')
      return
    }

    const currentRound = Number((existing as any).round)
    const nextRound = round === undefined ? currentRound : Number(round)
    const targetRoundDoc = await getRoundModel(connection)
      .findOne({ tournamentId, round: nextRound })
      .select({ _id: 1 })
      .lean()
      .exec()
    if (!targetRoundDoc) {
      notFound(res, 'Round not found')
      return
    }

    const acquired = await acquireRoundWriteLeases(connection, tournamentId, [
      { round: currentRound },
      { round: nextRound, expectedRoundId: String((targetRoundDoc as any)._id) },
    ])
    if (!acquired) {
      res.status(409).json({
        data: null,
        errors: [{ name: 'Conflict', message: 'Round changed concurrently; retry result update' }],
      })
      return
    }
    roundWriteLeases = acquired
    leaseConnection = connection

    const update: Record<string, unknown> = {}
    if (round !== undefined) update.round = nextRound
    if (payload !== undefined) update.payload = payload
    const expectedVersion = Number((existing as any).__v ?? 0)
    const updated = await ResultModel.findOneAndUpdate(
      {
        _id: id,
        tournamentId,
        round: currentRound,
        __v: expectedVersion,
      },
      { $set: update, $inc: { __v: 1 } },
      { new: true }
    )
      .lean()
      .exec()

    if (!updated) {
      res.status(409).json({
        data: null,
        errors: [{ name: 'Conflict', message: 'Result changed concurrently; retry update' }],
      })
      return
    }

    await releaseRoundWriteLeases(connection, roundWriteLeases)
    roundWriteLeases = []
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  } finally {
    if (roundWriteLeases.length > 0 && leaseConnection) {
      try {
        await releaseRoundWriteLeases(leaseConnection, roundWriteLeases)
      } catch {
        // Stale write counters self-heal before structural round mutation.
      }
    }
  }
}

export const deleteResult: RequestHandler = async (req, res, next) => {
  let roundWriteLease: RoundWriteLease | null = null
  let leaseConnection: Connection | null = null
  try {
    const { id } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!ensureTournamentId(res, tournamentId)) return
    if (!ensureObjectId(res, id, 'Invalid result id')) return

    const connection = await getTournamentConnection(tournamentId)
    const ResultModel = getResultModel(connection)
    const existing = await ResultModel.findOne({ _id: id, tournamentId }).lean().exec()
    if (!existing) {
      notFound(res, 'Result not found')
      return
    }

    const existingRound = Number((existing as any).round)
    const roundDoc = await getRoundModel(connection)
      .findOne({ tournamentId, round: existingRound })
      .select({ _id: 1 })
      .lean()
      .exec()
    if (roundDoc) {
      roundWriteLease = await acquireRoundWriteLease(
        connection,
        tournamentId,
        existingRound,
        String((roundDoc as any)._id)
      )
      if (!roundWriteLease) {
        res.status(409).json({
          data: null,
          errors: [{ name: 'Conflict', message: 'Round changed concurrently; retry result deletion' }],
        })
        return
      }
      leaseConnection = connection
    }

    const rawVersion = (existing as any).__v
    const deleted = await ResultModel.findOneAndDelete({
      _id: id,
      tournamentId,
      round: existingRound,
      ...(Number.isInteger(rawVersion)
        ? { __v: Number(rawVersion) }
        : { __v: { $exists: false } }),
    })
      .lean()
      .exec()
    if (!deleted) {
      res.status(409).json({
        data: null,
        errors: [{ name: 'Conflict', message: 'Result changed concurrently; retry deletion' }],
      })
      return
    }

    if (roundWriteLease && leaseConnection) {
      await releaseRoundWriteLease(leaseConnection, roundWriteLease)
      roundWriteLease = null
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  } finally {
    if (roundWriteLease && leaseConnection) {
      try {
        await releaseRoundWriteLease(leaseConnection, roundWriteLease)
      } catch {
        // Stale write counters self-heal before structural round mutation.
      }
    }
  }
}
