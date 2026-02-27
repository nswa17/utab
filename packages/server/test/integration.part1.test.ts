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
  throw lastError ?? new Error('waitForResult timed out without a successful response')
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({
    instance: { ip: '127.0.0.1', launchTimeout: 600000 },
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

  it('issues and reuses a rate-limit identity cookie', async () => {
    const cookieName = process.env.RATE_LIMIT_ID_COOKIE_NAME ?? 'utab_rlid'
    const first = await request(app).get('/api/health')
    const setCookies = first.headers['set-cookie'] ?? []
    const identityCookie = setCookies.find((cookie) => cookie.startsWith(`${cookieName}=`))
    expect(identityCookie).toBeTruthy()
    if (!identityCookie) {
      throw new Error('rate-limit identity cookie was not issued')
    }

    const second = await request(app).get('/api/health').set('Cookie', identityCookie.split(';')[0])
    expect(second.headers['set-cookie']).toBeUndefined()
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

    const teamRes = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Team A',
      institution: 'Uni',
      speakers: [{ name: 'Speaker 1' }],
      details: [{ r: 1, institutions: ['internal-inst'], speakers: ['internal-speaker'] }],
      userDefinedData: { privateMemo: 'do-not-expose' },
    })
    expect(teamRes.status).toBe(201)
    const teamId = teamRes.body.data._id

    const adjudicatorRes = await agent.post('/api/adjudicators').send({
      tournamentId,
      name: 'Judge 1',
      strength: 5,
      preev: 2,
      details: [{ r: 1, institutions: ['internal-inst'] }],
      userDefinedData: { privateMemo: 'hidden' },
    })
    expect(adjudicatorRes.status).toBe(201)

    const resultRes = await agent.post('/api/results').send({
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

    const publicAdjudicators = await request(app).get(
      `/api/adjudicators?tournamentId=${tournamentId}`
    )
    expect(publicAdjudicators.status).toBe(200)
    expect('strength' in publicAdjudicators.body.data[0]).toBe(false)
    expect('details' in publicAdjudicators.body.data[0]).toBe(false)
    expect('userDefinedData' in publicAdjudicators.body.data[0]).toBe(false)

    const publicResults = await request(app).get(`/api/results?tournamentId=${tournamentId}`)
    expect(publicResults.status).toBe(401)

    const publicDraws = await request(app).get(`/api/draws?tournamentId=${tournamentId}`)
    expect(publicDraws.status).toBe(200)
    expect(Array.isArray(publicDraws.body.data[0].allocation)).toBe(true)
    expect(publicDraws.body.data[0].allocation[0].chairs).toEqual([])
    expect(publicDraws.body.data[0].allocation[0].panels).toEqual([])
    expect(publicDraws.body.data[0].allocation[0].trainees).toEqual([])
    expect('locked' in publicDraws.body.data[0]).toBe(false)
    expect('createdBy' in publicDraws.body.data[0]).toBe(false)

    const publicCompiled = await request(app).get(
      `/api/compiled?tournamentId=${tournamentId}&latest=1`
    )
    expect(publicCompiled.status).toBe(401)

    const openAccessSkipRes = await request(app)
      .post(`/api/tournaments/${tournamentId}/access`)
      .send({
        action: 'skip',
      })
    expect(openAccessSkipRes.status).toBe(200)

    const publicSubmission = await request(app).post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: 'adj-chair',
      score: 6,
      submittedEntityId: teamId,
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

  it('rejects draw save when allocation contains round-unavailable entities', async () => {
    const agent = request.agent(app)
    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'draw-unavailable-guard', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'draw-unavailable-guard', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Draw Guard Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const unavailableTeamRes = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Unavailable Team',
      details: [{ r: 1, available: false }],
    })
    expect(unavailableTeamRes.status).toBe(201)
    const unavailableTeamId = unavailableTeamRes.body.data._id as string

    const availableTeamRes = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Available Team',
      details: [{ r: 1, available: true }],
    })
    expect(availableTeamRes.status).toBe(201)
    const availableTeamId = availableTeamRes.body.data._id as string

    const unavailableAdjudicatorRes = await agent.post('/api/adjudicators').send({
      tournamentId,
      name: 'Unavailable Judge',
      strength: 3,
      details: [{ r: 1, available: false }],
    })
    expect(unavailableAdjudicatorRes.status).toBe(201)
    const unavailableAdjudicatorId = unavailableAdjudicatorRes.body.data._id as string

    const unavailableVenueRes = await agent.post('/api/venues').send({
      tournamentId,
      name: 'Unavailable Room',
      details: [{ r: 1, available: false, priority: 1 }],
    })
    expect(unavailableVenueRes.status).toBe(201)
    const unavailableVenueId = unavailableVenueRes.body.data._id as string

    const drawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: unavailableVenueId,
          teams: { gov: unavailableTeamId, opp: availableTeamId },
          chairs: [unavailableAdjudicatorId],
          panels: [],
          trainees: [],
        },
      ],
      drawOpened: false,
      allocationOpened: false,
    })

    expect(drawRes.status).toBe(400)
    const message = String(drawRes.body.errors?.[0]?.message ?? '')
    expect(message).toContain('entities unavailable in round 1')
    expect(message).toContain(`team:${unavailableTeamId}`)
    expect(message).toContain(`adjudicator:${unavailableAdjudicatorId}`)
    expect(message).toContain(`venue:${unavailableVenueId}`)
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

    const speakerRes1 = await agent.post('/api/speakers').send({ tournamentId, name: 'Speaker 1' })
    expect(speakerRes1.status).toBe(201)
    const speakerId1 = speakerRes1.body.data._id

    const speakerRes2 = await agent.post('/api/speakers').send({ tournamentId, name: 'Speaker 2' })
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
    expect(
      powerpairTeamAllocRes.body.data.userDefinedData?.powerpair?.brackets?.length
    ).toBeGreaterThan(0)

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

  it('supports compile preview and explicit snapshot save with stale detection', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'compile-preview-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'compile-preview-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Compile Preview Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const roundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

    const teamResA = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Preview Team A',
    })
    expect(teamResA.status).toBe(201)
    const teamIdA = teamResA.body.data._id as string

    const teamResB = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Preview Team B',
    })
    expect(teamResB.status).toBe(201)
    const teamIdB = teamResB.body.data._id as string

    const rawTeamsRes = await agent.post('/api/raw-results/teams').send([
      {
        tournamentId,
        id: teamIdA,
        from_id: 'preview-seed',
        r: 1,
        win: 1,
        side: 'gov',
        opponents: [teamIdB],
      },
      {
        tournamentId,
        id: teamIdB,
        from_id: 'preview-seed',
        r: 1,
        win: 0,
        side: 'opp',
        opponents: [teamIdA],
      },
    ])
    expect(rawTeamsRes.status).toBe(201)

    const compiledBeforePreview = await agent.get(`/api/compiled?tournamentId=${tournamentId}`)
    expect(compiledBeforePreview.status).toBe(200)
    expect(compiledBeforePreview.body.data).toHaveLength(0)

    const previewRes = await agent.post('/api/compiled/preview').send({
      tournamentId,
      source: 'raw',
      options: {
        include_labels: ['teams'],
      },
    })
    expect(previewRes.status).toBe(200)
    expect(previewRes.body.data.preview.compile_source).toBe('raw')
    expect(previewRes.body.data.preview.compiled_team_results.length).toBe(2)
    expect(typeof previewRes.body.data.preview_signature).toBe('string')
    expect(typeof previewRes.body.data.revision).toBe('string')

    const emptyRoundsPreviewRes = await agent.post('/api/compiled/preview').send({
      tournamentId,
      source: 'raw',
      rounds: [],
      options: {
        include_labels: ['teams'],
      },
    })
    expect(emptyRoundsPreviewRes.status).toBe(200)
    expect(emptyRoundsPreviewRes.body.data.preview.rounds).toEqual([])
    expect(emptyRoundsPreviewRes.body.data.preview.compiled_team_results).toEqual([])

    const compiledAfterPreview = await agent.get(`/api/compiled?tournamentId=${tournamentId}`)
    expect(compiledAfterPreview.status).toBe(200)
    expect(compiledAfterPreview.body.data).toHaveLength(0)

    const staleSaveRes = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'raw',
      options: {
        include_labels: ['teams'],
      },
      preview_signature: 'stale-signature',
      revision: previewRes.body.data.revision,
    })
    expect(staleSaveRes.status).toBe(409)
    expect(staleSaveRes.body.errors[0].name).toBe('PreviewStale')

    const saveRes = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'raw',
      options: {
        include_labels: ['teams'],
      },
      snapshot_name: 'Round 1 / raw / save-test',
      snapshot_memo: 'manual save memo',
      preview_signature: previewRes.body.data.preview_signature,
      revision: previewRes.body.data.revision,
    })
    expect(saveRes.status).toBe(201)
    expect(saveRes.body.data.payload.snapshot_name).toBe('Round 1 / raw / save-test')
    expect(saveRes.body.data.payload.snapshot_memo).toBe('manual save memo')

    const compiledAfterSave = await agent.get(`/api/compiled?tournamentId=${tournamentId}`)
    expect(compiledAfterSave.status).toBe(200)
    expect(compiledAfterSave.body.data).toHaveLength(1)
    expect(compiledAfterSave.body.data[0].payload.snapshot_name).toBe('Round 1 / raw / save-test')

    const savedCompiledId = compiledAfterSave.body.data[0]?._id as string
    expect(typeof savedCompiledId).toBe('string')
    expect(savedCompiledId.length).toBeGreaterThan(0)

    const deleteCompiledRes = await agent
      .delete(`/api/compiled/${savedCompiledId}`)
      .query({ tournamentId })
    expect(deleteCompiledRes.status).toBe(200)
    expect(deleteCompiledRes.body.data._id).toBe(savedCompiledId)

    const compiledAfterDelete = await agent.get(`/api/compiled?tournamentId=${tournamentId}`)
    expect(compiledAfterDelete.status).toBe(200)
    expect(compiledAfterDelete.body.data).toHaveLength(0)

    const deleteMissingCompiledRes = await agent
      .delete(`/api/compiled/${savedCompiledId}`)
      .query({ tournamentId })
    expect(deleteMissingCompiledRes.status).toBe(404)
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

    const round1Res = await agent.post('/api/rounds').send({ tournamentId, round: 1, name: 'R1' })
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

    const updatedRoundRes = await agent.get(`/api/rounds/${breakRoundId}`).query({ tournamentId })
    expect(updatedRoundRes.status).toBe(200)
    expect(updatedRoundRes.body.data.userDefinedData.break_round).toBe(true)
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
    expect(round2Res.body.data.userDefinedData.break_round).toBe(false)
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

    const round1Res = await agent.post('/api/rounds').send({ tournamentId, round: 1, name: 'R1' })
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

    const round1Res = await agent.post('/api/rounds').send({ tournamentId, round: 1, name: 'R1' })
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
    expect(disableBreakRes.body.data.round?.userDefinedData?.break_round).toBe(false)

    const updatedRoundRes = await agent.get(`/api/rounds/${breakRoundId}`).query({ tournamentId })
    expect(updatedRoundRes.status).toBe(200)
    expect(updatedRoundRes.body.data.userDefinedData.break_round).toBe(false)
  })

  it('derives first break round participants from standings when participants are empty', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'break-auto-first-stage', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'break-auto-first-stage', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleRes = await agent.get('/api/styles')
    expect(styleRes.status).toBe(200)
    const styleId = styleRes.body.data?.[0]?.id
    expect(typeof styleId).toBe('number')

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Break Auto First Stage Open',
      style: styleId,
      options: {
        style: {
          team_num: 2,
          score_weights: [1],
        },
      },
      user_defined_data: {
        round_defaults: {
          break: {
            source: 'raw',
            size: 8,
            cutoff_tie_policy: 'manual',
            seeding: 'high_low',
          },
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

    const round1Res = await agent.post('/api/rounds').send({ tournamentId, round: 1, name: 'R1' })
    expect(round1Res.status).toBe(201)
    const round2Res = await agent.post('/api/rounds').send({ tournamentId, round: 2, name: 'R2' })
    expect(round2Res.status).toBe(201)
    const round3Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 3, name: 'Break SF' })
    expect(round3Res.status).toBe(201)
    const round3Id = round3Res.body.data._id as string

    const rawTeamsRes = await agent.post('/api/raw-results/teams').send([
      {
        tournamentId,
        id: gammaId,
        from_id: 'seed-r1-gamma',
        r: 1,
        win: 1,
        sum: 75,
        margin: 5,
        opponents: [alphaId],
        side: 'gov',
      },
      {
        tournamentId,
        id: alphaId,
        from_id: 'seed-r1-alpha',
        r: 1,
        win: 0,
        sum: 70,
        margin: -5,
        opponents: [gammaId],
        side: 'opp',
      },
      {
        tournamentId,
        id: deltaId,
        from_id: 'seed-r1-delta',
        r: 1,
        win: 1,
        sum: 74,
        margin: 3,
        opponents: [betaId],
        side: 'gov',
      },
      {
        tournamentId,
        id: betaId,
        from_id: 'seed-r1-beta',
        r: 1,
        win: 0,
        sum: 71,
        margin: -3,
        opponents: [deltaId],
        side: 'opp',
      },
      {
        tournamentId,
        id: gammaId,
        from_id: 'seed-r2-gamma',
        r: 2,
        win: 1,
        sum: 76,
        margin: 4,
        opponents: [betaId],
        side: 'gov',
      },
      {
        tournamentId,
        id: betaId,
        from_id: 'seed-r2-beta',
        r: 2,
        win: 0,
        sum: 72,
        margin: -4,
        opponents: [gammaId],
        side: 'opp',
      },
      {
        tournamentId,
        id: deltaId,
        from_id: 'seed-r2-delta',
        r: 2,
        win: 1,
        sum: 73,
        margin: 2,
        opponents: [alphaId],
        side: 'gov',
      },
      {
        tournamentId,
        id: alphaId,
        from_id: 'seed-r2-alpha',
        r: 2,
        win: 0,
        sum: 71,
        margin: -2,
        opponents: [deltaId],
        side: 'opp',
      },
    ])
    expect(rawTeamsRes.status).toBe(201)

    const saveBreakRes = await agent.patch(`/api/rounds/${round3Id}/break`).send({
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [1, 2],
        size: 2,
        cutoff_tie_policy: 'manual',
        seeding: 'high_low',
        participants: [],
      },
      syncTeamAvailability: false,
    })
    expect(saveBreakRes.status).toBe(200)

    const breakAllocRes = await agent.post('/api/allocations/break').send({
      tournamentId,
      round: 3,
    })
    expect(breakAllocRes.status).toBe(200)
    expect(breakAllocRes.body.data.allocation).toHaveLength(1)
    const autoParticipants = breakAllocRes.body.data.userDefinedData?.break?.participants as Array<{
      teamId: string
      seed: number
    }>
    expect(autoParticipants).toHaveLength(2)
    expect(new Set(autoParticipants.map((participant) => participant.teamId))).toEqual(
      new Set([gammaId, deltaId])
    )
    expect(
      autoParticipants.map((participant) => participant.seed).sort((left, right) => left - right)
    ).toEqual([1, 2])
    const matchTeams = breakAllocRes.body.data.allocation[0].teams
    expect([matchTeams.gov, matchTeams.opp].sort()).toEqual([gammaId, deltaId].sort())
  })

  it('supports all-allocation wrapper with break team algorithm', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'break-wrapper-all', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'break-wrapper-all', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleRes = await agent.get('/api/styles')
    expect(styleRes.status).toBe(200)
    const styleId = styleRes.body.data?.[0]?.id
    expect(typeof styleId).toBe('number')

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Break Wrapper Open',
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

    const round1Res = await agent.post('/api/rounds').send({ tournamentId, round: 1, name: 'R1' })
    expect(round1Res.status).toBe(201)
    const round2Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 2, name: 'Break QF' })
    expect(round2Res.status).toBe(201)
    const round2Id = round2Res.body.data._id as string

    const adjudicatorARes = await agent
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Judge A', strength: 7 })
    expect(adjudicatorARes.status).toBe(201)
    const adjudicatorBRes = await agent
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Judge B', strength: 6 })
    expect(adjudicatorBRes.status).toBe(201)

    const venueARes = await agent.post('/api/venues').send({ tournamentId, name: 'Room 1' })
    expect(venueARes.status).toBe(201)
    const venueBRes = await agent.post('/api/venues').send({ tournamentId, name: 'Room 2' })
    expect(venueBRes.status).toBe(201)

    const rawTeamsRes = await agent.post('/api/raw-results/teams').send([
      {
        tournamentId,
        id: alphaId,
        from_id: 'seed-r1',
        r: 1,
        win: 1,
        sum: 76,
        margin: 6,
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
        margin: -6,
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
        size: 2,
        cutoff_tie_policy: 'manual',
        seeding: 'high_low',
        participants: [
          { teamId: alphaId, seed: 1 },
          { teamId: betaId, seed: 2 },
        ],
      },
      syncTeamAvailability: false,
    })
    expect(round2BreakRes.status).toBe(200)

    const allocRes = await agent.post('/api/allocations').send({
      tournamentId,
      round: 2,
      options: {
        team_allocation_algorithm: 'break',
        adjudicator_allocation_algorithm: 'standard',
        numbers_of_adjudicators: { chairs: 1, panels: 0, trainees: 0 },
        venue_allocation_algorithm_options: { shuffle: false },
      },
    })
    expect(allocRes.status).toBe(200)
    expect(allocRes.body.data.userDefinedData?.team_allocation_algorithm).toBe('break')
    expect(allocRes.body.data.allocation).toHaveLength(1)

    const square = allocRes.body.data.allocation[0]
    expect([square.teams.gov, square.teams.opp].sort()).toEqual([alphaId, betaId].sort())
    expect(Array.isArray(square.chairs)).toBe(true)
    expect(square.chairs.length).toBe(1)
    expect(square.venue).toBeTruthy()
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

    const round1Res = await agent.post('/api/rounds').send({ tournamentId, round: 1, name: 'R1' })
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
        seeding: 'reseed_each_round',
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
    expect(round2BreakAllocRes.body.data.userDefinedData?.break?.stage_participants).toEqual([
      { teamId: alphaId, seed: 1 },
      { teamId: betaId, seed: 2 },
      { teamId: gammaId, seed: 3 },
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
        seeding: 'reseed_each_round',
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
  })

  it('derives break winners from saved draw allocation when previous break metadata is stale', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'break-stale-meta', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'break-stale-meta', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleRes = await agent.get('/api/styles')
    expect(styleRes.status).toBe(200)
    const styleId = styleRes.body.data?.[0]?.id

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Break Stale Meta Open',
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

    const speakerAlphaRes = await agent
      .post('/api/speakers')
      .send({ tournamentId, name: 'Alpha Speaker' })
    expect(speakerAlphaRes.status).toBe(201)
    const speakerBetaRes = await agent
      .post('/api/speakers')
      .send({ tournamentId, name: 'Beta Speaker' })
    expect(speakerBetaRes.status).toBe(201)
    const speakerGammaRes = await agent
      .post('/api/speakers')
      .send({ tournamentId, name: 'Gamma Speaker' })
    expect(speakerGammaRes.status).toBe(201)
    const speakerDeltaRes = await agent
      .post('/api/speakers')
      .send({ tournamentId, name: 'Delta Speaker' })
    expect(speakerDeltaRes.status).toBe(201)

    const alphaSpeakerId = speakerAlphaRes.body.data._id as string
    const betaSpeakerId = speakerBetaRes.body.data._id as string
    const gammaSpeakerId = speakerGammaRes.body.data._id as string
    const deltaSpeakerId = speakerDeltaRes.body.data._id as string

    const teamsRes = await agent.post('/api/teams').send([
      {
        tournamentId,
        name: 'Alpha',
        details: [{ r: 2, available: true, speakers: [alphaSpeakerId], institutions: [] }],
      },
      {
        tournamentId,
        name: 'Beta',
        details: [{ r: 2, available: true, speakers: [betaSpeakerId], institutions: [] }],
      },
      {
        tournamentId,
        name: 'Gamma',
        details: [{ r: 2, available: true, speakers: [gammaSpeakerId], institutions: [] }],
      },
      {
        tournamentId,
        name: 'Delta',
        details: [{ r: 2, available: true, speakers: [deltaSpeakerId], institutions: [] }],
      },
    ])
    expect(teamsRes.status).toBe(201)
    const teams = teamsRes.body.data as Array<{ _id: string; name: string }>
    const teamByName = new Map<string, string>(teams.map((team) => [team.name, team._id]))
    const alphaId = teamByName.get('Alpha')!
    const betaId = teamByName.get('Beta')!
    const gammaId = teamByName.get('Gamma')!
    const deltaId = teamByName.get('Delta')!

    const round1Res = await agent.post('/api/rounds').send({ tournamentId, round: 1, name: 'R1' })
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

    const round2BreakRes = await agent.patch(`/api/rounds/${round2Id}/break`).send({
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [1],
        size: 4,
        cutoff_tie_policy: 'manual',
        seeding: 'high_low',
        participants: [
          { teamId: alphaId, seed: 1 },
          { teamId: betaId, seed: 2 },
          { teamId: gammaId, seed: 3 },
          { teamId: deltaId, seed: 4 },
        ],
      },
      syncTeamAvailability: false,
    })
    expect(round2BreakRes.status).toBe(200)

    const round2BreakAllocRes = await agent.post('/api/allocations/break').send({
      tournamentId,
      round: 2,
    })
    expect(round2BreakAllocRes.status).toBe(200)
    expect(round2BreakAllocRes.body.data.allocation).toHaveLength(2)
    const staleBreakMetadata = round2BreakAllocRes.body.data.userDefinedData
    expect(staleBreakMetadata?.break?.stage_participants).toHaveLength(4)

    const editedRound2Allocation = [
      {
        id: 0,
        teams: { gov: alphaId, opp: betaId },
        chairs: [],
        panels: [],
        trainees: [],
        venue: null,
      },
      {
        id: 1,
        teams: { gov: deltaId, opp: gammaId },
        chairs: [],
        panels: [],
        trainees: [],
        venue: null,
      },
    ]

    const saveRound2DrawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 2,
      allocation: editedRound2Allocation,
      userDefinedData: staleBreakMetadata,
      drawOpened: false,
      allocationOpened: false,
      locked: false,
    })
    expect(saveRound2DrawRes.status).toBe(201)

    const ballot1Res = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 2,
      teamAId: alphaId,
      teamBId: betaId,
      winnerId: alphaId,
      scoresA: [76],
      scoresB: [73],
      submittedEntityId: 'stale-break-judge-1',
    })
    expect(ballot1Res.status).toBe(201)

    const ballot2Res = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 2,
      teamAId: deltaId,
      teamBId: gammaId,
      winnerId: deltaId,
      scoresA: [74],
      scoresB: [72],
      submittedEntityId: 'stale-break-judge-2',
    })
    expect(ballot2Res.status).toBe(201)

    const round3BreakRes = await agent.patch(`/api/rounds/${round3Id}/break`).send({
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [1, 2],
        size: 4,
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
    const finalists = round3BreakAllocRes.body.data.allocation[0].teams
    expect([finalists.gov, finalists.opp].sort()).toEqual([alphaId, deltaId].sort())
  })

  it('keeps fixed bracket paths when advancing from previous break round', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'break-fixed-bracket', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'break-fixed-bracket', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleRes = await agent.get('/api/styles')
    expect(styleRes.status).toBe(200)
    const styleId = styleRes.body.data?.[0]?.id

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Break Fixed Bracket Open',
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
      { tournamentId, name: 'Epsilon' },
      { tournamentId, name: 'Zeta' },
      { tournamentId, name: 'Eta' },
      { tournamentId, name: 'Theta' },
    ])
    expect(teamsRes.status).toBe(201)
    const teams = teamsRes.body.data as Array<{ _id: string; name: string }>
    const teamByName = new Map<string, string>(teams.map((team) => [team.name, team._id]))
    const alphaId = teamByName.get('Alpha')!
    const betaId = teamByName.get('Beta')!
    const gammaId = teamByName.get('Gamma')!
    const deltaId = teamByName.get('Delta')!
    const epsilonId = teamByName.get('Epsilon')!
    const zetaId = teamByName.get('Zeta')!
    const etaId = teamByName.get('Eta')!
    const thetaId = teamByName.get('Theta')!

    const round1Res = await agent.post('/api/rounds').send({ tournamentId, round: 1, name: 'R1' })
    expect(round1Res.status).toBe(201)
    const round2Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 2, name: 'Break QF' })
    expect(round2Res.status).toBe(201)
    const round3Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 3, name: 'Break SF' })
    expect(round3Res.status).toBe(201)
    const round2Id = round2Res.body.data._id as string
    const round3Id = round3Res.body.data._id as string

    const round2BreakRes = await agent.patch(`/api/rounds/${round2Id}/break`).send({
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [1],
        size: 8,
        cutoff_tie_policy: 'manual',
        seeding: 'fixed_bracket',
        participants: [
          { teamId: alphaId, seed: 1 },
          { teamId: betaId, seed: 2 },
          { teamId: gammaId, seed: 3 },
          { teamId: deltaId, seed: 4 },
          { teamId: epsilonId, seed: 5 },
          { teamId: zetaId, seed: 6 },
          { teamId: etaId, seed: 7 },
          { teamId: thetaId, seed: 8 },
        ],
      },
      syncTeamAvailability: false,
    })
    expect(round2BreakRes.status).toBe(200)

    const round2BreakAllocRes = await agent.post('/api/allocations/break').send({
      tournamentId,
      round: 2,
    })
    expect(round2BreakAllocRes.status).toBe(200)
    expect(round2BreakAllocRes.body.data.allocation).toHaveLength(4)
    const round2Allocation = round2BreakAllocRes.body.data.allocation as Array<any>
    const stageParticipants = round2BreakAllocRes.body.data.userDefinedData?.break
      ?.stage_participants as Array<{
      teamId: string
      seed: number
    }>
    const seedByTeamId = new Map(
      stageParticipants.map((participant) => [participant.teamId, participant.seed])
    )
    const round2Matches = round2Allocation.map((row, index) => ({
      id: index + 1,
      gov: {
        teamId: String(row?.teams?.gov ?? ''),
        seed: Number(seedByTeamId.get(String(row?.teams?.gov ?? '')) ?? Number.NaN),
      },
      opp: {
        teamId: String(row?.teams?.opp ?? ''),
        seed: Number(seedByTeamId.get(String(row?.teams?.opp ?? '')) ?? Number.NaN),
      },
    }))
    expect(round2Matches).toHaveLength(4)

    const winnerSeedByMatchId = new Map<number, number>([
      [1, 8],
      [2, 7],
      [3, 3],
      [4, 4],
    ])
    const winnerByMatchId = new Map<number, string>()
    round2Matches.forEach((match) => {
      const targetSeed = winnerSeedByMatchId.get(Number(match.id))
      expect(targetSeed).toBeDefined()
      const winner = [match.gov, match.opp].find((side) => side.seed === targetSeed)
      expect(winner).toBeTruthy()
      if (winner) {
        winnerByMatchId.set(Number(match.id), winner.teamId)
      }
    })

    const saveRound2DrawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 2,
      allocation: round2Allocation,
      userDefinedData: round2BreakAllocRes.body.data.userDefinedData,
      drawOpened: false,
      allocationOpened: false,
      locked: false,
    })
    expect(saveRound2DrawRes.status).toBe(201)

    for (const row of round2Allocation) {
      const teams = row.teams as { gov: string; opp: string }
      const matchId = Number(row.id) + 1
      const winnerId = winnerByMatchId.get(matchId)
      expect(winnerId).toBeTruthy()
      if (!winnerId) continue
      expect([teams.gov, teams.opp]).toContain(winnerId)

      const ballotRes = await agent.post('/api/submissions/ballots').send({
        tournamentId,
        round: 2,
        teamAId: teams.gov,
        teamBId: teams.opp,
        winnerId,
        scoresA: [winnerId === teams.gov ? 76 : 72],
        scoresB: [winnerId === teams.opp ? 76 : 72],
        submittedEntityId: `fixed-break-judge-${matchId}`,
      })
      expect(ballotRes.status).toBe(201)
    }

    const round3BreakRes = await agent.patch(`/api/rounds/${round3Id}/break`).send({
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [1, 2],
        size: 8,
        cutoff_tie_policy: 'manual',
        seeding: 'fixed_bracket',
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
    expect(round3BreakAllocRes.body.data.allocation).toHaveLength(2)

    const pairKey = (teamA: string, teamB: string) => [teamA, teamB].sort().join(':')
    const semifinalPairs = (
      round3BreakAllocRes.body.data.allocation as Array<{ teams: { gov: string; opp: string } }>
    ).map((row) => pairKey(row.teams.gov, row.teams.opp))
    expect(new Set(semifinalPairs)).toEqual(
      new Set([pairKey(thetaId, etaId), pairKey(gammaId, deltaId)])
    )
  })

  it('reassigns seeds randomly for random_full seeding', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'break-random-full', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'break-random-full', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleRes = await agent.get('/api/styles')
    expect(styleRes.status).toBe(200)
    const styleId = styleRes.body.data?.[0]?.id

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Break Random Full Open',
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
      .send({ tournamentId, round: 1, name: 'Break R1' })
    expect(round1Res.status).toBe(201)
    const round1Id = round1Res.body.data._id as string

    const round1BreakRes = await agent.patch(`/api/rounds/${round1Id}/break`).send({
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [],
        size: 4,
        cutoff_tie_policy: 'manual',
        seeding: 'random_full',
        participants: [
          { teamId: alphaId, seed: 1 },
          { teamId: betaId, seed: 2 },
          { teamId: gammaId, seed: 3 },
          { teamId: deltaId, seed: 4 },
        ],
      },
      syncTeamAvailability: false,
    })
    expect(round1BreakRes.status).toBe(200)

    const breakAllocRes = await agent.post('/api/allocations/break').send({
      tournamentId,
      round: 1,
    })
    expect(breakAllocRes.status).toBe(200)
    expect(breakAllocRes.body.data.allocation).toHaveLength(2)

    const participants = breakAllocRes.body.data.userDefinedData?.break?.participants as Array<{
      teamId: string
      seed: number
    }>
    expect(participants).toHaveLength(4)
    expect(new Set(participants.map((participant) => participant.teamId))).toEqual(
      new Set([alphaId, betaId, gammaId, deltaId])
    )
    expect(
      participants.map((participant) => participant.seed).sort((left, right) => left - right)
    ).toEqual([1, 2, 3, 4])

    const allocatedTeamIds = new Set<string>()
    ;(breakAllocRes.body.data.allocation as Array<{ teams: { gov: string; opp: string } }>).forEach(
      (row) => {
        allocatedTeamIds.add(row.teams.gov)
        allocatedTeamIds.add(row.teams.opp)
      }
    )
    expect(allocatedTeamIds).toEqual(new Set([alphaId, betaId, gammaId, deltaId]))
  })

  it('keeps ranking tiers while randomizing seeds within tie groups', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'break-random-tie', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'break-random-tie', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleRes = await agent.get('/api/styles')
    expect(styleRes.status).toBe(200)
    const styleId = styleRes.body.data?.[0]?.id

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Break Random Tie Open',
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

    const round1Res = await agent.post('/api/rounds').send({ tournamentId, round: 1, name: 'R1' })
    expect(round1Res.status).toBe(201)
    const round2Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 2, name: 'Break QF' })
    expect(round2Res.status).toBe(201)
    const round2Id = round2Res.body.data._id as string

    const setBreakSourceRes = await agent.patch(`/api/rounds/${round2Id}`).send({
      tournamentId,
      userDefinedData: {
        ...(round2Res.body.data.userDefinedData ?? {}),
        break: {
          ...((round2Res.body.data.userDefinedData ?? {}).break ?? {}),
          source: 'raw',
        },
      },
    })
    expect(setBreakSourceRes.status).toBe(200)

    const rawTeamsRes = await agent.post('/api/raw-results/teams').send([
      {
        tournamentId,
        id: alphaId,
        from_id: 'seed-r1-alpha',
        r: 1,
        win: 1,
        sum: 75,
        margin: 5,
        opponents: [gammaId],
        side: 'gov',
      },
      {
        tournamentId,
        id: gammaId,
        from_id: 'seed-r1-gamma',
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
        from_id: 'seed-r1-beta',
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
        from_id: 'seed-r1-delta',
        r: 1,
        win: 0,
        sum: 70,
        margin: -5,
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
        size: 4,
        cutoff_tie_policy: 'manual',
        seeding: 'random_within_tie_group',
        participants: [
          { teamId: alphaId, seed: 1 },
          { teamId: betaId, seed: 2 },
          { teamId: gammaId, seed: 3 },
          { teamId: deltaId, seed: 4 },
        ],
      },
      syncTeamAvailability: false,
    })
    expect(round2BreakRes.status).toBe(200)

    const breakAllocRes = await agent.post('/api/allocations/break').send({
      tournamentId,
      round: 2,
    })
    expect(breakAllocRes.status).toBe(200)
    expect(breakAllocRes.body.data.allocation).toHaveLength(2)

    const participants = breakAllocRes.body.data.userDefinedData?.break?.participants as Array<{
      teamId: string
      seed: number
    }>
    expect(participants).toHaveLength(4)
    expect(
      participants.map((participant) => participant.seed).sort((left, right) => left - right)
    ).toEqual([1, 2, 3, 4])

    const candidateRes = await agent.post(`/api/rounds/${round2Id}/break/candidates`).send({
      tournamentId,
      source: 'raw',
      sourceRounds: [1],
      size: 4,
    })
    expect(candidateRes.status).toBe(200)
    const rankingByTeamId = new Map<string, number | null>(
      (candidateRes.body.data.candidates as Array<{ teamId: string; ranking: number | null }>).map(
        (candidate) => [candidate.teamId, candidate.ranking]
      )
    )

    const seedByTeamId = new Map(
      participants.map((participant) => [participant.teamId, participant.seed])
    )
    const teamIds = [alphaId, betaId, gammaId, deltaId]
    for (let leftIndex = 0; leftIndex < teamIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < teamIds.length; rightIndex += 1) {
        const leftTeamId = teamIds[leftIndex]
        const rightTeamId = teamIds[rightIndex]
        const leftRank = rankingByTeamId.get(leftTeamId)
        const rightRank = rankingByTeamId.get(rightTeamId)
        if (!Number.isInteger(leftRank) || !Number.isInteger(rightRank) || leftRank === rightRank)
          continue
        const leftSeed = seedByTeamId.get(leftTeamId)
        const rightSeed = seedByTeamId.get(rightTeamId)
        expect(Number.isInteger(leftSeed)).toBe(true)
        expect(Number.isInteger(rightSeed)).toBe(true)
        if (leftRank < rightRank) {
          expect((leftSeed as number) < (rightSeed as number)).toBe(true)
        } else {
          expect((rightSeed as number) < (leftSeed as number)).toBe(true)
        }
      }
    }
  })

  it('balances gov/opp assignment in break allocations from prior side history', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'break-side-balance', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'break-side-balance', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const styleRes = await agent.get('/api/styles')
    expect(styleRes.status).toBe(200)
    const styleId = styleRes.body.data?.[0]?.id

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Break Side Balance Open',
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
    ])
    expect(teamsRes.status).toBe(201)
    const teams = teamsRes.body.data as Array<{ _id: string; name: string }>
    const teamByName = new Map<string, string>(teams.map((team) => [team.name, team._id]))
    const alphaId = teamByName.get('Alpha')!
    const betaId = teamByName.get('Beta')!

    const round1Res = await agent.post('/api/rounds').send({ tournamentId, round: 1, name: 'R1' })
    expect(round1Res.status).toBe(201)
    const round2Res = await agent.post('/api/rounds').send({ tournamentId, round: 2, name: 'R2' })
    expect(round2Res.status).toBe(201)
    const round3Res = await agent
      .post('/api/rounds')
      .send({ tournamentId, round: 3, name: 'Break Final' })
    expect(round3Res.status).toBe(201)
    const round3Id = round3Res.body.data._id as string

    const rawTeamsRes = await agent.post('/api/raw-results/teams').send([
      {
        tournamentId,
        id: alphaId,
        from_id: 'seed-r1-alpha',
        r: 1,
        win: 1,
        sum: 76,
        margin: 4,
        opponents: [betaId],
        side: 'gov',
      },
      {
        tournamentId,
        id: betaId,
        from_id: 'seed-r1-beta',
        r: 1,
        win: 0,
        sum: 72,
        margin: -4,
        opponents: [alphaId],
        side: 'opp',
      },
      {
        tournamentId,
        id: alphaId,
        from_id: 'seed-r2-alpha',
        r: 2,
        win: 1,
        sum: 75,
        margin: 3,
        opponents: [betaId],
        side: 'gov',
      },
      {
        tournamentId,
        id: betaId,
        from_id: 'seed-r2-beta',
        r: 2,
        win: 0,
        sum: 72,
        margin: -3,
        opponents: [alphaId],
        side: 'opp',
      },
    ])
    expect(rawTeamsRes.status).toBe(201)

    const round3BreakRes = await agent.patch(`/api/rounds/${round3Id}/break`).send({
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [1, 2],
        size: 2,
        cutoff_tie_policy: 'manual',
        seeding: 'high_low',
        participants: [
          { teamId: alphaId, seed: 1 },
          { teamId: betaId, seed: 2 },
        ],
      },
      syncTeamAvailability: false,
    })
    expect(round3BreakRes.status).toBe(200)

    const breakAllocRes = await agent.post('/api/allocations/break').send({
      tournamentId,
      round: 3,
    })
    expect(breakAllocRes.status).toBe(200)
    expect(breakAllocRes.body.data.allocation).toHaveLength(1)
    const finalMatch = breakAllocRes.body.data.allocation[0].teams
    expect(finalMatch.gov).toBe(betaId)
    expect(finalMatch.opp).toBe(alphaId)
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
