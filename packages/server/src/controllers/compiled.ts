import { Types, type Connection } from 'mongoose'
import type { RequestHandler } from 'express'
import { results as coreResults } from '@utab/core'
import { hasTournamentAdminAccess } from '../middleware/auth.js'
import { TournamentModel } from '../models/tournament.js'
import { StyleModel } from '../models/style.js'
import { getCompiledModel } from '../models/compiled.js'
import { getSubmissionModel } from '../models/submission.js'
import { getTeamModel } from '../models/team.js'
import { getAdjudicatorModel } from '../models/adjudicator.js'
import { getDrawModel } from '../models/draw.js'
import { getRoundModel } from '../models/round.js'
import { getRawTeamResultModel } from '../models/raw-team-result.js'
import { getRawSpeakerResultModel } from '../models/raw-speaker-result.js'
import { getRawAdjudicatorResultModel } from '../models/raw-adjudicator-result.js'
import {
  sanitizeCompiledForPublic,
  sanitizeCompiledSubsetForPublic,
} from '../services/response-sanitizer.js'
import { getTournamentConnection } from '../services/tournament-db.service.js'

type BallotPayload = {
  teamAId?: string
  teamBId?: string
  winnerId?: string
  speakerIdsA?: unknown
  speakerIdsB?: unknown
  scoresA?: unknown
  scoresB?: unknown
  comment?: string
}

type FeedbackPayload = {
  adjudicatorId?: string
  score?: unknown
  comment?: string
}

type CompiledPayload = {
  tournamentId: string
  rounds: Array<{ r: number; name: string }>
  compiled_team_results: any[]
  compiled_speaker_results: any[]
  compiled_adjudicator_results: any[]
}

type CompiledResultsKey =
  | 'compiled_team_results'
  | 'compiled_speaker_results'
  | 'compiled_adjudicator_results'

type CompiledSubset = {
  compiledId: string
  tournamentId: string
  rounds: Array<{ r: number; name: string }>
  results: any[]
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === 'number' ? item : Number(item)))
}

function sumScores(scores: number[]): number {
  return scores.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0)
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

function buildDetailsForRounds(
  details: any[] | undefined,
  rounds: number[],
  defaults: Record<string, unknown>
) {
  return rounds.map((r) => {
    const existing = details?.find((d) => d.r === r) ?? {}
    return { r, ...defaults, ...existing }
  })
}

function resolveRounds(
  provided: number[] | undefined,
  rawTeamResults: Array<{ r?: number }>,
  rawSpeakerResults: Array<{ r?: number }>,
  rawAdjudicatorResults: Array<{ r?: number }>
): number[] {
  if (Array.isArray(provided) && provided.length > 0) {
    return Array.from(new Set(provided)).filter(Number.isFinite).sort((a, b) => a - b)
  }
  const roundsSet = new Set<number>()
  rawTeamResults.forEach((result) => {
    const r = Number(result.r)
    if (Number.isFinite(r)) roundsSet.add(r)
  })
  rawSpeakerResults.forEach((result) => {
    const r = Number(result.r)
    if (Number.isFinite(r)) roundsSet.add(r)
  })
  rawAdjudicatorResults.forEach((result) => {
    const r = Number(result.r)
    if (Number.isFinite(r)) roundsSet.add(r)
  })
  return Array.from(roundsSet).sort((a, b) => a - b)
}

function resolveRoundsFromSubmissions(
  provided: number[] | undefined,
  submissions: Array<{ round?: number }>,
  draws: Array<{ round?: number }>
): number[] {
  if (Array.isArray(provided) && provided.length > 0) {
    return Array.from(new Set(provided)).filter(Number.isFinite).sort((a, b) => a - b)
  }
  const roundsSet = new Set<number>()
  submissions.forEach((submission) => {
    const round = Number(submission.round)
    if (Number.isFinite(round)) roundsSet.add(round)
  })
  draws.forEach((draw) => {
    const round = Number(draw.round)
    if (Number.isFinite(round)) roundsSet.add(round)
  })
  return Array.from(roundsSet).sort((a, b) => a - b)
}

