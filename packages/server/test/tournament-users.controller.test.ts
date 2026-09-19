import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  updateUser: vi.fn(),
  findAndUpdateUser: vi.fn(),
  findMembership: vi.fn(),
  createMembership: vi.fn(),
  deleteMembership: vi.fn(),
  updateMembership: vi.fn(),
}))

vi.mock('../src/models/user.js', () => ({
  UserModel: {
    findOne: mocks.findUser,
    create: mocks.createUser,
    deleteOne: mocks.deleteUser,
    updateOne: mocks.updateUser,
    findOneAndUpdate: mocks.findAndUpdateUser,
  },
}))

vi.mock('../src/models/tournament-member.js', () => ({
  TournamentMemberModel: {
    findOne: mocks.findMembership,
    create: mocks.createMembership,
    deleteOne: mocks.deleteMembership,
    updateOne: mocks.updateMembership,
  },
}))

vi.mock('../src/services/hash.service.js', () => ({
  hashPassword: vi.fn(async () => 'password-hash'),
}))

vi.mock('../src/services/tournament-membership-guard.service.js', () => ({
  acquireTournamentMembershipLease: vi.fn(async () => ({
    tournamentId,
    username: 'test-user',
    token: 'test-token',
  })),
  releaseTournamentMembershipLease: vi.fn(async () => true),
}))

import { addTournamentUser, removeTournamentUser } from '../src/controllers/tournament-users.js'

const tournamentId = '507f1f77bcf86cd799439011'
const userId = '507f191e810c19729de860ea'

function writeResult(value: unknown = {}) {
  return { exec: async () => value }
}

function membershipQuery(value: unknown) {
  return {
    select: () => ({ lean: () => ({ exec: async () => value }) }),
  }
}

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() }
  response.status.mockReturnValue(response)
  return response
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deleteUser.mockReturnValue(writeResult({ deletedCount: 1 }))
  mocks.updateUser.mockReturnValue(writeResult({ modifiedCount: 1 }))
  mocks.findAndUpdateUser.mockReturnValue(writeResult(null))
  mocks.deleteMembership.mockReturnValue(writeResult({ deletedCount: 1 }))
  mocks.updateMembership.mockReturnValue(writeResult({ modifiedCount: 1 }))
  mocks.findMembership.mockReturnValue(membershipQuery(null))
})

describe('tournament user membership consistency', () => {
  it('restores an existing user when membership attachment fails', async () => {
    const membershipError = new Error('membership update failed')
    const existingUser = {
      _id: userId,
      username: 'existing-user',
      role: 'audience',
      tournaments: ['other-tournament'],
      toJSON() {
        return this
      },
    }
    mocks.findUser.mockReturnValue(writeResult(existingUser))
    mocks.findAndUpdateUser.mockReturnValue(writeResult(existingUser))
    mocks.updateMembership.mockReturnValueOnce({
      exec: async () => Promise.reject(membershipError),
    })
    const req = {
      params: { id: tournamentId },
      body: { username: 'existing-user', password: 'password123', role: 'speaker' },
    }
    const res = createResponse()
    const next = vi.fn()

    await addTournamentUser(req as never, res as never, next)

    expect(mocks.findAndUpdateUser).toHaveBeenCalledWith(
      { _id: userId },
      { $addToSet: { tournaments: tournamentId } },
      { new: true }
    )
    expect(mocks.updateUser).toHaveBeenCalledWith(
      { _id: userId },
      { $pull: { tournaments: tournamentId } }
    )
    expect(mocks.deleteMembership).toHaveBeenCalledWith({ tournamentId, userId })
    expect(res.json).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(membershipError)
  })

  it('does not roll back a tournament link that existed before attachment', async () => {
    const membershipError = new Error('membership update failed')
    const existingUser = {
      _id: userId,
      username: 'existing-user',
      role: 'speaker',
      tournaments: [tournamentId, 'other-tournament'],
      toJSON() {
        return this
      },
    }
    mocks.findUser.mockReturnValue(writeResult(existingUser))
    mocks.findAndUpdateUser.mockReturnValue(writeResult(existingUser))
    mocks.updateMembership.mockReturnValueOnce({
      exec: async () => Promise.reject(membershipError),
    })
    const req = {
      params: { id: tournamentId },
      body: { username: 'existing-user', password: 'password123', role: 'speaker' },
    }
    const res = createResponse()
    const next = vi.fn()

    await addTournamentUser(req as never, res as never, next)

    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(membershipError)
  })

  it('refreshes membership state after acquiring the removal lease', async () => {
    const membershipError = new Error('membership delete failed')
    const staleUser = {
      _id: userId,
      username: 'existing-user',
      role: 'speaker',
      tournaments: [tournamentId, 'other-tournament'],
      toJSON() {
        return this
      },
    }
    const refreshedUser = {
      ...staleUser,
      tournaments: ['other-tournament'],
    }
    mocks.findUser
      .mockReturnValueOnce(writeResult(staleUser))
      .mockReturnValueOnce(writeResult(refreshedUser))
    mocks.findAndUpdateUser.mockReturnValue(writeResult(refreshedUser))
    mocks.findMembership.mockReturnValue(membershipQuery(null))
    mocks.deleteMembership.mockReturnValueOnce({
      exec: async () => Promise.reject(membershipError),
    })
    const req = {
      params: { id: tournamentId },
      query: { userId },
      session: { userId: 'organizer-user', tournaments: [tournamentId] },
    }
    const res = createResponse()
    const next = vi.fn()

    await removeTournamentUser(req as never, res as never, next)

    expect(mocks.findUser).toHaveBeenNthCalledWith(1, { _id: userId })
    expect(mocks.findUser).toHaveBeenNthCalledWith(2, { _id: userId })
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(membershipError)
  })

  it('restores the user and membership when membership removal fails', async () => {
    const membershipError = new Error('membership delete failed')
    const existingUser = {
      _id: userId,
      username: 'existing-user',
      role: 'speaker',
      tournaments: [tournamentId, 'other-tournament'],
      toJSON() {
        return this
      },
    }
    mocks.findUser.mockReturnValue(writeResult(existingUser))
    mocks.findAndUpdateUser.mockReturnValue(writeResult(existingUser))
    mocks.findMembership.mockReturnValue(membershipQuery({ role: 'speaker' }))
    mocks.deleteMembership.mockReturnValueOnce({
      exec: async () => Promise.reject(membershipError),
    })
    const req = {
      params: { id: tournamentId },
      query: { userId },
      session: { userId: 'organizer-user', tournaments: [tournamentId] },
    }
    const res = createResponse()
    const next = vi.fn()

    await removeTournamentUser(req as never, res as never, next)

    expect(mocks.findAndUpdateUser).toHaveBeenCalledWith(
      { _id: userId },
      { $pull: { tournaments: tournamentId } },
      { new: true }
    )
    expect(mocks.updateUser).toHaveBeenCalledWith(
      { _id: userId },
      { $addToSet: { tournaments: tournamentId } }
    )
    expect(mocks.updateMembership).toHaveBeenCalledWith(
      { tournamentId, userId },
      { $set: { role: 'speaker' } },
      { upsert: true }
    )
    expect(req.session.tournaments).toEqual([tournamentId])
    expect(res.json).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(membershipError)
  })
})
