import { Types } from 'mongoose'
import type { RequestHandler } from 'express'
import {
  teams as teamAllocations,
  adjudicators as adjudicatorAllocations,
  venues as venueAllocations,
  results as coreResults,
  filterAvailable,
} from '@utab/core'
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
import { getTournamentConnection } from '../services/tournament-db.service.js'

const allocations = {
  teams: teamAllocations,
  adjudicators: adjudicatorAllocations,
  venues: venueAllocations,
}

type IdMaps = {
  map: Map<string, number>
  reverse: Map<number, string>
}

function buildIdMaps(docs: Array<{ _id: unknown }>): IdMaps {
  const map = new Map<string, number>()
  const reverse = new Map<number, string>()
  docs.forEach((doc, idx) => {
    const id = String(doc._id)
    const num = idx + 1
    map.set(id, num)
    reverse.set(num, id)
  })
  return { map, reverse }
}

function normalizeScoreWeights(scoreWeights: any): number[] {
  if (Array.isArray(scoreWeights)) {
    if (scoreWeights.every((v) => typeof v === 'number')) return scoreWeights
    if (scoreWeights.every((v) => v && typeof v === 'object' && 'value' in v)) {
      return scoreWeights.map((v) => Number(v.value))
    }
  }
  return [1]
}

function ensureRounds(round: number): number[] {
  if (round <= 1) return []
  return Array.from({ length: round - 1 }, (_, i) => i + 1)
}

function buildDetailsForRounds(
  details: any[] | undefined,
  rounds: number[],
  defaults: Record<string, unknown>,
  mapInstitutions?: (id: string) => number | undefined,
  mapSpeakers?: (id: string) => number | undefined,
  mapConflicts?: (id: string) => number | undefined
) {
  return rounds.map((r) => {
    const existing = details?.find((d) => d.r === r) ?? {}
    const merged: Record<string, unknown> = { r, ...defaults, ...existing }
    if (mapInstitutions && Array.isArray(merged.institutions)) {
      merged.institutions = merged.institutions
        .map((id: string) => mapInstitutions(id))
        .filter((v: number | undefined): v is number => v !== undefined)
    }
    if (mapSpeakers && Array.isArray(merged.speakers)) {
      merged.speakers = merged.speakers
        .map((id: string) => mapSpeakers(id))
        .filter((v: number | undefined): v is number => v !== undefined)
    }
    if (mapConflicts && Array.isArray(merged.conflicts)) {
      merged.conflicts = merged.conflicts
        .map((id: string) => mapConflicts(id))
        .filter((v: number | undefined): v is number => v !== undefined)
    }
    return merged
  })
}

type AllocationContext = {
  teamMaps: IdMaps
  adjudicatorMaps: IdMaps
  venueMaps: IdMaps
  institutionMaps: IdMaps
  speakerMaps: IdMaps
  teamInstances: any[]
  adjudicatorInstances: any[]
  venueInstances: any[]
  compiledTeamResults: any[]
  compiledAdjudicatorResults: any[]
  config: { name: string; style: { team_num: number; score_weights: number[] }; preev_weights: number[] }
}