async function buildCompiledPayloadFromRaw(
  tournamentId: string,
  requestedRounds?: number[]
): Promise<{ payload: CompiledPayload; connection: Connection }> {
  const [tournament, connection] = await Promise.all([
    TournamentModel.findById(tournamentId).lean().exec(),
    getTournamentConnection(tournamentId),
  ])
  if (!tournament) {
    const err = new Error('Tournament not found')
    ;(err as any).status = 404
    throw err
  }

  const [teams, adjudicators, rawTeamResults, rawSpeakerResults, rawAdjudicatorResults, draws] =
    await Promise.all([
      getTeamModel(connection).find({ tournamentId }).lean().exec(),
      getAdjudicatorModel(connection).find({ tournamentId }).lean().exec(),
      getRawTeamResultModel(connection).find({ tournamentId }).lean().exec(),
      getRawSpeakerResultModel(connection).find({ tournamentId }).lean().exec(),
      getRawAdjudicatorResultModel(connection).find({ tournamentId }).lean().exec(),
      getDrawModel(connection).find({ tournamentId }).lean().exec(),
    ])

  const rounds = resolveRounds(
    requestedRounds,
    rawTeamResults as Array<{ r?: number }>,
    rawSpeakerResults as Array<{ r?: number }>,
    rawAdjudicatorResults as Array<{ r?: number }>
  )
  const selectedRoundSet = new Set(rounds.map((r) => Number(r)))
  const filteredRawTeamResults = (rawTeamResults as any[]).filter((result) =>
    selectedRoundSet.has(Number((result as any).r))
  )
  const filteredRawSpeakerResults = (rawSpeakerResults as any[]).filter((result) =>
    selectedRoundSet.has(Number((result as any).r))
  )
  const filteredRawAdjudicatorResults = (rawAdjudicatorResults as any[]).filter((result) =>
    selectedRoundSet.has(Number((result as any).r))
  )
  const filteredDraws = (draws as any[]).filter((draw) => selectedRoundSet.has(Number(draw.round)))
  const roundDocs = await getRoundModel(connection).find({ tournamentId }).lean().exec()
  const roundNameMap = new Map<number, string>(
    roundDocs.map((doc: any) => [Number(doc.round), doc.name ?? `Round ${doc.round}`])
  )

  const styleOptions = (tournament.options as any)?.style ?? {}
  const styleDoc =
    typeof tournament.style === 'number'
      ? await StyleModel.findOne({ id: tournament.style }).lean().exec()
      : null
  const scoreWeights = normalizeScoreWeights(styleOptions.score_weights ?? styleDoc?.score_weights)
  const teamNum = styleOptions.team_num ?? styleDoc?.team_num ?? 2
  const style = { team_num: teamNum, score_weights: scoreWeights }

  const teamById = new Map(teams.map((team) => [String(team._id), team]))
  const teamIds = new Set(filteredRawTeamResults.map((result: any) => String(result.id)))
  const teamInstances = Array.from(teamIds).map((id) => {
    const team = teamById.get(id)
    return {
      id,
      details: buildDetailsForRounds((team as any)?.details, rounds, {
        available: true,
        institutions: [],
        speakers: [],
      }),
    }
  })

  const speakerIds = new Set(filteredRawSpeakerResults.map((result: any) => String(result.id)))
  const speakerInstances = Array.from(speakerIds).map((id) => ({ id }))

  const adjudicatorIds = new Set(filteredRawAdjudicatorResults.map((result: any) => String(result.id)))
  const adjudicatorInstances = Array.from(adjudicatorIds).map((id) => ({ id }))

  const compiledTeamResults =
    filteredRawSpeakerResults.length > 0 && speakerInstances.length > 0
      ? coreResults.compileTeamResults(
          teamInstances,
          speakerInstances,
          filteredRawTeamResults,
          filteredRawSpeakerResults,
          rounds,
          style
        )
      : coreResults.compileTeamResults(teamInstances, filteredRawTeamResults, rounds, style)

  const compiledSpeakerResults =
    filteredRawSpeakerResults.length > 0
      ? coreResults.compileSpeakerResults(speakerInstances, filteredRawSpeakerResults, style, rounds)
      : []

  const compiledAdjudicatorResults =
    filteredRawAdjudicatorResults.length > 0
      ? coreResults.compileAdjudicatorResults(adjudicatorInstances, filteredRawAdjudicatorResults, rounds)
      : []

  const teamMeta = new Map<string, { institutions: string[] }>()
  teams.forEach((team: any) => {
    const institutions = new Set<string>()
    if (team.institution) institutions.add(team.institution)
    const detailInstitutions = team.details?.flatMap((detail: any) => detail.institutions ?? []) ?? []
    detailInstitutions.forEach((inst: string) => {
      if (inst) institutions.add(String(inst))
    })
    teamMeta.set(String(team._id), { institutions: Array.from(institutions) })
  })

  const speakerMeta = new Map<string, { teamId: string; teamName: string }>()
  teams.forEach((team: any) => {
    const teamId = String(team._id)
    const teamName = team.name
    const speakerIdsFromTeam = new Set<string>()
    team.details?.forEach((detail: any) => {
      ;(detail.speakers ?? []).forEach((speakerId: string) => {
        if (speakerId) speakerIdsFromTeam.add(String(speakerId))
      })
    })
    speakerIdsFromTeam.forEach((speakerId) => {
      if (!speakerMeta.has(speakerId)) {
        speakerMeta.set(speakerId, { teamId, teamName })
      }
    })
  })

  const adjudicatorMeta = new Map<string, { institutions: string[] }>()
  adjudicators.forEach((adj: any) => {
    const institutions = new Set<string>()
    adj.details?.forEach((detail: any) => {
      ;(detail.institutions ?? []).forEach((inst: string) => {
        if (inst) institutions.add(String(inst))
      })
    })
    adjudicatorMeta.set(String(adj._id), { institutions: Array.from(institutions) })
  })

  const adjudicatorStats = new Map<string, { num_experienced: number; num_experienced_chair: number }>()
  filteredDraws.forEach((draw: any) => {
    const drawRound = Number(draw.round)
    if (!Number.isFinite(drawRound) || !selectedRoundSet.has(drawRound)) return
    draw.allocation?.forEach((row: any) => {
      const chairs = (row?.chairs ?? []).map((id: any) => String(id))
      const panels = (row?.panels ?? []).map((id: any) => String(id))
      const trainees = (row?.trainees ?? []).map((id: any) => String(id))
      const all = ([] as string[]).concat(chairs, panels, trainees)
      all.forEach((adjId) => {
        const stats = adjudicatorStats.get(adjId) ?? { num_experienced: 0, num_experienced_chair: 0 }
        stats.num_experienced += 1
        if (chairs.includes(adjId)) stats.num_experienced_chair += 1
        adjudicatorStats.set(adjId, stats)
      })
    })
  })

  const compiled: CompiledPayload = {
    tournamentId,
    rounds: rounds.map((r) => ({ r, name: roundNameMap.get(r) ?? `Round ${r}` })),
    compiled_team_results: compiledTeamResults.map((result: any) => ({
      ...result,
      institutions: teamMeta.get(result.id)?.institutions ?? [],
    })),
    compiled_speaker_results: compiledSpeakerResults.map((result: any) => ({
      ...result,
      teams: speakerMeta.get(result.id)?.teamName ? [speakerMeta.get(result.id)?.teamName] : [],
    })),
    compiled_adjudicator_results: compiledAdjudicatorResults.map((result: any) => ({
      ...result,
      institutions: adjudicatorMeta.get(result.id)?.institutions ?? [],
      num_experienced: adjudicatorStats.get(result.id)?.num_experienced ?? result.active_num ?? 0,
      num_experienced_chair: adjudicatorStats.get(result.id)?.num_experienced_chair ?? 0,
    })),
  }

  return { payload: compiled, connection }
}

