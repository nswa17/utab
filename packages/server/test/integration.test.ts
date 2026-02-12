import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { TournamentMemberModel } from '../src/models/tournament-member.js'
import { TournamentModel } from '../src/models/tournament.js'
import { UserModel } from '../src/models/user.js'
import { hashPassword, verifyPassword } from '../src/services/hash.service.js'

let app: import('express').Express
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
  let last = await fetcher()
  while (!predicate(last) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    last = await fetcher()
  }
  return last
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({
    instance: { ip: '127.0.0.1', launchTimeout: 60000 },
  })

  process.env.NODE_ENV = 'test'
  process.env.PORT = '0'
  process.env.MONGODB_URI = mongo.getUri('utab-test')
  process.env.SESSION_SECRET = 'test-session-secret-123456'
  process.env.CORS_ORIGIN = 'http://localhost'
  ;({ connectDatabase, disconnectDatabase } = await import('../src/config/database.js'))
  ;({ closeTournamentConnections } = await import('../src/services/tournament-db.service.js'))
  await connectDatabase()
  const mod = await import('../src/app.js')
  app = mod.createApp()
})

afterAll(async () => {
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
  it('returns health', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('ok')
  })

  it('applies CORS whitelist and origin checks on state-changing requests', async () => {
    const allowedOrigin = 'http://localhost'
    const blockedOrigin = 'http://evil.example'

    const allowedPreflight = await request(app)
      .options('/api/auth/login')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'POST')
    expect(allowedPreflight.status).toBe(204)
    expect(allowedPreflight.headers['access-control-allow-origin']).toBe(allowedOrigin)

    const blockedPreflight = await request(app)
      .options('/api/auth/login')
      .set('Origin', blockedOrigin)
      .set('Access-Control-Request-Method', 'POST')
    expect(blockedPreflight.headers['access-control-allow-origin']).toBeUndefined()

    const blockedRegister = await request(app)
      .post('/api/auth/register')
      .set('Origin', blockedOrigin)
      .send({ username: 'csrf-blocked', password: 'password123', role: 'organizer' })
    expect(blockedRegister.status).toBe(403)

    const allowedRegister = await request(app)
      .post('/api/auth/register')
      .set('Origin', allowedOrigin)
      .send({ username: 'csrf-allowed', password: 'password123', role: 'organizer' })
    expect(allowedRegister.status).toBe(201)
  })

  it('enforces route-specific JSON body size limits', async () => {
    const authPayload = {
      username: 'size-limit-auth',
      password: 'password123',
      role: 'organizer',
      padding: 'x'.repeat(40 * 1024),
    }
    const authTooLarge = await request(app).post('/api/auth/register').send(authPayload)
    expect(authTooLarge.status).toBe(413)

    const teamPayload = {
      tournamentId: '507f1f77bcf86cd799439011',
      name: 'Size Team',
      userDefinedData: {
        payload: 'x'.repeat(300 * 1024),
      },
    }
    const teamTooLarge = await request(app).post('/api/teams').send(teamPayload)
    expect(teamTooLarge.status).toBe(413)
  })

  it('registers, logs in, and accesses protected routes', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'alice', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const userId = registerRes.body.data.userId
    expect(userId).toBeTruthy()

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const meRes = await agent.get('/api/auth/me')
    expect(meRes.status).toBe(200)
    expect(meRes.body.data.username).toBe('alice')

    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Test Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const teamRes = await agent
      .post('/api/teams')
      .send({
        tournamentId,
        name: 'Team A',
        institution: 'Uni',
        speakers: [{ name: 'Speaker 1' }],
        details: [{ r: 1, institutions: ['internal-inst'], speakers: ['internal-speaker'] }],
        userDefinedData: { privateMemo: 'do-not-expose' },
      })
    expect(teamRes.status).toBe(201)
    const teamId = teamRes.body.data._id

    const adjudicatorRes = await agent
      .post('/api/adjudicators')
      .send({
        tournamentId,
        name: 'Judge 1',
        strength: 5,
        preev: 2,
        details: [{ r: 1, institutions: ['internal-inst'] }],
        userDefinedData: { privateMemo: 'hidden' },
      })
    expect(adjudicatorRes.status).toBe(201)

    const resultRes = await agent
      .post('/api/results')
      .send({
        tournamentId,
        round: 1,
        payload: {
          standings: [],
          comment: 'internal comment',
          user_defined_data: { private: true },
          submittedBy: 'internal-user',
        },
      })
    expect(resultRes.status).toBe(201)

    const drawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      drawOpened: true,
      allocationOpened: false,
      allocation: [
        {
          venue: 'Room 1',
          teams: { gov: teamId, opp: 'team-b' },
          chairs: ['adj-chair'],
          panels: ['adj-panel'],
          trainees: ['adj-trainee'],
        },
      ],
    })
    expect(drawRes.status).toBe(201)

    const compiledRes = await agent.post('/api/compiled').send({ tournamentId, source: 'raw' })
    expect(compiledRes.status).toBe(201)

    const listTeams = await agent.get(`/api/teams?tournamentId=${tournamentId}`)
    expect(listTeams.status).toBe(200)
    expect(Array.isArray(listTeams.body.data)).toBe(true)

    const listAdjs = await agent.get(`/api/adjudicators?tournamentId=${tournamentId}`)
    expect(listAdjs.status).toBe(200)
    expect(Array.isArray(listAdjs.body.data)).toBe(true)

    const listResults = await agent.get(`/api/results?tournamentId=${tournamentId}`)
    expect(listResults.status).toBe(200)
    expect(Array.isArray(listResults.body.data)).toBe(true)

    const publicTeams = await request(app).get(`/api/teams?tournamentId=${tournamentId}`)
    expect(publicTeams.status).toBe(200)
    expect('details' in publicTeams.body.data[0]).toBe(false)
    expect('userDefinedData' in publicTeams.body.data[0]).toBe(false)

    const publicAdjudicators = await request(app).get(`/api/adjudicators?tournamentId=${tournamentId}`)
    expect(publicAdjudicators.status).toBe(200)
    expect('strength' in publicAdjudicators.body.data[0]).toBe(false)
    expect('details' in publicAdjudicators.body.data[0]).toBe(false)
    expect('userDefinedData' in publicAdjudicators.body.data[0]).toBe(false)

    const publicResults = await request(app).get(`/api/results?tournamentId=${tournamentId}`)
    expect(publicResults.status).toBe(200)
    expect('createdBy' in publicResults.body.data[0]).toBe(false)
    expect('comment' in publicResults.body.data[0].payload).toBe(false)
    expect('user_defined_data' in publicResults.body.data[0].payload).toBe(false)
    expect('submittedBy' in publicResults.body.data[0].payload).toBe(false)

    const publicDraws = await request(app).get(`/api/draws?tournamentId=${tournamentId}`)
    expect(publicDraws.status).toBe(200)
    expect(Array.isArray(publicDraws.body.data[0].allocation)).toBe(true)
    expect(publicDraws.body.data[0].allocation[0].chairs).toEqual([])
    expect(publicDraws.body.data[0].allocation[0].panels).toEqual([])
    expect(publicDraws.body.data[0].allocation[0].trainees).toEqual([])
    expect('locked' in publicDraws.body.data[0]).toBe(false)
    expect('createdBy' in publicDraws.body.data[0]).toBe(false)

    const publicCompiled = await request(app).get(`/api/compiled?tournamentId=${tournamentId}&latest=1`)
    expect(publicCompiled.status).toBe(200)
    expect(publicCompiled.body.data).not.toBeNull()
    expect('createdBy' in publicCompiled.body.data).toBe(false)

    const openAccessSkipRes = await request(app).post(`/api/tournaments/${tournamentId}/access`).send({
      action: 'skip',
    })
    expect(openAccessSkipRes.status).toBe(200)

    const publicSubmission = await request(app).post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: 'open-judge',
      score: 6,
    })
    expect(publicSubmission.status).toBe(201)
  })

  it('supports legacy-style entities, raw results compilation, and draw generation', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'legacy-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'legacy-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const stylesRes = await agent.get('/api/styles')
    expect(stylesRes.status).toBe(200)
    expect(stylesRes.body.data.length).toBeGreaterThan(0)
    const styleId = stylesRes.body.data[0].id ?? 1

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Legacy Open',
      style: styleId,
      options: { style: { team_num: 2, score_weights: [1, 1, 1] } },
      total_round_num: 2,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const institutionRes = await agent
      .post('/api/institutions')
      .send({ tournamentId, name: 'Inst A' })
    expect(institutionRes.status).toBe(201)
    const institutionId = institutionRes.body.data._id

    const speakerRes1 = await agent
      .post('/api/speakers')
      .send({ tournamentId, name: 'Speaker 1' })
    expect(speakerRes1.status).toBe(201)
    const speakerId1 = speakerRes1.body.data._id

    const speakerRes2 = await agent
      .post('/api/speakers')
      .send({ tournamentId, name: 'Speaker 2' })
    expect(speakerRes2.status).toBe(201)
    const speakerId2 = speakerRes2.body.data._id

    const teamRes1 = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Team 1',
      details: [{ r: 1, speakers: [speakerId1], institutions: [institutionId] }],
      userDefinedData: { seed: true },
    })
    expect(teamRes1.status).toBe(201)
    expect(teamRes1.body.data.details?.length).toBe(1)
    const teamId1 = teamRes1.body.data._id

    const teamRes2 = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Team 2',
      details: [{ r: 1, speakers: [speakerId2], institutions: [institutionId] }],
    })
    expect(teamRes2.status).toBe(201)
    const teamId2 = teamRes2.body.data._id

    const adjudicatorRes = await agent.post('/api/adjudicators').send({
      tournamentId,
      name: 'Judge 1',
      strength: 5,
      preev: 2,
      details: [{ r: 1, conflicts: [teamId1], institutions: [institutionId] }],
    })
    expect(adjudicatorRes.status).toBe(201)
    expect(adjudicatorRes.body.data.preev).toBe(2)
    const adjudicatorId = adjudicatorRes.body.data._id

    const venueRes = await agent.post('/api/venues').send({
      tournamentId,
      name: 'Room 1',
      details: [{ r: 1, priority: 1 }],
    })
    expect(venueRes.status).toBe(201)

    const roundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round One',
      motions: ['Test motion'],
    })
    expect(roundRes.status).toBe(201)

    const rawTeamsRes = await agent.post('/api/raw-results/teams').send([
      {
        tournamentId,
        id: teamId1,
        from_id: 'seed-1',
        r: 1,
        weight: 1,
        win: 1,
        side: 'gov',
        opponents: [teamId2],
      },
      {
        tournamentId,
        id: teamId2,
        from_id: 'seed-1',
        r: 1,
        weight: 1,
        win: 0,
        side: 'opp',
        opponents: [teamId1],
      },
    ])
    expect(rawTeamsRes.status).toBe(201)

    const rawSpeakersRes = await agent.post('/api/raw-results/speakers').send([
      {
        tournamentId,
        id: speakerId1,
        from_id: 'seed-1',
        r: 1,
        weight: 1,
        scores: [75, 0, 0],
      },
      {
        tournamentId,
        id: speakerId2,
        from_id: 'seed-1',
        r: 1,
        weight: 1,
        scores: [74, 0, 0],
      },
    ])
    expect(rawSpeakersRes.status).toBe(201)

    const rawAdjudicatorRes = await agent.post('/api/raw-results/adjudicators').send([
      {
        tournamentId,
        id: adjudicatorId,
        from_id: 'seed-1',
        r: 1,
        weight: 1,
        score: 8,
        judged_teams: [teamId1, teamId2],
      },
    ])
    expect(rawAdjudicatorRes.status).toBe(201)

    const compileOptions = {
      ranking_priority: {
        preset: 'custom',
        order: ['win', 'sum', 'margin', 'vote', 'average', 'sd'],
      },
      winner_policy: 'score_only',
      tie_points: 0.5,
      duplicate_normalization: {
        merge_policy: 'latest',
        poi_aggregation: 'max',
        best_aggregation: 'average',
      },
      missing_data_policy: 'exclude',
      include_labels: ['teams', 'speakers', 'poi'],
      diff_baseline: { mode: 'latest' as const },
    }

    const compiledRes = await agent
      .post('/api/compiled')
      .send({ tournamentId, source: 'raw', options: compileOptions })
    expect(compiledRes.status).toBe(201)
    expect(compiledRes.body.data.payload.rounds[0]?.name).toBe('Round One')
    expect(compiledRes.body.data.payload.compiled_team_results.length).toBe(2)
    expect(compiledRes.body.data.payload.compiled_speaker_results.length).toBe(2)
    expect(compiledRes.body.data.payload.compiled_adjudicator_results.length).toBe(0)
    expect(compiledRes.body.data.payload.compile_options).toEqual(compileOptions)

    const compiledTeamsRes = await agent
      .post('/api/compiled/teams')
      .send({ tournamentId, source: 'raw' })
    expect(compiledTeamsRes.status).toBe(201)
    expect(compiledTeamsRes.body.data.results.length).toBe(2)
    expect(compiledTeamsRes.body.data.rounds[0]?.name).toBe('Round One')
    expect(compiledTeamsRes.body.data.rounds.length).toBeGreaterThan(0)
    expect(compiledTeamsRes.body.data.compile_options.winner_policy).toBe('winner_id_then_score')

    const compiledSpeakersRes = await agent
      .post('/api/compiled/speakers')
      .send({ tournamentId, source: 'raw' })
    expect(compiledSpeakersRes.status).toBe(201)
    expect(compiledSpeakersRes.body.data.results.length).toBe(2)

    const compiledAdjudicatorsRes = await agent
      .post('/api/compiled/adjudicators')
      .send({ tournamentId, source: 'raw' })
    expect(compiledAdjudicatorsRes.status).toBe(201)
    expect(compiledAdjudicatorsRes.body.data.results.length).toBe(1)

    const compiledTeamsLatest = await agent.get(
      `/api/compiled/teams?tournamentId=${tournamentId}&latest=1`
    )
    expect(compiledTeamsLatest.status).toBe(200)
    expect(compiledTeamsLatest.body.data.results.length).toBe(2)

    const compiledSpeakersLatest = await agent.get(
      `/api/compiled/speakers?tournamentId=${tournamentId}&latest=1`
    )
    expect(compiledSpeakersLatest.status).toBe(200)
    expect(compiledSpeakersLatest.body.data.results.length).toBe(2)

    const compiledAdjudicatorsLatest = await agent.get(
      `/api/compiled/adjudicators?tournamentId=${tournamentId}&latest=1`
    )
    expect(compiledAdjudicatorsLatest.status).toBe(200)
    expect(compiledAdjudicatorsLatest.body.data.results.length).toBe(1)

    const drawRes = await agent.post('/api/draws/generate').send({
      tournamentId,
      round: 1,
      save: false,
      options: {
        team_allocation_algorithm: 'standard',
        adjudicator_allocation_algorithm: 'standard',
        numbers_of_adjudicators: { chairs: 1, panels: 0, trainees: 0 },
        venue_allocation_algorithm_options: { shuffle: false },
      },
    })
    expect(drawRes.status).toBe(200)
    expect(drawRes.body.data.allocation.length).toBeGreaterThan(0)

    const teamAllocRes = await agent.post('/api/allocations/teams').send({
      tournamentId,
      round: 1,
      options: { team_allocation_algorithm: 'standard' },
    })
    expect(teamAllocRes.status).toBe(200)
    expect(teamAllocRes.body.data.allocation.length).toBeGreaterThan(0)

    const adjAllocRes = await agent.post('/api/allocations/adjudicators').send({
      tournamentId,
      round: 1,
      allocation: teamAllocRes.body.data.allocation,
      options: { numbers_of_adjudicators: { chairs: 1, panels: 0, trainees: 0 } },
    })
    expect(adjAllocRes.status).toBe(200)
    expect(adjAllocRes.body.data.allocation.length).toBeGreaterThan(0)

    const venueAllocRes = await agent.post('/api/allocations/venues').send({
      tournamentId,
      round: 1,
      allocation: adjAllocRes.body.data.allocation,
      options: { venue_allocation_algorithm_options: { shuffle: false } },
    })
    expect(venueAllocRes.status).toBe(200)
    expect(venueAllocRes.body.data.allocation.length).toBeGreaterThan(0)
  })

  it('skips adjudicator allocation when adjudicators are insufficient', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'short-adjs', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'short-adjs', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Short Adjs Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const teamsRes = await agent.post('/api/teams').send([
      { tournamentId, name: 'Team 1' },
      { tournamentId, name: 'Team 2' },
      { tournamentId, name: 'Team 3' },
      { tournamentId, name: 'Team 4' },
    ])
    expect(teamsRes.status).toBe(201)
    expect(teamsRes.body.data.length).toBe(4)

    const adjudicatorRes = await agent.post('/api/adjudicators').send({
      tournamentId,
      name: 'Solo Judge',
      strength: 3,
      details: [{ r: 1, available: true }],
    })
    expect(adjudicatorRes.status).toBe(201)

    const drawRes = await agent.post('/api/draws/generate').send({
      tournamentId,
      round: 1,
      save: false,
      options: {
        team_allocation_algorithm: 'standard',
        adjudicator_allocation_algorithm: 'standard',
        numbers_of_adjudicators: { chairs: 1, panels: 0, trainees: 0 },
      },
    })
    expect(drawRes.status).toBe(200)
    expect(drawRes.body.data.allocation.length).toBeGreaterThan(0)
    for (const square of drawRes.body.data.allocation) {
      expect(square.chairs?.length ?? 0).toBe(0)
      expect(square.panels?.length ?? 0).toBe(0)
      expect(square.trainees?.length ?? 0).toBe(0)
    }
  })

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

    const deleteRes = await agent.delete(
      `/api/teams?tournamentId=${tournamentId}&ids=${teamA._id}`
    )
    expect(deleteRes.status).toBe(200)
    expect(deleteRes.body.data.deletedCount).toBe(1)

    const extraTeamRes = await agent
      .post('/api/teams')
      .send({ tournamentId, name: 'Bulk Team 3' })
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
      .send({ tournamentId, name: 'Judge Sub', strength: 6 })
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

    const submissionsRes = await agent.get(
      `/api/submissions?tournamentId=${tournamentId}&round=1`
    )
    expect(submissionsRes.status).toBe(200)
    expect(submissionsRes.body.data.length).toBe(2)
    const ballotSubmission = submissionsRes.body.data.find((item: any) => item.type === 'ballot')
    expect(ballotSubmission.payload.submittedEntityId).toBe(adjudicatorId)
    expect(ballotSubmission.payload.speakerIdsA).toEqual([speakerId1])

    const feedbackSubmission = submissionsRes.body.data.find((item: any) => item.type === 'feedback')
    expect(feedbackSubmission.payload.submittedEntityId).toBe(teamId1)

    const compiledRes = await agent
      .post('/api/compiled')
      .send({
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

  it('rejects draw-like ballot submissions when low tie win is disabled', async () => {
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
    expect(tieScoreWinner.status).toBe(400)

    const validWinner = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: 'judge-a',
    })
    expect(validWinner.status).toBe(201)
  })

  it('applies compile options to submission-based aggregation', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'compile-options-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'compile-options-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const stylesRes = await agent.get('/api/styles')
    expect(stylesRes.status).toBe(200)
    const styleId = stylesRes.body.data[0].id ?? 1

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Compile Options Open',
      style: styleId,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const roundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Main Round',
    })
    expect(roundRes.status).toBe(201)

    const speakerRes1 = await agent.post('/api/speakers').send({ tournamentId, name: 'Speaker One' })
    expect(speakerRes1.status).toBe(201)
    const speakerId1 = speakerRes1.body.data._id
    const speakerRes2 = await agent.post('/api/speakers').send({ tournamentId, name: 'Speaker Two' })
    expect(speakerRes2.status).toBe(201)
    const speakerId2 = speakerRes2.body.data._id

    const teamRes1 = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Team One',
      details: [{ r: 1, speakers: [speakerId1] }],
    })
    expect(teamRes1.status).toBe(201)
    const teamId1 = teamRes1.body.data._id
    const teamRes2 = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Team Two',
      details: [{ r: 1, speakers: [speakerId2] }],
    })
    expect(teamRes2.status).toBe(201)
    const teamId2 = teamRes2.body.data._id

    const drawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: '',
          teams: { gov: teamId1, opp: teamId2 },
          chairs: [],
          panels: [],
          trainees: [],
        },
      ],
      drawOpened: true,
      allocationOpened: true,
    })
    expect(drawRes.status).toBe(201)

    const ballotRes1 = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: teamId1,
      teamBId: teamId2,
      winnerId: teamId2,
      speakerIdsA: [speakerId1],
      speakerIdsB: [speakerId2],
      scoresA: [70],
      scoresB: [74],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes1.status).toBe(201)

    const ballotRes2 = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: teamId1,
      teamBId: teamId2,
      speakerIdsA: [speakerId1],
      speakerIdsB: [speakerId2],
      scoresA: [76],
      scoresB: [74],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes2.status).toBe(201)

    const compileWithErrorPolicy = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'submissions',
      options: {
        duplicate_normalization: { merge_policy: 'error' },
      },
    })
    expect(compileWithErrorPolicy.status).toBe(201)

    const compileRes = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'submissions',
      options: {
        ranking_priority: {
          preset: 'custom',
          order: ['sum', 'win', 'margin', 'vote', 'average', 'sd'],
        },
        winner_policy: 'draw_on_missing',
        tie_points: 0.5,
        duplicate_normalization: {
          merge_policy: 'latest',
          poi_aggregation: 'max',
          best_aggregation: 'average',
        },
        missing_data_policy: 'warn',
        include_labels: ['teams'],
      },
    })
    expect(compileRes.status).toBe(201)
    expect(compileRes.body.data.payload.compile_options.winner_policy).toBe('draw_on_missing')
    expect(compileRes.body.data.payload.compiled_speaker_results.length).toBe(0)
    expect(compileRes.body.data.payload.compiled_adjudicator_results.length).toBe(0)

    const teamResults = compileRes.body.data.payload.compiled_team_results
    expect(teamResults.length).toBe(2)
    const team1 = teamResults.find((row: any) => row.id === teamId1)
    const team2 = teamResults.find((row: any) => row.id === teamId2)
    expect(team1.win).toBe(0.5)
    expect(team2.win).toBe(0.5)
    expect(team1.ranking).toBe(1)
    expect(team2.ranking).toBe(2)
    expect(compileRes.body.data.payload.compile_warnings).toEqual([])

    const compileTieRankRes = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'submissions',
      options: {
        ranking_priority: {
          preset: 'custom',
          order: ['win'],
        },
        winner_policy: 'draw_on_missing',
        tie_points: 0.5,
        duplicate_normalization: {
          merge_policy: 'latest',
          poi_aggregation: 'max',
          best_aggregation: 'average',
        },
        missing_data_policy: 'warn',
        include_labels: ['teams'],
      },
    })
    expect(compileTieRankRes.status).toBe(201)

    const tieRankResults = compileTieRankRes.body.data.payload.compiled_team_results
    const tieRankTeam1 = tieRankResults.find((row: any) => row.id === teamId1)
    const tieRankTeam2 = tieRankResults.find((row: any) => row.id === teamId2)
    expect(tieRankTeam1.win).toBe(0.5)
    expect(tieRankTeam2.win).toBe(0.5)
    expect(tieRankTeam1.ranking).toBe(1)
    expect(tieRankTeam2.ranking).toBe(1)

    const ballotRes3 = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: teamId1,
      teamBId: teamId2,
      winnerId: teamId2,
      speakerIdsA: [speakerId1],
      speakerIdsB: [speakerId2],
      scoresA: [68],
      scoresB: [80],
      submittedEntityId: 'judge-c',
    })
    expect(ballotRes3.status).toBe(201)

    const compileDiffRes = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'submissions',
      options: {
        ranking_priority: {
          preset: 'custom',
          order: ['sum', 'win', 'margin', 'vote', 'average', 'sd'],
        },
        winner_policy: 'draw_on_missing',
        tie_points: 0.5,
        duplicate_normalization: {
          merge_policy: 'latest',
          poi_aggregation: 'max',
          best_aggregation: 'average',
        },
        missing_data_policy: 'warn',
        include_labels: ['teams'],
        diff_baseline: { mode: 'compiled', compiled_id: compileRes.body.data._id },
      },
    })
    expect(compileDiffRes.status).toBe(201)
    expect(compileDiffRes.body.data.payload.compile_diff_meta.baseline_mode).toBe('compiled')
    expect(compileDiffRes.body.data.payload.compile_diff_meta.requested_compiled_id).toBe(
      compileRes.body.data._id
    )
    expect(compileDiffRes.body.data.payload.compile_diff_meta.baseline_compiled_id).toBe(
      compileRes.body.data._id
    )
    expect(compileDiffRes.body.data.payload.compile_diff_meta.baseline_found).toBe(true)

    const diffTeamResults = compileDiffRes.body.data.payload.compiled_team_results
    const diffTeam1 = diffTeamResults.find((row: any) => row.id === teamId1)
    const diffTeam2 = diffTeamResults.find((row: any) => row.id === teamId2)
    expect(diffTeam1.diff.ranking.trend).toBe('worsened')
    expect(diffTeam1.diff.ranking.delta).toBe(1)
    expect(diffTeam2.diff.ranking.trend).toBe('improved')
    expect(diffTeam2.diff.ranking.delta).toBe(-1)
    expect(typeof diffTeam1.diff.metrics.sum.delta).toBe('number')
  })

  it('keeps adjudicator ballots distinct when merge policy is average', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'compile-average', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'compile-average', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Compile Average Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const speakerRes1 = await agent.post('/api/speakers').send({ tournamentId, name: 'Speaker A' })
    expect(speakerRes1.status).toBe(201)
    const speakerId1 = speakerRes1.body.data._id

    const speakerRes2 = await agent.post('/api/speakers').send({ tournamentId, name: 'Speaker B' })
    expect(speakerRes2.status).toBe(201)
    const speakerId2 = speakerRes2.body.data._id

    const teamRes1 = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Team A',
      details: [{ r: 1, speakers: [speakerId1] }],
    })
    expect(teamRes1.status).toBe(201)
    const teamId1 = teamRes1.body.data._id

    const teamRes2 = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Team B',
      details: [{ r: 1, speakers: [speakerId2] }],
    })
    expect(teamRes2.status).toBe(201)
    const teamId2 = teamRes2.body.data._id

    const drawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: '',
          teams: { gov: teamId1, opp: teamId2 },
          chairs: [],
          panels: [],
          trainees: [],
        },
      ],
      drawOpened: true,
      allocationOpened: true,
    })
    expect(drawRes.status).toBe(201)

    const ballotRes1 = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: teamId1,
      teamBId: teamId2,
      winnerId: teamId1,
      speakerIdsA: [speakerId1],
      speakerIdsB: [speakerId2],
      scoresA: [75],
      scoresB: [72],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes1.status).toBe(201)

    const ballotRes2 = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: teamId1,
      teamBId: teamId2,
      winnerId: teamId2,
      speakerIdsA: [speakerId1],
      speakerIdsB: [speakerId2],
      scoresA: [71],
      scoresB: [74],
      submittedEntityId: 'judge-b',
    })
    expect(ballotRes2.status).toBe(201)

    const compileRes = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'submissions',
      options: {
        ranking_priority: {
          preset: 'custom',
          order: ['win', 'sum', 'margin', 'vote', 'average', 'sd'],
        },
        winner_policy: 'winner_id_then_score',
        tie_points: 0.5,
        duplicate_normalization: {
          merge_policy: 'average',
          poi_aggregation: 'average',
          best_aggregation: 'average',
        },
        missing_data_policy: 'warn',
        include_labels: ['teams'],
      },
    })
    expect(compileRes.status).toBe(201)
    expect(compileRes.body.data.payload.compile_options.duplicate_normalization.merge_policy).toBe(
      'average'
    )

    const teamResults = compileRes.body.data.payload.compiled_team_results
    expect(teamResults.length).toBe(2)
    const team1 = teamResults.find((row: any) => row.id === teamId1)
    const team2 = teamResults.find((row: any) => row.id === teamId2)
    expect(team1.details[0]?.acc).toBe(2)
    expect(team2.details[0]?.acc).toBe(2)
    expect(team1.vote).toBe(0)
    expect(team2.vote).toBe(0)
    expect(team1.win).toBe(0)
    expect(team2.win).toBe(0)
  })

  it('adds and removes tournament users', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'user-admin', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'user-admin', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'User Admin Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const addUserRes = await agent.post(`/api/tournaments/${tournamentId}/users`).send({
      username: 'user-guest',
      password: 'password123',
      role: 'speaker',
    })
    expect(addUserRes.status).toBe(201)
    expect(addUserRes.body.data.tournaments).toContain(tournamentId)
    expect('passwordHash' in addUserRes.body.data).toBe(false)

    const guest = request.agent(app)
    const guestLogin = await guest
      .post('/api/auth/login')
      .send({ username: 'user-guest', password: 'password123' })
    expect(guestLogin.status).toBe(200)
    expect(guestLogin.body.data.tournaments).toContain(tournamentId)

    const removeUserRes = await agent.delete(
      `/api/tournaments/${tournamentId}/users?username=user-guest`
    )
    expect(removeUserRes.status).toBe(200)
    expect(removeUserRes.body.data.tournaments).not.toContain(tournamentId)
    expect('passwordHash' in removeUserRes.body.data).toBe(false)
  })

  it('limits tournament payloads for non-admin viewers', async () => {
    const organizer = request.agent(app)

    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'tournament-scope-owner', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'tournament-scope-owner', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const openTournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Scope Open',
      style: 1,
      options: { privateFlag: 'open-secret' },
      user_defined_data: { ownerMemo: 'open-only' },
      total_round_num: 5,
      current_round_num: 2,
    })
    expect(openTournamentRes.status).toBe(201)
    const openTournamentId = openTournamentRes.body.data._id as string

    const protectedTournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Scope Protected',
      style: 1,
      options: { privateFlag: 'protected-secret' },
      user_defined_data: { ownerMemo: 'protected-only' },
      auth: { access: { required: true, password: 'scope-secret' } },
    })
    expect(protectedTournamentRes.status).toBe(201)
    const protectedTournamentId = protectedTournamentRes.body.data._id as string

    const publicList = await request(app).get('/api/tournaments')
    expect(publicList.status).toBe(200)
    const publicTournamentIds = publicList.body.data.map((item: any) => item._id)
    expect(publicTournamentIds).toContain(openTournamentId)
    expect(publicTournamentIds).not.toContain(protectedTournamentId)

    const publicOpenTournament = publicList.body.data.find((item: any) => item._id === openTournamentId)
    expect(publicOpenTournament).toBeTruthy()
    expect(publicOpenTournament.auth.access.required).toBe(false)
    expect('options' in publicOpenTournament).toBe(false)
    expect('user_defined_data' in publicOpenTournament).toBe(false)
    expect('createdBy' in publicOpenTournament).toBe(false)
    expect('style' in publicOpenTournament).toBe(true)
    expect('total_round_num' in publicOpenTournament).toBe(true)
    expect('current_round_num' in publicOpenTournament).toBe(true)

    const publicProtectedGet = await request(app).get(`/api/tournaments/${protectedTournamentId}`)
    expect(publicProtectedGet.status).toBe(401)

    const publicAgent = request.agent(app)
    const grantAccess = await publicAgent.post(`/api/tournaments/${protectedTournamentId}/access`).send({
      action: 'enter',
      password: 'scope-secret',
    })
    expect(grantAccess.status).toBe(200)

    const protectedAfterAccess = await publicAgent.get(`/api/tournaments/${protectedTournamentId}`)
    expect(protectedAfterAccess.status).toBe(200)
    expect(protectedAfterAccess.body.data.auth.access.required).toBe(true)
    expect('options' in protectedAfterAccess.body.data).toBe(false)
    expect('user_defined_data' in protectedAfterAccess.body.data).toBe(false)
    expect('createdBy' in protectedAfterAccess.body.data).toBe(false)

    const accessibleList = await publicAgent.get('/api/tournaments')
    expect(accessibleList.status).toBe(200)
    const accessibleIds = accessibleList.body.data.map((item: any) => item._id)
    expect(accessibleIds).toContain(protectedTournamentId)

    const adminProtectedGet = await organizer.get(`/api/tournaments/${protectedTournamentId}`)
    expect(adminProtectedGet.status).toBe(200)
    expect(adminProtectedGet.body.data.options.privateFlag).toBe('protected-secret')
    expect(adminProtectedGet.body.data.user_defined_data.ownerMemo).toBe('protected-only')
  })

  it('enforces organizer access and participant auth settings', async () => {
    const organizer = request.agent(app)

    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'organizer-a', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'organizer-a', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Protected Open',
      style: 1,
      options: {},
      auth: {
        access: { required: true, password: 'open-secret' },
      },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const teamRes = await organizer
      .post('/api/teams')
      .send({ tournamentId, name: 'Secret Team' })
    expect(teamRes.status).toBe(201)
    const teamIdA = teamRes.body.data._id

    const teamRes2 = await organizer
      .post('/api/teams')
      .send({ tournamentId, name: 'Hidden Team' })
    expect(teamRes2.status).toBe(201)
    const teamIdB = teamRes2.body.data._id

    const rawTeamRes = await organizer.post('/api/raw-results/teams').send([
      {
        tournamentId,
        id: teamIdA,
        from_id: 'judge-1',
        r: 1,
        weight: 1,
        win: 1,
        side: 'gov',
        opponents: [teamIdB],
      },
      {
        tournamentId,
        id: teamIdB,
        from_id: 'judge-1',
        r: 1,
        weight: 1,
        win: 0,
        side: 'opp',
        opponents: [teamIdA],
      },
    ])
    expect(rawTeamRes.status).toBe(201)

    const publicTeamsRes = await request(app).get(`/api/teams?tournamentId=${tournamentId}`)
    expect(publicTeamsRes.status).toBe(401)
    const publicRawRes = await request(app).get(`/api/raw-results/teams?tournamentId=${tournamentId}`)
    expect(publicRawRes.status).toBe(401)

    const createUserRes = await organizer.post(`/api/tournaments/${tournamentId}/users`).send({
      username: 'audience-user',
      password: 'password123',
      role: 'audience',
    })
    expect(createUserRes.status).toBe(201)

    const audience = request.agent(app)
    const audienceLogin = await audience
      .post('/api/auth/login')
      .send({ username: 'audience-user', password: 'password123' })
    expect(audienceLogin.status).toBe(200)

    const audienceTeamsRes = await audience.get(`/api/teams?tournamentId=${tournamentId}`)
    expect(audienceTeamsRes.status).toBe(401)
    const audienceRawRes = await audience.get(`/api/raw-results/teams?tournamentId=${tournamentId}`)
    expect(audienceRawRes.status).toBe(401)

    const feedbackBeforeAccess = await audience.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: 'judge-before-access',
      score: 7,
      submittedEntityId: teamIdA,
    })
    expect(feedbackBeforeAccess.status).toBe(401)

    const wrongAccessRes = await audience.post(`/api/tournaments/${tournamentId}/access`).send({
      action: 'enter',
      password: 'wrong-secret',
    })
    expect(wrongAccessRes.status).toBe(401)

    const accessRes = await audience.post(`/api/tournaments/${tournamentId}/access`).send({
      action: 'enter',
      password: 'open-secret',
    })
    expect(accessRes.status).toBe(200)
    expect(accessRes.body.data.tournamentId).toBe(tournamentId)
    expect(accessRes.body.data.version).toBe(1)
    expect(typeof accessRes.body.data.expiresAt).toBe('number')

    const audienceTeamsAfterAccessRes = await audience.get(`/api/teams?tournamentId=${tournamentId}`)
    expect(audienceTeamsAfterAccessRes.status).toBe(200)
    const audienceRawAfterAccessRes = await audience.get(`/api/raw-results/teams?tournamentId=${tournamentId}`)
    expect(audienceRawAfterAccessRes.status).toBe(200)
    expect(Array.isArray(audienceRawAfterAccessRes.body.data)).toBe(true)
    expect(audienceRawAfterAccessRes.body.data.length).toBe(2)
    expect('from_id' in audienceRawAfterAccessRes.body.data[0]).toBe(false)

    const feedbackAfterAccess = await audience.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: 'judge-after-access',
      score: 8,
      submittedEntityId: teamIdA,
    })
    expect(feedbackAfterAccess.status).toBe(201)

    const exitAccessRes = await audience.post(`/api/tournaments/${tournamentId}/exit`).send()
    expect(exitAccessRes.status).toBe(200)

    const audienceTeamsAfterExitRes = await audience.get(`/api/teams?tournamentId=${tournamentId}`)
    expect(audienceTeamsAfterExitRes.status).toBe(401)

    const rotatePasswordRes = await organizer.patch(`/api/tournaments/${tournamentId}`).send({
      auth: { access: { password: 'rotated-secret', required: true } },
    })
    expect(rotatePasswordRes.status).toBe(200)

    const staleAccessRes = await audience.get(`/api/teams?tournamentId=${tournamentId}`)
    expect(staleAccessRes.status).toBe(401)

    const rotatedAccessRes = await audience.post(`/api/tournaments/${tournamentId}/access`).send({
      action: 'enter',
      password: 'rotated-secret',
    })
    expect(rotatedAccessRes.status).toBe(200)

    const audienceTeamsAfterRotateRes = await audience.get(`/api/teams?tournamentId=${tournamentId}`)
    expect(audienceTeamsAfterRotateRes.status).toBe(200)

    const otherOrganizer = request.agent(app)
    const otherReg = await otherOrganizer
      .post('/api/auth/register')
      .send({ username: 'organizer-b', password: 'password123', role: 'organizer' })
    expect(otherReg.status).toBe(201)
    const otherLogin = await otherOrganizer
      .post('/api/auth/login')
      .send({ username: 'organizer-b', password: 'password123' })
    expect(otherLogin.status).toBe(200)

    const forbiddenDelete = await otherOrganizer.delete(`/api/tournaments/${tournamentId}`)
    expect(forbiddenDelete.status).toBe(403)

    const speaker = request.agent(app)
    const speakerReg = await speaker
      .post('/api/auth/register')
      .send({ username: 'speaker-user', password: 'password123', role: 'speaker' })
    expect(speakerReg.status).toBe(201)
    const speakerLogin = await speaker
      .post('/api/auth/login')
      .send({ username: 'speaker-user', password: 'password123' })
    expect(speakerLogin.status).toBe(200)

    const forbiddenCreate = await speaker.post('/api/tournaments').send({
      name: 'Forbidden Open',
      style: 1,
      options: {},
    })
    expect(forbiddenCreate.status).toBe(403)
  })

  it('records audit logs and supports filtered cursor pagination', async () => {
    const organizer = request.agent(app)

    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'audit-owner', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'audit-owner', password: 'password123' })
    expect(loginRes.status).toBe(200)
    const userId = loginRes.body.data.userId as string

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Audit Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const createTeamA = await organizer.post('/api/teams').send({ tournamentId, name: 'Audit Team 1' })
    expect(createTeamA.status).toBe(201)
    const teamIdA = createTeamA.body.data._id as string

    const createTeamB = await organizer.post('/api/teams').send({ tournamentId, name: 'Audit Team 2' })
    expect(createTeamB.status).toBe(201)

    const updateTeamA = await organizer
      .patch(`/api/teams/${teamIdA}`)
      .send({ tournamentId, name: 'Audit Team 1 Updated' })
    expect(updateTeamA.status).toBe(200)

    const deleteTeamA = await organizer.delete(`/api/teams/${teamIdA}?tournamentId=${tournamentId}`)
    expect(deleteTeamA.status).toBe(200)

    const firstPage = await waitForResult(
      () => organizer.get(`/api/audit-logs?tournamentId=${tournamentId}&action=team.create&limit=1`),
      (res) => res.status === 200 && (res.body.data?.items?.length ?? 0) > 0
    )
    expect(firstPage.status).toBe(200)
    expect(firstPage.body.data.items.length).toBe(1)
    expect(firstPage.body.data.nextCursor).toBeTruthy()

    const firstLog = firstPage.body.data.items[0]
    expect(firstLog.action).toBe('team.create')
    expect(firstLog.targetType).toBe('team')
    expect(firstLog.tournamentId).toBe(tournamentId)
    expect(firstLog.actorUserId).toBe(userId)
    expect(firstLog.actorRole).toBe('organizer')
    expect(typeof firstLog.ip).toBe('string')
    expect(typeof firstLog.userAgent).toBe('string')

    const cursor = encodeURIComponent(firstPage.body.data.nextCursor as string)
    const secondPage = await organizer.get(
      `/api/audit-logs?tournamentId=${tournamentId}&action=team.create&limit=1&cursor=${cursor}`
    )
    expect(secondPage.status).toBe(200)
    expect(secondPage.body.data.items.length).toBeGreaterThanOrEqual(1)
    expect(secondPage.body.data.items[0].action).toBe('team.create')

    const from = encodeURIComponent(new Date(Date.now() - 60_000).toISOString())
    const to = encodeURIComponent(new Date(Date.now() + 60_000).toISOString())
    const actorFilter = await waitForResult(
      () =>
        organizer.get(
          `/api/audit-logs?tournamentId=${tournamentId}&actorUserId=${userId}&action=team.delete&from=${from}&to=${to}`
        ),
      (res) => res.status === 200 && (res.body.data?.items?.length ?? 0) > 0
    )
    expect(actorFilter.status).toBe(200)
    expect(actorFilter.body.data.items[0].action).toBe('team.delete')
    expect(actorFilter.body.data.items[0].actorUserId).toBe(userId)

    const missingTournamentId = await organizer.get('/api/audit-logs')
    expect(missingTournamentId.status).toBe(400)

    const outsider = request.agent(app)
    const outsiderRegister = await outsider
      .post('/api/auth/register')
      .send({ username: 'audit-outsider', password: 'password123', role: 'organizer' })
    expect(outsiderRegister.status).toBe(201)
    const outsiderLogin = await outsider
      .post('/api/auth/login')
      .send({ username: 'audit-outsider', password: 'password123' })
    expect(outsiderLogin.status).toBe(200)

    const forbidden = await outsider.get(`/api/audit-logs?tournamentId=${tournamentId}`)
    expect(forbidden.status).toBe(403)
  })

  it('migrates legacy tournament access and membership data (phase 8)', async () => {
    const { runSecurityPhase8Migration } = await import('../src/scripts/migrate-security-phase8.js')

    const organizerPassword = 'password123'
    const organizer = await UserModel.create({
      username: 'phase8-organizer',
      role: 'organizer',
      passwordHash: await hashPassword(organizerPassword),
      tournaments: [],
    })

    const speaker = await UserModel.create({
      username: 'phase8-speaker',
      role: 'speaker',
      passwordHash: await hashPassword('password123'),
      tournaments: [],
    })

    const legacyOpenTournament = await TournamentModel.create({
      name: 'Phase8 Legacy Open',
      style: 1,
      options: {},
      auth: { access: { required: true, version: 0 } },
    })
    const legacyProtectedTournament = await TournamentModel.create({
      name: 'Phase8 Legacy Protected',
      style: 1,
      options: {},
      auth: { access: { required: true, password: 'legacy-secret', version: 0 } },
    })
    const creatorTournament = await TournamentModel.create({
      name: 'Phase8 Creator Tournament',
      style: 1,
      options: {},
      auth: { access: { required: false, version: 1 } },
      createdBy: String(organizer._id),
    })

    await UserModel.updateOne(
      { _id: organizer._id },
      { $set: { tournaments: [String(legacyProtectedTournament._id)] } }
    ).exec()
    await UserModel.updateOne(
      { _id: speaker._id },
      { $set: { tournaments: [String(legacyOpenTournament._id)] } }
    ).exec()

    const membershipBeforeMigration = await TournamentMemberModel.findOne({
      tournamentId: String(creatorTournament._id),
      userId: String(organizer._id),
    })
      .lean()
      .exec()
    expect(membershipBeforeMigration).toBeNull()

    const openBeforeMigration = await request(app).get(
      `/api/teams?tournamentId=${String(legacyOpenTournament._id)}`
    )
    expect(openBeforeMigration.status).toBe(401)

    const firstRun = await runSecurityPhase8Migration()
    expect(firstRun.tournamentsUpdated).toBeGreaterThan(0)

    const migratedOpen = await TournamentModel.findById(legacyOpenTournament._id).lean().exec()
    const migratedProtected = await TournamentModel.findById(legacyProtectedTournament._id)
      .lean()
      .exec()

    expect((migratedOpen as any).auth.access.required).toBe(false)
    expect((migratedOpen as any).auth.access.version).toBe(1)
    expect((migratedProtected as any).auth.access.required).toBe(true)
    expect((migratedProtected as any).auth.access.version).toBe(1)
    expect((migratedProtected as any).auth.access.password).toBeUndefined()
    expect(typeof (migratedProtected as any).auth.access.passwordHash).toBe('string')
    expect(
      await verifyPassword(
        'legacy-secret',
        String((migratedProtected as any).auth.access.passwordHash)
      )
    ).toBe(true)

    const openAfterMigration = await request(app).get(
      `/api/teams?tournamentId=${String(legacyOpenTournament._id)}`
    )
    expect(openAfterMigration.status).toBe(200)

    const protectedAccessWithWrongPassword = await request(app)
      .post(`/api/tournaments/${String(legacyProtectedTournament._id)}/access`)
      .send({ action: 'enter', password: 'wrong-password' })
    expect(protectedAccessWithWrongPassword.status).toBe(401)

    const protectedAccessWithCorrectPassword = await request(app)
      .post(`/api/tournaments/${String(legacyProtectedTournament._id)}/access`)
      .send({ action: 'enter', password: 'legacy-secret' })
    expect(protectedAccessWithCorrectPassword.status).toBe(200)

    const speakerMembership = await TournamentMemberModel.findOne({
      tournamentId: String(legacyOpenTournament._id),
      userId: String(speaker._id),
    })
      .lean()
      .exec()
    expect(speakerMembership?.role).toBe('speaker')

    const organizerMembership = await TournamentMemberModel.findOne({
      tournamentId: String(legacyProtectedTournament._id),
      userId: String(organizer._id),
    })
      .lean()
      .exec()
    expect(organizerMembership?.role).toBe('organizer')

    const creatorMembership = await TournamentMemberModel.findOne({
      tournamentId: String(creatorTournament._id),
      userId: String(organizer._id),
    })
      .lean()
      .exec()
    expect(creatorMembership?.role).toBe('organizer')

    const organizerAgent = request.agent(app)
    const organizerLogin = await organizerAgent
      .post('/api/auth/login')
      .send({ username: 'phase8-organizer', password: organizerPassword })
    expect(organizerLogin.status).toBe(200)

    const patchByCreatorMembership = await organizerAgent
      .patch(`/api/tournaments/${String(creatorTournament._id)}`)
      .send({ name: 'Phase8 Creator Tournament Updated' })
    expect(patchByCreatorMembership.status).toBe(200)

    const secondRun = await runSecurityPhase8Migration()
    expect(secondRun.tournamentsUpdated).toBe(0)
    expect(secondRun.membershipsCreatedFromUsers).toBe(0)
    expect(secondRun.membershipsCreatedFromCreatedBy).toBe(0)
    expect(secondRun.tournamentAccessRelaxed).toBe(0)
    expect(secondRun.tournamentPasswordsHashed).toBe(0)
  })

  it('blocks superuser self registration and requires organizer membership for admin operations', async () => {
    const superuserRegister = await request(app).post('/api/auth/register').send({
      username: 'illegal-superuser',
      password: 'password123',
      role: 'superuser',
    })
    expect(superuserRegister.status).toBe(403)

    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'organizer-c', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'organizer-c', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Membership Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const removeSelf = await organizer.delete(`/api/tournaments/${tournamentId}/users?username=organizer-c`)
    expect(removeSelf.status).toBe(200)

    const forbiddenPatch = await organizer
      .patch(`/api/tournaments/${tournamentId}`)
      .send({ name: 'Membership Open Updated' })
    expect(forbiddenPatch.status).toBe(403)
  })

  it('returns validation errors for malformed payloads and unknown routes', async () => {
    const notFoundRoute = await request(app).get('/api/does-not-exist')
    expect(notFoundRoute.status).toBe(404)
    expect(notFoundRoute.body.errors[0].name).toBe('NotFound')

    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'validator-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'validator-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const invalidProtectedCreate = await organizer.post('/api/tournaments').send({
      name: 'Invalid Protected Open',
      style: 1,
      options: {},
      auth: { access: { required: true } },
    })
    expect(invalidProtectedCreate.status).toBe(400)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Validation Open',
      style: 1,
      options: {},
      auth: { access: { required: true, password: 'secret-123' } },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const emptyPatch = await organizer.patch(`/api/tournaments/${tournamentId}`).send({})
    expect(emptyPatch.status).toBe(400)
    expect(emptyPatch.body.errors[0].message).toBe('update payload is required')

    const invalidPasswordPatch = await organizer.patch(`/api/tournaments/${tournamentId}`).send({
      auth: { access: { password: 123 } },
    })
    expect(invalidPasswordPatch.status).toBe(400)

    const invalidRoundFilter = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&round=0`
    )
    expect(invalidRoundFilter.status).toBe(400)
    expect(invalidRoundFilter.body.errors.some((issue: any) => issue.path === 'round')).toBe(true)
  })

  it('deduplicates submissions for the same submitted entity per round', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'submission-dedupe', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'submission-dedupe', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Submission Dedupe Open',
      style: 1,
      options: {},
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const firstBallot = await organizer.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [75],
      scoresB: [72],
      comment: 'first submission',
      submittedEntityId: 'team-a',
    })
    expect(firstBallot.status).toBe(201)

    const secondBallot = await organizer.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-b',
      scoresA: [70],
      scoresB: [76],
      comment: 'second submission',
      submittedEntityId: 'team-a',
    })
    expect(secondBallot.status).toBe(201)

    const adminList = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&round=1&type=ballot`
    )
    expect(adminList.status).toBe(200)
    expect(adminList.body.data.length).toBe(1)
    expect(adminList.body.data[0].payload.comment).toBe('second submission')

    const participantList = await organizer.get(
      `/api/submissions/mine?tournamentId=${tournamentId}&round=1&type=ballot&submittedEntityId=team-a`
    )
    expect(participantList.status).toBe(200)
    expect(participantList.body.data.length).toBe(1)
    expect(participantList.body.data[0].payload.winnerId).toBe('team-b')
  })

  it('applies forced public draw sanitization even for admins', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'draw-public-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'draw-public-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Draw Public Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const upsert = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      drawOpened: true,
      allocationOpened: false,
      locked: true,
      allocation: [
        {
          venue: 'Room A',
          teams: { gov: 'team-a', opp: 'team-b' },
          chairs: ['chair-1'],
          panels: ['panel-1'],
          trainees: ['trainee-1'],
        },
      ],
    })
    expect(upsert.status).toBe(201)

    const adminDraws = await organizer.get(`/api/draws?tournamentId=${tournamentId}`)
    expect(adminDraws.status).toBe(200)
    expect(adminDraws.body.data[0].allocation[0].chairs).toEqual(['chair-1'])
    expect(adminDraws.body.data[0].locked).toBe(true)

    const forcedPublic = await organizer.get(`/api/draws?tournamentId=${tournamentId}&public=1`)
    expect(forcedPublic.status).toBe(200)
    expect(forcedPublic.body.data[0].allocation[0].chairs).toEqual([])
    expect(forcedPublic.body.data[0].allocation[0].panels).toEqual([])
    expect(forcedPublic.body.data[0].allocation[0].trainees).toEqual([])
    expect('locked' in forcedPublic.body.data[0]).toBe(false)
    expect('createdBy' in forcedPublic.body.data[0]).toBe(false)
  })

  it('keeps auth endpoints responsive under repeated attempts in test mode', async () => {
    const statuses: number[] = []
    const agent = request.agent(app)
    for (let i = 0; i < 30; i += 1) {
      const res = await agent
        .post('/api/auth/login')
        .send({ username: 'missing-user', password: 'wrong-password' })
      statuses.push(res.status)
    }
    expect(statuses).not.toContain(429)
    expect(statuses.every((status) => status === 401)).toBe(true)
  })
})
