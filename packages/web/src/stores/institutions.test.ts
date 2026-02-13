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
import { useInstitutionsStore } from './institutions'

type MockedApi = {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const mockedApi = api as unknown as MockedApi

describe('institutions store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
    mockedApi.post.mockReset()
    mockedApi.patch.mockReset()
    mockedApi.delete.mockReset()
  })

  it('creates institutions with category and priority', async () => {
    const store = useInstitutionsStore()
    const created = {
      _id: 'inst-1',
      tournamentId: 'tournament-1',
      name: 'Region East',
      category: 'region',
      priority: 2.5,
    }
    mockedApi.post.mockResolvedValueOnce({ data: { data: created } })

    const result = await store.createInstitution({
      tournamentId: 'tournament-1',
      name: 'Region East',
      category: 'region',
      priority: 2.5,
    })

    expect(mockedApi.post).toHaveBeenCalledWith('/institutions', {
      tournamentId: 'tournament-1',
      name: 'Region East',
      category: 'region',
      priority: 2.5,
    })
    expect(result).toEqual(created)
    expect(store.institutions[0]).toEqual(created)
    expect(store.error).toBeNull()
  })

  it('updates institution category and priority', async () => {
    const store = useInstitutionsStore()
    store.institutions = [
      {
        _id: 'inst-1',
        tournamentId: 'tournament-1',
        name: 'Region East',
        category: 'region',
        priority: 2.5,
      } as any,
    ]
    const updated = {
      _id: 'inst-1',
      tournamentId: 'tournament-1',
      name: 'Region East',
      category: 'league',
      priority: 4,
    }
    mockedApi.patch.mockResolvedValueOnce({ data: { data: updated } })

    const result = await store.updateInstitution({
      tournamentId: 'tournament-1',
      institutionId: 'inst-1',
      category: 'league',
      priority: 4,
    })

    expect(mockedApi.patch).toHaveBeenCalledWith('/institutions/inst-1', {
      tournamentId: 'tournament-1',
      name: undefined,
      category: 'league',
      priority: 4,
      userDefinedData: undefined,
    })
    expect(result).toEqual(updated)
    expect(store.institutions[0].category).toBe('league')
    expect(store.institutions[0].priority).toBe(4)
  })
})

