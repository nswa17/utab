import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { DBHandler } from '../src/controllers/handlers.js'
import { CON } from '../src/controllers/connection.js'
import { TournamentHandler } from '../src/index.js'

let mongo: MongoMemoryServer
let uri = ''

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({
    instance: { ip: '127.0.0.1', launchTimeout: 600000 },
  })
  uri = mongo.getUri()
}, 120000)

afterAll(async () => {
  if (mongo) {
    await mongo.stop()
  }
}, 120000)

describe('controllers/handlers integration', () => {
  it('performs CRUD through DBHandler collections', async () => {
    const db = new DBHandler(uri, {
      id: 1,
      name: 'Test Tournament',
      style: { team_num: 2, score_weights: [1] },
      user_defined_data: {},
    })

    const created = await db.teams.create({
      id: 1,
      name: 'Team 1',
      details: [{ r: 1, available: true, institutions: [], speakers: [] }],
    })
    expect(created.name).toBe('Team 1')

    const readAll = await db.teams.read()
    expect(readAll).toHaveLength(1)

    const updated = await db.teams.update({
      id: 1,
      name: 'Team 1 Updated',
      details: [{ r: 1, available: true, institutions: [], speakers: [] }],
    })
    expect(updated.name).toBe('Team 1 Updated')

    const found = await db.teams.findOne({ id: 1 })
    expect(found.name).toBe('Team 1 Updated')

    const removed = await db.teams.delete({ id: 1 })
    expect(removed.id).toBe(1)

    const remaining = await db.teams.read()
    expect(remaining).toHaveLength(0)

    await db.conn.dropDatabase()
    db.close()
  })

  it('writes and reads raw results collections', async () => {
    const db = new DBHandler(uri, {
      id: 2,
      name: 'Result Tournament',
      style: { team_num: 2, score_weights: [1] },
      user_defined_data: {},
    })

    const created = await db.raw_team_results.create({
      id: 1,
      from_id: 99,
      r: 1,
      win: 1,
      opponents: [2],
      side: 'gov',
    })
    expect(created.id).toBe(1)

    const found = await db.raw_team_results.findOne({ id: 1, r: 1, from_id: 99 })
    expect(found.side).toBe('gov')

    await db.conn.dropDatabase()
    db.close()
  })

  it('enforces unique entity ids and supports deleteAll', async () => {
    const db = new DBHandler(uri, {
      id: 5,
      name: 'Uniq Tournament',
      style: { team_num: 2, score_weights: [1] },
      user_defined_data: {},
    })

    await db.teams.create({
      id: 1,
      name: 'Team 1',
      details: [{ r: 1, available: true, institutions: [], speakers: [] }],
    })
    await expect(
      db.teams.create({
        id: 1,
        name: 'Team 1 Duplicate',
        details: [{ r: 1, available: true, institutions: [], speakers: [] }],
      })
    ).rejects.toMatchObject({ name: 'AlreadyExists' })

    await db.teams.create({
      id: 2,
      name: 'Team 2',
      details: [{ r: 1, available: true, institutions: [], speakers: [] }],
    })

    const deleted = await db.teams.deleteAll()
    expect(deleted.deletedCount).toBe(2)

    const remaining = await db.teams.read()
    expect(remaining).toHaveLength(0)

    await db.conn.dropDatabase()
    db.close()
  })

  it('updates and deletes raw result rows by composite identity', async () => {
    const db = new DBHandler(uri, {
      id: 6,
      name: 'Composite Result Tournament',
      style: { team_num: 2, score_weights: [1] },
      user_defined_data: {},
    })

    await db.raw_team_results.create({
      id: 1,
      from_id: 99,
      r: 1,
      win: 1,
      opponents: [2],
      side: 'gov',
    })
    await db.raw_team_results.create({
      id: 1,
      from_id: 100,
      r: 1,
      win: 0,
      opponents: [2],
      side: 'opp',
    })

    const updated = await db.raw_team_results.update({
      id: 1,
      from_id: 99,
      r: 1,
      win: 0,
      opponents: [2],
      side: 'opp',
    })
    expect(updated.win).toBe(0)
    expect(updated.side).toBe('opp')

    const untouched = await db.raw_team_results.findOne({ id: 1, r: 1, from_id: 100 })
    expect(untouched.side).toBe('opp')

    const deleted = await db.raw_team_results.delete({ id: 1, r: 1, from_id: 99 })
    expect(deleted.from_id).toBe(99)
    await expect(db.raw_team_results.findOne({ id: 1, r: 1, from_id: 99 })).rejects.toMatchObject({
      name: 'DoesNotExist',
    })

    await db.conn.dropDatabase()
    db.close()
  })
})

describe('controllers/connection integration', () => {
  it('binds methods through CON', async () => {
    const con = new CON(uri, {
      id: 3,
      name: 'Connection Tournament',
      style: { team_num: 2, score_weights: [1] },
      user_defined_data: {},
    })

    await con.teams.create({
      id: 5,
      name: 'Team 5',
      details: [{ r: 1, available: true, institutions: [], speakers: [] }],
    })

    const team = await con.teams.findOne({ id: 5 })
    expect(team.name).toBe('Team 5')

    await con.dbh.conn.dropDatabase()
    con.close()
  })
})

describe('index/TournamentHandler integration', () => {
  it('constructs TournamentHandler and performs basic operations', async () => {
    const handler = new TournamentHandler(uri, {
      id: 4,
      name: 'Handler Tournament',
      style: { team_num: 2, score_weights: [1] },
      user_defined_data: {},
    })

    await handler.teams.create({
      id: 7,
      name: 'Team 7',
      details: [{ r: 1, available: true, institutions: [], speakers: [] }],
    })

    const teams = await handler.teams.read()
    expect(teams).toHaveLength(1)

    await handler.con.dbh.conn.dropDatabase()
    handler.close()
  })
})
