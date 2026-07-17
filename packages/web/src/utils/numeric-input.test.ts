import { describe, expect, it } from 'vitest'
import { numericInputText } from './numeric-input'

describe('numericInputText', () => {
  it('normalizes values emitted by number inputs without throwing', () => {
    expect(numericInputText(72.5)).toBe('72.5')
    expect(numericInputText(' 73 ')).toBe('73')
    expect(numericInputText(null)).toBe('')
    expect(numericInputText(Number.NaN)).toBe('')
  })
})
