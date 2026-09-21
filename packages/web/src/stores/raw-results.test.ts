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
import { useRawResultsStore } from './raw-results'

type MockedApi = {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const mockedApi = api as unknown as MockedApi

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('raw results store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
    mockedApi.post.mockReset()
    mockedApi.patch.mockReset()
    mockedApi.delete.mockReset()
  })

  it('keeps only the latest response for the same label when requests resolve out of order', async () => {
    const store = useRawResultsStore()
    const first = createDeferred<any>()
    const second = createDeferred<any>()

    mockedApi.get
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const staleRequest = store.fetchRawResults({
      tournamentId: 'tournament-1',
      label: 'teams',
      round: 1,
    })
    const latestRequest = store.fetchRawResults({
      tournamentId: 'tournament-2',
      label: 'teams',
      round: 2,
    })

    const latestRows = [{ _id: 'latest-team', tournamentId: 'tournament-2', r: 2 }]
    second.resolve({ data: { data: latestRows } })
    await latestRequest

    first.resolve({
      data: {
        data: [{ _id: 'stale-team', tournamentId: 'tournament-1', r: 1 }],
      },
    })
    const staleResult = await staleRequest

    expect(staleResult).toEqual([])
    expect(store.teamResults).toEqual(latestRows as any)
    expect(store.loading).toBe(false)
  })

  it('does not let a stale same-tournament fetch overwrite state after a mutation', async () => {
    const store = useRawResultsStore()
    store.teamResults = [{ _id: 'current-row', tournamentId: 'tournament-1', r: 1 } as any]

    let resolveFetch: (value: any) => void = () => {}
    mockedApi.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
    )
    mockedApi.patch.mockResolvedValueOnce({
      data: {
        data: { _id: 'current-row', tournamentId: 'tournament-1', r: 1, win: 1 },
      },
    })

    const staleFetch = store.fetchRawResults({
      tournamentId: 'tournament-1',
      label: 'teams',
      round: 1,
    })
    await store.updateRawResult('teams', 'current-row', {
      tournamentId: 'tournament-1',
      win: 1,
    })

    resolveFetch({
      data: {
        data: [{ _id: 'stale-row', tournamentId: 'tournament-1', r: 1, win: 0 }],
      },
    })

    expect(await staleFetch).toEqual([])
    expect(store.teamResults).toEqual([
      { _id: 'current-row', tournamentId: 'tournament-1', r: 1 },
    ] as any)
  })

  it('keeps loading true until concurrent label fetches finish', async () => {
    const store = useRawResultsStore()
    const teamsRequest = createDeferred<any>()
    const speakersRequest = createDeferred<any>()
    const adjudicatorsRequest = createDeferred<any>()

    mockedApi.get
      .mockImplementationOnce(() => teamsRequest.promise)
      .mockImplementationOnce(() => speakersRequest.promise)
      .mockImplementationOnce(() => adjudicatorsRequest.promise)

    const teamsPromise = store.fetchRawResults({ tournamentId: 'tournament-1', label: 'teams', round: 1 })
    const speakersPromise = store.fetchRawResults({
      tournamentId: 'tournament-1',
      label: 'speakers',
      round: 1,
    })
    const adjudicatorsPromise = store.fetchRawResults({
      tournamentId: 'tournament-1',
      label: 'adjudicators',
      round: 1,
    })

    expect(store.loading).toBe(true)

    teamsRequest.resolve({ data: { data: [] } })
    await teamsPromise
    expect(store.loading).toBe(true)

    speakersRequest.resolve({ data: { data: [] } })
    await speakersPromise
    expect(store.loading).toBe(true)

    adjudicatorsRequest.resolve({ data: { data: [] } })
    await adjudicatorsPromise
    expect(store.loading).toBe(false)
  })
  it('clears other raw-result labels when the active tournament changes', async () => {
    const store = useRawResultsStore()

    mockedApi.get
      .mockResolvedValueOnce({
        data: { data: [{ _id: 'team-a', tournamentId: 'tournament-a', r: 1 }] },
      })
      .mockResolvedValueOnce({
        data: { data: [{ _id: 'speaker-a', tournamentId: 'tournament-a', r: 1 }] },
      })
      .mockResolvedValueOnce({
        data: { data: [{ _id: 'team-b', tournamentId: 'tournament-b', r: 1 }] },
      })

    await store.fetchRawResults({ tournamentId: 'tournament-a', label: 'teams', round: 1 })
    await store.fetchRawResults({ tournamentId: 'tournament-a', label: 'speakers', round: 1 })

    expect(store.teamResults).toHaveLength(1)
    expect(store.speakerResults).toHaveLength(1)

    await store.fetchRawResults({ tournamentId: 'tournament-b', label: 'teams', round: 1 })

    expect(store.teamResults).toEqual([
      { _id: 'team-b', tournamentId: 'tournament-b', r: 1 },
    ] as any)
    expect(store.speakerResults).toEqual([])
    expect(store.adjudicatorResults).toEqual([])
  })

  it('rejects a stale response from another tournament even when it uses a different label counter', async () => {
    const store = useRawResultsStore()
    const oldTeams = createDeferred<any>()
    const currentSpeakers = createDeferred<any>()

    mockedApi.get
      .mockImplementationOnce(() => oldTeams.promise)
      .mockImplementationOnce(() => currentSpeakers.promise)

    const oldRequest = store.fetchRawResults({
      tournamentId: 'tournament-a',
      label: 'teams',
      round: 1,
    })
    const currentRequest = store.fetchRawResults({
      tournamentId: 'tournament-b',
      label: 'speakers',
      round: 1,
    })

    currentSpeakers.resolve({
      data: {
        data: [{ _id: 'speaker-b', tournamentId: 'tournament-b', r: 1 }],
      },
    })
    await currentRequest

    oldTeams.resolve({
      data: {
        data: [{ _id: 'team-a-late', tournamentId: 'tournament-a', r: 1 }],
      },
    })
    const staleResult = await oldRequest

    expect(staleResult).toEqual([])
    expect(store.teamResults).toEqual([])
    expect(store.speakerResults).toEqual([
      { _id: 'speaker-b', tournamentId: 'tournament-b', r: 1 },
    ] as any)
  })

  it('does not revive an old label response after A -> B -> A through another label', async () => {
    const store = useRawResultsStore()
    const oldTeams = createDeferred<any>()
    mockedApi.get
      .mockImplementationOnce(() => oldTeams.promise)
      .mockResolvedValueOnce({
        data: { data: [{ _id: 'speaker-b', tournamentId: 'tournament-b', r: 1 }] },
      })
      .mockResolvedValueOnce({
        data: { data: [{ _id: 'speaker-a-current', tournamentId: 'tournament-a', r: 1 }] },
      })

    const oldPromise = store.fetchRawResults({
      tournamentId: 'tournament-a',
      label: 'teams',
      round: 1,
    })
    await store.fetchRawResults({
      tournamentId: 'tournament-b',
      label: 'speakers',
      round: 1,
    })
    await store.fetchRawResults({
      tournamentId: 'tournament-a',
      label: 'speakers',
      round: 1,
    })

    oldTeams.resolve({
      data: { data: [{ _id: 'team-a-old', tournamentId: 'tournament-a', r: 1 }] },
    })

    expect(await oldPromise).toEqual([])
    expect(store.teamResults).toEqual([])
    expect(store.speakerResults).toEqual([
      { _id: 'speaker-a-current', tournamentId: 'tournament-a', r: 1 },
    ] as any)
  })

})
