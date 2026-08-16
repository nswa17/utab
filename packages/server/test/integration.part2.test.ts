import request from 'supertest'
import { Types } from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createServer, type Server } from 'node:http'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { TournamentMemberModel } from '../src/models/tournament-member.js'
import { TournamentModel } from '../src/models/tournament.js'
import { UserModel } from '../src/models/user.js'
import { hashPassword, verifyPassword } from '../src/services/hash.service.js'

let app: Server
let mongo: MongoMemoryServer
let connectDatabase: typeof import('../src/config/database.js').connectDatabase
let disconnectDatabase: typeof import('../src/config/database.js').disconnectDatabase
let closeTournamentConnections: typeof import('../src/services/tournament-db.service.js').closeTournamentConnections

async function waitForResult<T>(
  fetcher: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 3000,
  intervalMs = 50
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let lastValue: T | undefined
  let hasValue = false
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const current = await fetcher()
      lastValue = current
      hasValue = true
      lastError = undefined
      if (predicate(current)) {
        return current
      }
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  if (hasValue && lastValue !== undefined) {
    return lastValue
  }
  throw lastError ?? new Error('waitForResult timed out without a successful response')
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({
    instance: { ip: '127.0.0.1', launchTimeout: 6000000 },
  })

  process.env.NODE_ENV = 'test'
  process.env.PORT = '0'
  process.env.MONGODB_URI = mongo.getUri('utab-test')
  process.env.SESSION_SECRET = 'test-session-secret-123456'
  process.env.CORS_ORIGIN = 'http://localhost'
  process.env.UTAB_LOG_LEVEL = 'silent'
  ;({ connectDatabase, disconnectDatabase } = await import('../src/config/database.js'))
  ;({ closeTournamentConnections } = await import('../src/services/tournament-db.service.js'))
  await connectDatabase()

  const mod = await import('../src/app.js')
  app = createServer(mod.createApp())
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      app.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      app.off('error', onError)
      resolve()
    }
    app.once('error', onError)
    app.once('listening', onListening)
    app.listen(0, '127.0.0.1')
  })
})

