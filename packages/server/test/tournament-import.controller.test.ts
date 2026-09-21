import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuthenticatedActorId: vi.fn(),
  extractZip: vi.fn(),
  mergeTournamentAuth: vi.fn(),
  createTournament: vi.fn(),
  deleteTournament: vi.fn(),
  styleExists: vi.fn(),
  deleteAuditLogs: vi.fn(),
  deleteMemberships: vi.fn(),
  cleanupUser: vi.fn(),
  userUpdate: vi.fn(),
  membershipUpdate: vi.fn(),
  getTournamentConnection: vi.fn(),
  dropTournamentDatabase: vi.fn(),
  acquireLifecycleLease: vi.fn(),
  releaseMembershipLease: vi.fn(),
}))

vi.mock('../src/middleware/auth.js', () => ({
  getAuthenticatedActorId: mocks.getAuthenticatedActorId,
}))

vi.mock('../src/services/zip.js', () => ({
  extractZip: mocks.extractZip,
}))

vi.mock('../src/services/tournament-access.service.js', () => ({
  mergeTournamentAuth: mocks.mergeTournamentAuth,
}))

vi.mock('../src/models/tournament.js', () => ({
  TournamentModel: {
    create: mocks.createTournament,
    deleteOne: mocks.deleteTournament,
  },
}))

vi.mock('../src/models/style.js', () => ({
  StyleModel: {
    exists: mocks.styleExists,
  },
}))

vi.mock('../src/models/audit-log.js', () => ({
  AuditLogModel: {
    insertMany: vi.fn(),
    deleteMany: mocks.deleteAuditLogs,
  },
}))

vi.mock('../src/models/tournament-member.js', () => ({
  TournamentMemberModel: {
    updateOne: mocks.membershipUpdate,
    deleteMany: mocks.deleteMemberships,
  },
}))

vi.mock('../src/models/user.js', () => ({
  UserModel: {
    updateOne: mocks.userUpdate,
    updateMany: mocks.cleanupUser,
  },
}))

vi.mock('../src/services/tournament-db.service.js', () => ({
  getTournamentConnection: mocks.getTournamentConnection,
  dropTournamentDatabase: mocks.dropTournamentDatabase,
}))

vi.mock('../src/services/tournament-membership-guard.service.js', () => ({
  acquireTournamentMembershipLifecycleLease: mocks.acquireLifecycleLease,
  releaseTournamentMembershipLease: mocks.releaseMembershipLease,
}))

import { importTournamentBundle } from '../src/controllers/tournament-import.js'

const tournamentId = '507f1f77bcf86cd799439011'

function execResult(value: unknown = {}) {
  return { exec: async () => value }
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  }
  response.status.mockReturnValue(response)
  return response
}

function backupEntries() {
  return [
    {
      path: 'metadata.json',
      content: Buffer.from(
        JSON.stringify({
          format: 'utab.tournament.export/v2',
          tournamentId: '507f191e810c19729de860ea',
          tournamentName: 'Imported source',
          collectionNames: [],
        })
      ),
    },
    {
      path: 'json/tournament.json',
      content: Buffer.from(
        JSON.stringify({
          name: 'Imported source',
          style: 1,
          options: {},
          total_round_num: 4,
          current_round_num: 1,
          preev_weights: [0, 0, 0, 0, 0, 0],
          auth: {},
          user_defined_data: {},
        })
      ),
    },
    {
      path: 'json/audit-logs.json',
      content: Buffer.from('[]'),
    },
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getAuthenticatedActorId.mockReturnValue('user-1')
  mocks.extractZip.mockReturnValue(backupEntries())
  mocks.mergeTournamentAuth.mockResolvedValue({ auth: {}, error: null })
  mocks.createTournament.mockResolvedValue({
    _id: tournamentId,
    style: 1,
    save: vi.fn(),
    toJSON: () => ({ _id: tournamentId, name: 'Imported source', style: 1 }),
  })
  mocks.deleteTournament.mockReturnValue(execResult({ deletedCount: 1 }))
  mocks.styleExists.mockReturnValue(execResult({ _id: 'style-1' }))
  mocks.deleteAuditLogs.mockReturnValue(execResult({ deletedCount: 0 }))
  mocks.deleteMemberships.mockReturnValue(execResult({ deletedCount: 0 }))
  mocks.cleanupUser.mockReturnValue(execResult({ modifiedCount: 0 }))
  mocks.userUpdate.mockReturnValue(execResult({ modifiedCount: 1 }))
  mocks.membershipUpdate.mockReturnValue(execResult({ upsertedCount: 1 }))
  mocks.getTournamentConnection.mockResolvedValue({ db: null })
  mocks.dropTournamentDatabase.mockResolvedValue(undefined)
  mocks.acquireLifecycleLease.mockResolvedValue({ key: 'test:lifecycle', epoch: 1 })
  mocks.releaseMembershipLease.mockResolvedValue(true)
})

