import { describe, expect, it } from 'vitest'
import {
  drawTeamGroupKey,
  drawTeamIds,
  drawTeamPositionColumns,
  normalizeDrawTeams,
  serializeDrawTeams,
  setDrawTeamId,
} from './draw-teams'

describe('draw team positions', () => {
  it('normalizes and serializes four-team arrays without losing closing teams', () => {
    const teams = normalizeDrawTeams(['og-1', 'oo-1', 'cg-1', 'co-1'], 4)
    expect(teams).toMatchObject({
      gov: 'og-1',
      opp: 'oo-1',
      og: 'og-1',
      oo: 'oo-1',
      cg: 'cg-1',
      co: 'co-1',
    })
    expect(drawTeamIds(teams, 4)).toEqual(['og-1', 'oo-1', 'cg-1', 'co-1'])
    expect(serializeDrawTeams(teams, 4)).toEqual({
      og: 'og-1',
      oo: 'oo-1',
      cg: 'cg-1',
      co: 'co-1',
    })
  })

  it('keeps opening aliases synchronized when a BP slot is edited', () => {
    const teams = normalizeDrawTeams({ og: 'a', oo: 'b', cg: 'c', co: 'd' }, 4)
    setDrawTeamId(teams, 'og', 'next-a', 4)
    setDrawTeamId(teams, 'oo', 'next-b', 4)
    expect(teams.gov).toBe('next-a')
    expect(teams.opp).toBe('next-b')
    expect(drawTeamGroupKey(teams, 4)).toBe(['next-a', 'next-b', 'c', 'd'].sort().join('::'))
  })

  it('uses style labels for OG/OO/CG/CO columns', () => {
    const columns = drawTeamPositionColumns(
      {
        id: 1,
        name: 'BP',
        team_num: 4,
        side_labels_short: {
          og: 'Opening Gov',
          oo: 'Opening Opp',
          cg: 'Closing Gov',
          co: 'Closing Opp',
        },
      },
      4
    )
    expect(columns).toEqual([
      { key: 'og', label: 'Opening Gov' },
      { key: 'oo', label: 'Opening Opp' },
      { key: 'cg', label: 'Closing Gov' },
      { key: 'co', label: 'Closing Opp' },
    ])
  })
})