async function buildAllocationContext(
  tournamentId: string,
  round: number,
  roundsOverride?: number[]
): Promise<AllocationContext> {
  const connection = await getTournamentConnection(tournamentId)
  const [
    tournament,
    teams,
    adjudicators,
    venues,
    institutions,
    speakers,
    rawTeamResults,
    rawSpeakerResults,
    rawAdjudicatorResults,
  ] = await Promise.all([
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
    throw new Error('Tournament not found')
  }

  const styleOption = (tournament.options as any)?.style
  const styleDoc =
    typeof tournament.style === 'number'
      ? await StyleModel.findOne({ id: tournament.style }).lean().exec()
      : null
  const scoreWeights = normalizeScoreWeights(styleOption?.score_weights ?? styleDoc?.score_weights)
  const teamNum = styleOption?.team_num ?? styleDoc?.team_num ?? 2
  const style = { team_num: teamNum, score_weights: scoreWeights }
  const config = {
    name: tournament.name,
    style,
    preev_weights:
      (tournament as any).preev_weights ?? (tournament.options as any)?.preev_weights ?? [0, 0, 0, 0, 0, 0],
  }

  const teamMaps = buildIdMaps(teams)
  const adjudicatorMaps = buildIdMaps(adjudicators)
  const venueMaps = buildIdMaps(venues)
  const institutionMaps = buildIdMaps(institutions)
  const speakerMaps = buildIdMaps(speakers)

  const roundsForCompile =
    Array.isArray(roundsOverride) && roundsOverride.length > 0
      ? Array.from(new Set(roundsOverride)).sort((a, b) => a - b)
      : ensureRounds(round)
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
    details: buildDetailsForRounds((venue as any).details, roundsNeeded, { available: true, priority: 1 }),
  }))

  const speakerInstances = speakers.map((speaker) => ({
    id: speakerMaps.map.get(String(speaker._id))!,
    name: speaker.name,
  }))

  const mapFromId = (id: string) =>
    adjudicatorMaps.map.get(id) ?? speakerMaps.map.get(id) ?? teamMaps.map.get(id) ?? 0

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

  return {
    teamMaps,
    adjudicatorMaps,
    venueMaps,
    institutionMaps,
    speakerMaps,
    teamInstances,
    adjudicatorInstances,
    venueInstances,
    compiledTeamResults,
    compiledAdjudicatorResults,
    config,
  }
}

function mapAllocationOut(
  allocation: any[],
  teamMaps: IdMaps,
  adjudicatorMaps: IdMaps,
  venueMaps: IdMaps
) {
  return (allocation || []).map((square: any) => {
    const teams = Array.isArray(square.teams)
      ? square.teams.map((id: number) => teamMaps.reverse.get(id) ?? String(id))
      : square.teams
    const mappedTeams =
      Array.isArray(teams) && teams.length === 2 ? { gov: teams[0], opp: teams[1] } : teams

    return {
      ...square,
      teams: mappedTeams,
      chairs: (square.chairs || []).map((id: number) => adjudicatorMaps.reverse.get(id) ?? String(id)),
      panels: (square.panels || []).map((id: number) => adjudicatorMaps.reverse.get(id) ?? String(id)),
      trainees: (square.trainees || []).map((id: number) => adjudicatorMaps.reverse.get(id) ?? String(id)),
      venue: square.venue ? venueMaps.reverse.get(square.venue) ?? String(square.venue) : null,
    }
  })
}

function normalizeIncomingAllocation(allocation: any[], teamMaps: IdMaps) {
  return allocation.map((square: any, index: number) => {
    const rawTeams = Array.isArray(square.teams)
      ? square.teams
      : square.teams && typeof square.teams === 'object'
        ? [square.teams.gov, square.teams.opp]
        : []
    const mappedTeams = rawTeams
      .map((id: any) => teamMaps.map.get(String(id)))
      .filter((v: number | undefined): v is number => v !== undefined)
    return {
      id: typeof square.id === 'number' ? square.id : index,
      teams: mappedTeams,
      chairs: [],
      panels: [],
      trainees: [],
      venue: square.venue ?? null,
    }
  })
}

function normalizeAllocationWithAdjudicators(
  allocation: any[],
  teamMaps: IdMaps,
  adjudicatorMaps: IdMaps
) {
  return allocation.map((square: any, index: number) => {
    const rawTeams = Array.isArray(square.teams)
      ? square.teams
      : square.teams && typeof square.teams === 'object'
        ? [square.teams.gov, square.teams.opp]
        : []
    const mappedTeams = rawTeams
      .map((id: any) => teamMaps.map.get(String(id)))
      .filter((v: number | undefined): v is number => v !== undefined)
    const mapAdj = (ids: any[]) =>
      (ids || [])
        .map((id) => {
          if (typeof id === 'number') return id
          return adjudicatorMaps.map.get(String(id)) ?? id
        })
        .filter((v) => v !== undefined)
    return {
      id: typeof square.id === 'number' ? square.id : index,
      teams: mappedTeams,
      chairs: mapAdj(square.chairs),
      panels: mapAdj(square.panels),
      trainees: mapAdj(square.trainees),
      venue: square.venue ?? null,
    }
  })
}

