import { describe, expect, it } from 'vitest'
import { buildTournamentExportFilename, sanitizeExportFilenameSegment } from './export-filename'

describe('export filename helpers', () => {
  it('includes the tournament name and id in a readable CSV filename', () => {
    expect(buildTournamentExportFilename('東海交流大会2026', '6a59a605bb5e652498cd6b05', 'team_results.csv')).toBe(
      '東海交流大会2026_6a59a605bb5e652498cd6b05_team_results.csv'
    )
  })

  it('removes characters that are unsafe in desktop filenames', () => {
    expect(sanitizeExportFilenameSegment(' 夏/合宿:大会? 2026 ')).toBe('夏-合宿-大会-2026')
    expect(buildTournamentExportFilename('夏/合宿', 'id:1', 'participants.csv')).toBe(
      '夏-合宿_id-1_participants.csv'
    )
  })

  it('uses a stable fallback when tournament metadata is unavailable', () => {
    expect(buildTournamentExportFilename('', '', 'all_round_results.csv')).toBe('utab_all_round_results.csv')
  })
})
