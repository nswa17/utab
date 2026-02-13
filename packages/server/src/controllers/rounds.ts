import { Types } from 'mongoose'
import type { RequestHandler } from 'express'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { getRoundModel } from '../models/round.js'
import { getTeamModel } from '../models/team.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import { isDuplicateKeyError } from '../services/mongo-error.service.js'
import { sanitizeRoundForPublic } from '../services/response-sanitizer.js'
import { buildCompiledPayload } from './compiled.js'

type BreakCutoffTiePolicy = 'manual' | 'include_all' | 'strict'
type BreakSeeding = 'high_low'
type BreakParticipant = { teamId: string; seed: number }
type BreakConfig = {
  enabled: boolean
  source_rounds: number[]
  size: number
  cutoff_tie_policy: BreakCutoffTiePolicy
  seeding: BreakSeeding
  participants: BreakParticipant[]
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeBreakSourceRounds(roundNumber: number, sourceRounds: unknown): number[] {
  if (!Array.isArray(sourceRounds)) return []
  return Array.from(
    new Set(
      sourceRounds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1 && value < roundNumber)
    )
  ).sort((left, right) => left - right)
}

function normalizeBreakParticipants(participants: unknown): BreakParticipant[] {
  if (!Array.isArray(participants)) return []
  return participants
    .map((item) => ({
      teamId: String((item as any)?.teamId ?? '').trim(),
      seed: Number((item as any)?.seed),
    }))
    .filter((item) => item.teamId.length > 0 && Number.isInteger(item.seed) && item.seed >= 1)
    .sort((left, right) => left.seed - right.seed)
}

function normalizeBreakConfig(roundNumber: number, input: unknown): BreakConfig {
  const source = asRecord(input)
  const enabled = source.enabled === true
  const sizeRaw = Number(source.size)
  const size = Number.isInteger(sizeRaw) && sizeRaw >= 1 ? sizeRaw : 8
  const cutoff_tie_policy: BreakCutoffTiePolicy =
    source.cutoff_tie_policy === 'include_all' || source.cutoff_tie_policy === 'strict'
      ? (source.cutoff_tie_policy as BreakCutoffTiePolicy)
      : 'manual'
  const seeding: BreakSeeding = 'high_low'
  return {
    enabled,
    source_rounds: normalizeBreakSourceRounds(roundNumber, source.source_rounds),
    size,
    cutoff_tie_policy,
    seeding,
    participants: normalizeBreakParticipants(source.participants),
  }
}

function upsertTeamAvailabilityDetail(details: unknown, roundNumber: number, available: boolean) {
  const list = Array.isArray(details) ? details.map((detail) => ({ ...(detail as Record<string, unknown>) })) : []
  const index = list.findIndex((detail) => Number((detail as any)?.r) === roundNumber)
  const payload = {
    r: roundNumber,
    available,
    institutions: Array.isArray((list[index] as any)?.institutions) ? (list[index] as any).institutions : [],
    speakers: Array.isArray((list[index] as any)?.speakers) ? (list[index] as any).speakers : [],
  }
  if (index >= 0) {
    list[index] = payload
  } else {
    list.push(payload)
  }
  return list.sort((left, right) => Number((left as any)?.r ?? 0) - Number((right as any)?.r ?? 0))
}

export const listRounds: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, public: publicParam } = req.query as {
      tournamentId?: string
      public?: string
    }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const rounds = await RoundModel.find({ tournamentId }).sort({ round: 1 }).lean().exec()
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    const forcePublic =
      publicParam === '1' || publicParam === 'true' || publicParam === 'yes' || publicParam === 'public'
    const data = isAdmin && !forcePublic ? rounds : rounds.map((round) => sanitizeRoundForPublic(round))
    res.json({ data, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const getRound: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId, public: publicParam } = req.query as {
      tournamentId?: string
      public?: string
    }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    if (!Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid round id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const round = await RoundModel.findById(id).lean().exec()
    if (!round) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Round not found' }] })
      return
    }
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    const forcePublic =
      publicParam === '1' || publicParam === 'true' || publicParam === 'yes' || publicParam === 'public'
    res.json({ data: isAdmin && !forcePublic ? round : sanitizeRoundForPublic(round), errors: [] })
  } catch (err) {
    next(err)
  }
}

