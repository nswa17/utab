import { describe, expect, it } from 'vitest'
import {
  sanitizeDrawForPublic,
  sanitizeRoundForPublic,
  sanitizeTournamentForPublic,
} from '../src/services/response-sanitizer.js'

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

describe('sanitizeTournamentForPublic', () => {
  it('exposes only participant-facing style overrides', () => {
    const sanitized = sanitizeTournamentForPublic({
      _id: 't1',
      name: 'Open',
      style: 1,
      options: {
        privateFlag: 'hidden',
        style: {
          team_num: 4,
          score_weights: [1, 1, 1, 1],
          privateStyleFlag: 'hidden',
        },
      },
    }) as any

    expect(sanitized.options).toEqual({
      style: { team_num: 4, score_weights: [1, 1, 1, 1] },
    })
    expect(sanitized.privateFlag).toBeUndefined()
  })
})

describe('sanitizeRoundForPublic', () => {
  it('keeps draw submission opt-in while exposing explicit enablement', () => {
    const defaultRound = sanitizeRoundForPublic({
      tournamentId: 't1',
      round: 1,
      userDefinedData: {},
    }) as any
    const drawEnabledRound = sanitizeRoundForPublic({
      tournamentId: 't1',
      round: 2,
      userDefinedData: { allow_low_tie_win: true },
    }) as any

    expect(defaultRound.userDefinedData.allow_low_tie_win).toBe(false)
    expect(drawEnabledRound.userDefinedData.allow_low_tie_win).toBe(true)
  })
})
