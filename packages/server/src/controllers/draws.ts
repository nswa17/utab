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
import {
  validateAllocationOptions,
  validateEntityDetailsShape,
} from './shared/allocation-validation.js'

const allocations = {
  teams: teamAllocations,
  adjudicators: adjudicatorAllocations,
  venues: venueAllocations,
}

type AllocationEntityKind = 'team' | 'adjudicator' | 'venue'

type AllocationEntityRef = {
  kind: AllocationEntityKind
  id: string
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean)))
}

function normalizeDrawTeamsForValidation(teams: unknown): { gov: string; opp: string } | null {
  let gov = ''
  let opp = ''
  if (Array.isArray(teams)) {
    gov = String(teams[0] ?? '').trim()
    opp = String(teams[1] ?? '').trim()
  } else if (teams && typeof teams === 'object') {
    const source = teams as Record<string, unknown>
    gov = String(source.gov ?? '').trim()
    opp = String(source.opp ?? '').trim()
  }
  if (!gov || !opp || gov === opp) return null
  return { gov, opp }
}

function detailAvailableForRound(details: unknown, round: number): boolean {
  if (!Array.isArray(details)) return true
  const detail = details.find((item: any) => Number(item?.r) === round)
  return detail?.available !== false
}

function collectAllocationEntityRefs(allocation: unknown): AllocationEntityRef[] {
  if (!Array.isArray(allocation)) return []
  const refs = new Map<string, AllocationEntityRef>()
  const addRef = (kind: AllocationEntityKind, id: unknown) => {
    const normalizedId = String(id ?? '').trim()
    if (!normalizedId) return
    refs.set(`${kind}:${normalizedId}`, { kind, id: normalizedId })
  }

  allocation.forEach((row) => {
    if (!row || typeof row !== 'object') return
    const source = row as Record<string, unknown>
    const teams = normalizeDrawTeamsForValidation(source.teams)
    if (teams) {
      addRef('team', teams.gov)
      addRef('team', teams.opp)
    }
    addRef('venue', source.venue)
    normalizeIdList(source.chairs).forEach((id) => addRef('adjudicator', id))
    normalizeIdList(source.panels).forEach((id) => addRef('adjudicator', id))
    normalizeIdList(source.trainees).forEach((id) => addRef('adjudicator', id))
  })

  return Array.from(refs.values())
}

function formatUnavailableEntityMessage(round: number, refs: AllocationEntityRef[]): string {
  const summary = refs.map((ref) => `${ref.kind}:${ref.id}`).join(', ')
  return `allocation contains entities unavailable in round ${round}: ${summary}`
}