afterAll(async () => {
  if (app?.listening) {
    await new Promise<void>((resolve, reject) => {
      app.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }
  if (closeTournamentConnections) {
    await closeTournamentConnections()
  }
  if (disconnectDatabase) {
    await disconnectDatabase()
  }
  if (mongo) {
    await mongo.stop()
  }
})

describe('Server integration', () => {
  it('supports bulk entity operations and raw result cleanup', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'bulk-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'bulk-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Bulk Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const bulkTeamsRes = await agent.post('/api/teams').send([
      { tournamentId, name: 'Bulk Team 1' },
      { tournamentId, name: 'Bulk Team 2' },
    ])
    expect(bulkTeamsRes.status).toBe(201)
    expect(bulkTeamsRes.body.data.length).toBe(2)

    const [teamA, teamB] = bulkTeamsRes.body.data
    const updateRes = await agent.patch('/api/teams').send([
      { id: teamA._id, tournamentId, userDefinedData: { flag: true } },
      { id: teamB._id, tournamentId, name: 'Bulk Team 2 Updated' },
    ])
    expect(updateRes.status).toBe(200)

    const deleteRes = await agent.delete(`/api/teams?tournamentId=${tournamentId}&ids=${teamA._id}`)
    expect(deleteRes.status).toBe(200)
    expect(deleteRes.body.data.deletedCount).toBe(1)

    const extraTeamRes = await agent.post('/api/teams').send({ tournamentId, name: 'Bulk Team 3' })
    expect(extraTeamRes.status).toBe(201)
    const teamC = extraTeamRes.body.data._id

    const rawRes = await agent.post('/api/raw-results/teams').send({
      tournamentId,
      id: teamB._id,
      from_id: 'bulk-seed',
      r: 1,
      weight: 1,
      win: 1,
      side: 'gov',
      opponents: [teamC],
    })
    expect(rawRes.status).toBe(201)

    const deleteRawRes = await agent.delete(`/api/raw-results/teams?tournamentId=${tournamentId}`)
    expect(deleteRawRes.status).toBe(200)
    expect(deleteRawRes.body.data.deletedCount).toBeGreaterThan(0)
  })

  it('rejects invalid or empty bulk entity ids without mutating teams', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'bulk-guard-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'bulk-guard-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Bulk Guard Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const bulkTeamsRes = await agent.post('/api/teams').send([
      { tournamentId, name: 'Guard Team 1' },
      { tournamentId, name: 'Guard Team 2' },
    ])
    expect(bulkTeamsRes.status).toBe(201)

    const invalidUpdateRes = await agent
      .patch('/api/teams')
      .send([{ id: 'not-an-object-id', tournamentId, name: 'Should Fail' }])
    expect(invalidUpdateRes.status).toBe(400)
    expect(invalidUpdateRes.body.errors[0].message).toBe('Invalid team id')

    const emptyDeleteRes = await agent.delete(`/api/teams?tournamentId=${tournamentId}&ids=`)
    expect(emptyDeleteRes.status).toBe(400)
    expect(emptyDeleteRes.body.errors[0].message).toBe('Bulk delete ids are required')

    const invalidDeleteRes = await agent.delete(
      `/api/teams?tournamentId=${tournamentId}&ids=not-an-object-id`
    )
    expect(invalidDeleteRes.status).toBe(400)
    expect(invalidDeleteRes.body.errors[0].message).toBe('Invalid team id')

    const listRes = await agent.get(`/api/teams?tournamentId=${tournamentId}`)
    expect(listRes.status).toBe(200)
    expect(listRes.body.data).toHaveLength(2)
  })

  it('does not resolve an entity through a different tournament id', async () => {
    const agent = request.agent(app)
    const registerRes = await agent.post('/api/auth/register').send({
      username: 'cross-tournament-entity-guard',
      password: 'password123',
      role: 'organizer',
    })
    expect(registerRes.status).toBe(201)
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'cross-tournament-entity-guard', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentARes = await agent
      .post('/api/tournaments')
      .send({ name: 'Entity Guard Open A', style: 1, options: {} })
    const tournamentBRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Entity Guard Open B', style: 1, options: {} })
    expect(tournamentARes.status).toBe(201)
    expect(tournamentBRes.status).toBe(201)
    const tournamentAId = String(tournamentARes.body.data._id)
    const tournamentBId = String(tournamentBRes.body.data._id)

    const teamRes = await agent
      .post('/api/teams')
      .send({ tournamentId: tournamentBId, name: 'Tournament B Team' })
    expect(teamRes.status).toBe(201)

    const mismatchedGetRes = await agent.get(
      `/api/teams/${teamRes.body.data._id}?tournamentId=${tournamentAId}`
    )
    expect(mismatchedGetRes.status).toBe(404)
  })

  it('rejects empty or invalid bulk round ids without deleting rounds', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'round-bulk-guard-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'round-bulk-guard-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Round Bulk Guard Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const round1Res = await agent.post('/api/rounds').send({ tournamentId, round: 1, name: 'R1' })
    const round2Res = await agent.post('/api/rounds').send({ tournamentId, round: 2, name: 'R2' })
    expect(round1Res.status).toBe(201)
    expect(round2Res.status).toBe(201)

    const emptyDeleteRes = await agent.delete(`/api/rounds?tournamentId=${tournamentId}&ids=`)
    expect(emptyDeleteRes.status).toBe(400)
    expect(emptyDeleteRes.body.errors[0].message).toBe('Bulk delete ids are required')

    const invalidDeleteRes = await agent.delete(
      `/api/rounds?tournamentId=${tournamentId}&ids=not-an-object-id`
    )
    expect(invalidDeleteRes.status).toBe(400)
    expect(invalidDeleteRes.body.errors[0].message).toBe('Invalid round id')

    const roundsRes = await agent.get(`/api/rounds?tournamentId=${tournamentId}`)
    expect(roundsRes.status).toBe(200)
    expect(roundsRes.body.data).toHaveLength(2)
  })

  it('maps duplicate entity rename conflicts to 409 for update and bulk update', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'duplicate-update-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'duplicate-update-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Duplicate Update Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const teamARes = await agent.post('/api/teams').send({ tournamentId, name: 'Conflict Team A' })
    const teamBRes = await agent.post('/api/teams').send({ tournamentId, name: 'Conflict Team B' })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)

    const singleUpdateRes = await agent.patch(`/api/teams/${teamBRes.body.data._id}`).send({
      tournamentId,
      name: 'Conflict Team A',
    })
    expect(singleUpdateRes.status).toBe(409)
    expect(singleUpdateRes.body.errors[0].message).toBe('Team name already exists')

    const bulkUpdateRes = await agent.patch('/api/teams').send([
      {
        id: teamBRes.body.data._id,
        tournamentId,
        name: 'Conflict Team A',
      },
    ])
    expect(bulkUpdateRes.status).toBe(409)
    expect(bulkUpdateRes.body.errors[0].message).toBe('Team name already exists')

    const bulkCreateRes = await agent.post('/api/teams').send([
      { tournamentId, name: 'Would Partially Create' },
      { tournamentId, name: 'Conflict Team A' },
    ])
    expect(bulkCreateRes.status).toBe(409)

    const partialBulkUpdateRes = await agent.patch('/api/teams').send([
      {
        id: teamARes.body.data._id,
        tournamentId,
        name: 'Would Partially Rename',
      },
      {
        id: teamBRes.body.data._id,
        tournamentId,
        name: 'Would Partially Rename',
      },
    ])
    expect(partialBulkUpdateRes.status).toBe(409)

    const swapNamesRes = await agent.patch('/api/teams').send([
      {
        id: teamARes.body.data._id,
        tournamentId,
        name: 'Conflict Team B',
      },
      {
        id: teamBRes.body.data._id,
        tournamentId,
        name: 'Conflict Team A',
      },
    ])
    expect(swapNamesRes.status).toBe(200)
    const swappedNamesById = new Map(
      swapNamesRes.body.data.map((team: any) => [String(team._id), team.name])
    )
    expect(swappedNamesById.get(String(teamARes.body.data._id))).toBe('Conflict Team B')
    expect(swappedNamesById.get(String(teamBRes.body.data._id))).toBe('Conflict Team A')

    const teamsRes = await agent.get(`/api/teams?tournamentId=${tournamentId}`)
    expect(teamsRes.status).toBe(200)
    expect(teamsRes.body.data.map((team: any) => team.name).sort()).toEqual([
      'Conflict Team A',
      'Conflict Team B',
    ])
  })

  it('maps duplicate round renumber conflicts to 409 for update and bulk update', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'duplicate-round-update-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'duplicate-round-update-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Duplicate Round Update Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const round1Res = await agent.post('/api/rounds').send({ tournamentId, round: 1, name: 'R1' })
    const round2Res = await agent.post('/api/rounds').send({ tournamentId, round: 2, name: 'R2' })
    expect(round1Res.status).toBe(201)
    expect(round2Res.status).toBe(201)

    const singleUpdateRes = await agent.patch(`/api/rounds/${round2Res.body.data._id}`).send({
      tournamentId,
      round: 1,
    })
    expect(singleUpdateRes.status).toBe(409)
    expect(singleUpdateRes.body.errors[0].message).toBe('Round already exists')

    const bulkUpdateRes = await agent.patch('/api/rounds').send([
      {
        id: round2Res.body.data._id,
        tournamentId,
        round: 1,
      },
    ])
    expect(bulkUpdateRes.status).toBe(409)
    expect(bulkUpdateRes.body.errors[0].message).toBe('Round already exists')

    const partialBulkUpdateRes = await agent.patch('/api/rounds').send([
      {
        id: round1Res.body.data._id,
        tournamentId,
        name: 'Would Partially Rename',
      },
      {
        id: round2Res.body.data._id,
        tournamentId,
        round: 1,
      },
    ])
    expect(partialBulkUpdateRes.status).toBe(409)

    const roundsRes = await agent.get(`/api/rounds?tournamentId=${tournamentId}`)
    expect(roundsRes.status).toBe(200)
    expect(roundsRes.body.data.map((round: any) => round.round)).toEqual([1, 2])
    expect(roundsRes.body.data.find((round: any) => round.round === 1)?.name).toBe('R1')
  })

  it('moves and removes all round-scoped references when a round is renumbered and deleted', async () => {
    const agent = request.agent(app)
    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'round-reference-lifecycle', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'round-reference-lifecycle', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Round Reference Lifecycle Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      user_defined_data: {
        break: { source_rounds: [1] },
        round_defaults: { compile: { source_rounds: [1] } },
      },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const speakerRes = await agent
      .post('/api/speakers')
      .send({ tournamentId, name: 'Lifecycle Speaker' })
    const teamARes = await agent.post('/api/teams').send({ tournamentId, name: 'Lifecycle Team A' })
    const teamBRes = await agent.post('/api/teams').send({ tournamentId, name: 'Lifecycle Team B' })
    const adjudicatorRes = await agent
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Lifecycle Judge', preev: 5 })
    expect(speakerRes.status).toBe(201)
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    expect(adjudicatorRes.status).toBe(201)
    const speakerId = String(speakerRes.body.data._id)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)
    const adjudicatorId = String(adjudicatorRes.body.data._id)

    const roundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Lifecycle Round',
      userDefinedData: { no_speaker_score: true },
    })
    expect(roundRes.status).toBe(201)
    const roundId = String(roundRes.body.data._id)
    const referenceRoundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 3,
      name: 'Reference Round',
      userDefinedData: {
        compile: { source: 'submissions', source_rounds: [1] },
        break: { source: 'submissions', source_rounds: [1] },
      },
    })
    expect(referenceRoundRes.status).toBe(201)

    const drawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: null,
          teams: { gov: teamAId, opp: teamBId },
          chairs: [adjudicatorId],
          panels: [],
          trainees: [],
        },
      ],
      drawOpened: true,
      allocationOpened: true,
    })
    expect(drawRes.status).toBe(201)

    const ballotRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId,
      teamBId,
      winnerId: teamAId,
      scoresA: [],
      scoresB: [],
      submittedEntityId: adjudicatorId,
    })
    expect(ballotRes.status).toBe(201)
    const resultRes = await agent.post('/api/results').send({
      tournamentId,
      round: 1,
      payload: { standings: [] },
    })
    expect(resultRes.status).toBe(201)
    const rawTeamRes = await agent.post('/api/raw-results/teams').send({
      tournamentId,
      id: teamAId,
      from_id: adjudicatorId,
      r: 1,
      weight: 1,
      win: 1,
      side: 'gov',
      opponents: [teamBId],
    })
    const rawSpeakerRes = await agent.post('/api/raw-results/speakers').send({
      tournamentId,
      id: speakerId,
      from_id: adjudicatorId,
      r: 1,
      scores: [75],
    })
    const rawAdjudicatorRes = await agent.post('/api/raw-results/adjudicators').send({
      tournamentId,
      id: adjudicatorId,
      from_id: teamAId,
      r: 1,
      score: 8,
      judged_teams: [teamAId, teamBId],
    })
    expect(rawTeamRes.status).toBe(201)
    expect(rawSpeakerRes.status).toBe(201)
    expect(rawAdjudicatorRes.status).toBe(201)

    const renumberRes = await agent.patch(`/api/rounds/${roundId}`).send({
      tournamentId,
      round: 2,
    })
    expect(renumberRes.status).toBe(200)

    const [
      { getTournamentConnection },
      { getDrawModel },
      { getSubmissionModel },
      { getResultModel },
      { getRawTeamResultModel },
      { getRawSpeakerResultModel },
      { getRawAdjudicatorResultModel },
      { getTeamModel },
      { getRoundModel },
    ] = await Promise.all([
      import('../src/services/tournament-db.service.js'),
      import('../src/models/draw.js'),
      import('../src/models/submission.js'),
      import('../src/models/result.js'),
      import('../src/models/raw-team-result.js'),
      import('../src/models/raw-speaker-result.js'),
      import('../src/models/raw-adjudicator-result.js'),
      import('../src/models/team.js'),
      import('../src/models/round.js'),
    ])
    const connection = await getTournamentConnection(tournamentId)
    const DrawModel = getDrawModel(connection)
    const SubmissionModel = getSubmissionModel(connection)
    const ResultModel = getResultModel(connection)
    const RawTeamModel = getRawTeamResultModel(connection)
    const RawSpeakerModel = getRawSpeakerResultModel(connection)
    const RawAdjudicatorModel = getRawAdjudicatorResultModel(connection)
    const TeamModel = getTeamModel(connection)
    const RoundModel = getRoundModel(connection)

    expect(await DrawModel.countDocuments({ tournamentId, round: 2 }).exec()).toBe(1)
    expect(await SubmissionModel.countDocuments({ tournamentId, round: 2 }).exec()).toBe(1)
    expect(await ResultModel.countDocuments({ tournamentId, round: 2 }).exec()).toBe(1)
    expect(await RawTeamModel.countDocuments({ tournamentId, r: 2 }).exec()).toBe(1)
    expect(await RawSpeakerModel.countDocuments({ tournamentId, r: 2 }).exec()).toBe(1)
    expect(await RawAdjudicatorModel.countDocuments({ tournamentId, r: 2 }).exec()).toBe(1)
    const teamAfterMove = await TeamModel.findById(teamAId).lean().exec()
    expect((teamAfterMove?.details ?? []).some((detail: any) => Number(detail.r) === 2)).toBe(true)
    expect((teamAfterMove?.details ?? []).some((detail: any) => Number(detail.r) === 1)).toBe(false)
    const referenceRoundAfterMove = await RoundModel.findById(referenceRoundRes.body.data._id)
      .lean()
      .exec()
    expect((referenceRoundAfterMove as any)?.userDefinedData?.compile?.source_rounds).toEqual([2])
    expect((referenceRoundAfterMove as any)?.userDefinedData?.break?.source_rounds).toEqual([2])
    const tournamentAfterMove = await TournamentModel.findById(tournamentId).lean().exec()
    expect((tournamentAfterMove as any)?.user_defined_data?.break?.source_rounds).toEqual([2])
    expect(
      (tournamentAfterMove as any)?.user_defined_data?.round_defaults?.compile?.source_rounds
    ).toEqual([2])

    const deleteRes = await agent.delete(`/api/rounds/${roundId}?tournamentId=${tournamentId}`)
    expect(deleteRes.status).toBe(200)
    expect(await DrawModel.countDocuments({ tournamentId }).exec()).toBe(0)
    expect(await SubmissionModel.countDocuments({ tournamentId }).exec()).toBe(0)
    expect(await ResultModel.countDocuments({ tournamentId }).exec()).toBe(0)
    expect(await RawTeamModel.countDocuments({ tournamentId }).exec()).toBe(0)
    expect(await RawSpeakerModel.countDocuments({ tournamentId }).exec()).toBe(0)
    expect(await RawAdjudicatorModel.countDocuments({ tournamentId }).exec()).toBe(0)
    const teamAfterDelete = await TeamModel.findById(teamAId).lean().exec()
    expect((teamAfterDelete?.details ?? []).some((detail: any) => Number(detail.r) === 2)).toBe(
      false
    )
    const referenceRoundAfterDelete = await RoundModel.findById(referenceRoundRes.body.data._id)
      .lean()
      .exec()
    expect((referenceRoundAfterDelete as any)?.userDefinedData?.compile?.source_rounds).toEqual([])
    expect((referenceRoundAfterDelete as any)?.userDefinedData?.break?.source_rounds).toEqual([])
    const tournamentAfterDelete = await TournamentModel.findById(tournamentId).lean().exec()
    expect((tournamentAfterDelete as any)?.user_defined_data?.break?.source_rounds).toEqual([])
    expect(
      (tournamentAfterDelete as any)?.user_defined_data?.round_defaults?.compile?.source_rounds
    ).toEqual([])

    const orphanResultRes = await agent.post('/api/results').send({
      tournamentId,
      round: 2,
      payload: { standings: [] },
    })
    expect(orphanResultRes.status).toBe(404)
    expect(await ResultModel.countDocuments({ tournamentId }).exec()).toBe(0)

    const publicDrawsRes = await request(app).get(`/api/draws?tournamentId=${tournamentId}`)
    expect(publicDrawsRes.status).toBe(200)
    expect(publicDrawsRes.body.data).toEqual([])
  })

  it('maps duplicate raw result update conflicts to 409 without mutating existing rows', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'duplicate-raw-update-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'duplicate-raw-update-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Duplicate Raw Update Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const teamARes = await agent
      .post('/api/teams')
      .send({ tournamentId, name: 'Raw Conflict Team A' })
    const teamBRes = await agent
      .post('/api/teams')
      .send({ tournamentId, name: 'Raw Conflict Team B' })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)

    const rawCreateRes = await agent.post('/api/v1/raw-results/teams').send([
      {
        tournamentId,
        id: teamARes.body.data._id,
        from_id: ' judge-1 ',
        r: 1,
        weight: 1,
        win: 1,
        side: 'gov',
        opponents: [teamBRes.body.data._id],
      },
      {
        tournamentId,
        id: teamARes.body.data._id,
        from_id: 'judge-2',
        r: 1,
        weight: 1,
        win: 1,
        side: 'gov',
        opponents: [teamBRes.body.data._id],
      },
    ])
    expect(rawCreateRes.status).toBe(201)

    const secondRawId = rawCreateRes.body.data[1]._id as string
    const updateRes = await agent.patch(`/api/v1/raw-results/teams/${secondRawId}`).send({
      tournamentId,
      from_id: 'judge-1',
    })
    expect(updateRes.status).toBe(409)
    expect(updateRes.body.errors[0].message).toBe('Raw team result already exists')

    const partialCreateRes = await agent.post('/api/v1/raw-results/teams').send([
      {
        tournamentId,
        id: teamARes.body.data._id,
        from_id: 'judge-3',
        r: 1,
        weight: 1,
        win: 1,
        side: 'gov',
        opponents: [teamBRes.body.data._id],
      },
      {
        tournamentId,
        id: teamARes.body.data._id,
        from_id: 'judge-1',
        r: 1,
        weight: 1,
        win: 1,
        side: 'gov',
        opponents: [teamBRes.body.data._id],
      },
    ])
    expect(partialCreateRes.status).toBe(409)

    const listRes = await agent
      .get(`/api/v1/raw-results/teams?tournamentId=${tournamentId}&id=${teamARes.body.data._id}`)
      .send()
    expect(listRes.status).toBe(200)
    expect(listRes.body.data).toHaveLength(2)
    expect(listRes.body.data.map((row: any) => row.from_id).sort()).toEqual(['judge-1', 'judge-2'])
  })

  it('rejects malformed raw result updates before they can corrupt round data', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({ username: 'raw-update-validation-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'raw-update-validation-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Raw Update Validation Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const speakerRes = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Validation Speaker',
    })
    expect(speakerRes.status).toBe(201)

    const rawCreateRes = await agent.post('/api/v1/raw-results/speakers').send({
      tournamentId,
      id: speakerRes.body.data._id,
      from_id: 'judge-validation',
      r: 1,
      scores: [75, 76],
    })
    expect(rawCreateRes.status).toBe(201)
    const rawId = rawCreateRes.body.data._id as string
    expect(rawId).toBeTruthy()

    const invalidRoundRes = await agent.patch(`/api/v1/raw-results/speakers/${rawId}`).send({
      tournamentId,
      r: 0,
    })
    expect(invalidRoundRes.status).toBe(400)
    expect(invalidRoundRes.body.errors.some((issue: any) => issue.path === 'r')).toBe(true)

    const invalidScoresRes = await agent.patch(`/api/v1/raw-results/speakers/${rawId}`).send({
      tournamentId,
      scores: ['bad-score'],
    })
    expect(invalidScoresRes.status).toBe(400)
    expect(invalidScoresRes.body.errors.some((issue: any) => issue.path === 'scores.0')).toBe(true)

    const listRes = await agent
      .get(
        `/api/v1/raw-results/speakers?tournamentId=${tournamentId}&id=${speakerRes.body.data._id}`
      )
      .send()
    expect(listRes.status).toBe(200)
    expect(listRes.body.data).toHaveLength(1)
    expect(listRes.body.data[0].r).toBe(1)
    expect(listRes.body.data[0].scores).toEqual([75, 76])
  })

  it('enforces a unique draw per round at the model layer', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'draw-unique-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'draw-unique-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Draw Unique Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const [{ getTournamentConnection }, { getDrawModel }] = await Promise.all([
      import('../src/services/tournament-db.service.js'),
      import('../src/models/draw.js'),
    ])
    const connection = await getTournamentConnection(tournamentId)
    const DrawModel = getDrawModel(connection)
    const created = await DrawModel.create({
      tournamentId,
      round: 1,
      allocation: [],
      drawOpened: false,
      allocationOpened: false,
    })
    expect(created.round).toBe(1)

    await expect(
      DrawModel.create({
        tournamentId,
        round: 1,
        allocation: [],
        drawOpened: true,
        allocationOpened: true,
      })
    ).rejects.toMatchObject({ code: 11000 })
  })

  it('deduplicates legacy duplicate draws before recreating the unique round index', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'draw-dedupe-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'draw-dedupe-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Draw Dedupe Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const [{ getTournamentConnection, closeTournamentConnections }, { getDrawModel }] =
      await Promise.all([
        import('../src/services/tournament-db.service.js'),
        import('../src/models/draw.js'),
      ])

    const connection = await getTournamentConnection(tournamentId)
    const DrawModel = getDrawModel(connection)
    await DrawModel.collection.dropIndexes()

    const tournamentObjectId = new Types.ObjectId(tournamentId)
    await DrawModel.collection.insertMany([
      {
        tournamentId: tournamentObjectId,
        round: 2,
        allocation: [],
        drawOpened: false,
        allocationOpened: false,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
      {
        tournamentId: tournamentObjectId,
        round: 2,
        allocation: [
          { teams: { gov: 'team-a', opp: 'team-b' }, chairs: [], panels: [], trainees: [] },
        ],
        drawOpened: true,
        allocationOpened: true,
        createdAt: new Date('2024-01-02T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      },
    ])

    await closeTournamentConnections()

    const reconnected = await getTournamentConnection(tournamentId)
    const ReconnectedDrawModel = getDrawModel(reconnected)
    const remaining = await ReconnectedDrawModel.find({ tournamentId, round: 2 }).lean().exec()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].drawOpened).toBe(true)
    expect(remaining[0].allocationOpened).toBe(true)
    expect(remaining[0].allocation).toHaveLength(1)

    const indexes = await ReconnectedDrawModel.collection.indexes()
    const uniqueRoundIndex = indexes.find((index) => index.name === 'tournamentId_1_round_1')
    expect(uniqueRoundIndex?.unique).toBe(true)
  })

  it('rejects invalid draw references and preserves locked allocations', async () => {
    const agent = request.agent(app)
    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'draw-reference-lock-guard', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'draw-reference-lock-guard', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Draw Reference Lock Guard Open',
      style: 1,
      options: { style: { team_num: 2 } },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)
    const roundRes = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 1, name: 'Round 1' })
    expect(roundRes.status).toBe(201)
    const teamARes = await agent.post('/api/teams').send({ tournamentId, name: 'Draw Team A' })
    const teamBRes = await agent.post('/api/teams').send({ tournamentId, name: 'Draw Team B' })
    const unavailableTeamRes = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Unavailable Draw Team',
      template: { available: false },
    })
    const adjudicatorRes = await agent
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Draw Chair', preev: 5 })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    expect(unavailableTeamRes.status).toBe(201)
    expect(adjudicatorRes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)
    const unavailableTeamId = String(unavailableTeamRes.body.data._id)
    const adjudicatorId = String(adjudicatorRes.body.data._id)

    const unknownReferenceRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: null,
          teams: { gov: teamAId, opp: 'unknown-team' },
          chairs: [adjudicatorId],
          panels: [],
          trainees: [],
        },
      ],
    })
    expect(unknownReferenceRes.status).toBe(400)
    expect(String(unknownReferenceRes.body.errors?.[0]?.message ?? '')).toContain(
      'allocation contains unknown entities'
    )

    const duplicateTeamRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: null,
          teams: { gov: teamAId, opp: teamAId },
          chairs: [adjudicatorId],
          panels: [],
          trainees: [],
        },
      ],
    })
    expect(duplicateTeamRes.status).toBe(400)

    const unavailableReferenceRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: null,
          teams: { gov: teamAId, opp: unavailableTeamId },
          chairs: [adjudicatorId],
          panels: [],
          trainees: [],
        },
      ],
    })
    expect(unavailableReferenceRes.status).toBe(400)
    expect(String(unavailableReferenceRes.body.errors?.[0]?.message ?? '')).toContain(
      'entities unavailable in round 1'
    )

    const allocation = [
      {
        venue: null,
        teams: { gov: teamAId, opp: teamBId },
        chairs: [adjudicatorId],
        panels: [] as string[],
        trainees: [] as string[],
      },
    ]
    const lockedCreateRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation,
      drawOpened: false,
      allocationOpened: false,
      locked: true,
    })
    expect(lockedCreateRes.status).toBe(201)
    const drawId = String(lockedCreateRes.body.data._id)

    const publicationUpdateRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation,
      drawOpened: true,
      allocationOpened: true,
      locked: true,
    })
    expect(publicationUpdateRes.status).toBe(201)

    const overwriteRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          ...allocation[0],
          teams: { gov: teamBId, opp: teamAId },
        },
      ],
      locked: true,
    })
    expect(overwriteRes.status).toBe(409)

    const deleteLockedRes = await agent.delete(`/api/draws/${drawId}?tournamentId=${tournamentId}`)
    expect(deleteLockedRes.status).toBe(409)

    const unlockRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation,
      drawOpened: true,
      allocationOpened: true,
      locked: false,
    })
    expect(unlockRes.status).toBe(201)
    const deleteUnlockedRes = await agent.delete(
      `/api/draws/${drawId}?tournamentId=${tournamentId}`
    )
    expect(deleteUnlockedRes.status).toBe(200)
  })

  it('validates all four team references in British Parliamentary draw objects', async () => {
    const agent = request.agent(app)
    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'bp-draw-reference-guard', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'bp-draw-reference-guard', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleId = 9204
    const styleRes = await agent.post('/api/styles').send({
      id: styleId,
      name: 'Four Team Draw Style',
      team_num: 4,
      score_weights: [{ order: 1, value: 1 }],
      speaker_sequence: [],
      range: [{ order: 1, value: { from: 70, to: 80, unit: 1, default: 75 } }],
      adjudicator_range: { from: 1, to: 10, unit: 1, default: 5 },
      roles: {
        gov: [{ order: 1, long: 'Speaker', abbr: 'S' }],
        opp: [{ order: 1, long: 'Speaker', abbr: 'S' }],
      },
    })
    expect(styleRes.status).toBe(201)
    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Four Team Draw Open', style: styleId, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)
    const roundRes = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 1, name: 'Round 1' })
    expect(roundRes.status).toBe(201)
    const teamsRes = await agent
      .post('/api/teams')
      .send(['OG', 'OO', 'CG', 'CO'].map((name) => ({ tournamentId, name })))
    expect(teamsRes.status).toBe(201)
    const teamIds = teamsRes.body.data.map((team: any) => String(team._id))

    const drawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: null,
          teams: {
            gov: teamIds[0],
            opp: teamIds[1],
            og: teamIds[0],
            oo: teamIds[1],
            cg: teamIds[2],
            co: teamIds[3],
          },
          chairs: [],
          panels: [],
          trainees: [],
        },
      ],
    })
    expect(drawRes.status).toBe(201)

    const unsupportedBallotRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: teamIds[0],
      teamBId: teamIds[1],
      winnerId: teamIds[0],
      scoresA: [],
      scoresB: [],
      submittedEntityId: 'organizer-correction',
    })
    expect(unsupportedBallotRes.status).toBe(400)
    expect(unsupportedBallotRes.body.errors?.[0]?.message).toBe(
      'ballot submissions support only two-team styles'
    )

    const duplicateRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: null,
          teams: { og: teamIds[0], oo: teamIds[1], cg: teamIds[0], co: teamIds[3] },
          chairs: [],
          panels: [],
          trainees: [],
        },
      ],
    })
    expect(duplicateRes.status).toBe(400)
  })

  it('maps style update conflicts to 409 and rejects invalid style ids with 400', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'style-conflict-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'style-conflict-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const baseStyle = {
      team_num: 2,
      score_weights: [1],
      speaker_sequence: ['gov', 'opp'],
      adjudicator_range: [1, 100],
      roles: ['speaker'],
    }

    const styleARes = await agent.post('/api/styles').send({
      id: 9101,
      name: 'Conflict Style A',
      ...baseStyle,
    })
    const styleBRes = await agent.post('/api/styles').send({
      id: 9102,
      name: 'Conflict Style B',
      ...baseStyle,
    })
    expect(styleARes.status).toBe(201)
    expect(styleBRes.status).toBe(201)

    const duplicateUpdateRes = await agent.patch('/api/styles/9102').send({
      id: 9101,
    })
    expect(duplicateUpdateRes.status).toBe(409)
    expect(duplicateUpdateRes.body.errors[0].message).toBe('Style id already exists')

    const invalidUpdateRes = await agent.patch('/api/styles/not-a-number').send({
      name: 'Nope',
    })
    expect(invalidUpdateRes.status).toBe(400)
    expect(invalidUpdateRes.body.errors[0].message).toBe('Invalid style id')

    const invalidDeleteRes = await agent.delete('/api/styles/not-a-number')
    expect(invalidDeleteRes.status).toBe(400)
    expect(invalidDeleteRes.body.errors[0].message).toBe('Invalid style id')
  })

  it('rejects malformed style updates before partial numeric values can be stored', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'style-validation-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'style-validation-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const createStyleRes = await agent.post('/api/styles').send({
      id: 901,
      name: 'Validation Style',
      team_num: 2,
      score_weights: [1, 1],
      side_labels: { gov: 'Gov', opp: 'Opp' },
      side_labels_short: { gov: 'G', opp: 'O' },
      speaker_sequence: [1, 2],
      range: [],
      adjudicator_range: [1, 10],
      roles: ['speaker'],
    })
    expect(createStyleRes.status).toBe(201)

    const invalidUpdateRes = await agent.patch('/api/styles/901').send({
      team_num: 0.5,
    })
    expect(invalidUpdateRes.status).toBe(400)
    expect(invalidUpdateRes.body.errors.some((issue: any) => issue.path === 'team_num')).toBe(true)

    const tooFewTeamsRes = await agent.patch('/api/styles/901').send({ team_num: 1 })
    expect(tooFewTeamsRes.status).toBe(400)
    expect(tooFewTeamsRes.body.errors.some((issue: any) => issue.path === 'team_num')).toBe(true)

    const blankStyleNameRes = await agent.patch('/api/styles/901').send({ name: '   ' })
    expect(blankStyleNameRes.status).toBe(400)

    const invalidTournamentOptionsRes = await agent.post('/api/tournaments').send({
      name: 'Invalid Team Count Open',
      style: 901,
      options: { style: { team_num: 1 } },
    })
    expect(invalidTournamentOptionsRes.status).toBe(400)

    const blankTournamentNameRes = await agent.post('/api/tournaments').send({
      name: '   ',
      style: 901,
      options: {},
    })
    expect(blankTournamentNameRes.status).toBe(400)

    const blankUsernameRes = await request(app).post('/api/auth/register').send({
      username: '   ',
      password: 'password123',
      role: 'organizer',
    })
    expect(blankUsernameRes.status).toBe(400)

    const validTournamentRes = await agent.post('/api/tournaments').send({
      name: 'Input Boundary Open',
      style: 901,
      options: {},
    })
    expect(validTournamentRes.status).toBe(201)
    const inputTournamentId = String(validTournamentRes.body.data._id)

    const blankTeamNameRes = await agent
      .post('/api/teams')
      .send({ tournamentId: inputTournamentId, name: '   ' })
    expect(blankTeamNameRes.status).toBe(400)

    const blankRoundNameRes = await agent.post('/api/rounds').send({
      tournamentId: inputTournamentId,
      round: 1,
      name: '   ',
    })
    expect(blankRoundNameRes.status).toBe(400)

    const styleListRes = await agent.get('/api/styles')
    expect(styleListRes.status).toBe(200)
    const updatedStyle = styleListRes.body.data.find((style: any) => style.id === 901)
    expect(updatedStyle.team_num).toBe(2)
  })

  it('keeps tournament style references valid across create, renumber, and delete operations', async () => {
    const agent = request.agent(app)
    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'style-reference-guard', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'style-reference-guard', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleId = 9202
    const createStyleRes = await agent.post('/api/styles').send({
      id: styleId,
      name: 'Referenced Style',
      team_num: 2,
      score_weights: [{ order: 1, value: 1 }],
      speaker_sequence: [
        { order: 1, value: 'gov-1' },
        { order: 2, value: 'opp-1' },
      ],
      range: [{ order: 1, value: { from: 70, to: 80, unit: 1, default: 75 } }],
      adjudicator_range: { from: 1, to: 10, unit: 1, default: 5 },
      roles: {
        gov: [{ order: 1, long: 'Government', abbr: 'Gov' }],
        opp: [{ order: 1, long: 'Opposition', abbr: 'Opp' }],
      },
    })
    expect(createStyleRes.status).toBe(201)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Referenced Style Open',
      style: styleId,
      options: {},
    })
    expect(tournamentRes.status).toBe(201)

    const renumberRes = await agent.patch(`/api/styles/${styleId}`).send({ id: styleId + 1 })
    expect(renumberRes.status).toBe(409)
    const deleteRes = await agent.delete(`/api/styles/${styleId}`)
    expect(deleteRes.status).toBe(409)

    const unknownStyleTournamentRes = await agent.post('/api/tournaments').send({
      name: 'Unknown Style Open',
      style: 999_999,
      options: {},
    })
    expect(unknownStyleTournamentRes.status).toBe(400)

    const listRes = await agent.get('/api/styles')
    expect(listRes.status).toBe(200)
    expect(listRes.body.data.some((style: any) => style.id === styleId)).toBe(true)
  })

  it('stores submissions with entity ids and compiles from submissions', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'submission-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'submission-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const stylesRes = await agent.get('/api/styles')
    expect(stylesRes.status).toBe(200)
    const styleId = stylesRes.body.data[0].id ?? 1

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Submission Open',
      style: styleId,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const roundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Main Round 1',
      motions: ['Sample motion'],
    })
    expect(roundRes.status).toBe(201)

    const speakerRes1 = await agent
      .post('/api/speakers')
      .send({ tournamentId, name: 'Speaker Alpha' })
    expect(speakerRes1.status).toBe(201)
    const speakerId1 = speakerRes1.body.data._id

    const speakerRes2 = await agent
      .post('/api/speakers')
      .send({ tournamentId, name: 'Speaker Beta' })
    expect(speakerRes2.status).toBe(201)
    const speakerId2 = speakerRes2.body.data._id

    const teamRes1 = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Team Alpha',
      details: [{ r: 1, speakers: [speakerId1] }],
    })
    expect(teamRes1.status).toBe(201)
    const teamId1 = teamRes1.body.data._id

    const teamRes2 = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Team Beta',
      details: [{ r: 1, speakers: [speakerId2] }],
    })
    expect(teamRes2.status).toBe(201)
    const teamId2 = teamRes2.body.data._id

    const adjudicatorRes = await agent
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Judge Sub', preev: 6 })
    expect(adjudicatorRes.status).toBe(201)
    const adjudicatorId = adjudicatorRes.body.data._id

    const drawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: '',
          teams: { gov: teamId1, opp: teamId2 },
          chairs: [adjudicatorId],
          panels: [],
          trainees: [],
        },
      ],
      drawOpened: true,
      allocationOpened: true,
    })
    expect(drawRes.status).toBe(201)

    const ballotRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: teamId1,
      teamBId: teamId2,
      winnerId: teamId1,
      speakerIdsA: [speakerId1],
      speakerIdsB: [speakerId2],
      scoresA: [75],
      scoresB: [72],
      submittedEntityId: adjudicatorId,
    })
    expect(ballotRes.status).toBe(201)

    const feedbackRes = await agent.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId,
      score: 8,
      comment: 'clear and fair',
      submittedEntityId: teamId1,
    })
    expect(feedbackRes.status).toBe(201)

    const submissionsRes = await agent.get(`/api/submissions?tournamentId=${tournamentId}&round=1`)
    expect(submissionsRes.status).toBe(200)
    expect(submissionsRes.body.data.length).toBe(2)
    const ballotSubmission = submissionsRes.body.data.find((item: any) => item.type === 'ballot')
    expect(ballotSubmission.payload.submittedEntityId).toBe(adjudicatorId)
    expect(ballotSubmission.payload.speakerIdsA).toEqual([speakerId1])

    const feedbackSubmission = submissionsRes.body.data.find(
      (item: any) => item.type === 'feedback'
    )
    expect(feedbackSubmission.payload.submittedEntityId).toBe(teamId1)

    const compiledRes = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'submissions',
      options: { diff_baseline: { mode: 'compiled', compiled_id: 'seed-compiled-1' } },
    })
    expect(compiledRes.status).toBe(201)
    expect(compiledRes.body.data.payload.rounds[0]?.name).toBe('Main Round 1')
    expect(compiledRes.body.data.payload.compiled_team_results.length).toBe(2)
    expect(compiledRes.body.data.payload.compiled_speaker_results.length).toBe(2)
    expect(compiledRes.body.data.payload.compiled_adjudicator_results.length).toBe(1)
    expect(compiledRes.body.data.payload.compile_options.diff_baseline).toEqual({
      mode: 'compiled',
      compiled_id: 'seed-compiled-1',
    })
    expect(compiledRes.body.data.payload.compile_options.tie_points).toBe(0.5)
    expect(compiledRes.body.data.payload.compile_diff_meta).toEqual({
      baseline_mode: 'compiled',
      requested_compiled_id: 'seed-compiled-1',
      baseline_compiled_id: null,
      baseline_found: false,
    })
    const compiledAdj = compiledRes.body.data.payload.compiled_adjudicator_results[0]
    expect(compiledAdj.num_experienced).toBe(1)

    const compiledList = await agent.get(`/api/compiled?tournamentId=${tournamentId}&latest=1`)
    expect(compiledList.status).toBe(200)
    expect(compiledList.body.data.payload.rounds[0]?.name).toBe('Main Round 1')
    expect(compiledList.body.data.payload.compiled_team_results.length).toBe(2)
  })

  it('covers setup-to-report workflow with bulk entity import, break rounds, and submissions', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'workflow-e2e-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'workflow-e2e-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const stylesRes = await agent.get('/api/styles')
    expect(stylesRes.status).toBe(200)
    const styleId = stylesRes.body.data[0].id ?? 1

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Workflow Coverage Open',
      style: styleId,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 2,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const prelimRoundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Prelim 1',
      motions: ['This House would ...'],
    })
    expect(prelimRoundRes.status).toBe(201)

    const breakRoundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 2,
      name: 'Break Final',
    })
    expect(breakRoundRes.status).toBe(201)
    const breakRoundId = breakRoundRes.body.data._id as string

    const speakersRes = await agent.post('/api/speakers').send([
      { tournamentId, name: 'Speaker Alpha' },
      { tournamentId, name: 'Speaker Beta' },
      { tournamentId, name: 'Speaker Gamma' },
      { tournamentId, name: 'Speaker Delta' },
    ])
    expect(speakersRes.status).toBe(201)
    expect(speakersRes.body.data.length).toBe(4)
    const speakerIdByName = new Map<string, string>(
      (speakersRes.body.data as Array<{ _id: string; name: string }>).map((speaker) => [
        speaker.name,
        speaker._id,
      ])
    )

    const teamsRes = await agent.post('/api/teams').send([
      {
        tournamentId,
        name: 'Team Alpha',
        details: [
          { r: 1, speakers: [speakerIdByName.get('Speaker Alpha')] },
          { r: 2, speakers: [speakerIdByName.get('Speaker Alpha')] },
        ],
      },
      {
        tournamentId,
        name: 'Team Beta',
        details: [
          { r: 1, speakers: [speakerIdByName.get('Speaker Beta')] },
          { r: 2, speakers: [speakerIdByName.get('Speaker Beta')] },
        ],
      },
      {
        tournamentId,
        name: 'Team Gamma',
        details: [
          { r: 1, speakers: [speakerIdByName.get('Speaker Gamma')] },
          { r: 2, speakers: [speakerIdByName.get('Speaker Gamma')] },
        ],
      },
      {
        tournamentId,
        name: 'Team Delta',
        details: [
          { r: 1, speakers: [speakerIdByName.get('Speaker Delta')] },
          { r: 2, speakers: [speakerIdByName.get('Speaker Delta')] },
        ],
      },
    ])
    expect(teamsRes.status).toBe(201)
    expect(teamsRes.body.data.length).toBe(4)
    const teamIdByName = new Map<string, string>(
      (teamsRes.body.data as Array<{ _id: string; name: string }>).map((team) => [
        team.name,
        team._id,
      ])
    )

    const adjudicatorsRes = await agent.post('/api/adjudicators').send([
      { tournamentId, name: 'Judge 1', preev: 6 },
      { tournamentId, name: 'Judge 2', preev: 5 },
    ])
    expect(adjudicatorsRes.status).toBe(201)
    expect(adjudicatorsRes.body.data.length).toBe(2)
    const adjudicatorIdByName = new Map<string, string>(
      (adjudicatorsRes.body.data as Array<{ _id: string; name: string }>).map((row) => [
        row.name,
        row._id,
      ])
    )

    const setBreakRes = await agent.patch(`/api/rounds/${breakRoundId}/break`).send({
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [1],
        size: 2,
        cutoff_tie_policy: 'manual',
        seeding: 'high_low',
        participants: [
          { teamId: teamIdByName.get('Team Alpha'), seed: 1 },
          { teamId: teamIdByName.get('Team Beta'), seed: 2 },
        ],
      },
      syncTeamAvailability: true,
    })
    expect(setBreakRes.status).toBe(200)
    expect(setBreakRes.body.data.break.participants).toHaveLength(2)

    const prelimDrawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: null,
          teams: {
            gov: teamIdByName.get('Team Alpha'),
            opp: teamIdByName.get('Team Gamma'),
          },
          chairs: [adjudicatorIdByName.get('Judge 1')],
          panels: [],
          trainees: [],
        },
        {
          venue: null,
          teams: {
            gov: teamIdByName.get('Team Beta'),
            opp: teamIdByName.get('Team Delta'),
          },
          chairs: [adjudicatorIdByName.get('Judge 2')],
          panels: [],
          trainees: [],
        },
      ],
      drawOpened: true,
      allocationOpened: true,
    })
    expect(prelimDrawRes.status).toBe(201)

    const round1Ballot1 = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: teamIdByName.get('Team Alpha'),
      teamBId: teamIdByName.get('Team Gamma'),
      winnerId: teamIdByName.get('Team Alpha'),
      speakerIdsA: [speakerIdByName.get('Speaker Alpha')],
      speakerIdsB: [speakerIdByName.get('Speaker Gamma')],
      scoresA: [76],
      scoresB: [72],
      submittedEntityId: adjudicatorIdByName.get('Judge 1'),
    })
    expect(round1Ballot1.status).toBe(201)

    const round1Ballot2 = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: teamIdByName.get('Team Beta'),
      teamBId: teamIdByName.get('Team Delta'),
      winnerId: teamIdByName.get('Team Beta'),
      speakerIdsA: [speakerIdByName.get('Speaker Beta')],
      speakerIdsB: [speakerIdByName.get('Speaker Delta')],
      scoresA: [75],
      scoresB: [71],
      submittedEntityId: adjudicatorIdByName.get('Judge 2'),
    })
    expect(round1Ballot2.status).toBe(201)

    const round1Feedback = await agent.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: adjudicatorIdByName.get('Judge 1'),
      score: 8,
      comment: 'clear feedback',
      submittedEntityId: teamIdByName.get('Team Alpha'),
    })
    expect(round1Feedback.status).toBe(201)

    const breakAllocRes = await agent.post('/api/allocations/break').send({
      tournamentId,
      round: 2,
    })
    expect(breakAllocRes.status).toBe(200)
    expect(breakAllocRes.body.data.allocation).toHaveLength(1)

    const breakDrawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 2,
      allocation: (breakAllocRes.body.data.allocation as Array<any>).map((square) => ({
        ...square,
        chairs: [adjudicatorIdByName.get('Judge 1')],
        panels: [],
        trainees: [],
      })),
      userDefinedData: breakAllocRes.body.data.userDefinedData,
      drawOpened: true,
      allocationOpened: true,
    })
    expect(breakDrawRes.status).toBe(201)

    const breakMatch = breakDrawRes.body.data.allocation[0]
    const breakBallotRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 2,
      teamAId: breakMatch.teams.gov,
      teamBId: breakMatch.teams.opp,
      winnerId: teamIdByName.get('Team Alpha'),
      speakerIdsA:
        breakMatch.teams.gov === teamIdByName.get('Team Alpha')
          ? [speakerIdByName.get('Speaker Alpha')]
          : [speakerIdByName.get('Speaker Beta')],
      speakerIdsB:
        breakMatch.teams.opp === teamIdByName.get('Team Alpha')
          ? [speakerIdByName.get('Speaker Alpha')]
          : [speakerIdByName.get('Speaker Beta')],
      scoresA: breakMatch.teams.gov === teamIdByName.get('Team Alpha') ? [77] : [73],
      scoresB: breakMatch.teams.opp === teamIdByName.get('Team Alpha') ? [77] : [73],
      submittedEntityId: adjudicatorIdByName.get('Judge 1'),
    })
    expect(breakBallotRes.status).toBe(201)

    const round2BallotsRes = await agent.get(
      `/api/submissions?tournamentId=${tournamentId}&round=2&type=ballot`
    )
    expect(round2BallotsRes.status).toBe(200)
    expect(round2BallotsRes.body.data.length).toBe(1)

    const compiledRes = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'submissions',
      options: {
        include_labels: ['teams', 'speakers', 'adjudicators'],
      },
    })
    expect(compiledRes.status).toBe(201)
    const roundNames = (compiledRes.body.data.payload.rounds as Array<{ name: string }>).map(
      (round) => round.name
    )
    expect(roundNames).toContain('Prelim 1')
    expect(roundNames).toContain('Break Final')
    expect(compiledRes.body.data.payload.compiled_team_results.length).toBe(4)

    const teamResults = compiledRes.body.data.payload.compiled_team_results as Array<any>
    const alphaResult = teamResults.find((row) => row.id === teamIdByName.get('Team Alpha'))
    const betaResult = teamResults.find((row) => row.id === teamIdByName.get('Team Beta'))
    expect(alphaResult).toBeTruthy()
    expect(betaResult).toBeTruthy()
    expect(alphaResult.win).toBeGreaterThan(betaResult.win)

    const latestCompiledRes = await agent.get(`/api/compiled?tournamentId=${tournamentId}&latest=1`)
    expect(latestCompiledRes.status).toBe(200)
    expect(latestCompiledRes.body.data._id).toBe(compiledRes.body.data._id)

    const teamReportRes = await agent.post('/api/compiled/teams').send({
      tournamentId,
      source: 'submissions',
    })
    expect(teamReportRes.status).toBe(201)
    expect(teamReportRes.body.data.results.length).toBe(4)
    expect(
      (teamReportRes.body.data.rounds as Array<{ name: string }>).some(
        (round) => round.name === 'Break Final'
      )
    ).toBe(true)
  })

  it('rejects impossible submitted entities based on draw allocation and round settings', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'allocation-entity-guard', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'allocation-entity-guard', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Allocation Entity Guard Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const roundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: {
        evaluate_from_teams: true,
        evaluate_from_adjudicators: true,
        evaluator_in_team: 'speaker',
        chairs_always_evaluated: true,
      },
    })
    expect(roundRes.status).toBe(201)

    const speakerRes1 = await agent
      .post('/api/speakers')
      .send({ tournamentId, name: 'Guard Speaker 1' })
    expect(speakerRes1.status).toBe(201)
    const speakerId1 = speakerRes1.body.data._id

    const speakerRes2 = await agent
      .post('/api/speakers')
      .send({ tournamentId, name: 'Guard Speaker 2' })
    expect(speakerRes2.status).toBe(201)
    const speakerId2 = speakerRes2.body.data._id

    const speakerRes3 = await agent
      .post('/api/speakers')
      .send({ tournamentId, name: 'Guard Speaker 3' })
    expect(speakerRes3.status).toBe(201)
    const speakerId3 = speakerRes3.body.data._id

    const teamRes1 = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Guard Team A',
      details: [{ r: 1, speakers: [speakerId1] }],
    })
    expect(teamRes1.status).toBe(201)
    const teamId1 = teamRes1.body.data._id

    const teamRes2 = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Guard Team B',
      details: [{ r: 1, speakers: [speakerId2] }],
    })
    expect(teamRes2.status).toBe(201)
    const teamId2 = teamRes2.body.data._id

    const teamRes3 = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Guard Team C',
      details: [{ r: 1, speakers: [speakerId3] }],
    })
    expect(teamRes3.status).toBe(201)
    const teamId3 = teamRes3.body.data._id

    const chairRes = await agent
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Guard Chair', preev: 7 })
    expect(chairRes.status).toBe(201)
    const chairId = chairRes.body.data._id

    const panelRes = await agent
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Guard Panel', preev: 6 })
    expect(panelRes.status).toBe(201)
    const panelId = panelRes.body.data._id

    const traineeRes = await agent
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Guard Trainee', preev: 5 })
    expect(traineeRes.status).toBe(201)
    const traineeId = traineeRes.body.data._id

    const outsiderRes = await agent
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Guard Outsider', preev: 4 })
    expect(outsiderRes.status).toBe(201)
    const outsiderId = outsiderRes.body.data._id

    const drawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: '',
          teams: { gov: teamId1, opp: teamId2 },
          chairs: [chairId],
          panels: [panelId],
          trainees: [traineeId],
        },
      ],
      drawOpened: true,
      allocationOpened: true,
    })
    expect(drawRes.status).toBe(201)

    const invalidBallotActor = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: teamId1,
      teamBId: teamId2,
      winnerId: teamId1,
      speakerIdsA: [speakerId1],
      speakerIdsB: [speakerId2],
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: outsiderId,
    })
    expect(invalidBallotActor.status).toBe(400)
    expect(String(invalidBallotActor.body.errors?.[0]?.message ?? '')).toContain(
      'submittedEntityId is not assigned to this matchup'
    )

    const invalidBallotTrainee = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: teamId1,
      teamBId: teamId2,
      winnerId: teamId1,
      speakerIdsA: [speakerId1],
      speakerIdsB: [speakerId2],
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: traineeId,
    })
    expect(invalidBallotTrainee.status).toBe(400)
    expect(String(invalidBallotTrainee.body.errors?.[0]?.message ?? '')).toContain(
      'submittedEntityId is not assigned to this matchup'
    )

    const invalidBallotMatchup = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: teamId1,
      teamBId: teamId3,
      winnerId: teamId1,
      speakerIdsA: [speakerId1],
      speakerIdsB: [speakerId3],
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: chairId,
    })
    expect(invalidBallotMatchup.status).toBe(400)
    expect(String(invalidBallotMatchup.body.errors?.[0]?.message ?? '')).toContain(
      'teamAId/teamBId is not present in draw allocation'
    )

    const validBallot = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: teamId1,
      teamBId: teamId2,
      winnerId: teamId1,
      speakerIdsA: [speakerId1],
      speakerIdsB: [speakerId2],
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: chairId,
    })
    expect(validBallot.status).toBe(201)

    const invalidFeedbackTeamActor = await agent.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: chairId,
      score: 8,
      submittedEntityId: teamId1,
    })
    expect(invalidFeedbackTeamActor.status).toBe(400)
    expect(String(invalidFeedbackTeamActor.body.errors?.[0]?.message ?? '')).toContain(
      'submittedEntityId is not allowed for this feedback target'
    )

    const invalidFeedbackPanelTargetFromSpeaker = await agent
      .post('/api/submissions/feedback')
      .send({
        tournamentId,
        round: 1,
        adjudicatorId: panelId,
        score: 8,
        submittedEntityId: speakerId1,
      })
    expect(invalidFeedbackPanelTargetFromSpeaker.status).toBe(400)
    expect(String(invalidFeedbackPanelTargetFromSpeaker.body.errors?.[0]?.message ?? '')).toContain(
      'submittedEntityId is not allowed for this feedback target'
    )

    const invalidFeedbackTraineeTargetFromSpeaker = await agent
      .post('/api/submissions/feedback')
      .send({
        tournamentId,
        round: 1,
        adjudicatorId: traineeId,
        score: 8,
        submittedEntityId: speakerId1,
      })
    expect(invalidFeedbackTraineeTargetFromSpeaker.status).toBe(400)
    expect(
      String(invalidFeedbackTraineeTargetFromSpeaker.body.errors?.[0]?.message ?? '')
    ).toContain('submittedEntityId is not allowed for this feedback target')

    const validFeedbackFromSpeaker = await agent.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: chairId,
      score: 9,
      submittedEntityId: speakerId1,
    })
    expect(validFeedbackFromSpeaker.status).toBe(201)

    const validFeedbackFromAdjudicator = await agent.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: chairId,
      score: 7,
      submittedEntityId: panelId,
    })
    expect(validFeedbackFromAdjudicator.status).toBe(201)

    const validFeedbackFromTrainee = await agent.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: chairId,
      score: 8,
      submittedEntityId: traineeId,
    })
    expect(validFeedbackFromTrainee.status).toBe(201)

    const invalidFeedbackSelfAdjudicator = await agent.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: chairId,
      score: 7,
      submittedEntityId: chairId,
    })
    expect(invalidFeedbackSelfAdjudicator.status).toBe(400)
    expect(String(invalidFeedbackSelfAdjudicator.body.errors?.[0]?.message ?? '')).toContain(
      'submittedEntityId is not allowed for this feedback target'
    )

    const validFeedbackToPanel = await agent.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: panelId,
      score: 8,
      submittedEntityId: chairId,
    })
    expect(validFeedbackToPanel.status).toBe(201)

    const validFeedbackToTrainee = await agent.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: traineeId,
      score: 7,
      submittedEntityId: panelId,
    })
    expect(validFeedbackToTrainee.status).toBe(201)

    const disabledFeedbackRoundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 2,
      name: 'Feedback Disabled Round',
      userDefinedData: {
        evaluate_from_teams: false,
        evaluate_from_adjudicators: false,
      },
    })
    expect(disabledFeedbackRoundRes.status).toBe(201)
    const disabledFeedbackRes = await agent.post('/api/submissions/feedback').send({
      tournamentId,
      round: 2,
      adjudicatorId: chairId,
      score: 7,
      submittedEntityId: panelId,
    })
    expect(disabledFeedbackRes.status).toBe(400)
    expect(String(disabledFeedbackRes.body.errors?.[0]?.message ?? '')).toContain(
      'feedback is disabled in this round'
    )

    const compiledRes = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'submissions',
      rounds: [1],
      options: {
        include_labels: ['adjudicators'],
      },
    })
    expect(compiledRes.status).toBe(201)

    const adjudicatorResults = compiledRes.body.data.payload
      .compiled_adjudicator_results as Array<any>
    const chairResult = adjudicatorResults.find((row) => row.id === chairId)
    const panelResult = adjudicatorResults.find((row) => row.id === panelId)
    const traineeResult = adjudicatorResults.find((row) => row.id === traineeId)

    expect(chairResult).toMatchObject({
      num_experienced: 1,
      num_experienced_chair: 1,
      num_experienced_panel: 0,
      num_experienced_trainee: 0,
    })
    expect(panelResult).toMatchObject({
      num_experienced: 1,
      num_experienced_chair: 0,
      num_experienced_panel: 1,
      num_experienced_trainee: 0,
    })
    expect(traineeResult).toMatchObject({
      num_experienced: 1,
      num_experienced_chair: 0,
      num_experienced_panel: 0,
      num_experienced_trainee: 1,
    })
  })

  it('enforces score order when draw and winner-score mismatch are disabled', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'no-tie-round', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'no-tie-round', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'No Tie Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const roundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: {
        allow_low_tie_win: false,
        compile: {
          options: {
            winner_policy: 'score_only',
          },
        },
      },
    })
    expect(roundRes.status).toBe(201)

    const noWinner = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      scoresA: [75],
      scoresB: [75],
      submittedEntityId: 'judge-a',
    })
    expect(noWinner.status).toBe(400)

    const tieScoreWinner = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [75],
      scoresB: [75],
      submittedEntityId: 'judge-a',
    })
    expect(tieScoreWinner.status).toBe(201)

    const drawOnTie = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      draw: true,
      scoresA: [75],
      scoresB: [75],
      submittedEntityId: 'judge-b',
    })
    expect(drawOnTie.status).toBe(400)

    const lowWinWinner = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-b',
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: 'judge-c',
    })
    expect(lowWinWinner.status).toBe(400)

    const validWinner = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: 'judge-d',
    })
    expect(validWinner.status).toBe(201)
  })

  it('requires explicit verdict and allows draw/score mismatch when both options are enabled', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'winner-required', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'winner-required', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Winner Required Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const roundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: {
        allow_low_tie_win: true,
        compile: {
          options: {
            winner_policy: 'winner_id_then_score',
          },
        },
      },
    })
    expect(roundRes.status).toBe(201)

    const missingWinnerOnDecisive = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: 'judge-a',
    })
    expect(missingWinnerOnDecisive.status).toBe(400)

    const missingWinnerOnTie = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      scoresA: [75],
      scoresB: [75],
      submittedEntityId: 'judge-a',
    })
    expect(missingWinnerOnTie.status).toBe(400)

    const drawOnDecisive = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      draw: true,
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: 'judge-b',
    })
    expect(drawOnDecisive.status).toBe(201)
    expect(drawOnDecisive.body.data.payload.draw).toBe(true)
    expect('winnerId' in drawOnDecisive.body.data.payload).toBe(false)

    const lowWinWinner = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-b',
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: 'judge-c',
    })
    expect(lowWinWinner.status).toBe(201)

    const invalidWinner = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'unknown-team',
      scoresA: [75],
      scoresB: [75],
      submittedEntityId: 'judge-a',
    })
    expect(invalidWinner.status).toBe(400)
  })

  it('rejects ballot submissions where team ids are identical', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'invalid-matchup-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'invalid-matchup-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Invalid Matchup Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const ballotRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-a',
      winnerId: 'team-a',
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes.status).toBe(400)
  })

  it('keeps ballots for different matchups from the same actor', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'multi-matchup-actor', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'multi-matchup-actor', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Multi Matchup Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id
    const roundRes = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 1, name: 'Round 1' })
    expect(roundRes.status).toBe(201)

    const firstBallot = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: 'judge-a',
    })
    expect(firstBallot.status).toBe(201)

    const secondBallot = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-c',
      teamBId: 'team-d',
      winnerId: 'team-c',
      scoresA: [74],
      scoresB: [73],
      submittedEntityId: 'judge-a',
    })
    expect(secondBallot.status).toBe(201)

    const submissionsRes = await agent.get(
      `/api/submissions?tournamentId=${tournamentId}&round=1&type=ballot`
    )
    expect(submissionsRes.status).toBe(200)
    expect(submissionsRes.body.data.length).toBe(2)
  })

  it('rejects duplicate ballots when submittedEntityId is blank and actor falls back to session user', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'blank-entity-dedupe', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'blank-entity-dedupe', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Blank Entity Dedupe Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id
    const roundRes = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 1, name: 'Round 1' })
    expect(roundRes.status).toBe(201)

    const firstBallot = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [76],
      scoresB: [75],
      comment: 'first submission',
    })
    expect(firstBallot.status).toBe(201)

    const secondBallot = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-b',
      scoresA: [73],
      scoresB: [74],
      comment: 'second submission',
      submittedEntityId: '   ',
    })
    expect(secondBallot.status).toBe(409)
    expect(String(secondBallot.body.errors?.[0]?.message ?? '')).toContain(
      'すでにチーム評価が送信されています。送信済みのチーム評価を修正する場合は運営に連絡してください。'
    )

    const submissionsRes = await agent.get(
      `/api/submissions?tournamentId=${tournamentId}&round=1&type=ballot`
    )
    expect(submissionsRes.status).toBe(200)
    expect(submissionsRes.body.data.length).toBe(1)
    expect(submissionsRes.body.data[0].payload.comment).toBe('first submission')
  })

  it('normalizes submitted entity ids on ballot submissions', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'normalize-ballot-entity', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'normalize-ballot-entity', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Normalize Ballot Entity Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id
    const roundRes = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 1, name: 'Round 1' })
    expect(roundRes.status).toBe(201)

    const ballotRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: '  judge-a  ',
    })
    expect(ballotRes.status).toBe(201)

    const listRes = await agent.get(
      `/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`
    )
    expect(listRes.status).toBe(200)
    expect(listRes.body.data.length).toBe(1)
    expect(listRes.body.data[0].payload.submittedEntityId).toBe('judge-a')
  })

  it('returns submittedBy in list responses for legacy submissions without payload actor', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'list-submitted-by-legacy', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'list-submitted-by-legacy', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'List SubmittedBy Legacy Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const [{ getTournamentConnection }, { getSubmissionModel }] = await Promise.all([
      import('../src/services/tournament-db.service.js'),
      import('../src/models/submission.js'),
    ])
    const connection = await getTournamentConnection(tournamentId)
    const SubmissionModel = getSubmissionModel(connection)
    await SubmissionModel.create({
      tournamentId,
      round: 1,
      type: 'ballot',
      payload: {
        teamAId: 'team-a',
        teamBId: 'team-b',
        scoresA: [76],
        scoresB: [74],
      },
      submittedBy: 'judge-legacy',
    })

    const listRes = await agent.get(
      `/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`
    )
    expect(listRes.status).toBe(200)
    expect(listRes.body.data.length).toBe(1)
    expect(listRes.body.data[0].submittedBy).toBe('judge-legacy')
  })

  it('rejects ballots when only one side has score entries', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'one-sided-scores', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'one-sided-scores', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'One-sided Scores Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id
    const roundRes = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 1, name: 'Round 1' })
    expect(roundRes.status).toBe(201)

    const ballotRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [76],
      scoresB: [],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes.status).toBe(400)
  })

  it('rejects ballots when both sides have no score entries in score-enabled rounds', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'empty-scores-rejected', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'empty-scores-rejected', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Empty Scores Rejected Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id
    const roundRes = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 1, name: 'Round 1' })
    expect(roundRes.status).toBe(201)

    const ballotRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [],
      scoresB: [],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes.status).toBe(400)
    expect(String(ballotRes.body.errors?.[0]?.message ?? '')).toContain(
      'speaker scores are required in this round'
    )
  })

  it('accepts empty score ballots when speaker scores are disabled for a round', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'empty-scores-allowed', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'empty-scores-allowed', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Empty Scores Allowed Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const roundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: {
        no_speaker_score: true,
      },
    })
    expect(roundRes.status).toBe(201)

    const ballotRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [],
      scoresB: [],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes.status).toBe(201)
  })

  it('rejects ballots with non-numeric score entries', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'non-numeric-scores', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'non-numeric-scores', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Non Numeric Scores Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const ballotRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: ['76'],
      scoresB: [75],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes.status).toBe(400)
  })

  it('rejects ballots when speaker/flag arrays do not match score lengths', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'array-length-check', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'array-length-check', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Array Length Check Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const speakerMismatch = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [76],
      scoresB: [75],
      speakerIdsA: [],
      speakerIdsB: ['spk-b'],
      submittedEntityId: 'judge-a',
    })
    expect(speakerMismatch.status).toBe(400)

    const flagMismatch = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [76],
      scoresB: [75],
      bestA: [true, false],
      bestB: [false],
      submittedEntityId: 'judge-a',
    })
    expect(flagMismatch.status).toBe(400)
  })

  it('rejects ballots when best or poi selections are outside the configured range', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'award-count-range-check', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'award-count-range-check', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Award Count Range Check Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1, 1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const roundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: {
        best: true,
        poi: true,
        best_min_count: 1,
        best_max_count: 2,
        poi_min_count: 0,
        poi_max_count: 2,
      },
    })
    expect(roundRes.status).toBe(201)

    const bestCountRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [76, 75],
      scoresB: [74, 73],
      bestA: [false, false],
      bestB: [false, false],
      poiA: [false, false],
      poiB: [false, false],
      submittedEntityId: 'judge-a',
    })
    expect(bestCountRes.status).toBe(400)
    expect(String(bestCountRes.body.errors?.[0]?.message ?? '')).toContain(
      'best selection count must be between 1 and 2'
    )

    const poiCountRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [76, 75],
      scoresB: [74, 73],
      bestA: [true, false],
      bestB: [false, false],
      poiA: [true, true],
      poiB: [true, false],
      submittedEntityId: 'judge-b',
    })
    expect(poiCountRes.status).toBe(400)
    expect(String(poiCountRes.body.errors?.[0]?.message ?? '')).toContain(
      'poi selection count must be between 0 and 2'
    )
  })

  it('rejects ballots with blank speaker ids even when score lengths match', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'blank-speaker-ids', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'blank-speaker-ids', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Blank Speaker Ids Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const ballotRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [76],
      scoresB: [75],
      speakerIdsA: [''],
      speakerIdsB: ['   '],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes.status).toBe(400)
  })

  it('rejects unidentified actors and submissions before complete draw publication', async () => {
    const agent = request.agent(app)
    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'anonymous-submission-guard', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'anonymous-submission-guard', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Anonymous Submission Guard Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)
    const roundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: { no_speaker_score: true },
    })
    expect(roundRes.status).toBe(201)
    const teamARes = await agent
      .post('/api/teams')
      .send({ tournamentId, name: 'Anonymous Guard Team A' })
    const teamBRes = await agent
      .post('/api/teams')
      .send({ tournamentId, name: 'Anonymous Guard Team B' })
    const adjudicatorRes = await agent
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Anonymous Guard Judge', preev: 5 })
    const unassignedAdjudicatorRes = await agent
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Anonymous Guard Unassigned Judge', preev: 5 })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    expect(adjudicatorRes.status).toBe(201)
    expect(unassignedAdjudicatorRes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)
    const adjudicatorId = String(adjudicatorRes.body.data._id)
    const unassignedAdjudicatorId = String(unassignedAdjudicatorRes.body.data._id)

    const ballotRes = await request(app).post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId,
      teamBId,
      winnerId: teamAId,
      scoresA: [],
      scoresB: [],
      submittedEntityId: '   ',
    })
    expect(ballotRes.status).toBe(400)
    expect(String(ballotRes.body.errors?.[0]?.message ?? '')).toContain(
      'submittedEntityId or authenticated user is required'
    )

    const feedbackRes = await request(app).post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId,
      score: 5,
    })
    expect(feedbackRes.status).toBe(400)
    expect(String(feedbackRes.body.errors?.[0]?.message ?? '')).toContain(
      'submittedEntityId or authenticated user is required'
    )

    const forgedActorRes = await request(app).post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId,
      score: 5,
      submittedEntityId: 'forged-team',
    })
    expect(forgedActorRes.status).toBe(400)
    expect(String(forgedActorRes.body.errors?.[0]?.message ?? '')).toContain(
      'submittedEntityId must reference a tournament entity'
    )

    const unpublishedBallotRes = await request(app).post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId,
      teamBId,
      winnerId: teamAId,
      scoresA: [],
      scoresB: [],
      submittedEntityId: adjudicatorId,
    })
    expect(unpublishedBallotRes.status).toBe(400)
    expect(unpublishedBallotRes.body.errors?.[0]?.message).toBe('draw allocation is not published')

    const unpublishedFeedbackRes = await request(app).post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId,
      score: 5,
      submittedEntityId: teamAId,
    })
    expect(unpublishedFeedbackRes.status).toBe(400)
    expect(unpublishedFeedbackRes.body.errors?.[0]?.message).toBe(
      'draw allocation is not published'
    )

    const blankAllocationIdRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: null,
          teams: { gov: teamAId, opp: teamBId },
          chairs: ['   '],
          panels: [],
          trainees: [],
        },
      ],
    })
    expect(blankAllocationIdRes.status).toBe(400)

    const partialDrawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      drawOpened: true,
      allocationOpened: false,
      allocation: [
        {
          venue: null,
          teams: { gov: teamAId, opp: teamBId },
          chairs: [` ${adjudicatorId} `],
          panels: [],
          trainees: [],
        },
      ],
    })
    expect(partialDrawRes.status).toBe(201)
    expect(partialDrawRes.body.data.allocation[0].chairs).toEqual([adjudicatorId])

    const partialDrawBallotRes = await request(app).post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId,
      teamBId,
      winnerId: teamAId,
      scoresA: [],
      scoresB: [],
      submittedEntityId: adjudicatorId,
    })
    expect(partialDrawBallotRes.status).toBe(400)
    expect(partialDrawBallotRes.body.errors?.[0]?.message).toBe('draw allocation is not published')

    const publishedDrawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      drawOpened: true,
      allocationOpened: true,
      allocation: [
        {
          venue: null,
          teams: { gov: teamAId, opp: teamBId },
          chairs: [adjudicatorId],
          panels: [],
          trainees: [],
        },
      ],
    })
    expect(publishedDrawRes.status).toBe(201)
    expect(publishedDrawRes.body.data.allocation[0].chairs).toEqual([adjudicatorId])

    const publishedBallotRes = await request(app).post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId,
      teamBId,
      winnerId: teamAId,
      scoresA: [],
      scoresB: [],
      submittedEntityId: adjudicatorId,
    })
    expect(publishedBallotRes.status).toBe(201)

    const publishedFeedbackRes = await request(app).post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId,
      score: 5,
      submittedEntityId: teamAId,
    })
    expect(publishedFeedbackRes.status).toBe(201)

    const unassignedPublicBallotRes = await request(app).post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId,
      teamBId,
      winnerId: teamAId,
      scoresA: [],
      scoresB: [],
      submittedEntityId: unassignedAdjudicatorId,
    })
    expect(unassignedPublicBallotRes.status).toBe(400)
    expect(String(unassignedPublicBallotRes.body.errors?.[0]?.message ?? '')).toContain(
      'submittedEntityId is not assigned to this matchup'
    )

    const emptyPanelDrawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      drawOpened: true,
      allocationOpened: true,
      allocation: [
        {
          venue: null,
          teams: { gov: teamAId, opp: teamBId },
          chairs: [],
          panels: [],
          trainees: [],
        },
      ],
    })
    expect(emptyPanelDrawRes.status).toBe(201)

    const organizerCorrectionRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId,
      teamBId,
      winnerId: teamAId,
      scoresA: [],
      scoresB: [],
      submittedEntityId: unassignedAdjudicatorId,
    })
    expect(organizerCorrectionRes.status).toBe(201)
  })

  it('enforces configured score ranges and round-specific speaker ownership', async () => {
    const agent = request.agent(app)
    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'speaker-ownership-guard', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'speaker-ownership-guard', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleId = 9201
    const styleRes = await agent.post('/api/styles').send({
      id: styleId,
      name: 'Single Speaker Integrity Style',
      team_num: 2,
      score_weights: [{ order: 1, value: 1 }],
      speaker_sequence: [
        { order: 1, value: 'gov-1' },
        { order: 2, value: 'opp-1' },
      ],
      range: [{ order: 1, value: { from: 70, to: 80, unit: 1, default: 75 } }],
      adjudicator_range: { from: 1, to: 10, unit: 1, default: 5 },
      roles: {
        gov: [{ order: 1, long: 'Government', abbr: 'Gov' }],
        opp: [{ order: 1, long: 'Opposition', abbr: 'Opp' }],
      },
    })
    expect(styleRes.status).toBe(201)
    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Speaker Ownership Guard Open',
      style: styleId,
      options: {},
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)
    const roundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

    const speakerARes = await agent.post('/api/speakers').send({ tournamentId, name: 'Speaker A' })
    const speakerBRes = await agent.post('/api/speakers').send({ tournamentId, name: 'Speaker B' })
    expect(speakerARes.status).toBe(201)
    expect(speakerBRes.status).toBe(201)
    const speakerAId = String(speakerARes.body.data._id)
    const speakerBId = String(speakerBRes.body.data._id)

    const teamARes = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Speaker Team A',
      template: { speakers: [speakerAId] },
      details: [{ r: 1, available: true, speakers: [speakerAId] }],
    })
    const teamBRes = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Speaker Team B',
      template: { speakers: [speakerBId] },
      details: [{ r: 1, available: true, speakers: [speakerBId] }],
    })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)

    const wrongOwnerRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId,
      teamBId,
      winnerId: teamAId,
      scoresA: [75],
      scoresB: [74],
      speakerIdsA: [speakerBId],
      speakerIdsB: [speakerBId],
      submittedEntityId: 'judge-a',
    })
    expect(wrongOwnerRes.status).toBe(400)
    expect(String(wrongOwnerRes.body.errors?.[0]?.message ?? '')).toContain(
      'speakerIdsA contains a speaker outside teamA'
    )

    const outOfRangeRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId,
      teamBId,
      winnerId: teamAId,
      scoresA: [75.5],
      scoresB: [74],
      speakerIdsA: [speakerAId],
      speakerIdsB: [speakerBId],
      submittedEntityId: 'judge-b',
    })
    expect(outOfRangeRes.status).toBe(400)
    expect(String(outOfRangeRes.body.errors?.[0]?.message ?? '')).toContain(
      'outside the configured score range or unit'
    )
  })
})