async function buildCompiledPayloadFromSubmissions(
  tournamentId: string,
  requestedRounds?: number[]
): Promise<{ payload: CompiledPayload; connection: Connection }> {
  const [tournament, connection] = await Promise.all([
    TournamentModel.findById(tournamentId).lean().exec(),
    getTournamentConnection(tournamentId),
  ])
  if (!tournament) {
    const err = new Error('Tournament not found')
    ;(err as any).status = 404
    throw err
  }

  const [teams, adjudicators, submissions, draws] = await Promise.all([
    getTeamModel(connection).find({ tournamentId }).lean().exec(),
    getAdjudicatorModel(connection).find({ tournamentId }).lean().exec(),
    getSubmissionModel(connection).find({ tournamentId }).lean().exec(),
    getDrawModel(connection).find({ tournamentId }).lean().exec(),
  ])

  const rounds = resolveRoundsFromSubmissions(
    requestedRounds,
    submissions as Array<{ round?: number }>,
    draws as Array<{ round?: number }>
  )
  const selectedRoundSet = new Set(rounds.map((r) => Number(r)))
  const filteredSubmissions = (submissions as any[]).filter((item) =>
    selectedRoundSet.has(Number(item.round))
  )
  const filteredDraws = (draws as any[]).filter((draw) =>
    selectedRoundSet.has(Number(draw.round))
  )
  const roundDocs = await getRoundModel(connection).find({ tournamentId }).lean().exec()
  const roundNameMap = new Map<number, string>(
    roundDocs.map((doc: any) => [Number(doc.round), doc.name ?? `Round ${doc.round}`])
  )

  const teamById = new Map<string, any>(teams.map((team) => [String(team._id), team]))
  const speakerMeta = new Map<string, { teamId: string; teamName: string }>()

  teams.forEach((team) => {
    const teamId = String(team._id)
    const teamName = team.name

    const detailSpeakerIds = new Set<string>()
    team.details?.forEach((detail: any) => {
      ;(detail.speakers ?? []).forEach((speakerId: string) => {
        if (speakerId) detailSpeakerIds.add(String(speakerId))
      })
    })
    detailSpeakerIds.forEach((speakerId) => {
      if (!speakerMeta.has(speakerId)) {
        speakerMeta.set(speakerId, { teamId, teamName })
      }
    })

    team.speakers?.forEach((_speaker: any, index: number) => {
      const speakerId = `${teamId}:${index}`
      if (!speakerMeta.has(speakerId)) {
        speakerMeta.set(speakerId, { teamId, teamName })
      }
    })
  })

  function getSpeakersForTeamRound(teamId: string, round: number): string[] {
    const team = teamById.get(teamId)
    if (!team) return []
    const detail = team.details?.find((d: any) => Number(d.r) === round)
    const detailSpeakers = (detail?.speakers ?? []).map((id: string) => String(id)).filter(Boolean)
    if (detailSpeakers.length > 0) return detailSpeakers
    if (Array.isArray(team.speakers) && team.speakers.length > 0) {
      return team.speakers.map((_speaker: any, index: number) => `${teamId}:${index}`)
    }
    return []
  }

  const sideByRoundTeam = new Map<number, Map<string, string>>()
  const opponentsByRoundTeam = new Map<number, Map<string, string[]>>()
  const judgedTeamsByRoundAdj = new Map<string, Set<string>>()

  filteredDraws.forEach((draw) => {
    const round = Number(draw.round)
    if (!Number.isFinite(round)) return
    const sideMap = sideByRoundTeam.get(round) ?? new Map<string, string>()
    const oppMap = opponentsByRoundTeam.get(round) ?? new Map<string, string[]>()

    draw.allocation?.forEach((row: any) => {
      let gov: string | undefined
      let opp: string | undefined
      const rowTeams = row?.teams
      if (Array.isArray(rowTeams)) {
        gov = rowTeams[0]
        opp = rowTeams[1]
      } else if (rowTeams && typeof rowTeams === 'object') {
        gov = rowTeams.gov
        opp = rowTeams.opp
      }

      if (gov) {
        sideMap.set(gov, 'gov')
        oppMap.set(gov, opp ? [opp] : [])
      }
      if (opp) {
        sideMap.set(opp, 'opp')
        oppMap.set(opp, gov ? [gov] : [])
      }

      const judgedTeams = [gov, opp].filter(Boolean) as string[]
      const adjudicatorIds = ([] as string[])
        .concat(row?.chairs ?? [], row?.panels ?? [], row?.trainees ?? [])
        .filter(Boolean)
      adjudicatorIds.forEach((adjId) => {
        const key = `${round}:${adjId}`
        const current = judgedTeamsByRoundAdj.get(key) ?? new Set<string>()
        judgedTeams.forEach((teamId) => current.add(teamId))
        judgedTeamsByRoundAdj.set(key, current)
      })
    })

    sideByRoundTeam.set(round, sideMap)
    opponentsByRoundTeam.set(round, oppMap)
  })

  const rawTeamResults: any[] = []
  const rawSpeakerResults: any[] = []
  const rawAdjudicatorResults: any[] = []
  const speakerIdsWithScores = new Set<string>()
  const teamIdsWithResults = new Set<string>()
  const adjudicatorIdsWithScores = new Set<string>()

  filteredSubmissions.forEach((submission: any) => {
    const round = Number(submission.round)
    if (!Number.isFinite(round)) return
    if (submission.type === 'ballot') {
      const payload = (submission.payload ?? {}) as BallotPayload
      const teamAId = payload.teamAId
      const teamBId = payload.teamBId
      if (!teamAId || !teamBId || teamAId === teamBId) return

      const scoresA = toNumberArray(payload.scoresA)
      const scoresB = toNumberArray(payload.scoresB)
      let winnerId = payload.winnerId
      if (!winnerId) {
        const totalA = sumScores(scoresA)
        const totalB = sumScores(scoresB)
        if (totalA > totalB) winnerId = teamAId
        if (totalB > totalA) winnerId = teamBId
      }
      const winA = winnerId === teamAId ? 1 : 0
      const winB = winnerId === teamBId ? 1 : 0
      const sideMap = sideByRoundTeam.get(round)
      rawTeamResults.push({
        id: teamAId,
        r: round,
        win: winA,
        opponents: [teamBId],
        side: sideMap?.get(teamAId) ?? 'gov',
        from_id: submission._id?.toString(),
      })
      rawTeamResults.push({
        id: teamBId,
        r: round,
        win: winB,
        opponents: [teamAId],
        side: sideMap?.get(teamBId) ?? 'opp',
        from_id: submission._id?.toString(),
      })
      teamIdsWithResults.add(teamAId)
      teamIdsWithResults.add(teamBId)

      const selectedSpeakerIdsA = Array.isArray((submission.payload as any)?.speakerIdsA)
        ? ((submission.payload as any).speakerIdsA as any[]).map((id) => String(id)).filter(Boolean)
        : []
      const selectedSpeakerIdsB = Array.isArray((submission.payload as any)?.speakerIdsB)
        ? ((submission.payload as any).speakerIdsB as any[]).map((id) => String(id)).filter(Boolean)
        : []
      const speakersA =
        selectedSpeakerIdsA.length > 0 ? selectedSpeakerIdsA : getSpeakersForTeamRound(teamAId, round)
      const speakersB =
        selectedSpeakerIdsB.length > 0 ? selectedSpeakerIdsB : getSpeakersForTeamRound(teamBId, round)
      const bestA = Array.isArray((submission.payload as any)?.bestA)
        ? ((submission.payload as any).bestA as boolean[])
        : []
      const bestB = Array.isArray((submission.payload as any)?.bestB)
        ? ((submission.payload as any).bestB as boolean[])
        : []
      const poiA = Array.isArray((submission.payload as any)?.poiA)
        ? ((submission.payload as any).poiA as boolean[])
        : []
      const poiB = Array.isArray((submission.payload as any)?.poiB)
        ? ((submission.payload as any).poiB as boolean[])
        : []
      const matterA = Array.isArray((submission.payload as any)?.matterA)
        ? ((submission.payload as any).matterA as number[])
        : []
      const mannerA = Array.isArray((submission.payload as any)?.mannerA)
        ? ((submission.payload as any).mannerA as number[])
        : []
      const matterB = Array.isArray((submission.payload as any)?.matterB)
        ? ((submission.payload as any).matterB as number[])
        : []
      const mannerB = Array.isArray((submission.payload as any)?.mannerB)
        ? ((submission.payload as any).mannerB as number[])
        : []
      speakersA.forEach((speakerId, index) => {
        const score = scoresA[index]
        if (Number.isFinite(score)) {
          const matterValue = matterA[index]
          const mannerValue = mannerA[index]
          rawSpeakerResults.push({
            id: speakerId,
            r: round,
            scores: [score],
            from_id: submission._id?.toString(),
            user_defined_data: {
              best: [{ order: index + 1, value: Boolean(bestA[index]) }],
              poi: [{ order: index + 1, value: Boolean(poiA[index]) }],
              matter:
                typeof matterValue === 'number' && Number.isFinite(matterValue)
                  ? [{ order: index + 1, value: matterValue }]
                  : undefined,
              manner:
                typeof mannerValue === 'number' && Number.isFinite(mannerValue)
                  ? [{ order: index + 1, value: mannerValue }]
                  : undefined,
            },
          })
          speakerIdsWithScores.add(speakerId)
        }
      })
      speakersB.forEach((speakerId, index) => {
        const score = scoresB[index]
        if (Number.isFinite(score)) {
          const matterValue = matterB[index]
          const mannerValue = mannerB[index]
          rawSpeakerResults.push({
            id: speakerId,
            r: round,
            scores: [score],
            from_id: submission._id?.toString(),
            user_defined_data: {
              best: [{ order: index + 1, value: Boolean(bestB[index]) }],
              poi: [{ order: index + 1, value: Boolean(poiB[index]) }],
              matter:
                typeof matterValue === 'number' && Number.isFinite(matterValue)
                  ? [{ order: index + 1, value: matterValue }]
                  : undefined,
              manner:
                typeof mannerValue === 'number' && Number.isFinite(mannerValue)
                  ? [{ order: index + 1, value: mannerValue }]
                  : undefined,
            },
          })
          speakerIdsWithScores.add(speakerId)
        }
      })
    }

    if (submission.type === 'feedback') {
      const payload = (submission.payload ?? {}) as FeedbackPayload
      const adjudicatorId = payload.adjudicatorId
      const score = typeof payload.score === 'number' ? payload.score : Number(payload.score)
      if (!adjudicatorId || !Number.isFinite(score)) return
      const judgedTeams = Array.from(judgedTeamsByRoundAdj.get(`${round}:${adjudicatorId}`) ?? [])
      rawAdjudicatorResults.push({
        id: adjudicatorId,
        r: round,
        score,
        comment: payload.comment,
        judged_teams: judgedTeams,
        from_id: submission._id?.toString(),
        user_defined_data: {
          matter: (submission.payload as any)?.matter,
          manner: (submission.payload as any)?.manner,
        },
      })
      adjudicatorIdsWithScores.add(adjudicatorId)
    }
  })

  const styleOptions = (tournament?.options as any)?.style ?? {}
  const styleDoc =
    typeof tournament?.style === 'number'
      ? await StyleModel.findOne({ id: tournament.style }).lean().exec()
      : null
  const scoreWeights = normalizeScoreWeights(styleOptions.score_weights ?? styleDoc?.score_weights)
  const teamNum = styleOptions.team_num ?? styleDoc?.team_num ?? 2
  const style = { team_num: teamNum, score_weights: scoreWeights }

  const teamInstances = Array.from(teamIdsWithResults).map((teamId) => ({
    id: teamId,
    details: rounds.map((r) => ({ r, speakers: getSpeakersForTeamRound(teamId, r) })),
  }))

  const speakerInstances = Array.from(speakerIdsWithScores).map((id) => ({ id }))
  const adjudicatorInstances = adjudicators
    .filter((adj) => adjudicatorIdsWithScores.has(String(adj._id)))
    .map((adj) => ({ id: String(adj._id) }))

  const compiledTeamResults =
    rawTeamResults.length > 0
      ? coreResults.compileTeamResults(
          teamInstances,
          speakerInstances,
          rawTeamResults,
          rawSpeakerResults,
          rounds,
          style
        )
      : []
  const compiledSpeakerResults =
    rawSpeakerResults.length > 0
      ? coreResults.compileSpeakerResults(speakerInstances, rawSpeakerResults, style, rounds)
      : []
  const compiledAdjudicatorResults =
    rawAdjudicatorResults.length > 0
      ? coreResults.compileAdjudicatorResults(adjudicatorInstances, rawAdjudicatorResults, rounds)
      : []

  const teamMeta = new Map<string, { institutions: string[] }>()
  teams.forEach((team) => {
    const institutions = new Set<string>()
    if (team.institution) institutions.add(String(team.institution))
    team.details?.forEach((detail: any) => {
      ;(detail.institutions ?? []).forEach((inst: string) => {
        if (inst) institutions.add(String(inst))
      })
    })
    teamMeta.set(String(team._id), { institutions: Array.from(institutions) })
  })

  const adjudicatorMeta = new Map<string, { institutions: string[] }>()
  adjudicators.forEach((adj: any) => {
    const institutions = new Set<string>()
    adj.details?.forEach((detail: any) => {
      ;(detail.institutions ?? []).forEach((inst: string) => {
        if (inst) institutions.add(String(inst))
      })
    })
    adjudicatorMeta.set(String(adj._id), { institutions: Array.from(institutions) })
  })

  const adjudicatorStats = new Map<string, { num_experienced: number; num_experienced_chair: number }>()
  filteredDraws.forEach((draw: any) => {
    const drawRound = Number(draw.round)
    if (!Number.isFinite(drawRound) || !selectedRoundSet.has(drawRound)) return
    draw.allocation?.forEach((row: any) => {
      const chairs = (row?.chairs ?? []).map((id: any) => String(id))
      const panels = (row?.panels ?? []).map((id: any) => String(id))
      const trainees = (row?.trainees ?? []).map((id: any) => String(id))
      const all = ([] as string[]).concat(chairs, panels, trainees)
      all.forEach((adjId) => {
        const stats = adjudicatorStats.get(adjId) ?? { num_experienced: 0, num_experienced_chair: 0 }
        stats.num_experienced += 1
        if (chairs.includes(adjId)) stats.num_experienced_chair += 1
        adjudicatorStats.set(adjId, stats)
      })
    })
  })

  const compiled: CompiledPayload = {
    tournamentId,
    rounds: rounds.map((r) => ({ r, name: roundNameMap.get(r) ?? `Round ${r}` })),
    compiled_team_results: compiledTeamResults.map((result: any) => ({
      ...result,
      institutions: teamMeta.get(result.id)?.institutions ?? [],
    })),
    compiled_speaker_results: compiledSpeakerResults.map((result: any) => ({
      ...result,
      teams: speakerMeta.get(result.id)?.teamName ? [speakerMeta.get(result.id)?.teamName] : [],
    })),
    compiled_adjudicator_results: compiledAdjudicatorResults.map((result: any) => ({
      ...result,
      institutions: adjudicatorMeta.get(result.id)?.institutions ?? [],
      num_experienced: adjudicatorStats.get(result.id)?.num_experienced ?? result.active_num ?? 0,
      num_experienced_chair: adjudicatorStats.get(result.id)?.num_experienced_chair ?? 0,
    })),
  }

  return { payload: compiled, connection }
}