export const createRound: RequestHandler = async (req, res, next) => {
  try {
    if (Array.isArray(req.body)) {
      const payload = req.body as Array<{
        tournamentId: string
        round: number
        name?: string
        motions?: string[]
        motionOpened?: boolean
        teamAllocationOpened?: boolean
        adjudicatorAllocationOpened?: boolean
        weightsOfAdjudicators?: { chair: number; panel: number; trainee: number }
        userDefinedData?: unknown
      }>
      if (payload.length === 0) {
        res
          .status(400)
          .json({ data: null, errors: [{ name: 'BadRequest', message: 'Empty payload' }] })
        return
      }
      const tournamentId = payload[0].tournamentId
      if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
        res
          .status(400)
          .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
        return
      }
      if (!payload.every((item) => item.tournamentId === tournamentId)) {
        res.status(400).json({
          data: null,
          errors: [{ name: 'BadRequest', message: 'Mixed tournament ids are not supported' }],
        })
        return
      }
      const connection = await getTournamentConnection(tournamentId)
      const RoundModel = getRoundModel(connection)
      const created = await RoundModel.insertMany(payload, { ordered: false })
      res.status(201).json({ data: created, errors: [] })
      return
    }

    const {
      tournamentId,
      round,
      name,
      motions,
      motionOpened,
      teamAllocationOpened,
      adjudicatorAllocationOpened,
      weightsOfAdjudicators,
      userDefinedData,
    } = req.body as {
      tournamentId: string
      round: number
      name?: string
      motions?: string[]
      motionOpened?: boolean
      teamAllocationOpened?: boolean
      adjudicatorAllocationOpened?: boolean
      weightsOfAdjudicators?: { chair: number; panel: number; trainee: number }
      userDefinedData?: unknown
    }

    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const created = await RoundModel.create({
      tournamentId,
      round,
      name,
      motions,
      motionOpened,
      teamAllocationOpened,
      adjudicatorAllocationOpened,
      weightsOfAdjudicators,
      userDefinedData,
    })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      res
        .status(409)
        .json({ data: null, errors: [{ name: 'Conflict', message: 'Round already exists' }] })
      return
    }
    next(err)
  }
}

