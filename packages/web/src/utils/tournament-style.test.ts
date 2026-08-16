import { describe, expect, it } from 'vitest'
import type { Style } from '@/types/style'
import type { Tournament } from '@/types/tournament'
import { normalizeTournamentTeamNum, resolveTournamentStyle } from './tournament-style'

const baseStyle: Style = {
  id: 1,
  name: 'Base',
  team_num: 2,
  score_weights: [1, 1, 1],
  range: [{ from: 70, to: 80 }],
  roles: { gov: [{ order: 1 }], opp: [{ order: 1 }] },
}

function tournament(style: Record<string, unknown>): Tournament {
  return {
    _id: 't1',
    name: 'Open',
    style: 1,
    options: { style },
  }
}

describe('resolveTournamentStyle', () => {
  it('uses tournament scoring overrides and clears incompatible base layouts', () => {
    const resolved = resolveTournamentStyle(
      baseStyle,
      tournament({ team_num: 4, score_weights: [1, 1, 1, 1] })
    )

    expect(resolved?.team_num).toBe(4)
    expect(resolved?.score_weights).toEqual([1, 1, 1, 1])
    expect(resolved?.roles).toBeUndefined()
    expect(resolved?.range).toEqual([])
  })

  it('keeps explicit role and range overrides', () => {
    const roles = { gov: [{ order: 1 }, { order: 2 }], opp: [{ order: 1 }, { order: 2 }] }
    const range = [{ from: 60, to: 90 }]
    const resolved = resolveTournamentStyle(
      baseStyle,
      tournament({ score_weights: [1, 1], roles, range })
    )

    expect(resolved?.roles).toEqual(roles)
    expect(resolved?.range).toEqual(range)
  })
})

describe('normalizeTournamentTeamNum', () => {
  it('matches the server fallback for malformed legacy values', () => {
    expect(normalizeTournamentTeamNum(4)).toBe(4)
    expect(normalizeTournamentTeamNum('4')).toBe(4)
    expect(normalizeTournamentTeamNum(null)).toBe(2)
    expect(normalizeTournamentTeamNum(1)).toBe(2)
  })
})
