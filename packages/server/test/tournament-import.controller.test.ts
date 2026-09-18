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
  getTournamentConnection: vi.fn(),
  dropTournamentDatabase: vi.fn(),
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
    updateOne: vi.fn(),
    deleteMany: mocks.deleteMemberships,
  },
}))

vi.mock('../src/models/user.js', () => ({
  UserModel: {
    updateOne: vi.fn(),
    updateMany: mocks.cleanupUser,
  },
}))

vi.mock('../src/services/tournament-db.service.js', () => ({
  getTournamentConnection: mocks.getTournamentConnection,
  dropTournamentDatabase: mocks.dropTournamentDatabase,
}))

import { importTournamentBundle } from '../src/controllers/tournament-import.js'

const tournamentId = '507f1f77bcf86cd799439011'

function execResult(value: unknown = {}) {
  return { exec: async () => value }
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
  mocks.getTournamentConnection.mockResolvedValue({ db: null })
  mocks.dropTournamentDatabase.mockResolvedValue(undefined)
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

    expect(mocks.deleteTournament).toHaveBeenCalledWith({ _id: tournamentId })
    expect(mocks.deleteMemberships).toHaveBeenCalledWith({ tournamentId })
    expect(mocks.cleanupUser).toHaveBeenCalledWith(
      { _id: 'user-1' },
      { $pull: { tournaments: tournamentId } }
    )
    expect(mocks.dropTournamentDatabase).toHaveBeenCalledWith(tournamentId)
    expect(res.json).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()

    const forwarded = next.mock.calls[0]?.[0]
    expect(forwarded).toBeInstanceOf(AggregateError)
    expect(forwarded.message).toContain('Failed to roll back tournament import')
    expect(forwarded.errors).toEqual(expect.arrayContaining([cleanupError]))
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
