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
  it('rejects admin ballot updates that include blank speaker ids', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'blank-speaker-update', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'blank-speaker-update', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Blank Speaker Update Open',
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
      speakerIdsA: ['spk-a'],
      speakerIdsB: ['spk-b'],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes.status).toBe(201)

    const listRes = await agent
      .get(`/api/submissions?tournamentId=${tournamentId}&type=ballot&round=1`)
      .send()
    expect(listRes.status).toBe(200)
    expect(listRes.body.data.length).toBe(1)
    const submissionId = listRes.body.data[0]._id

    const patchRes = await agent.patch(`/api/submissions/${submissionId}`).send({
      tournamentId,
      payload: {
        teamAId: 'team-a',
        teamBId: 'team-b',
        winnerId: 'team-a',
        scoresA: [76],
        scoresB: [75],
        speakerIdsA: ['spk-a'],
        speakerIdsB: [''],
        submittedEntityId: 'judge-a',
      },
    })
    expect(patchRes.status).toBe(400)
    expect(patchRes.body.errors[0].message).toContain('speakerIdsB')
  })

  it('warns when scored speaker ids cannot be resolved during compile', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'missing-speaker-warn', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'missing-speaker-warn', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Missing Speaker Warning Open',
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
    })
    expect(roundRes.status).toBe(201)

    const ballotRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes.status).toBe(201)

    const compileRes = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'submissions',
      options: {
        missing_data_policy: 'warn',
        include_labels: ['teams', 'speakers'],
      },
    })
    expect(compileRes.status).toBe(201)
    expect(compileRes.body.data.payload.compile_warnings.length).toBeGreaterThan(0)
    expect(
      compileRes.body.data.payload.compile_warnings.some((message: string) =>
        message.includes('speakerId is missing for a scored speaker')
      )
    ).toBe(true)
    expect(compileRes.body.data.payload.compiled_speaker_results).toEqual([])
  })

  it('errors when missing speaker ids exist and missing_data_policy is error', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'missing-speaker-error', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'missing-speaker-error', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Missing Speaker Error Open',
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
    })
    expect(roundRes.status).toBe(201)

    const ballotRes = await agent.post('/api/submissions/ballots').send({
      tournamentId,
      round: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
      winnerId: 'team-a',
      scoresA: [76],
      scoresB: [75],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes.status).toBe(201)

    const compileRes = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'submissions',
      options: {
        missing_data_policy: 'error',
        include_labels: ['teams', 'speakers'],
      },
    })
    expect(compileRes.status).toBe(400)
    expect(compileRes.body.errors[0].message).toContain('Missing data detected')
    expect(compileRes.body.errors[0].message).toContain('speakerId is missing for a scored speaker')
  })

  it('rejects feedback submissions with blank adjudicator id', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'blank-feedback-adj', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'blank-feedback-adj', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Blank Feedback Adj Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const feedbackRes = await agent.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: '   ',
      score: 8,
      submittedEntityId: 'team-a',
    })
    expect(feedbackRes.status).toBe(400)
  })

  it('rejects feedback submissions with non-numeric scores', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'non-numeric-feedback', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'non-numeric-feedback', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Non Numeric Feedback Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id

    const feedbackRes = await agent.post('/api/submissions/feedback').send({
      tournamentId,
      round: 1,
      adjudicatorId: 'judge-a',
      score: '8',
      submittedEntityId: 'team-a',
    })
    expect(feedbackRes.status).toBe(400)
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
      draw: true,
      speakerIdsA: [speakerId1],
      speakerIdsB: [speakerId2],
      scoresA: [74],
      scoresB: [74],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes2.status).toBe(409)
    expect(String(ballotRes2.body.errors?.[0]?.message ?? '')).toContain(
      'すでにチーム評価が送信されています。送信済みのチーム評価を修正する場合は運営に連絡してください。'
    )

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
        teamAId: teamId1,
        teamBId: teamId2,
        speakerIdsA: [speakerId1],
        speakerIdsB: [speakerId2],
        scoresA: [74],
        scoresB: [74],
        submittedEntityId: 'judge-a',
      },
      submittedBy: 'judge-a',
    })

    const compileWithErrorPolicy = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'submissions',
      options: {
        duplicate_normalization: { merge_policy: 'error' },
      },
    })
    expect(compileWithErrorPolicy.status).toBe(400)
    expect(String(compileWithErrorPolicy.body.errors?.[0]?.message ?? '')).toContain(
      'Duplicate ballots detected'
    )

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
    expect(team2.ranking).toBe(1)
    expect(compileRes.body.data.payload.compile_warnings.length).toBeGreaterThan(0)
    expect(
      compileRes.body.data.payload.compile_warnings.some((message: string) =>
        message.includes('winner/draw verdict is missing')
      )
    ).toBe(true)

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
    expect(diffTeam2.diff.ranking.trend).toBe('unchanged')
    expect(diffTeam2.diff.ranking.delta).toBe(0)
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

  it('keeps adjudicator ballots distinct when merge policy is latest', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'compile-latest', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'compile-latest', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: 'Compile Latest Open', style: 1, options: {} })
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
          merge_policy: 'latest',
          poi_aggregation: 'average',
          best_aggregation: 'average',
        },
        missing_data_policy: 'warn',
        include_labels: ['teams'],
      },
    })
    expect(compileRes.status).toBe(201)
    expect(compileRes.body.data.payload.compile_options.duplicate_normalization.merge_policy).toBe(
      'latest'
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

  it('averages conflicting duplicate ballots from the same actor', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'duplicate-average-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'duplicate-average-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Duplicate Average Open',
      style: 1,
      options: { style: { team_num: 2, score_weights: [1] } },
      total_round_num: 1,
    })
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

    const [{ getTournamentConnection }, { getSubmissionModel }] = await Promise.all([
      import('../src/services/tournament-db.service.js'),
      import('../src/models/submission.js'),
    ])
    const connection = await getTournamentConnection(tournamentId)
    const SubmissionModel = getSubmissionModel(connection)
    await SubmissionModel.create([
      {
        tournamentId,
        round: 1,
        type: 'ballot',
        payload: {
          teamAId: teamId1,
          teamBId: teamId2,
          winnerId: teamId1,
          speakerIdsA: [speakerId1],
          speakerIdsB: [speakerId2],
          scoresA: [75],
          scoresB: [72],
          submittedEntityId: 'judge-a',
        },
        submittedBy: 'judge-a',
      },
      {
        tournamentId,
        round: 1,
        type: 'ballot',
        payload: {
          teamAId: teamId1,
          teamBId: teamId2,
          winnerId: teamId2,
          speakerIdsA: [speakerId1],
          speakerIdsB: [speakerId2],
          scoresA: [71],
          scoresB: [74],
          submittedEntityId: 'judge-a',
        },
        submittedBy: 'judge-a',
      },
    ])

    const compileRes = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'submissions',
      options: {
        ranking_priority: { preset: 'custom', order: ['win', 'sum', 'margin', 'vote', 'average', 'sd'] },
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

    const teamResults = compileRes.body.data.payload.compiled_team_results
    const team1 = teamResults.find((row: any) => row.id === teamId1)
    const team2 = teamResults.find((row: any) => row.id === teamId2)
    expect(team1.win).toBeCloseTo(0.5, 6)
    expect(team2.win).toBeCloseTo(0.5, 6)
    expect(team1.ranking).toBe(1)
    expect(team2.ranking).toBe(1)
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
    expect(publicTournamentIds).toContain(protectedTournamentId)

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

})
