import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function load(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('AdminTournamentCompiled V2', () => {
  it('organizes the report workflow into three section tabs with rankings as the default', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('reportUxV3Enabled')
    expect(source).toContain('activeReportSection')
    expect(source).toContain('reportSectionOptions')
    expect(source).toContain('レポート表示')
    expect(source).not.toContain('タブは実行ではなく表示切替です。')
    expect(source).not.toContain('現在: {label} - {description}')
    expect(source).toContain('カテゴリ別順位一覧')
    expect(source).toContain('公平性')
    expect(source).toContain('発表出力')
    expect(source).not.toContain("{ key: 'analysis'")
    expect(source).toContain("'operations'")
  })

  it('guards new report sections behind a dedicated feature flag', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    const flags = load('src/config/feature-flags.ts')
    expect(source).toContain('isAdminReportsUxV3Enabled')
    expect(flags).toContain('VITE_ADMIN_REPORTS_UX_V3')
  })

  it('splits top-level setup into existing report selection, generation, and submission summary', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('既存レポートの選択')
    expect(source).toContain('新規レポート生成')
    expect(source).toContain('提出状況サマリー')
    expect(source).toContain('submissionOperationsLinkForRound')
    expect(source).toContain('提出状況を確認')
    expect(source).not.toContain('レポート概要')
  })

  it('routes submission remediation to round operations submissions tab', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('submissionsOperationsLink')
    expect(source).toContain('submissionOperationsLinkLabel')
    expect(source).toContain('提出状況タブへ')
    expect(source).not.toContain('`/admin/${tournamentId}/submissions`')
    expect(source).toContain('/operations')
    expect(source).toContain('?task=submissions')
  })

  it('keeps rankings focused and removes operation-risk frame content', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('operations-results')
    expect(source).toContain('カテゴリ別順位一覧')
    expect(source).not.toContain('順位一覧の対象を切り替えます。')
    expect(source).not.toContain('最終確定前に、順位・差分・境界をこの一覧で先に確認してください。')
    expect(source).not.toContain('確定リスク')
    expect(source).not.toContain('operationRisks')
    expect(source).not.toContain('operationRiskSeverityLabel')
  })

  it('uses common diff baseline selector and defaults to previous snapshot', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    const helper = load('src/utils/compiled-snapshot.ts')
    expect(source).toContain('CompiledDiffBaselineSelect')
    expect(source).toContain('compileDiffBaselineSelection')
    expect(source).toContain('diffBaselineCompiledOptions')
    expect(source).toContain('applyDefaultDiffBaselineSelection')
    expect(source).toContain('resolvePreviousCompiledId')
    expect(source).not.toContain('差分基準: {baseline}')
    expect(source).not.toContain('latest-label')
    expect(helper).toContain('formatCompiledSnapshotOptionLabel')
    expect(helper).toContain('resolvePreviousCompiledId')
  })

  it('applies selected diff baseline immediately on the client without waiting for recompilation', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('applyClientBaselineDiff')
    expect(source).toContain('selectedDiffBaselineCompiled')
    expect(source).toContain('selectedDiffBaselineRows')
    expect(source).toContain('resultSourceForLabel')
  })

  it('adds fairness summary cards for side, matchup, and judge allocation bias', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('fairnessSideSummary')
    expect(source).toContain('fairnessMatchupSummary')
    expect(source).toContain('fairnessJudgeSummary')
    expect(source).toContain('fairnessAlertCount')
    expect(source).toContain('ジャッジ割当偏り')
    expect(source).toContain('Number.isInteger(round.round) && round.round >= 1')
  })

  it('adds judge strictness outlier insights on the fairness section', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('buildJudgeStrictnessRows')
    expect(source).toContain('judgeStrictnessRows')
    expect(source).toContain('judgeStrictnessOutliers')
    expect(source).toContain('ジャッジ偏差 (Strictness)')
    expect(source).toContain('strictnessBarStyle')
    expect(source).toContain('strictness-bar-track')
  })

  it('removes announcement summary and boundary sections while keeping announcement export tools', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).not.toContain('発表準備サマリー')
    expect(source).not.toContain('発表境界')
    expect(source).not.toContain('breakBoundarySummary')
    expect(source).toContain('表彰コピー')
    expect(source).toContain('受賞者CSV')
  })

  it('integrates analysis charts into fairness section with lazy readiness and empty state', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('分析（公平性タブ統合）')
    expect(source).toContain('分析は公平性タブで確認できます。')
    expect(source).toContain('analysisChartsReady')
    expect(source).toContain('canShowAnalysisCharts')
    expect(source).toContain('analysisEmptyState')
    expect(source).not.toContain('showAnalysisSection')
    expect(source).toContain('<EmptyState')
  })

  it('keeps score range display fixed to max-score order without sort controls', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).not.toContain('スコア範囲ソート')
    expect(source).not.toContain('scoreRangeSortBy')
    expect(source).not.toContain('scoreRangeSortDirection')
    expect(source).not.toContain('toggleScoreRangeSortDirection')
    expect(source).toContain('<ScoreRange :results="activeResults" :score="scoreKey" />')
  })

  it('removes heatmap charts from fairness visuals', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).not.toContain('SideHeatmap')
    expect(source).not.toContain('SideMarginHeatmap')
  })

  it('removes volatility insight features from fairness analytics', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).not.toContain('buildVolatilityRows')
    expect(source).not.toContain('volatilityRows')
    expect(source).not.toContain('volatilityAlertCount')
    expect(source).not.toContain('変動指標 (Volatility)')
    expect(source).not.toContain('急変チーム件数')
    expect(source).not.toContain('openFairnessFromOperations')
  })

  it('removes operation speed/risk dashboard internals', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).not.toContain('submissionSpeedRows')
    expect(source).not.toContain('submissionSpeedSummary')
    expect(source).not.toContain('提出スピード詳細')
    expect(source).not.toContain('遅延上位提出者')
    expect(source).not.toContain('submissionDelayRows')
    expect(source).not.toContain('submissionTypeLabel')
    expect(source).not.toContain('speedStatusLabel')
  })

  it('lets slides switch entity labels independently and appears before award copy', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('slideAvailableLabels')
    expect(source).toContain('slideLabel')
    expect(source).toContain('setSlideLabel')
    expect(source).toContain(':label="slideLabel"')
    expect(source).toContain('announcementResultsSource')
    expect(source).toContain('announcementResults')
    expect(source).toContain('awardMetricLabel(slideLabel.value)')
    const slideHeadingIndex = source.indexOf("<h4>{{ $t('スライド') }}</h4>")
    const awardHeadingIndex = source.indexOf("<h4>{{ $t('表彰コピー') }}</h4>")
    expect(slideHeadingIndex).toBeGreaterThan(-1)
    expect(awardHeadingIndex).toBeGreaterThan(-1)
    expect(slideHeadingIndex).toBeLessThan(awardHeadingIndex)
  })

  it('tracks report telemetry for section dwell, CTA clicks, and exports', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    const telemetry = load('src/utils/report-telemetry.ts')
    expect(source).toContain('trackAdminReportMetric')
    expect(source).toContain("metric: 'tab_enter'")
    expect(source).toContain("metric: 'tab_leave'")
    expect(source).toContain("emitReportMetric('cta_click'")
    expect(source).toContain("emitReportMetric('export_complete'")
    expect(telemetry).toContain('utab:admin-report-metric')
  })

  it('registers interpolation labels for report cards to avoid raw {placeholders}', () => {
    const messages = load('src/i18n/messages.ts')
    expect(messages).toContain("'現在表示: {snapshot}'")
    expect(messages).toContain("'現在: {label} - {description}'")
    expect(messages).toContain("'表示するレポート': 'Report to display'")
    expect(messages).toContain("'提出状況を確認': 'Check submission status'")
    expect(messages).toContain("'要確認: {count}件'")
    expect(messages).toContain("'Gov勝率 {gov}% / Opp勝率 {opp}%'")
    expect(messages).toContain("'順位変動あり: {count}件'")
  })

  it('provides a snapshot selector in the report workflow', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('表示するレポート')
    expect(source).toContain('selectedCompiledId')
    expect(source).toContain('snapshotSelectOptions')
  })

  it('opens recomputation options in the detailed settings modal', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('showRecomputeOptions')
    expect(source).toContain('詳細設定')
    expect(source).toContain('recompute-modal')
    expect(source).toContain('openRecomputeOptions')
    expect(source).toContain('cancelRecomputeOptions')
    expect(source).toContain('applyRecomputeOptions')
  })

  it('keeps compile preparation independent from the operations tab', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('新規レポート生成')
    expect(source).toContain('新規レポートを生成します。')
    expect(source).not.toContain('v-if="!compiled || showOperationsSection"')
  })

  it('shows a submission-first migration guide when raw source mode is active', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('提出データ一本化ガイド')
    expect(source).toContain('migration-guide')
    expect(source).toContain('/operations')
  })

  it('marks exception mode by displayed snapshot source in header and diff legend', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('displayedCompileSource')
    expect(source).toContain('isDisplayedRawSource')
    expect(source).toContain('compiled.value?.compile_source')
    expect(source).toContain('表示中スナップショットは「生結果データ」です（例外モード）。')
    expect(source).toContain("v-if=\"isDisplayedRawSource\" class=\"raw-source-badge\"")
  })

  it('applies a selected snapshot as the displayed compiled data', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('function applyCompiledSnapshot')
    expect(source).toContain('compiledStore.compiled = normalized')
    expect(source).toContain('watch(\n  selectedCompiledId')
  })
})
