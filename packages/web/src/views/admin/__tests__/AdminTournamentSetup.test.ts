import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function load(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Admin tournament setup integration', () => {
  it('includes round defaults section in setup screen', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('ラウンドデフォルト設定')
    expect(source).toContain('roundDefaultsForm')
    expect(source).toContain('saveRoundDefaults')
    expect(source).toContain('ラウンドデフォルトを保存')
  })

  it('creates rounds from setup with inherited defaults', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('buildRoundUserDefinedFromDefaults(')
    expect(source).toContain('roundDefaultsForm')
    expect(source).toContain('createRoundFromSetup')
    expect(source).toContain('setupRoundForm.type')
    expect(source).toContain('新規ラウンドは大会セットアップのラウンドデフォルトを継承します。')
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
    expect(source).toContain('ラウンド {round} を削除しますか？')
  })

  it('shows per-round detail settings inside setup list', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('setup-round-details')
    expect(source).toContain('publish-switch-inline')
    expect(source).toContain('チーム割り当て')
    expect(source).toContain('ジャッジ割り当て')
    expect(source).toContain('setupRoundEditForm.userDefinedData')
    expect(source).toContain('setup-round-motion-panel')
    expect(source).toContain('onSetupMotionOpenedChange')
    expect(source).not.toContain('<iframe')
    expect(source).not.toContain('ラウンド詳細設定へ')
    expect(source).not.toContain('対戦表設定')
  })

  it('groups adjudicator conflict groups by institution category', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('groupedAdjudicatorInstitutionOptions')
    expect(source).toContain('groupedEditAdjudicatorInstitutionOptions')
    expect(source).toContain('buildInstitutionOptionGroups')
    expect(source).toContain('relation-subgroup')
    expect(source).toContain("institutionCategoryOrder: InstitutionCategory[] = ['institution', 'region', 'league']")
  })
})