async function buildCompiledPayload(
  tournamentId: string,
  source: 'submissions' | 'raw' | undefined,
  requestedRounds?: number[]
): Promise<{ payload: CompiledPayload; connection: Connection }> {
  return source === 'raw'
    ? buildCompiledPayloadFromRaw(tournamentId, requestedRounds)
    : buildCompiledPayloadFromSubmissions(tournamentId, requestedRounds)
}

function toCompiledSubset(doc: any, key: CompiledResultsKey): CompiledSubset {
  const payload = doc?.payload ?? doc ?? {}
  const tournamentId = payload.tournamentId ?? doc?.tournamentId ?? ''
  return {
    compiledId: String(doc?._id ?? payload._id ?? ''),
    tournamentId: String(tournamentId),
    rounds: Array.isArray(payload.rounds) ? payload.rounds : [],
    results: Array.isArray(payload[key]) ? payload[key] : [],
  }
}

const makeListCompiled =
  (key: CompiledResultsKey): RequestHandler =>
  async (req, res, next) => {
    try {
      const { tournamentId, latest } = req.query as { tournamentId?: string; latest?: string }
      if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
        res
          .status(400)
          .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
        return
      }

      const connection = await getTournamentConnection(tournamentId)
      const CompiledModel = getCompiledModel(connection)
      const isAdmin = await hasTournamentAdminAccess(req, tournamentId)

      if (latest === 'true' || latest === '1') {
        const compiled = await CompiledModel.findOne({ tournamentId })
          .sort({ createdAt: -1 })
          .lean()
          .exec()
        if (!compiled) {
          res.json({ data: null, errors: [] })
          return
        }
        const subset = toCompiledSubset(compiled, key)
        res.json({
          data: isAdmin ? subset : sanitizeCompiledSubsetForPublic(subset),
          errors: [],
        })
        return
      }

      const compiled = await CompiledModel.find({ tournamentId })
        .sort({ createdAt: -1 })
        .lean()
        .exec()
      const subsets = compiled.map((doc) => toCompiledSubset(doc, key))
      res.json({
        data: isAdmin ? subsets : subsets.map((subset) => sanitizeCompiledSubsetForPublic(subset)),
        errors: [],
      })
    } catch (err) {
      next(err)
    }
  }

