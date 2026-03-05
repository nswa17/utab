import { describe, expect, it } from 'vitest'
import { buildEntityImportPayload } from './entity-csv-import'

const tournamentId = 'tournament-1'

const baseTeams = [
  { _id: 'team-a', name: 'Team A' },
  { _id: 'team-b', name: 'Team B' },
]

const baseInstitutions = [{ _id: 'inst-a', name: 'Institution A' }]
const baseSpeakers = [
  { _id: 'speaker-a', name: 'Alice' },
  { _id: 'speaker-b', name: 'Bob' },
]

function build(options: {
  type: 'teams' | 'adjudicators' | 'venues' | 'speakers' | 'institutions'
  text: string
  roundNumbers?: number[]
  existingEntities?: Array<{ _id: string; name: string }>
}) {
  const defaultExistingEntities =
    options.type === 'teams'
      ? baseTeams
      : options.type === 'speakers'
        ? baseSpeakers
        : options.type === 'institutions'
          ? baseInstitutions
          : []
  return buildEntityImportPayload({
    type: options.type,
    text: options.text,
    tournamentId,
    roundNumbers: options.roundNumbers ?? [1, 2, 3],
    teams: baseTeams,
    adjudicators: [],
    venues: [],
    speakers: baseSpeakers,
    institutions: baseInstitutions,
    existingEntities: options.existingEntities ?? defaultExistingEntities,
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
        'name,preev,available,conflicts,conflict_teams,available_r1,availability_r2,conflict_r2',
        'Judge A,2,false,Institution A,Team A,1,,Team B',
      ].join('\n'),
    })

    expect(result.errors).toEqual([])
    expect(result.payload).toHaveLength(1)
    const adjudicator = result.payload[0] as any
    expect(adjudicator.name).toBe('Judge A')
    expect(adjudicator.preev).toBe(2)
    expect(adjudicator.template).toEqual({
      available: false,
      conflicts: ['inst-a'],
      conflict_teams: ['team-a'],
    })
    expect(adjudicator.details).toEqual([
      { r: 1, available: true, conflicts: ['inst-a'], conflict_teams: ['team-a'] },
      { r: 2, available: false, conflicts: ['inst-a'], conflict_teams: ['team-a', 'team-b'] },
      { r: 3, available: false, conflicts: ['inst-a'], conflict_teams: ['team-a'] },
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
    expect(venue.template).toEqual({ available: false, priority: 2 })
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
    expect(team.template).toEqual({
      available: true,
      conflicts: ['inst-a'],
      speakers: ['speaker-a', 'speaker-b'],
    })
    expect(team.details).toEqual([
      { r: 1, available: true, conflicts: ['inst-a'], speakers: ['speaker-a', 'speaker-b'] },
      { r: 2, available: false, conflicts: ['inst-a'], speakers: ['speaker-a', 'speaker-b'] },
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

  it('returns an error when header row is missing', () => {
    const result = build({
      type: 'venues',
      text: 'Room 101,2,false',
      roundNumbers: [1, 2],
    })

    expect(result.payload).toEqual([])
    expect(result.errors[0]).toContain('1行目にCSVヘッダーが必要です')
  })

  it('returns errors when teams csv includes unknown institution or speaker names', () => {
    const result = build({
      type: 'teams',
      text: ['name,institution,speakers', 'Team New,Unknown Institution,Alice|Unknown Speaker'].join(
        '\n'
      ),
      roundNumbers: [1],
    })

    expect(result.warnings.some((message) => message.includes('institution'))).toBe(true)
    expect(result.warnings.some((message) => message.includes('speakers'))).toBe(true)
    expect(result.missingEntityWarnings.some((warning) => warning.kind === 'institution')).toBe(true)
    expect(result.missingEntityWarnings.some((warning) => warning.kind === 'speaker')).toBe(true)
  })

  it('returns errors when adjudicator csv includes unknown conflict names', () => {
    const result = build({
      type: 'adjudicators',
      text: [
        'name,preev,available,conflicts,conflict_teams,conflicts_r2',
        'Judge A,2,true,Unknown Institution,Unknown Team,Another Unknown Team',
      ].join('\n'),
      roundNumbers: [1, 2],
    })

    expect(result.warnings.some((message) => message.includes('conflicts'))).toBe(true)
    expect(result.warnings.some((message) => message.includes('conflict_teams'))).toBe(true)
    expect(result.warnings.some((message) => message.includes('conflicts_r2'))).toBe(true)
    expect(result.missingEntityWarnings.some((warning) => warning.kind === 'institution')).toBe(true)
    expect(result.missingEntityWarnings.some((warning) => warning.kind === 'team')).toBe(true)
  })

  it('returns duplicate warnings when csv includes an existing team name', () => {
    const result = build({
      type: 'teams',
      text: ['name,institution,speakers', 'Team A,Institution A,Alice|Bob'].join('\n'),
      roundNumbers: [1],
    })

    expect(result.duplicateNameWarnings).toEqual([
      { line: 2, name: 'Team A', type: 'teams', source: 'existing' },
    ])
    expect(result.warnings.some((message) => message.includes('既存のチーム名と重複'))).toBe(true)
  })

  it('returns duplicate warnings when csv repeats the same speaker name', () => {
    const result = build({
      type: 'speakers',
      text: ['name', 'New Speaker', 'New Speaker'].join('\n'),
      existingEntities: [],
    })

    expect(result.duplicateNameWarnings).toEqual([
      { line: 3, name: 'New Speaker', type: 'speakers', source: 'csv', firstLine: 2 },
    ])
    expect(result.warnings.some((message) => message.includes('CSV内でスピーカー名が重複'))).toBe(
      true
    )
  })
})