export const bulkUpdateRounds: RequestHandler = async (req, res, next) => {
  try {
    if (!Array.isArray(req.body) || req.body.length === 0) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Empty payload' }] })
      return
    }
    const payload = req.body as Array<{
      id: string
      tournamentId: string
      round?: number
      name?: string
      motions?: string[]
      motionOpened?: boolean
      teamAllocationOpened?: boolean
      adjudicatorAllocationOpened?: boolean
      weightsOfAdjudicators?: { chair: number; panel: number; trainee: number }
      userDefinedData?: unknown
    }>
    const tournamentId = payload[0].tournamentId
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    if (!payload.every((item) => item.tournamentId === tournamentId)) {
      res.status(400).json({
        data: null,
        errors: [{ name: 'BadRequest', message: 'Mixed tournament ids are not supported' }],
      })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const ops = payload.map((item) => {
      const update: Record<string, unknown> = {}
      if (item.round !== undefined) update.round = item.round
      if (item.name !== undefined) update.name = item.name
      if (item.motions !== undefined) update.motions = item.motions
      if (item.motionOpened !== undefined) update.motionOpened = item.motionOpened
      if (item.teamAllocationOpened !== undefined) update.teamAllocationOpened = item.teamAllocationOpened
      if (item.adjudicatorAllocationOpened !== undefined)
        update.adjudicatorAllocationOpened = item.adjudicatorAllocationOpened
      if (item.weightsOfAdjudicators !== undefined) update.weightsOfAdjudicators = item.weightsOfAdjudicators
      if (item.userDefinedData !== undefined) update.userDefinedData = item.userDefinedData
      return {
        updateOne: {
          filter: { _id: item.id, tournamentId },
          update: { $set: update },
        },
      }
    })
    await RoundModel.bulkWrite(ops, { ordered: false })
    const ids = payload.map((item) => item.id)
    const updated = await RoundModel.find({ _id: { $in: ids }, tournamentId }).lean().exec()
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const bulkDeleteRounds: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, ids } = req.query as { tournamentId?: string; ids?: string }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    const idList =
      typeof ids === 'string' && ids.length > 0 ? ids.split(',').filter((id) => id.length > 0) : []
    const filter: Record<string, unknown> = { tournamentId }
    if (idList.length > 0) {
      filter._id = { $in: idList }
    }
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const result = await RoundModel.deleteMany(filter).exec()
    res.json({ data: { deletedCount: result.deletedCount }, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const updateRound: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const {
      tournamentId,
      round,
      name,
      motions,
      motionOpened,
      teamAllocationOpened,
      adjudicatorAllocationOpened,
      weightsOfAdjudicators,
      userDefinedData,
    } = req.body as {
      tournamentId: string
      round?: number
      name?: string
      motions?: string[]
      motionOpened?: boolean
      teamAllocationOpened?: boolean
      adjudicatorAllocationOpened?: boolean
      weightsOfAdjudicators?: { chair: number; panel: number; trainee: number }
      userDefinedData?: unknown
    }

    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    if (!Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid round id' }] })
      return
    }

    const update: Record<string, unknown> = {}
    if (round !== undefined) update.round = round
    if (name !== undefined) update.name = name
    if (motions !== undefined) update.motions = motions
    if (motionOpened !== undefined) update.motionOpened = motionOpened
    if (teamAllocationOpened !== undefined) update.teamAllocationOpened = teamAllocationOpened
    if (adjudicatorAllocationOpened !== undefined)
      update.adjudicatorAllocationOpened = adjudicatorAllocationOpened
    if (weightsOfAdjudicators !== undefined) update.weightsOfAdjudicators = weightsOfAdjudicators
    if (userDefinedData !== undefined) update.userDefinedData = userDefinedData

    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const updated = await RoundModel.findOneAndUpdate({ _id: id, tournamentId }, { $set: update }, { new: true })
      .lean()
      .exec()
    if (!updated) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Round not found' }] })
      return
    }
    res.json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const previewBreakCandidates: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId, source = 'submissions', sourceRounds, size } = req.body as {
      tournamentId: string
      source?: 'submissions' | 'raw'
      sourceRounds?: number[]
      size?: number
    }
    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    if (!Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid round id' }] })
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const roundDoc = await RoundModel.findOne({ _id: id, tournamentId }).lean().exec()
    if (!roundDoc) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Round not found' }] })
      return
    }

    const roundNumber = Number((roundDoc as any).round)
    if (!Number.isInteger(roundNumber) || roundNumber < 2) {
      res.status(400).json({
        data: null,
        errors: [
          {
            name: 'BadRequest',
            message: 'Break candidates require a target round number of 2 or later',
          },
        ],
      })
      return
    }

    const normalizedSourceRounds = normalizeBreakSourceRounds(roundNumber, sourceRounds)
    const effectiveSourceRounds =
      normalizedSourceRounds.length > 0
        ? normalizedSourceRounds
        : Array.from({ length: roundNumber - 1 }, (_, index) => index + 1)
    const requestedSizeRaw = Number(size)
    const requestedSize = Number.isInteger(requestedSizeRaw) && requestedSizeRaw >= 1 ? requestedSizeRaw : null

    const { payload } = await buildCompiledPayload(
      tournamentId,
      source,
      effectiveSourceRounds
    )
    const TeamModel = getTeamModel(connection)
    const teams = await TeamModel.find({ tournamentId }).lean().exec()
    const teamsById = new Map<string, any>(teams.map((team) => [String(team._id), team]))

    const candidates = (Array.isArray(payload.compiled_team_results) ? payload.compiled_team_results : [])
      .map((result: any) => {
        const teamId = String(result?.id ?? '')
        const team = teamsById.get(teamId)
        if (!team) return null
        const detail = Array.isArray(team.details)
          ? team.details.find((item: any) => Number(item?.r) === roundNumber)
          : null
        const rankingRaw = Number(result?.ranking)
        const ranking = Number.isFinite(rankingRaw) ? rankingRaw : null
        return {
          teamId,
          teamName: String(team.name ?? teamId),
          ranking,
          win: Number(result?.win ?? 0),
          sum: Number(result?.sum ?? 0),
          margin: Number(result?.margin ?? 0),
          available: detail?.available !== false,
          tieGroup: 0,
          isCutoffTie: false,
        }
      })
      .filter((item): item is {
        teamId: string
        teamName: string
        ranking: number | null
        win: number
        sum: number
        margin: number
        available: boolean
        tieGroup: number
        isCutoffTie: boolean
      } => item !== null)
      .sort((left, right) => {
        if (left.ranking !== null && right.ranking !== null && left.ranking !== right.ranking) {
          return left.ranking - right.ranking
        }
        if (left.win !== right.win) return right.win - left.win
        if (left.sum !== right.sum) return right.sum - left.sum
        if (left.margin !== right.margin) return right.margin - left.margin
        return left.teamName.localeCompare(right.teamName)
      })

    let tieGroup = 0
    let lastRanking: number | null = null
    candidates.forEach((candidate, index) => {
      if (index === 0 || candidate.ranking !== lastRanking) tieGroup += 1
      candidate.tieGroup = tieGroup
      lastRanking = candidate.ranking
    })

    if (requestedSize !== null && requestedSize > 0 && candidates.length >= requestedSize) {
      const cutoff = candidates[requestedSize - 1]
      if (cutoff?.ranking !== null) {
        const betterCount = candidates.filter(
          (candidate) => candidate.ranking !== null && candidate.ranking < cutoff.ranking!
        ).length
        const atCutoff = candidates.filter((candidate) => candidate.ranking === cutoff.ranking).length
        const isTieOverflow = betterCount < requestedSize && betterCount + atCutoff > requestedSize
        if (isTieOverflow) {
          candidates.forEach((candidate) => {
            candidate.isCutoffTie = candidate.ranking === cutoff.ranking
          })
        }
      }
    }

    res.json({
      data: {
        roundId: id,
        round: roundNumber,
        source,
        sourceRounds: effectiveSourceRounds,
        size: requestedSize,
        candidates,
      },
      errors: [],
    })
  } catch (err: any) {
    if ((err as any)?.status === 404) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
      return
    }
    next(err)
  }
}

