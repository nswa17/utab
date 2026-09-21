import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findTournament: vi.fn(),
  createTournament: vi.fn(),
  deleteTournament: vi.fn(),
  getTournamentConnection: vi.fn(),
  dropTournamentDatabase: vi.fn(),
}))

vi.mock('../src/models/tournament.js', () => ({
  TournamentModel: {
    findById: mocks.findTournament,
    create: mocks.createTournament,
    deleteOne: mocks.deleteTournament,
  },
}))

vi.mock('../src/services/tournament-db.service.js', () => ({
  getTournamentConnection: mocks.getTournamentConnection,
  dropTournamentDatabase: mocks.dropTournamentDatabase,
}))

import { copyTournamentWithData } from '../src/devtools/copy-tournament.service.js'

function queryResult(value: unknown) {
  return { lean: () => ({ exec: async () => value }) }
}

function execResult(value: unknown = {}) {
  return { exec: async () => value }
}

describe('copyTournamentWithData rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findTournament.mockReturnValue(
      queryResult({
        _id: 'source',
        name: 'Source',
        style: 1,
        options: {},
        total_round_num: 4,
        current_round_num: 1,
        preev_weights: [0, 0, 0, 0, 0, 0],
        auth: { access: { required: false, version: 1 } },
        user_defined_data: {},
      })
    )
    mocks.createTournament.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      name: 'Source (Copy)',
    })
    mocks.deleteTournament.mockReturnValue(execResult({ deletedCount: 1 }))
    mocks.getTournamentConnection.mockResolvedValue({ db: null })
    mocks.dropTournamentDatabase.mockResolvedValue(undefined)
  })

  it('surfaces cleanup failures when copying tournament data fails', async () => {
    const cleanupError = new Error('metadata cleanup failed')
    mocks.deleteTournament.mockReturnValue({
      exec: async () => {
        throw cleanupError
      },
    })

    let thrown: unknown
    try {
      await copyTournamentWithData('source', 'actor', '507f1f77bcf86cd799439011')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AggregateError)
    const aggregate = thrown as AggregateError
    expect(aggregate.message).toContain('Failed to roll back copied tournament data')
    expect(aggregate.errors).toEqual(
      expect.arrayContaining([expect.any(Error), cleanupError])
    )
    expect(mocks.dropTournamentDatabase).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011'
    )
  })
})
