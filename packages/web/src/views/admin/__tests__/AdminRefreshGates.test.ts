import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function load(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Admin refresh gates', () => {
  it('guards submissions page refresh against stale route changes', () => {
    const source = load('src/views/admin/AdminTournamentSubmissions.vue')
    expect(source).toContain('createLatestRequestGate')
    expect(source).toContain('const refreshGate = createLatestRequestGate()')
    expect(source).toContain('if (!refreshGate.isCurrent(token)) return')
    expect(source).toContain('sectionLoading.value = foregroundRefreshCount > 0')
  })

  it('guards setup page refresh before applying tournament form state', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('createLatestRequestGate')
    expect(source).toContain('const refreshGate = createLatestRequestGate()')
    expect(source).toContain('if (!refreshGate.isCurrent(token)) return')
    expect(source).toContain('applyTournamentForm()')
    expect(source).toContain('sectionLoading.value = foregroundRefreshCount > 0')
  })

  it('ignores stale setup-setting save completions after tournament navigation', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('const requestTournamentId = String(targetTournament._id)')
    expect(source).toContain('if (tournamentId.value !== requestTournamentId) return false')
    expect(source).toContain('if (tournamentId.value !== requestTournamentId) return')
    expect(source).toContain('normalizeTournamentBreakConfig(updated.user_defined_data?.break)')
    expect(source).toContain(
      'normalizeTournamentTeamRankingConfig(updated.user_defined_data?.team_ranking_priority)'
    )
    expect(source).toContain(
      'normalizeTournamentAdjudicatorRankingConfig(\n      updated.user_defined_data?.adjudicator_ranking_priority'
    )
  })

  it('guards rounds page refresh and loading state across overlapping fetches', () => {
    const source = load('src/views/admin/AdminTournamentRounds.vue')
    expect(source).toContain('createLatestRequestGate')
    expect(source).toContain('const refreshGate = createLatestRequestGate()')
    expect(source).toContain('if (!refreshGate.isCurrent(token)) return')
    expect(source).toContain('sectionLoading.value = foregroundRefreshCount > 0')
  })
})
