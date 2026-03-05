import { describe, expect, it } from 'vitest'
import { strictEnvBoolean } from '../src/config/env-parsers.js'

describe('strictEnvBoolean', () => {
  it('parses string booleans safely', () => {
    expect(strictEnvBoolean.parse('true')).toBe(true)
    expect(strictEnvBoolean.parse('false')).toBe(false)
    expect(strictEnvBoolean.parse('1')).toBe(true)
    expect(strictEnvBoolean.parse('0')).toBe(false)
    expect(strictEnvBoolean.parse(' FALSE ')).toBe(false)
  })

  it('supports defaults without coercing invalid strings', () => {
    const withDefault = strictEnvBoolean.default(true)
    expect(withDefault.parse(undefined)).toBe(true)
    expect(withDefault.parse('false')).toBe(false)
    expect(() => withDefault.parse('not-a-boolean')).toThrow()
  })
})
