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
    expect(source).toContain(
      "type AudienceSortKey = 'venue' | 'gov' | 'opp' | 'chair' | 'panel' | 'trainee'"
    )
    expect(source).toContain("if (key === 'panel') return adjudicatorNames(row.panels ?? [])")
    expect(source).toContain("if (key === 'trainee') return adjudicatorNames(row.trainees ?? [])")
  })

  it('resets the initial loading gate when tournament or participant mode changes', () => {
    const source = load('src/views/user/participant/UserParticipantHome.vue')
    expect(source).toContain('[tournamentId, participantMode]')
    expect(source).toContain('hasLoaded.value = false')
    expect(source).toContain('refresh()')
  })

  it('uses the same Gov/Opp colour coding as the ballot entry screen', () => {
    const source = load('src/views/user/participant/UserParticipantHome.vue')
    expect(source).toContain('class="side-chip gov-chip"')
    expect(source).toContain('class="side-chip opp-chip"')
    expect(source).toContain('background: var(--color-side-gov-card)')
    expect(source).toContain('background: var(--color-side-opp-card)')
    expect(source).toContain('class="table-side-heading table-side-heading--gov"')
    expect(source).toContain('class="table-side-heading table-side-heading--opp"')
  })

  it('makes team and adjudicator evaluation actions visually distinct', () => {
    const source = load('src/views/user/participant/UserParticipantHome.vue')
    expect(source).toContain('variant="primary"')
    expect(source).toContain('variant="secondary"')
    expect(source).toContain('class="draw-action-button draw-action-button--team"')
    expect(source).toContain('class="draw-action-button draw-action-button--judge"')
    expect(source).not.toContain('draw-action-arrow')
  })

  it('shows submission actions only for a fully published two-team draw', () => {
    const source = load('src/views/user/participant/UserParticipantHome.vue')
    expect(source).toContain('v-if="roundSubmissionsEnabled(round.round)" class="row draw-actions"')
    expect(source).toContain('supportsParticipantSubmissions.value &&')
    expect(source).toContain('teamAllocationVisible(roundNumber) &&')
    expect(source).toContain('adjudicatorAllocationVisible(roundNumber)')
    expect(source).toContain('normalizeTournamentTeamNum(style.value?.team_num) === 2')
    expect(source).toContain(
      'if (!roundSubmissionsEnabled(pendingTaskContext.value.round)) return false'
    )
  })
})
