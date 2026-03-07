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
  delete: ReturnType<typeof vi.fn>
}

const mockedApi = api as unknown as MockedApi

const cases = [
  {
    label: 'teams',
    useStore: useTeamsStore,
    listKey: 'teams',
    method: 'bulkDeleteTeams',
    path: '/teams',
  },
  {
    label: 'adjudicators',
    useStore: useAdjudicatorsStore,
    listKey: 'adjudicators',
    method: 'bulkDeleteAdjudicators',
    path: '/adjudicators',
  },
  {
    label: 'venues',
    useStore: useVenuesStore,
    listKey: 'venues',
    method: 'bulkDeleteVenues',
    path: '/venues',
  },
  {
    label: 'speakers',
    useStore: useSpeakersStore,
    listKey: 'speakers',
    method: 'bulkDeleteSpeakers',
    path: '/speakers',
  },
  {
    label: 'institutions',
    useStore: useInstitutionsStore,
    listKey: 'institutions',
    method: 'bulkDeleteInstitutions',
    path: '/institutions',
  },
] as const

describe('entity bulk delete stores', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
})
