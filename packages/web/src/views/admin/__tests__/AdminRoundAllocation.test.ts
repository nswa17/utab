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
    expect(source).toContain(
      '確定後は、その時点の参照集計を固定で使います。前ラウンド結果を後から修正しても自動更新されないため、必要なら「参照ラウンドを変更・再確定」してください。'
    )
    expect(source).toContain('参照ラウンドを変更・再確定')
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
    expect(source).toContain('hasPersistedAllocationRows')
    expect(source).toContain('チーム結果参照ラウンドに直前ラウンドを含めてください。')
    expect(source).toContain('ジャッジ結果参照ラウンドに直前ラウンドを含めてください。')
  })

  it('keeps selected CSV file visible while reading allocation import text', () => {
    const source = load('src/views/admin/round/AdminRoundAllocation.vue')
    expect(source).toContain('@file-change="handleAllocationImportFile"')
    expect(source).toContain('allocationImportText.value = await file.text()')
    expect(source).not.toContain("input.value = ''")
  })

  it('offers class_based adjudicator allocation with explicit constraints', () => {
    const source = load('src/views/admin/round/AdminRoundAllocation.vue')
    expect(source).toContain('class_based')
    expect(source).toContain('クラスベース')
    expect(source).toContain(
      'judge_class の優先ロールを反映し、chair_preferred は chair、chair_or_panel は chair / panel、panel_or_trainee は panel / trainee を優先します。'
    )
    expect(source).toContain("v-if=\"autoOptions.adjudicatorAlgorithm !== 'class_based'\"")
    expect(source).toContain('class_based では panel_or_trainee を chair に置きません。')
    expect(source).toContain(
      'judge_class が全員未設定なら standard に戻り、一部未設定は chair_preferred として扱います。'
    )
    expect(source).not.toContain('A/B/C クラスを role ごとの優先順に反映し、chair は A/B 優先、panel/trainee は C を優先します。')
    expect(source).not.toContain('class_based では C を chair に置きません。')
    expect(source).toContain('<option value="random">{{ $t(\'ランダム\') }}</option>')
    expect(source).toContain('シャッフルしたジャッジを、既存の対戦カードに対してチェア→パネル→トレーニーの順で埋めます。')
    expect(source).toContain('シャッフルしたチームをそのまま順に組み合わせます。')
  })

  it('resets auto-generate target to all and blocks judge-empty team-only generation', () => {
    const source = load('src/views/admin/round/AdminRoundAllocation.vue')
    expect(source).toContain("requestScope.value = 'all'")
    expect(source).toContain('const requestScopeWarningText = computed(() => {')
    expect(source).toContain(
      '対象がチームのみのため、ジャッジは新規生成されません。現在のドローにジャッジ割当がないため、生成後も空欄のままです。ジャッジも作るには対象を全体かジャッジにしてください。'
    )
    expect(source).toContain('const adjudicatorCapacityWarning = computed(() => {')
    expect(source).toContain(
      '使用可能ジャッジが足りません。必要 {required} 人 / 使用可能 {available} 人です。人数設定か availability を見直してください。'
    )
  })

  it('shows adjudicator role counts in detail instead of total assignments', () => {
    const source = load('src/views/admin/round/AdminRoundAllocation.vue')
    expect(source).toContain("label: t('ジャッジクラス')")
    expect(source).toContain("label: t('チェア担当回数')")
    expect(source).toContain("label: t('パネル担当回数')")
    expect(source).toContain("label: t('トレイニー担当回数')")
    expect(source).not.toContain("label: t('担当数')")
  })

  it('resolves conflict group labels from normalized institution references', () => {
    const source = load('src/views/admin/round/AdminRoundAllocation.vue')
    expect(source).toContain('function resolveInstitutionRecord')
    expect(source).toContain('detail?.conflicts ?? [],')
    expect(source).toContain('detail?.institutions ?? [],')
    expect(source).toContain('team?.template?.conflicts ?? [],')
    expect(source).toContain('team?.template?.institutions ?? []')
    expect(source).toContain('adj?.template?.conflicts ?? [],')
    expect(source).toContain('adj?.template?.institutions ?? []')
    expect(source).toContain('token === institutionId || token === fallbackId || token === institutionName')
  })

  it('adds drag-time conflict and history highlighting to placement pills and cells', () => {
    const source = load('src/views/admin/round/AdminRoundAllocation.vue')
    expect(source).toContain('buildAllocationDragHighlightIndex')
    expect(source).toContain('allocationDragHighlightToneForIds')
    expect(source).toContain('activeHighlightPayload')
    expect(source).toContain('hoverPayload')
    expect(source).toContain('onEntityHover(')
    expect(source).toContain('onEntityHoverEnd(')
    expect(source).toContain('dropZoneClasses(')
    expect(source).toContain('pill-drag-related--conflict')
    expect(source).toContain('pill-drag-related--history')
    expect(source).toContain('pill-drag-source')
    expect(source).toContain('pill-hover-source')
    expect(source).not.toContain('drop-zone--drag-related--conflict')
    expect(source).not.toContain('drop-zone--drag-related--history')
  })

  it('keeps the color legend beside the placement title and summarizes every warning tone', () => {
    const source = load('src/views/admin/round/AdminRoundAllocation.vue')
    expect(source).toContain('class="warning-color-legend"')
    expect(source.indexOf('class="warning-color-legend"')).toBeLessThan(
      source.indexOf('<Teleport to="body">')
    )
    expect(source).toContain('赤: 同一機関・利用不可などの重大な競合')
    expect(source).toContain('橙: 過去の対戦')
    expect(source).toContain('黄: 過去に担当済み・サイド偏りなど')
    expect(source).toContain('青: 同地域・同リーグなどの参考情報')
    expect(source).toContain('warning-color-legend-dot--critical')
    expect(source).toContain('warning-color-legend-dot--history')
    expect(source).toContain('warning-color-legend-dot--caution')
    expect(source).toContain('warning-color-legend-dot--info')
    expect(source).toContain('warningSummaryItems(rowWarningState(index).warnings)')
    expect(source).toContain('warningSummaryToneOrder')
    expect(source).toContain('counts[warningDisplayTone(warning)] += 1')
    expect(source).toContain('warning-summary-item--history')
    expect(source).toContain('warning-summary-item--caution')
    expect(source).toContain("if (tone === 'history') return 'vs'")
    expect(source).toContain('warningDisplayToneShortLabel(warningDisplayTone(warning))')
    expect(source).toContain('class="warning-summary-icon"')
  })

  it('invalidates stale refresh and compiled-history requests while route context changes', () => {
    const source = load('src/views/admin/round/AdminRoundAllocation.vue')
    expect(source).toContain('createLatestRequestGate')
    expect(source).toContain('const refreshGate = createLatestRequestGate()')
    expect(source).toContain('const compiledHistoryGate = createLatestRequestGate()')
    expect(source).toContain('compiledHistoryGate.invalidate()')
    expect(source).toContain('if (!compiledHistoryGate.isCurrent(token)) return')
    expect(source).toContain('sectionLoading.value = foregroundRefreshCount > 0')
  })
})
