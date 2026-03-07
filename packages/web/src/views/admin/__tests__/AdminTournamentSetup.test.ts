import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function load(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Admin tournament setup integration', () => {
  it('includes round defaults section in setup screen', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('デフォルト設定')
    expect(source).toContain('roundDefaultsForm')
    expect(source).toContain('saveRoundDefaults')
    expect(source).toContain('ラウンドデフォルトを保存')
  })

  it('creates rounds from setup with inherited defaults', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('buildRoundUserDefinedFromDefaults(')
    expect(source).toContain('roundDefaultsForm')
    expect(source).toContain('createRoundFromSetup')
    expect(source).toContain('userDefinedData.break_round = false')
    expect(source).not.toContain('setupRoundForm.type')
  })

  it('updates break rounds with cascading switch behavior', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('onSetupRoundBreakEnabledChange')
    expect(source).toContain('withRoundBreakEnabled')
    expect(source).toContain('roundNumber >= targetRound')
    expect(source).toContain('roundNumber <= targetRound')
  })

  it('supports editing existing rounds in setup', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('startEditRoundFromSetup')
    expect(source).toContain('saveEditRoundFromSetup')
    expect(source).toContain('setupRoundEditingId')
    expect(source).toContain('setupRoundEditForm')
  })

  it('supports deleting rounds directly from setup list', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('requestRemoveRoundFromSetup')
    expect(source).toContain('confirmRemoveRoundFromSetup')
    expect(source).toContain('setupRoundDeleteTarget')
    expect(source).toContain('ラウンド削除')
    expect(source).toContain('{round} を削除しますか？')
  })

  it('shows per-round detail settings inside setup list', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('setup-round-details')
    expect(source).toContain('RoundPublicationSwitches')
    expect(source).toContain('チーム割り当て')
    expect(source).toContain('ジャッジ割り当て')
    expect(source).toContain('setupRoundEditForm.userDefinedData')
    expect(source).toContain('setup-round-motion-panel')
    expect(source).toContain('onSetupMotionOpenedChange')
    expect(source).not.toContain('このラウンドより前を一括非公開')
    expect(source).not.toContain('<iframe')
    expect(source).not.toContain('ラウンド詳細設定へ')
    expect(source).not.toContain('対戦表設定')
  })

  it('groups adjudicator conflict groups by institution category', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('groupedAdjudicatorInstitutionOptions')
    expect(source).toContain('buildInstitutionOptionGroups')
    expect(source).toContain('relation-subgroup')
    expect(source).toContain(
      "institutionCategoryOrder: InstitutionCategory[] = ['institution', 'region', 'league']"
    )
  })

  it('supports per-round detail editing for team/adjudicator/venue', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain("isEntityInlineEditing('team', team._id)")
    expect(source).toContain("isEntityInlineEditing('adjudicator', adj._id)")
    expect(source).toContain("isEntityInlineEditing('venue', venue._id)")
    expect(source).toContain('detailRows.length > 0')
    expect(source).toContain('buildTeamEditDetailRows')
    expect(source).toContain('buildAdjudicatorEditDetailRows')
    expect(source).toContain('buildVenueEditDetailRows')
    expect(source).toContain('roundDetailInstitutionOptions')
    expect(source).toContain('roundDetailSpeakerOptions')
    expect(source).toContain('roundDetailTeamOptions')
  })

  it('uses inline collapse editor with switches and stepper controls', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('toggleEntityInlineEdit')
    expect(source).toContain('isEntityInlineEditing')
    expect(source).toContain("isEntityInlineEditing('institution', inst._id)")
    expect(source).toContain('round-collapse-toggle')
    expect(source).toContain('toggleRoundDetailExpanded')
    expect(source).toContain('ToggleSwitch')
    expect(source).toContain('adjustDetailPriority')
    expect(source).toContain('adjustEntityFormPriority')
    expect(source).toContain('number-stepper')
  })

  it('keeps selected CSV file visible while reading import text', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('@file-change="handleEntityImportFile"')
    expect(source).toContain('entityImportText.value = await file.text()')
    expect(source).not.toContain("input.value = ''")
  })

  it('supports bulk deleting filtered entity search results', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('removeAllTeams')
    expect(source).toContain('removeAllAdjudicators')
    expect(source).toContain('removeAllVenues')
    expect(source).toContain('removeAllSpeakers')
    expect(source).toContain('removeAllInstitutions')
    expect(source).toContain("deleteEntityModal.value?.mode === 'bulk'")
    expect(source).toContain('現在の検索結果に含まれる{label} {count}件を一括削除しますか？')
    expect(source).toContain("{{ $t('一括削除') }}")
  })

  it('uses the same enabled switch treatment for venue creation as round rows', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('<form class="grid aligned-field-grid" @submit.prevent="handleCreateVenue">')
    expect(source).toContain('<label class="row small round-detail-switch">')
    expect(source).toContain(":aria-label=\"$t('会場を有効化')\"")
    expect(source).toContain("{{ $t('有効') }}")
    expect(source).not.toContain("{{ $t('使用可能（デフォルト値）') }}")
  })

  it('keeps adjudicator judge class inline editor on one line with a wider control', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('inline-control inline-control--judge-class')
    expect(source).toContain('.inline-control--judge-class {')
    expect(source).toContain('min-width: 320px;')
    expect(source).toContain('.inline-control--judge-class select {')
    expect(source).toContain('white-space: nowrap;')
  })
})
