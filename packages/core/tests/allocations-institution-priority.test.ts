import { describe, expect, it } from 'vitest'
import {
  buildInstitutionPriorityHistogram,
  compareInstitutionPriorityHistograms,
  mergeInstitutionPriorityHistograms,
} from '../src/allocations/common/institution-priority.js'

describe('allocations/common/institution-priority', () => {
  it('builds histogram by normalized priority values', () => {
    const histogram = buildInstitutionPriorityHistogram([1, 1, 2, 3], [1, 2, 4], {
      1: 1,
      2: 2,
      3: 3,
    })
    expect(histogram).toEqual({ 1: 1, 2: 1 })
  })

  it('merges histograms by summing counts per priority', () => {
    const merged = mergeInstitutionPriorityHistograms({ 1: 1, 2: 2 }, { 2: 3, 3: 1 })
    expect(merged).toEqual({ 1: 1, 2: 5, 3: 1 })
  })

  it('compares conflicts lexicographically from lower numeric priority first', () => {
    expect(compareInstitutionPriorityHistograms({ 1: 1 }, { 2: 5 })).toBe(1)
    expect(compareInstitutionPriorityHistograms({ 1: 0, 2: 2 }, { 1: 0, 2: 3 })).toBe(-1)
    expect(compareInstitutionPriorityHistograms({ 1: 0, 2: 2 }, { 1: 0, 2: 2 })).toBe(0)
  })
})
