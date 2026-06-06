import request from 'supertest'
import jwt from 'jsonwebtoken'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createServer, type Server } from 'node:http'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { ServiceTokenRevocationModel } from '../src/models/service-token-revocation.js'
import { TournamentMemberModel } from '../src/models/tournament-member.js'
import { TournamentModel } from '../src/models/tournament.js'
import { UserModel } from '../src/models/user.js'
import { hashPassword, verifyPassword } from '../src/services/hash.service.js'

let app: Server
let mongo: MongoMemoryServer
let connectDatabase: typeof import('../src/config/database.js').connectDatabase
let disconnectDatabase: typeof import('../src/config/database.js').disconnectDatabase
let closeTournamentConnections: typeof import('../src/services/tournament-db.service.js').closeTournamentConnections

type ServiceTokenOptions = {
  sub?: string
  audience?: string
  orgId?: string
  role?: 'organizer' | 'superuser'
  scopes?: string[]
  tournamentIds?: '*' | string[]
  jti?: string
  expiresIn?: string | number
}

function createServiceToken(options: ServiceTokenOptions = {}): string {
  const secret =
    process.env.SERVICE_ACCOUNT_JWT_SECRET ??
    process.env.SESSION_SECRET ??
    'test-session-secret-123456'
  const uniqueSuffix = Math.random().toString(36).slice(2)
  const jti = options.jti ?? `jti-${uniqueSuffix}`

  return jwt.sign(
    {
      sub: options.sub ?? `ops-service-${uniqueSuffix}`,
      aud: options.audience ?? 'utab-api',
      org_id: options.orgId ?? 'org-test',
      role: options.role ?? 'organizer',
      scopes: options.scopes ?? ['read', 'create', 'upsert', 'delete'],
      tournament_ids: options.tournamentIds ?? '*',
      jti,
    },
    secret,
    {
      algorithm: 'HS256',
      expiresIn: options.expiresIn ?? '1h',
    }
  )
}

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
  process.env.SERVICE_ACCOUNT_JWT_SECRET = 'test-service-account-secret-123456'
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
  it('returns health on v1 and legacy routes with deprecation headers on legacy', async () => {
    const v1 = await request(app).get('/api/v1/health')
    expect(v1.status).toBe(200)
    expect(v1.body.data.status).toBe('ok')
    expect(v1.headers.deprecation).toBeUndefined()

    const legacy = await request(app).get('/api/health')
    expect(legacy.status).toBe(200)
    expect(legacy.body.data.status).toBe('ok')
    expect(legacy.headers.deprecation).toBe('true')
    expect(legacy.headers.sunset).toBeTruthy()
    expect(String(legacy.headers.link ?? '')).toContain('/api/v1')
    expect(String(legacy.headers.warning ?? '')).toContain('Deprecated API')
  })

  it('returns equivalent team list payloads on v1 and legacy routes', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({ username: 'legacy-compat-teams', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'legacy-compat-teams', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Legacy Compat Tournament', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const teamRes = await agent.post('/api/v1/teams').send({
      tournamentId,
      name: 'Legacy Compat Team',
    })
    expect(teamRes.status).toBe(201)

    const v1Res = await agent.get(`/api/v1/teams?tournamentId=${tournamentId}`)
    expect(v1Res.status).toBe(200)
    expect(v1Res.headers.deprecation).toBeUndefined()

    const legacyRes = await agent.get(`/api/teams?tournamentId=${tournamentId}`)
    expect(legacyRes.status).toBe(200)
    expect(legacyRes.headers.deprecation).toBe('true')
    expect(legacyRes.headers.sunset).toBeTruthy()
    expect(String(legacyRes.headers.link ?? '')).toContain('/api/v1')
    expect(String(legacyRes.headers.warning ?? '')).toContain('Deprecated API')

    expect(legacyRes.body).toEqual(v1Res.body)
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

  it('supports bearer service-account auth with scope and idempotency enforcement', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({ username: 'service-account-owner', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'service-account-owner', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Service Account Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const noCreateScopeToken = createServiceToken({
      scopes: ['read', 'upsert', 'delete'],
      tournamentIds: [tournamentId],
    })
    const noCreateScopeRes = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${noCreateScopeToken}`)
      .set('X-Idempotency-Key', 'service-scope-check')
      .send({
        tournamentId,
        name: 'Scope Denied Team',
      })
    expect(noCreateScopeRes.status).toBe(403)

    const implicitReadOnlyToken = createServiceToken({
      scopes: [],
      tournamentIds: [tournamentId],
    })
    const implicitReadOnlyGetRes = await request(app)
      .get(`/api/v1/teams?tournamentId=${tournamentId}`)
      .set('Authorization', `Bearer ${implicitReadOnlyToken}`)
    expect(implicitReadOnlyGetRes.status).toBe(200)
    const implicitReadOnlyPostRes = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${implicitReadOnlyToken}`)
      .set('X-Idempotency-Key', 'service-implicit-readonly-post')
      .send({
        tournamentId,
        name: 'Implicit Readonly Team',
      })
    expect(implicitReadOnlyPostRes.status).toBe(403)

    const missingIdempotencyToken = createServiceToken({
      scopes: ['read', 'create', 'upsert', 'delete'],
      tournamentIds: [tournamentId],
    })
    const missingIdempotencyRes = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${missingIdempotencyToken}`)
      .send({
        tournamentId,
        name: 'Missing Idempotency Team',
      })
    expect(missingIdempotencyRes.status).toBe(400)

    const createToken = createServiceToken({
      scopes: ['read', 'create', 'upsert', 'delete'],
      tournamentIds: [tournamentId],
    })
    const createTeamRes = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${createToken}`)
      .set('X-Idempotency-Key', 'service-create-team')
      .send({
        tournamentId,
        name: 'Service Team',
      })
    expect(createTeamRes.status).toBe(201)
    const createdTeamId = createTeamRes.body.data._id as string

    const replayCreateTeamRes = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${createToken}`)
      .set('X-Idempotency-Key', 'service-create-team')
      .send({
        tournamentId,
        name: 'Service Team',
      })
    expect(replayCreateTeamRes.status).toBe(201)
    expect(replayCreateTeamRes.headers['idempotency-replayed']).toBe('true')
    expect(replayCreateTeamRes.body.data._id).toBe(createdTeamId)

    const conflictCreateTeamRes = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${createToken}`)
      .set('X-Idempotency-Key', 'service-create-team')
      .send({
        tournamentId,
        name: 'Service Team Modified',
      })
    expect(conflictCreateTeamRes.status).toBe(409)

    const teamListRes = await agent.get(`/api/v1/teams?tournamentId=${tournamentId}`)
    expect(teamListRes.status).toBe(200)
    const serviceTeams = (teamListRes.body.data as Array<{ _id: string; name: string }>).filter(
      (team) => team.name === 'Service Team'
    )
    expect(serviceTeams).toHaveLength(1)
    expect(serviceTeams[0]._id).toBe(createdTeamId)

    const teamCreateAuditRes = await waitForResult(
      async () =>
        agent.get(
          `/api/v1/audit-logs?tournamentId=${tournamentId}&action=${encodeURIComponent('team.create')}`
        ),
      (response) => Array.isArray(response.body?.data?.items) && response.body.data.items.length > 0
    )
    expect(teamCreateAuditRes.status).toBe(200)
    const serviceTeamCreateLogs = (
      teamCreateAuditRes.body.data.items as Array<{ targetId?: string }>
    ).filter((item) => item.targetId === createdTeamId)
    expect(serviceTeamCreateLogs).toHaveLength(1)

    const speakerRes = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Service Speaker',
    })
    expect(speakerRes.status).toBe(201)
    const speakerId = speakerRes.body.data._id as string

    const noDeleteScopeToken = createServiceToken({
      scopes: ['read', 'create', 'upsert'],
      tournamentIds: [tournamentId],
    })
    const noDeleteScopeRes = await request(app)
      .delete(`/api/v1/speakers/${speakerId}/personal-data?tournamentId=${tournamentId}`)
      .set('Authorization', `Bearer ${noDeleteScopeToken}`)
      .set('X-Idempotency-Key', 'service-delete-scope-denied')
      .send({
        reason: 'deny delete scope request',
      })
    expect(noDeleteScopeRes.status).toBe(403)

    const missingDeleteIdempotencyRes = await request(app)
      .delete(`/api/v1/speakers/${speakerId}/personal-data?tournamentId=${tournamentId}`)
      .set('Authorization', `Bearer ${createToken}`)
      .send({
        reason: 'missing delete idempotency key',
      })
    expect(missingDeleteIdempotencyRes.status).toBe(400)

    const deleteScopeToken = createServiceToken({
      scopes: ['read', 'create', 'upsert', 'delete'],
      tournamentIds: [tournamentId],
    })
    const deleteScopeRes = await request(app)
      .delete(`/api/v1/speakers/${speakerId}/personal-data?tournamentId=${tournamentId}`)
      .set('Authorization', `Bearer ${deleteScopeToken}`)
      .set('X-Idempotency-Key', 'service-delete-speaker')
      .send({
        reason: 'allow delete scope request',
      })
    expect(deleteScopeRes.status).toBe(200)
    expect(deleteScopeRes.body.data.redacted).toBe(true)

    const invalidAudienceToken = createServiceToken({
      audience: 'invalid-aud',
      tournamentIds: [tournamentId],
    })
    const invalidAudienceRes = await request(app)
      .get(`/api/v1/teams?tournamentId=${tournamentId}`)
      .set('Authorization', `Bearer ${invalidAudienceToken}`)
    expect(invalidAudienceRes.status).toBe(401)
  })

  it('revokes service-account tokens by jti and denies further use', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({ username: 'token-revoker', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'token-revoker', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const revokedJti = `revoked-${Math.random().toString(36).slice(2)}`
    const token = createServiceToken({
      jti: revokedJti,
      scopes: ['read', 'create', 'upsert', 'delete'],
    })

    const beforeRevoke = await request(app)
      .get('/api/v1/health')
      .set('Authorization', `Bearer ${token}`)
    expect(beforeRevoke.status).toBe(200)

    const revokeRes = await agent.post('/api/v1/auth/service-token-revocations').send({
      jti: revokedJti,
      reason: 'token compromised',
    })
    expect(revokeRes.status).toBe(201)
    expect(revokeRes.body.data.jti).toBe(revokedJti)

    const listRes = await agent.get('/api/v1/auth/service-token-revocations?active=true&limit=20')
    expect(listRes.status).toBe(200)
    const listed = (listRes.body.data.items as Array<{ jti: string }>).find(
      (item) => item.jti === revokedJti
    )
    expect(listed).toBeTruthy()

    const duplicateRevokeRes = await agent.post('/api/v1/auth/service-token-revocations').send({
      jti: revokedJti,
      reason: 'duplicate request',
    })
    expect(duplicateRevokeRes.status).toBe(200)
    expect(duplicateRevokeRes.body.data.jti).toBe(revokedJti)

    const afterRevoke = await request(app)
      .get('/api/v1/health')
      .set('Authorization', `Bearer ${token}`)
    expect(afterRevoke.status).toBe(401)

    const expiredAt = new Date(Date.now() - 60 * 1000)
    await ServiceTokenRevocationModel.updateOne({ jti: revokedJti }, { $set: { expireAt: expiredAt } }).exec()

    const activeListRes = await agent.get('/api/v1/auth/service-token-revocations?active=true&limit=20')
    expect(activeListRes.status).toBe(200)
    const activeEntry = (activeListRes.body.data.items as Array<{ jti: string }>).find(
      (item) => item.jti === revokedJti
    )
    expect(activeEntry).toBeUndefined()

    const inactiveListRes = await agent.get('/api/v1/auth/service-token-revocations?active=false&limit=20')
    expect(inactiveListRes.status).toBe(200)
    const inactiveEntry = (inactiveListRes.body.data.items as Array<{ jti: string }>).find(
      (item) => item.jti === revokedJti
    )
    expect(inactiveEntry).toBeTruthy()
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
    expect('preev' in publicAdjudicators.body.data[0]).toBe(false)
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

  it('supports idempotent logout even after session is already destroyed', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'logout-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'logout-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const logoutRes = await agent.post('/api/auth/logout').send()
    expect(logoutRes.status).toBe(200)
    expect(logoutRes.body.data?.success).toBe(true)

    const meAfterLogout = await agent.get('/api/auth/me')
    expect(meAfterLogout.status).toBe(401)

    const secondLogoutRes = await agent.post('/api/auth/logout').send()
    expect(secondLogoutRes.status).toBe(200)
    expect(secondLogoutRes.body.data?.success).toBe(true)
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
      preev: 3,
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
      adjudicator_ranking_priority: {
        order: ['average'],
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

    const compiledAdjSnapshotRes = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'raw',
      options: {
        ...compileOptions,
        include_labels: ['teams', 'adjudicators'],
      },
    })
    expect(compiledAdjSnapshotRes.status).toBe(201)
    const adjudicatorSnapshotId = compiledAdjSnapshotRes.body.data._id as string

    const splitSnapshotAllocRes = await agent.post('/api/allocations').send({
      tournamentId,
      round: 1,
      snapshotIdTeams: snapshotId,
      snapshotIdAdjudicators: adjudicatorSnapshotId,
      options: {
        team_allocation_algorithm: 'standard',
        adjudicator_allocation_algorithm: 'standard',
        numbers_of_adjudicators: { chairs: 1, panels: 0, trainees: 0 },
        venue_allocation_algorithm_options: { shuffle: false },
      },
    })
    expect(splitSnapshotAllocRes.status).toBe(200)
    expect(splitSnapshotAllocRes.body.data.allocation.length).toBeGreaterThan(0)

    const missingSnapshotRes = await agent.post('/api/allocations/teams').send({
      tournamentId,
      round: 1,
      options: { team_allocation_algorithm: 'standard' },
    })
    expect(missingSnapshotRes.status).toBe(200)
    expect(missingSnapshotRes.body.data.allocation.length).toBeGreaterThan(0)

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

  it('returns NeedMoreTeam before generating allocations with an odd team count', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'odd-team-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'odd-team-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const stylesRes = await agent.get('/api/styles')
    expect(stylesRes.status).toBe(200)
    const styleId = stylesRes.body.data[0].id ?? 1

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Odd Team Open',
      style: styleId,
      options: { style: { team_num: 2, score_weights: [1, 1, 1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    for (const name of ['Team A', 'Team B', 'Team C']) {
      const teamRes = await agent.post('/api/teams').send({ tournamentId, name })
      expect(teamRes.status).toBe(201)
    }

    const teamOnlyRes = await agent.post('/api/allocations/teams').send({
      tournamentId,
      round: 1,
      options: { team_allocation_algorithm: 'standard' },
    })
    expect(teamOnlyRes.status).toBe(412)
    expect(teamOnlyRes.body.errors?.[0]?.name).toBe('NeedMoreTeam')
    expect(teamOnlyRes.body.errors?.[0]?.message).toBe(
      'At least 1 more available teams are needed'
    )

    const combinedRes = await agent.post('/api/allocations').send({
      tournamentId,
      round: 1,
      options: { team_allocation_algorithm: 'standard' },
    })
    expect(combinedRes.status).toBe(412)
    expect(combinedRes.body.errors?.[0]?.name).toBe('NeedMoreTeam')
  })

  it('supports class_based adjudicator allocation through the API', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'class-based-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'class-based-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const stylesRes = await agent.get('/api/styles')
    expect(stylesRes.status).toBe(200)
    const styleId = stylesRes.body.data[0].id ?? 1

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Class Based Open',
      style: styleId,
      options: { style: { team_num: 2, score_weights: [1, 1, 1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    for (const name of ['Team A', 'Team B', 'Team C', 'Team D']) {
      const teamRes = await agent.post('/api/teams').send({ tournamentId, name })
      expect(teamRes.status).toBe(201)
    }

    const judgeB1Res = await agent.post('/api/adjudicators').send({
      tournamentId,
      name: 'Judge B1',
      preev: 9,
      userDefinedData: { judge_class: 'B' },
    })
    expect(judgeB1Res.status).toBe(201)
    const judgeB1Id = judgeB1Res.body.data._id as string

    const judgeB2Res = await agent.post('/api/adjudicators').send({
      tournamentId,
      name: 'Judge B2',
      preev: 7,
      userDefinedData: { judge_class: 'B' },
    })
    expect(judgeB2Res.status).toBe(201)

    const judgeCRes = await agent.post('/api/adjudicators').send({
      tournamentId,
      name: 'Judge C1',
      preev: 3,
      userDefinedData: { judge_class: 'C' },
    })
    expect(judgeCRes.status).toBe(201)
    const judgeCId = judgeCRes.body.data._id as string

    const judgeB3Res = await agent.post('/api/adjudicators').send({
      tournamentId,
      name: 'Judge B3',
      preev: 5,
      userDefinedData: { judge_class: 'B' },
    })
    expect(judgeB3Res.status).toBe(201)

    const roundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

    const drawRes = await agent.post('/api/draws/generate').send({
      tournamentId,
      round: 1,
      save: false,
      options: {
        team_allocation_algorithm: 'standard',
        adjudicator_allocation_algorithm: 'class_based',
        numbers_of_adjudicators: { chairs: 1, panels: 1, trainees: 0 },
        venue_allocation_algorithm_options: { shuffle: false },
      },
    })
    expect(drawRes.status).toBe(200)

    const allocation = drawRes.body.data.allocation as Array<{
      chairs?: string[]
      panels?: string[]
    }>
    const rowWithC = allocation.find((square) => (square.panels ?? []).includes(judgeCId))
    expect(rowWithC).toBeTruthy()
    expect(rowWithC?.chairs).toEqual([judgeB1Id])
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
    expect(saveBreakRes.body.data.break.cutoff_tie_policy).toBe('manual')
    expect(saveBreakRes.body.data.break.participants).toEqual([
      { teamId: alphaId, seed: 1 },
      { teamId: betaId, seed: 2 },
    ])

    const updatedRoundRes = await agent.get(`/api/rounds/${breakRoundId}`).query({ tournamentId })
    expect(updatedRoundRes.status).toBe(200)
    expect(updatedRoundRes.body.data.userDefinedData.break_round).toBe(true)
    expect(updatedRoundRes.body.data.userDefinedData.break.cutoff_tie_policy).toBe('manual')
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
        break: {
          source: 'raw',
          size: 16,
          cutoff_tie_policy: 'include_all',
          seeding: 'high_low',
        },
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
            best_min_count: 1,
            best_max_count: 2,
            poi_min_count: 0,
            poi_max_count: 2,
            allow_low_tie_win: false,
          },
          compile: {
            options: {
              tie_points: 0.25,
            },
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
    expect(round1Res.body.data.userDefinedData.best_min_count).toBe(1)
    expect(round1Res.body.data.userDefinedData.best_max_count).toBe(2)
    expect(round1Res.body.data.userDefinedData.poi_min_count).toBe(0)
    expect(round1Res.body.data.userDefinedData.poi_max_count).toBe(2)
    expect(round1Res.body.data.userDefinedData.allow_low_tie_win).toBe(false)
    expect(round1Res.body.data.userDefinedData.break.size).toBe(16)
    expect(round1Res.body.data.userDefinedData.break.source).toBe('raw')
    expect(round1Res.body.data.userDefinedData.break.cutoff_tie_policy).toBe('include_all')
    expect(round1Res.body.data.userDefinedData.compile.options.tie_points).toBe(0.5)

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
    expect(round2Res.body.data.userDefinedData.best_min_count).toBe(1)
    expect(round2Res.body.data.userDefinedData.best_max_count).toBe(2)
    expect(round2Res.body.data.userDefinedData.poi_min_count).toBe(0)
    expect(round2Res.body.data.userDefinedData.poi_max_count).toBe(2)
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
        break: {
          source: 'raw',
          size: 2,
          cutoff_tie_policy: 'manual',
          seeding: 'high_low',
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
      .send({ tournamentId, name: 'Judge A', preev: 7 })
    expect(adjudicatorARes.status).toBe(201)
    const adjudicatorBRes = await agent
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Judge B', preev: 6 })
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

  it('erases speaker and adjudicator personal data via v1 endpoints', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({ username: 'privacy-erase', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'privacy-erase', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Privacy Erase Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const speakerRes = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Speaker Private',
      userDefinedData: { email: 'speaker@example.com', phone: '000-1111' },
    })
    expect(speakerRes.status).toBe(201)
    const speakerId = speakerRes.body.data._id as string

    const adjudicatorRes = await agent.post('/api/v1/adjudicators').send({
      tournamentId,
      name: 'Judge Private',
      preev: 4,
      template: { available: true, conflicts: ['abc'], conflict_teams: ['team-x'] },
      details: [{ r: 1, available: true, conflicts: ['abc'], conflict_teams: ['team-x'] }],
      userDefinedData: { email: 'judge@example.com', note: 'private-note' },
    })
    expect(adjudicatorRes.status).toBe(201)
    const adjudicatorId = adjudicatorRes.body.data._id as string

    const eraseSpeakerMissingReason = await agent.delete(
      `/api/v1/speakers/${speakerId}/personal-data?tournamentId=${tournamentId}`
    ).send({})
    expect(eraseSpeakerMissingReason.status).toBe(400)

    const eraseSpeakerMissingReauth = await agent.delete(
      `/api/v1/speakers/${speakerId}/personal-data?tournamentId=${tournamentId}`
    ).send({
      reason: 'participant requested erasure',
    })
    expect(eraseSpeakerMissingReauth.status).toBe(400)

    const eraseSpeakerWrongReauth = await agent.delete(
      `/api/v1/speakers/${speakerId}/personal-data?tournamentId=${tournamentId}`
    ).send({
      reason: 'participant requested erasure',
      reauthPassword: 'wrong-password',
    })
    expect(eraseSpeakerWrongReauth.status).toBe(401)

    const eraseSpeakerRes = await agent.delete(
      `/api/v1/speakers/${speakerId}/personal-data?tournamentId=${tournamentId}`
    ).send({
      reason: 'participant requested erasure',
      approvedBy: 'ops-approver-1',
      targetRefs: ['ops:participant:privacy-erase'],
      eraseMode: 'anonymize',
      reauthPassword: 'password123',
    })
    expect(eraseSpeakerRes.status).toBe(200)
    expect(eraseSpeakerRes.body.data.entityType).toBe('speaker')
    expect(eraseSpeakerRes.body.data.redacted).toBe(true)
    expect(eraseSpeakerRes.body.data.reason).toBe('participant requested erasure')
    expect(eraseSpeakerRes.body.data.approvedBy).toBe('ops-approver-1')

    const eraseAdjRes = await agent.delete(
      `/api/v1/adjudicators/${adjudicatorId}/personal-data?tournamentId=${tournamentId}`
    ).send({
      reason: 'judge requested erasure',
      approvedBy: 'ops-approver-1',
      targetRefs: ['ops:adjudicator:privacy-erase'],
      eraseMode: 'anonymize',
      reauthPassword: 'password123',
    })
    expect(eraseAdjRes.status).toBe(200)
    expect(eraseAdjRes.body.data.entityType).toBe('adjudicator')
    expect(eraseAdjRes.body.data.redacted).toBe(true)
    expect(eraseAdjRes.body.data.reason).toBe('judge requested erasure')

    const speakerGetRes = await agent.get(
      `/api/v1/speakers/${speakerId}?tournamentId=${tournamentId}`
    )
    expect(speakerGetRes.status).toBe(200)
    expect(String(speakerGetRes.body.data.name)).toContain('Deleted Speaker')
    expect(speakerGetRes.body.data.userDefinedData).toEqual({})

    const adjudicatorGetRes = await agent.get(
      `/api/v1/adjudicators/${adjudicatorId}?tournamentId=${tournamentId}`
    )
    expect(adjudicatorGetRes.status).toBe(200)
    expect(String(adjudicatorGetRes.body.data.name)).toContain('Deleted Adjudicator')
    expect(adjudicatorGetRes.body.data.preev).toBe(0)
    expect(Array.isArray(adjudicatorGetRes.body.data.details)).toBe(true)
    expect(adjudicatorGetRes.body.data.details).toHaveLength(0)
    expect(adjudicatorGetRes.body.data.userDefinedData).toEqual({})

    const speakerAudit = await waitForResult(
      async () =>
        agent.get(
          `/api/v1/audit-logs?tournamentId=${tournamentId}&action=${encodeURIComponent('speaker.erase_personal_data')}`
        ),
      (response) => Array.isArray(response.body?.data?.items) && response.body.data.items.length > 0
    )
    expect(speakerAudit.status).toBe(200)
    expect(speakerAudit.body.data.items[0].metadata.reason).toBe('participant requested erasure')
    expect(speakerAudit.body.data.items[0].metadata.approvedBy).toBe('ops-approver-1')

    const adjudicatorAudit = await waitForResult(
      async () =>
        agent.get(
          `/api/v1/audit-logs?tournamentId=${tournamentId}&action=${encodeURIComponent('adjudicator.erase_personal_data')}`
        ),
      (response) => Array.isArray(response.body?.data?.items) && response.body.data.items.length > 0
    )
    expect(adjudicatorAudit.status).toBe(200)
    expect(adjudicatorAudit.body.data.items[0].metadata.reason).toBe('judge requested erasure')
    expect(adjudicatorAudit.body.data.items[0].metadata.approvedBy).toBe('ops-approver-1')
  })

  it('returns equivalent speaker personal-data erase payloads on v1 and legacy routes', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({ username: 'privacy-speaker-compat', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'privacy-speaker-compat', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Privacy Speaker Compat Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const speakerV1Res = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Speaker Compat V1',
      userDefinedData: { email: 'speaker-compat-v1@example.com' },
    })
    expect(speakerV1Res.status).toBe(201)
    const speakerV1Id = speakerV1Res.body.data._id as string

    const speakerLegacyRes = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Speaker Compat Legacy',
      userDefinedData: { email: 'speaker-compat-legacy@example.com' },
    })
    expect(speakerLegacyRes.status).toBe(201)
    const speakerLegacyId = speakerLegacyRes.body.data._id as string

    const eraseBody = {
      reason: 'compatibility speaker erase',
      approvedBy: 'ops-speaker-compat',
      targetRefs: ['ops:compat:speaker'],
      eraseMode: 'anonymize',
      reauthPassword: 'password123',
    }

    const v1Res = await agent
      .delete(`/api/v1/speakers/${speakerV1Id}/personal-data?tournamentId=${tournamentId}`)
      .send(eraseBody)
    expect(v1Res.status).toBe(200)
    expect(v1Res.headers.deprecation).toBeUndefined()

    const legacyRes = await agent
      .delete(`/api/speakers/${speakerLegacyId}/personal-data?tournamentId=${tournamentId}`)
      .send(eraseBody)
    expect(legacyRes.status).toBe(200)
    expect(legacyRes.headers.deprecation).toBe('true')
    expect(legacyRes.headers.sunset).toBeTruthy()
    expect(String(legacyRes.headers.link ?? '')).toContain('/api/v1')
    expect(String(legacyRes.headers.warning ?? '')).toContain('Deprecated API')

    const normalizeErasePayload = (payload: unknown) => {
      const body = payload as {
        data?: { entityId?: string }
      }
      return {
        ...(body ?? {}),
        data: {
          ...(body.data ?? {}),
          entityId: '<redacted-id>',
        },
      }
    }

    expect(normalizeErasePayload(legacyRes.body)).toEqual(normalizeErasePayload(v1Res.body))
  })

  it('returns equivalent adjudicator personal-data erase payloads on v1 and legacy routes', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({ username: 'privacy-adj-compat', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'privacy-adj-compat', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Privacy Adjudicator Compat Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const adjudicatorV1Res = await agent.post('/api/v1/adjudicators').send({
      tournamentId,
      name: 'Adjudicator Compat V1',
      preev: 5,
      userDefinedData: { email: 'adj-compat-v1@example.com' },
    })
    expect(adjudicatorV1Res.status).toBe(201)
    const adjudicatorV1Id = adjudicatorV1Res.body.data._id as string

    const adjudicatorLegacyRes = await agent.post('/api/v1/adjudicators').send({
      tournamentId,
      name: 'Adjudicator Compat Legacy',
      preev: 4,
      userDefinedData: { email: 'adj-compat-legacy@example.com' },
    })
    expect(adjudicatorLegacyRes.status).toBe(201)
    const adjudicatorLegacyId = adjudicatorLegacyRes.body.data._id as string

    const eraseBody = {
      reason: 'compatibility adjudicator erase',
      approvedBy: 'ops-adj-compat',
      targetRefs: ['ops:compat:adjudicator'],
      eraseMode: 'anonymize',
      reauthPassword: 'password123',
    }

    const v1Res = await agent
      .delete(`/api/v1/adjudicators/${adjudicatorV1Id}/personal-data?tournamentId=${tournamentId}`)
      .send(eraseBody)
    expect(v1Res.status).toBe(200)
    expect(v1Res.headers.deprecation).toBeUndefined()

    const legacyRes = await agent
      .delete(`/api/adjudicators/${adjudicatorLegacyId}/personal-data?tournamentId=${tournamentId}`)
      .send(eraseBody)
    expect(legacyRes.status).toBe(200)
    expect(legacyRes.headers.deprecation).toBe('true')
    expect(legacyRes.headers.sunset).toBeTruthy()
    expect(String(legacyRes.headers.link ?? '')).toContain('/api/v1')
    expect(String(legacyRes.headers.warning ?? '')).toContain('Deprecated API')

    const normalizeErasePayload = (payload: unknown) => {
      const body = payload as {
        data?: { entityId?: string }
      }
      return {
        ...(body ?? {}),
        data: {
          ...(body.data ?? {}),
          entityId: '<redacted-id>',
        },
      }
    }

    expect(normalizeErasePayload(legacyRes.body)).toEqual(normalizeErasePayload(v1Res.body))
  })

  it('hard deletes speaker/adjudicator and cleans tournament references', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({ username: 'privacy-hard-delete', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'privacy-hard-delete', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Privacy Hard Delete Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const speakerRes = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Hard Delete Speaker',
      userDefinedData: { email: 'hard-delete-speaker@example.com' },
    })
    expect(speakerRes.status).toBe(201)
    const speakerId = speakerRes.body.data._id as string

    const teamGovRes = await agent.post('/api/v1/teams').send({
      tournamentId,
      name: 'Hard Gov',
      template: { speakers: [speakerId] },
      details: [{ r: 1, speakers: [speakerId] }],
    })
    expect(teamGovRes.status).toBe(201)
    const govTeamId = teamGovRes.body.data._id as string

    const teamOppRes = await agent.post('/api/v1/teams').send({
      tournamentId,
      name: 'Hard Opp',
      template: { speakers: [] },
      details: [{ r: 1, speakers: [] }],
    })
    expect(teamOppRes.status).toBe(201)
    const oppTeamId = teamOppRes.body.data._id as string

    const adjudicatorRes = await agent.post('/api/v1/adjudicators').send({
      tournamentId,
      name: 'Hard Delete Adjudicator',
      preev: 5,
      userDefinedData: { email: 'hard-delete-adj@example.com' },
    })
    expect(adjudicatorRes.status).toBe(201)
    const adjudicatorId = adjudicatorRes.body.data._id as string

    const drawRes = await agent.post('/api/v1/draws').send({
      tournamentId,
      round: 1,
      drawOpened: true,
      allocationOpened: false,
      allocation: [
        {
          venue: null,
          teams: { gov: govTeamId, opp: oppTeamId },
          chairs: [adjudicatorId],
          panels: [adjudicatorId],
          trainees: [adjudicatorId],
        },
      ],
    })
    expect(drawRes.status).toBe(201)

    const rawSpeakerRes = await agent.post('/api/v1/raw-results/speakers').send({
      tournamentId,
      id: speakerId,
      from_id: speakerId,
      r: 1,
      scores: [75],
    })
    expect(rawSpeakerRes.status).toBe(201)

    const rawAdjRes = await agent.post('/api/v1/raw-results/adjudicators').send({
      tournamentId,
      id: adjudicatorId,
      from_id: adjudicatorId,
      r: 1,
      score: 7.5,
      judged_teams: [govTeamId, oppTeamId],
      comment: 'private adjudicator comment',
    })
    expect(rawAdjRes.status).toBe(201)

    const eraseSpeakerRes = await agent.delete(
      `/api/v1/speakers/${speakerId}/personal-data?tournamentId=${tournamentId}`
    ).send({
      reason: 'hard delete speaker data',
      approvedBy: 'ops-hard-delete',
      eraseMode: 'hard_delete',
      reauthPassword: 'password123',
    })
    expect(eraseSpeakerRes.status).toBe(200)
    expect(eraseSpeakerRes.body.data.eraseMode).toBe('hard_delete')

    const deletedSpeakerGetRes = await agent.get(
      `/api/v1/speakers/${speakerId}?tournamentId=${tournamentId}`
    )
    expect(deletedSpeakerGetRes.status).toBe(404)

    const teamsAfterSpeakerDelete = await agent.get(`/api/v1/teams?tournamentId=${tournamentId}`)
    expect(teamsAfterSpeakerDelete.status).toBe(200)
    const govTeam = (teamsAfterSpeakerDelete.body.data as Array<{ _id: string; template?: any; details?: any[] }>).find(
      (item) => item._id === govTeamId
    )
    expect(govTeam).toBeTruthy()
    expect(Array.isArray(govTeam?.template?.speakers)).toBe(true)
    expect(govTeam?.template?.speakers).not.toContain(speakerId)
    expect(Array.isArray(govTeam?.details)).toBe(true)
    expect(govTeam?.details?.[0]?.speakers ?? []).not.toContain(speakerId)

    const rawSpeakerAfterDelete = await agent.get(
      `/api/v1/raw-results/speakers?tournamentId=${tournamentId}&id=${speakerId}`
    )
    expect(rawSpeakerAfterDelete.status).toBe(200)
    expect(Array.isArray(rawSpeakerAfterDelete.body.data)).toBe(true)
    expect(rawSpeakerAfterDelete.body.data).toHaveLength(0)

    const eraseAdjRes = await agent.delete(
      `/api/v1/adjudicators/${adjudicatorId}/personal-data?tournamentId=${tournamentId}`
    ).send({
      reason: 'hard delete adjudicator data',
      approvedBy: 'ops-hard-delete',
      eraseMode: 'hard_delete',
      reauthPassword: 'password123',
    })
    expect(eraseAdjRes.status).toBe(200)
    expect(eraseAdjRes.body.data.eraseMode).toBe('hard_delete')

    const deletedAdjGetRes = await agent.get(
      `/api/v1/adjudicators/${adjudicatorId}?tournamentId=${tournamentId}`
    )
    expect(deletedAdjGetRes.status).toBe(404)

    const drawsAfterAdjDelete = await agent.get(`/api/v1/draws?tournamentId=${tournamentId}`)
    expect(drawsAfterAdjDelete.status).toBe(200)
    expect(Array.isArray(drawsAfterAdjDelete.body.data)).toBe(true)
    const firstAllocation = drawsAfterAdjDelete.body.data[0]?.allocation?.[0]
    expect(firstAllocation).toBeTruthy()
    expect(firstAllocation.chairs).not.toContain(adjudicatorId)
    expect(firstAllocation.panels).not.toContain(adjudicatorId)
    expect(firstAllocation.trainees).not.toContain(adjudicatorId)

    const rawAdjAfterDelete = await agent.get(
      `/api/v1/raw-results/adjudicators?tournamentId=${tournamentId}&id=${adjudicatorId}`
    )
    expect(rawAdjAfterDelete.status).toBe(200)
    expect(Array.isArray(rawAdjAfterDelete.body.data)).toBe(true)
    expect(rawAdjAfterDelete.body.data).toHaveLength(0)

    const speakerAudit = await waitForResult(
      async () =>
        agent.get(
          `/api/v1/audit-logs?tournamentId=${tournamentId}&action=${encodeURIComponent('speaker.erase_personal_data')}`
        ),
      (response) => Array.isArray(response.body?.data?.items) && response.body.data.items.length > 0
    )
    expect(speakerAudit.status).toBe(200)
    expect(speakerAudit.body.data.items[0].metadata.eraseMode).toBe('hard_delete')

    const adjudicatorAudit = await waitForResult(
      async () =>
        agent.get(
          `/api/v1/audit-logs?tournamentId=${tournamentId}&action=${encodeURIComponent('adjudicator.erase_personal_data')}`
        ),
      (response) => Array.isArray(response.body?.data?.items) && response.body.data.items.length > 0
    )
    expect(adjudicatorAudit.status).toBe(200)
    expect(adjudicatorAudit.body.data.items[0].metadata.eraseMode).toBe('hard_delete')
  })

  it('supports erasure request workflow: create -> approve -> execute', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({ username: 'privacy-workflow', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'privacy-workflow', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Privacy Workflow Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const speakerRes = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Speaker Workflow',
      userDefinedData: { email: 'workflow@example.com' },
    })
    expect(speakerRes.status).toBe(201)
    const speakerId = speakerRes.body.data._id as string

    const createReqRes = await agent.post('/api/v1/privacy/erasure-requests').send({
      tournamentId,
      targetType: 'speaker',
      targetId: speakerId,
      reason: 'workflow erasure request',
      targetRefs: ['ops:privacy:workflow'],
      eraseMode: 'anonymize',
    })
    expect(createReqRes.status).toBe(201)
    expect(createReqRes.body.data.status).toBe('requested')
    const erasureRequestId = createReqRes.body.data._id as string

    const executeBeforeApproveRes = await agent
      .post(`/api/v1/privacy/erasure-requests/${erasureRequestId}/execute`)
      .send({ tournamentId, reauthPassword: 'password123' })
    expect(executeBeforeApproveRes.status).toBe(409)

    const approveRes = await agent
      .patch(`/api/v1/privacy/erasure-requests/${erasureRequestId}/approve`)
      .send({ tournamentId, approvedBy: 'ops-workflow-approver' })
    expect(approveRes.status).toBe(400)

    const approveWithReauthRes = await agent
      .patch(`/api/v1/privacy/erasure-requests/${erasureRequestId}/approve`)
      .send({
        tournamentId,
        approvedBy: 'ops-workflow-approver',
        reauthPassword: 'password123',
      })
    expect(approveWithReauthRes.status).toBe(200)
    expect(approveWithReauthRes.body.data.status).toBe('approved')

    const executeWithoutReauthRes = await agent
      .post(`/api/v1/privacy/erasure-requests/${erasureRequestId}/execute`)
      .send({ tournamentId })
    expect(executeWithoutReauthRes.status).toBe(400)

    const executeRes = await agent
      .post(`/api/v1/privacy/erasure-requests/${erasureRequestId}/execute`)
      .send({ tournamentId, reauthPassword: 'password123' })
    expect(executeRes.status).toBe(200)
    expect(executeRes.body.data.status).toBe('completed')
    expect(executeRes.body.data.result.entityType).toBe('speaker')
    expect(executeRes.body.data.result.reason).toBe('workflow erasure request')

    const speakerGetRes = await agent.get(
      `/api/v1/speakers/${speakerId}?tournamentId=${tournamentId}`
    )
    expect(speakerGetRes.status).toBe(200)
    expect(String(speakerGetRes.body.data.name)).toContain('Deleted Speaker')

    const listReqRes = await agent.get(
      `/api/v1/privacy/erasure-requests?tournamentId=${tournamentId}`
    )
    expect(listReqRes.status).toBe(200)
    expect(Array.isArray(listReqRes.body.data.items)).toBe(true)
    const found = (listReqRes.body.data.items as Array<{ _id: string; status: string }>).find(
      (item) => item._id === erasureRequestId
    )
    expect(found?.status).toBe('completed')

    const workflowAudit = await waitForResult(
      async () =>
        agent.get(
          `/api/v1/audit-logs?tournamentId=${tournamentId}&action=${encodeURIComponent('privacy.erasure_request.execute')}`
        ),
      (response) => Array.isArray(response.body?.data?.items) && response.body.data.items.length > 0
    )
    expect(workflowAudit.status).toBe(200)
    expect(workflowAudit.body.data.items[0].metadata.reason).toBe('workflow erasure request')
  })

  it('returns equivalent erasure workflow payloads on v1 and legacy routes', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({ username: 'privacy-workflow-compat', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'privacy-workflow-compat', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Privacy Workflow Compat Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const speakerV1Res = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Workflow Compat Speaker V1',
      userDefinedData: { email: 'workflow-compat-v1@example.com' },
    })
    expect(speakerV1Res.status).toBe(201)
    const speakerV1Id = speakerV1Res.body.data._id as string

    const speakerLegacyRes = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Workflow Compat Speaker Legacy',
      userDefinedData: { email: 'workflow-compat-legacy@example.com' },
    })
    expect(speakerLegacyRes.status).toBe(201)
    const speakerLegacyId = speakerLegacyRes.body.data._id as string

    const createBody = {
      tournamentId,
      targetType: 'speaker',
      reason: 'workflow compatibility request',
      targetRefs: ['ops:compat:workflow'],
      eraseMode: 'anonymize',
    }

    const createV1Res = await agent.post('/api/v1/privacy/erasure-requests').send({
      ...createBody,
      targetId: speakerV1Id,
    })
    expect(createV1Res.status).toBe(201)
    expect(createV1Res.headers.deprecation).toBeUndefined()
    const requestV1Id = createV1Res.body.data._id as string

    const createLegacyRes = await agent.post('/api/privacy/erasure-requests').send({
      ...createBody,
      targetId: speakerLegacyId,
    })
    expect(createLegacyRes.status).toBe(201)
    expect(createLegacyRes.headers.deprecation).toBe('true')
    expect(createLegacyRes.headers.sunset).toBeTruthy()
    expect(String(createLegacyRes.headers.link ?? '')).toContain('/api/v1')
    expect(String(createLegacyRes.headers.warning ?? '')).toContain('Deprecated API')
    const requestLegacyId = createLegacyRes.body.data._id as string

    const normalizeRequestPayload = (payload: unknown) => {
      const body = payload as {
        data?: {
          _id?: string
          targetId?: string
          requestedAt?: string
          approvedAt?: string
          executedAt?: string
          createdAt?: string
          updatedAt?: string
          result?: { entityId?: string }
        }
      }
      return {
        ...(body ?? {}),
        data: {
          ...(body.data ?? {}),
          _id: '<request-id>',
          targetId: '<target-id>',
          requestedAt: '<timestamp>',
          approvedAt: body.data?.approvedAt ? '<timestamp>' : body.data?.approvedAt,
          executedAt: body.data?.executedAt ? '<timestamp>' : body.data?.executedAt,
          createdAt: body.data?.createdAt ? '<timestamp>' : body.data?.createdAt,
          updatedAt: body.data?.updatedAt ? '<timestamp>' : body.data?.updatedAt,
          result: body.data?.result
            ? {
                ...body.data.result,
                entityId: '<target-id>',
              }
            : body.data?.result,
        },
      }
    }

    expect(normalizeRequestPayload(createLegacyRes.body)).toEqual(
      normalizeRequestPayload(createV1Res.body)
    )

    const approveBody = {
      tournamentId,
      approvedBy: 'ops-compat-approver',
      reauthPassword: 'password123',
    }

    const approveV1Res = await agent
      .patch(`/api/v1/privacy/erasure-requests/${requestV1Id}/approve`)
      .send(approveBody)
    expect(approveV1Res.status).toBe(200)
    expect(approveV1Res.headers.deprecation).toBeUndefined()

    const approveLegacyRes = await agent
      .patch(`/api/privacy/erasure-requests/${requestLegacyId}/approve`)
      .send(approveBody)
    expect(approveLegacyRes.status).toBe(200)
    expect(approveLegacyRes.headers.deprecation).toBe('true')
    expect(approveLegacyRes.headers.sunset).toBeTruthy()
    expect(String(approveLegacyRes.headers.link ?? '')).toContain('/api/v1')
    expect(String(approveLegacyRes.headers.warning ?? '')).toContain('Deprecated API')
    expect(normalizeRequestPayload(approveLegacyRes.body)).toEqual(
      normalizeRequestPayload(approveV1Res.body)
    )

    const executeBody = {
      tournamentId,
      reauthPassword: 'password123',
    }

    const executeV1Res = await agent
      .post(`/api/v1/privacy/erasure-requests/${requestV1Id}/execute`)
      .send(executeBody)
    expect(executeV1Res.status).toBe(200)
    expect(executeV1Res.headers.deprecation).toBeUndefined()

    const executeLegacyRes = await agent
      .post(`/api/privacy/erasure-requests/${requestLegacyId}/execute`)
      .send(executeBody)
    expect(executeLegacyRes.status).toBe(200)
    expect(executeLegacyRes.headers.deprecation).toBe('true')
    expect(executeLegacyRes.headers.sunset).toBeTruthy()
    expect(String(executeLegacyRes.headers.link ?? '')).toContain('/api/v1')
    expect(String(executeLegacyRes.headers.warning ?? '')).toContain('Deprecated API')
    expect(normalizeRequestPayload(executeLegacyRes.body)).toEqual(
      normalizeRequestPayload(executeV1Res.body)
    )
  })

  it('lists erasure requests with requestedBy filter and cursor pagination', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({ username: 'privacy-list-pagination', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'privacy-list-pagination', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Privacy List Pagination Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const speakerRes = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Speaker List Pagination',
      userDefinedData: { email: 'list-pagination@example.com' },
    })
    expect(speakerRes.status).toBe(201)
    const speakerId = speakerRes.body.data._id as string

    const requesterA = 'erasure-requester-a'
    const requesterB = 'erasure-requester-b'
    const requesterAToken = createServiceToken({
      sub: requesterA,
      scopes: ['read', 'create', 'upsert', 'delete'],
      tournamentIds: [tournamentId],
    })
    const requesterBToken = createServiceToken({
      sub: requesterB,
      scopes: ['read', 'create', 'upsert', 'delete'],
      tournamentIds: [tournamentId],
    })

    const createA1Res = await request(app)
      .post('/api/v1/privacy/erasure-requests')
      .set('Authorization', `Bearer ${requesterAToken}`)
      .set('X-Idempotency-Key', 'privacy-list-a-1')
      .send({
        tournamentId,
        targetType: 'speaker',
        targetId: speakerId,
        reason: 'list pagination requester a one',
        eraseMode: 'anonymize',
      })
    expect(createA1Res.status).toBe(201)

    const createA2Res = await request(app)
      .post('/api/v1/privacy/erasure-requests')
      .set('Authorization', `Bearer ${requesterAToken}`)
      .set('X-Idempotency-Key', 'privacy-list-a-2')
      .send({
        tournamentId,
        targetType: 'speaker',
        targetId: speakerId,
        reason: 'list pagination requester a two',
        eraseMode: 'anonymize',
      })
    expect(createA2Res.status).toBe(201)

    const createB1Res = await request(app)
      .post('/api/v1/privacy/erasure-requests')
      .set('Authorization', `Bearer ${requesterBToken}`)
      .set('X-Idempotency-Key', 'privacy-list-b-1')
      .send({
        tournamentId,
        targetType: 'speaker',
        targetId: speakerId,
        reason: 'list pagination requester b one',
        eraseMode: 'anonymize',
    })
    expect(createB1Res.status).toBe(201)

    const v1CompatRes = await agent.get(
      `/api/v1/privacy/erasure-requests?tournamentId=${encodeURIComponent(tournamentId)}&limit=2`
    )
    expect(v1CompatRes.status).toBe(200)
    expect(v1CompatRes.headers.deprecation).toBeUndefined()

    const legacyCompatRes = await agent.get(
      `/api/privacy/erasure-requests?tournamentId=${encodeURIComponent(tournamentId)}&limit=2`
    )
    expect(legacyCompatRes.status).toBe(200)
    expect(legacyCompatRes.headers.deprecation).toBe('true')
    expect(legacyCompatRes.headers.sunset).toBeTruthy()
    expect(String(legacyCompatRes.headers.link ?? '')).toContain('/api/v1')
    expect(String(legacyCompatRes.headers.warning ?? '')).toContain('Deprecated API')
    expect(legacyCompatRes.body).toEqual(v1CompatRes.body)

    const page1Res = await agent.get(
      `/api/v1/privacy/erasure-requests?tournamentId=${encodeURIComponent(tournamentId)}&limit=2`
    )
    expect(page1Res.status).toBe(200)
    expect(page1Res.body.data.items.length).toBe(2)
    expect(page1Res.body.data.hasMore).toBe(true)
    expect(typeof page1Res.body.data.nextCursor).toBe('string')

    const page1Ids = (page1Res.body.data.items as Array<{ _id: string }>).map((item) => item._id)
    const page2Res = await agent.get(
      `/api/v1/privacy/erasure-requests?tournamentId=${encodeURIComponent(
        tournamentId
      )}&limit=2&cursor=${encodeURIComponent(page1Res.body.data.nextCursor as string)}`
    )
    expect(page2Res.status).toBe(200)
    expect(page2Res.body.data.items.length).toBeGreaterThanOrEqual(1)
    const page2Ids = (page2Res.body.data.items as Array<{ _id: string }>).map((item) => item._id)
    expect(page2Ids.some((id) => page1Ids.includes(id))).toBe(false)

    const requesterARes = await agent.get(
      `/api/v1/privacy/erasure-requests?tournamentId=${encodeURIComponent(
        tournamentId
      )}&requestedBy=${encodeURIComponent(requesterA)}`
    )
    expect(requesterARes.status).toBe(200)
    expect(requesterARes.body.data.items.length).toBe(2)
    expect(
      (requesterARes.body.data.items as Array<{ requestedBy: string }>).every(
        (item) => item.requestedBy === requesterA
      )
    ).toBe(true)

    const invalidCursorRes = await agent.get(
      `/api/v1/privacy/erasure-requests?tournamentId=${encodeURIComponent(tournamentId)}&cursor=invalid-cursor`
    )
    expect(invalidCursorRes.status).toBe(400)

    const malformedCursor = Buffer.from(
      JSON.stringify({
        createdAt: new Date().toISOString(),
        id: 'not-an-object-id',
      }),
      'utf8'
    ).toString('base64url')
    const malformedCursorRes = await agent.get(
      `/api/v1/privacy/erasure-requests?tournamentId=${encodeURIComponent(
        tournamentId
      )}&cursor=${encodeURIComponent(malformedCursor)}`
    )
    expect(malformedCursorRes.status).toBe(400)
  })

  it('supports erasure request workflow: reject and cancel', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({ username: 'privacy-reject-cancel', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'privacy-reject-cancel', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Privacy Reject Cancel Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const speakerRes = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Speaker Reject Cancel',
      userDefinedData: { email: 'reject-cancel@example.com' },
    })
    expect(speakerRes.status).toBe(201)
    const speakerId = speakerRes.body.data._id as string

    const createReqRes = await agent.post('/api/v1/privacy/erasure-requests').send({
      tournamentId,
      targetType: 'speaker',
      targetId: speakerId,
      reason: 'reject flow request',
      targetRefs: ['ops:privacy:reject'],
      eraseMode: 'anonymize',
    })
    expect(createReqRes.status).toBe(201)
    const rejectRequestId = createReqRes.body.data._id as string

    const rejectWithoutReauthRes = await agent
      .patch(`/api/v1/privacy/erasure-requests/${rejectRequestId}/reject`)
      .send({ tournamentId, reason: 'insufficient evidence' })
    expect(rejectWithoutReauthRes.status).toBe(400)

    const rejectRes = await agent
      .patch(`/api/v1/privacy/erasure-requests/${rejectRequestId}/reject`)
      .send({
        tournamentId,
        reason: 'insufficient evidence',
        reauthPassword: 'password123',
      })
    expect(rejectRes.status).toBe(200)
    expect(rejectRes.body.data.status).toBe('rejected')
    expect(rejectRes.body.data.rejectionReason).toBe('insufficient evidence')

    const executeRejectedRes = await agent
      .post(`/api/v1/privacy/erasure-requests/${rejectRequestId}/execute`)
      .send({ tournamentId, reauthPassword: 'password123' })
    expect(executeRejectedRes.status).toBe(409)

    const createCancelReqRes = await agent.post('/api/v1/privacy/erasure-requests').send({
      tournamentId,
      targetType: 'speaker',
      targetId: speakerId,
      reason: 'cancel flow request',
      targetRefs: ['ops:privacy:cancel'],
      eraseMode: 'anonymize',
    })
    expect(createCancelReqRes.status).toBe(201)
    const cancelRequestId = createCancelReqRes.body.data._id as string

    const approveForCancelRes = await agent
      .patch(`/api/v1/privacy/erasure-requests/${cancelRequestId}/approve`)
      .send({
        tournamentId,
        approvedBy: 'ops-approver-cancel',
        reauthPassword: 'password123',
      })
    expect(approveForCancelRes.status).toBe(200)
    expect(approveForCancelRes.body.data.status).toBe('approved')

    const cancelRes = await agent
      .patch(`/api/v1/privacy/erasure-requests/${cancelRequestId}/cancel`)
      .send({
        tournamentId,
        reason: 'request withdrawn',
        reauthPassword: 'password123',
      })
    expect(cancelRes.status).toBe(200)
    expect(cancelRes.body.data.status).toBe('cancelled')
    expect(cancelRes.body.data.rejectionReason).toBe('request withdrawn')

    const executeCancelledRes = await agent
      .post(`/api/v1/privacy/erasure-requests/${cancelRequestId}/execute`)
      .send({ tournamentId, reauthPassword: 'password123' })
    expect(executeCancelledRes.status).toBe(409)

    const rejectedListRes = await agent.get(
      `/api/v1/privacy/erasure-requests?tournamentId=${tournamentId}&status=rejected`
    )
    expect(rejectedListRes.status).toBe(200)
    expect(
      (rejectedListRes.body.data.items as Array<{ _id: string }>).some(
        (item) => item._id === rejectRequestId
      )
    ).toBe(true)

    const cancelledListRes = await agent.get(
      `/api/v1/privacy/erasure-requests?tournamentId=${tournamentId}&status=cancelled`
    )
    expect(cancelledListRes.status).toBe(200)
    expect(
      (cancelledListRes.body.data.items as Array<{ _id: string }>).some(
        (item) => item._id === cancelRequestId
      )
    ).toBe(true)

    const rejectAuditRes = await waitForResult(
      async () =>
        agent.get(
          `/api/v1/audit-logs?tournamentId=${tournamentId}&action=${encodeURIComponent('privacy.erasure_request.reject')}`
        ),
      (response) => Array.isArray(response.body?.data?.items) && response.body.data.items.length > 0
    )
    expect(rejectAuditRes.status).toBe(200)
    const rejectAuditItems = rejectAuditRes.body.data.items as Array<{
      targetId?: string
      metadata?: { reason?: string }
    }>
    const rejectAudit = rejectAuditItems.find((item) => item.targetId === rejectRequestId)
    expect(rejectAudit).toBeTruthy()
    expect(rejectAudit?.metadata?.reason).toBe('insufficient evidence')

    const cancelAuditRes = await waitForResult(
      async () =>
        agent.get(
          `/api/v1/audit-logs?tournamentId=${tournamentId}&action=${encodeURIComponent('privacy.erasure_request.cancel')}`
        ),
      (response) => Array.isArray(response.body?.data?.items) && response.body.data.items.length > 0
    )
    expect(cancelAuditRes.status).toBe(200)
    const cancelAuditItems = cancelAuditRes.body.data.items as Array<{
      targetId?: string
      metadata?: { reason?: string }
    }>
    const cancelAudit = cancelAuditItems.find((item) => item.targetId === cancelRequestId)
    expect(cancelAudit).toBeTruthy()
    expect(cancelAudit?.metadata?.reason).toBe('request withdrawn')
  })

  it('returns equivalent erasure reject/cancel payloads on v1 and legacy routes', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({
        username: 'privacy-reject-cancel-compat',
        password: 'password123',
        role: 'organizer',
      })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'privacy-reject-cancel-compat', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Privacy Reject Cancel Compat Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const speakerV1Res = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Reject Cancel Compat Speaker V1',
      userDefinedData: { email: 'reject-cancel-compat-v1@example.com' },
    })
    expect(speakerV1Res.status).toBe(201)
    const speakerV1Id = speakerV1Res.body.data._id as string

    const speakerLegacyRes = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Reject Cancel Compat Speaker Legacy',
      userDefinedData: { email: 'reject-cancel-compat-legacy@example.com' },
    })
    expect(speakerLegacyRes.status).toBe(201)
    const speakerLegacyId = speakerLegacyRes.body.data._id as string

    const normalizeRequestPayload = (payload: unknown) => {
      const body = payload as {
        data?: {
          _id?: string
          targetId?: string
          requestedAt?: string
          approvedAt?: string
          rejectedAt?: string
          executedAt?: string
          createdAt?: string
          updatedAt?: string
        }
      }
      return {
        ...(body ?? {}),
        data: {
          ...(body.data ?? {}),
          _id: '<request-id>',
          targetId: '<target-id>',
          requestedAt: '<timestamp>',
          approvedAt: body.data?.approvedAt ? '<timestamp>' : body.data?.approvedAt,
          rejectedAt: body.data?.rejectedAt ? '<timestamp>' : body.data?.rejectedAt,
          executedAt: body.data?.executedAt ? '<timestamp>' : body.data?.executedAt,
          createdAt: body.data?.createdAt ? '<timestamp>' : body.data?.createdAt,
          updatedAt: body.data?.updatedAt ? '<timestamp>' : body.data?.updatedAt,
        },
      }
    }

    const createRejectV1Res = await agent.post('/api/v1/privacy/erasure-requests').send({
      tournamentId,
      targetType: 'speaker',
      targetId: speakerV1Id,
      reason: 'compat reject request',
      targetRefs: ['ops:compat:reject'],
      eraseMode: 'anonymize',
    })
    expect(createRejectV1Res.status).toBe(201)
    const rejectV1Id = createRejectV1Res.body.data._id as string

    const createRejectLegacyRes = await agent.post('/api/privacy/erasure-requests').send({
      tournamentId,
      targetType: 'speaker',
      targetId: speakerLegacyId,
      reason: 'compat reject request',
      targetRefs: ['ops:compat:reject'],
      eraseMode: 'anonymize',
    })
    expect(createRejectLegacyRes.status).toBe(201)
    expect(createRejectLegacyRes.headers.deprecation).toBe('true')
    expect(createRejectLegacyRes.headers.sunset).toBeTruthy()
    expect(String(createRejectLegacyRes.headers.link ?? '')).toContain('/api/v1')
    expect(String(createRejectLegacyRes.headers.warning ?? '')).toContain('Deprecated API')
    const rejectLegacyId = createRejectLegacyRes.body.data._id as string
    expect(normalizeRequestPayload(createRejectLegacyRes.body)).toEqual(
      normalizeRequestPayload(createRejectV1Res.body)
    )

    const rejectBody = {
      tournamentId,
      reason: 'compat reject reason',
      reauthPassword: 'password123',
    }

    const rejectV1Res = await agent
      .patch(`/api/v1/privacy/erasure-requests/${rejectV1Id}/reject`)
      .send(rejectBody)
    expect(rejectV1Res.status).toBe(200)
    expect(rejectV1Res.headers.deprecation).toBeUndefined()

    const rejectLegacyRes = await agent
      .patch(`/api/privacy/erasure-requests/${rejectLegacyId}/reject`)
      .send(rejectBody)
    expect(rejectLegacyRes.status).toBe(200)
    expect(rejectLegacyRes.headers.deprecation).toBe('true')
    expect(rejectLegacyRes.headers.sunset).toBeTruthy()
    expect(String(rejectLegacyRes.headers.link ?? '')).toContain('/api/v1')
    expect(String(rejectLegacyRes.headers.warning ?? '')).toContain('Deprecated API')
    expect(normalizeRequestPayload(rejectLegacyRes.body)).toEqual(normalizeRequestPayload(rejectV1Res.body))

    const createCancelV1Res = await agent.post('/api/v1/privacy/erasure-requests').send({
      tournamentId,
      targetType: 'speaker',
      targetId: speakerV1Id,
      reason: 'compat cancel request',
      targetRefs: ['ops:compat:cancel'],
      eraseMode: 'anonymize',
    })
    expect(createCancelV1Res.status).toBe(201)
    const cancelV1Id = createCancelV1Res.body.data._id as string

    const createCancelLegacyRes = await agent.post('/api/privacy/erasure-requests').send({
      tournamentId,
      targetType: 'speaker',
      targetId: speakerLegacyId,
      reason: 'compat cancel request',
      targetRefs: ['ops:compat:cancel'],
      eraseMode: 'anonymize',
    })
    expect(createCancelLegacyRes.status).toBe(201)
    expect(createCancelLegacyRes.headers.deprecation).toBe('true')
    expect(createCancelLegacyRes.headers.sunset).toBeTruthy()
    expect(String(createCancelLegacyRes.headers.link ?? '')).toContain('/api/v1')
    expect(String(createCancelLegacyRes.headers.warning ?? '')).toContain('Deprecated API')
    const cancelLegacyId = createCancelLegacyRes.body.data._id as string
    expect(normalizeRequestPayload(createCancelLegacyRes.body)).toEqual(
      normalizeRequestPayload(createCancelV1Res.body)
    )

    const approveBody = {
      tournamentId,
      approvedBy: 'ops-compat-approver',
      reauthPassword: 'password123',
    }
    const approveV1Res = await agent
      .patch(`/api/v1/privacy/erasure-requests/${cancelV1Id}/approve`)
      .send(approveBody)
    expect(approveV1Res.status).toBe(200)

    const approveLegacyRes = await agent
      .patch(`/api/privacy/erasure-requests/${cancelLegacyId}/approve`)
      .send(approveBody)
    expect(approveLegacyRes.status).toBe(200)
    expect(approveLegacyRes.headers.deprecation).toBe('true')
    expect(approveLegacyRes.headers.sunset).toBeTruthy()
    expect(String(approveLegacyRes.headers.link ?? '')).toContain('/api/v1')
    expect(String(approveLegacyRes.headers.warning ?? '')).toContain('Deprecated API')
    expect(normalizeRequestPayload(approveLegacyRes.body)).toEqual(
      normalizeRequestPayload(approveV1Res.body)
    )

    const cancelBody = {
      tournamentId,
      reason: 'compat cancel reason',
      reauthPassword: 'password123',
    }
    const cancelV1Res = await agent
      .patch(`/api/v1/privacy/erasure-requests/${cancelV1Id}/cancel`)
      .send(cancelBody)
    expect(cancelV1Res.status).toBe(200)
    expect(cancelV1Res.headers.deprecation).toBeUndefined()

    const cancelLegacyRes = await agent
      .patch(`/api/privacy/erasure-requests/${cancelLegacyId}/cancel`)
      .send(cancelBody)
    expect(cancelLegacyRes.status).toBe(200)
    expect(cancelLegacyRes.headers.deprecation).toBe('true')
    expect(cancelLegacyRes.headers.sunset).toBeTruthy()
    expect(String(cancelLegacyRes.headers.link ?? '')).toContain('/api/v1')
    expect(String(cancelLegacyRes.headers.warning ?? '')).toContain('Deprecated API')
    expect(normalizeRequestPayload(cancelLegacyRes.body)).toEqual(normalizeRequestPayload(cancelV1Res.body))
  })

  it('returns equivalent erasure execute-before-approve conflict payloads on v1 and legacy routes', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({
        username: 'privacy-execute-conflict-compat',
        password: 'password123',
        role: 'organizer',
      })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'privacy-execute-conflict-compat', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Privacy Execute Conflict Compat Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const speakerV1Res = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Execute Conflict Speaker V1',
      userDefinedData: { email: 'execute-conflict-v1@example.com' },
    })
    expect(speakerV1Res.status).toBe(201)
    const speakerV1Id = speakerV1Res.body.data._id as string

    const speakerLegacyRes = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Execute Conflict Speaker Legacy',
      userDefinedData: { email: 'execute-conflict-legacy@example.com' },
    })
    expect(speakerLegacyRes.status).toBe(201)
    const speakerLegacyId = speakerLegacyRes.body.data._id as string

    const createV1Res = await agent.post('/api/v1/privacy/erasure-requests').send({
      tournamentId,
      targetType: 'speaker',
      targetId: speakerV1Id,
      reason: 'execute conflict compatibility request',
      targetRefs: ['ops:compat:execute-conflict'],
      eraseMode: 'anonymize',
    })
    expect(createV1Res.status).toBe(201)
    const v1RequestId = createV1Res.body.data._id as string

    const createLegacyRes = await agent.post('/api/privacy/erasure-requests').send({
      tournamentId,
      targetType: 'speaker',
      targetId: speakerLegacyId,
      reason: 'execute conflict compatibility request',
      targetRefs: ['ops:compat:execute-conflict'],
      eraseMode: 'anonymize',
    })
    expect(createLegacyRes.status).toBe(201)
    const legacyRequestId = createLegacyRes.body.data._id as string

    const executeBody = {
      tournamentId,
      reauthPassword: 'password123',
    }

    const v1ConflictRes = await agent
      .post(`/api/v1/privacy/erasure-requests/${v1RequestId}/execute`)
      .send(executeBody)
    expect(v1ConflictRes.status).toBe(409)
    expect(v1ConflictRes.headers.deprecation).toBeUndefined()

    const legacyConflictRes = await agent
      .post(`/api/privacy/erasure-requests/${legacyRequestId}/execute`)
      .send(executeBody)
    expect(legacyConflictRes.status).toBe(409)
    expect(legacyConflictRes.headers.deprecation).toBe('true')
    expect(legacyConflictRes.headers.sunset).toBeTruthy()
    expect(String(legacyConflictRes.headers.link ?? '')).toContain('/api/v1')
    expect(String(legacyConflictRes.headers.warning ?? '')).toContain('Deprecated API')
    expect(legacyConflictRes.body).toEqual(v1ConflictRes.body)
  })

  it('returns equivalent erasure execute-after-cancel conflict payloads on v1 and legacy routes', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({
        username: 'privacy-execute-cancel-conflict-compat',
        password: 'password123',
        role: 'organizer',
      })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'privacy-execute-cancel-conflict-compat', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Privacy Execute Cancel Conflict Compat Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const speakerV1Res = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Execute Cancel Conflict Speaker V1',
      userDefinedData: { email: 'execute-cancel-conflict-v1@example.com' },
    })
    expect(speakerV1Res.status).toBe(201)
    const speakerV1Id = speakerV1Res.body.data._id as string

    const speakerLegacyRes = await agent.post('/api/v1/speakers').send({
      tournamentId,
      name: 'Execute Cancel Conflict Speaker Legacy',
      userDefinedData: { email: 'execute-cancel-conflict-legacy@example.com' },
    })
    expect(speakerLegacyRes.status).toBe(201)
    const speakerLegacyId = speakerLegacyRes.body.data._id as string

    const createV1Res = await agent.post('/api/v1/privacy/erasure-requests').send({
      tournamentId,
      targetType: 'speaker',
      targetId: speakerV1Id,
      reason: 'execute cancel conflict compatibility request',
      targetRefs: ['ops:compat:execute-cancel-conflict'],
      eraseMode: 'anonymize',
    })
    expect(createV1Res.status).toBe(201)
    const v1RequestId = createV1Res.body.data._id as string

    const createLegacyRes = await agent.post('/api/privacy/erasure-requests').send({
      tournamentId,
      targetType: 'speaker',
      targetId: speakerLegacyId,
      reason: 'execute cancel conflict compatibility request',
      targetRefs: ['ops:compat:execute-cancel-conflict'],
      eraseMode: 'anonymize',
    })
    expect(createLegacyRes.status).toBe(201)
    const legacyRequestId = createLegacyRes.body.data._id as string

    const approveBody = {
      tournamentId,
      approvedBy: 'ops-compat-approver',
      reauthPassword: 'password123',
    }

    const approveV1Res = await agent
      .patch(`/api/v1/privacy/erasure-requests/${v1RequestId}/approve`)
      .send(approveBody)
    expect(approveV1Res.status).toBe(200)

    const approveLegacyRes = await agent
      .patch(`/api/privacy/erasure-requests/${legacyRequestId}/approve`)
      .send(approveBody)
    expect(approveLegacyRes.status).toBe(200)

    const cancelBody = {
      tournamentId,
      reason: 'compat cancel for execute conflict',
      reauthPassword: 'password123',
    }

    const cancelV1Res = await agent
      .patch(`/api/v1/privacy/erasure-requests/${v1RequestId}/cancel`)
      .send(cancelBody)
    expect(cancelV1Res.status).toBe(200)

    const cancelLegacyRes = await agent
      .patch(`/api/privacy/erasure-requests/${legacyRequestId}/cancel`)
      .send(cancelBody)
    expect(cancelLegacyRes.status).toBe(200)

    const executeBody = {
      tournamentId,
      reauthPassword: 'password123',
    }

    const v1ConflictRes = await agent
      .post(`/api/v1/privacy/erasure-requests/${v1RequestId}/execute`)
      .send(executeBody)
    expect(v1ConflictRes.status).toBe(409)
    expect(v1ConflictRes.headers.deprecation).toBeUndefined()

    const legacyConflictRes = await agent
      .post(`/api/privacy/erasure-requests/${legacyRequestId}/execute`)
      .send(executeBody)
    expect(legacyConflictRes.status).toBe(409)
    expect(legacyConflictRes.headers.deprecation).toBe('true')
    expect(legacyConflictRes.headers.sunset).toBeTruthy()
    expect(String(legacyConflictRes.headers.link ?? '')).toContain('/api/v1')
    expect(String(legacyConflictRes.headers.warning ?? '')).toContain('Deprecated API')
    expect(legacyConflictRes.body).toEqual(v1ConflictRes.body)
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
      preev: 3,
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
