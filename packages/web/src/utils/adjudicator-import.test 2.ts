import { describe, expect, it } from 'vitest'
import {
  applyAdjudicatorImportEntries,
  parseAdjudicatorImportText,
  type DrawAllocationRowLike,
  type NamedEntity,
} from './adjudicator-import'

const teams: NamedEntity[] = [
  { _id: 'team-a', name: 'Team A' },
  { _id: 'team-b', name: 'Team B' },
  { _id: 'team-c', name: 'Team C' },
  { _id: 'team-d', name: 'Team D' },
]

const adjudicators: NamedEntity[] = [
  { _id: 'adj-a', name: 'Judge A' },
  { _id: 'adj-b', name: 'Judge B' },
  { _id: 'adj-c', name: 'Judge C' },
  { _id: 'adj-d', name: 'Judge D' },
]

function baseAllocation(): DrawAllocationRowLike[] {
  return [
    {
      teams: { gov: 'team-a', opp: 'team-b' },
      chairs: [],
      panels: [],
      trainees: [],
    },
    {
      teams: { gov: 'team-c', opp: 'team-d' },
      chairs: ['adj-d'],
      panels: [],
      trainees: [],
    },
  ]
}

describe('adjudicator import parser', () => {
  it('parses no-header match-based CSV rows', () => {
    const parsed = parseAdjudicatorImportText('1,Judge A,Judge B|Judge C,\n2,Judge D,,Judge B')
    expect(parsed.errors).toEqual([])
    expect(parsed.entries).toHaveLength(2)
    expect(parsed.entries[0]).toMatchObject({
      matchIndex: 1,
      chairTokens: ['Judge A'],
      panelTokens: ['Judge B', 'Judge C'],
      traineeTokens: [],
    })
    expect(parsed.entries[1]).toMatchObject({
      matchIndex: 2,
      chairTokens: ['Judge D'],
      panelTokens: [],
      traineeTokens: ['Judge B'],
    })
  })

  it('parses header-based gov/opp rows', () => {
    const parsed = parseAdjudicatorImportText(
      ['gov,opp,chairs,panels,trainees', 'Team A,Team B,Judge A,Judge B,Judge C'].join('\n')
    )
    expect(parsed.errors).toEqual([])
    expect(parsed.entries).toHaveLength(1)
    expect(parsed.entries[0]).toMatchObject({
      matchIndex: undefined,
      govTeamToken: 'Team A',
      oppTeamToken: 'Team B',
      chairTokens: ['Judge A'],
      panelTokens: ['Judge B'],
      traineeTokens: ['Judge C'],
    })
  })

  it('reports parse errors when row locator is missing', () => {
    const parsed = parseAdjudicatorImportText('Judge A,Judge B')
    expect(parsed.entries).toHaveLength(0)
    expect(parsed.errors[0]).toContain('match は 1 以上')
  })
})

describe('adjudicator import apply', () => {
  it('replaces row assignments by match index', () => {
    const parsed = parseAdjudicatorImportText('1,Judge A,Judge B|Judge C,Judge D')
    const result = applyAdjudicatorImportEntries({
      allocation: baseAllocation(),
      entries: parsed.entries,
      teams,
      adjudicators,
      mode: 'replace',
    })
    expect(result.errors).toEqual([])
    expect(result.appliedRows).toBe(1)
    expect(result.allocation[0].chairs).toEqual(['adj-a'])
    expect(result.allocation[0].panels).toEqual(['adj-b', 'adj-c'])
    expect(result.allocation[0].trainees).toEqual(['adj-d'])
  })

  it('supports append mode without duplicating existing assignments', () => {
    const parsed = parseAdjudicatorImportText('2,Judge D|Judge A,Judge B,')
    const result = applyAdjudicatorImportEntries({
      allocation: baseAllocation(),
      entries: parsed.entries,
      teams,
      adjudicators,
      mode: 'append',
    })
    expect(result.errors).toEqual([])
    expect(result.allocation[1].chairs).toEqual(['adj-d', 'adj-a'])
    expect(result.allocation[1].panels).toEqual(['adj-b'])
  })

  it('resolves row by gov/opp team names', () => {
    const parsed = parseAdjudicatorImportText(
      ['gov,opp,chairs,panels,trainees', 'Team C,Team D,Judge B,,'].join('\n')
    )
    const result = applyAdjudicatorImportEntries({
      allocation: baseAllocation(),
      entries: parsed.entries,
      teams,
      adjudicators,
      mode: 'replace',
    })
    expect(result.errors).toEqual([])
    expect(result.allocation[1].chairs).toEqual(['adj-b'])
  })

  it('returns errors for unknown adjudicators and leaves allocation unchanged', () => {
    const allocation = baseAllocation()
    const parsed = parseAdjudicatorImportText('1,Unknown Judge,,')
    const result = applyAdjudicatorImportEntries({
      allocation,
      entries: parsed.entries,
      teams,
      adjudicators,
      mode: 'replace',
    })
    expect(result.errors[0]).toContain('見つかりません')
    expect(result.allocation).toEqual(allocation)
  })

  it('returns errors when same adjudicator is assigned to multiple roles in one row', () => {
    const parsed = parseAdjudicatorImportText('1,Judge A,Judge A,')
    const result = applyAdjudicatorImportEntries({
      allocation: baseAllocation(),
      entries: parsed.entries,
      teams,
      adjudicators,
      mode: 'replace',
    })
    expect(result.errors[0]).toContain('複数ロール')
  })
})
