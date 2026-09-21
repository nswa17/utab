import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  styleExists: vi.fn(),
  createTournament: vi.fn(),
  deleteTournament: vi.fn(),
  updateUser: vi.fn(),
  cleanupUser: vi.fn(),
  updateMembership: vi.fn(),
  cleanupMembership: vi.fn(),
  acquireLifecycleLease: vi.fn(),
  releaseMembershipLease: vi.fn(),
}))

vi.mock('../src/models/style.js', () => ({
  StyleModel: { exists: mocks.styleExists },
}))

vi.mock('../src/models/tournament.js', () => ({
  TournamentModel: {
    create: mocks.createTournament,
    deleteOne: mocks.deleteTournament,
  },
}))

vi.mock('../src/models/user.js', () => ({
  UserModel: {
    updateOne: mocks.updateUser,
    updateMany: mocks.cleanupUser,
  },
}))

vi.mock('../src/models/tournament-member.js', () => ({
  TournamentMemberModel: {
    updateOne: mocks.updateMembership,
    deleteMany: mocks.cleanupMembership,
  },
}))

vi.mock('../src/services/tournament-db.service.js', () => ({
  dropTournamentDatabase: vi.fn(),
}))

vi.mock('../src/services/tournament-membership-guard.service.js', () => ({
  acquireTournamentMembershipLifecycleLease: mocks.acquireLifecycleLease,
  releaseTournamentMembershipLease: mocks.releaseMembershipLease,
}))

import { createTournament } from '../src/controllers/tournaments.js'

const tournamentId = '507f1f77bcf86cd799439011'

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
  mocks.styleExists.mockReturnValue(writeResult({ _id: 'style-1' }))
  mocks.createTournament.mockResolvedValue({
    _id: { toString: () => tournamentId },
    toJSON: () => ({ _id: tournamentId, name: 'Creation test', style: 1, auth: {} }),
  })
  mocks.deleteTournament.mockReturnValue(writeResult({ deletedCount: 1 }))
  mocks.updateUser.mockReturnValue(writeResult({ modifiedCount: 1 }))
  mocks.cleanupUser.mockReturnValue(writeResult({ modifiedCount: 1 }))
  mocks.updateMembership.mockReturnValue(writeResult({ upsertedCount: 1 }))
  mocks.cleanupMembership.mockReturnValue(writeResult({ deletedCount: 1 }))
  mocks.acquireLifecycleLease.mockResolvedValue({ key: 'test:lifecycle', epoch: 1 })
  mocks.releaseMembershipLease.mockResolvedValue(true)
})

describe('createTournament', () => {
  it('removes the tournament and partial membership metadata when organizer attachment fails', async () => {
    const membershipError = new Error('membership write failed')
    mocks.updateMembership.mockReturnValue({ exec: async () => Promise.reject(membershipError) })
    const req = {
      body: { name: 'Creation test', style: 1, options: {} },
      session: { userId: 'user-1', tournaments: [] as string[] },
    }
    const res = createResponse()
    const next = vi.fn()

    await createTournament(req as never, res as never, next)

    const createdPayload = mocks.createTournament.mock.calls[0]?.[0] as { _id?: unknown }
    const createdTournamentId = String(createdPayload?._id ?? '')
    expect(createdTournamentId).toMatch(/^[a-f0-9]{24}$/)
    expect(mocks.deleteTournament).toHaveBeenCalledWith({ _id: createdTournamentId })
    expect(mocks.cleanupUser).toHaveBeenCalledWith(
      { _id: 'user-1' },
      { $pull: { tournaments: createdTournamentId } }
    )
    expect(mocks.cleanupMembership).toHaveBeenCalledWith({ tournamentId: createdTournamentId })
    expect(req.session.tournaments).toEqual([])
    expect(res.json).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(membershipError)
  })
})