export const createTeamAllocation: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, options, rounds } = req.body as {
      tournamentId: string
      round: number
      options?: Record<string, any>
      rounds?: number[]
    }
    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const context = await buildAllocationContext(tournamentId, round, rounds)

    let draw = allocations.teams.standard.get(
      round,
      context.teamInstances,
      context.compiledTeamResults,
      options?.team_allocation_algorithm_options ?? {},
      context.config
    )

    if (options?.team_allocation_algorithm === 'strict') {
      draw = allocations.teams.strict.get(
        round,
        context.teamInstances,
        context.compiledTeamResults,
        context.config,
        options?.team_allocation_algorithm_options ?? {}
      )
    }

    const mappedAllocation = mapAllocationOut(
      draw.allocation || [],
      context.teamMaps,
      context.adjudicatorMaps,
      context.venueMaps
    )

    res.json({ data: { r: round, allocation: mappedAllocation }, errors: [] })
  } catch (err: any) {
    if (err?.message === 'Tournament not found') {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
      return
    }
    next(err)
  }
}

export const createAdjudicatorAllocation: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, allocation, options, rounds } = req.body as {
      tournamentId: string
      round: number
      allocation: any[]
      options?: Record<string, any>
      rounds?: number[]
    }
    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    if (!Array.isArray(allocation)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Allocation is required' }] })
      return
    }

    const context = await buildAllocationContext(tournamentId, round, rounds)
    const normalized = normalizeIncomingAllocation(allocation, context.teamMaps)

    const baseDraw = { r: round, allocation: normalized }
    if (context.adjudicatorInstances.length === 0) {
      const mappedAllocation = mapAllocationOut(
        baseDraw.allocation || [],
        context.teamMaps,
        context.adjudicatorMaps,
        context.venueMaps
      )
      res.json({ data: { r: round, allocation: mappedAllocation }, errors: [] })
      return
    }

    const allocationSquares = baseDraw.allocation?.length ?? 0
    const availableAdjudicators = filterAvailable(context.adjudicatorInstances, round)
    if (allocationSquares > 0 && availableAdjudicators.length < allocationSquares) {
      const mappedAllocation = mapAllocationOut(
        baseDraw.allocation || [],
        context.teamMaps,
        context.adjudicatorMaps,
        context.venueMaps
      )
      res.json({ data: { r: round, allocation: mappedAllocation }, errors: [] })
      return
    }

    const numbersOfAdjudicators = options?.numbers_of_adjudicators ?? { chairs: 1, panels: 2, trainees: 0 }
    const adjudicatorAlgorithm = options?.adjudicator_allocation_algorithm ?? 'standard'
    const adjudicatorOptions = options?.adjudicator_allocation_algorithm_options ?? {}

    const adjudicatorDraw =
      adjudicatorAlgorithm === 'traditional'
        ? allocations.adjudicators.traditional.get(
            round,
            baseDraw,
            context.adjudicatorInstances,
            context.teamInstances,
            context.compiledTeamResults,
            context.compiledAdjudicatorResults,
            numbersOfAdjudicators,
            context.config,
            adjudicatorOptions
          )
        : allocations.adjudicators.standard.get(
            round,
            baseDraw,
            context.adjudicatorInstances,
            context.teamInstances,
            context.compiledTeamResults,
            context.compiledAdjudicatorResults,
            numbersOfAdjudicators,
            context.config,
            adjudicatorOptions
          )

    const mappedAllocation = mapAllocationOut(
      adjudicatorDraw.allocation || [],
      context.teamMaps,
      context.adjudicatorMaps,
      context.venueMaps
    )

    res.json({ data: { r: round, allocation: mappedAllocation }, errors: [] })
  } catch (err: any) {
    if (err?.message === 'Tournament not found') {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
      return
    }
    next(err)
  }
}

