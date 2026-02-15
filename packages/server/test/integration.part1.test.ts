import request from 'supertest'
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
  throw (lastError ?? new Error('waitForResult timed out without a successful response'))
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
    expect('compile_source' in publicCompiled.body.data.payload).toBe(false)
    expect('compile_options' in publicCompiled.body.data.payload).toBe(false)
    expect('compile_warnings' in publicCompiled.body.data.payload).toBe(false)
    expect('compile_diff_meta' in publicCompiled.body.data.payload).toBe(false)

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

  it('supports institution category and priority fields', async () => {
    const agent = request.agent(app)
    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'institution-meta-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'institution-meta-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Institution Meta Open',
      style: 1,
      options: {},
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const createRes = await agent.post('/api/institutions').send({
      tournamentId,
      name: 'Region East',
      category: 'region',
      priority: 2.5,
    })
    expect(createRes.status).toBe(201)
    const institutionId = createRes.body.data._id as string
    expect(createRes.body.data.category).toBe('region')
    expect(createRes.body.data.priority).toBe(2.5)

    const updateRes = await agent.patch(`/api/institutions/${institutionId}`).send({
      tournamentId,
      category: 'league',
      priority: 4,
    })
    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data.category).toBe('league')
    expect(updateRes.body.data.priority).toBe(4)

    const listRes = await agent.get(`/api/institutions?tournamentId=${tournamentId}`)
    expect(listRes.status).toBe(200)
    expect(listRes.body.data).toHaveLength(1)
    expect(listRes.body.data[0].category).toBe('league')
    expect(listRes.body.data[0].priority).toBe(4)
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
    expect(compiledRes.body.data.payload.compile_source).toBe('raw')
    expect(compiledRes.body.data.payload.compiled_team_results.length).toBe(2)
    expect(compiledRes.body.data.payload.compiled_speaker_results.length).toBe(2)
    expect(compiledRes.body.data.payload.compiled_adjudicator_results.length).toBe(0)
    expect(compiledRes.body.data.payload.compile_options).toEqual(compileOptions)
    const snapshotId = compiledRes.body.data._id as string
    expect(typeof snapshotId).toBe('string')
    expect(snapshotId.length).toBeGreaterThan(0)

    const compiledTeamsRes = await agent
      .post('/api/compiled/teams')
      .send({ tournamentId, source: 'raw' })
    expect(compiledTeamsRes.status).toBe(201)
    expect(compiledTeamsRes.body.data.results.length).toBe(2)
    expect(compiledTeamsRes.body.data.compile_source).toBe('raw')
    expect(compiledTeamsRes.body.data.rounds[0]?.name).toBe('Round One')
    expect(compiledTeamsRes.body.data.rounds.length).toBeGreaterThan(0)
    expect(compiledTeamsRes.body.data.compile_options.winner_policy).toBe('winner_id_then_score')
    expect(compiledTeamsRes.body.data.compile_options.tie_points).toBe(0.5)

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
      snapshotId,
      options: { team_allocation_algorithm: 'standard' },
    })
    expect(teamAllocRes.status).toBe(200)
    expect(teamAllocRes.body.data.allocation.length).toBeGreaterThan(0)

    const powerpairTeamAllocRes = await agent.post('/api/allocations/teams').send({
      tournamentId,
      round: 1,
      snapshotId,
      options: {
        team_allocation_algorithm: 'powerpair',
        team_allocation_algorithm_options: {
          odd_bracket: 'pullup_top',
          pairing_method: 'fold',
          avoid_conflicts: 'one_up_one_down',
        },
      },
    })
    expect(powerpairTeamAllocRes.status).toBe(200)
    expect(powerpairTeamAllocRes.body.data.allocation.length).toBeGreaterThan(0)
    expect(powerpairTeamAllocRes.body.data.userDefinedData?.team_allocation_algorithm).toBe(
      'powerpair'
    )
    expect(powerpairTeamAllocRes.body.data.userDefinedData?.powerpair?.brackets?.length).toBeGreaterThan(0)

    const adjAllocRes = await agent.post('/api/allocations/adjudicators').send({
      tournamentId,
      round: 1,
      snapshotId,
      allocation: teamAllocRes.body.data.allocation,
      options: { numbers_of_adjudicators: { chairs: 1, panels: 0, trainees: 0 } },
    })
    expect(adjAllocRes.status).toBe(200)
    expect(adjAllocRes.body.data.allocation.length).toBeGreaterThan(0)

    const venueAllocRes = await agent.post('/api/allocations/venues').send({
      tournamentId,
      round: 1,
      snapshotId,
      allocation: adjAllocRes.body.data.allocation,
      options: { venue_allocation_algorithm_options: { shuffle: false } },
    })
    expect(venueAllocRes.status).toBe(200)
    expect(venueAllocRes.body.data.allocation.length).toBeGreaterThan(0)

    const missingSnapshotRes = await agent.post('/api/allocations/teams').send({
      tournamentId,
      round: 1,
      options: { team_allocation_algorithm: 'standard' },
    })
    expect(missingSnapshotRes.status).toBe(400)

    const otherTournamentRes = await agent.post('/api/tournaments').send({
      name: 'Legacy Open B',
      style: styleId,
      options: { style: { team_num: 2, score_weights: [1, 1, 1] } },
      total_round_num: 2,
    })
    expect(otherTournamentRes.status).toBe(201)
    const otherTournamentId = otherTournamentRes.body.data._id as string

    const crossTournamentSnapshotRes = await agent.post('/api/allocations/teams').send({
      tournamentId: otherTournamentId,
      round: 1,
      snapshotId,
      options: { team_allocation_algorithm: 'standard' },
    })
    expect(crossTournamentSnapshotRes.status).toBe(404)
    expect(crossTournamentSnapshotRes.body.errors?.[0]?.message).toBe(
      'Compiled snapshot not found for tournament'
    )

    const powerpairDrawRes = await agent.post('/api/draws/generate').send({
      tournamentId,
      round: 1,
      save: false,
      options: {
        team_allocation_algorithm: 'powerpair',
        team_allocation_algorithm_options: {
          odd_bracket: 'pullup_top',
          pairing_method: 'fold',
          avoid_conflicts: 'one_up_one_down',
        },
      },
    })
    expect(powerpairDrawRes.status).toBe(200)
    expect(powerpairDrawRes.body.data.allocation.length).toBeGreaterThan(0)
    expect(powerpairDrawRes.body.data.userDefinedData?.team_allocation_algorithm).toBe('powerpair')
  })

  it('previews and saves break participants while syncing team availability', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'break-admin', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'break-admin', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleRes = await agent.get('/api/styles')
    expect(styleRes.status).toBe(200)
    const styleId = styleRes.body.data?.[0]?.id
    expect(typeof styleId).toBe('number')

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Break Preview Open',
      style: styleId,
      options: {
        style: {
          team_num: 2,
          score_weights: [1],
        },
      },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const teamsRes = await agent.post('/api/teams').send([
      { tournamentId, name: 'Alpha' },
      { tournamentId, name: 'Beta' },
      { tournamentId, name: 'Gamma' },
      { tournamentId, name: 'Delta' },
    ])
    expect(teamsRes.status).toBe(201)
    const teams = teamsRes.body.data as Array<{ _id: string; name: string }>

    const round1Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 1, name: 'R1' })
    expect(round1Res.status).toBe(201)
    const round2Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 2, name: 'Break QF' })
    expect(round2Res.status).toBe(201)
    const breakRoundId = round2Res.body.data._id as string

    const teamByName = new Map<string, string>(teams.map((team) => [team.name, team._id]))
    const alphaId = teamByName.get('Alpha')!
    const betaId = teamByName.get('Beta')!
    const gammaId = teamByName.get('Gamma')!
    const deltaId = teamByName.get('Delta')!

    const rawTeamsRes = await agent.post('/api/raw-results/teams').send([
      {
        tournamentId,
        id: alphaId,
        from_id: 'seed-r1',
        r: 1,
        win: 1,
        sum: 75,
        margin: 5,
        opponents: [deltaId],
        side: 'gov',
      },
      {
        tournamentId,
        id: deltaId,
        from_id: 'seed-r1',
        r: 1,
        win: 0,
        sum: 70,
        margin: -5,
        opponents: [alphaId],
        side: 'opp',
      },
      {
        tournamentId,
        id: betaId,
        from_id: 'seed-r1',
        r: 1,
        win: 1,
        sum: 74,
        margin: 3,
        opponents: [gammaId],
        side: 'gov',
      },
      {
        tournamentId,
        id: gammaId,
        from_id: 'seed-r1',
        r: 1,
        win: 0,
        sum: 71,
        margin: -3,
        opponents: [betaId],
        side: 'opp',
      },
    ])
    expect(rawTeamsRes.status).toBe(201)

    const candidatesRes = await agent.post(`/api/rounds/${breakRoundId}/break/candidates`).send({
      tournamentId,
      source: 'raw',
      sourceRounds: [1],
      size: 2,
    })
    expect(candidatesRes.status).toBe(200)
    expect(candidatesRes.body.data.sourceRounds).toEqual([1])
    expect(candidatesRes.body.data.candidates.length).toBe(4)
    expect(candidatesRes.body.data.candidates[0].teamId).toBe(alphaId)
    expect(candidatesRes.body.data.candidates[1].teamId).toBe(betaId)

    const saveBreakRes = await agent.patch(`/api/rounds/${breakRoundId}/break`).send({
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [1],
        size: 2,
        cutoff_tie_policy: 'manual',
        seeding: 'high_low',
        participants: [
          { teamId: alphaId, seed: 1 },
          { teamId: betaId, seed: 2 },
        ],
      },
      syncTeamAvailability: true,
    })
    expect(saveBreakRes.status).toBe(200)
    expect(saveBreakRes.body.data.break.participants).toEqual([
      { teamId: alphaId, seed: 1 },
      { teamId: betaId, seed: 2 },
    ])

    const updatedRoundRes = await agent
      .get(`/api/rounds/${breakRoundId}`)
      .query({ tournamentId })
    expect(updatedRoundRes.status).toBe(200)
    expect(updatedRoundRes.body.data.userDefinedData.break.enabled).toBe(true)
    expect(updatedRoundRes.body.data.userDefinedData.break.participants).toHaveLength(2)

    const updatedTeamsRes = await agent.get('/api/teams').query({ tournamentId })
    expect(updatedTeamsRes.status).toBe(200)
    const updatedTeams = updatedTeamsRes.body.data as Array<{ _id: string; details?: any[] }>
    const availabilityByTeam = new Map<string, boolean>()
    updatedTeams.forEach((team) => {
      const detail = team.details?.find((item: any) => Number(item.r) === 2)
      availabilityByTeam.set(team._id, detail?.available !== false)
    })
    expect(availabilityByTeam.get(alphaId)).toBe(true)
    expect(availabilityByTeam.get(betaId)).toBe(true)
    expect(availabilityByTeam.get(gammaId)).toBe(false)
    expect(availabilityByTeam.get(deltaId)).toBe(false)
  })

  it('inherits tournament round defaults when creating rounds', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'round-defaults-admin', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'round-defaults-admin', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleRes = await agent.get('/api/styles')
    expect(styleRes.status).toBe(200)
    const styleId = styleRes.body.data?.[0]?.id
    expect(typeof styleId).toBe('number')

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Round Defaults Open',
      style: styleId,
      options: { style: { team_num: 2, score_weights: [1] } },
      user_defined_data: {
        round_defaults: {
          userDefinedData: {
            evaluate_from_adjudicators: false,
            evaluate_from_teams: true,
            chairs_always_evaluated: true,
            evaluator_in_team: 'speaker',
            no_speaker_score: true,
            score_by_matter_manner: false,
            poi: false,
            best: true,
            allow_low_tie_win: false,
          },
          break: {
            source: 'raw',
            size: 16,
            cutoff_tie_policy: 'include_all',
            seeding: 'high_low',
          },
        },
      },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const round1Res = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'R1',
    })
    expect(round1Res.status).toBe(201)
    expect(round1Res.body.data.userDefinedData.evaluate_from_adjudicators).toBe(false)
    expect(round1Res.body.data.userDefinedData.chairs_always_evaluated).toBe(true)
    expect(round1Res.body.data.userDefinedData.evaluator_in_team).toBe('speaker')
    expect(round1Res.body.data.userDefinedData.no_speaker_score).toBe(true)
    expect(round1Res.body.data.userDefinedData.score_by_matter_manner).toBe(false)
    expect(round1Res.body.data.userDefinedData.poi).toBe(false)
    expect(round1Res.body.data.userDefinedData.allow_low_tie_win).toBe(false)
    expect(round1Res.body.data.userDefinedData.break.size).toBe(16)
    expect(round1Res.body.data.userDefinedData.break.source).toBe('raw')
    expect(round1Res.body.data.userDefinedData.break.cutoff_tie_policy).toBe('include_all')

    const round2Res = await agent.post('/api/rounds').send({
      tournamentId,
      round: 2,
      name: 'R2',
      userDefinedData: {
        no_speaker_score: false,
        break: {
          enabled: true,
          source_rounds: [1],
          size: 4,
          cutoff_tie_policy: 'strict',
          seeding: 'high_low',
          participants: [],
        },
      },
    })
    expect(round2Res.status).toBe(201)
    expect(round2Res.body.data.userDefinedData.evaluate_from_adjudicators).toBe(false)
    expect(round2Res.body.data.userDefinedData.no_speaker_score).toBe(false)
    expect(round2Res.body.data.userDefinedData.break.enabled).toBe(true)
    expect(round2Res.body.data.userDefinedData.break.size).toBe(4)
    expect(round2Res.body.data.userDefinedData.break.cutoff_tie_policy).toBe('strict')
  })

  it('keeps teams available when break is enabled with empty participants and sync is enabled', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'break-empty-sync', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'break-empty-sync', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleRes = await agent.get('/api/styles')
    expect(styleRes.status).toBe(200)
    const styleId = styleRes.body.data?.[0]?.id
    expect(typeof styleId).toBe('number')

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Break Empty Sync Open',
      style: styleId,
      options: {
        style: {
          team_num: 2,
          score_weights: [1],
        },
      },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const teamsRes = await agent.post('/api/teams').send([
      { tournamentId, name: 'Alpha' },
      { tournamentId, name: 'Beta' },
      { tournamentId, name: 'Gamma' },
      { tournamentId, name: 'Delta' },
    ])
    expect(teamsRes.status).toBe(201)
    const teams = teamsRes.body.data as Array<{ _id: string; name: string }>
    const teamByName = new Map<string, string>(teams.map((team) => [team.name, team._id]))
    const alphaId = teamByName.get('Alpha')!
    const betaId = teamByName.get('Beta')!

    const round1Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 1, name: 'R1' })
    expect(round1Res.status).toBe(201)
    const round2Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 2, name: 'Break QF' })
    expect(round2Res.status).toBe(201)
    const breakRoundId = round2Res.body.data._id as string

    const initialBreakRes = await agent.patch(`/api/rounds/${breakRoundId}/break`).send({
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [1],
        size: 2,
        cutoff_tie_policy: 'manual',
        seeding: 'high_low',
        participants: [
          { teamId: alphaId, seed: 1 },
          { teamId: betaId, seed: 2 },
        ],
      },
      syncTeamAvailability: true,
    })
    expect(initialBreakRes.status).toBe(200)

    const clearParticipantsRes = await agent.patch(`/api/rounds/${breakRoundId}/break`).send({
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [1],
        size: 2,
        cutoff_tie_policy: 'manual',
        seeding: 'high_low',
        participants: [],
      },
      syncTeamAvailability: true,
    })
    expect(clearParticipantsRes.status).toBe(200)

    const updatedTeamsRes = await agent.get('/api/teams').query({ tournamentId })
    expect(updatedTeamsRes.status).toBe(200)
    const updatedTeams = updatedTeamsRes.body.data as Array<{ _id: string; details?: any[] }>
    for (const team of updatedTeams) {
      const detail = team.details?.find((item: any) => Number(item.r) === 2)
      expect(detail?.available).toBe(true)
    }
  })

  it('allows disabling break even when saved participants include deleted teams', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'break-disable-stale', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'break-disable-stale', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleRes = await agent.get('/api/styles')
    expect(styleRes.status).toBe(200)
    const styleId = styleRes.body.data?.[0]?.id
    expect(typeof styleId).toBe('number')

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Break Disable Stale Open',
      style: styleId,
      options: {
        style: {
          team_num: 2,
          score_weights: [1],
        },
      },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const teamsRes = await agent.post('/api/teams').send([
      { tournamentId, name: 'Alpha' },
      { tournamentId, name: 'Beta' },
      { tournamentId, name: 'Gamma' },
    ])
    expect(teamsRes.status).toBe(201)
    const teams = teamsRes.body.data as Array<{ _id: string; name: string }>
    const teamByName = new Map<string, string>(teams.map((team) => [team.name, team._id]))
    const alphaId = teamByName.get('Alpha')!
    const betaId = teamByName.get('Beta')!

    const round1Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 1, name: 'R1' })
    expect(round1Res.status).toBe(201)
    const round2Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 2, name: 'Break QF' })
    expect(round2Res.status).toBe(201)
    const breakRoundId = round2Res.body.data._id as string

    const saveBreakRes = await agent.patch(`/api/rounds/${breakRoundId}/break`).send({
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [1],
        size: 2,
        cutoff_tie_policy: 'manual',
        seeding: 'high_low',
        participants: [
          { teamId: alphaId, seed: 1 },
          { teamId: betaId, seed: 2 },
        ],
      },
      syncTeamAvailability: true,
    })
    expect(saveBreakRes.status).toBe(200)

    const deleteTeamRes = await agent.delete(`/api/teams/${alphaId}?tournamentId=${tournamentId}`)
    expect(deleteTeamRes.status).toBe(200)

    const disableBreakRes = await agent.patch(`/api/rounds/${breakRoundId}/break`).send({
      tournamentId,
      break: {
        enabled: false,
        source_rounds: [1],
        size: 2,
        cutoff_tie_policy: 'manual',
        seeding: 'high_low',
        participants: [
          // stale participant reference should not block disabling break
          { teamId: alphaId, seed: 1 },
          { teamId: betaId, seed: 2 },
        ],
      },
      syncTeamAvailability: true,
    })
    expect(disableBreakRes.status).toBe(200)
    expect(disableBreakRes.body.data.break.enabled).toBe(false)

    const updatedRoundRes = await agent
      .get(`/api/rounds/${breakRoundId}`)
      .query({ tournamentId })
    expect(updatedRoundRes.status).toBe(200)
    expect(updatedRoundRes.body.data.userDefinedData.break.enabled).toBe(false)
  })

  it('generates break allocation with byes and advances winners to next round', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'break-flow', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'break-flow', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleRes = await agent.get('/api/styles')
    expect(styleRes.status).toBe(200)
    const styleId = styleRes.body.data?.[0]?.id

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Break Flow Open',
      style: styleId,
      options: {
        style: {
          team_num: 2,
          score_weights: [1],
        },
      },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const teamsRes = await agent.post('/api/teams').send([
      { tournamentId, name: 'Alpha' },
      { tournamentId, name: 'Beta' },
      { tournamentId, name: 'Gamma' },
      { tournamentId, name: 'Delta' },
    ])
    expect(teamsRes.status).toBe(201)
    const teams = teamsRes.body.data as Array<{ _id: string; name: string }>
    const teamByName = new Map<string, string>(teams.map((team) => [team.name, team._id]))
    const alphaId = teamByName.get('Alpha')!
    const betaId = teamByName.get('Beta')!
    const gammaId = teamByName.get('Gamma')!
    const deltaId = teamByName.get('Delta')!

    const round1Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 1, name: 'R1' })
    expect(round1Res.status).toBe(201)
    const round2Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 2, name: 'Break R1' })
    expect(round2Res.status).toBe(201)
    const round3Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 3, name: 'Break R2' })
    expect(round3Res.status).toBe(201)
    const round2Id = round2Res.body.data._id as string
    const round3Id = round3Res.body.data._id as string

    const rawTeamsRes = await agent.post('/api/raw-results/teams').send([
      {
        tournamentId,
        id: alphaId,
        from_id: 'seed-r1',
        r: 1,
        win: 1,
        sum: 75,
        margin: 5,
        opponents: [deltaId],
        side: 'gov',
      },
      {
        tournamentId,
        id: deltaId,
        from_id: 'seed-r1',
        r: 1,
        win: 0,
        sum: 70,
        margin: -5,
        opponents: [alphaId],
        side: 'opp',
      },
      {
        tournamentId,
        id: betaId,
        from_id: 'seed-r1',
        r: 1,
        win: 1,
        sum: 74,
        margin: 3,
        opponents: [gammaId],
        side: 'gov',
      },
      {
        tournamentId,
        id: gammaId,
        from_id: 'seed-r1',
        r: 1,
        win: 0,
        sum: 71,
        margin: -3,
        opponents: [betaId],
        side: 'opp',
      },
    ])
    expect(rawTeamsRes.status).toBe(201)

    const round2BreakRes = await agent.patch(`/api/rounds/${round2Id}/break`).send({
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [1],
        size: 3,
        cutoff_tie_policy: 'manual',
        seeding: 'high_low',
        participants: [
          { teamId: alphaId, seed: 1 },
          { teamId: betaId, seed: 2 },
          { teamId: gammaId, seed: 3 },
        ],
      },
      syncTeamAvailability: true,
    })
    expect(round2BreakRes.status).toBe(200)

    const round2BreakAllocRes = await agent.post('/api/allocations/break').send({
      tournamentId,
      round: 2,
    })
    expect(round2BreakAllocRes.status).toBe(200)
    expect(round2BreakAllocRes.body.data.allocation).toHaveLength(1)
    const matchTeams = round2BreakAllocRes.body.data.allocation[0].teams
    expect([matchTeams.gov, matchTeams.opp].sort()).toEqual([betaId, gammaId].sort())
    expect(round2BreakAllocRes.body.data.userDefinedData?.break?.stage_byes).toEqual([
      { teamId: alphaId, seed: 1 },
    ])

    const saveRound2DrawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 2,
      allocation: round2BreakAllocRes.body.data.allocation,
      userDefinedData: round2BreakAllocRes.body.data.userDefinedData,
      drawOpened: false,
      allocationOpened: false,
      locked: false,
    })
    expect(saveRound2DrawRes.status).toBe(201)

    const round2BallotRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 2,
      teamAId: betaId,
      teamBId: gammaId,
      winnerId: betaId,
      scoresA: [75],
      scoresB: [72],
      submittedEntityId: 'break-judge',
    })
    expect(round2BallotRes.status).toBe(201)

    const round3BreakRes = await agent.patch(`/api/rounds/${round3Id}/break`).send({
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [1, 2],
        size: 3,
        cutoff_tie_policy: 'manual',
        seeding: 'high_low',
        participants: [],
      },
      syncTeamAvailability: false,
    })
    expect(round3BreakRes.status).toBe(200)

    const round3BreakAllocRes = await agent.post('/api/allocations/break').send({
      tournamentId,
      round: 3,
    })
    expect(round3BreakAllocRes.status).toBe(200)
    expect(round3BreakAllocRes.body.data.allocation).toHaveLength(1)
    const nextTeams = round3BreakAllocRes.body.data.allocation[0].teams
    expect([nextTeams.gov, nextTeams.opp].sort()).toEqual([alphaId, betaId].sort())
    expect(round3BreakAllocRes.body.data.userDefinedData?.break?.derived_from_previous_round).toBe(true)
    expect(round3BreakAllocRes.body.data.userDefinedData?.break?.previous_round).toBe(2)
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

})

