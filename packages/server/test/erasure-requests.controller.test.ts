import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  eraseSpeaker: vi.fn(),
  eraseAdjudicator: vi.fn(),
  reauthenticate: vi.fn(),
}))

vi.mock('../src/models/erasure-request.js', () => ({
  ErasureRequestModel: {
    findOne: mocks.findOne,
    updateOne: mocks.updateOne,
    findOneAndUpdate: mocks.findOneAndUpdate,
  },
}))

vi.mock('../src/controllers/privacy.js', () => ({
  executeSpeakerPersonalDataErase: mocks.eraseSpeaker,
  executeAdjudicatorPersonalDataErase: mocks.eraseAdjudicator,
}))

vi.mock('../src/controllers/shared/sensitive-action.js', () => ({
  ensureSensitiveActionReauthentication: mocks.reauthenticate,
}))

import { executeErasureRequest } from '../src/controllers/erasure-requests.js'

const tournamentId = '507f1f77bcf86cd799439011'
const erasureRequestId = '507f191e810c19729de860ea'

function queryResult<T>(value: T) {
  return { lean: () => ({ exec: async () => value }) }
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
  mocks.reauthenticate.mockResolvedValue(true)
  mocks.findOne.mockReturnValue(
    queryResult({
      _id: erasureRequestId,
      tournamentId,
      status: 'approved',
      targetType: 'speaker',
      targetId: 'speaker-1',
      reason: 'privacy request',
      approvedBy: 'approver-1',
      targetRefs: [],
      eraseMode: 'anonymize',
    })
  )
  mocks.updateOne.mockReturnValue({ exec: async () => ({ modifiedCount: 1 }) })
})

describe('executeErasureRequest', () => {
  it('marks a running request as failed when personal data erasure throws', async () => {
    const executionError = new Error('erase exploded')
    mocks.eraseSpeaker.mockRejectedValueOnce(executionError)
    const req = {
      params: { id: erasureRequestId },
      body: { tournamentId, reauthPassword: 'password123' },
      session: { userId: 'operator-1' },
    }
    const res = createResponse()
    const next = vi.fn()

    await executeErasureRequest(req as never, res as never, next)

    expect(mocks.updateOne).toHaveBeenNthCalledWith(
      2,
      { _id: erasureRequestId, tournamentId, status: 'running' },
      {
        $set: {
          status: 'failed',
          executedBy: 'operator-1',
          executedAt: expect.any(Date),
          errorMessage: 'erase exploded',
        },
      }
    )
    expect(res.json).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(executionError)
  })
})
