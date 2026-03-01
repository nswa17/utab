import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function load(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('AdminRoundAllocation', () => {
  it('gates placement behind source-round finalization and auto compile save', () => {
    const source = load('src/views/admin/round/AdminRoundAllocation.vue')
    expect(source).toContain('参照ラウンド選択')
    expect(source).toContain('referenceSelectionConfirmed')
    expect(source).toContain('commonReferenceRoundSelections')
    expect(source).toContain('useScopedReferenceRoundSelections')
    expect(source).toContain('teamReferenceRoundSelections')
    expect(source).toContain('adjudicatorReferenceRoundSelections')
    expect(source).toContain('confirmReferenceRounds')
    expect(source).toContain('reopenReferenceSelection')
    expect(source).toContain('resolveSavedReferenceRoundSelections')
    expect(source).not.toContain('集計に使う参照ラウンドを選択し、「確定」で参照集計を保存します。')
    expect(source).not.toContain('対戦表作成で選択中の参照集計結果を利用します。')
    expect(source).not.toContain('参照ラウンドは確定済みです。必要な場合のみ変更してください。')
    expect(source).not.toContain('必要な場合は「詳細」で集計条件を調整してください。')
    expect(source).toContain('チーム・ジャッジで参照ラウンドを個別に設定する')
    expect(source).toContain('チーム結果参照ラウンド')
    expect(source).toContain('ジャッジ結果参照ラウンド')
    expect(source).not.toContain('openReferenceCompileSettingsModal')
    expect(source).not.toContain('referenceCompileSettingsModalOpen')
    expect(source).not.toContain('CompileOptionsEditor')
    expect(source).not.toContain('複数選択可（チェックで選択）')
    expect(source).toContain('reference-round-checkbox-list')
    expect(source).not.toContain('選択中: {rounds}')
    expect(source).toContain("v-if=\"referenceSelectionConfirmed\"")
    expect(source).toContain('compiledStore.saveCompiled')
    expect(source).toContain('buildReferenceCompileOptions')
    expect(source).toContain('snapshotIdTeams')
    expect(source).toContain('snapshotIdAdjudicators')
    expect(source).toContain('readDrawReferenceCompiledRoundsByScope')
    expect(source).toContain('CompiledSnapshotSelect')
    expect(source).toContain('handleSharedReferenceSnapshotSelection')
    expect(source).toContain('resolvePreferredSnapshotIdByReferenceRounds')
  })
})
