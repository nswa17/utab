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

  it('normalizes tournament access and backfills memberships through maintenance services', async () => {
    const { runStartupDataMaintenance } = await import('../src/services/startup-data-maintenance.service.js')

    const organizerPassword = 'password123'
    const organizer = await UserModel.create({
      username: 'maintenance-organizer',
      role: 'organizer',
      passwordHash: await hashPassword(organizerPassword),
      tournaments: [],
    })

    const speaker = await UserModel.create({
      username: 'maintenance-speaker',
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

    const firstRun = await runStartupDataMaintenance()
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
      .send({ username: 'maintenance-organizer', password: organizerPassword })
    expect(organizerLogin.status).toBe(200)

    const patchByCreatorMembership = await organizerAgent
      .patch(`/api/tournaments/${String(creatorTournament._id)}`)
      .send({ name: 'Phase8 Creator Tournament Updated' })
    expect(patchByCreatorMembership.status).toBe(200)

    const secondRun = await runStartupDataMaintenance()
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

  it('rejects duplicate ballot submissions for the same submitted entity, round, and matchup', async () => {
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
    expect(secondBallot.status).toBe(409)
    expect(String(secondBallot.body.errors?.[0]?.message ?? '')).toContain(
      'すでにチーム評価が送信されています。送信済みのチーム評価を修正する場合は運営に連絡してください。'
    )

    const adminList = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&round=1&type=ballot`
    )
    expect(adminList.status).toBe(200)
    expect(adminList.body.data.length).toBe(1)
    expect(adminList.body.data[0].payload.comment).toBe('first submission')

    const participantList = await organizer.get(
      `/api/submissions/mine?tournamentId=${tournamentId}&round=1&type=ballot&submittedEntityId=team-a`
    )
    expect(participantList.status).toBe(200)
    expect(participantList.body.data.length).toBe(1)
    expect(participantList.body.data[0].payload.winnerId).toBe('team-a')
  })

  it('rejects duplicate feedback submissions for the same submitted entity, round, and target adjudicator', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'feedback-duplicate-reject', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'feedback-duplicate-reject', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Feedback Duplicate Reject Open',
      style: 1,
      options: {},
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const firstFeedback = await organizer.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: 'judge-a',
      score: 7,
      comment: 'first feedback',
      submittedEntityId: 'team-a',
    })
    expect(firstFeedback.status).toBe(201)

    const secondFeedback = await organizer.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: 'judge-a',
      score: 8,
      comment: 'second feedback',
      submittedEntityId: 'team-a',
    })
    expect(secondFeedback.status).toBe(409)
    expect(String(secondFeedback.body.errors?.[0]?.message ?? '')).toContain(
      'すでにジャッジ評価が送信されています。運営に報告してください。'
    )

    const adminList = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&round=1&type=feedback`
    )
    expect(adminList.status).toBe(200)
    expect(adminList.body.data.length).toBe(1)
    expect(adminList.body.data[0].payload.comment).toBe('first feedback')

    const participantList = await organizer.get(
      `/api/submissions/mine?tournamentId=${tournamentId}&round=1&type=feedback&submittedEntityId=team-a`
    )
    expect(participantList.status).toBe(200)
    expect(participantList.body.data.length).toBe(1)
    expect(participantList.body.data[0].payload.score).toBe(7)
  })

  it('updates submitted ballots via admin submission API', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'submission-update', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'submission-update', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Submission Update Open',
      style: 1,
      options: {},
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const createBallot = await organizer.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [75],
      scoresB: [72],
      speakerIdsA: ['spk-a'],
      speakerIdsB: ['spk-b'],
      comment: 'before update',
      submittedEntityId: 'judge-a',
    })
    expect(createBallot.status).toBe(201)

    const listBefore = await organizer.get(`/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`)
    expect(listBefore.status).toBe(200)
    expect(listBefore.body.data.length).toBe(1)
    const submissionId = listBefore.body.data[0]._id as string

    const updateRes = await organizer.patch(`/api/submissions/${submissionId}`).send({
      tournamentId,
      round: 1,
      payload: {
        teamAId: 'team-a',
        teamBId: 'team-b',
        winnerId: 'team-b',
        scoresA: [71],
        scoresB: [74],
        speakerIdsA: ['spk-a'],
        speakerIdsB: ['spk-b'],
        comment: 'after update',
        submittedEntityId: 'judge-b',
      },
    })
    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data.payload.winnerId).toBe('team-b')
    expect(updateRes.body.data.payload.comment).toBe('after update')
    expect(updateRes.body.data.payload.submittedEntityId).toBe('judge-b')

    const invalidUpdate = await organizer.patch(`/api/submissions/${submissionId}`).send({
      tournamentId,
      payload: {
        teamAId: 'team-a',
        teamBId: 'team-b',
        winnerId: 'unknown-team',
        scoresA: [75],
        scoresB: [75],
      },
    })
    expect(invalidUpdate.status).toBe(400)

    const listAfter = await organizer.get(`/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`)
    expect(listAfter.status).toBe(200)
    expect(listAfter.body.data.length).toBe(1)
    expect(listAfter.body.data[0].payload.comment).toBe('after update')
    expect(listAfter.body.data[0].payload.winnerId).toBe('team-b')
  })

  it('deletes submissions via admin submission API', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'submission-delete', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'submission-delete', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Submission Delete Open',
      style: 1,
      options: {},
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const createBallot = await organizer.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [75],
      scoresB: [72],
      speakerIdsA: ['spk-a'],
      speakerIdsB: ['spk-b'],
      submittedEntityId: 'judge-a',
      comment: 'delete target',
    })
    expect(createBallot.status).toBe(201)

    const listBefore = await organizer.get(`/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`)
    expect(listBefore.status).toBe(200)
    expect(listBefore.body.data.length).toBe(1)
    const submissionId = listBefore.body.data[0]._id as string

    const deleteRes = await organizer.delete(`/api/submissions/${submissionId}?tournamentId=${tournamentId}`)
    expect(deleteRes.status).toBe(200)
    expect(deleteRes.body.data._id).toBe(submissionId)

    const listAfter = await organizer.get(`/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`)
    expect(listAfter.status).toBe(200)
    expect(listAfter.body.data.length).toBe(0)

    const deleteAgain = await organizer.delete(`/api/submissions/${submissionId}?tournamentId=${tournamentId}`)
    expect(deleteAgain.status).toBe(404)
  })

  it('derives scores from matter/manner on admin ballot updates', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'submission-update-matter', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'submission-update-matter', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Submission Update Matter Open',
      style: 1,
      options: {},
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const createBallot = await organizer.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [75, 74],
      scoresB: [72, 71],
      speakerIdsA: ['spk-a-1', 'spk-a-2'],
      speakerIdsB: ['spk-b-1', 'spk-b-2'],
      submittedEntityId: 'judge-a',
    })
    expect(createBallot.status).toBe(201)

    const listRes = await organizer.get(`/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`)
    expect(listRes.status).toBe(200)
    const submissionId = listRes.body.data[0]._id as string

    const updateRes = await organizer.patch(`/api/submissions/${submissionId}`).send({
      tournamentId,
      payload: {
        teamAId: 'team-a',
        teamBId: 'team-b',
        winnerId: 'team-b',
        matterA: [40, 39],
        mannerA: [36, 35],
        matterB: [38, 37],
        mannerB: [35, 34],
        speakerIdsA: ['spk-a-1', 'spk-a-2'],
        speakerIdsB: ['spk-b-1', 'spk-b-2'],
        submittedEntityId: 'judge-b',
      },
    })
    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data.payload.scoresA).toEqual([76, 74])
    expect(updateRes.body.data.payload.scoresB).toEqual([73, 71])
    expect(updateRes.body.data.payload.winnerId).toBe('team-b')
  })

  it('rejects ballots when matter/manner are not provided together', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'submission-update-mm-pair', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'submission-update-mm-pair', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Submission Matter Pair Open',
      style: 1,
      options: {},
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const ballotRes = await organizer.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [75],
      scoresB: [72],
      matterA: [40],
      speakerIdsA: ['spk-a'],
      speakerIdsB: ['spk-b'],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes.status).toBe(400)
    expect(String(ballotRes.body.errors[0].message)).toContain('matterA')
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

  it('keeps adjudicator-only draw publication visible in forced public mode', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'draw-adj-only-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'draw-adj-only-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Draw Adj Only Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const upsert = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      drawOpened: false,
      allocationOpened: true,
      locked: true,
      allocation: [
        {
          venue: 'Room B',
          teams: { gov: 'team-a', opp: 'team-b' },
          chairs: ['chair-1'],
          panels: ['panel-1'],
          trainees: ['trainee-1'],
        },
      ],
    })
    expect(upsert.status).toBe(201)

    const forcedPublic = await organizer.get(`/api/draws?tournamentId=${tournamentId}&public=1`)
    expect(forcedPublic.status).toBe(200)
    expect(forcedPublic.body.data[0].drawOpened).toBe(false)
    expect(forcedPublic.body.data[0].allocationOpened).toBe(true)
    expect(forcedPublic.body.data[0].allocation).toHaveLength(1)
    expect(forcedPublic.body.data[0].allocation[0].teams).toEqual({ gov: '', opp: '' })
    expect(forcedPublic.body.data[0].allocation[0].chairs).toEqual(['chair-1'])
    expect(forcedPublic.body.data[0].allocation[0].panels).toEqual(['panel-1'])
    expect(forcedPublic.body.data[0].allocation[0].trainees).toEqual(['trainee-1'])
    expect('locked' in forcedPublic.body.data[0]).toBe(false)
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
