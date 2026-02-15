import type { RequestHandler } from 'express'
import {
  teams as teamAllocations,
  adjudicators as adjudicatorAllocations,
  venues as venueAllocations,
  results as coreResults,
  filterAvailable,
} from '@utab/core'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { getDrawModel } from '../models/draw.js'
import { TournamentModel } from '../models/tournament.js'
import { StyleModel } from '../models/style.js'
import { getTeamModel } from '../models/team.js'
import { getAdjudicatorModel } from '../models/adjudicator.js'
import { getVenueModel } from '../models/venue.js'
import { getInstitutionModel } from '../models/institution.js'
import { getSpeakerModel } from '../models/speaker.js'
import { getRawTeamResultModel } from '../models/raw-team-result.js'
import { getRawSpeakerResultModel } from '../models/raw-speaker-result.js'
import { getRawAdjudicatorResultModel } from '../models/raw-adjudicator-result.js'
import { sanitizeDrawForPublic } from '../services/response-sanitizer.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import {
  buildDetailsForRounds,
  buildIdMaps,
  ensureRounds,
  extractDrawUserDefinedData,
  hasSufficientAdjudicators,
  normalizeInstitutionPriority,
  normalizeScoreWeights,
} from './shared/allocation-support.js'
import { isValidObjectId, badRequest, notFound } from './shared/http-errors.js'

const allocations = {
  teams: teamAllocations,
  adjudicators: adjudicatorAllocations,
  venues: venueAllocations,
}