export const createVenueAllocation: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, allocation, options, rounds } = req.body as {
      tournamentId: string
      round: number
      allocation: any[]
      options?: Record<string, any>
      rounds?: number[]
    }
    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }
    if (!Array.isArray(allocation)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Allocation is required' }] })
      return
    }

    const context = await buildAllocationContext(tournamentId, round, rounds)
    const normalized = normalizeAllocationWithAdjudicators(allocation, context.teamMaps, context.adjudicatorMaps)
    const venueOptions = options?.venue_allocation_algorithm_options ?? {}

    const baseDraw = { r: round, allocation: normalized }
    if (context.venueInstances.length === 0) {
      const mappedAllocation = mapAllocationOut(
        baseDraw.allocation || [],
        context.teamMaps,
        context.adjudicatorMaps,
        context.venueMaps
      )
      res.json({ data: { r: round, allocation: mappedAllocation }, errors: [] })
      return
    }

    const venueDraw = allocations.venues.standard.get(
      round,
      baseDraw,
      context.venueInstances,
      context.compiledTeamResults,
      context.config,
      venueOptions.shuffle
    )

    const mappedAllocation = mapAllocationOut(
      venueDraw.allocation || [],
      context.teamMaps,
      context.adjudicatorMaps,
      context.venueMaps
    )

    res.json({ data: { r: round, allocation: mappedAllocation }, errors: [] })
  } catch (err: any) {
    if (err?.message === 'Tournament not found') {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
      return
    }
    next(err)
  }
}

export const createAllocation: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, round, options, rounds } = req.body as {
      tournamentId: string
      round: number
      options?: Record<string, any>
      rounds?: number[]
    }
    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const context = await buildAllocationContext(tournamentId, round, rounds)

    let draw = allocations.teams.standard.get(
      round,
      context.teamInstances,
      context.compiledTeamResults,
      options?.team_allocation_algorithm_options ?? {},
      context.config
    )

    if (options?.team_allocation_algorithm === 'strict') {
      draw = allocations.teams.strict.get(
        round,
        context.teamInstances,
        context.compiledTeamResults,
        context.config,
        options?.team_allocation_algorithm_options ?? {}
      )
    }

    const numbersOfAdjudicators = options?.numbers_of_adjudicators ?? { chairs: 1, panels: 2, trainees: 0 }
    const adjudicatorAlgorithm = options?.adjudicator_allocation_algorithm ?? 'standard'
    const adjudicatorOptions = options?.adjudicator_allocation_algorithm_options ?? {}

    let adjudicatorDraw = draw
    const allocationSquares = draw.allocation?.length ?? 0
    const availableAdjudicators = filterAvailable(context.adjudicatorInstances, round)
    if (context.adjudicatorInstances.length > 0 && allocationSquares > 0 && availableAdjudicators.length >= allocationSquares) {
      adjudicatorDraw =
        adjudicatorAlgorithm === 'traditional'
          ? allocations.adjudicators.traditional.get(
              round,
              draw,
              context.adjudicatorInstances,
              context.teamInstances,
              context.compiledTeamResults,
              context.compiledAdjudicatorResults,
              numbersOfAdjudicators,
              context.config,
              adjudicatorOptions
            )
          : allocations.adjudicators.standard.get(
              round,
              draw,
              context.adjudicatorInstances,
              context.teamInstances,
              context.compiledTeamResults,
              context.compiledAdjudicatorResults,
              numbersOfAdjudicators,
              context.config,
              adjudicatorOptions
            )
    }

    const venueOptions = options?.venue_allocation_algorithm_options ?? {}
    let venueDraw = adjudicatorDraw
    if (context.venueInstances.length > 0) {
      venueDraw = allocations.venues.standard.get(
        round,
        adjudicatorDraw,
        context.venueInstances,
        context.compiledTeamResults,
        context.config,
        venueOptions.shuffle
      )
    }

    const mappedAllocation = mapAllocationOut(
      venueDraw.allocation || [],
      context.teamMaps,
      context.adjudicatorMaps,
      context.venueMaps
    )

    res.json({ data: { r: round, allocation: mappedAllocation }, errors: [] })
  } catch (err: any) {
    if (err?.message === 'Tournament not found') {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
      return
    }
    next(err)
  }
}
