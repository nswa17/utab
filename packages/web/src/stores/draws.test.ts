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
  post: ReturnType<typeof vi.fn>
}

const mockedApi = api as unknown as MockedApi

describe('draws store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
    mockedApi.post.mockReset()
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

  it('does not overwrite another tournaments draw when upserting the same round', async () => {
    const store = useDrawsStore()
    store.draws = [
      {
        _id: 'draw-t1-r1',
        tournamentId: 't1',
        round: 1,
        allocation: [{ teams: { gov: 'a', opp: 'b' }, chairs: [], panels: [], trainees: [] }],
      } as any,
      {
        _id: 'draw-t2-r1',
        tournamentId: 't2',
        round: 1,
        allocation: [{ teams: { gov: 'c', opp: 'd' }, chairs: [], panels: [], trainees: [] }],
      } as any,
    ]
    mockedApi.post.mockResolvedValueOnce({
      data: {
        data: {
          _id: 'draw-t1-r1',
          tournamentId: 't1',
          round: 1,
          allocation: [{ teams: { gov: 'x', opp: 'y' }, chairs: [], panels: [], trainees: [] }],
        },
      },
    })

    await store.upsertDraw({
      tournamentId: 't1',
      round: 1,
      allocation: [{ teams: { gov: 'x', opp: 'y' }, chairs: [], panels: [], trainees: [] }],
    })

    expect(store.draws).toHaveLength(2)
    expect(store.draws.find((item) => item._id === 'draw-t1-r1')?.allocation[0]?.teams).toEqual({
      gov: 'x',
      opp: 'y',
    })
    expect(store.draws.find((item) => item._id === 'draw-t2-r1')?.allocation[0]?.teams).toEqual({
      gov: 'c',
      opp: 'd',
    })
  })

  it('keeps only the latest fetchDraws response when requests resolve out of order', async () => {
    const store = useDrawsStore()
    let resolveFirst: (value: any) => void = () => {}
    let resolveSecond: (value: any) => void = () => {}

    mockedApi.get
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve
          })
      )

    const firstRequest = store.fetchDraws('tournament-a')
    const secondRequest = store.fetchDraws('tournament-b')

    resolveSecond({
      data: {
        data: [{ _id: 'latest-draw', tournamentId: 'tournament-b', round: 1, allocation: [] }],
      },
    })
    await secondRequest

    resolveFirst({
      data: {
        data: [{ _id: 'stale-draw', tournamentId: 'tournament-a', round: 1, allocation: [] }],
      },
    })
    const staleResult = await firstRequest

    expect(staleResult).toEqual([])
    expect(store.draws).toEqual([
      { _id: 'latest-draw', tournamentId: 'tournament-b', round: 1, allocation: [] },
    ])
  })

  it('keeps loading true until all draw fetches finish', async () => {
    const store = useDrawsStore()
    let resolveFirst: (value: any) => void = () => {}
    let resolveSecond: (value: any) => void = () => {}

    mockedApi.get
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve
          })
      )

    const firstRequest = store.fetchDraws('tournament-a')
    const secondRequest = store.fetchDraws('tournament-b')

    expect(store.loading).toBe(true)

    resolveSecond({ data: { data: [] } })
    await secondRequest
    expect(store.loading).toBe(true)

    resolveFirst({ data: { data: [] } })
    await firstRequest
    expect(store.loading).toBe(false)
  })

  it('does not let a stale draw fetch overwrite a saved draw', async () => {
    const store = useDrawsStore()
    let resolveFetch: (value: any) => void = () => {}

    mockedApi.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
    )
    mockedApi.post.mockResolvedValueOnce({
      data: {
        data: {
          _id: 'draw-current',
          tournamentId: 't1',
          round: 1,
          allocation: [{ teams: { gov: 'new-gov', opp: 'new-opp' }, chairs: [], panels: [], trainees: [] }],
        },
      },
    })

    const fetchPromise = store.fetchDraws('t1')
    await store.upsertDraw({
      tournamentId: 't1',
      round: 1,
      allocation: [{ teams: { gov: 'new-gov', opp: 'new-opp' }, chairs: [], panels: [], trainees: [] }],
    })

    resolveFetch({
      data: {
        data: [
          {
            _id: 'draw-stale',
            tournamentId: 't1',
            round: 1,
            allocation: [{ teams: { gov: 'old-gov', opp: 'old-opp' }, chairs: [], panels: [], trainees: [] }],
          },
        ],
      },
    })
    await fetchPromise

    expect(store.draws).toEqual([
      {
        _id: 'draw-current',
        tournamentId: 't1',
        round: 1,
        allocation: [{ teams: { gov: 'new-gov', opp: 'new-opp' }, chairs: [], panels: [], trainees: [] }],
      },
    ] as any)
  })
})
