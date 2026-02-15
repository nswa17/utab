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

  it('requires explicit winner when scores are non-tied', async () => {
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
    expect(missingWinnerOnTie.status).toBe(201)

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

  it('treats blank submittedEntityId as session actor for dedupe', async () => {
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
    expect(secondBallot.status).toBe(201)

    const submissionsRes = await agent.get(
      `/api/submissions?tournamentId=${tournamentId}&round=1&type=ballot`
    )
    expect(submissionsRes.status).toBe(200)
    expect(submissionsRes.body.data.length).toBe(1)
    expect(submissionsRes.body.data[0].payload.comment).toBe('second submission')
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

    const listRes = await agent.get(`/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`)
    expect(listRes.status).toBe(200)
    expect(listRes.body.data.length).toBe(1)
    expect(listRes.body.data[0].payload.submittedEntityId).toBe('judge-a')
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

})

