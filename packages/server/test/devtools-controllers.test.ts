import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  copyTournamentWithData: vi.fn(),
  userUpdate: vi.fn(),
  userCleanup: vi.fn(),
  membershipUpdate: vi.fn(),
  membershipCleanup: vi.fn(),
  tournamentCleanup: vi.fn(),
  dropTournamentDatabase: vi.fn(),
  fillTournamentSetupData: vi.fn(),
  fillRoundSubmissions: vi.fn(),
  clearRoundSubmissions: vi.fn(),
}))

vi.mock('../src/devtools/copy-tournament.service.js', () => ({
  copyTournamentWithData: mocks.copyTournamentWithData,
}))

vi.mock('../src/devtools/fill-setup.service.js', () => ({
  fillTournamentSetupData: mocks.fillTournamentSetupData,
}))

vi.mock('../src/devtools/fill-round-submissions.service.js', () => ({
  fillRoundSubmissions: mocks.fillRoundSubmissions,
  clearRoundSubmissions: mocks.clearRoundSubmissions,
}))

vi.mock('../src/models/user.js', () => ({
  UserModel: {
    updateOne: mocks.userUpdate,
    updateMany: mocks.userCleanup,
  },
}))

vi.mock('../src/models/tournament-member.js', () => ({
  TournamentMemberModel: {
    updateOne: mocks.membershipUpdate,
    deleteMany: mocks.membershipCleanup,
  },
}))

vi.mock('../src/models/tournament.js', () => ({
  TournamentModel: {
    deleteOne: mocks.tournamentCleanup,
  },
}))

vi.mock('../src/services/tournament-db.service.js', () => ({
  dropTournamentDatabase: mocks.dropTournamentDatabase,
}))

import { copyTournament } from '../src/devtools/controllers.js'

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

describe('devtools copyTournament rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.copyTournamentWithData.mockResolvedValue({
      tournamentId: '507f1f77bcf86cd799439011',
    })
    mocks.userUpdate.mockReturnValue(execResult({ modifiedCount: 1 }))
    mocks.userCleanup.mockReturnValue(execResult({ modifiedCount: 1 }))
    mocks.membershipUpdate.mockReturnValue(execResult({ upsertedCount: 1 }))
    mocks.membershipCleanup.mockReturnValue(execResult({ deletedCount: 1 }))
    mocks.tournamentCleanup.mockReturnValue(execResult({ deletedCount: 1 }))
    mocks.dropTournamentDatabase.mockResolvedValue(undefined)
  })

  it('waits for membership writes and surfaces cleanup failures', async () => {
    const userWrite = createDeferred<unknown>()
    const membershipStarted = createDeferred<void>()
    const membershipError = new Error('membership write failed')
    const cleanupError = new Error('tournament cleanup failed')

    mocks.userUpdate.mockReturnValue({ exec: () => userWrite.promise })
    mocks.membershipUpdate.mockReturnValue({
      exec: async () => {
        membershipStarted.resolve()
        throw membershipError
      },
    })
    mocks.tournamentCleanup.mockReturnValue({
      exec: async () => {
        throw cleanupError
      },
    })

    const req = {
      params: { tournamentId: 'source-tournament' },
      body: {},
      session: { userId: 'user-1', tournaments: [] as string[] },
    }
    const res = createResponse()
    const next = vi.fn()

    const copyPromise = copyTournament(req as never, res as never, next)
    await membershipStarted.promise
    await Promise.resolve()

    expect(mocks.tournamentCleanup).not.toHaveBeenCalled()
    expect(mocks.membershipCleanup).not.toHaveBeenCalled()

    userWrite.resolve({ modifiedCount: 1 })
    await copyPromise

    expect(mocks.tournamentCleanup).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
    })
    expect(mocks.membershipCleanup).toHaveBeenCalledWith({
      tournamentId: '507f1f77bcf86cd799439011',
    })
    expect(mocks.userCleanup).toHaveBeenCalledWith(
      { _id: 'user-1' },
      { $pull: { tournaments: '507f1f77bcf86cd799439011' } }
    )
    expect(mocks.dropTournamentDatabase).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011'
    )
    expect(res.json).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()

    const forwarded = next.mock.calls[0]?.[0]
    expect(forwarded).toBeInstanceOf(AggregateError)
    expect(forwarded.message).toContain('Failed to roll back copied tournament')
    expect(forwarded.errors).toEqual(
      expect.arrayContaining([expect.any(AggregateError), cleanupError])
    )
  })
})
