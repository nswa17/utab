import { getAdjudicatorModel } from '../models/adjudicator.js'
import { getInstitutionModel } from '../models/institution.js'
import { getRoundModel } from '../models/round.js'
import { getSpeakerModel } from '../models/speaker.js'
import { getTeamModel } from '../models/team.js'
import { getVenueModel } from '../models/venue.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'
import type { FillSetupRequest, FillSetupResponse, SetupCountSummary } from './types.js'

function normalizePositiveInt(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  return Math.floor(value)
}

function normalizedNameSet(items: Array<{ name?: unknown }>): Set<string> {
  const set = new Set<string>()
  items.forEach((item) => {
    const value = String(item?.name ?? '').trim()
    if (value) set.add(value)
  })
  return set
}

function allocateName(existingNames: Set<string>, prefix: string): string {
  let cursor = 1
  while (true) {
    const candidate = `${prefix} ${cursor}`
    if (!existingNames.has(candidate)) {
      existingNames.add(candidate)
      return candidate
    }
    cursor += 1
  }
}

function randomIndex(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0
  return Math.floor(Math.random() * maxExclusive)
}

function randomPickOne<T>(items: T[]): T | null {
  if (items.length === 0) return null
  return items[randomIndex(items.length)]
}

function randomPickUnique<T>(items: T[], count: number): T[] {
  if (count <= 0 || items.length === 0) return []
  if (count >= items.length) return [...items]

  const pool = [...items]
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1)
    const next = pool[index]
    pool[index] = pool[swapIndex]
    pool[swapIndex] = next
  }
  return pool.slice(0, count)
}

async function loadSetupCounts(tournamentId: string): Promise<SetupCountSummary> {
  const connection = await getTournamentConnection(tournamentId)
  const TeamModel = getTeamModel(connection)
  const SpeakerModel = getSpeakerModel(connection)
  const AdjudicatorModel = getAdjudicatorModel(connection)
  const VenueModel = getVenueModel(connection)
  const InstitutionModel = getInstitutionModel(connection)
  const RoundModel = getRoundModel(connection)

  const [teams, speakers, adjudicators, venues, institutions, rounds] = await Promise.all([
    TeamModel.countDocuments({ tournamentId }).exec(),
    SpeakerModel.countDocuments({ tournamentId }).exec(),
    AdjudicatorModel.countDocuments({ tournamentId }).exec(),
    VenueModel.countDocuments({ tournamentId }).exec(),
    InstitutionModel.countDocuments({ tournamentId }).exec(),
    RoundModel.countDocuments({ tournamentId }).exec(),
  ])

  return {
    teams,
    speakers,
    adjudicators,
    venues,
    institutions,
    rounds,
  }
}

