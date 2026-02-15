import { describe, expect, it } from 'vitest'
import { buildAwardExportCsv, buildParticipantExportCsv } from './certificate-export'

describe('certificate export utility', () => {
  it('builds award export CSV with ordering and escaping', () => {
    const csv = buildAwardExportCsv([
      {
        category: 'Speakers',
        ranking: 2,
        place: '2nd',
        id: 'spk-b',
        name: 'Speaker B',
        team: 'Team "B"',
        metric_name: 'average',
        metric_value: 74.2,
      },
      {
        category: 'Speakers',
        ranking: 1,
        place: '1st',
        id: 'spk-a',
        name: 'Speaker A',
        team: 'Team A',
        metric_name: 'average',
        metric_value: 75.5,
      },
      {
        category: 'Teams',
        ranking: 1,
        place: '1st',
        id: 'team-a',
        name: 'Team A',
        metric_name: 'win',
        metric_value: 5,
      },
    ])

    const lines = csv.split('\n')
    expect(lines[0]).toBe('category,ranking,place,id,name,team,metric_name,metric_value')
    expect(lines[1]).toContain('Speakers,1,1st,spk-a')
    expect(lines[2]).toContain('"Team ""B"""')
    expect(lines[3]).toContain('Teams,1,1st,team-a')
  })

  it('builds participant export CSV with institution join', () => {
    const csv = buildParticipantExportCsv([
      {
        participant_type: 'speaker',
        id: 'spk-a',
        name: 'Speaker A',
        team: 'Team A',
      },
      {
        participant_type: 'adjudicator',
        id: 'adj-a',
        name: 'Judge A',
        institutions: ['Inst A', 'Inst B'],
        active: true,
      },
      {
        participant_type: 'team',
        id: 'team-a',
        name: 'Team A',
        institutions: ['Inst A'],
      },
    ])

    const lines = csv.split('\n')
    expect(lines[0]).toBe('participant_type,id,name,team,institutions,active')
    expect(lines.some((line) => line.includes('adjudicator,adj-a,Judge A,,Inst A|Inst B,true'))).toBe(
      true
    )
    expect(lines.some((line) => line.includes('team,team-a,Team A,,Inst A,'))).toBe(true)
    expect(lines.some((line) => line.includes('speaker,spk-a,Speaker A,Team A,,'))).toBe(true)
  })
})
