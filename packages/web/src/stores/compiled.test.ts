import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import { api } from '@/utils/api'
import { useCompiledStore } from './compiled'
import { DEFAULT_COMPILE_OPTIONS } from '@/types/compiled'

type MockedApi = {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
}

const mockedApi = api as unknown as MockedApi

describe('compiled store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
    mockedApi.post.mockReset()
  })

  it('submits compile options payload', async () => {
    const store = useCompiledStore()
    const options = {
      ...DEFAULT_COMPILE_OPTIONS,
      ranking_priority: {
        preset: 'custom',
        order: ['win', 'sum', 'margin', 'vote', 'average', 'sd'],
      },
      duplicate_normalization: {
        ...DEFAULT_COMPILE_OPTIONS.duplicate_normalization,
        merge_policy: 'latest',
      },
      diff_baseline: { mode: 'compiled', compiled_id: 'compiled-001' },
    }
    mockedApi.post.mockResolvedValueOnce({
      data: {
        data: {
          payload: {
            compile_options: options,
            compiled_team_results: [{ id: 'team-1' }],
          },
        },
      },
    })

    const result = await store.runCompile('tournament-1', {
      source: 'submissions',
      rounds: [1, 2],
      options,
    })

    expect(mockedApi.post).toHaveBeenCalledWith('/compiled', {
      tournamentId: 'tournament-1',
      source: 'submissions',
      rounds: [1, 2],
      options,
    })
    expect(result).toEqual({
      compile_options: options,
      compiled_team_results: [{ id: 'team-1' }],
    })
    expect(store.error).toBeNull()
  })

  it('stores API message when compile fails', async () => {
    const store = useCompiledStore()
    mockedApi.post.mockRejectedValueOnce({
      response: { data: { errors: [{ message: 'Compile failed' }] } },
    })

    const result = await store.runCompile('tournament-1')

    expect(result).toBeNull()
    expect(store.error).toBe('Compile failed')
    expect(store.loading).toBe(false)
  })
})
