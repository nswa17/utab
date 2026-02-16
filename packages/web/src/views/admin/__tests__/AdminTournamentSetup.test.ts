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

  it('shows per-round detail settings inside setup list', () => {
    const source = load('src/views/admin/AdminTournamentHome.vue')
    expect(source).toContain('setup-round-details')
    expect(source).toContain('setup-round-status-grid')
    expect(source).toContain('setupRoundEditForm.userDefinedData')
    expect(source).toContain('setup-round-motion-panel')
    expect(source).toContain('onSetupMotionOpenedChange')
    expect(source).not.toContain('<iframe')
    expect(source).not.toContain('ラウンド詳細設定へ')
    expect(source).not.toContain('対戦表設定')
  })
})
