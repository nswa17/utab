import { describe, it, expect } from 'vitest'
import {
  findOne,
  accessDetail,
  findAndAccessDetail,
  filterAvailable,
  checkDetail,
} from '../src/general/tools.js'
import { DetailNotDefined } from '../src/general/errors.js'

describe('general/tools', () => {
  const entities = [
    { id: 1, details: [{ r: 1, available: true }] },
    { id: 2, details: [{ r: 1, available: false }] },
  ]

  it('finds entities and details', () => {
    expect(findOne(entities, 1).id).toBe(1)
    expect(accessDetail(entities[0], 1)).toEqual({ r: 1, available: true })
    expect(findAndAccessDetail(entities, 2, 1)).toEqual({ r: 1, available: false })
  })

  it('filters availability', () => {
    expect(filterAvailable(entities, 1).map((e) => e.id)).toEqual([1])
  })

  it('throws when detail missing', () => {
    expect(() => checkDetail(entities, 2)).toThrow(DetailNotDefined)
  })

  it('throws when entity is not found', () => {
    expect(() => findOne(entities, 999)).toThrow(DetailNotDefined)
  })
})
