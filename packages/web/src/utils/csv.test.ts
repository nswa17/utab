import { describe, expect, it } from 'vitest'
import { escapeCsvCell } from './csv'

describe('escapeCsvCell', () => {
  it.each(['=1+1', '+SUM(A1:A2)', '-cmd|calc', '@SUM(A1:A2)', '\t=1+1'])(
    'neutralizes spreadsheet formulas in %s',
    (value) => {
      expect(escapeCsvCell(value)).toContain("'")
      expect(escapeCsvCell(value)).not.toBe(value)
    }
  )

  it('keeps signed numeric cells usable as numbers', () => {
    expect(escapeCsvCell('-12.5')).toBe('-12.5')
    expect(escapeCsvCell('+12.5e-2')).toBe('+12.5e-2')
  })

  it('still applies CSV quoting after formula neutralization', () => {
    expect(escapeCsvCell('=1,2')).toBe('"\'=1,2"')
    expect(escapeCsvCell('plain "text"')).toBe('"plain ""text"""')
  })
})