describe('importTournamentBundle rollback', () => {
  it('surfaces cleanup failures instead of hiding them behind the original import error', async () => {
    const cleanupError = new Error('audit cleanup failed')
    mocks.deleteAuditLogs.mockReturnValue({
      exec: async () => Promise.reject(cleanupError),
    })

    const req = {
      body: Buffer.from('backup'),
      session: { userId: 'user-1', tournaments: [] as string[] },
    }
    const res = createResponse()
    const next = vi.fn()

    await importTournamentBundle(req as never, res as never, next)

    const createPayload = mocks.createTournament.mock.calls[0]?.[0] as { _id?: unknown }
    const targetTournamentId = String(createPayload?._id ?? '')
    expect(targetTournamentId).toMatch(/^[a-f0-9]{24}$/)
    expect(mocks.deleteTournament).toHaveBeenCalledWith({ _id: targetTournamentId })
    expect(mocks.deleteMemberships).toHaveBeenCalledWith({ tournamentId: targetTournamentId })
    expect(mocks.cleanupUser).toHaveBeenCalledWith(
      { _id: 'user-1' },
      { $pull: { tournaments: targetTournamentId } }
    )
    expect(mocks.dropTournamentDatabase).toHaveBeenCalledWith(targetTournamentId)
    expect(res.json).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()

    const forwarded = next.mock.calls[0]?.[0]
    expect(forwarded).toBeInstanceOf(AggregateError)
    expect(forwarded.message).toContain('Failed to roll back tournament import')
    expect(forwarded.errors).toEqual(expect.arrayContaining([cleanupError]))
  })

  it('waits for all membership writes to settle before starting rollback', async () => {
    const userWrite = createDeferred<unknown>()
    const membershipStarted = createDeferred<void>()
    const membershipError = new Error('membership write failed')

    mocks.getTournamentConnection.mockResolvedValue({ db: {} })
    mocks.userUpdate.mockReturnValue({ exec: () => userWrite.promise })
    mocks.membershipUpdate.mockReturnValue({
      exec: async () => {
        membershipStarted.resolve()
        throw membershipError
      },
    })

    const req = {
      body: Buffer.from('backup'),
      session: { userId: 'user-1', tournaments: [] as string[] },
    }
    const res = createResponse()
    const next = vi.fn()

    const importPromise = importTournamentBundle(req as never, res as never, next)
    await membershipStarted.promise
    await Promise.resolve()

    expect(mocks.cleanupUser).not.toHaveBeenCalled()
    expect(mocks.deleteMemberships).not.toHaveBeenCalled()

    userWrite.resolve({ modifiedCount: 1 })
    await importPromise

    const createPayload = mocks.createTournament.mock.calls[0]?.[0] as { _id?: unknown }
    const targetTournamentId = String(createPayload?._id ?? '')
    expect(targetTournamentId).toMatch(/^[a-f0-9]{24}$/)
    expect(mocks.cleanupUser).toHaveBeenCalledWith(
      { _id: 'user-1' },
      { $pull: { tournaments: targetTournamentId } }
    )
    expect(mocks.deleteMemberships).toHaveBeenCalledWith({ tournamentId: targetTournamentId })
    expect(next).toHaveBeenCalledOnce()
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(AggregateError)
  })

  it('preserves the original structured import error when cleanup succeeds', async () => {
    const req = {
      body: Buffer.from('backup'),
      session: { userId: 'user-1', tournaments: [] as string[] },
    }
    const res = createResponse()
    const next = vi.fn()

    await importTournamentBundle(req as never, res as never, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      data: null,
      errors: [{ name: 'InternalError', message: 'Tournament database is not ready' }],
    })
    expect(next).not.toHaveBeenCalled()
  })
})
