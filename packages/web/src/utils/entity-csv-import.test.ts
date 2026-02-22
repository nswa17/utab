import { describe, expect, it } from 'vitest'
import { buildEntityImportPayload } from './entity-csv-import'

const tournamentId = 'tournament-1'

const baseTeams = [
  { _id: 'team-a', name: 'Team A' },
  { _id: 'team-b', name: 'Team B' },
]

const baseInstitutions = [{ _id: 'inst-a', name: 'Institution A' }]

function build(options: {
  type: 'teams' | 'adjudicators' | 'venues' | 'speakers' | 'institutions'
  text: string
  roundNumbers?: number[]
}) {
  return buildEntityImportPayload({
    type: options.type,
    text: options.text,
    tournamentId,
    roundNumbers: options.roundNumbers ?? [1, 2, 3],
    teams: baseTeams,
    institutions: baseInstitutions,
    institutionCategoryLabel: (value) => String(value ?? 'institution'),
    institutionPriorityValue: (value) => {
      const parsed = Number(value)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
    },
  })
}

describe('entity csv import', () => {
  it('parses adjudicator round availability/conflicts with mixed headers', () => {
    const result = build({
      type: 'adjudicators',
      text: [
        'name,strength,preev,active,available,conflicts,available_r1,availability_r2,conflict_r2',
        'Judge A,6,2,true,false,Team A,1,,Team B',
      ].join('\n'),
    })

    expect(result.errors).toEqual([])
    expect(result.payload).toHaveLength(1)
    const adjudicator = result.payload[0] as any
    expect(adjudicator.name).toBe('Judge A')
    expect(adjudicator.strength).toBe(6)
    expect(adjudicator.preev).toBe(2)
    expect(adjudicator.active).toBe(true)
    expect(adjudicator.details).toEqual([
      { r: 1, available: true, institutions: [], conflicts: ['team-a'] },
      { r: 2, available: false, institutions: [], conflicts: ['team-a', 'team-b'] },
      { r: 3, available: false, institutions: [], conflicts: ['team-a'] },
    ])
  })

  it('parses venue round availability headers', () => {
    const result = build({
      type: 'venues',
      text: ['name,priority,available,available_r2', 'Room 101,2,false,true'].join('\n'),
    })

    expect(result.errors).toEqual([])
    expect(result.payload).toHaveLength(1)
    const venue = result.payload[0] as any
    expect(venue.name).toBe('Room 101')
    expect(venue.userDefinedData).toEqual({ availableDefault: false })
    expect(venue.details).toEqual([
      { r: 1, available: false, priority: 2 },
      { r: 2, available: true, priority: 2 },
      { r: 3, available: false, priority: 2 },
    ])
  })

  it('supports team round availability import', () => {
    const result = build({
      type: 'teams',
      text: ['name,institution,speakers,available,available_r2', 'Team New,Institution A,Alice|Bob,true,false'].join('\n'),
      roundNumbers: [1, 2],
    })

    expect(result.errors).toEqual([])
    expect(result.payload).toHaveLength(1)
    const team = result.payload[0] as any
    expect(team.name).toBe('Team New')
    expect(team.speakers).toEqual([{ name: 'Alice' }, { name: 'Bob' }])
    expect(team.details).toEqual([
      { r: 1, available: true, institutions: ['inst-a'], speakers: [] },
      { r: 2, available: false, institutions: ['inst-a'], speakers: [] },
    ])
  })

  it('returns an error when base availability headers are ambiguous', () => {
    const result = build({
      type: 'venues',
      text: ['name,available,availability', 'Room 101,true,false'].join('\n'),
      roundNumbers: [1],
    })

    expect(result.errors.some((message) => message.includes('曖昧'))).toBe(true)
  })

  it('returns an error when round availability headers are duplicated', () => {
    const result = build({
      type: 'adjudicators',
      text: ['name,available_r1,availability_r1', 'Judge A,true,false'].join('\n'),
      roundNumbers: [1],
    })

    expect(result.errors.some((message) => message.includes('重複'))).toBe(true)
  })

  it('keeps no-header fallback behavior for venues', () => {
    const result = build({
      type: 'venues',
      text: 'Room 101,2,false',
      roundNumbers: [1, 2],
    })

    expect(result.errors).toEqual([])
    expect(result.payload).toHaveLength(1)
    expect((result.payload[0] as any).details).toEqual([
      { r: 1, available: false, priority: 2 },
      { r: 2, available: false, priority: 2 },
    ])
  })
})