export const listDraws: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, public: publicParam } = req.query as {
      tournamentId?: string
      round?: string | number
      public?: string
    }
    if (!tournamentId || !isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const DrawModel = getDrawModel(connection)

    const filter: Record<string, unknown> = { tournamentId }
    if (round !== undefined) {
      const parsed = Number(round)
      if (Number.isNaN(parsed)) {
        badRequest(res, 'Invalid round')
        return
      }
      filter.round = parsed
    }

    const draws = await DrawModel.find(filter).sort({ round: 1 }).lean().exec()
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)
    const forcePublic =
      publicParam === '1' || publicParam === 'true' || publicParam === 'yes' || publicParam === 'public'
    const data = isAdmin && !forcePublic ? draws : draws.map((draw) => sanitizeDrawForPublic(draw))
    res.json({ data, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const upsertDraw: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, allocation, userDefinedData, drawOpened, allocationOpened, locked } = req.body as {
      tournamentId: string
      round: number
      allocation: unknown[]
      userDefinedData?: Record<string, unknown>
      drawOpened?: boolean
      allocationOpened?: boolean
      locked?: boolean
    }

    if (!isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const DrawModel = getDrawModel(connection)

    const updated = await DrawModel.findOneAndUpdate(
      { tournamentId, round },
      {
        $set: {
          allocation,
          ...(userDefinedData !== undefined ? { userDefinedData } : {}),
          drawOpened: drawOpened ?? false,
          allocationOpened: allocationOpened ?? false,
          locked: locked ?? false,
        },
        $setOnInsert: { createdBy: req.session?.userId },
      },
      { new: true, upsert: true }
    )
      .lean()
      .exec()

    res.status(201).json({ data: updated, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const generateDraw: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, options, save = true } = req.body as {
      tournamentId: string
      round: number
      options?: Record<string, any>
      save?: boolean
    }

    if (!isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const [tournament, teams, adjudicators, venues, institutions, speakers, rawTeamResults, rawSpeakerResults, rawAdjudicatorResults] =
      await Promise.all([
        TournamentModel.findById(tournamentId).lean().exec(),
        getTeamModel(connection).find({ tournamentId }).lean().exec(),
        getAdjudicatorModel(connection).find({ tournamentId }).lean().exec(),
        getVenueModel(connection).find({ tournamentId }).lean().exec(),
        getInstitutionModel(connection).find({ tournamentId }).lean().exec(),
        getSpeakerModel(connection).find({ tournamentId }).lean().exec(),
        getRawTeamResultModel(connection).find({ tournamentId }).lean().exec(),
        getRawSpeakerResultModel(connection).find({ tournamentId }).lean().exec(),
        getRawAdjudicatorResultModel(connection).find({ tournamentId }).lean().exec(),
      ])

    if (!tournament) {
      notFound(res, 'Tournament not found')
      return
    }

    const styleOption = (tournament.options as any)?.style
    const styleDoc =
      typeof tournament.style === 'number' ? await StyleModel.findOne({ id: tournament.style }).lean().exec() : null
    const scoreWeights = normalizeScoreWeights(styleOption?.score_weights ?? styleDoc?.score_weights)
    const teamNum = styleOption?.team_num ?? styleDoc?.team_num ?? 2
    const style = { team_num: teamNum, score_weights: scoreWeights }
    const config = {
      name: tournament.name,
      style,
      preev_weights:
        (tournament as any).preev_weights ?? (tournament.options as any)?.preev_weights ?? [0, 0, 0, 0, 0, 0],
      institution_priority_map: {} as Record<number, number>,
    }

    const teamMaps = buildIdMaps(teams)
    const adjudicatorMaps = buildIdMaps(adjudicators)
    const venueMaps = buildIdMaps(venues)
    const institutionMaps = buildIdMaps(institutions)
    const speakerMaps = buildIdMaps(speakers)

    const roundsForCompile = ensureRounds(round)
    const roundsNeeded = Array.from(new Set([...roundsForCompile, round])).sort((a, b) => a - b)

    const teamInstances = teams.map((team) => ({
      id: teamMaps.map.get(String(team._id))!,
      name: team.name,
      details: buildDetailsForRounds(
        (team as any).details,
        roundsNeeded,
        { available: true, institutions: [], speakers: [] },
        (id) => institutionMaps.map.get(id),
        (id) => speakerMaps.map.get(id)
      ),
    }))

    const adjudicatorInstances = adjudicators.map((adj) => ({
      id: adjudicatorMaps.map.get(String(adj._id))!,
      name: adj.name,
      preev: (adj as any).preev ?? (adj as any).strength ?? 0,
      details: buildDetailsForRounds(
        (adj as any).details,
        roundsNeeded,
        { available: true, institutions: [], conflicts: [] },
        (id) => institutionMaps.map.get(id),
        undefined,
        (id) => teamMaps.map.get(id)
      ),
    }))

    const venueInstances = venues.map((venue) => ({
      id: venueMaps.map.get(String(venue._id))!,
      name: venue.name,
      details: buildDetailsForRounds(
        (venue as any).details,
        roundsNeeded,
        { available: true, priority: 1 }
      ),
    }))

    const speakerInstances = speakers.map((speaker) => ({
      id: speakerMaps.map.get(String(speaker._id))!,
      name: speaker.name,
    }))

    const institutionInstances = institutions.map((inst) => ({
      id: institutionMaps.map.get(String(inst._id))!,
      name: inst.name,
      category:
        typeof (inst as any).category === 'string' && String((inst as any).category).trim().length > 0
          ? String((inst as any).category).trim()
          : 'institution',
      priority: normalizeInstitutionPriority((inst as any).priority),
    }))
    config.institution_priority_map = Object.fromEntries(
      institutionInstances.map((inst) => [inst.id, inst.priority])
    )

    const mapFromId = (id: string) =>
      adjudicatorMaps.map.get(id) ??
      speakerMaps.map.get(id) ??
      teamMaps.map.get(id) ??
      0

    const mappedRawTeamResults = rawTeamResults
      .map((r: any) => ({
        ...r,
        id: teamMaps.map.get(String(r.id)),
        from_id: mapFromId(String(r.from_id)),
        opponents: (r.opponents || [])
          .map((oid: string) => teamMaps.map.get(String(oid)))
          .filter((v: number | undefined): v is number => v !== undefined),
      }))
      .filter((r: any) => r.id !== undefined)

    const mappedRawSpeakerResults = rawSpeakerResults
      .map((r: any) => ({
        ...r,
        id: speakerMaps.map.get(String(r.id)),
        from_id: mapFromId(String(r.from_id)),
      }))
      .filter((r: any) => r.id !== undefined)

    const mappedRawAdjudicatorResults = rawAdjudicatorResults
      .map((r: any) => ({
        ...r,
        id: adjudicatorMaps.map.get(String(r.id)),
        from_id: mapFromId(String(r.from_id)),
        judged_teams: (r.judged_teams || [])
          .map((oid: string) => teamMaps.map.get(String(oid)))
          .filter((v: number | undefined): v is number => v !== undefined),
      }))
      .filter((r: any) => r.id !== undefined)

    const compiledTeamResults =
      mappedRawSpeakerResults.length > 0 && speakerInstances.length > 0
        ? coreResults.compileTeamResults(
            teamInstances,
            speakerInstances,
            mappedRawTeamResults,
            mappedRawSpeakerResults,
            roundsForCompile,
            style
          )
        : coreResults.compileTeamResults(teamInstances, mappedRawTeamResults, roundsForCompile, style)

    const compiledAdjudicatorResults = coreResults.compileAdjudicatorResults(
      adjudicatorInstances,
      mappedRawAdjudicatorResults,
      roundsForCompile
    )

    const teamAlgorithm = options?.team_allocation_algorithm ?? 'standard'
    const teamAlgorithmOptions = options?.team_allocation_algorithm_options ?? {}
    let draw =
      teamAlgorithm === 'strict'
        ? allocations.teams.strict.get(
            round,
            teamInstances,
            compiledTeamResults,
            config,
            teamAlgorithmOptions
          )
        : teamAlgorithm === 'powerpair'
          ? allocations.teams.powerpair.get(
              round,
              teamInstances,
              compiledTeamResults,
              teamAlgorithmOptions,
              config
            )
          : allocations.teams.standard.get(
              round,
              teamInstances,
              compiledTeamResults,
              teamAlgorithmOptions,
              config
            )
    const teamUserDefinedData = extractDrawUserDefinedData(draw)

    const numbersOfAdjudicators = options?.numbers_of_adjudicators ?? { chairs: 1, panels: 2, trainees: 0 }
    const adjudicatorAlgorithm = options?.adjudicator_allocation_algorithm ?? 'standard'
    const adjudicatorOptions = options?.adjudicator_allocation_algorithm_options ?? {}

    let adjudicatorDraw = draw
    const allocationSquares = draw.allocation?.length ?? 0
    const availableAdjudicators = filterAvailable(adjudicatorInstances, round)
    if (
      adjudicators.length > 0 &&
      hasSufficientAdjudicators(availableAdjudicators.length, allocationSquares, numbersOfAdjudicators)
    ) {
      adjudicatorDraw =
        adjudicatorAlgorithm === 'traditional'
          ? allocations.adjudicators.traditional.get(
              round,
              draw,
              adjudicatorInstances,
              teamInstances,
              compiledTeamResults,
              compiledAdjudicatorResults,
              numbersOfAdjudicators,
              config,
              adjudicatorOptions
            )
          : allocations.adjudicators.standard.get(
              round,
              draw,
              adjudicatorInstances,
              teamInstances,
              compiledTeamResults,
              compiledAdjudicatorResults,
              numbersOfAdjudicators,
              config,
              adjudicatorOptions
            )
    }

    const venueOptions = options?.venue_allocation_algorithm_options ?? {}
    let venueDraw = adjudicatorDraw
    if (venues.length > 0) {
      venueDraw = allocations.venues.standard.get(
        round,
        adjudicatorDraw,
        venueInstances,
        compiledTeamResults,
        config,
        venueOptions.shuffle
      )
    }

    const mappedAllocation = (venueDraw.allocation || []).map((square: any) => {
      const teams = Array.isArray(square.teams)
        ? square.teams.map((id: number) => teamMaps.reverse.get(id) ?? String(id))
        : square.teams
      const mappedTeams =
        Array.isArray(teams) && teams.length === 2
          ? { gov: teams[0], opp: teams[1] }
          : teams

      return {
        ...square,
        teams: mappedTeams,
        chairs: (square.chairs || []).map((id: number) => adjudicatorMaps.reverse.get(id) ?? String(id)),
        panels: (square.panels || []).map((id: number) => adjudicatorMaps.reverse.get(id) ?? String(id)),
        trainees: (square.trainees || []).map((id: number) => adjudicatorMaps.reverse.get(id) ?? String(id)),
        venue: square.venue ? venueMaps.reverse.get(square.venue) ?? String(square.venue) : null,
      }
    })

    const payload = {
      r: round,
      allocation: mappedAllocation,
      ...(teamUserDefinedData ? { userDefinedData: teamUserDefinedData } : {}),
    }

    if (save) {
      const DrawModel = getDrawModel(connection)
      const updated = await DrawModel.findOneAndUpdate(
        { tournamentId, round },
        {
          $set: {
            allocation: mappedAllocation,
            drawOpened: false,
            allocationOpened: false,
            locked: false,
            ...(teamUserDefinedData ? { userDefinedData: teamUserDefinedData } : {}),
          },
          $setOnInsert: { createdBy: req.session?.userId },
        },
        { new: true, upsert: true }
      )
        .lean()
        .exec()
      res.status(201).json({ data: updated, errors: [] })
      return
    }

    res.json({ data: payload, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const deleteDraw: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { tournamentId } = req.query as { tournamentId?: string }
    if (!tournamentId || !isValidObjectId(tournamentId)) {
      badRequest(res, 'Invalid tournament id')
      return
    }
    if (!isValidObjectId(id)) {
      badRequest(res, 'Invalid draw id')
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const DrawModel = getDrawModel(connection)
    const deleted = await DrawModel.findOneAndDelete({ _id: id, tournamentId }).lean().exec()
    if (!deleted) {
      notFound(res, 'Draw not found')
      return
    }
    res.json({ data: deleted, errors: [] })
  } catch (err) {
    next(err)
  }
}