export const updateRoundBreak: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId, break: breakInput, syncTeamAvailability = true } = req.body as {
      tournamentId: string
      break: unknown
      syncTeamAvailability?: boolean
    }
    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    if (!Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid round id' }] })
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const TeamModel = getTeamModel(connection)
    const roundDoc = await RoundModel.findOne({ _id: id, tournamentId }).lean().exec()
    if (!roundDoc) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Round not found' }] })
      return
    }
    const roundNumber = Number((roundDoc as any).round)
    if (!Number.isInteger(roundNumber) || roundNumber < 1) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid round number' }] })
      return
    }

    const teams = await TeamModel.find({ tournamentId }).lean().exec()
    const teamIds = new Set(teams.map((team) => String(team._id)))
    const normalizedBreak = normalizeBreakConfig(roundNumber, breakInput)

    const seenTeamIds = new Set<string>()
    const seenSeeds = new Set<number>()
    for (const participant of normalizedBreak.participants) {
      if (!teamIds.has(participant.teamId)) {
        res.status(400).json({
          data: null,
          errors: [{ name: 'BadRequest', message: `Unknown team in break participants: ${participant.teamId}` }],
        })
        return
      }
      if (seenTeamIds.has(participant.teamId)) {
        res.status(400).json({
          data: null,
          errors: [{ name: 'BadRequest', message: `Duplicate team in break participants: ${participant.teamId}` }],
        })
        return
      }
      if (seenSeeds.has(participant.seed)) {
        res.status(400).json({
          data: null,
          errors: [{ name: 'BadRequest', message: `Duplicate seed in break participants: ${participant.seed}` }],
        })
        return
      }
      seenTeamIds.add(participant.teamId)
      seenSeeds.add(participant.seed)
    }

    const currentUserDefined = asRecord((roundDoc as any).userDefinedData)
    const nextUserDefined = {
      ...currentUserDefined,
      break: normalizedBreak,
    }

    const updatedRound = await RoundModel.findOneAndUpdate(
      { _id: id, tournamentId },
      { $set: { userDefinedData: nextUserDefined } },
      { new: true }
    )
      .lean()
      .exec()

    if (!updatedRound) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Round not found' }] })
      return
    }

    let updatedTeamCount = 0
    if (syncTeamAvailability) {
      const selectedTeamIds = normalizedBreak.enabled
        ? new Set(normalizedBreak.participants.map((participant) => participant.teamId))
        : new Set<string>(teams.map((team) => String(team._id)))
      const ops: any[] = teams.map((team) => {
        const teamId = String(team._id)
        const available = selectedTeamIds.has(teamId)
        return {
          updateOne: {
            filter: { _id: team._id, tournamentId },
            update: {
              $set: {
                details: upsertTeamAvailabilityDetail(team.details, roundNumber, available) as any,
              },
            },
          },
        }
      })
      if (ops.length > 0) {
        const result = await TeamModel.bulkWrite(ops, { ordered: false })
        updatedTeamCount = result.modifiedCount ?? 0
      }
    }

    res.json({
      data: {
        round: updatedRound,
        break: normalizedBreak,
        updatedTeamCount,
      },
      errors: [],
    })
  } catch (err) {
    next(err)
  }
}

export const deleteRound: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    if (!Types.ObjectId.isValid(id)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid round id' }] })
      return
    }
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const deleted = await RoundModel.findOneAndDelete({ _id: id, tournamentId }).lean().exec()
    if (!deleted) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Round not found' }] })
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
