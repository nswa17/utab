import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function load(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('UserParticipantHome draw allocation rendering', () => {
  it('renders chair/panel/trainee adjudicators for audience draw lists', () => {
    const source = load('src/views/user/participant/UserParticipantHome.vue')
    expect(source).toContain("{{ $t('チェア:') }}")
    expect(source).toContain("{{ $t('パネル:') }}")
    expect(source).toContain("{{ $t('トレーニー:') }}")
    expect(source).toContain("{{ $t('パネル') }}")
    expect(source).toContain("{{ $t('トレーニー') }}")
    expect(source).toContain('adjudicatorNames(row.panels)')
    expect(source).toContain('adjudicatorNames(row.trainees)')
  })

  it('supports sorting by panel and trainee adjudicator names in table view', () => {
    const source = load('src/views/user/participant/UserParticipantHome.vue')
    expect(source).toContain("setAudienceTableSort(round.round, 'panel')")
    expect(source).toContain("setAudienceTableSort(round.round, 'trainee')")
    expect(source).toContain("type AudienceSortKey = 'venue' | 'gov' | 'opp' | 'chair' | 'panel' | 'trainee'")
    expect(source).toContain("if (key === 'panel') return adjudicatorNames(row.panels ?? [])")
    expect(source).toContain("if (key === 'trainee') return adjudicatorNames(row.trainees ?? [])")
  })

  it('resets the initial loading gate when tournament or participant mode changes', () => {
    const source = load('src/views/user/participant/UserParticipantHome.vue')
    expect(source).toContain('[tournamentId, participantMode]')
    expect(source).toContain('hasLoaded.value = false')
    expect(source).toContain('refresh()')
  })
})
