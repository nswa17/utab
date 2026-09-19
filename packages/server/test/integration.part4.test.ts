import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createServer, type Server } from 'node:http'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { TournamentMemberModel } from '../src/models/tournament-member.js'
import { TournamentModel } from '../src/models/tournament.js'
import { UserModel } from '../src/models/user.js'
import { hashPassword, verifyPassword } from '../src/services/hash.service.js'
import { getSubmissionModel } from '../src/models/submission.js'
import { AuditLogModel } from '../src/models/audit-log.js'

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
  it('allows same-host origin headers while rejecting foreign origins', async () => {
    const organizer = request.agent(app)

    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'csrf-origin-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'csrf-origin-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const address = app.address()
    expect(address && typeof address !== 'string').toBe(true)
    if (!address || typeof address === 'string') {
      throw new Error('Server address is not available')
    }

    const sameHostOrigin = `http://${address.address}:${address.port}`
    const sameHostCreate = await organizer
      .post('/api/tournaments')
      .set('Origin', sameHostOrigin)
      .send({ name: 'Same Host Origin Open', style: 1, options: {} })
    expect(sameHostCreate.status).toBe(201)

    const foreignOriginCreate = await organizer
      .post('/api/tournaments')
      .set('Origin', 'http://evil.example')
      .send({ name: 'Foreign Origin Open', style: 1, options: {} })
    expect(foreignOriginCreate.status).toBe(403)
    expect(foreignOriginCreate.body.errors?.[0]?.message).toBe('Origin/Referer is not allowed')
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

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

    const teamRes = await organizer.post('/api/teams').send({ tournamentId, name: 'Secret Team' })
    expect(teamRes.status).toBe(201)
    const teamIdA = teamRes.body.data._id

    const teamRes2 = await organizer.post('/api/teams').send({ tournamentId, name: 'Hidden Team' })
    expect(teamRes2.status).toBe(201)
    const teamIdB = teamRes2.body.data._id

    const adjudicatorRes = await organizer
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Access Test Judge' })
    expect(adjudicatorRes.status).toBe(201)
    const adjudicatorId = adjudicatorRes.body.data._id

    const drawRes = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      drawOpened: true,
      allocationOpened: true,
      allocation: [
        {
          venue: null,
          teams: { gov: teamIdA, opp: teamIdB },
          chairs: [adjudicatorId],
          panels: [],
          trainees: [],
        },
      ],
    })
    expect(drawRes.status).toBe(201)

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
    const publicRawRes = await request(app).get(
      `/api/raw-results/teams?tournamentId=${tournamentId}`
    )
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
    expect(audienceRawRes.status).toBe(403)

    const feedbackBeforeAccess = await audience.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId,
      score: 7,
      submittedEntityId: teamIdA,
    })
    expect(feedbackBeforeAccess.status).toBe(401)

    const skipAccessRes = await audience.post(`/api/tournaments/${tournamentId}/access`).send({
      action: 'skip',
    })
    expect(skipAccessRes.status).toBe(401)
    expect(skipAccessRes.body.errors?.[0]?.message).toBe('Tournament access password is required')

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

    const audienceTeamsAfterAccessRes = await audience.get(
      `/api/teams?tournamentId=${tournamentId}`
    )
    expect(audienceTeamsAfterAccessRes.status).toBe(200)
    const audienceRawAfterAccessRes = await audience.get(
      `/api/raw-results/teams?tournamentId=${tournamentId}`
    )
    expect(audienceRawAfterAccessRes.status).toBe(403)

    const feedbackAfterAccess = await audience.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId,
      score: 8,
      submittedEntityId: teamIdA,
    })
    expect(feedbackAfterAccess.status).toBe(403)
    expect(feedbackAfterAccess.body.errors?.[0]?.message).toContain(
      'Participant account is not bound to a tournament entity'
    )

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

    const audienceTeamsAfterRotateRes = await audience.get(
      `/api/teams?tournamentId=${tournamentId}`
    )
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

  it('expires tournament access after two hours of inactivity while active sessions slide', async () => {
    const organizer = request.agent(app)
    const participant = request.agent(app)

    expect(
      (
        await organizer
          .post('/api/auth/register')
          .send({ username: 'access-inactivity-owner', password: 'password123', role: 'organizer' })
      ).status
    ).toBe(201)
    expect(
      (
        await organizer
          .post('/api/auth/login')
          .send({ username: 'access-inactivity-owner', password: 'password123' })
      ).status
    ).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Access Inactivity Open',
      style: 1,
      options: {},
      auth: { access: { required: true, password: 'idle-secret' } },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const firstAccess = await participant
      .post(`/api/tournaments/${tournamentId}/access`)
      .send({ action: 'enter', password: 'idle-secret' })
    expect(firstAccess.status).toBe(200)

    const absoluteExpiry = Number(firstAccess.body.data.expiresAt)
    const grantedAt = absoluteExpiry - 24 * 60 * 60 * 1000
    const nowSpy = vi.spyOn(Date, 'now')

    try {
      nowSpy.mockReturnValue(grantedAt + 90 * 60 * 1000)
      expect(
        (await participant.get(`/api/teams?tournamentId=${tournamentId}`)).status
      ).toBe(200)

      nowSpy.mockReturnValue(grantedAt + 3 * 60 * 60 * 1000)
      expect(
        (await participant.get(`/api/teams?tournamentId=${tournamentId}`)).status
      ).toBe(200)

      nowSpy.mockReturnValue(grantedAt + 5 * 60 * 60 * 1000 + 1)
      const inactiveRes = await participant.get(`/api/teams?tournamentId=${tournamentId}`)
      expect(inactiveRes.status).toBe(401)
      expect(inactiveRes.body.errors?.[0]?.message).toBe('Login required for this tournament')
    } finally {
      nowSpy.mockRestore()
    }

    const secondAccess = await participant
      .post(`/api/tournaments/${tournamentId}/access`)
      .send({ action: 'enter', password: 'idle-secret' })
    expect(secondAccess.status).toBe(200)
    const secondGrantedAt = Number(secondAccess.body.data.expiresAt) - 24 * 60 * 60 * 1000

    const secondNowSpy = vi.spyOn(Date, 'now')
    try {
      secondNowSpy.mockReturnValue(secondGrantedAt + 2 * 60 * 60 * 1000 + 1)
      const expiredRes = await participant.get(`/api/teams?tournamentId=${tournamentId}`)
      expect(expiredRes.status).toBe(401)
      expect(expiredRes.body.errors?.[0]?.message).toBe('Login required for this tournament')
    } finally {
      secondNowSpy.mockRestore()
    }
  })

  it('hides rounds and draws marked hidden from participant-facing responses', async () => {
    const organizer = request.agent(app)

    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'hidden-rounds-owner', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'hidden-rounds-owner', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Hidden Rounds Open',
      style: 1,
      options: {},
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const team1 = await organizer.post('/api/teams').send({ tournamentId, name: 'Team 1' })
    const team2 = await organizer.post('/api/teams').send({ tournamentId, name: 'Team 2' })
    const team3 = await organizer.post('/api/teams').send({ tournamentId, name: 'Team 3' })
    const team4 = await organizer.post('/api/teams').send({ tournamentId, name: 'Team 4' })
    expect(team1.status).toBe(201)
    expect(team2.status).toBe(201)
    expect(team3.status).toBe(201)
    expect(team4.status).toBe(201)

    const round1Res = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: { hidden: false },
    })
    expect(round1Res.status).toBe(201)

    const round2Res = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 2,
      name: 'Round 2',
      userDefinedData: { hidden: true },
    })
    expect(round2Res.status).toBe(201)
    const hiddenRoundId = String(round2Res.body.data._id)

    const drawRound1 = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      drawOpened: true,
      allocationOpened: true,
      allocation: [
        {
          teams: {
            gov: String(team1.body.data._id),
            opp: String(team2.body.data._id),
          },
          chairs: [],
          panels: [],
          trainees: [],
        },
      ],
    })
    expect(drawRound1.status).toBe(201)

    const drawRound2 = await organizer.post('/api/draws').send({
      tournamentId,
      round: 2,
      drawOpened: true,
      allocationOpened: true,
      allocation: [
        {
          teams: {
            gov: String(team3.body.data._id),
            opp: String(team4.body.data._id),
          },
          chairs: [],
          panels: [],
          trainees: [],
        },
      ],
    })
    expect(drawRound2.status).toBe(201)

    const organizerRounds = await organizer.get(`/api/rounds?tournamentId=${tournamentId}`)
    expect(organizerRounds.status).toBe(200)
    expect(organizerRounds.body.data).toHaveLength(2)

    const organizerPublicRounds = await organizer.get(
      `/api/rounds?tournamentId=${tournamentId}&public=1`
    )
    expect(organizerPublicRounds.status).toBe(200)
    expect(organizerPublicRounds.body.data).toHaveLength(1)
    expect(organizerPublicRounds.body.data[0].round).toBe(1)

    const publicRounds = await request(app).get(`/api/rounds?tournamentId=${tournamentId}`)
    expect(publicRounds.status).toBe(200)
    expect(publicRounds.body.data).toHaveLength(1)
    expect(publicRounds.body.data[0].round).toBe(1)

    const hiddenRound = await request(app).get(
      `/api/rounds/${hiddenRoundId}?tournamentId=${tournamentId}`
    )
    expect(hiddenRound.status).toBe(404)
    expect(hiddenRound.body.errors?.[0]?.message).toBe('Round not found')

    const organizerPublicDraws = await organizer.get(
      `/api/draws?tournamentId=${tournamentId}&public=1`
    )
    expect(organizerPublicDraws.status).toBe(200)
    expect(organizerPublicDraws.body.data).toHaveLength(1)
    expect(organizerPublicDraws.body.data[0].round).toBe(1)

    const publicDraws = await request(app).get(`/api/draws?tournamentId=${tournamentId}`)
    expect(publicDraws.status).toBe(200)
    expect(publicDraws.body.data).toHaveLength(1)
    expect(publicDraws.body.data[0].round).toBe(1)

    const hiddenRoundDraws = await request(app).get(
      `/api/draws?tournamentId=${tournamentId}&round=2`
    )
    expect(hiddenRoundDraws.status).toBe(200)
    expect(hiddenRoundDraws.body.data).toEqual([])
  })

  it('rejects participant-facing submissions for hidden rounds while allowing organizers', async () => {
    const organizer = request.agent(app)

    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'hidden-round-submissions', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'hidden-round-submissions', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Hidden Round Submissions Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const participant = request.agent(app)
    const accessRes = await participant
      .post(`/api/tournaments/${tournamentId}/access`)
      .send({ action: 'skip' })
    expect(accessRes.status).toBe(200)

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 2,
      name: 'Hidden Round',
      userDefinedData: { hidden: true },
    })
    expect(roundRes.status).toBe(201)

    const publicBallot = await participant
      .post('/api/submissions/ballots')
      .send({
        tournamentId,
        round: 2,
        teamAId: 'team-a',
        teamBId: 'team-b',
        winnerId: 'team-a',
        scoresA: [76],
        scoresB: [74],
        speakerIdsA: ['spk-a'],
        speakerIdsB: ['spk-b'],
        submittedEntityId: 'judge-a',
      })
    expect(publicBallot.status).toBe(400)
    expect(publicBallot.body.errors?.[0]?.message).toBe('round is hidden from participants')

    const publicFeedback = await participant.post('/api/submissions/feedback').send({
      tournamentId,
      round: 2,
      adjudicatorId: 'judge-a',
      score: 6,
      submittedEntityId: 'team-a',
    })
    expect(publicFeedback.status).toBe(400)
    expect(publicFeedback.body.errors?.[0]?.message).toBe('round is hidden from participants')

    const organizerBallot = await organizer.post('/api/submissions/ballots').send({
      tournamentId,
      round: 2,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [76],
      scoresB: [74],
      speakerIdsA: ['spk-a'],
      speakerIdsB: ['spk-b'],
      submittedEntityId: 'judge-a',
    })
    expect(organizerBallot.status).toBe(201)

    const organizerBallotUpdate = await organizer
      .patch(`/api/submissions/${organizerBallot.body.data._id}`)
      .send({
        tournamentId,
        payload: {
          ...organizerBallot.body.data.payload,
          comment: 'updated while hidden',
        },
      })
    expect(organizerBallotUpdate.status).toBe(200)
    expect(organizerBallotUpdate.body.data.payload.comment).toBe('updated while hidden')

    const organizerFeedback = await organizer.post('/api/submissions/feedback').send({
      tournamentId,
      round: 2,
      adjudicatorId: 'judge-a',
      score: 6,
      submittedEntityId: 'team-a',
    })
    expect(organizerFeedback.status).toBe(201)

    const organizerFeedbackUpdate = await organizer
      .patch(`/api/submissions/${organizerFeedback.body.data._id}`)
      .send({
        tournamentId,
        payload: {
          ...organizerFeedback.body.data.payload,
          comment: 'feedback updated while hidden',
        },
      })
    expect(organizerFeedbackUpdate.status).toBe(200)
    expect(organizerFeedbackUpdate.body.data.payload.comment).toBe('feedback updated while hidden')
  })

  it('does not leak team, round, or result records across tournament boundaries', async () => {
    const organizerA = request.agent(app)
    const organizerB = request.agent(app)

    expect(
      (
        await organizerA
          .post('/api/auth/register')
          .send({ username: 'boundary-organizer-a', password: 'password123', role: 'organizer' })
      ).status
    ).toBe(201)
    expect(
      (
        await organizerB
          .post('/api/auth/register')
          .send({ username: 'boundary-organizer-b', password: 'password123', role: 'organizer' })
      ).status
    ).toBe(201)
    expect(
      (
        await organizerA
          .post('/api/auth/login')
          .send({ username: 'boundary-organizer-a', password: 'password123' })
      ).status
    ).toBe(200)
    expect(
      (
        await organizerB
          .post('/api/auth/login')
          .send({ username: 'boundary-organizer-b', password: 'password123' })
      ).status
    ).toBe(200)

    const tournamentARes = await organizerA.post('/api/tournaments').send({
      name: 'Boundary Public A',
      style: 1,
      options: {},
    })
    expect(tournamentARes.status).toBe(201)
    const tournamentAId = String(tournamentARes.body.data._id)

    const tournamentBRes = await organizerB.post('/api/tournaments').send({
      name: 'Boundary Private B',
      style: 1,
      options: {},
      auth: { access: { required: true, password: 'boundary-secret' } },
    })
    expect(tournamentBRes.status).toBe(201)
    const tournamentBId = String(tournamentBRes.body.data._id)

    const teamBRes = await organizerB.post('/api/teams').send({
      tournamentId: tournamentBId,
      name: 'Private Team B',
    })
    expect(teamBRes.status).toBe(201)
    const teamBId = String(teamBRes.body.data._id)

    const roundBRes = await organizerB.post('/api/rounds').send({
      tournamentId: tournamentBId,
      round: 1,
      name: 'Private Round B',
      motions: ['Secret motion'],
      motionOpened: true,
    })
    expect(roundBRes.status).toBe(201)
    const roundBId = String(roundBRes.body.data._id)

    const resultBRes = await organizerB.post('/api/results').send({
      tournamentId: tournamentBId,
      round: 1,
      payload: { secret: 'result-only-for-b' },
    })
    expect(resultBRes.status).toBe(201)
    const resultBId = String(resultBRes.body.data._id)

    const leakedTeamRes = await request(app).get(
      `/api/teams/${teamBId}?tournamentId=${tournamentAId}`
    )
    expect(leakedTeamRes.status).toBe(404)

    const leakedRoundRes = await request(app).get(
      `/api/rounds/${roundBId}?tournamentId=${tournamentAId}`
    )
    expect(leakedRoundRes.status).toBe(404)

    const leakedResultRes = await organizerA.get(
      `/api/results/${resultBId}?tournamentId=${tournamentAId}`
    )
    expect(leakedResultRes.status).toBe(404)
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

    const createTeamA = await organizer
      .post('/api/teams')
      .send({ tournamentId, name: 'Audit Team 1' })
    expect(createTeamA.status).toBe(201)
    const teamIdA = createTeamA.body.data._id as string

    const createTeamB = await organizer
      .post('/api/teams')
      .send({ tournamentId, name: 'Audit Team 2' })
    expect(createTeamB.status).toBe(201)

    const updateTeamA = await organizer
      .patch(`/api/teams/${teamIdA}`)
      .send({ tournamentId, name: 'Audit Team 1 Updated' })
    expect(updateTeamA.status).toBe(200)

    const deleteTeamA = await organizer.delete(`/api/teams/${teamIdA}?tournamentId=${tournamentId}`)
    expect(deleteTeamA.status).toBe(200)

    const firstPage = await waitForResult(
      () =>
        organizer.get(`/api/audit-logs?tournamentId=${tournamentId}&action=team.create&limit=1`),
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

  it('persists an audit reservation before starting an audited mutation', async () => {
    const organizer = request.agent(app)
    expect(
      (
        await organizer.post('/api/auth/register').send({
          username: 'audit-durable-reservation-owner',
          password: 'password123',
          role: 'organizer',
        })
      ).status
    ).toBe(201)
    expect(
      (
        await organizer.post('/api/auth/login').send({
          username: 'audit-durable-reservation-owner',
          password: 'password123',
        })
      ).status
    ).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Audit Durable Reservation Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const { getTeamModel } = await import('../src/models/team.js')
    const connection = await getTournamentConnection(tournamentId)
    const TeamModel = getTeamModel(connection)

    const originalUpdateOne = (AuditLogModel as any).updateOne.bind(AuditLogModel)
    let releaseReservation!: () => void
    const reservationGate = new Promise<void>((resolve) => {
      releaseReservation = resolve
    })
    let signalReservationStarted!: () => void
    const reservationStarted = new Promise<void>((resolve) => {
      signalReservationStarted = resolve
    })

    const auditSpy = vi.spyOn(AuditLogModel as any, 'updateOne').mockImplementation(
      (filter: any, update: any, ...args: any[]) => {
        const query = originalUpdateOne(filter, update, ...args)
        const isTargetReservation =
          update?.$setOnInsert?.action === 'team.create' &&
          update?.$setOnInsert?.tournamentId === tournamentId &&
          update?.$setOnInsert?.outcome === 'pending'
        if (!isTargetReservation) return query
        return {
          exec: async () => {
            signalReservationStarted()
            await reservationGate
            return await query.exec()
          },
        }
      }
    )

    let responseSettled = false
    const pendingResponse = organizer
      .post('/api/teams')
      .send({ tournamentId, name: 'Blocked Until Audit Durable' })
      .then((response) => {
        responseSettled = true
        return response
      })

    await reservationStarted
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(responseSettled).toBe(false)
    expect(
      await TeamModel.countDocuments({
        tournamentId,
        name: 'Blocked Until Audit Durable',
      }).exec()
    ).toBe(0)

    releaseReservation()
    const response = await pendingResponse
    auditSpy.mockRestore()

    expect(response.status).toBe(201)
    const log = await AuditLogModel.findOne({
      tournamentId,
      action: 'team.create',
      targetId: String(response.body.data._id),
    })
      .lean()
      .exec()
    expect(log?.outcome).toBe('succeeded')
    expect((log?.metadata as any)?.statusCode).toBe(201)
  })

  it('fails before mutation when the audit reservation cannot be made durable', async () => {
    const organizer = request.agent(app)
    expect(
      (
        await organizer.post('/api/auth/register').send({
          username: 'audit-reservation-failure-owner',
          password: 'password123',
          role: 'organizer',
        })
      ).status
    ).toBe(201)
    expect(
      (
        await organizer.post('/api/auth/login').send({
          username: 'audit-reservation-failure-owner',
          password: 'password123',
        })
      ).status
    ).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Audit Reservation Failure Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const { getTeamModel } = await import('../src/models/team.js')
    const connection = await getTournamentConnection(tournamentId)
    const TeamModel = getTeamModel(connection)

    const originalUpdateOne = (AuditLogModel as any).updateOne.bind(AuditLogModel)
    let injectedAttempts = 0
    const auditSpy = vi.spyOn(AuditLogModel as any, 'updateOne').mockImplementation(
      (filter: any, update: any, ...args: any[]) => {
        const isTargetReservation =
          update?.$setOnInsert?.action === 'team.create' &&
          update?.$setOnInsert?.tournamentId === tournamentId &&
          update?.$setOnInsert?.outcome === 'pending'
        if (!isTargetReservation) return originalUpdateOne(filter, update, ...args)
        return {
          exec: async () => {
            injectedAttempts += 1
            throw new Error('injected audit reservation failure')
          },
        }
      }
    )

    const response = await organizer
      .post('/api/teams')
      .send({ tournamentId, name: 'Must Not Mutate Without Audit' })
    auditSpy.mockRestore()

    expect(response.status).toBe(503)
    expect(response.body.errors?.[0]?.message).toContain('mutation was not started')
    expect(injectedAttempts).toBe(3)
    expect(
      await TeamModel.countDocuments({
        tournamentId,
        name: 'Must Not Mutate Without Audit',
      }).exec()
    ).toBe(0)
    expect(
      await AuditLogModel.countDocuments({
        tournamentId,
        action: 'team.create',
      }).exec()
    ).toBe(0)
  })

  it('keeps the durable pending audit record if outcome finalization fails', async () => {
    const organizer = request.agent(app)
    expect(
      (
        await organizer.post('/api/auth/register').send({
          username: 'audit-finalization-failure-owner',
          password: 'password123',
          role: 'organizer',
        })
      ).status
    ).toBe(201)
    expect(
      (
        await organizer.post('/api/auth/login').send({
          username: 'audit-finalization-failure-owner',
          password: 'password123',
        })
      ).status
    ).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Audit Finalization Failure Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const { getTeamModel } = await import('../src/models/team.js')
    const connection = await getTournamentConnection(tournamentId)
    const TeamModel = getTeamModel(connection)

    const originalUpdateOne = (AuditLogModel as any).updateOne.bind(AuditLogModel)
    let finalizationAttempts = 0
    const auditSpy = vi.spyOn(AuditLogModel as any, 'updateOne').mockImplementation(
      (filter: any, update: any, ...args: any[]) => {
        const isTargetFinalization =
          filter?.outcome === 'pending' &&
          update?.$set?.action === 'team.create' &&
          update?.$set?.tournamentId === tournamentId
        if (!isTargetFinalization) return originalUpdateOne(filter, update, ...args)
        return {
          exec: async () => {
            finalizationAttempts += 1
            throw new Error('injected audit finalization failure')
          },
        }
      }
    )

    const response = await organizer
      .post('/api/teams')
      .send({ tournamentId, name: 'Mutation With Pending Audit' })
    auditSpy.mockRestore()

    expect(response.status).toBe(201)
    expect(finalizationAttempts).toBe(3)
    expect(
      await TeamModel.countDocuments({
        tournamentId,
        name: 'Mutation With Pending Audit',
      }).exec()
    ).toBe(1)

    const reservation = await AuditLogModel.findOne({
      tournamentId,
      action: 'team.create',
      outcome: 'pending',
    })
      .lean()
      .exec()
    expect(reservation).toBeTruthy()
  })

  it('normalizes tournament access and backfills memberships through maintenance services', async () => {
    const { runStartupDataMaintenance } =
      await import('../src/services/startup-data-maintenance.service.js')

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
    await TournamentModel.collection.updateOne(
      { _id: creatorTournament._id },
      { $set: { createdBy: organizer._id } }
    )

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
    expect(firstRun.membershipsCreatedFromCreatedBy).toBeGreaterThan(0)

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
    const organizerUserId = registerRes.body.data.userId as string

    const initialMembership = await TournamentMemberModel.findOne({
      tournamentId,
      userId: organizerUserId,
    })
      .lean()
      .exec()
    expect(initialMembership?.role).toBe('organizer')

    const removeSelf = await organizer.delete(
      `/api/tournaments/${tournamentId}/users?username=organizer-c`
    )
    expect(removeSelf.status).toBe(200)

    const forbiddenPatch = await organizer
      .patch(`/api/tournaments/${tournamentId}`)
      .send({ name: 'Membership Open Updated' })
    expect(forbiddenPatch.status).toBe(403)
  })

  it('blocks concurrent tournament membership mutations with a lease', async () => {
    const owner = request.agent(app)
    const ownerRegisterRes = await owner
      .post('/api/auth/register')
      .send({ username: 'membership-lease-owner', password: 'password123', role: 'organizer' })
    expect(ownerRegisterRes.status).toBe(201)
    const ownerLoginRes = await owner
      .post('/api/auth/login')
      .send({ username: 'membership-lease-owner', password: 'password123' })
    expect(ownerLoginRes.status).toBe(200)

    const targetRegisterRes = await request(app).post('/api/auth/register').send({
      username: 'membership-lease-target',
      password: 'password123',
      role: 'speaker',
    })
    expect(targetRegisterRes.status).toBe(201)

    const tournamentRes = await owner
      .post('/api/tournaments')
      .send({ name: 'Membership Lease Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const {
      acquireTournamentMembershipLease,
      releaseTournamentMembershipLease,
    } = await import('../src/services/tournament-membership-guard.service.js')
    const lease = await acquireTournamentMembershipLease(
      tournamentId,
      'membership-lease-target'
    )
    expect(lease).toBeTruthy()
    if (!lease) throw new Error('Failed to acquire membership test lease')

    try {
      const blockedAdd = await owner.post(`/api/tournaments/${tournamentId}/users`).send({
        username: 'membership-lease-target',
        password: 'ignored-password',
        role: 'speaker',
      })
      expect(blockedAdd.status).toBe(409)

      const blockedRemove = await owner.delete(
        `/api/tournaments/${tournamentId}/users?username=membership-lease-target`
      )
      expect(blockedRemove.status).toBe(409)
    } finally {
      expect(await releaseTournamentMembershipLease(lease)).toBe(true)
    }

    const retryAdd = await owner.post(`/api/tournaments/${tournamentId}/users`).send({
      username: 'membership-lease-target',
      password: 'ignored-password',
      role: 'speaker',
    })
    expect(retryAdd.status).toBe(200)
  })

  it('revokes organizer admin access immediately when membership is removed in another session', async () => {
    const owner = request.agent(app)
    const ownerRegisterRes = await owner
      .post('/api/v1/auth/register')
      .send({ username: 'membership-owner', password: 'password123', role: 'organizer' })
    expect(ownerRegisterRes.status).toBe(201)
    const ownerLoginRes = await owner
      .post('/api/v1/auth/login')
      .send({ username: 'membership-owner', password: 'password123' })
    expect(ownerLoginRes.status).toBe(200)

    const invitedRegisterRes = await request(app).post('/api/v1/auth/register').send({
      username: 'membership-invited',
      password: 'password123',
      role: 'organizer',
    })
    expect(invitedRegisterRes.status).toBe(201)

    const tournamentRes = await owner.post('/api/v1/tournaments').send({
      name: 'Cross Session Membership Open',
      style: 1,
      options: { privateFlag: 'owner-only' },
      user_defined_data: { ownerMemo: 'secret-note' },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const addUserRes = await owner.post(`/api/v1/tournaments/${tournamentId}/users`).send({
      username: 'membership-invited',
      password: 'ignored-password',
      role: 'organizer',
    })
    expect(addUserRes.status).toBe(200)

    const invited = request.agent(app)
    const invitedLoginRes = await invited.post('/api/v1/auth/login').send({
      username: 'membership-invited',
      password: 'password123',
    })
    expect(invitedLoginRes.status).toBe(200)

    const patchBeforeRemoval = await invited
      .patch(`/api/v1/tournaments/${tournamentId}`)
      .send({ name: 'Cross Session Membership Open Updated' })
    expect(patchBeforeRemoval.status).toBe(200)

    const removeUserRes = await owner.delete(
      `/api/v1/tournaments/${tournamentId}/users?username=membership-invited`
    )
    expect(removeUserRes.status).toBe(200)

    const patchAfterRemoval = await invited
      .patch(`/api/v1/tournaments/${tournamentId}`)
      .send({ name: 'Should Be Forbidden' })
    expect(patchAfterRemoval.status).toBe(403)

    const getAfterRemoval = await invited.get(`/api/v1/tournaments/${tournamentId}`)
    expect(getAfterRemoval.status).toBe(200)
    expect(getAfterRemoval.body.data.options).toBeUndefined()
    expect(getAfterRemoval.body.data.user_defined_data).toBeUndefined()
  })

  it('grants tournament admin access from organizer membership even when the global role is speaker', async () => {
    const owner = request.agent(app)
    const ownerRegisterRes = await owner
      .post('/api/auth/register')
      .send({ username: 'membership-role-owner', password: 'password123', role: 'organizer' })
    expect(ownerRegisterRes.status).toBe(201)
    const ownerLoginRes = await owner
      .post('/api/auth/login')
      .send({ username: 'membership-role-owner', password: 'password123' })
    expect(ownerLoginRes.status).toBe(200)

    const speakerRegisterRes = await request(app).post('/api/auth/register').send({
      username: 'membership-role-speaker',
      password: 'password123',
      role: 'speaker',
    })
    expect(speakerRegisterRes.status).toBe(201)

    const tournamentRes = await owner.post('/api/tournaments').send({
      name: 'Membership Role Promotion Open',
      style: 1,
      options: {},
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const addUserRes = await owner.post(`/api/tournaments/${tournamentId}/users`).send({
      username: 'membership-role-speaker',
      password: 'ignored-password',
      role: 'organizer',
    })
    expect(addUserRes.status).toBe(200)

    const speaker = request.agent(app)
    const speakerLoginRes = await speaker.post('/api/auth/login').send({
      username: 'membership-role-speaker',
      password: 'password123',
    })
    expect(speakerLoginRes.status).toBe(200)
    expect(speakerLoginRes.body.data.role).toBe('speaker')
    expect(speakerLoginRes.body.data.tournaments).toContain(tournamentId)
    expect(speakerLoginRes.body.data.organizerTournaments).toContain(tournamentId)

    const patchRes = await speaker
      .patch(`/api/tournaments/${tournamentId}`)
      .send({ name: 'Membership Role Promotion Open Updated' })
    expect(patchRes.status).toBe(200)
  })

  it('does not grant tournament admin access to organizers who only have a non-organizer membership role', async () => {
    const owner = request.agent(app)
    const ownerRegisterRes = await owner
      .post('/api/auth/register')
      .send({ username: 'membership-role-owner-2', password: 'password123', role: 'organizer' })
    expect(ownerRegisterRes.status).toBe(201)
    const ownerLoginRes = await owner
      .post('/api/auth/login')
      .send({ username: 'membership-role-owner-2', password: 'password123' })
    expect(ownerLoginRes.status).toBe(200)

    const organizerRegisterRes = await request(app).post('/api/auth/register').send({
      username: 'membership-role-organizer',
      password: 'password123',
      role: 'organizer',
    })
    expect(organizerRegisterRes.status).toBe(201)

    const tournamentRes = await owner.post('/api/tournaments').send({
      name: 'Membership Role Restriction Open',
      style: 1,
      options: {},
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const addUserRes = await owner.post(`/api/tournaments/${tournamentId}/users`).send({
      username: 'membership-role-organizer',
      password: 'ignored-password',
      role: 'speaker',
    })
    expect(addUserRes.status).toBe(200)

    const organizer = request.agent(app)
    const organizerLoginRes = await organizer.post('/api/auth/login').send({
      username: 'membership-role-organizer',
      password: 'password123',
    })
    expect(organizerLoginRes.status).toBe(200)
    expect(organizerLoginRes.body.data.role).toBe('organizer')
    expect(organizerLoginRes.body.data.tournaments).toContain(tournamentId)
    expect(organizerLoginRes.body.data.organizerTournaments).not.toContain(tournamentId)

    const patchRes = await organizer
      .patch(`/api/tournaments/${tournamentId}`)
      .send({ name: 'Should Stay Forbidden' })
    expect(patchRes.status).toBe(403)
  })

  it('returns tournament manager names only to superusers in tournament list', async () => {
    const organizer = request.agent(app)
    const organizerRegisterRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'list-owner', password: 'password123', role: 'organizer' })
    expect(organizerRegisterRes.status).toBe(201)

    const organizerLoginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'list-owner', password: 'password123' })
    expect(organizerLoginRes.status).toBe(200)

    const organizerTournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Owner Name Open', style: 1, options: {} })
    expect(organizerTournamentRes.status).toBe(201)
    const tournamentId = organizerTournamentRes.body.data._id as string

    const superuserPassword = 'super-password123'
    await UserModel.create({
      username: 'list-super',
      role: 'superuser',
      passwordHash: await hashPassword(superuserPassword),
      tournaments: [],
    })

    const superuser = request.agent(app)
    const superuserLoginRes = await superuser
      .post('/api/auth/login')
      .send({ username: 'list-super', password: superuserPassword })
    expect(superuserLoginRes.status).toBe(200)

    const superuserListRes = await superuser.get('/api/tournaments')
    expect(superuserListRes.status).toBe(200)
    const superuserTournament = superuserListRes.body.data.find(
      (item: any) => item._id === tournamentId
    )
    expect(superuserTournament).toBeTruthy()
    expect(superuserTournament.createdByName).toBe('list-owner')

    const organizerListRes = await organizer.get('/api/tournaments')
    expect(organizerListRes.status).toBe(200)
    const organizerTournament = organizerListRes.body.data.find(
      (item: any) => item._id === tournamentId
    )
    expect(organizerTournament).toBeTruthy()
    expect('createdByName' in organizerTournament).toBe(false)

    const publicListRes = await request(app).get('/api/tournaments')
    expect(publicListRes.status).toBe(200)
    const publicTournament = publicListRes.body.data.find((item: any) => item._id === tournamentId)
    expect(publicTournament).toBeTruthy()
    expect('createdByName' in publicTournament).toBe(false)
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

    const weakProtectedCreate = await organizer.post('/api/tournaments').send({
      name: 'Weak Protected Open',
      style: 1,
      options: {},
      auth: { access: { required: true, password: 'short' } },
    })
    expect(weakProtectedCreate.status).toBe(400)
    expect(weakProtectedCreate.body.errors?.[0]?.message).toBe(
      'Tournament access password must be at least 10 characters'
    )

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

    const weakPasswordPatch = await organizer.patch(`/api/tournaments/${tournamentId}`).send({
      auth: { access: { password: 'short' } },
    })
    expect(weakPasswordPatch.status).toBe(400)
    expect(weakPasswordPatch.body.errors?.[0]?.message).toBe(
      'Tournament access password must be at least 10 characters'
    )

    const invalidNamePatch = await organizer.patch(`/api/tournaments/${tournamentId}`).send({
      name: '',
    })
    expect(invalidNamePatch.status).toBe(400)
    expect(invalidNamePatch.body.errors.some((issue: any) => issue.path === 'name')).toBe(true)

    const invalidStylePatch = await organizer.patch(`/api/tournaments/${tournamentId}`).send({
      style: 'oops',
    })
    expect(invalidStylePatch.status).toBe(400)
    expect(invalidStylePatch.body.errors.some((issue: any) => issue.path === 'style')).toBe(true)

    const invalidRequiredPatch = await organizer.patch(`/api/tournaments/${tournamentId}`).send({
      auth: { access: { required: 'true' } },
    })
    expect(invalidRequiredPatch.status).toBe(400)
    expect(invalidRequiredPatch.body.errors[0].message).toBe(
      'Invalid tournament access required flag'
    )

    const tournamentAfterInvalidPatch = await organizer.get(`/api/tournaments/${tournamentId}`)
    expect(tournamentAfterInvalidPatch.status).toBe(200)
    expect(tournamentAfterInvalidPatch.body.data.name).toBe('Validation Open')
    expect(tournamentAfterInvalidPatch.body.data.style).toBe(1)
    expect(tournamentAfterInvalidPatch.body.data.auth.access.required).toBe(true)

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
      options: { style: { team_num: 2, score_weights: [1] } },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

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

  it('rejects concurrent duplicate ballot submissions for the same submitted entity, round, and matchup', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'submission-race-admin', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'submission-race-admin', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Submission Race Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const connection = await getTournamentConnection(tournamentId)
    const SubmissionModel = getSubmissionModel(connection)
    const originalCreate = SubmissionModel.create.bind(SubmissionModel) as (
      ...args: any[]
    ) => Promise<any>
    let releaseFirstCreate: (() => void) | null = null
    const firstCreateReleased = new Promise<void>((resolve) => {
      releaseFirstCreate = resolve
    })
    let createCalls = 0

    SubmissionModel.create = (async (...args: any[]) => {
      createCalls += 1
      if (createCalls === 1) {
        await firstCreateReleased
      } else {
        releaseFirstCreate?.()
      }
      return originalCreate(...args)
    }) as typeof SubmissionModel.create

    try {
      const payload = {
        tournamentId,
        round: 1,
        teamAId: 'team-a',
        teamBId: 'team-b',
        winnerId: 'team-a',
        scoresA: [75],
        scoresB: [72],
        comment: 'race submission',
        submittedEntityId: 'team-a',
      }

      const [firstRes, secondRes] = await Promise.all([
        organizer.post('/api/submissions/ballots').send(payload),
        organizer.post('/api/submissions/ballots').send(payload),
      ])

      expect([firstRes.status, secondRes.status].sort()).toEqual([201, 409])
      const adminList = await organizer.get(
        `/api/submissions?tournamentId=${tournamentId}&round=1&type=ballot`
      )
      expect(adminList.status).toBe(200)
      expect(adminList.body.data.length).toBe(1)
    } finally {
      SubmissionModel.create = originalCreate as typeof SubmissionModel.create
    }
  })

  it('requires tournament access and participant identity binding for submission history', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({
        username: 'submission-history-admin-only',
        password: 'password123',
        role: 'organizer',
      })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'submission-history-admin-only', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Submission History Admin Only Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

    const ballotRes = await organizer.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [75],
      scoresB: [72],
      comment: 'organizer-only history',
      submittedEntityId: 'team-a',
    })
    expect(ballotRes.status).toBe(201)

    const anonymousList = await request(app).get(
      `/api/submissions/mine?tournamentId=${tournamentId}&round=1&type=ballot&submittedEntityId=team-a`
    )
    expect(anonymousList.status).toBe(401)

    const createAudienceRes = await organizer.post(`/api/tournaments/${tournamentId}/users`).send({
      username: 'submission-history-audience',
      password: 'password123',
      role: 'audience',
    })
    expect(createAudienceRes.status).toBe(201)

    const audience = request.agent(app)
    const audienceLogin = await audience
      .post('/api/auth/login')
      .send({ username: 'submission-history-audience', password: 'password123' })
    expect(audienceLogin.status).toBe(200)

    const audienceAccess = await audience
      .post(`/api/tournaments/${tournamentId}/access`)
      .send({ action: 'skip' })
    expect(audienceAccess.status).toBe(200)

    const audienceList = await audience.get(
      `/api/submissions/mine?tournamentId=${tournamentId}&round=1&type=ballot&submittedEntityId=team-a`
    )
    expect(audienceList.status).toBe(403)
    expect(String(audienceList.body.errors?.[0]?.message ?? '')).toContain(
      'not bound to a tournament entity'
    )

    const organizerList = await organizer.get(
      `/api/submissions/mine?tournamentId=${tournamentId}&round=1&type=ballot&submittedEntityId=team-a`
    )
    expect(organizerList.status).toBe(200)
    expect(organizerList.body.data.length).toBe(1)
    expect(organizerList.body.data[0].payload.comment).toBe('organizer-only history')
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

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

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
      options: { style: { team_num: 2, score_weights: [1] } },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

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

    const listBefore = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`
    )
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

    const listAfter = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`
    )
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
      options: { style: { team_num: 2, score_weights: [1] } },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

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

    const listBefore = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`
    )
    expect(listBefore.status).toBe(200)
    expect(listBefore.body.data.length).toBe(1)
    const submissionId = listBefore.body.data[0]._id as string

    const deleteRes = await organizer.delete(
      `/api/submissions/${submissionId}?tournamentId=${tournamentId}`
    )
    expect(deleteRes.status).toBe(200)
    expect(deleteRes.body.data._id).toBe(submissionId)

    const listAfter = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`
    )
    expect(listAfter.status).toBe(200)
    expect(listAfter.body.data.length).toBe(0)

    const deleteAgain = await organizer.delete(
      `/api/submissions/${submissionId}?tournamentId=${tournamentId}`
    )
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
      options: { style: { team_num: 2, score_weights: [1, 1] } },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

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

    const listRes = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`
    )
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

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)
    const teamARes = await organizer.post('/api/teams').send({ tournamentId, name: 'Team A' })
    const teamBRes = await organizer.post('/api/teams').send({ tournamentId, name: 'Team B' })
    const chairRes = await organizer
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Chair', preev: 5 })
    const panelRes = await organizer
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Panel', preev: 5 })
    const traineeRes = await organizer
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Trainee', preev: 5 })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    expect(chairRes.status).toBe(201)
    expect(panelRes.status).toBe(201)
    expect(traineeRes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)
    const chairId = String(chairRes.body.data._id)
    const panelId = String(panelRes.body.data._id)
    const traineeId = String(traineeRes.body.data._id)

    const upsert = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      drawOpened: true,
      allocationOpened: false,
      locked: true,
      allocation: [
        {
          venue: null,
          teams: { gov: teamAId, opp: teamBId },
          chairs: [chairId],
          panels: [panelId],
          trainees: [traineeId],
        },
      ],
    })
    expect(upsert.status).toBe(201)

    const adminDraws = await organizer.get(`/api/draws?tournamentId=${tournamentId}`)
    expect(adminDraws.status).toBe(200)
    expect(adminDraws.body.data[0].allocation[0].chairs).toEqual([chairId])
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

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)
    const teamARes = await organizer.post('/api/teams').send({ tournamentId, name: 'Team A' })
    const teamBRes = await organizer.post('/api/teams').send({ tournamentId, name: 'Team B' })
    const chairRes = await organizer
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Chair', preev: 5 })
    const panelRes = await organizer
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Panel', preev: 5 })
    const traineeRes = await organizer
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Trainee', preev: 5 })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    expect(chairRes.status).toBe(201)
    expect(panelRes.status).toBe(201)
    expect(traineeRes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)
    const chairId = String(chairRes.body.data._id)
    const panelId = String(panelRes.body.data._id)
    const traineeId = String(traineeRes.body.data._id)

    const upsert = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      drawOpened: false,
      allocationOpened: true,
      locked: true,
      allocation: [
        {
          venue: null,
          teams: { gov: teamAId, opp: teamBId },
          chairs: [chairId],
          panels: [panelId],
          trainees: [traineeId],
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
    expect(forcedPublic.body.data[0].allocation[0].chairs).toEqual([chairId])
    expect(forcedPublic.body.data[0].allocation[0].panels).toEqual([panelId])
    expect(forcedPublic.body.data[0].allocation[0].trainees).toEqual([traineeId])
    expect('locked' in forcedPublic.body.data[0]).toBe(false)
  })

  it('fills setup data deficits up to requested targets without deleting existing rows', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'devtools-setup-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'devtools-setup-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'DevTools Setup Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const fillRes = await organizer
      .post(`/api/dev-tools/tournaments/${tournamentId}/fill-setup`)
      .send({
        targetTeams: 3,
        targetAdjudicators: 2,
        targetVenues: 2,
        targetInstitutions: 2,
        speakersPerTeam: 2,
      })
    expect(fillRes.status).toBe(200)
    expect(fillRes.body.data.after.teams).toBeGreaterThanOrEqual(3)
    expect(fillRes.body.data.after.adjudicators).toBeGreaterThanOrEqual(2)
    expect(fillRes.body.data.after.venues).toBeGreaterThanOrEqual(2)
    expect(fillRes.body.data.after.speakers).toBeGreaterThanOrEqual(6)
    expect(fillRes.body.data.after.institutions).toBeGreaterThanOrEqual(2)
    expect(fillRes.body.data.after.rounds).toBeGreaterThanOrEqual(1)

    const teamsRes = await organizer.get(`/api/teams?tournamentId=${tournamentId}`)
    const adjudicatorsRes = await organizer.get(`/api/adjudicators?tournamentId=${tournamentId}`)
    const venuesRes = await organizer.get(`/api/venues?tournamentId=${tournamentId}`)
    const speakersRes = await organizer.get(`/api/speakers?tournamentId=${tournamentId}`)
    expect(teamsRes.status).toBe(200)
    expect(adjudicatorsRes.status).toBe(200)
    expect(venuesRes.status).toBe(200)
    expect(speakersRes.status).toBe(200)
    expect(teamsRes.body.data.length).toBeGreaterThanOrEqual(3)
    expect(adjudicatorsRes.body.data.length).toBeGreaterThanOrEqual(2)
    expect(venuesRes.body.data.length).toBeGreaterThanOrEqual(2)
    expect(speakersRes.body.data.length).toBeGreaterThanOrEqual(6)

    const lowerTargetRes = await organizer
      .post(`/api/dev-tools/tournaments/${tournamentId}/fill-setup`)
      .send({
        targetTeams: 1,
        targetAdjudicators: 1,
        targetVenues: 1,
        targetInstitutions: 1,
        speakersPerTeam: 1,
      })
    expect(lowerTargetRes.status).toBe(200)
    expect(lowerTargetRes.body.data.created.teams).toBe(0)
    expect(lowerTargetRes.body.data.created.adjudicators).toBe(0)
    expect(lowerTargetRes.body.data.created.venues).toBe(0)
    expect(lowerTargetRes.body.data.created.institutions).toBe(0)
    expect(lowerTargetRes.body.data.after.teams).toBe(fillRes.body.data.after.teams)
    expect(lowerTargetRes.body.data.after.adjudicators).toBe(fillRes.body.data.after.adjudicators)
    expect(lowerTargetRes.body.data.after.venues).toBe(fillRes.body.data.after.venues)
    expect(lowerTargetRes.body.data.after.institutions).toBe(fillRes.body.data.after.institutions)
  })

  it('fills only missing round submissions and converges to idempotent state', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'devtools-round-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'devtools-round-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'DevTools Round Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: {
        evaluate_from_teams: true,
        evaluate_from_adjudicators: true,
        evaluator_in_team: 'team',
        chairs_always_evaluated: false,
        no_speaker_score: true,
      },
    })
    expect(roundRes.status).toBe(201)

    const teamRows: string[] = []
    for (const name of ['Team A', 'Team B', 'Team C', 'Team D']) {
      const teamRes = await organizer.post('/api/teams').send({ tournamentId, name })
      expect(teamRes.status).toBe(201)
      teamRows.push(String(teamRes.body.data._id))
    }

    const adjudicatorRows: string[] = []
    for (const name of ['Judge A', 'Judge B', 'Judge C', 'Judge D']) {
      const adjudicatorRes = await organizer
        .post('/api/adjudicators')
        .send({ tournamentId, name, preev: 5 })
      expect(adjudicatorRes.status).toBe(201)
      adjudicatorRows.push(String(adjudicatorRes.body.data._id))
    }

    const drawRes = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: null,
          teams: { gov: teamRows[0], opp: teamRows[1] },
          chairs: [adjudicatorRows[0]],
          panels: [adjudicatorRows[1]],
          trainees: [],
        },
        {
          venue: null,
          teams: { gov: teamRows[2], opp: teamRows[3] },
          chairs: [adjudicatorRows[2]],
          panels: [adjudicatorRows[3]],
          trainees: [],
        },
      ],
      drawOpened: true,
      allocationOpened: true,
    })
    expect(drawRes.status).toBe(201)

    const firstBallot = await organizer.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: teamRows[0],
      teamBId: teamRows[1],
      winnerId: teamRows[0],
      scoresA: [],
      scoresB: [],
      submittedEntityId: adjudicatorRows[0],
    })
    expect(firstBallot.status).toBe(201)

    const firstFeedback = await organizer.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: adjudicatorRows[0],
      score: 8,
      submittedEntityId: teamRows[0],
    })
    expect(firstFeedback.status).toBe(201)

    const fillRes = await organizer
      .post(`/api/dev-tools/tournaments/${tournamentId}/fill-round-submissions`)
      .send({ round: 1 })
    expect(fillRes.status).toBe(200)
    expect(fillRes.body.data.expected.ballot).toBe(4)
    expect(fillRes.body.data.expected.feedback).toBe(12)
    expect(fillRes.body.data.before.ballot).toBe(1)
    expect(fillRes.body.data.before.feedback).toBe(1)
    expect(fillRes.body.data.created.ballot).toBe(3)
    expect(fillRes.body.data.created.feedback).toBe(11)
    expect(fillRes.body.data.after.ballot).toBe(4)
    expect(fillRes.body.data.after.feedback).toBe(12)

    const secondFillRes = await organizer
      .post(`/api/dev-tools/tournaments/${tournamentId}/fill-round-submissions`)
      .send({ round: 1 })
    expect(secondFillRes.status).toBe(200)
    expect(secondFillRes.body.data.created.ballot).toBe(0)
    expect(secondFillRes.body.data.created.feedback).toBe(0)
    expect(secondFillRes.body.data.after.ballot).toBe(4)
    expect(secondFillRes.body.data.after.feedback).toBe(12)

    const ballotRows = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`
    )
    const feedbackRows = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&type=feedback&round=1`
    )
    expect(ballotRows.status).toBe(200)
    expect(feedbackRows.status).toBe(200)
    expect(ballotRows.body.data.length).toBe(4)
    expect(feedbackRows.body.data.length).toBe(12)
  })

  it('supports filling ballots and feedback independently', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'devtools-split-feedback', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'devtools-split-feedback', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'DevTools Split Feedback Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: {
        evaluate_from_teams: true,
        evaluate_from_adjudicators: true,
        evaluator_in_team: 'team',
        chairs_always_evaluated: false,
        no_speaker_score: true,
      },
    })
    expect(roundRes.status).toBe(201)

    const teamARes = await organizer.post('/api/teams').send({ tournamentId, name: 'Split Team A' })
    const teamBRes = await organizer.post('/api/teams').send({ tournamentId, name: 'Split Team B' })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)

    const chairRes = await organizer
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Split Chair', preev: 5 })
    const panelRes = await organizer
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Split Panel', preev: 5 })
    expect(chairRes.status).toBe(201)
    expect(panelRes.status).toBe(201)
    const chairId = String(chairRes.body.data._id)
    const panelId = String(panelRes.body.data._id)

    const drawRes = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: null,
          teams: { gov: teamAId, opp: teamBId },
          chairs: [chairId],
          panels: [panelId],
          trainees: [],
        },
      ],
      drawOpened: true,
      allocationOpened: true,
    })
    expect(drawRes.status).toBe(201)

    const fillBallotRes = await organizer
      .post(`/api/dev-tools/tournaments/${tournamentId}/fill-round-submissions`)
      .send({ round: 1, mode: 'ballot' })
    expect(fillBallotRes.status).toBe(200)
    expect(fillBallotRes.body.data.mode).toBe('ballot')
    expect(fillBallotRes.body.data.expected.ballot).toBe(2)
    expect(fillBallotRes.body.data.expected.feedback).toBe(0)
    expect(fillBallotRes.body.data.created.ballot).toBe(2)
    expect(fillBallotRes.body.data.created.feedback).toBe(0)

    const fillFeedbackRes = await organizer
      .post(`/api/dev-tools/tournaments/${tournamentId}/fill-round-submissions`)
      .send({ round: 1, mode: 'feedback' })
    expect(fillFeedbackRes.status).toBe(200)
    expect(fillFeedbackRes.body.data.mode).toBe('feedback')
    expect(fillFeedbackRes.body.data.expected.ballot).toBe(0)
    expect(fillFeedbackRes.body.data.expected.feedback).toBe(6)
    expect(fillFeedbackRes.body.data.created.ballot).toBe(0)
    expect(fillFeedbackRes.body.data.created.feedback).toBe(6)

    const ballotRows = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`
    )
    const feedbackRows = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&type=feedback&round=1`
    )
    expect(ballotRows.status).toBe(200)
    expect(feedbackRows.status).toBe(200)
    expect(ballotRows.body.data.length).toBe(2)
    expect(feedbackRows.body.data.length).toBe(6)
  })

  it('falls back to team template speaker links when round-specific detail is missing', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({
        username: 'devtools-break-speaker-fallback',
        password: 'password123',
        role: 'organizer',
      })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'devtools-break-speaker-fallback', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'DevTools Speaker Fallback Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const round1Res = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: { no_speaker_score: false },
    })
    const round2Res = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 2,
      name: 'Break Round 1',
      userDefinedData: { no_speaker_score: false },
    })
    expect(round1Res.status).toBe(201)
    expect(round2Res.status).toBe(201)

    const speakerARes = await organizer.post('/api/speakers').send({
      tournamentId,
      name: 'Fallback Speaker A',
    })
    const speakerBRes = await organizer.post('/api/speakers').send({
      tournamentId,
      name: 'Fallback Speaker B',
    })
    expect(speakerARes.status).toBe(201)
    expect(speakerBRes.status).toBe(201)
    const speakerAId = String(speakerARes.body.data._id)
    const speakerBId = String(speakerBRes.body.data._id)

    const teamARes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Fallback Team A',
      template: { available: true, conflicts: [], speakers: [speakerAId] },
      details: [{ r: 1, available: true, speakers: [speakerAId], institutions: [] }],
    })
    const teamBRes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Fallback Team B',
      template: { available: true, conflicts: [], speakers: [speakerBId] },
      details: [{ r: 1, available: true, speakers: [speakerBId], institutions: [] }],
    })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)

    const adjudicatorRes = await organizer.post('/api/adjudicators').send({
      tournamentId,
      name: 'Fallback Judge',
      preev: 5,
    })
    expect(adjudicatorRes.status).toBe(201)
    const adjudicatorId = String(adjudicatorRes.body.data._id)

    const drawRes = await organizer.post('/api/draws').send({
      tournamentId,
      round: 2,
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

    const fillRes = await organizer
      .post(`/api/dev-tools/tournaments/${tournamentId}/fill-round-submissions`)
      .send({ round: 2 })
    expect(fillRes.status).toBe(200)
    expect(fillRes.body.data.created.ballot).toBe(1)

    const ballotRows = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&type=ballot&round=2`
    )
    expect(ballotRows.status).toBe(200)
    expect(ballotRows.body.data.length).toBe(1)
    expect(Array.isArray(ballotRows.body.data[0].payload.speakerIdsA)).toBe(true)
    expect(Array.isArray(ballotRows.body.data[0].payload.speakerIdsB)).toBe(true)
    expect(ballotRows.body.data[0].payload.speakerIdsA).toContain(speakerAId)
    expect(ballotRows.body.data[0].payload.speakerIdsB).toContain(speakerBId)
  })

  it('copies tournament data and submissions into a new tournament', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'devtools-copy-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'devtools-copy-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'DevTools Copy Source', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const sourceTournamentId = String(tournamentRes.body.data._id)

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId: sourceTournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: { no_speaker_score: true },
    })
    expect(roundRes.status).toBe(201)

    const teamA = await organizer
      .post('/api/teams')
      .send({ tournamentId: sourceTournamentId, name: 'Copy Team A' })
    const teamB = await organizer
      .post('/api/teams')
      .send({ tournamentId: sourceTournamentId, name: 'Copy Team B' })
    const adjudicator = await organizer
      .post('/api/adjudicators')
      .send({ tournamentId: sourceTournamentId, name: 'Copy Judge A', preev: 5 })
    expect(teamA.status).toBe(201)
    expect(teamB.status).toBe(201)
    expect(adjudicator.status).toBe(201)

    const ballot = await organizer.post('/api/submissions/ballots').send({
      tournamentId: sourceTournamentId,
      round: 1,
      teamAId: String(teamA.body.data._id),
      teamBId: String(teamB.body.data._id),
      winnerId: String(teamA.body.data._id),
      scoresA: [],
      scoresB: [],
      submittedEntityId: String(adjudicator.body.data._id),
    })
    expect(ballot.status).toBe(201)

    const feedback = await organizer.post('/api/submissions/feedback').send({
      tournamentId: sourceTournamentId,
      round: 1,
      adjudicatorId: String(adjudicator.body.data._id),
      score: 8,
      submittedEntityId: String(teamA.body.data._id),
    })
    expect(feedback.status).toBe(201)

    const copyRes = await organizer
      .post(`/api/dev-tools/tournaments/${sourceTournamentId}/copy-tournament`)
      .send({})
    expect(copyRes.status).toBe(201)
    const copiedTournamentId = String(copyRes.body.data.tournamentId)
    expect(copiedTournamentId).not.toBe(sourceTournamentId)
    expect(String(copyRes.body.data.tournamentName)).toContain('(Copy)')

    const copiedTeamsRes = await organizer.get(`/api/teams?tournamentId=${copiedTournamentId}`)
    expect(copiedTeamsRes.status).toBe(200)
    expect(copiedTeamsRes.body.data.length).toBe(2)

    const copiedBallotsRes = await organizer.get(
      `/api/submissions?tournamentId=${copiedTournamentId}&type=ballot&round=1`
    )
    const copiedFeedbackRes = await organizer.get(
      `/api/submissions?tournamentId=${copiedTournamentId}&type=feedback&round=1`
    )
    expect(copiedBallotsRes.status).toBe(200)
    expect(copiedFeedbackRes.status).toBe(200)
    expect(copiedBallotsRes.body.data.length).toBe(1)
    expect(copiedFeedbackRes.body.data.length).toBe(1)
  })

  it('clears only selected round submissions', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'devtools-clear-round-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'devtools-clear-round-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'DevTools Clear Round Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const roundsRes = await organizer.post('/api/rounds').send([
      { tournamentId, round: 1, name: 'Round 1', userDefinedData: { no_speaker_score: true } },
      { tournamentId, round: 2, name: 'Round 2', userDefinedData: { no_speaker_score: true } },
    ])
    expect(roundsRes.status).toBe(201)

    const teamA = await organizer.post('/api/teams').send({ tournamentId, name: 'Clear Team A' })
    const teamB = await organizer.post('/api/teams').send({ tournamentId, name: 'Clear Team B' })
    const adjudicator = await organizer
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Clear Judge A', preev: 5 })
    expect(teamA.status).toBe(201)
    expect(teamB.status).toBe(201)
    expect(adjudicator.status).toBe(201)

    const ballotRound1 = await organizer.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: String(teamA.body.data._id),
      teamBId: String(teamB.body.data._id),
      winnerId: String(teamA.body.data._id),
      scoresA: [],
      scoresB: [],
      submittedEntityId: String(adjudicator.body.data._id),
    })
    const ballotRound2 = await organizer.post('/api/submissions/ballots').send({
      tournamentId,
      round: 2,
      teamAId: String(teamA.body.data._id),
      teamBId: String(teamB.body.data._id),
      winnerId: String(teamB.body.data._id),
      scoresA: [],
      scoresB: [],
      submittedEntityId: String(adjudicator.body.data._id),
    })
    const feedbackRound1 = await organizer.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: String(adjudicator.body.data._id),
      score: 8,
      submittedEntityId: String(teamA.body.data._id),
    })
    const feedbackRound2 = await organizer.post('/api/submissions/feedback').send({
      tournamentId,
      round: 2,
      adjudicatorId: String(adjudicator.body.data._id),
      score: 7,
      submittedEntityId: String(teamB.body.data._id),
    })
    expect(ballotRound1.status).toBe(201)
    expect(ballotRound2.status).toBe(201)
    expect(feedbackRound1.status).toBe(201)
    expect(feedbackRound2.status).toBe(201)

    const clearRes = await organizer
      .post(`/api/dev-tools/tournaments/${tournamentId}/clear-round-submissions`)
      .send({ round: 1 })
    expect(clearRes.status).toBe(200)
    expect(clearRes.body.data.before.ballot).toBe(1)
    expect(clearRes.body.data.before.feedback).toBe(1)
    expect(clearRes.body.data.deleted.ballot).toBe(1)
    expect(clearRes.body.data.deleted.feedback).toBe(1)
    expect(clearRes.body.data.after.ballot).toBe(0)
    expect(clearRes.body.data.after.feedback).toBe(0)

    const round1Ballots = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`
    )
    const round1Feedback = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&type=feedback&round=1`
    )
    const round2Ballots = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&type=ballot&round=2`
    )
    const round2Feedback = await organizer.get(
      `/api/submissions?tournamentId=${tournamentId}&type=feedback&round=2`
    )
    expect(round1Ballots.status).toBe(200)
    expect(round1Feedback.status).toBe(200)
    expect(round2Ballots.status).toBe(200)
    expect(round2Feedback.status).toBe(200)
    expect(round1Ballots.body.data.length).toBe(0)
    expect(round1Feedback.body.data.length).toBe(0)
    expect(round2Ballots.body.data.length).toBe(1)
    expect(round2Feedback.body.data.length).toBe(1)
  })

  it('returns bad request when round submission fill runs without draw allocation', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'devtools-missing-draw', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'devtools-missing-draw', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'DevTools Missing Draw Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

    const fillRes = await organizer
      .post(`/api/dev-tools/tournaments/${tournamentId}/fill-round-submissions`)
      .send({ round: 1 })
    expect(fillRes.status).toBe(400)
  })

  it('requires tournament admin membership for dev-tools endpoints', async () => {
    const owner = request.agent(app)
    const ownerRegister = await owner
      .post('/api/auth/register')
      .send({ username: 'devtools-owner', password: 'password123', role: 'organizer' })
    expect(ownerRegister.status).toBe(201)
    const ownerLogin = await owner
      .post('/api/auth/login')
      .send({ username: 'devtools-owner', password: 'password123' })
    expect(ownerLogin.status).toBe(200)

    const tournamentRes = await owner
      .post('/api/tournaments')
      .send({ name: 'DevTools Access Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const outsider = request.agent(app)
    const outsiderRegister = await outsider
      .post('/api/auth/register')
      .send({ username: 'devtools-outsider', password: 'password123', role: 'organizer' })
    expect(outsiderRegister.status).toBe(201)
    const outsiderLogin = await outsider
      .post('/api/auth/login')
      .send({ username: 'devtools-outsider', password: 'password123' })
    expect(outsiderLogin.status).toBe(200)

    const forbiddenSetup = await outsider
      .post(`/api/dev-tools/tournaments/${tournamentId}/fill-setup`)
      .send({
        targetTeams: 1,
        targetAdjudicators: 1,
        targetVenues: 1,
        targetInstitutions: 1,
        speakersPerTeam: 2,
      })
    expect(forbiddenSetup.status).toBe(403)

    const forbiddenRoundFill = await outsider
      .post(`/api/dev-tools/tournaments/${tournamentId}/fill-round-submissions`)
      .send({ round: 1 })
    expect(forbiddenRoundFill.status).toBe(403)

    const forbiddenRoundClear = await outsider
      .post(`/api/dev-tools/tournaments/${tournamentId}/clear-round-submissions`)
      .send({ round: 1 })
    expect(forbiddenRoundClear.status).toBe(403)

    const forbiddenCopy = await outsider
      .post(`/api/dev-tools/tournaments/${tournamentId}/copy-tournament`)
      .send({})
    expect(forbiddenCopy.status).toBe(403)
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
  it('coordinates round-scoped writes with renumber and delete mutations', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'round-write-guard-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'round-write-guard-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Round Write Guard Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: { no_speaker_score: true },
    })
    expect(roundRes.status).toBe(201)
    const roundId = String(roundRes.body.data._id)
    expect(roundRes.body.data.roundActiveWriteCount).toBeUndefined()
    expect(roundRes.body.data.roundMutationLocked).toBeUndefined()
    expect(roundRes.body.data.roundMutationEpoch).toBeUndefined()

    const teamARes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Round Guard Team A',
    })
    const teamBRes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Round Guard Team B',
    })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)
    const allocation = [
      {
        venue: null,
        teams: { gov: teamAId, opp: teamBId },
        chairs: [],
        panels: [],
        trainees: [],
      },
    ]
    const initialDraw = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation,
      drawOpened: true,
      allocationOpened: true,
    })
    expect(initialDraw.status).toBe(201)

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const {
      acquireRoundMutationLease,
      acquireRoundWriteLease,
      releaseRoundMutationLease,
      releaseRoundWriteLease,
    } = await import('../src/services/round-write-guard.service.js')
    const { getRoundModel } = await import('../src/models/round.js')
    const connection = await getTournamentConnection(tournamentId)

    await getRoundModel(connection)
      .updateOne(
        { _id: roundId, tournamentId },
        {
          $unset: {
            roundActiveWriteCount: 1,
            roundActiveWriteTouchedAt: 1,
            roundMutationLocked: 1,
            roundMutationEpoch: 1,
          },
        }
      )
      .exec()

    const writeLease = await acquireRoundWriteLease(connection, tournamentId, 1, roundId)
    expect(writeLease).toBeTruthy()
    if (!writeLease) throw new Error('expected round write lease')

    const blockedRenumber = await organizer.patch(`/api/rounds/${roundId}`).send({
      tournamentId,
      round: 2,
    })
    expect(blockedRenumber.status).toBe(409)
    expect(blockedRenumber.body.errors?.[0]?.message).toContain('active writes')

    const blockedDelete = await organizer.delete(
      `/api/rounds/${roundId}?tournamentId=${tournamentId}`
    )
    expect(blockedDelete.status).toBe(409)
    expect(blockedDelete.body.errors?.[0]?.message).toContain('active writes')

    await releaseRoundWriteLease(connection, writeLease)

    const mutationLease = await acquireRoundMutationLease(connection, tournamentId, roundId, 1)
    expect(mutationLease).toBeTruthy()
    if (!mutationLease) throw new Error('expected round mutation lease')

    const blockedWriter = await acquireRoundWriteLease(connection, tournamentId, 1, roundId)
    expect(blockedWriter).toBeNull()
    const blockedDrawWrite = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation,
      drawOpened: true,
      allocationOpened: true,
    })
    expect(blockedDrawWrite.status).toBe(409)
    expect(blockedDrawWrite.body.errors?.[0]?.message).toContain('Round changed concurrently')

    const blockedBallotWrite = await organizer.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId,
      teamBId,
      winnerId: teamAId,
      scoresA: [],
      scoresB: [],
    })
    expect(blockedBallotWrite.status).toBe(409)
    expect(blockedBallotWrite.body.errors?.[0]?.message).toContain('Round changed concurrently')

    const blockedResultWrite = await organizer.post('/api/results').send({
      tournamentId,
      round: 1,
      payload: { status: 'should-not-save' },
    })
    expect(blockedResultWrite.status).toBe(409)
    expect(blockedResultWrite.body.errors?.[0]?.message).toContain('Round changed concurrently')

    await releaseRoundMutationLease(connection, mutationLease)

    const renumberRes = await organizer.patch(`/api/rounds/${roundId}`).send({
      tournamentId,
      round: 2,
    })
    expect(renumberRes.status).toBe(200)
    expect(renumberRes.body.data.round).toBe(2)

    const deleteRes = await organizer.delete(
      `/api/rounds/${roundId}?tournamentId=${tournamentId}`
    )
    expect(deleteRes.status).toBe(200)
  })



  it('serializes break configuration and team availability updates for a round', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'break-write-guard-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'break-write-guard-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Break Write Guard Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const round1Res = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    const round2Res = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 2,
      name: 'Break Round',
    })
    expect(round1Res.status).toBe(201)
    expect(round2Res.status).toBe(201)
    const roundId = String(round2Res.body.data._id)

    const teamARes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Break Guard Team A',
      details: [{ r: 2, available: true, conflicts: ['keep-a'], speakers: [] }],
    })
    const teamBRes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Break Guard Team B',
      details: [{ r: 2, available: true, conflicts: ['keep-b'], speakers: [] }],
    })
    const teamCRes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Break Guard Team C',
      details: [{ r: 2, available: true, conflicts: ['keep-c'], speakers: [] }],
    })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    expect(teamCRes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)
    const teamCId = String(teamCRes.body.data._id)

    const breakPayload = {
      tournamentId,
      break: {
        enabled: true,
        source_rounds: [1],
        size: 2,
        cutoff_tie_policy: 'manual',
        seeding: 'fixed_bracket',
        participants: [
          { teamId: teamAId, seed: 1 },
          { teamId: teamBId, seed: 2 },
        ],
      },
      syncTeamAvailability: true,
    }

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const {
      acquireRoundMutationLease,
      releaseRoundMutationLease,
    } = await import('../src/services/round-write-guard.service.js')
    const { getRoundModel } = await import('../src/models/round.js')
    const { getTeamModel } = await import('../src/models/team.js')
    const connection = await getTournamentConnection(tournamentId)

    const competingLease = await acquireRoundMutationLease(connection, tournamentId, roundId, 2)
    expect(competingLease).toBeTruthy()
    if (!competingLease) throw new Error('expected competing round mutation lease')

    const blockedBreakUpdate = await organizer.patch(`/api/rounds/${roundId}/break`).send(breakPayload)
    expect(blockedBreakUpdate.status).toBe(409)
    expect(blockedBreakUpdate.body.errors?.[0]?.message).toContain('active writes')

    await releaseRoundMutationLease(connection, competingLease)

    const updateRes = await organizer.patch(`/api/rounds/${roundId}/break`).send(breakPayload)
    expect(updateRes.status).toBe(200)

    const storedRound = await getRoundModel(connection)
      .findOne({ _id: roundId, tournamentId })
      .lean()
      .exec()
    const storedParticipants = ((storedRound as any)?.userDefinedData?.break?.participants ?? []).map(
      (participant: any) => String(participant.teamId)
    )
    expect(storedParticipants).toEqual([teamAId, teamBId])

    const storedTeams = await getTeamModel(connection).find({ tournamentId }).lean().exec()
    const availability = new Map(
      storedTeams.map((team: any) => {
        const detail = Array.isArray(team.details)
          ? team.details.find((item: any) => Number(item?.r) === 2)
          : null
        return [String(team._id), detail?.available !== false]
      })
    )
    expect(availability.get(teamAId)).toBe(true)
    expect(availability.get(teamBId)).toBe(true)
    expect(availability.get(teamCId)).toBe(false)

    const storedTeamC = storedTeams.find((team: any) => String(team._id) === teamCId) as any
    const storedTeamCDetail = storedTeamC?.details?.find((item: any) => Number(item?.r) === 2)
    expect(storedTeamCDetail?.conflicts).toEqual(['keep-c'])
  })


  it('rolls back round create/delete when an ordinary database write fails', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'round-failure-atomic-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'round-failure-atomic-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Round Failure Atomic Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const teamARes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Failure Atomic Team A',
    })
    const teamBRes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Failure Atomic Team B',
    })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const { getRoundModel } = await import('../src/models/round.js')
    const { getTeamModel } = await import('../src/models/team.js')
    const { getDrawModel } = await import('../src/models/draw.js')
    const { getResultModel } = await import('../src/models/result.js')
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const TeamModel = getTeamModel(connection)
    const DrawModel = getDrawModel(connection)
    const ResultModel = getResultModel(connection)

    const createFailureSpy = vi
      .spyOn(TeamModel as any, 'bulkWrite')
      .mockRejectedValueOnce(new Error('injected round-detail create failure'))

    const failedCreate = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: { no_speaker_score: true },
    })
    expect(failedCreate.status).toBe(500)
    createFailureSpy.mockRestore()

    expect(await RoundModel.findOne({ tournamentId, round: 1 }).lean().exec()).toBeNull()
    const teamsAfterFailedCreate = await TeamModel.find({ tournamentId }).lean().exec()
    expect(
      teamsAfterFailedCreate.every(
        (team: any) =>
          !Array.isArray(team.details) ||
          team.details.every((detail: any) => Number(detail?.r) !== 1)
      )
    ).toBe(true)

    const bulkCreateFailureSpy = vi
      .spyOn(TeamModel as any, 'bulkWrite')
      .mockRejectedValueOnce(new Error('injected bulk round-detail create failure'))
    const failedBulkCreate = await organizer.post('/api/rounds').send([
      { tournamentId, round: 1, name: 'Bulk Round 1' },
      { tournamentId, round: 2, name: 'Bulk Round 2' },
    ])
    expect(failedBulkCreate.status).toBe(500)
    bulkCreateFailureSpy.mockRestore()
    expect(
      await RoundModel.countDocuments({ tournamentId, round: { $in: [1, 2] } }).exec()
    ).toBe(0)
    const teamsAfterFailedBulkCreate = await TeamModel.find({ tournamentId }).lean().exec()
    expect(
      teamsAfterFailedBulkCreate.every(
        (team: any) =>
          !Array.isArray(team.details) ||
          team.details.every((detail: any) => ![1, 2].includes(Number(detail?.r)))
      )
    ).toBe(true)

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: { no_speaker_score: true },
    })
    expect(roundRes.status).toBe(201)
    const roundId = String(roundRes.body.data._id)

    const allocation = [
      {
        venue: null,
        teams: { gov: teamAId, opp: teamBId },
        chairs: [],
        panels: [],
        trainees: [],
      },
    ]
    const drawRes = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation,
      drawOpened: true,
      allocationOpened: true,
    })
    expect(drawRes.status).toBe(201)

    const resultRes = await organizer.post('/api/results').send({
      tournamentId,
      round: 1,
      payload: { marker: 'restore-me' },
    })
    expect(resultRes.status).toBe(201)

    const dependencyFailureSpy = vi
      .spyOn(DrawModel as any, 'deleteMany')
      .mockImplementationOnce(() => ({
        exec: async () => {
          throw new Error('injected dependency delete failure')
        },
      }))

    const failedDependencyDelete = await organizer.delete(
      `/api/rounds/${roundId}?tournamentId=${tournamentId}`
    )
    expect(failedDependencyDelete.status).toBe(500)
    dependencyFailureSpy.mockRestore()

    expect(await RoundModel.findOne({ _id: roundId, tournamentId }).lean().exec()).toBeTruthy()
    expect(await DrawModel.findOne({ tournamentId, round: 1 }).lean().exec()).toBeTruthy()
    expect(await ResultModel.findOne({ tournamentId, round: 1 }).lean().exec()).toBeTruthy()

    const entityCleanupFailureSpy = vi
      .spyOn(TeamModel as any, 'updateMany')
      .mockImplementationOnce(() => ({
        exec: async () => {
          throw new Error('injected entity detail cleanup failure')
        },
      }))

    const failedPostRoundDelete = await organizer.delete(
      `/api/rounds/${roundId}?tournamentId=${tournamentId}`
    )
    expect(failedPostRoundDelete.status).toBe(500)
    entityCleanupFailureSpy.mockRestore()

    expect(await RoundModel.findOne({ _id: roundId, tournamentId }).lean().exec()).toBeTruthy()
    expect(await DrawModel.findOne({ tournamentId, round: 1 }).lean().exec()).toBeTruthy()
    expect(await ResultModel.findOne({ tournamentId, round: 1 }).lean().exec()).toBeTruthy()

    const teamsAfterRollback = await TeamModel.find({ tournamentId }).lean().exec()
    expect(
      teamsAfterRollback.every(
        (team: any) =>
          Array.isArray(team.details) &&
          team.details.some((detail: any) => Number(detail?.r) === 1)
      )
    ).toBe(true)

    const finalDelete = await organizer.delete(
      `/api/rounds/${roundId}?tournamentId=${tournamentId}`
    )
    expect(finalDelete.status).toBe(200)
    expect(await RoundModel.findOne({ _id: roundId, tournamentId }).lean().exec()).toBeNull()

    const bulkRoundsRes = await organizer.post('/api/rounds').send([
      { tournamentId, round: 2, name: 'Bulk Delete Round 2' },
      { tournamentId, round: 3, name: 'Bulk Delete Round 3' },
    ])
    expect(bulkRoundsRes.status).toBe(201)
    const bulkRoundIds = (bulkRoundsRes.body.data as Array<{ _id: string }>).map((item) =>
      String(item._id)
    )
    expect(bulkRoundIds).toHaveLength(2)

    for (const roundNumber of [2, 3]) {
      const storedResult = await organizer.post('/api/results').send({
        tournamentId,
        round: roundNumber,
        payload: { marker: `bulk-restore-${roundNumber}` },
      })
      expect(storedResult.status).toBe(201)
    }

    const bulkCleanupFailureSpy = vi
      .spyOn(TeamModel as any, 'updateMany')
      .mockImplementationOnce(() => ({
        exec: async () => {
          throw new Error('injected bulk entity cleanup failure')
        },
      }))

    const failedBulkDelete = await organizer.delete(
      `/api/rounds?tournamentId=${tournamentId}&ids=${bulkRoundIds.join(',')}`
    )
    expect(failedBulkDelete.status).toBe(500)
    bulkCleanupFailureSpy.mockRestore()

    expect(
      await RoundModel.countDocuments({ _id: { $in: bulkRoundIds }, tournamentId }).exec()
    ).toBe(2)
    expect(
      await ResultModel.countDocuments({ tournamentId, round: { $in: [2, 3] } }).exec()
    ).toBe(2)

    const finalBulkDelete = await organizer.delete(
      `/api/rounds?tournamentId=${tournamentId}&ids=${bulkRoundIds.join(',')}`
    )
    expect(finalBulkDelete.status).toBe(200)
    expect(finalBulkDelete.body.data.deletedCount).toBe(2)
  })


  it('rolls back single and bulk round renumber failures and serializes round namespace changes', async () => {
    const organizer = request.agent(app)
    expect(
      (
        await organizer
          .post('/api/auth/register')
          .send({ username: 'round-renumber-atomic-user', password: 'password123', role: 'organizer' })
      ).status
    ).toBe(201)
    expect(
      (
        await organizer
          .post('/api/auth/login')
          .send({ username: 'round-renumber-atomic-user', password: 'password123' })
      ).status
    ).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Round Renumber Atomic Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const teamA = await organizer.post('/api/teams').send({ tournamentId, name: 'Renumber Team A' })
    const teamB = await organizer.post('/api/teams').send({ tournamentId, name: 'Renumber Team B' })
    expect(teamA.status).toBe(201)
    expect(teamB.status).toBe(201)
    const teamAId = String(teamA.body.data._id)
    const teamBId = String(teamB.body.data._id)

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const { getRoundModel } = await import('../src/models/round.js')
    const { getTeamModel } = await import('../src/models/team.js')
    const { getDrawModel } = await import('../src/models/draw.js')
    const { getResultModel } = await import('../src/models/result.js')
    const {
      acquireRoundNamespaceLease,
      releaseRoundNamespaceLease,
    } = await import('../src/services/round-namespace-guard.service.js')

    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const TeamModel = getTeamModel(connection)
    const DrawModel = getDrawModel(connection)
    const ResultModel = getResultModel(connection)

    const roundOne = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Renumber Round 1',
    })
    expect(roundOne.status).toBe(201)
    const roundOneId = String(roundOne.body.data._id)

    const drawOne = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: null,
          teams: { gov: teamAId, opp: teamBId },
          chairs: [],
          panels: [],
          trainees: [],
        },
      ],
      drawOpened: true,
      allocationOpened: true,
    })
    expect(drawOne.status).toBe(201)
    expect(
      (
        await organizer.post('/api/results').send({
          tournamentId,
          round: 1,
          payload: { marker: 'single-renumber' },
        })
      ).status
    ).toBe(201)

    const singleFailureSpy = vi
      .spyOn(TeamModel as any, 'updateMany')
      .mockImplementationOnce(() => ({
        exec: async () => {
          throw new Error('injected single renumber dependency failure')
        },
      }))

    const failedSingleRenumber = await organizer.patch(`/api/rounds/${roundOneId}`).send({
      tournamentId,
      round: 2,
      name: 'Should Roll Back',
    })
    expect(failedSingleRenumber.status).toBe(500)
    singleFailureSpy.mockRestore()

    expect(await RoundModel.findOne({ _id: roundOneId, tournamentId, round: 1 }).lean().exec()).toBeTruthy()
    expect(await RoundModel.findOne({ tournamentId, round: 2 }).lean().exec()).toBeNull()
    expect(await DrawModel.findOne({ tournamentId, round: 1 }).lean().exec()).toBeTruthy()
    expect(await DrawModel.findOne({ tournamentId, round: 2 }).lean().exec()).toBeNull()
    expect(await ResultModel.findOne({ tournamentId, round: 1 }).lean().exec()).toBeTruthy()
    const teamsAfterSingleRollback = await TeamModel.find({ tournamentId }).lean().exec()
    expect(
      teamsAfterSingleRollback.every(
        (team: any) =>
          team.details.some((detail: any) => Number(detail?.r) === 1) &&
          !team.details.some((detail: any) => Number(detail?.r) === 2)
      )
    ).toBe(true)

    const referenceRound = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 9,
      name: 'Renumber Reference Round',
    })
    expect(referenceRound.status).toBe(201)
    const referenceRoundId = String(referenceRound.body.data._id)
    await RoundModel.updateOne(
      { _id: referenceRoundId, tournamentId },
      { $set: { userDefinedData: { audit: { source_rounds: [1] } } } }
    ).exec()
    await TournamentModel.updateOne(
      { _id: tournamentId },
      { $set: { user_defined_data: { audit: { source_rounds: [1] } } } }
    ).exec()

    const lateFailureSpy = vi
      .spyOn(TournamentModel as any, 'updateOne')
      .mockImplementationOnce(() => ({
        exec: async () => {
          throw new Error('injected renumber metadata failure')
        },
      }))
    const failedLateRenumber = await organizer.patch(`/api/rounds/${roundOneId}`).send({
      tournamentId,
      round: 2,
      name: 'Should Also Roll Back',
    })
    expect(failedLateRenumber.status).toBe(500)
    lateFailureSpy.mockRestore()

    expect(await RoundModel.findOne({ _id: roundOneId, tournamentId, round: 1 }).lean().exec()).toBeTruthy()
    expect(await DrawModel.findOne({ tournamentId, round: 1 }).lean().exec()).toBeTruthy()
    expect(await ResultModel.findOne({ tournamentId, round: 1 }).lean().exec()).toBeTruthy()
    const referenceAfterRollback = await RoundModel.findOne({
      _id: referenceRoundId,
      tournamentId,
    })
      .lean()
      .exec()
    expect((referenceAfterRollback as any)?.userDefinedData?.audit?.source_rounds).toEqual([1])
    const tournamentAfterRollback = await TournamentModel.findById(tournamentId).lean().exec()
    expect((tournamentAfterRollback as any)?.user_defined_data?.audit?.source_rounds).toEqual([1])

    const successfulSingleRenumber = await organizer.patch(`/api/rounds/${roundOneId}`).send({
      tournamentId,
      round: 2,
      name: 'Renumbered Round 2',
    })
    expect(successfulSingleRenumber.status).toBe(200)
    expect(successfulSingleRenumber.body.data.round).toBe(2)
    expect(await DrawModel.findOne({ tournamentId, round: 2 }).lean().exec()).toBeTruthy()
    expect(await ResultModel.findOne({ tournamentId, round: 2 }).lean().exec()).toBeTruthy()

    const bulkCreated = await organizer.post('/api/rounds').send([
      { tournamentId, round: 3, name: 'Bulk Renumber 3' },
      { tournamentId, round: 4, name: 'Bulk Renumber 4' },
    ])
    expect(bulkCreated.status).toBe(201)
    const bulkIds = new Map(
      (bulkCreated.body.data as Array<{ _id: string; round: number }>).map((item) => [
        Number(item.round),
        String(item._id),
      ])
    )
    expect(bulkIds.get(3)).toBeTruthy()
    expect(bulkIds.get(4)).toBeTruthy()

    for (const roundNumber of [3, 4]) {
      expect(
        (
          await organizer.post('/api/results').send({
            tournamentId,
            round: roundNumber,
            payload: { marker: `bulk-renumber-${roundNumber}` },
          })
        ).status
      ).toBe(201)
    }

    const bulkFailureSpy = vi
      .spyOn(TeamModel as any, 'updateMany')
      .mockImplementationOnce(() => ({
        exec: async () => {
          throw new Error('injected bulk renumber dependency failure')
        },
      }))

    const failedBulkRenumber = await organizer.patch('/api/rounds').send([
      { id: bulkIds.get(3), tournamentId, round: 5, name: 'Should Roll Back 5' },
      { id: bulkIds.get(4), tournamentId, round: 6, name: 'Should Roll Back 6' },
    ])
    expect(failedBulkRenumber.status).toBe(500)
    bulkFailureSpy.mockRestore()

    expect(await RoundModel.findOne({ _id: bulkIds.get(3), tournamentId, round: 3 }).lean().exec()).toBeTruthy()
    expect(await RoundModel.findOne({ _id: bulkIds.get(4), tournamentId, round: 4 }).lean().exec()).toBeTruthy()
    expect(await RoundModel.countDocuments({ tournamentId, round: { $in: [5, 6] } }).exec()).toBe(0)
    expect(await ResultModel.countDocuments({ tournamentId, round: { $in: [3, 4] } }).exec()).toBe(2)
    expect(await ResultModel.countDocuments({ tournamentId, round: { $in: [5, 6] } }).exec()).toBe(0)

    const teamsAfterBulkRollback = await TeamModel.find({ tournamentId }).lean().exec()
    expect(
      teamsAfterBulkRollback.every(
        (team: any) =>
          [3, 4].every((roundNumber) =>
            team.details.some((detail: any) => Number(detail?.r) === roundNumber)
          ) &&
          [5, 6].every(
            (roundNumber) =>
              !team.details.some((detail: any) => Number(detail?.r) === roundNumber)
          )
      )
    ).toBe(true)

    const successfulBulkRenumber = await organizer.patch('/api/rounds').send([
      { id: bulkIds.get(3), tournamentId, round: 5, name: 'Renumbered 5' },
      { id: bulkIds.get(4), tournamentId, round: 6, name: 'Renumbered 6' },
    ])
    expect(successfulBulkRenumber.status).toBe(200)
    expect(await ResultModel.countDocuments({ tournamentId, round: { $in: [5, 6] } }).exec()).toBe(2)

    const namespaceLease = await acquireRoundNamespaceLease(connection, tournamentId)
    expect(namespaceLease).toBeTruthy()
    if (!namespaceLease) throw new Error('failed to acquire namespace lease in test')
    try {
      const blockedCreate = await organizer.post('/api/rounds').send({
        tournamentId,
        round: 7,
        name: 'Blocked During Namespace Mutation',
      })
      expect(blockedCreate.status).toBe(409)
      expect(blockedCreate.body.errors?.[0]?.message).toContain('namespace')

      const blockedRenumber = await organizer.patch(`/api/rounds/${roundOneId}`).send({
        tournamentId,
        round: 7,
      })
      expect(blockedRenumber.status).toBe(409)
      expect(blockedRenumber.body.errors?.[0]?.message).toContain('namespace')

      const blockedDelete = await organizer.delete(
        `/api/rounds/${roundOneId}?tournamentId=${tournamentId}`
      )
      expect(blockedDelete.status).toBe(409)
      expect(blockedDelete.body.errors?.[0]?.message).toContain('namespace')

      const blockedBulkDelete = await organizer.delete(
        `/api/rounds?tournamentId=${tournamentId}&ids=${bulkIds.get(3)}`
      )
      expect(blockedBulkDelete.status).toBe(409)
      expect(blockedBulkDelete.body.errors?.[0]?.message).toContain('namespace')
    } finally {
      await releaseRoundNamespaceLease(connection, namespaceLease)
    }

    const createAfterRelease = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 7,
      name: 'Created After Namespace Release',
    })
    expect(createAfterRelease.status).toBe(201)
  })


  it('preserves unrelated concurrent edits during privacy reference cleanup', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'privacy-cas-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'privacy-cas-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Privacy Concurrent Edit Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

    const speakerRes = await organizer.post('/api/speakers').send({
      tournamentId,
      name: 'Privacy Speaker',
    })
    expect(speakerRes.status).toBe(201)
    const speakerId = String(speakerRes.body.data._id)

    const teamRes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Privacy Team',
      template: { available: true, conflicts: [], speakers: [speakerId] },
      details: [
        { r: 1, available: true, conflicts: ['before'], speakers: [speakerId] },
      ],
    })
    expect(teamRes.status).toBe(201)
    const teamId = String(teamRes.body.data._id)

    const adjRes = await organizer.post('/api/adjudicators').send({
      tournamentId,
      name: 'Privacy Judge',
      preev: 5,
    })
    expect(adjRes.status).toBe(201)
    const adjudicatorId = String(adjRes.body.data._id)

    const teamBRes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Privacy Opponent',
    })
    expect(teamBRes.status).toBe(201)
    const teamBId = String(teamBRes.body.data._id)

    const drawRes = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: null,
          teams: { gov: teamId, opp: teamBId },
          chairs: [adjudicatorId],
          panels: [],
          trainees: [],
        },
      ],
      drawOpened: true,
      allocationOpened: true,
    })
    expect(drawRes.status).toBe(201)

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const { getTeamModel } = await import('../src/models/team.js')
    const { getDrawModel } = await import('../src/models/draw.js')
    const {
      executeSpeakerPersonalDataErase,
      executeAdjudicatorPersonalDataErase,
    } = await import('../src/controllers/privacy.js')
    const connection = await getTournamentConnection(tournamentId)
    const TeamModel = getTeamModel(connection)
    const DrawModel = getDrawModel(connection)

    const originalTeamUpdateMany = TeamModel.updateMany.bind(TeamModel)
    const teamUpdateSpy = vi
      .spyOn(TeamModel as any, 'updateMany')
      .mockImplementationOnce((filter: any, update: any) => {
        return {
          exec: async () => {
            await TeamModel.updateOne(
              { _id: teamId, tournamentId, 'details.r': 1 },
              { $set: { 'details.$[detail].conflicts': ['concurrent-edit'] } },
              { arrayFilters: [{ 'detail.r': 1 }] }
            ).exec()
            return await originalTeamUpdateMany(filter, update).exec()
          },
        } as any
      })

    const speakerErase = await executeSpeakerPersonalDataErase({
      tournamentId,
      entityId: speakerId,
      reason: 'test',
      eraseMode: 'hard_delete',
    })
    expect(speakerErase?.redacted).toBe(true)
    teamUpdateSpy.mockRestore()

    const storedTeam = await TeamModel.findOne({ _id: teamId, tournamentId }).lean().exec()
    expect((storedTeam as any)?.template?.speakers ?? []).not.toContain(speakerId)
    const storedDetail = (storedTeam as any)?.details?.find((detail: any) => Number(detail?.r) === 1)
    expect(storedDetail?.speakers ?? []).not.toContain(speakerId)
    expect(storedDetail?.conflicts).toEqual(['concurrent-edit'])

    const drawBefore = await DrawModel.findOne({ tournamentId, round: 1 }).lean().exec()
    const versionBefore = Number((drawBefore as any)?.__v ?? 0)
    const originalDrawUpdateMany = DrawModel.updateMany.bind(DrawModel)
    const drawUpdateSpy = vi
      .spyOn(DrawModel as any, 'updateMany')
      .mockImplementationOnce((filter: any, update: any) => {
        return {
          exec: async () => {
            await DrawModel.updateOne(
              { tournamentId, round: 1 },
              { $set: { 'allocation.0.venue': 'concurrent-venue' }, $inc: { __v: 1 } }
            ).exec()
            return await originalDrawUpdateMany(filter, update).exec()
          },
        } as any
      })

    const adjudicatorErase = await executeAdjudicatorPersonalDataErase({
      tournamentId,
      entityId: adjudicatorId,
      reason: 'test',
      eraseMode: 'hard_delete',
    })
    expect(adjudicatorErase?.redacted).toBe(true)
    drawUpdateSpy.mockRestore()

    const storedDraw = await DrawModel.findOne({ tournamentId, round: 1 }).lean().exec()
    expect((storedDraw as any)?.allocation?.[0]?.chairs ?? []).not.toContain(adjudicatorId)
    expect((storedDraw as any)?.allocation?.[0]?.venue).toBe('concurrent-venue')
    expect(Number((storedDraw as any)?.__v ?? 0)).toBeGreaterThan(versionBefore)
  })


  it('retries round-reference rewrites without overwriting concurrent metadata edits', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'round-reference-cas-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'round-reference-cas-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Round Reference CAS Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const round1Res = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    const round2Res = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 2,
      name: 'Round 2',
      userDefinedData: {
        custom: { source_rounds: [1, 2], note: 'round-before' },
      },
    })
    expect(round1Res.status).toBe(201)
    expect(round2Res.status).toBe(201)
    const round1Id = String(round1Res.body.data._id)
    const round2Id = String(round2Res.body.data._id)

    const teamARes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'CAS Team A',
    })
    const teamBRes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'CAS Team B',
    })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)

    const drawRes = await organizer.post('/api/draws').send({
      tournamentId,
      round: 2,
      allocation: [
        {
          venue: null,
          teams: { gov: teamAId, opp: teamBId },
          chairs: [],
          panels: [],
          trainees: [],
        },
      ],
      drawOpened: true,
      allocationOpened: true,
      userDefinedData: {
        custom: { source_rounds: [1, 2], note: 'draw-before' },
      },
    })
    expect(drawRes.status).toBe(201)
    const drawId = String(drawRes.body.data._id)

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const { getRoundModel } = await import('../src/models/round.js')
    const { getDrawModel } = await import('../src/models/draw.js')
    const connection = await getTournamentConnection(tournamentId)
    const RoundModel = getRoundModel(connection)
    const DrawModel = getDrawModel(connection)

    const originalRoundUpdateOne = RoundModel.updateOne.bind(RoundModel)
    let roundInjected = false
    const roundUpdateSpy = vi
      .spyOn(RoundModel as any, 'updateOne')
      .mockImplementation((filter: any, update: any, options?: any) => {
        const isReferenceRewrite =
          String(filter?._id ?? '') === round2Id &&
          Object.prototype.hasOwnProperty.call(filter ?? {}, 'userDefinedData') &&
          update?.$set?.userDefinedData
        if (!roundInjected && isReferenceRewrite) {
          roundInjected = true
          return {
            exec: async () => {
              const originalValue = filter.userDefinedData ?? {}
              await originalRoundUpdateOne(
                { _id: round2Id, tournamentId },
                {
                  $set: {
                    userDefinedData: {
                      ...originalValue,
                      concurrentRoundEdit: 'keep-round',
                    },
                  },
                }
              ).exec()
              return await originalRoundUpdateOne(filter, update, options).exec()
            },
          } as any
        }
        return originalRoundUpdateOne(filter, update, options) as any
      })

    const originalDrawUpdateOne = DrawModel.updateOne.bind(DrawModel)
    let drawInjected = false
    const drawUpdateSpy = vi
      .spyOn(DrawModel as any, 'updateOne')
      .mockImplementation((filter: any, update: any, options?: any) => {
        const isReferenceRewrite =
          String(filter?._id ?? '') === drawId &&
          Object.prototype.hasOwnProperty.call(filter ?? {}, '__v') &&
          update?.$set?.userDefinedData
        if (!drawInjected && isReferenceRewrite) {
          drawInjected = true
          return {
            exec: async () => {
              const current = await DrawModel.findOne({ _id: drawId, tournamentId }).lean().exec()
              await originalDrawUpdateOne(
                { _id: drawId, tournamentId },
                {
                  $set: {
                    userDefinedData: {
                      ...((current as any)?.userDefinedData ?? {}),
                      concurrentDrawEdit: 'keep-draw',
                    },
                  },
                  $inc: { __v: 1 },
                }
              ).exec()
              return await originalDrawUpdateOne(filter, update, options).exec()
            },
          } as any
        }
        return originalDrawUpdateOne(filter, update, options) as any
      })

    const deleteRes = await organizer.delete(
      `/api/rounds/${round1Id}?tournamentId=${tournamentId}`
    )
    roundUpdateSpy.mockRestore()
    drawUpdateSpy.mockRestore()

    expect(deleteRes.status).toBe(200)
    expect(roundInjected).toBe(true)
    expect(drawInjected).toBe(true)

    const storedRound2 = await RoundModel.findOne({ _id: round2Id, tournamentId }).lean().exec()
    expect((storedRound2 as any)?.userDefinedData?.concurrentRoundEdit).toBe('keep-round')
    expect((storedRound2 as any)?.userDefinedData?.custom?.source_rounds).toEqual([2])

    const storedDraw2 = await DrawModel.findOne({ _id: drawId, tournamentId }).lean().exec()
    expect((storedDraw2 as any)?.userDefinedData?.concurrentDrawEdit).toBe('keep-draw')
    expect((storedDraw2 as any)?.userDefinedData?.custom?.source_rounds).toEqual([2])
  })


  it('retries compilation when a source collection changes during the read set', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'compile-stable-read-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'compile-stable-read-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Compile Stable Read Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

    const teamARes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Compile Team A',
    })
    const teamBRes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Compile Team B',
    })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)

    const rawTeamsRes = await organizer.post('/api/raw-results/teams').send([
      {
        tournamentId,
        id: teamAId,
        from_id: 'compile-seed',
        r: 1,
        weight: 1,
        win: 1,
        side: 'gov',
        opponents: [teamBId],
      },
      {
        tournamentId,
        id: teamBId,
        from_id: 'compile-seed',
        r: 1,
        weight: 1,
        win: 0,
        side: 'opp',
        opponents: [teamAId],
      },
    ])
    expect(rawTeamsRes.status).toBe(201)

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const { getTeamModel } = await import('../src/models/team.js')
    const { buildCompiledPayload } = await import('../src/controllers/compiled.js')
    const connection = await getTournamentConnection(tournamentId)
    const TeamModel = getTeamModel(connection)

    await TeamModel.updateOne(
      { _id: teamAId, tournamentId },
      { $set: { 'template.conflicts': ['old-inst'] } }
    ).exec()

    const originalFind = TeamModel.find.bind(TeamModel)
    let teamFindCalls = 0
    let injected = false
    const teamFindSpy = vi.spyOn(TeamModel as any, 'find').mockImplementation((...args: any[]) => {
      teamFindCalls += 1
      const query = originalFind(...args)
      if (!injected && teamFindCalls === 2) {
        const originalExec = query.exec.bind(query)
        query.exec = async () => {
          const rows = await originalExec()
          await new Promise((resolve) => setTimeout(resolve, 5))
          await TeamModel.updateOne(
            { _id: teamAId, tournamentId },
            { $set: { 'template.conflicts': ['new-inst'] } }
          ).exec()
          injected = true
          return rows
        }
      }
      return query as any
    })

    const built = await buildCompiledPayload(tournamentId, 'raw', [1])
    teamFindSpy.mockRestore()

    expect(injected).toBe(true)
    expect(teamFindCalls).toBeGreaterThanOrEqual(6)
    const teamAResult = built.payload.compiled_team_results.find(
      (row: any) => String(row?.id ?? '') === teamAId
    )
    expect(teamAResult).toBeTruthy()
    expect(teamAResult.institutions).toContain('new-inst')
    expect(teamAResult.institutions).not.toContain('old-inst')

    let churnFindCalls = 0
    let churnWrites = 0
    const churnFindSpy = vi.spyOn(TeamModel as any, 'find').mockImplementation((...args: any[]) => {
      churnFindCalls += 1
      const query = originalFind(...args)
      if ([2, 5, 8, 11, 14].includes(churnFindCalls)) {
        const originalExec = query.exec.bind(query)
        query.exec = async () => {
          const rows = await originalExec()
          await new Promise((resolve) => setTimeout(resolve, 5))
          churnWrites += 1
          await TeamModel.updateOne(
            { _id: teamAId, tournamentId },
            { $set: { 'template.conflicts': [`churn-${churnWrites}`] } }
          ).exec()
          return rows
        }
      }
      return query as any
    })

    await expect(buildCompiledPayload(tournamentId, 'raw', [1])).rejects.toMatchObject({
      name: 'CompileUnstable',
      status: 409,
    })
    churnFindSpy.mockRestore()
    expect(churnWrites).toBe(5)
  })


  it('rolls back hard-delete privacy erasure after late entity-delete failure', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'privacy-rollback-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'privacy-rollback-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Privacy Rollback Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

    const speakerRes = await organizer.post('/api/speakers').send({
      tournamentId,
      name: 'Rollback Speaker',
      userDefinedData: { email: 'speaker@example.test' },
    })
    expect(speakerRes.status).toBe(201)
    const speakerId = String(speakerRes.body.data._id)

    const teamARes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Rollback Team A',
      template: { speakers: [speakerId] },
      details: [{ r: 1, speakers: [speakerId] }],
    })
    const teamBRes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Rollback Team B',
    })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)

    const adjudicatorRes = await organizer.post('/api/adjudicators').send({
      tournamentId,
      name: 'Rollback Adjudicator',
      preev: 4,
      userDefinedData: { email: 'adj@example.test' },
    })
    expect(adjudicatorRes.status).toBe(201)
    const adjudicatorId = String(adjudicatorRes.body.data._id)

    const drawRes = await organizer.post('/api/draws').send({
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

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const { getSpeakerModel } = await import('../src/models/speaker.js')
    const { getAdjudicatorModel } = await import('../src/models/adjudicator.js')
    const { getTeamModel } = await import('../src/models/team.js')
    const { getDrawModel } = await import('../src/models/draw.js')
    const { getSubmissionModel } = await import('../src/models/submission.js')
    const { getRawSpeakerResultModel } = await import('../src/models/raw-speaker-result.js')
    const { getRawAdjudicatorResultModel } = await import('../src/models/raw-adjudicator-result.js')
    const {
      executeSpeakerPersonalDataErase,
      executeAdjudicatorPersonalDataErase,
    } = await import('../src/controllers/privacy.js')

    const connection = await getTournamentConnection(tournamentId)
    const SpeakerModel = getSpeakerModel(connection)
    const AdjudicatorModel = getAdjudicatorModel(connection)
    const TeamModel = getTeamModel(connection)
    const DrawModel = getDrawModel(connection)
    const SubmissionModel = getSubmissionModel(connection)
    const RawSpeakerResultModel = getRawSpeakerResultModel(connection)
    const RawAdjudicatorResultModel = getRawAdjudicatorResultModel(connection)

    const speakerSubmission = await SubmissionModel.create({
      tournamentId,
      round: 1,
      type: 'ballot',
      submittedBy: speakerId,
      payload: {
        submittedEntityId: speakerId,
        teamAId,
        teamBId,
        comment: 'speaker private comment',
      },
    })
    const adjudicatorSubmission = await SubmissionModel.create({
      tournamentId,
      round: 1,
      type: 'feedback',
      submittedBy: adjudicatorId,
      payload: {
        adjudicatorId,
        submittedEntityId: adjudicatorId,
        score: 7,
        comment: 'adjudicator private comment',
      },
    })

    const rawSpeaker = await RawSpeakerResultModel.create({
      tournamentId,
      id: speakerId,
      from_id: speakerId,
      r: 1,
      weight: 1,
      scores: [75, 0, 0, 0],
    })
    const rawAdjudicator = await RawAdjudicatorResultModel.create({
      tournamentId,
      id: adjudicatorId,
      from_id: adjudicatorId,
      r: 1,
      weight: 1,
      score: 7,
      judged_teams: [teamAId, teamBId],
      comment: 'raw private comment',
    })

    const speakerDeleteSpy = vi
      .spyOn(SpeakerModel as any, 'deleteOne')
      .mockImplementationOnce(() => ({
        exec: async () => {
          throw new Error('injected late speaker delete failure')
        },
      }))

    await expect(
      executeSpeakerPersonalDataErase({
        tournamentId,
        entityId: speakerId,
        reason: 'rollback speaker hard delete',
        eraseMode: 'hard_delete',
      })
    ).rejects.toThrow('injected late speaker delete failure')
    speakerDeleteSpy.mockRestore()

    const restoredSpeaker = await SpeakerModel.findOne({ _id: speakerId, tournamentId }).lean().exec()
    expect(restoredSpeaker).toBeTruthy()
    expect((restoredSpeaker as any)?.name).toBe('Rollback Speaker')

    const restoredTeam = await TeamModel.findOne({ _id: teamAId, tournamentId }).lean().exec()
    expect((restoredTeam as any)?.template?.speakers ?? []).toContain(speakerId)
    const restoredTeamDetail = (restoredTeam as any)?.details?.find(
      (detail: any) => Number(detail?.r) === 1
    )
    expect(restoredTeamDetail?.speakers ?? []).toContain(speakerId)

    expect(
      await RawSpeakerResultModel.findOne({ _id: rawSpeaker._id, tournamentId }).lean().exec()
    ).toBeTruthy()
    const restoredSpeakerSubmission = await SubmissionModel.findById(speakerSubmission._id)
      .lean()
      .exec()
    expect((restoredSpeakerSubmission as any)?.payload?.comment).toBe('speaker private comment')

    const adjudicatorDeleteSpy = vi
      .spyOn(AdjudicatorModel as any, 'deleteOne')
      .mockImplementationOnce(() => ({
        exec: async () => {
          throw new Error('injected late adjudicator delete failure')
        },
      }))

    await expect(
      executeAdjudicatorPersonalDataErase({
        tournamentId,
        entityId: adjudicatorId,
        reason: 'rollback adjudicator hard delete',
        eraseMode: 'hard_delete',
      })
    ).rejects.toThrow('injected late adjudicator delete failure')
    adjudicatorDeleteSpy.mockRestore()

    const restoredAdjudicator = await AdjudicatorModel.findOne({
      _id: adjudicatorId,
      tournamentId,
    })
      .lean()
      .exec()
    expect(restoredAdjudicator).toBeTruthy()
    expect((restoredAdjudicator as any)?.name).toBe('Rollback Adjudicator')

    const restoredDraw = await DrawModel.findOne({ tournamentId, round: 1 }).lean().exec()
    expect((restoredDraw as any)?.allocation?.[0]?.chairs ?? []).toContain(adjudicatorId)

    expect(
      await RawAdjudicatorResultModel.findOne({
        _id: rawAdjudicator._id,
        tournamentId,
      })
        .lean()
        .exec()
    ).toBeTruthy()
    const restoredAdjudicatorSubmission = await SubmissionModel.findById(
      adjudicatorSubmission._id
    )
      .lean()
      .exec()
    expect((restoredAdjudicatorSubmission as any)?.payload?.comment).toBe(
      'adjudicator private comment'
    )
  })


  it('binds participant submissions to authenticated tournament entities', async () => {
    const organizer = request.agent(app)
    expect(
      (
        await organizer
          .post('/api/auth/register')
          .send({ username: 'entity-binding-owner', password: 'password123', role: 'organizer' })
      ).status
    ).toBe(201)
    expect(
      (
        await organizer
          .post('/api/auth/login')
          .send({ username: 'entity-binding-owner', password: 'password123' })
      ).status
    ).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Entity Binding Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
      userDefinedData: {
        evaluate_from_teams: true,
        evaluate_from_adjudicators: true,
        evaluator_in_team: 'team',
        chairs_always_evaluated: true,
      },
    })
    expect(roundRes.status).toBe(201)

    const speakerARes = await organizer
      .post('/api/speakers')
      .send({ tournamentId, name: 'Bound Speaker A' })
    const speakerBRes = await organizer
      .post('/api/speakers')
      .send({ tournamentId, name: 'Bound Speaker B' })
    expect(speakerARes.status).toBe(201)
    expect(speakerBRes.status).toBe(201)
    const speakerAId = String(speakerARes.body.data._id)
    const speakerBId = String(speakerBRes.body.data._id)

    const teamARes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Bound Team A',
      details: [{ r: 1, speakers: [speakerAId] }],
    })
    const teamBRes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Bound Team B',
      details: [{ r: 1, speakers: [speakerBId] }],
    })
    expect(teamARes.status).toBe(201)
    expect(teamBRes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)
    const teamBId = String(teamBRes.body.data._id)

    const judge1Res = await organizer
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Bound Judge 1', preev: 7 })
    const judge2Res = await organizer
      .post('/api/adjudicators')
      .send({ tournamentId, name: 'Bound Judge 2', preev: 6 })
    expect(judge1Res.status).toBe(201)
    expect(judge2Res.status).toBe(201)
    const judge1Id = String(judge1Res.body.data._id)
    const judge2Id = String(judge2Res.body.data._id)

    const drawRes = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: null,
          teams: { gov: teamAId, opp: teamBId },
          chairs: [judge1Id],
          panels: [judge2Id],
          trainees: [],
        },
      ],
      drawOpened: true,
      allocationOpened: true,
    })
    expect(drawRes.status).toBe(201)

    const anonymous = request.agent(app)
    const anonymousAccess = await anonymous
      .post(`/api/tournaments/${tournamentId}/access`)
      .send({ action: 'skip' })
    expect(anonymousAccess.status).toBe(200)

    const anonymousBallot = await anonymous.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId,
      teamBId,
      winnerId: teamAId,
      speakerIdsA: [speakerAId],
      speakerIdsB: [speakerBId],
      scoresA: [76],
      scoresB: [74],
      submittedEntityId: judge1Id,
    })
    expect(anonymousBallot.status).toBe(401)
    expect(anonymousBallot.body.errors?.[0]?.message).toContain(
      'Authenticated participant identity'
    )

    const addJudgeUser = await organizer.post(`/api/tournaments/${tournamentId}/users`).send({
      username: 'bound-judge-user',
      password: 'password123',
      role: 'adjudicator',
      entityType: 'adjudicator',
      entityId: judge1Id,
    })
    expect(addJudgeUser.status).toBe(201)
    expect(addJudgeUser.body.data.entityType).toBe('adjudicator')
    expect(addJudgeUser.body.data.entityId).toBe(judge1Id)

    const judgeUser = request.agent(app)
    expect(
      (
        await judgeUser
          .post('/api/auth/login')
          .send({ username: 'bound-judge-user', password: 'password123' })
      ).status
    ).toBe(200)
    expect(
      (
        await judgeUser
          .post(`/api/tournaments/${tournamentId}/access`)
          .send({ action: 'skip' })
      ).status
    ).toBe(200)

    const impersonation = await judgeUser.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId,
      teamBId,
      winnerId: teamAId,
      speakerIdsA: [speakerAId],
      speakerIdsB: [speakerBId],
      scoresA: [76],
      scoresB: [74],
      submittedEntityId: judge2Id,
    })
    expect(impersonation.status).toBe(403)
    expect(impersonation.body.errors?.[0]?.message).toContain(
      'does not match the authenticated participant identity'
    )

    const ownBallot = await judgeUser.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId,
      teamBId,
      winnerId: teamAId,
      speakerIdsA: [speakerAId],
      speakerIdsB: [speakerBId],
      scoresA: [76],
      scoresB: [74],
      submittedEntityId: judge1Id,
    })
    expect(ownBallot.status).toBe(201)
    expect(ownBallot.body.data.payload.submittedEntityId).toBe(judge1Id)

    const otherJudgeHistory = await judgeUser.get('/api/submissions/mine').query({
      tournamentId,
      submittedEntityId: judge2Id,
      type: 'ballot',
      round: 1,
    })
    expect(otherJudgeHistory.status).toBe(403)
    expect(otherJudgeHistory.body.errors?.[0]?.message).toContain(
      'does not match the authenticated participant identity'
    )

    const ownJudgeHistory = await judgeUser.get('/api/submissions/mine').query({
      tournamentId,
      submittedEntityId: judge1Id,
      type: 'ballot',
      round: 1,
    })
    expect(ownJudgeHistory.status).toBe(200)
    expect(ownJudgeHistory.body.data).toHaveLength(1)
    expect(ownJudgeHistory.body.data[0]._id).toBe(ownBallot.body.data._id)

    const addSpeakerUser = await organizer.post(`/api/tournaments/${tournamentId}/users`).send({
      username: 'bound-speaker-user',
      password: 'password123',
      role: 'speaker',
      entityType: 'speaker',
      entityId: speakerAId,
    })
    expect(addSpeakerUser.status).toBe(201)

    const speakerUser = request.agent(app)
    expect(
      (
        await speakerUser
          .post('/api/auth/login')
          .send({ username: 'bound-speaker-user', password: 'password123' })
      ).status
    ).toBe(200)
    expect(
      (
        await speakerUser
          .post(`/api/tournaments/${tournamentId}/access`)
          .send({ action: 'skip' })
      ).status
    ).toBe(200)

    const teamFeedback = await speakerUser.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: judge1Id,
      score: 8,
      submittedEntityId: teamAId,
    })
    expect(teamFeedback.status).toBe(201)
    expect(teamFeedback.body.data.payload.submittedEntityId).toBe(teamAId)

    const ownTeamHistory = await speakerUser.get('/api/submissions/mine').query({
      tournamentId,
      submittedEntityId: teamAId,
      type: 'feedback',
      round: 1,
    })
    expect(ownTeamHistory.status).toBe(200)
    expect(ownTeamHistory.body.data).toHaveLength(1)
    expect(ownTeamHistory.body.data[0]._id).toBe(teamFeedback.body.data._id)

    const otherTeamHistory = await speakerUser.get('/api/submissions/mine').query({
      tournamentId,
      submittedEntityId: teamBId,
      type: 'feedback',
      round: 1,
    })
    expect(otherTeamHistory.status).toBe(403)

    const otherTeamFeedback = await speakerUser.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: judge1Id,
      score: 8,
      submittedEntityId: teamBId,
    })
    expect(otherTeamFeedback.status).toBe(403)
  })


  it('preserves independent tournament metadata patches under concurrent saves', async () => {
    const organizer = request.agent(app)
    expect(
      (
        await organizer
          .post('/api/auth/register')
          .send({ username: 'tournament-patch-user', password: 'password123', role: 'organizer' })
      ).status
    ).toBe(201)
    expect(
      (
        await organizer
          .post('/api/auth/login')
          .send({ username: 'tournament-patch-user', password: 'password123' })
      ).status
    ).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Tournament Patch Open',
      style: 1,
      options: {},
      user_defined_data: {
        keep: { marker: 'preserve-me' },
        break: { source: 'submissions', size: 8 },
        hidden: false,
      },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const [visibilityRes, breakRes] = await Promise.all([
      organizer.patch(`/api/tournaments/${tournamentId}`).send({
        user_defined_data_patch: { hidden: true },
      }),
      organizer.patch(`/api/tournaments/${tournamentId}`).send({
        user_defined_data_patch: {
          break: { source: 'submissions', size: 16, cutoff_tie_policy: 'include_all' },
        },
      }),
    ])
    expect(visibilityRes.status).toBe(200)
    expect(breakRes.status).toBe(200)

    const stored = await TournamentModel.findById(tournamentId).lean().exec()
    expect((stored as any)?.user_defined_data?.hidden).toBe(true)
    expect((stored as any)?.user_defined_data?.break?.size).toBe(16)
    expect((stored as any)?.user_defined_data?.keep?.marker).toBe('preserve-me')

    const conflictingPayload = await organizer.patch(`/api/tournaments/${tournamentId}`).send({
      user_defined_data: { hidden: false },
      user_defined_data_patch: { hidden: true },
    })
    expect(conflictingPayload.status).toBe(400)

    const unsafePatch = await organizer.patch(`/api/tournaments/${tournamentId}`).send({
      user_defined_data_patch: { 'nested.path': true },
    })
    expect(unsafePatch.status).toBe(400)
  })


  it('serializes round detail synchronization with entity CRUD namespace leases', async () => {
    const organizer = request.agent(app)
    expect(
      (
        await organizer
          .post('/api/auth/register')
          .send({ username: 'round-entity-lease-user', password: 'password123', role: 'organizer' })
      ).status
    ).toBe(201)
    expect(
      (
        await organizer
          .post('/api/auth/login')
          .send({ username: 'round-entity-lease-user', password: 'password123' })
      ).status
    ).toBe(200)

    const tournamentRes = await organizer
      .post('/api/tournaments')
      .send({ name: 'Round Entity Lease Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const teamRes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Round Entity Lease Team',
    })
    expect(teamRes.status).toBe(201)
    const teamId = String(teamRes.body.data._id)

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const {
      acquireEntityNamespaceLease,
      releaseEntityNamespaceLease,
    } = await import('../src/services/entity-namespace-guard.service.js')
    const connection = await getTournamentConnection(tournamentId)
    const lease = await acquireEntityNamespaceLease(connection, tournamentId, 'teams')
    expect(lease).toBeTruthy()
    if (!lease) throw new Error('expected teams namespace lease')

    try {
      const blockedRound = await organizer.post('/api/rounds').send({
        tournamentId,
        round: 1,
        name: 'Blocked Round',
      })
      expect(blockedRound.status).toBe(409)
      expect(blockedRound.body.errors?.[0]?.message).toContain('entities are being modified')
    } finally {
      expect(await releaseEntityNamespaceLease(connection, lease)).toBe(true)
    }

    const roundRes = await organizer.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

    const teamsRes = await organizer.get(`/api/teams?tournamentId=${tournamentId}`)
    expect(teamsRes.status).toBe(200)
    const storedTeam = teamsRes.body.data.find((team: any) => String(team._id) === teamId)
    expect(storedTeam).toBeTruthy()
    expect(storedTeam.details.some((detail: any) => Number(detail?.r) === 1)).toBe(true)
  })
  it('keeps hidden tournaments out of public listings without changing direct access policy', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'hidden-tournament-owner', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'hidden-tournament-owner', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Hidden Tournament Listing Open',
      style: 1,
      options: {},
      auth: { access: { required: false } },
      user_defined_data: { hidden: true },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const teamRes = await organizer.post('/api/teams').send({
      tournamentId,
      name: 'Hidden Listing Team',
      userDefinedData: { internalMemo: 'not public' },
    })
    expect(teamRes.status).toBe(201)
    const teamId = String(teamRes.body.data._id)

    const publicList = await request(app).get('/api/tournaments')
    expect(publicList.status).toBe(200)
    expect(publicList.body.data.some((item: any) => String(item._id) === tournamentId)).toBe(false)

    const directTournament = await request(app).get(`/api/tournaments/${tournamentId}`)
    expect(directTournament.status).toBe(200)
    expect(directTournament.body.data.user_defined_data).toBeUndefined()

    const directTeam = await request(app).get(
      `/api/teams/${teamId}?tournamentId=${tournamentId}`
    )
    expect(directTeam.status).toBe(200)
    expect(directTeam.body.data.userDefinedData).toBeUndefined()

    const accessAttempt = await request(app)
      .post(`/api/tournaments/${tournamentId}/access`)
      .send({ action: 'skip' })
    expect(accessAttempt.status).toBe(200)
  })

  it('does not reveal a managed users memberships in other tournaments', async () => {
    const owner = request.agent(app)
    const existingUser = request.agent(app)

    expect(
      (
        await owner
          .post('/api/auth/register')
          .send({ username: 'membership-boundary-owner', password: 'password123', role: 'organizer' })
      ).status
    ).toBe(201)
    expect(
      (
        await existingUser
          .post('/api/auth/register')
          .send({ username: 'membership-boundary-user', password: 'password123', role: 'organizer' })
      ).status
    ).toBe(201)
    expect(
      (
        await owner
          .post('/api/auth/login')
          .send({ username: 'membership-boundary-owner', password: 'password123' })
      ).status
    ).toBe(200)
    expect(
      (
        await existingUser
          .post('/api/auth/login')
          .send({ username: 'membership-boundary-user', password: 'password123' })
      ).status
    ).toBe(200)

    const ownerTournamentRes = await owner.post('/api/tournaments').send({
      name: 'Membership Boundary A',
      style: 1,
      options: {},
    })
    const otherTournamentRes = await existingUser.post('/api/tournaments').send({
      name: 'Membership Boundary B',
      style: 1,
      options: {},
    })
    expect(ownerTournamentRes.status).toBe(201)
    expect(otherTournamentRes.status).toBe(201)
    const ownerTournamentId = String(ownerTournamentRes.body.data._id)
    const otherTournamentId = String(otherTournamentRes.body.data._id)

    const addExistingUser = await owner
      .post(`/api/tournaments/${ownerTournamentId}/users`)
      .send({
        username: 'membership-boundary-user',
        password: 'ignored-password',
        role: 'speaker',
      })
    expect(addExistingUser.status).toBe(200)
    expect(addExistingUser.body.data.tournaments).toEqual([ownerTournamentId])
    expect(addExistingUser.body.data.tournaments).not.toContain(otherTournamentId)

    const existingUserMe = await existingUser.get('/api/auth/me')
    expect(existingUserMe.status).toBe(200)
    expect(existingUserMe.body.data.tournaments).toContain(ownerTournamentId)
    expect(existingUserMe.body.data.tournaments).toContain(otherTournamentId)

    const removeExistingUser = await owner.delete(
      `/api/tournaments/${ownerTournamentId}/users?username=membership-boundary-user`
    )
    expect(removeExistingUser.status).toBe(200)
    expect(removeExistingUser.body.data.tournaments).toEqual([])
  })


  it('rejects concurrent admin edits to the same submission instead of silently losing one', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'submission-update-race', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'submission-update-race', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Submission Update Race Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const roundRes = await organizer
      .post('/api/rounds')
      .send({ tournamentId, round: 1, name: 'Round 1' })
    expect(roundRes.status).toBe(201)

    const created = await organizer.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [75],
      scoresB: [72],
      speakerIdsA: ['spk-a'],
      speakerIdsB: ['spk-b'],
      comment: 'before race',
      submittedEntityId: 'judge-a',
    })
    expect(created.status).toBe(201)
    const submissionId = String(created.body.data._id)

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const connection = await getTournamentConnection(tournamentId)
    const SubmissionModel = getSubmissionModel(connection)
    const originalFindOneAndUpdate = SubmissionModel.findOneAndUpdate.bind(SubmissionModel)
    let updateCalls = 0
    let releaseFirstUpdate: (() => void) | null = null
    const firstUpdateReleased = new Promise<void>((resolve) => {
      releaseFirstUpdate = resolve
    })

    SubmissionModel.findOneAndUpdate = ((...args: any[]) => {
      updateCalls += 1
      const query = originalFindOneAndUpdate(...args)
      const originalExec = query.exec.bind(query)
      query.exec = async (...execArgs: any[]) => {
        if (updateCalls === 1) {
          await firstUpdateReleased
        } else {
          releaseFirstUpdate?.()
        }
        return originalExec(...execArgs)
      }
      return query
    }) as typeof SubmissionModel.findOneAndUpdate

    try {
      const makePayload = (winnerId: string, comment: string, scoreA: number, scoreB: number) => ({
        tournamentId,
        payload: {
          teamAId: 'team-a',
          teamBId: 'team-b',
          winnerId,
          scoresA: [scoreA],
          scoresB: [scoreB],
          speakerIdsA: ['spk-a'],
          speakerIdsB: ['spk-b'],
          comment,
          submittedEntityId: 'judge-a',
        },
      })

      const [left, right] = await Promise.all([
        organizer
          .patch(`/api/submissions/${submissionId}`)
          .send(makePayload('team-a', 'left edit', 77, 72)),
        organizer
          .patch(`/api/submissions/${submissionId}`)
          .send(makePayload('team-b', 'right edit', 70, 79)),
      ])

      expect([left.status, right.status].sort()).toEqual([200, 409])
      const conflict = left.status === 409 ? left : right
      expect(conflict.body.errors?.[0]?.message).toBe('Submission changed concurrently; retry update')

      const finalList = await organizer.get(
        `/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`
      )
      expect(finalList.status).toBe(200)
      expect(finalList.body.data).toHaveLength(1)
      expect(['left edit', 'right edit']).toContain(finalList.body.data[0].payload.comment)
    } finally {
      SubmissionModel.findOneAndUpdate =
        originalFindOneAndUpdate as typeof SubmissionModel.findOneAndUpdate
    }
  })

  it('rejects one of two concurrent draw updates with the same starting version', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'draw-update-race', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'draw-update-race', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Draw Update Race Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const roundRes = await organizer
      .post('/api/rounds')
      .send({ tournamentId, round: 1, name: 'Round 1' })
    expect(roundRes.status).toBe(201)

    const teamA = await organizer.post('/api/teams').send({ tournamentId, name: 'Race Team A' })
    const teamB = await organizer.post('/api/teams').send({ tournamentId, name: 'Race Team B' })
    expect(teamA.status).toBe(201)
    expect(teamB.status).toBe(201)
    const teamAId = String(teamA.body.data._id)
    const teamBId = String(teamB.body.data._id)

    const allocation = [
      {
        venue: null,
        teams: { gov: teamAId, opp: teamBId },
        chairs: [],
        panels: [],
        trainees: [],
      },
    ]
    const createdDraw = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation,
      drawOpened: false,
      allocationOpened: false,
      locked: false,
    })
    expect(createdDraw.status).toBe(201)

    const { getTournamentConnection } = await import('../src/services/tournament-db.service.js')
    const { getDrawModel } = await import('../src/models/draw.js')
    const connection = await getTournamentConnection(tournamentId)
    const DrawModel = getDrawModel(connection)
    const originalFindOneAndUpdate = DrawModel.findOneAndUpdate.bind(DrawModel)
    let updateCalls = 0
    let releaseFirstUpdate: (() => void) | null = null
    const firstUpdateReleased = new Promise<void>((resolve) => {
      releaseFirstUpdate = resolve
    })

    DrawModel.findOneAndUpdate = ((...args: any[]) => {
      updateCalls += 1
      const query = originalFindOneAndUpdate(...args)
      const originalExec = query.exec.bind(query)
      query.exec = async (...execArgs: any[]) => {
        if (updateCalls === 1) {
          await firstUpdateReleased
        } else {
          releaseFirstUpdate?.()
        }
        return originalExec(...execArgs)
      }
      return query
    }) as typeof DrawModel.findOneAndUpdate

    try {
      const [publishTeams, publishAdjudicators] = await Promise.all([
        organizer.post('/api/draws').send({
          tournamentId,
          round: 1,
          allocation,
          drawOpened: true,
          allocationOpened: false,
          locked: false,
        }),
        organizer.post('/api/draws').send({
          tournamentId,
          round: 1,
          allocation,
          drawOpened: false,
          allocationOpened: true,
          locked: false,
        }),
      ])

      expect([publishTeams.status, publishAdjudicators.status].sort()).toEqual([201, 409])
      const conflict = publishTeams.status === 409 ? publishTeams : publishAdjudicators
      expect(conflict.body.errors?.[0]?.message).toBe('Draw is locked or changed')

      const finalDraw = await organizer.get(
        `/api/draws?tournamentId=${tournamentId}&round=1`
      )
      expect(finalDraw.status).toBe(200)
      expect(finalDraw.body.data).toHaveLength(1)
      expect([
        [true, false],
        [false, true],
      ]).toContainEqual([
        finalDraw.body.data[0].drawOpened,
        finalDraw.body.data[0].allocationOpened,
      ])
    } finally {
      DrawModel.findOneAndUpdate = originalFindOneAndUpdate as typeof DrawModel.findOneAndUpdate
    }
  })

  it('preserves draw publication and lock flags when an update omits them', async () => {
    const organizer = request.agent(app)
    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'draw-state-preserve', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)
    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'draw-state-preserve', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await organizer.post('/api/tournaments').send({
      name: 'Draw State Preserve Open',
      style: 1,
      options: { style: { team_num: 2 } },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const roundRes = await organizer
      .post('/api/rounds')
      .send({ tournamentId, round: 1, name: 'Round 1' })
    expect(roundRes.status).toBe(201)

    const teamA = await organizer.post('/api/teams').send({ tournamentId, name: 'State Team A' })
    const teamB = await organizer.post('/api/teams').send({ tournamentId, name: 'State Team B' })
    expect(teamA.status).toBe(201)
    expect(teamB.status).toBe(201)

    const allocation = [
      {
        venue: null,
        teams: {
          gov: String(teamA.body.data._id),
          opp: String(teamB.body.data._id),
        },
        chairs: [],
        panels: [],
        trainees: [],
      },
    ]

    const created = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation,
      drawOpened: true,
      allocationOpened: true,
      locked: true,
    })
    expect(created.status).toBe(201)
    expect(created.body.data.drawOpened).toBe(true)
    expect(created.body.data.allocationOpened).toBe(true)
    expect(created.body.data.locked).toBe(true)

    const allocationOnlyUpdate = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation,
    })
    expect(allocationOnlyUpdate.status).toBe(201)
    expect(allocationOnlyUpdate.body.data.drawOpened).toBe(true)
    expect(allocationOnlyUpdate.body.data.allocationOpened).toBe(true)
    expect(allocationOnlyUpdate.body.data.locked).toBe(true)

    const explicitUnlock = await organizer.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation,
      locked: false,
    })
    expect(explicitUnlock.status).toBe(201)
    expect(explicitUnlock.body.data.drawOpened).toBe(true)
    expect(explicitUnlock.body.data.allocationOpened).toBe(true)
    expect(explicitUnlock.body.data.locked).toBe(false)
  })



})
