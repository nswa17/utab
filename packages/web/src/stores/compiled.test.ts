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
import type { CompileOptions } from '@/types/compiled'

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
    const options: CompileOptions = {
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
          _id: 'snapshot-001',
          createdAt: '2026-02-13T00:00:00.000Z',
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
      _id: 'snapshot-001',
      createdAt: '2026-02-13T00:00:00.000Z',
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

  it('stores preview state without creating a compiled snapshot', async () => {
    const store = useCompiledStore()
    mockedApi.post.mockResolvedValueOnce({
      data: {
        data: {
          preview: {
            compile_source: 'submissions',
            rounds: [{ r: 1, name: 'Round 1' }],
            compiled_team_results: [{ id: 'team-1' }],
          },
          preview_signature: 'sig-001',
          revision: 'rev-001',
        },
      },
    })

    const preview = await store.runPreview('tournament-1', {
      source: 'submissions',
      rounds: [1],
    })

    expect(mockedApi.post).toHaveBeenCalledWith('/compiled/preview', {
      tournamentId: 'tournament-1',
      source: 'submissions',
      rounds: [1],
    })
    expect(preview).toEqual({
      compile_source: 'submissions',
      rounds: [{ r: 1, name: 'Round 1' }],
      compiled_team_results: [{ id: 'team-1' }],
    })
    expect(store.previewState).toEqual({
      preview: {
        compile_source: 'submissions',
        rounds: [{ r: 1, name: 'Round 1' }],
        compiled_team_results: [{ id: 'team-1' }],
      },
      previewSignature: 'sig-001',
      revision: 'rev-001',
      source: 'submissions',
    })
  })

  it('includes snapshot metadata and preview tokens when saving compiled results', async () => {
    const store = useCompiledStore()
    mockedApi.post.mockResolvedValueOnce({
      data: {
        data: {
          _id: 'snapshot-002',
          payload: {
            compiled_team_results: [{ id: 'team-1' }],
          },
        },
      },
    })

    const saved = await store.saveCompiled('tournament-1', {
      source: 'raw',
      rounds: [1, 2],
      snapshotName: 'Round 1-2 / raw / 2026-02-20 18:00',
      snapshotMemo: 'manual note',
      previewSignature: 'sig-001',
      revision: 'rev-001',
    })

    expect(mockedApi.post).toHaveBeenCalledWith('/compiled', {
      tournamentId: 'tournament-1',
      source: 'raw',
      rounds: [1, 2],
      snapshot_name: 'Round 1-2 / raw / 2026-02-20 18:00',
      snapshot_memo: 'manual note',
      preview_signature: 'sig-001',
      revision: 'rev-001',
    })
    expect(saved).toEqual({
      _id: 'snapshot-002',
      compiled_team_results: [{ id: 'team-1' }],
    })
    expect(store.previewState).toBeNull()
  })
})
