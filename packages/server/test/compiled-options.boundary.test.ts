import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COMPILE_OPTIONS,
  normalizeCompileOptions,
} from '../src/types/compiled-options.js'

describe('compiled option boundaries', () => {
  it('keeps tie_points within [0, 1] even for unvalidated internal inputs', () => {
    expect(normalizeCompileOptions({ tie_points: 0 }).tie_points).toBe(0)
    expect(normalizeCompileOptions({ tie_points: 0.5 }).tie_points).toBe(0.5)
    expect(normalizeCompileOptions({ tie_points: 1 }).tie_points).toBe(1)
    expect(normalizeCompileOptions({ tie_points: -0.01 }).tie_points).toBe(
      DEFAULT_COMPILE_OPTIONS.tie_points
    )
    expect(normalizeCompileOptions({ tie_points: 1.01 }).tie_points).toBe(
      DEFAULT_COMPILE_OPTIONS.tie_points
    )
  })

  it('does not trust an out-of-range fallback tie_points value', () => {
    const invalidFallback = {
      ...DEFAULT_COMPILE_OPTIONS,
      tie_points: 2,
    }
    expect(normalizeCompileOptions(undefined, invalidFallback).tie_points).toBe(
      DEFAULT_COMPILE_OPTIONS.tie_points
    )
  })
})
