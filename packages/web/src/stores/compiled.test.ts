import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '@/utils/api'
import { useCompiledStore } from './compiled'
import { DEFAULT_COMPILE_OPTIONS } from '@/types/compiled'
import type { CompileOptions } from '@/types/compiled'

type MockedApi = {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
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

describe('compiled store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
    mockedApi.post.mockReset()
    mockedApi.delete.mockReset()
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

  it('deletes a compiled snapshot by id', async () => {
    const store = useCompiledStore()
    mockedApi.delete.mockResolvedValueOnce({
      data: {
        data: {
          _id: 'snapshot-003',
          payload: {
            compiled_team_results: [{ id: 'team-1' }],
          },
        },
      },
    })

    const deleted = await store.deleteCompiled('tournament-1', 'snapshot-003')

    expect(mockedApi.delete).toHaveBeenCalledWith('/compiled/snapshot-003', {
      params: { tournamentId: 'tournament-1' },
    })
    expect(deleted).toEqual({
      _id: 'snapshot-003',
      compiled_team_results: [{ id: 'team-1' }],
    })
    expect(store.error).toBeNull()
  })

  it('keeps only the latest preview response when requests resolve out of order', async () => {
    const store = useCompiledStore()
    const first = createDeferred<any>()
    const second = createDeferred<any>()

    mockedApi.post
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const staleRequest = store.runPreview('tournament-1', {
      source: 'submissions',
      rounds: [1],
    })
    const latestRequest = store.runPreview('tournament-1', {
      source: 'raw',
      rounds: [2],
    })

    second.resolve({
      data: {
        data: {
          preview: {
            compile_source: 'raw',
            rounds: [{ r: 2, name: 'Round 2' }],
            compiled_team_results: [{ id: 'team-2' }],
          },
          preview_signature: 'sig-latest',
          revision: 'rev-latest',
        },
      },
    })
    await latestRequest

    first.resolve({
      data: {
        data: {
          preview: {
            compile_source: 'submissions',
            rounds: [{ r: 1, name: 'Round 1' }],
            compiled_team_results: [{ id: 'team-1' }],
          },
          preview_signature: 'sig-stale',
          revision: 'rev-stale',
        },
      },
    })
    const staleResult = await staleRequest

    expect(staleResult).toBeNull()
    expect(store.previewState).toEqual({
      preview: {
        compile_source: 'raw',
        rounds: [{ r: 2, name: 'Round 2' }],
        compiled_team_results: [{ id: 'team-2' }],
      },
      previewSignature: 'sig-latest',
      revision: 'rev-latest',
      source: 'raw',
    })
  })

  it('keeps loading true until concurrent compiled requests finish', async () => {
    const store = useCompiledStore()
    const first = createDeferred<any>()
    const second = createDeferred<any>()

    mockedApi.get
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const firstRequest = store.fetchLatest('tournament-1')
    const secondRequest = store.fetchLatest('tournament-1')

    expect(store.loading).toBe(true)

    second.resolve({
      data: {
        data: {
          _id: 'compiled-2',
          payload: {
            compiled_team_results: [{ id: 'team-2' }],
          },
        },
      },
    })
    await secondRequest

    expect(store.loading).toBe(true)

    first.resolve({
      data: {
        data: {
          _id: 'compiled-1',
          payload: {
            compiled_team_results: [{ id: 'team-1' }],
          },
        },
      },
    })
    const firstResult = await firstRequest

    expect(firstResult).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.compiled).toEqual({
      _id: 'compiled-2',
      compiled_team_results: [{ id: 'team-2' }],
    })
  })

  it('does not let a stale fetchLatest overwrite a saved compiled snapshot', async () => {
    const store = useCompiledStore()
    const deferredFetch = createDeferred<any>()

    mockedApi.get.mockImplementationOnce(() => deferredFetch.promise)
    mockedApi.post.mockResolvedValueOnce({
      data: {
        data: {
          _id: 'compiled-saved',
          payload: {
            compiled_team_results: [{ id: 'team-saved' }],
          },
        },
      },
    })

    const fetchPromise = store.fetchLatest('tournament-1')
    await store.saveCompiled('tournament-1')

    deferredFetch.resolve({
      data: {
        data: {
          _id: 'compiled-stale',
          payload: {
            compiled_team_results: [{ id: 'team-stale' }],
          },
        },
      },
    })
    await fetchPromise

    expect(store.compiled).toEqual({
      _id: 'compiled-saved',
      compiled_team_results: [{ id: 'team-saved' }],
    })
  })

  it('does not let a stale preview repopulate previewState after save', async () => {
    const store = useCompiledStore()
    const deferredPreview = createDeferred<any>()

    mockedApi.post
      .mockImplementationOnce(() => deferredPreview.promise)
      .mockResolvedValueOnce({
        data: {
          data: {
            _id: 'compiled-saved',
            payload: {
              compiled_team_results: [{ id: 'team-saved' }],
            },
          },
        },
      })

    const previewPromise = store.runPreview('tournament-1', { source: 'submissions' })
    await store.saveCompiled('tournament-1')

    deferredPreview.resolve({
      data: {
        data: {
          preview: {
            compile_source: 'submissions',
            compiled_team_results: [{ id: 'team-stale' }],
          },
          preview_signature: 'sig-stale',
          revision: 'rev-stale',
        },
      },
    })
    await previewPromise

    expect(store.compiled).toEqual({
      _id: 'compiled-saved',
      compiled_team_results: [{ id: 'team-saved' }],
    })
    expect(store.previewState).toBeNull()
  })
})
