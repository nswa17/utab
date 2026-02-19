import { describe, expect, it } from 'vitest'
import { sanitizeDrawForPublic } from '../src/services/response-sanitizer.js'

describe('sanitizeDrawForPublic', () => {
  it('keeps gov/opp teams when draw is opened', () => {
    const sanitized = sanitizeDrawForPublic({
      tournamentId: 't1',
      round: 1,
      drawOpened: true,
      allocationOpened: false,
      allocation: [
        {
          venue: 'v1',
          teams: { gov: 'team-gov', opp: 'team-opp' },
          chairs: ['adj-1'],
        },
      ],
    }) as any

    expect(sanitized.allocation).toHaveLength(1)
    expect(sanitized.allocation[0].teams.gov).toBe('team-gov')
    expect(sanitized.allocation[0].teams.opp).toBe('team-opp')
    expect(sanitized.allocation[0].chairs).toEqual([])
  })

  it('normalizes 4-team arrays and preserves labels for opened draws', () => {
    const sanitized = sanitizeDrawForPublic({
      tournamentId: 't1',
      round: 2,
      drawOpened: true,
      allocationOpened: true,
      allocation: [
        {
          venue: 'v2',
          teams: ['og-team', 'oo-team', 'cg-team', 'co-team'],
          chairs: ['adj-1'],
          panels: ['adj-2'],
          trainees: ['adj-3'],
        },
      ],
    }) as any

    expect(sanitized.allocation).toHaveLength(1)
    expect(sanitized.allocation[0].teams).toEqual({
      gov: 'og-team',
      opp: 'oo-team',
      og: 'og-team',
      oo: 'oo-team',
      cg: 'cg-team',
      co: 'co-team',
    })
    expect(sanitized.allocation[0].chairs).toEqual(['adj-1'])
    expect(sanitized.allocation[0].panels).toEqual(['adj-2'])
    expect(sanitized.allocation[0].trainees).toEqual(['adj-3'])
  })

  it('masks team labels when draw is not opened', () => {
    const sanitized = sanitizeDrawForPublic({
      tournamentId: 't1',
      round: 3,
      drawOpened: false,
      allocationOpened: true,
      allocation: [
        {
          teams: ['og-team', 'oo-team', 'cg-team', 'co-team'],
          chairs: ['adj-1'],
        },
      ],
    }) as any

    expect(sanitized.allocation).toHaveLength(1)
    expect(sanitized.allocation[0].teams).toEqual({
      gov: '',
      opp: '',
      og: '',
      oo: '',
      cg: '',
      co: '',
    })
    expect(sanitized.allocation[0].chairs).toEqual(['adj-1'])
  })

  it('returns an empty allocation when both draw and allocation are closed', () => {
    const sanitized = sanitizeDrawForPublic({
      tournamentId: 't1',
      round: 4,
      drawOpened: false,
      allocationOpened: false,
      allocation: [
        {
          teams: { gov: 'team-gov', opp: 'team-opp' },
          chairs: ['adj-1'],
        },
      ],
    }) as any

    expect(sanitized.allocation).toEqual([])
  })
})
