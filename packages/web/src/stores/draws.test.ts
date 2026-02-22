import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '@/utils/api'
import { useDrawsStore } from './draws'

type MockedApi = {
  get: ReturnType<typeof vi.fn>
}

const mockedApi = api as unknown as MockedApi

describe('draws store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
  })

  it('merges a round-scoped fetch without dropping other rounds', async () => {
    const store = useDrawsStore()
    store.draws = [
      {
        _id: 'draw-r1',
        tournamentId: 't1',
        round: 1,
        allocation: [],
        drawOpened: true,
        allocationOpened: true,
      } as any,
      {
        _id: 'draw-r2',
        tournamentId: 't1',
        round: 2,
        allocation: [],
      } as any,
      {
        _id: 'draw-other',
        tournamentId: 't2',
        round: 1,
        allocation: [],
      } as any,
    ]
    mockedApi.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            _id: 'draw-r3',
            tournamentId: 't1',
            round: 3,
            allocation: [],
          },
        ],
      },
    })

    await store.fetchDraws('t1', 3)

    expect(store.draws.map((item) => item._id)).toEqual(
      expect.arrayContaining(['draw-r1', 'draw-r2', 'draw-r3', 'draw-other'])
    )
    expect(store.draws.some((item) => item._id === 'draw-r1' && item.drawOpened)).toBe(true)
  })

  it('replaces draw list on full fetch', async () => {
    const store = useDrawsStore()
    store.draws = [
      {
        _id: 'old-draw',
        tournamentId: 't1',
        round: 1,
        allocation: [],
      } as any,
    ]
    mockedApi.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            _id: 'new-draw',
            tournamentId: 't1',
            round: 1,
            allocation: [],
          },
        ],
      },
    })

    await store.fetchDraws('t1')

    expect(store.draws).toHaveLength(1)
    expect(store.draws[0]._id).toBe('new-draw')
  })
})
