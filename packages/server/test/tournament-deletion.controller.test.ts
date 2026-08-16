import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  deleteOne: vi.fn(),
  replaceOne: vi.fn(),
  findUsers: vi.fn(),
  updateUsers: vi.fn(),
  findMembers: vi.fn(),
  deleteMembers: vi.fn(),
  restoreMembers: vi.fn(),
  dropTournamentDatabase: vi.fn(),
}))

vi.mock('../src/models/tournament.js', () => ({
  TournamentModel: {
    findById: mocks.findById,
    deleteOne: mocks.deleteOne,
    replaceOne: mocks.replaceOne,
  },
}))

vi.mock('../src/models/user.js', () => ({
  UserModel: {
    find: mocks.findUsers,
    updateMany: mocks.updateUsers,
  },
}))

vi.mock('../src/models/tournament-member.js', () => ({
  TournamentMemberModel: {
    find: mocks.findMembers,
    deleteMany: mocks.deleteMembers,
    bulkWrite: mocks.restoreMembers,
  },
}))

vi.mock('../src/services/tournament-db.service.js', () => ({
  dropTournamentDatabase: mocks.dropTournamentDatabase,
}))

import { deleteTournament } from '../src/controllers/tournaments.js'

const tournamentId = '507f1f77bcf86cd799439011'
const deletedTournament = {
  _id: tournamentId,
  name: 'Deletion test',
  style: 1,
  options: {},
}

function queryResult<T>(value: T) {
  return {
    lean: () => ({ exec: async () => value }),
  }
}

function selectableQueryResult<T>(value: T) {
  return {
    select: () => queryResult(value),
  }
}

function writeResult(value: unknown = {}) {
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

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findById.mockReturnValue(queryResult(deletedTournament))
  mocks.deleteOne.mockReturnValue(writeResult({ deletedCount: 1 }))
  mocks.replaceOne.mockReturnValue(writeResult({ acknowledged: true }))
  mocks.findUsers.mockReturnValue(selectableQueryResult([{ _id: 'user-1' }]))
  mocks.updateUsers.mockReturnValue(writeResult({ modifiedCount: 1 }))
  mocks.findMembers.mockReturnValue(queryResult([
    { _id: 'member-1', tournamentId, userId: 'user-1', role: 'organizer' },
  ]))
  mocks.deleteMembers.mockReturnValue(writeResult({ deletedCount: 1 }))
  mocks.restoreMembers.mockResolvedValue({ modifiedCount: 1 })
  mocks.dropTournamentDatabase.mockResolvedValue(undefined)
})

describe('deleteTournament', () => {
  it('restores all central metadata when database deletion fails', async () => {
    const dropError = new Error('drop failed')
    mocks.dropTournamentDatabase.mockRejectedValueOnce(dropError)
    const req = {
      params: { id: tournamentId },
      session: { tournaments: [tournamentId] },
    }
    const res = createResponse()
    const next = vi.fn()

    await deleteTournament(req as never, res as never, next)

    expect(mocks.replaceOne).toHaveBeenCalledWith(
      { _id: tournamentId },
      deletedTournament,
      { upsert: true }
    )
    expect(mocks.updateUsers).toHaveBeenCalledTimes(2)
    expect(mocks.deleteMembers).toHaveBeenCalledOnce()
    expect(mocks.restoreMembers).toHaveBeenCalledOnce()
    expect(req.session.tournaments).toEqual([tournamentId])
    expect(res.json).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(dropError)
  })

  it('finishes central cleanup before dropping the tournament database', async () => {
    const req = {
      params: { id: tournamentId },
      session: { tournaments: [tournamentId] },
    }
    const res = createResponse()
    const next = vi.fn()

    await deleteTournament(req as never, res as never, next)

    expect(mocks.replaceOne).not.toHaveBeenCalled()
    expect(mocks.dropTournamentDatabase).toHaveBeenCalledWith(tournamentId)
    expect(mocks.updateUsers).toHaveBeenCalled()
    expect(mocks.deleteMembers).toHaveBeenCalled()
    expect(req.session.tournaments).toEqual([])
    expect(res.json).toHaveBeenCalledOnce()
    expect(next).not.toHaveBeenCalled()
  })

  it('restores deleted central rows and does not drop the database when cleanup is partial', async () => {
    const cleanupError = new Error('user cleanup failed')
    mocks.updateUsers
      .mockReturnValueOnce({ exec: async () => Promise.reject(cleanupError) })
      .mockReturnValueOnce(writeResult({ modifiedCount: 1 }))
    const req = {
      params: { id: tournamentId },
      session: { tournaments: [tournamentId] },
    }
    const res = createResponse()
    const next = vi.fn()

    await deleteTournament(req as never, res as never, next)

    expect(mocks.replaceOne).toHaveBeenCalledOnce()
    expect(mocks.restoreMembers).toHaveBeenCalledOnce()
    expect(mocks.dropTournamentDatabase).not.toHaveBeenCalled()
    expect(req.session.tournaments).toEqual([tournamentId])
    expect(res.json).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(expect.any(AggregateError))
  })
})