const makeCreateCompiled =
  (key: CompiledResultsKey): RequestHandler =>
  async (req, res, next) => {
    try {
      const { tournamentId, source, rounds: requestedRounds } = req.body as {
        tournamentId: string
        source?: 'submissions' | 'raw'
        rounds?: number[]
      }
      if (!Types.ObjectId.isValid(tournamentId)) {
        res
          .status(400)
          .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
        return
      }

      const { payload, connection } = await buildCompiledPayload(
        tournamentId,
        source,
        requestedRounds
      )
      const CompiledModel = getCompiledModel(connection)
      const created = await CompiledModel.create({
        tournamentId,
        payload,
        createdBy: req.session?.userId,
      })
      const createdJson = created.toJSON()
      res.status(201).json({ data: toCompiledSubset(createdJson, key), errors: [] })
    } catch (err) {
      if ((err as any)?.status === 404) {
        res
          .status(404)
          .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
        return
      }
      next(err)
    }
  }

export const listCompiledTeams: RequestHandler = makeListCompiled('compiled_team_results')
export const listCompiledSpeakers: RequestHandler = makeListCompiled('compiled_speaker_results')
export const listCompiledAdjudicators: RequestHandler = makeListCompiled('compiled_adjudicator_results')

export const createCompiledTeams: RequestHandler = makeCreateCompiled('compiled_team_results')
export const createCompiledSpeakers: RequestHandler = makeCreateCompiled('compiled_speaker_results')
export const createCompiledAdjudicators: RequestHandler = makeCreateCompiled('compiled_adjudicator_results')

