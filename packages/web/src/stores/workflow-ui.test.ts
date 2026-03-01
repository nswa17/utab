import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '@/utils/api'
import { buildEntityImportPayload, type EntityImportType } from '@/utils/entity-csv-import'
import { useTournamentStore } from './tournament'
import { useRoundsStore } from './rounds'
import { useSpeakersStore } from './speakers'
import { useTeamsStore } from './teams'
import { useAdjudicatorsStore } from './adjudicators'
import { useDrawsStore } from './draws'
import { useSubmissionsStore } from './submissions'
import { useCompiledStore } from './compiled'

type MockedApi = {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

type AnyRow = Record<string, any>

type BreakParticipant = {
  teamId: string
  seed: number
}

type BackendState = {
  tournaments: AnyRow[]
  rounds: AnyRow[]
  speakers: AnyRow[]
  teams: AnyRow[]
  adjudicators: AnyRow[]
  draws: AnyRow[]
  submissions: AnyRow[]
  compiledSnapshots: AnyRow[]
}

const mockedApi = api as unknown as MockedApi

const PRESET = {
  tournamentName: '春季プレセット杯',
  round1Name: '予選第1ラウンド',
  round2Name: 'ブレイク決勝',
  speakersCsv: `name
青木 遥
伊藤 湊
佐々木 凛
高橋 陽`,
  teamsCsv: `name,speakers,available_r1,available_r2
桜高校A,青木 遥,true,true
楓高校B,伊藤 湊,true,true
梅高校C,佐々木 凛,true,false
松高校D,高橋 陽,true,false`,
  adjudicatorsCsv: `name,strength,preev,available_r1,available_r2
田中ジャッジ,7,4,true,true
鈴木ジャッジ,6,3,true,true`,
  expectedOrder: ['桜高校A', '楓高校B', '梅高校C', '松高校D'],
}

function ok<T>(data: T) {
  return Promise.resolve({ data: { data } })
}

function toArray(payload: unknown): AnyRow[] {
  if (Array.isArray(payload)) return payload as AnyRow[]
  if (payload && typeof payload === 'object') return [payload as AnyRow]
  return []
}

function asNumberArray(values: unknown): number[] {
  if (!Array.isArray(values)) return []
  return values.map((value) => Number(value)).filter((value) => Number.isFinite(value))
}

function createBackend() {
  let seq = 1
  const state: BackendState = {
    tournaments: [],
    rounds: [],
    speakers: [],
    teams: [],
    adjudicators: [],
    draws: [],
    submissions: [],
    compiledSnapshots: [],
  }

  const nextId = (prefix: string) => `${prefix}-${seq++}`

  function compileTeamResults(tournamentId: string): AnyRow[] {
    const teams = state.teams.filter((row) => String(row.tournamentId) === String(tournamentId))
    const stats = new Map(
      teams.map((team) => [
        team._id,
        {
          id: team._id,
          name: team.name,
          win: 0,
          sum: 0,
          ranking: 0,
        },
      ])
    )

    const ballots = state.submissions.filter(
      (row) =>
        String(row.tournamentId) === String(tournamentId) &&
        String(row.type) === 'ballot'
    )
    ballots.forEach((row) => {
      const payload = row.payload ?? {}
      const teamAId = String(payload.teamAId ?? '')
      const teamBId = String(payload.teamBId ?? '')
      if (!stats.has(teamAId) || !stats.has(teamBId)) return
      const teamA = stats.get(teamAId)
      const teamB = stats.get(teamBId)
      if (!teamA || !teamB) return

      const scoreA = asNumberArray(payload.scoresA).reduce((sum, value) => sum + value, 0)
      const scoreB = asNumberArray(payload.scoresB).reduce((sum, value) => sum + value, 0)
      teamA.sum += scoreA
      teamB.sum += scoreB

      if (payload.draw === true) {
        teamA.win += 0.5
        teamB.win += 0.5
        return
      }
      const winnerId = String(payload.winnerId ?? '')
      if (winnerId && stats.has(winnerId)) {
        const winner = stats.get(winnerId)
        if (winner) winner.win += 1
      }
    })

    const results = Array.from(stats.values()).sort((left, right) => {
      if (right.win !== left.win) return right.win - left.win
      if (right.sum !== left.sum) return right.sum - left.sum
      return String(left.name).localeCompare(String(right.name), 'ja')
    })

    results.forEach((row, index) => {
      if (index === 0) {
        row.ranking = 1
        return
      }
      const prev = results[index - 1]
      row.ranking =
        row.win === prev.win && row.sum === prev.sum
          ? prev.ranking
          : index + 1
    })
    return results
  }

  function buildCompiledPayload(tournamentId: string, options?: AnyRow) {
    const rounds = state.rounds
      .filter((row) => String(row.tournamentId) === String(tournamentId))
      .sort((left, right) => Number(left.round) - Number(right.round))
      .map((row) => ({ r: row.round, name: row.name }))
    return {
      compile_source: 'submissions',
      rounds,
      compiled_team_results: compileTeamResults(tournamentId),
      compiled_speaker_results: [],
      compiled_adjudicator_results: [],
      compile_options: options ?? {},
    }
  }

  function listByTournament(
    list: AnyRow[],
    params?: Record<string, unknown>
  ): AnyRow[] {
    const tournamentId = String(params?.tournamentId ?? '')
    if (!tournamentId) return []
    return list.filter((row) => String(row.tournamentId) === tournamentId)
  }

  function get(path: string, config?: { params?: Record<string, unknown> }) {
    const params = config?.params ?? {}
    if (path === '/styles') {
      return ok([{ id: 1, name: 'BP' }])
    }
    if (path === '/speakers') {
      return ok(listByTournament(state.speakers, params))
    }
    if (path === '/teams') {
      return ok(listByTournament(state.teams, params))
    }
    if (path === '/adjudicators') {
      return ok(listByTournament(state.adjudicators, params))
    }
    if (path === '/draws') {
      const filtered = listByTournament(state.draws, params)
      const round = Number(params.round)
      const rows = Number.isInteger(round)
        ? filtered.filter((row) => Number(row.round) === round)
        : filtered
      return ok(rows)
    }
    if (path === '/rounds') {
      return ok(listByTournament(state.rounds, params))
    }
    if (path === '/submissions') {
      const filtered = listByTournament(state.submissions, params)
      const round = Number(params.round)
      const type = String(params.type ?? '')
      const rows = filtered.filter((row) => {
        if (Number.isInteger(round) && Number(row.round) !== round) return false
        if (type && String(row.type) !== type) return false
        return true
      })
      return ok(rows)
    }
    if (path === '/compiled') {
      const filtered = listByTournament(state.compiledSnapshots, params)
      const latest = String(params.latest ?? '') === '1'
      if (latest) {
        return ok(filtered[filtered.length - 1] ?? null)
      }
      return ok(filtered)
    }
    return Promise.reject(new Error(`Unhandled GET endpoint in test backend: ${path}`))
  }

  function post(path: string, payload?: AnyRow) {
    if (path === '/tournaments') {
      const created = {
        _id: nextId('tournament'),
        ...(payload ?? {}),
      }
      state.tournaments.push(created)
      return ok(created)
    }

    if (path === '/rounds') {
      const created = {
        _id: nextId('round'),
        ...(payload ?? {}),
        userDefinedData: payload?.userDefinedData ?? {},
      }
      state.rounds.push(created)
      return ok(created)
    }

    if (path === '/speakers') {
      const created = toArray(payload).map((row) => ({
        _id: nextId('speaker'),
        ...row,
      }))
      state.speakers.push(...created)
      return ok(Array.isArray(payload) ? created : created[0] ?? null)
    }

    if (path === '/teams') {
      const created = toArray(payload).map((row) => ({
        _id: nextId('team'),
        ...row,
      }))
      state.teams.push(...created)
      return ok(Array.isArray(payload) ? created : created[0] ?? null)
    }

    if (path === '/adjudicators') {
      const created = toArray(payload).map((row) => ({
        _id: nextId('adjudicator'),
        ...row,
      }))
      state.adjudicators.push(...created)
      return ok(Array.isArray(payload) ? created : created[0] ?? null)
    }

    if (path === '/draws') {
      const tournamentId = String(payload?.tournamentId ?? '')
      const round = Number(payload?.round)
      const index = state.draws.findIndex(
        (row) =>
          String(row.tournamentId) === tournamentId &&
          Number(row.round) === round
      )
      const updated = {
        _id: index >= 0 ? state.draws[index]._id : nextId('draw'),
        ...(payload ?? {}),
      }
      if (index >= 0) {
        state.draws.splice(index, 1, updated)
      } else {
        state.draws.push(updated)
      }
      return ok(updated)
    }

    if (path === '/submissions/ballots') {
      const created = {
        _id: nextId('submission'),
        tournamentId: payload?.tournamentId,
        round: payload?.round,
        type: 'ballot',
        payload: payload ?? {},
      }
      state.submissions.push(created)
      return ok(created)
    }

    if (path === '/submissions/feedback') {
      const created = {
        _id: nextId('submission'),
        tournamentId: payload?.tournamentId,
        round: payload?.round,
        type: 'feedback',
        payload: payload ?? {},
      }
      state.submissions.push(created)
      return ok(created)
    }

    if (path === '/allocations/break') {
      const tournamentId = String(payload?.tournamentId ?? '')
      const round = Number(payload?.round)
      const targetRound = state.rounds.find(
        (row) =>
          String(row.tournamentId) === tournamentId &&
          Number(row.round) === round
      )
      const participantsRaw = targetRound?.userDefinedData?.break?.participants
      const participants = Array.isArray(participantsRaw)
        ? [...(participantsRaw as BreakParticipant[])].sort((left, right) => left.seed - right.seed)
        : []
      const allocation =
        participants.length >= 2
          ? [
              {
                venue: '',
                teams: {
                  gov: participants[0].teamId,
                  opp: participants[participants.length - 1].teamId,
                },
                chairs: [],
                panels: [],
                trainees: [],
              },
            ]
          : []
      return ok({
        allocation,
        userDefinedData: {
          break: {
            stage_participants: participants,
          },
        },
      })
    }

    if (path === '/compiled') {
      const tournamentId = String(payload?.tournamentId ?? '')
      const snapshot = {
        _id: nextId('compiled'),
        tournamentId,
        createdAt: '2026-02-27T20:30:00.000Z',
        payload: buildCompiledPayload(tournamentId, payload?.options),
      }
      state.compiledSnapshots.push(snapshot)
      return ok(snapshot)
    }

    if (path === '/compiled/teams') {
      const tournamentId = String(payload?.tournamentId ?? '')
      const compiled = buildCompiledPayload(tournamentId, payload?.options)
      return ok({
        compile_source: compiled.compile_source,
        rounds: compiled.rounds,
        results: compiled.compiled_team_results,
      })
    }

    return Promise.reject(new Error(`Unhandled POST endpoint in test backend: ${path}`))
  }

  function patch(path: string, payload?: AnyRow) {
    const breakMatch = path.match(/^\/rounds\/([^/]+)\/break$/)
    if (breakMatch) {
      const roundId = breakMatch[1]
      const index = state.rounds.findIndex((row) => String(row._id) === roundId)
      if (index < 0) {
        return Promise.reject(new Error('Round not found'))
      }
      const current = state.rounds[index]
      const nextRound = {
        ...current,
        userDefinedData: {
          ...(current.userDefinedData ?? {}),
          break_round: Boolean(payload?.break?.enabled),
          break: {
            ...(payload?.break ?? {}),
            participants: Array.isArray(payload?.break?.participants)
              ? payload.break.participants
              : [],
          },
        },
      }
      state.rounds.splice(index, 1, nextRound)
      return ok({
        round: nextRound,
        break: nextRound.userDefinedData.break,
      })
    }
    return Promise.reject(new Error(`Unhandled PATCH endpoint in test backend: ${path}`))
  }

  function remove(path: string) {
    return Promise.reject(new Error(`Unhandled DELETE endpoint in test backend: ${path}`))
  }

  return { state, get, post, patch, remove }
}

describe('admin workflow UI integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
    mockedApi.post.mockReset()
    mockedApi.patch.mockReset()
    mockedApi.delete.mockReset()

    const backend = createBackend()
    mockedApi.get.mockImplementation((path: string, config?: { params?: Record<string, unknown> }) =>
      backend.get(path, config)
    )
    mockedApi.post.mockImplementation((path: string, payload?: AnyRow) => backend.post(path, payload))
    mockedApi.patch.mockImplementation((path: string, payload?: AnyRow) => backend.patch(path, payload))
    mockedApi.delete.mockImplementation((path: string) => backend.remove(path))
  })

  it('runs a UI-like preset flow from CSV import to break final and verifies expected standings', async () => {
    const tournamentStore = useTournamentStore()
    const roundsStore = useRoundsStore()
    const speakersStore = useSpeakersStore()
    const teamsStore = useTeamsStore()
    const adjudicatorsStore = useAdjudicatorsStore()
    const drawsStore = useDrawsStore()
    const submissionsStore = useSubmissionsStore()
    const compiledStore = useCompiledStore()

    const createdTournament = await tournamentStore.createTournament({
      name: PRESET.tournamentName,
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 2,
    })
    expect(createdTournament?._id).toBeTruthy()
    const tournamentId = String(createdTournament?._id)

    const round1 = await roundsStore.createRound({
      tournamentId,
      round: 1,
      name: PRESET.round1Name,
    })
    const round2 = await roundsStore.createRound({
      tournamentId,
      round: 2,
      name: PRESET.round2Name,
    })
    expect(round1?._id).toBeTruthy()
    expect(round2?._id).toBeTruthy()

    const parseAndImport = async (
      type: EntityImportType,
      text: string,
      endpoint: string
    ) => {
      const { payload, errors } = buildEntityImportPayload({
        type,
        text,
        tournamentId,
        roundNumbers: [1, 2],
        teams: teamsStore.teams.map((row) => ({ _id: row._id, name: row.name })),
        speakers: speakersStore.speakers.map((row) => ({ _id: row._id, name: row.name })),
        institutions: [],
        institutionCategoryLabel: (value) => value ?? 'institution',
        institutionPriorityValue: (value) => value ?? 1,
      })
      expect(errors).toEqual([])
      expect(payload.length).toBeGreaterThan(0)
      const res = await mockedApi.post(endpoint, payload)
      return res.data.data
    }

    await parseAndImport('speakers', PRESET.speakersCsv, '/speakers')
    await speakersStore.fetchSpeakers(tournamentId)
    expect(speakersStore.speakers).toHaveLength(4)

    await parseAndImport('teams', PRESET.teamsCsv, '/teams')
    await teamsStore.fetchTeams(tournamentId)
    expect(teamsStore.teams).toHaveLength(4)

    await parseAndImport('adjudicators', PRESET.adjudicatorsCsv, '/adjudicators')
    await adjudicatorsStore.fetchAdjudicators(tournamentId)
    expect(adjudicatorsStore.adjudicators).toHaveLength(2)

    const teamIdByName = new Map(teamsStore.teams.map((row) => [row.name, row._id]))
    const speakerIdByName = new Map(speakersStore.speakers.map((row) => [row.name, row._id]))
    const adjudicatorIdByName = new Map(adjudicatorsStore.adjudicators.map((row) => [row.name, row._id]))
    const speakerIdByTeamId = new Map<string, string>([
      [String(teamIdByName.get('桜高校A')), String(speakerIdByName.get('青木 遥'))],
      [String(teamIdByName.get('楓高校B')), String(speakerIdByName.get('伊藤 湊'))],
      [String(teamIdByName.get('梅高校C')), String(speakerIdByName.get('佐々木 凛'))],
      [String(teamIdByName.get('松高校D')), String(speakerIdByName.get('高橋 陽'))],
    ])

    const saveBreakRes = await roundsStore.saveBreakRound({
      tournamentId,
      roundId: String(round2?._id),
      breakConfig: {
        enabled: true,
        source_rounds: [1],
        size: 2,
        cutoff_tie_policy: 'manual',
        seeding: 'high_low',
        participants: [
          { teamId: String(teamIdByName.get('桜高校A')), seed: 1 },
          { teamId: String(teamIdByName.get('楓高校B')), seed: 2 },
        ],
      },
      syncTeamAvailability: true,
    })
    expect(saveBreakRes?.break?.participants).toHaveLength(2)

    const prelimDraw = await drawsStore.upsertDraw({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: 'A会場',
          teams: {
            gov: String(teamIdByName.get('桜高校A')),
            opp: String(teamIdByName.get('梅高校C')),
          },
          chairs: [String(adjudicatorIdByName.get('田中ジャッジ'))],
          panels: [],
          trainees: [],
        },
        {
          venue: 'B会場',
          teams: {
            gov: String(teamIdByName.get('楓高校B')),
            opp: String(teamIdByName.get('松高校D')),
          },
          chairs: [String(adjudicatorIdByName.get('鈴木ジャッジ'))],
          panels: [],
          trainees: [],
        },
      ],
      drawOpened: true,
      allocationOpened: true,
    })
    expect(prelimDraw?._id).toBeTruthy()

    const r1BallotA = await submissionsStore.submitBallot({
      tournamentId,
      round: 1,
      teamAId: String(teamIdByName.get('桜高校A')),
      teamBId: String(teamIdByName.get('梅高校C')),
      winnerId: String(teamIdByName.get('桜高校A')),
      speakerIdsA: [String(speakerIdByTeamId.get(String(teamIdByName.get('桜高校A'))))],
      speakerIdsB: [String(speakerIdByTeamId.get(String(teamIdByName.get('梅高校C'))))],
      scoresA: [78],
      scoresB: [74],
      submittedEntityId: String(adjudicatorIdByName.get('田中ジャッジ')),
    })
    const r1BallotB = await submissionsStore.submitBallot({
      tournamentId,
      round: 1,
      teamAId: String(teamIdByName.get('楓高校B')),
      teamBId: String(teamIdByName.get('松高校D')),
      winnerId: String(teamIdByName.get('楓高校B')),
      speakerIdsA: [String(speakerIdByTeamId.get(String(teamIdByName.get('楓高校B'))))],
      speakerIdsB: [String(speakerIdByTeamId.get(String(teamIdByName.get('松高校D'))))],
      scoresA: [76],
      scoresB: [73],
      submittedEntityId: String(adjudicatorIdByName.get('鈴木ジャッジ')),
    })
    expect(r1BallotA?._id).toBeTruthy()
    expect(r1BallotB?._id).toBeTruthy()

    const round1Ballots = await submissionsStore.fetchSubmissions({
      tournamentId,
      type: 'ballot',
      round: 1,
    })
    expect(round1Ballots).toHaveLength(2)
    expect(
      round1Ballots.map((row: AnyRow) => row.payload.winnerId)
    ).toEqual(
      expect.arrayContaining([
        String(teamIdByName.get('桜高校A')),
        String(teamIdByName.get('楓高校B')),
      ])
    )

    const breakAllocationRes = await mockedApi.post('/allocations/break', {
      tournamentId,
      round: 2,
    })
    const breakAllocation = breakAllocationRes.data.data.allocation as AnyRow[]
    expect(breakAllocation).toHaveLength(1)

    const breakDraw = await drawsStore.upsertDraw({
      tournamentId,
      round: 2,
      allocation: breakAllocation.map((square) => ({
        ...square,
        chairs: [String(adjudicatorIdByName.get('田中ジャッジ'))],
      })),
      userDefinedData: breakAllocationRes.data.data.userDefinedData,
      drawOpened: true,
      allocationOpened: true,
    })
    expect(breakDraw?.allocation).toHaveLength(1)

    const finalMatch = (breakDraw?.allocation ?? [])[0] as AnyRow
    const championId = String(teamIdByName.get('桜高校A'))
    const finalBallot = await submissionsStore.submitBallot({
      tournamentId,
      round: 2,
      teamAId: String(finalMatch.teams?.gov),
      teamBId: String(finalMatch.teams?.opp),
      winnerId: championId,
      speakerIdsA: [String(speakerIdByTeamId.get(String(finalMatch.teams?.gov)))],
      speakerIdsB: [String(speakerIdByTeamId.get(String(finalMatch.teams?.opp)))],
      scoresA: [String(finalMatch.teams?.gov) === championId ? 79 : 77],
      scoresB: [String(finalMatch.teams?.opp) === championId ? 79 : 77],
      submittedEntityId: String(adjudicatorIdByName.get('田中ジャッジ')),
    })
    expect(finalBallot?._id).toBeTruthy()

    const compiled = await compiledStore.runCompile(tournamentId, {
      source: 'submissions',
      rounds: [1, 2],
      options: { include_labels: ['teams'] },
    })
    expect(compiled?._id).toBeTruthy()
    const compiledTeams = (compiled?.compiled_team_results ?? []) as AnyRow[]
    expect(compiledTeams.map((row) => row.name)).toEqual(PRESET.expectedOrder)
    expect(compiledTeams[0]?.win).toBe(2)
    expect(compiledTeams[1]?.win).toBe(1)
    expect(compiledTeams[2]?.win).toBe(0)
    expect(compiledTeams[3]?.win).toBe(0)

    const latest = await compiledStore.fetchLatest(tournamentId)
    expect(latest?._id).toBe(compiled?._id)

    const teamReportRes = await mockedApi.post('/compiled/teams', {
      tournamentId,
      source: 'submissions',
      rounds: [1, 2],
    })
    const teamReport = teamReportRes.data.data
    expect(teamReport.results.map((row: AnyRow) => row.name)).toEqual(PRESET.expectedOrder)
    expect(teamReport.rounds.map((row: AnyRow) => row.name)).toEqual([
      PRESET.round1Name,
      PRESET.round2Name,
    ])
  })
})
