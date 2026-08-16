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
import { useAdjudicatorsStore } from './adjudicators'
import { useInstitutionsStore } from './institutions'
import { useSpeakersStore } from './speakers'
import { useTeamsStore } from './teams'
import { useVenuesStore } from './venues'

type MockedApi = {
  get: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const mockedApi = api as unknown as MockedApi

const cases = [
  {
    label: 'teams',
    useStore: useTeamsStore,
    listKey: 'teams',
    fetchMethod: 'fetchTeams',
    method: 'bulkDeleteTeams',
    path: '/teams',
  },
  {
    label: 'adjudicators',
    useStore: useAdjudicatorsStore,
    listKey: 'adjudicators',
    fetchMethod: 'fetchAdjudicators',
    method: 'bulkDeleteAdjudicators',
    path: '/adjudicators',
  },
  {
    label: 'venues',
    useStore: useVenuesStore,
    listKey: 'venues',
    fetchMethod: 'fetchVenues',
    method: 'bulkDeleteVenues',
    path: '/venues',
  },
  {
    label: 'speakers',
    useStore: useSpeakersStore,
    listKey: 'speakers',
    fetchMethod: 'fetchSpeakers',
    method: 'bulkDeleteSpeakers',
    path: '/speakers',
  },
  {
    label: 'institutions',
    useStore: useInstitutionsStore,
    listKey: 'institutions',
    fetchMethod: 'fetchInstitutions',
    method: 'bulkDeleteInstitutions',
    path: '/institutions',
  },
] as const

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('entity bulk delete stores', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
    mockedApi.delete.mockReset()
  })

  cases.forEach(({ label, useStore, listKey, method, path }) => {
    it(`bulk deletes ${label} from local state`, async () => {
      const store = useStore() as any
      store[listKey] = [
        { _id: 'entity-1', name: 'Entity 1' },
        { _id: 'entity-2', name: 'Entity 2' },
        { _id: 'entity-3', name: 'Entity 3' },
      ]
      mockedApi.delete.mockResolvedValueOnce({ data: { data: { deletedCount: 2 } } })

      const deletedCount = await store[method]('tournament-1', ['entity-1', 'entity-3'])

      expect(mockedApi.delete).toHaveBeenCalledWith(path, {
        params: { tournamentId: 'tournament-1', ids: 'entity-1,entity-3' },
      })
      expect(deletedCount).toBe(2)
      expect(store[listKey]).toEqual([{ _id: 'entity-2', name: 'Entity 2' }])
      expect(store.error).toBeNull()
    })
  })

  cases.forEach(({ label, useStore, listKey, fetchMethod, method }) => {
    it(`keeps ${label} deleted when an older fetch resolves later`, async () => {
      const store = useStore() as any
      store[listKey] = [
        { _id: 'entity-1', name: 'Entity 1' },
        { _id: 'entity-2', name: 'Entity 2' },
      ]
      const fetchDeferred = createDeferred<any>()
      const deleteDeferred = createDeferred<any>()
      mockedApi.get.mockImplementationOnce(() => fetchDeferred.promise)
      mockedApi.delete.mockImplementationOnce(() => deleteDeferred.promise)

      const fetchPromise = store[fetchMethod]('tournament-1')
      const deletePromise = store[method]('tournament-1', ['entity-1'])
      expect(store.loading).toBe(true)

      deleteDeferred.resolve({ data: { data: { deletedCount: 1 } } })
      await deletePromise
      expect(store[listKey]).toEqual([{ _id: 'entity-2', name: 'Entity 2' }])
      expect(store.loading).toBe(true)

      fetchDeferred.resolve({
        data: {
          data: [
            { _id: 'entity-1', name: 'Entity 1' },
            { _id: 'entity-2', name: 'Entity 2' },
          ],
        },
      })
      await fetchPromise

      expect(store[listKey]).toEqual([{ _id: 'entity-2', name: 'Entity 2' }])
      expect(store.loading).toBe(false)
    })
  })
})