export const listCompiled: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, latest } = req.query as { tournamentId?: string; latest?: string }
    if (!tournamentId || !Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const connection = await getTournamentConnection(tournamentId)
    const CompiledModel = getCompiledModel(connection)
    const isAdmin = await hasTournamentAdminAccess(req, tournamentId)

    if (latest === 'true' || latest === '1') {
      const compiled = await CompiledModel.findOne({ tournamentId })
        .sort({ createdAt: -1 })
        .lean()
        .exec()
      if (!compiled) {
        res.json({ data: null, errors: [] })
        return
      }
      res.json({ data: isAdmin ? compiled : sanitizeCompiledForPublic(compiled), errors: [] })
      return
    }

    const compiled = await CompiledModel.find({ tournamentId })
      .sort({ createdAt: -1 })
      .lean()
      .exec()
    res.json({
      data: isAdmin ? compiled : compiled.map((doc) => sanitizeCompiledForPublic(doc)),
      errors: [],
    })
  } catch (err) {
    next(err)
  }
}

export const createCompiled: RequestHandler = async (req, res, next) => {
  try {
    const { tournamentId, source, rounds: requestedRounds } = req.body as {
      tournamentId: string
      source?: 'submissions' | 'raw'
      rounds?: number[]
    }
    if (!Types.ObjectId.isValid(tournamentId)) {
      res
        .status(400)
        .json({ data: null, errors: [{ name: 'BadRequest', message: 'Invalid tournament id' }] })
      return
    }

    const { payload, connection } = await buildCompiledPayload(
      tournamentId,
      source,
      requestedRounds
    )
    const CompiledModel = getCompiledModel(connection)
    const created = await CompiledModel.create({
      tournamentId,
      payload,
      createdBy: req.session?.userId,
    })
    res.status(201).json({ data: created.toJSON(), errors: [] })
  } catch (err) {
    if ((err as any)?.status === 404) {
      res
        .status(404)
        .json({ data: null, errors: [{ name: 'NotFound', message: 'Tournament not found' }] })
      return
    }
    next(err)
  }
}
