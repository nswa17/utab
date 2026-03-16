import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createServer, type Server } from 'node:http'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { AuditLogModel } from '../src/models/audit-log.js'
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

function parseBinaryResponse(
  res: NodeJS.ReadableStream,
  callback: (error: Error | null, data?: Buffer) => void
) {
  const chunks: Buffer[] = []
  res.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  })
  res.on('end', () => {
    callback(null, Buffer.concat(chunks))
  })
  res.on('error', (error) => {
    callback(error)
  })
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
    expect(team1.win).toBe(0.5)
    expect(team2.win).toBe(0.5)
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
    expect(team1.win).toBe(0.5)
    expect(team2.win).toBe(0.5)
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

  it('exports tournament bundle with RFC5987 content-disposition when tournament name has non-ASCII', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'bundle-export-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'bundle-export-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentName = '日本語大会🙂'
    const tournamentRes = await agent
      .post('/api/tournaments')
      .send({ name: tournamentName, style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const exportRes = await agent.get(`/api/tournaments/${tournamentId}/export`).send()
    expect(exportRes.status).toBe(200)
    expect(exportRes.headers['content-type']).toContain('application/zip')

    const contentDisposition = String(exportRes.headers['content-disposition'] ?? '')
    expect(contentDisposition).toContain('attachment;')
    expect(contentDisposition).toContain('filename=')
    expect(contentDisposition).toContain("filename*=UTF-8''")

    const fallbackMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i)
    expect(fallbackMatch?.[1]).toBeTruthy()
    expect(/^[\x20-\x7E]+$/.test(String(fallbackMatch?.[1]))).toBe(true)

    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
    expect(utf8Match?.[1]).toBeTruthy()
    const decodedName = decodeURIComponent(String(utf8Match?.[1]))
    expect(decodedName).toContain('日本語大会')
    expect(decodedName).toContain(`${tournamentId}-`)
    expect(decodedName.endsWith('.zip')).toBe(true)
  })

  it('counts repeated speaker slots for PDA4 short teams in compiled team sums', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'pda4-short-team-sum', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'pda4-short-team-sum', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'PDA4 Short Team Compile Open',
      style: 5,
      options: {},
      total_round_num: 1,
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const roundRes = await agent.post('/api/rounds').send({
      tournamentId,
      round: 1,
      name: 'Round 1',
    })
    expect(roundRes.status).toBe(201)

    async function createSpeaker(name: string) {
      const res = await agent.post('/api/speakers').send({ tournamentId, name })
      expect(res.status).toBe(201)
      return String(res.body.data._id)
    }

    const speakerA1 = await createSpeaker('Speaker A1')
    const speakerA2 = await createSpeaker('Speaker A2')
    const speakerA3 = await createSpeaker('Speaker A3')
    const speakerB1 = await createSpeaker('Speaker B1')
    const speakerB2 = await createSpeaker('Speaker B2')
    const speakerB3 = await createSpeaker('Speaker B3')
    const speakerB4 = await createSpeaker('Speaker B4')

    const teamARes = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Team A',
      details: [{ r: 1, speakers: [speakerA1, speakerA2, speakerA3] }],
    })
    expect(teamARes.status).toBe(201)
    const teamAId = String(teamARes.body.data._id)

    const teamBRes = await agent.post('/api/teams').send({
      tournamentId,
      name: 'Team B',
      details: [{ r: 1, speakers: [speakerB1, speakerB2, speakerB3, speakerB4] }],
    })
    expect(teamBRes.status).toBe(201)
    const teamBId = String(teamBRes.body.data._id)

    const drawRes = await agent.post('/api/draws').send({
      tournamentId,
      round: 1,
      allocation: [
        {
          venue: '',
          teams: { gov: teamAId, opp: teamBId },
          chairs: [],
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
      teamAId: teamAId,
      teamBId: teamBId,
      winnerId: teamAId,
      speakerIdsA: [speakerA1, speakerA2, speakerA3, speakerA1],
      speakerIdsB: [speakerB1, speakerB2, speakerB3, speakerB4],
      scoresA: [11, 10, 12, 10],
      scoresB: [10, 10, 10, 13],
      submittedEntityId: 'judge-a',
    })
    expect(ballotRes.status).toBe(201)

    const compileRes = await agent.post('/api/compiled').send({
      tournamentId,
      source: 'submissions',
      options: {
        missing_data_policy: 'warn',
        include_labels: ['teams'],
      },
    })
    expect(compileRes.status).toBe(201)

    const teamResults = compileRes.body.data.payload.compiled_team_results as any[]
    const teamA = teamResults.find((row) => row.id === teamAId)
    const teamB = teamResults.find((row) => row.id === teamBId)

    expect(teamA?.details?.[0]?.sum).toBe(43)
    expect(teamB?.details?.[0]?.sum).toBe(43)
    expect(teamA?.sum).toBe(43)
    expect(teamB?.sum).toBe(43)
  })

  it('restores a tournament from an exported backup zip', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/auth/register')
      .send({ username: 'bundle-import-user', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/auth/login')
      .send({ username: 'bundle-import-user', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent.post('/api/tournaments').send({
      name: 'Restore Source Open',
      style: 1,
      options: { style: { team_num: 2 } },
      total_round_num: 2,
      current_round_num: 1,
      user_defined_data: { hidden: true },
    })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = String(tournamentRes.body.data._id)

    const [{ getTournamentConnection }, { getTeamModel }, { getRoundModel }, { buildZip, extractZip }] =
      await Promise.all([
        import('../src/services/tournament-db.service.js'),
        import('../src/models/team.js'),
        import('../src/models/round.js'),
        import('../src/services/zip.js'),
      ])
    const connection = await getTournamentConnection(tournamentId)
    const TeamModel = getTeamModel(connection)
    const RoundModel = getRoundModel(connection)

    const createdTeam = await TeamModel.create({
      tournamentId,
      name: 'Team Restore A',
      template: { speakers: ['sp1', 'sp2'] },
      details: [{ r: 1, available: true, conflicts: [], speakers: ['sp1', 'sp2'] }],
    })
    await RoundModel.create({
      tournamentId,
      round: 1,
      name: 'Round 1',
      motions: ['This House would restore from backups.'],
    })
    const originalAuditLog = await AuditLogModel.create({
      tournamentId,
      action: 'team.create',
      actorUserId: String(loginRes.body.data.userId),
      actorRole: 'organizer',
      targetType: 'team',
      targetId: String(createdTeam._id),
      metadata: { source: 'integration-test' },
    })

    const exportRes = await agent
      .get(`/api/tournaments/${tournamentId}/export`)
      .buffer(true)
      .parse(parseBinaryResponse)
      .send()
    expect(exportRes.status).toBe(200)
    expect(Buffer.isBuffer(exportRes.body)).toBe(true)

    const extractedEntries = extractZip(exportRes.body as Buffer)
    const metadataEntry = extractedEntries.find((entry) => entry.path === 'metadata.json')
    expect(metadataEntry).toBeTruthy()
    const metadata = JSON.parse(metadataEntry?.content.toString('utf8') ?? '{}') as {
      collectionFiles?: Array<{ path: string; collectionName: string }>
    }
    const collectionFiles = metadata.collectionFiles ?? []
    expect(collectionFiles.length).toBeGreaterThanOrEqual(2)
    expect(collectionFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ collectionName: 'rounds' }),
        expect.objectContaining({ collectionName: 'teams' }),
      ])
    )

    const collectionJsonEntries = extractedEntries.filter(
      (entry) => entry.path.startsWith('json/collections/') && entry.path.endsWith('.json')
    )
    expect(collectionJsonEntries).toHaveLength(collectionFiles.length)
    expect(collectionJsonEntries.map((entry) => entry.path).sort()).toEqual(
      collectionFiles.map((entry) => entry.path).sort()
    )
    const reorderedBundle = buildZip(
      [
        ...extractedEntries.filter(
          (entry) => !entry.path.startsWith('json/collections/') || !entry.path.endsWith('.json')
        ),
        ...[...collectionJsonEntries].reverse(),
      ].map((entry) => ({
        path: entry.path,
        content: entry.content,
        modifiedAt: new Date('2024-01-01T00:00:00Z'),
      }))
    )

    const importRes = await agent
      .post('/api/tournaments/import')
      .set('Content-Type', 'application/zip')
      .send(reorderedBundle)
    expect(importRes.status).toBe(201)

    const restoredTournament = importRes.body.data.tournament as { _id: string; name: string }
    expect(restoredTournament.name).toBe('Restore Source Open')
    expect(restoredTournament._id).not.toBe(tournamentId)
    expect(importRes.body.data.importedAuditLogs).toBe(2)
    expect(importRes.body.data.importedDocuments).toBe(2)

    const restoredTournamentId = String(restoredTournament._id)
    const restoredConnection = await getTournamentConnection(restoredTournamentId)
    const RestoredTeamModel = getTeamModel(restoredConnection)
    const RestoredRoundModel = getRoundModel(restoredConnection)

    const restoredTeams = await RestoredTeamModel.find({ tournamentId: restoredTournamentId }).lean().exec()
    expect(restoredTeams).toHaveLength(1)
    expect(restoredTeams[0]?.name).toBe('Team Restore A')
    expect(String(restoredTeams[0]?.tournamentId)).toBe(restoredTournamentId)

    const restoredRounds = await RestoredRoundModel.find({ tournamentId: restoredTournamentId }).lean().exec()
    expect(restoredRounds).toHaveLength(1)
    expect(restoredRounds[0]?.name).toBe('Round 1')
    expect(String(restoredRounds[0]?.tournamentId)).toBe(restoredTournamentId)

    const restoredLogs = await AuditLogModel.find({ tournamentId: restoredTournamentId }).lean().exec()
    expect(restoredLogs).toHaveLength(2)
    expect(restoredLogs.some((item) => item.action === 'team.create')).toBe(true)
    expect(restoredLogs.some((item) => String(item._id) === String(originalAuditLog._id))).toBe(false)

    const meRes = await agent.get('/api/auth/me').send()
    expect(meRes.status).toBe(200)
    expect(meRes.body.data.tournaments).toContain(restoredTournamentId)
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

  it('does not overwrite an existing users global role or password when adding tournament membership', async () => {
    const owner = request.agent(app)

    const ownerRegisterRes = await owner
      .post('/api/v1/auth/register')
      .send({ username: 'user-owner-preserve', password: 'password123', role: 'organizer' })
    expect(ownerRegisterRes.status).toBe(201)

    const ownerLoginRes = await owner
      .post('/api/v1/auth/login')
      .send({ username: 'user-owner-preserve', password: 'password123' })
    expect(ownerLoginRes.status).toBe(200)

    const existingRegisterRes = await request(app).post('/api/v1/auth/register').send({
      username: 'existing-organizer-preserve',
      password: 'original-password',
      role: 'organizer',
    })
    expect(existingRegisterRes.status).toBe(201)
    const existingUserId = existingRegisterRes.body.data.userId as string

    const tournamentRes = await owner
      .post('/api/v1/tournaments')
      .send({ name: 'Preserve Existing User Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const addUserRes = await owner.post(`/api/v1/tournaments/${tournamentId}/users`).send({
      username: 'existing-organizer-preserve',
      password: 'replacement-password',
      role: 'speaker',
    })
    expect(addUserRes.status).toBe(200)
    expect(addUserRes.body.data.userId).toBe(existingUserId)
    expect(addUserRes.body.data.role).toBe('speaker')
    expect(addUserRes.body.data.tournaments).toContain(tournamentId)

    const membership = await TournamentMemberModel.findOne({
      tournamentId,
      userId: existingUserId,
    })
      .lean()
      .exec()
    expect(membership?.role).toBe('speaker')

    const existingUser = await UserModel.findById(existingUserId).lean().exec()
    expect(existingUser?.role).toBe('organizer')
    expect(await verifyPassword('original-password', String(existingUser?.passwordHash))).toBe(true)
    expect(await verifyPassword('replacement-password', String(existingUser?.passwordHash))).toBe(
      false
    )

    const existingOrganizer = request.agent(app)
    const originalPasswordLogin = await existingOrganizer.post('/api/v1/auth/login').send({
      username: 'existing-organizer-preserve',
      password: 'original-password',
    })
    expect(originalPasswordLogin.status).toBe(200)
    expect(originalPasswordLogin.body.data.role).toBe('organizer')

    const changedPasswordLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'existing-organizer-preserve',
      password: 'replacement-password',
    })
    expect(changedPasswordLogin.status).toBe(401)

    const createTournamentRes = await existingOrganizer
      .post('/api/v1/tournaments')
      .send({ name: 'Still Organizer Open', style: 1, options: {} })
    expect(createTournamentRes.status).toBe(201)
  })

  it('returns bad request when tournament user removal receives an invalid user id', async () => {
    const agent = request.agent(app)

    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({ username: 'user-remove-invalid-id', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'user-remove-invalid-id', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const tournamentRes = await agent
      .post('/api/v1/tournaments')
      .send({ name: 'Invalid User Delete Open', style: 1, options: {} })
    expect(tournamentRes.status).toBe(201)
    const tournamentId = tournamentRes.body.data._id as string

    const removeUserRes = await agent.delete(
      `/api/v1/tournaments/${tournamentId}/users?userId=not-an-object-id`
    )

    expect(removeUserRes.status).toBe(400)
    expect(removeUserRes.body.errors[0].message).toBe('Invalid user id')
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

  it('sanitizes tournament access secrets from organizer-facing responses', async () => {
    const organizer = request.agent(app)

    const registerRes = await organizer
      .post('/api/auth/register')
      .send({ username: 'tournament-auth-sanitizer', password: 'password123', role: 'organizer' })
    expect(registerRes.status).toBe(201)

    const loginRes = await organizer
      .post('/api/auth/login')
      .send({ username: 'tournament-auth-sanitizer', password: 'password123' })
    expect(loginRes.status).toBe(200)

    const createRes = await organizer.post('/api/tournaments').send({
      name: 'Sanitized Tournament Access',
      style: 1,
      auth: { access: { required: true, password: 'initial-secret' } },
    })
    expect(createRes.status).toBe(201)
    const tournamentId = String(createRes.body.data._id)

    expect(createRes.body.data.auth.access.required).toBe(true)
    expect(createRes.body.data.auth.access.hasPassword).toBe(true)
    expect(createRes.body.data.auth.access.password).toBeUndefined()
    expect(createRes.body.data.auth.access.passwordHash).toBeUndefined()

    await TournamentModel.updateOne(
      { _id: tournamentId },
      {
        $set: {
          auth: {
            access: {
              required: true,
              passwordHash: await hashPassword('hashed-secret'),
              version: 7,
            },
          },
        },
      }
    ).exec()

    const getRes = await organizer.get(`/api/tournaments/${tournamentId}`)
    expect(getRes.status).toBe(200)
    expect(getRes.body.data.auth.access.required).toBe(true)
    expect(getRes.body.data.auth.access.hasPassword).toBe(true)
    expect(getRes.body.data.auth.access.version).toBe(7)
    expect(getRes.body.data.auth.access.password).toBeUndefined()
    expect(getRes.body.data.auth.access.passwordHash).toBeUndefined()

    const listRes = await organizer.get('/api/tournaments')
    expect(listRes.status).toBe(200)
    const listed = listRes.body.data.find((item: any) => item._id === tournamentId)
    expect(listed).toBeTruthy()
    expect(listed.auth.access.required).toBe(true)
    expect(listed.auth.access.hasPassword).toBe(true)
    expect(listed.auth.access.version).toBe(7)
    expect(listed.auth.access.password).toBeUndefined()
    expect(listed.auth.access.passwordHash).toBeUndefined()

    const updateRes = await organizer.patch(`/api/tournaments/${tournamentId}`).send({
      auth: {
        access: {
          required: true,
          password: 'rotated-secret',
        },
      },
    })
    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data.auth.access.required).toBe(true)
    expect(updateRes.body.data.auth.access.hasPassword).toBe(true)
    expect(updateRes.body.data.auth.access.password).toBeUndefined()
    expect(updateRes.body.data.auth.access.passwordHash).toBeUndefined()
  })

})
