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

  it('guards setup saves against late completion from a previous tournament', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('const currentTournamentId = String(tournament.value._id)')
    expect(source).toContain('if (tournamentId.value !== currentTournamentId) return false')
    expect(source).toContain('if (tournamentId.value !== currentTournamentId) return')
    expect(source).toContain('tournamentId: currentTournamentId')
    expect(source).toContain('if (tournamentId.value === currentTournamentId) {')
    expect(source).toContain('setupRoundBreakUpdating.value = false')
  })

  it('guards setup page refresh before applying tournament form state', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('createLatestRequestGate')
    expect(source).toContain('const refreshGate = createLatestRequestGate()')
    expect(source).toContain('if (!refreshGate.isCurrent(token)) return')
    expect(source).toContain('applyTournamentForm()')
    expect(source).toContain('sectionLoading.value = foregroundRefreshCount > 0')
  })

  it('guards rounds page refresh and loading state across overlapping fetches', () => {
    const source = load('src/views/admin/AdminTournamentRounds.vue')
    expect(source).toContain('createLatestRequestGate')
    expect(source).toContain('const refreshGate = createLatestRequestGate()')
    expect(source).toContain('if (!refreshGate.isCurrent(token)) return')
    expect(source).toContain('sectionLoading.value = foregroundRefreshCount > 0')
  })
})