export async function fillTournamentSetupData(
  tournamentId: string,
  request: FillSetupRequest
): Promise<FillSetupResponse> {
  const normalizedRequest: FillSetupRequest = {
    targetTeams: normalizePositiveInt(request.targetTeams),
    targetAdjudicators: normalizePositiveInt(request.targetAdjudicators),
    targetVenues: normalizePositiveInt(request.targetVenues),
    targetInstitutions: normalizePositiveInt(request.targetInstitutions),
    speakersPerTeam: Math.max(1, normalizePositiveInt(request.speakersPerTeam)),
  }

  const before = await loadSetupCounts(tournamentId)
  const created: SetupCountSummary = {
    teams: 0,
    speakers: 0,
    adjudicators: 0,
    venues: 0,
    institutions: 0,
    rounds: 0,
  }

  const connection = await getTournamentConnection(tournamentId)
  const TeamModel = getTeamModel(connection)
  const SpeakerModel = getSpeakerModel(connection)
  const AdjudicatorModel = getAdjudicatorModel(connection)
  const VenueModel = getVenueModel(connection)
  const InstitutionModel = getInstitutionModel(connection)
  const RoundModel = getRoundModel(connection)

  let rounds = await RoundModel.find({ tournamentId }).sort({ round: 1 }).lean().exec()
  if (rounds.length === 0) {
    await RoundModel.create({
      tournamentId,
      round: 1,
      name: 'Round 1',
      motions: [],
      motionOpened: false,
      teamAllocationOpened: false,
      adjudicatorAllocationOpened: false,
      weightsOfAdjudicators: { chair: 1, panel: 1, trainee: 0 },
      userDefinedData: {
        evaluate_from_adjudicators: true,
        evaluate_from_teams: true,
        chairs_always_evaluated: false,
        evaluator_in_team: 'team',
        no_speaker_score: false,
        score_by_matter_manner: true,
        poi: true,
        best: true,
        allow_low_tie_win: true,
        __devtools: { source: 'fill-setup' },
      },
    })
    created.rounds += 1
    rounds = await RoundModel.find({ tournamentId }).sort({ round: 1 }).lean().exec()
  }
  const roundNumbers = rounds.map((round) => Number((round as any)?.round)).filter(Number.isFinite)

  let institutions = await InstitutionModel.find({ tournamentId }).select({ _id: 1, name: 1 }).lean().exec()
  const institutionNameSet = normalizedNameSet(institutions as Array<{ name?: unknown }>)
  const institutionDeficit = Math.max(0, normalizedRequest.targetInstitutions - before.institutions)
  if (institutionDeficit > 0) {
    const payload = Array.from({ length: institutionDeficit }).map(() => ({
      tournamentId,
      name: allocateName(institutionNameSet, 'Dev Institution'),
      category: 'institution',
      priority: 1,
      userDefinedData: { __devtools: { source: 'fill-setup' } },
    }))
    await InstitutionModel.insertMany(payload, { ordered: true })
    created.institutions += payload.length
    institutions = await InstitutionModel.find({ tournamentId }).select({ _id: 1, name: 1 }).lean().exec()
  }
  const institutionPool = institutions
    .map((institution: any) => ({
      id: String(institution?._id ?? '').trim(),
      name: String(institution?.name ?? '').trim() || 'Institution',
    }))
    .filter((item) => item.id.length > 0)

  const existingSpeakers = await SpeakerModel.find({ tournamentId }).select({ _id: 1, name: 1 }).lean().exec()
  const speakerNameSet = normalizedNameSet(existingSpeakers as Array<{ name?: unknown }>)

  const targetSpeakerCount = normalizedRequest.targetTeams * normalizedRequest.speakersPerTeam
  const speakerDeficit = Math.max(0, targetSpeakerCount - before.speakers)
  if (speakerDeficit > 0) {
    const payload = Array.from({ length: speakerDeficit }).map(() => ({
      tournamentId,
      name: allocateName(speakerNameSet, 'Dev Speaker'),
      userDefinedData: { __devtools: { source: 'fill-setup' } },
    }))
    await SpeakerModel.insertMany(payload, { ordered: true })
    created.speakers += payload.length
  }

  const allSpeakers = await SpeakerModel.find({ tournamentId }).select({ _id: 1, name: 1 }).lean().exec()
  const speakerPool = allSpeakers.map((speaker: any) => ({
    id: String(speaker?._id ?? ''),
    name: String(speaker?.name ?? '').trim() || 'Speaker',
  }))

  const teamNameSet = normalizedNameSet(
    (await TeamModel.find({ tournamentId }).select({ name: 1 }).lean().exec()) as Array<{ name?: unknown }>
  )
  const teamDeficit = Math.max(0, normalizedRequest.targetTeams - before.teams)
  if (teamDeficit > 0) {
    const nextSpeakerBatch = (): Array<{ id: string; name: string }> => {
      if (speakerPool.length === 0) return []
      if (speakerPool.length <= normalizedRequest.speakersPerTeam) {
        return [...speakerPool]
      }
      return randomPickUnique(speakerPool, normalizedRequest.speakersPerTeam)
    }

    const payload = Array.from({ length: teamDeficit }).map(() => {
      const teamSpeakers = nextSpeakerBatch()
      const speakerIds = Array.from(new Set(teamSpeakers.map((item) => item.id).filter(Boolean)))
      const assignedInstitution = randomPickOne(institutionPool)
      const assignedInstitutionId = assignedInstitution?.id ?? ''

      return {
        tournamentId,
        name: allocateName(teamNameSet, 'Dev Team'),
        template: {
          available: true,
          conflicts: assignedInstitutionId ? [assignedInstitutionId] : [],
          speakers: speakerIds,
        },
        details: roundNumbers.map((roundNumber) => ({
          r: roundNumber,
          available: true,
          conflicts: assignedInstitutionId ? [assignedInstitutionId] : [],
          speakers: speakerIds,
        })),
        userDefinedData: { __devtools: { source: 'fill-setup' } },
      }
    })

    await TeamModel.insertMany(payload, { ordered: true })
    created.teams += payload.length
  }

  const adjudicatorNameSet = normalizedNameSet(
    (await AdjudicatorModel.find({ tournamentId }).select({ name: 1 }).lean().exec()) as Array<{
      name?: unknown
    }>
  )
  const adjudicatorDeficit = Math.max(0, normalizedRequest.targetAdjudicators - before.adjudicators)
  if (adjudicatorDeficit > 0) {
    const payload = Array.from({ length: adjudicatorDeficit }).map(() => {
      const assignedInstitution = randomPickOne(institutionPool)
      const assignedInstitutionId = assignedInstitution?.id ?? ''
      return {
        tournamentId,
        name: allocateName(adjudicatorNameSet, 'Dev Judge'),
        preev: 5,
        template: {
          available: true,
          conflicts: assignedInstitutionId ? [assignedInstitutionId] : [],
          conflict_teams: [],
        },
        details: roundNumbers.map((roundNumber) => ({
          r: roundNumber,
          available: true,
          conflicts: assignedInstitutionId ? [assignedInstitutionId] : [],
          conflict_teams: [],
        })),
        userDefinedData: { __devtools: { source: 'fill-setup' } },
      }
    })

    await AdjudicatorModel.insertMany(payload, { ordered: true })
    created.adjudicators += payload.length
  }

  const venueNameSet = normalizedNameSet(
    (await VenueModel.find({ tournamentId }).select({ name: 1 }).lean().exec()) as Array<{ name?: unknown }>
  )
  const venueDeficit = Math.max(0, normalizedRequest.targetVenues - before.venues)
  if (venueDeficit > 0) {
    const payload = Array.from({ length: venueDeficit }).map(() => ({
      tournamentId,
      name: allocateName(venueNameSet, 'Dev Venue'),
      template: {
        available: true,
        priority: 1,
      },
      details: roundNumbers.map((roundNumber) => ({
        r: roundNumber,
        available: true,
        priority: 1,
      })),
      userDefinedData: { __devtools: { source: 'fill-setup' } },
    }))

    await VenueModel.insertMany(payload, { ordered: true })
    created.venues += payload.length
  }

  const after = await loadSetupCounts(tournamentId)

  return {
    tournamentId,
    before,
    created,
    after,
    request: normalizedRequest,
  }
}
