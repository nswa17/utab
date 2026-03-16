import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/utils/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

import { api } from '@/utils/api'
import { useStylesStore } from './styles'

type MockedApi = {
  get: ReturnType<typeof vi.fn>
}

const mockedApi = api as unknown as MockedApi

describe('styles store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedApi.get.mockReset()
  })

  it('keeps only the latest styles response when requests resolve out of order', async () => {
    const store = useStylesStore()
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

    const firstRequest = store.fetchStyles()
    const secondRequest = store.fetchStyles()

    resolveSecond({
      data: {
        data: [
          { id: 4, name: 'Open' },
          { id: 3, name: 'PDA3' },
        ],
      },
    })
    await secondRequest

    resolveFirst({
      data: {
        data: [{ id: 1, name: 'Stale' }],
      },
    })
    const staleResult = await firstRequest

    expect(staleResult).toEqual([])
    expect(store.styles).toEqual([
      { id: 3, name: 'PDA3' },
      { id: 4, name: 'Open' },
    ])
  })

  it('keeps loading true until overlapping style fetches finish', async () => {
    const store = useStylesStore()
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

    const firstRequest = store.fetchStyles()
    const secondRequest = store.fetchStyles()

    expect(store.loading).toBe(true)

    resolveSecond({ data: { data: [] } })
    await secondRequest
    expect(store.loading).toBe(true)

    resolveFirst({ data: { data: [] } })
    await firstRequest
    expect(store.loading).toBe(false)
  })
})