export const listDraws: RequestHandler = async (req, res, next) => {
  try {
    const {
      tournamentId,
      round,
      public: publicParam,
    } = req.query as {
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
      publicParam === '1' ||
      publicParam === 'true' ||
      publicParam === 'yes' ||
      publicParam === 'public'
    const data = isAdmin && !forcePublic ? draws : draws.map((draw) => sanitizeDrawForPublic(draw))
    res.json({ data, errors: [] })
  } catch (err) {
    next(err)
  }
}

export const upsertDraw: RequestHandler = async (req, res, next) => {
  try {
    const {
      tournamentId,
      round,
      allocation,
      userDefinedData,
      drawOpened,
      allocationOpened,
      locked,
    } = req.body as {
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
    const [teamDocs, adjudicatorDocs, venueDocs] = await Promise.all([
      getTeamModel(connection).find({ tournamentId }).lean().exec(),
      getAdjudicatorModel(connection).find({ tournamentId }).lean().exec(),
      getVenueModel(connection).find({ tournamentId }).lean().exec(),
    ])
    const teamAvailabilityById = new Map<string, boolean>(
      teamDocs.map((team: any) => [
        String(team?._id ?? ''),
        detailAvailableForRound(team?.details, round),
      ])
    )
    const adjudicatorAvailabilityById = new Map<string, boolean>(
      adjudicatorDocs.map((adjudicator: any) => [
        String(adjudicator?._id ?? ''),
        detailAvailableForRound(adjudicator?.details, round),
      ])
    )
    const venueAvailabilityById = new Map<string, boolean>(
      venueDocs.map((venue: any) => [
        String(venue?._id ?? ''),
        detailAvailableForRound(venue?.details, round),
      ])
    )
    const unavailableRefs = collectAllocationEntityRefs(allocation).filter((ref) => {
      if (ref.kind === 'team') return teamAvailabilityById.get(ref.id) === false
      if (ref.kind === 'adjudicator') return adjudicatorAvailabilityById.get(ref.id) === false
      return venueAvailabilityById.get(ref.id) === false
    })
    if (unavailableRefs.length > 0) {
      badRequest(res, formatUnavailableEntityMessage(round, unavailableRefs))
      return
    }

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
    const {
      tournamentId,
      round,
      options,
      save = true,
    } = req.body as {
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
      notFound(res, 'Tournament not found')
      return
    }

    const styleOption = (tournament.options as any)?.style
    const styleDoc =
      typeof tournament.style === 'number'
        ? await StyleModel.findOne({ id: tournament.style }).lean().exec()
        : null
    const scoreWeights = normalizeScoreWeights(
      styleOption?.score_weights ?? styleDoc?.score_weights
    )
    const teamNum = styleOption?.team_num ?? styleDoc?.team_num ?? 2
    const style = { team_num: teamNum, score_weights: scoreWeights }
    const config = {
      name: tournament.name,
      style,
      preev_weights: (tournament as any).preev_weights ??
        (tournament.options as any)?.preev_weights ?? [0, 0, 0, 0, 0, 0],
      institution_priority_map: {} as Record<number, number>,
      institution_category_map: {} as Record<number, string>,
    }

    const teamMaps = buildIdMaps(teams)
    const adjudicatorMaps = buildIdMaps(adjudicators)
    const venueMaps = buildIdMaps(venues)
    const institutionMaps = buildIdMaps(institutions)
    const speakerMaps = buildIdMaps(speakers)

    const roundsForCompile = ensureRounds(round)
    const roundsNeeded = Array.from(new Set([...roundsForCompile, round])).sort((a, b) => a - b)

    teams.forEach((team) => {
      validateEntityDetailsShape(
        'team',
        `${String((team as any)._id ?? '') || 'unknown team'}`,
        (team as any).details
      )
    })
    adjudicators.forEach((adj) => {
      validateEntityDetailsShape(
        'adjudicator',
        `${String((adj as any)._id ?? '') || 'unknown adjudicator'}`,
        (adj as any).details
      )
    })
    venues.forEach((venue) => {
      validateEntityDetailsShape(
        'venue',
        `${String((venue as any)._id ?? '') || 'unknown venue'}`,
        (venue as any).details
      )
    })

    const teamInstances = teams.map((team) => ({
      id: teamMaps.map.get(String(team._id))!,
      name: team.name,
      details: buildDetailsForRounds(
        (team as any).details,
        roundsNeeded,
        {
          available: (team as any)?.template?.available !== false,
          conflicts: Array.isArray((team as any)?.template?.conflicts)
            ? (team as any).template.conflicts
            : [],
          speakers: Array.isArray((team as any)?.template?.speakers)
            ? (team as any).template.speakers
            : [],
        },
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
        {
          available: (adj as any)?.template?.available !== false,
          conflicts: Array.isArray((adj as any)?.template?.conflicts)
            ? (adj as any).template.conflicts
            : [],
          conflict_teams: Array.isArray((adj as any)?.template?.conflict_teams)
            ? (adj as any).template.conflict_teams
            : [],
        },
        (id) => institutionMaps.map.get(id),
        undefined,
        (id) => teamMaps.map.get(id)
      ),
    }))

    const venueInstances = venues.map((venue) => ({
      id: venueMaps.map.get(String(venue._id))!,
      name: venue.name,
      details: buildDetailsForRounds((venue as any).details, roundsNeeded, {
        available: (venue as any)?.template?.available !== false,
        priority:
          typeof (venue as any)?.template?.priority === 'number'
            ? (venue as any).template.priority
            : 1,
      }),
    }))

    const speakerInstances = speakers.map((speaker) => ({
      id: speakerMaps.map.get(String(speaker._id))!,
      name: speaker.name,
    }))

    const institutionInstances = institutions.map((inst) => ({
      id: institutionMaps.map.get(String(inst._id))!,
      name: inst.name,
      category:
        typeof (inst as any).category === 'string' &&
        String((inst as any).category).trim().length > 0
          ? String((inst as any).category).trim()
          : 'institution',
      priority: normalizeInstitutionPriority((inst as any).priority),
    }))
    config.institution_priority_map = Object.fromEntries(
      institutionInstances.map((inst) => [inst.id, inst.priority])
    )
    config.institution_category_map = Object.fromEntries(
      institutionInstances.map((inst) => [
        inst.id,
        String(inst.category ?? 'institution')
          .trim()
          .toLowerCase() || 'institution',
      ])
    )

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
        : coreResults.compileTeamResults(
            teamInstances,
            mappedRawTeamResults,
            roundsForCompile,
            style
          )

    const compiledAdjudicatorResults = coreResults.compileAdjudicatorResults(
      adjudicatorInstances,
      mappedRawAdjudicatorResults,
      roundsForCompile
    )

    const validatedOptions = validateAllocationOptions(options)
    const teamAlgorithm = validatedOptions.team_allocation_algorithm
    const teamAlgorithmOptions = validatedOptions.team_allocation_algorithm_options
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

    const numbersOfAdjudicators = validatedOptions.numbers_of_adjudicators
    const adjudicatorAlgorithm = validatedOptions.adjudicator_allocation_algorithm
    const adjudicatorOptions = validatedOptions.adjudicator_allocation_algorithm_options

    let adjudicatorDraw = draw
    const allocationSquares = draw.allocation?.length ?? 0
    const availableAdjudicators = filterAvailable(adjudicatorInstances, round)
    if (
      adjudicators.length > 0 &&
      hasSufficientAdjudicators(
        availableAdjudicators.length,
        allocationSquares,
        numbersOfAdjudicators
      )
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

    const venueOptions = validatedOptions.venue_allocation_algorithm_options
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
        Array.isArray(teams) && teams.length === 2 ? { gov: teams[0], opp: teams[1] } : teams

      return {
        ...square,
        teams: mappedTeams,
        chairs: (square.chairs || []).map(
          (id: number) => adjudicatorMaps.reverse.get(id) ?? String(id)
        ),
        panels: (square.panels || []).map(
          (id: number) => adjudicatorMaps.reverse.get(id) ?? String(id)
        ),
        trainees: (square.trainees || []).map(
          (id: number) => adjudicatorMaps.reverse.get(id) ?? String(id)
        ),
        venue: square.venue ? (venueMaps.reverse.get(square.venue) ?? String(square.venue)) : null,
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
  } catch (err: any) {
    if (err?.status === 400) {
      badRequest(res, String(err?.message ?? 'Bad Request'))
      return
    }
    if (err?.status === 404) {
      notFound(res, String(err?.message ?? 'Not Found'))
      return
    }
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
