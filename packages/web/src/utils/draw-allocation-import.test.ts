import { describe, expect, it } from 'vitest'
import {
  applyDrawAllocationImportEntries,
  parseDrawAllocationImportText,
  type DrawAllocationRowLike,
  type NamedEntity,
} from './draw-allocation-import'

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
]

const venues: NamedEntity[] = [
  { _id: 'venue-1', name: 'Room 1' },
  { _id: 'venue-2', name: 'Room 2' },
]

function baseAllocation(): DrawAllocationRowLike[] {
  return [
    {
      venue: 'venue-2',
      teams: { gov: 'team-a', opp: 'team-b' },
      chairs: ['adj-c'],
      panels: ['adj-b'],
      trainees: [],
    },
    {
      venue: '',
      teams: { gov: 'team-c', opp: 'team-d' },
      chairs: [],
      panels: [],
      trainees: [],
    },
  ]
}

describe('draw allocation import', () => {
  it('updates only non-empty cells and keeps blank cells unchanged', () => {
    const parsed = parseDrawAllocationImportText(
      ['match,venue,gov,opp,chairs,panels,trainees', '1,Room 1,Team C,,Judge A,,'].join('\n')
    )
    expect(parsed.errors).toEqual([])
    const result = applyDrawAllocationImportEntries({
      allocation: baseAllocation(),
      entries: parsed.entries,
      teams,
      adjudicators,
      venues,
    })
    expect(result.errors).toEqual([])
    expect(result.appliedRows).toBe(1)
    expect(result.allocation[0]).toMatchObject({
      venue: 'venue-1',
      teams: { gov: 'team-c', opp: 'team-b' },
      chairs: ['adj-a'],
      panels: ['adj-b'],
      trainees: [],
    })
  })

  it('returns helpful error when entity is missing', () => {
    const parsed = parseDrawAllocationImportText('match,venue,chairs\n1,Unknown Room,Unknown Judge')
    const allocation = baseAllocation()
    const result = applyDrawAllocationImportEntries({
      allocation,
      entries: parsed.entries,
      teams,
      adjudicators,
      venues,
    })
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('大会データ管理で先に取り込んでください')
    expect(result.allocation).toEqual(allocation)
  })

  it('matches row by gov/opp when match column is omitted', () => {
    const parsed = parseDrawAllocationImportText('gov,opp,chairs\nTeam C,Team D,Judge B')
    expect(parsed.errors).toEqual([])
    const result = applyDrawAllocationImportEntries({
      allocation: baseAllocation(),
      entries: parsed.entries,
      teams,
      adjudicators,
      venues,
    })
    expect(result.errors).toEqual([])
    expect(result.allocation[1].chairs).toEqual(['adj-b'])
  })
})
