import { describe, expect, it } from 'vitest'
import { escapeCsvCell } from '../src/services/csv.service.js'

describe('escapeCsvCell', () => {
  it('neutralizes formula-prefixed fields while preserving signed numbers', () => {
    expect(escapeCsvCell('=HYPERLINK("https://example.test")')).toBe(
      '"\'=HYPERLINK(""https://example.test"")"'
    )
    expect(escapeCsvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)")
    expect(escapeCsvCell('-42.5')).toBe('-42.5')
  })

  it('quotes commas and embedded quotes after neutralization', () => {
    expect(escapeCsvCell('=1,2')).toBe('"\'=1,2"')
    expect(escapeCsvCell('a"b')).toBe('"a""b"')
  })
})
