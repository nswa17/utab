import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function load(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('AdminRoundOperationsHub', () => {
  it('contains horizontal round bar, task switcher, and force compile lane', () => {
    const source = load('src/views/admin/AdminRoundOperationsHub.vue')
    expect(source).toContain('round-bar')
    expect(source).toContain('task-flow')
    expect(source).toContain('activeTask')
    expect(source).toContain('selectTask(task.key)')
    expect(source).toContain('task-state-chip')
    expect(source).not.toContain('前段: {task}')
    expect(source).toContain('運営ステップ')
    expect(source).toContain('提出状況確認')
    expect(source).toContain('ラウンド結果集計')
    expect(source).toContain('対戦表作成')
    expect(source).toContain('ラウンド公開設定')
    expect(source).toContain('対戦表作成では参照集計結果を選択できます。未選択でも自動生成できます。')
    expect(source).not.toContain('対戦生成と保存は対戦表設定で実行します。')
    expect(source).toContain('強制集計')
    expect(source).toContain('CompileForceRunModal')
    expect(source).toContain('includeLabelsFromRoundDetails')
    expect(source).toContain('compileDiffBaselineCompiledId')
    expect(source).toContain('CompiledSnapshotSelect')
    expect(source).toContain(":placeholder=\"$t('未選択')\"")
    expect(source).toContain('resolveLatestCompiledIdContainingRound')
    expect(source).not.toContain('compileDiffBaselineMode')
    expect(source).toContain('compileRows')
    expect(source).toContain('buildCompileOptions')
    expect(source).toContain('v-model:source-rounds="selectedCompileRounds"')
    expect(source).toContain(':show-ranking-priority="true"')
    expect(source).toContain(':show-source-rounds="true"')
    expect(source).toContain(':source-round-options="compileSourceRoundOptions"')
    expect(source).toContain('applyCompileDraftFromRound')
    expect(source).toContain('selectedRoundData.value?.userDefinedData')
    expect(source).not.toContain('compile-round-picker')
  })

  it('updates compile diff indicators immediately when selecting a past baseline snapshot', () => {
    const source = load('src/views/admin/AdminRoundOperationsHub.vue')
    expect(source).toContain('applyClientBaselineDiff')
    expect(source).toContain('selectedCompileDiffBaselineCompiled')
    expect(source).toContain('selectedCompileDiffBaselineRows')
    expect(source).toContain('compileDiffBaselineCompiledId')
  })

  it('shows only team ranking list in compile report', () => {
    const source = load('src/views/admin/AdminRoundOperationsHub.vue')
    expect(source).toContain('CategoryRankingTable')
    expect(source).not.toContain('FairnessAnalysisCharts')
    expect(source).not.toContain('SidePieChart')
    expect(source).not.toContain('ScoreHistogram')
    expect(source).not.toContain('compile-report-tabs')
    expect(source).not.toContain('カテゴリ別順位一覧')
    expect(source).not.toContain('公平性')
  })

  it('stores selected task per round and defaults to first incomplete step', () => {
    const source = load('src/views/admin/AdminRoundOperationsHub.vue')
    expect(source).toContain('roundTaskSelection')
    expect(source).toContain('recommendedTaskForRound')
    expect(source).toContain('resolveTaskForRound')
    expect(source).toContain('[roundNumber]: task')
    expect(source).toContain('task: nextTask')
  })

  it('adds strict submission guards before compile and draw generation', () => {
    const source = load('src/views/admin/AdminRoundOperationsHub.vue')
    expect(source).toContain('shouldBlockSubmissionCompile')
    expect(source).toContain('selectedRoundHasDraw')
    expect(source).toContain('selectedRoundBallotGapWarning')
    expect(source).toContain('snapshotIncludesSelectedRound')
    expect(source).toContain('未提出のチーム評価があります（提出 {submitted}/{expected}）。')
  })

  it('reads compiled rounds using r-or-round fallback for status chips', () => {
    const source = load('src/views/admin/AdminRoundOperationsHub.vue')
    expect(source).toContain('item?.r ?? item?.round')
  })

  it('embeds destination panels inline instead of using page navigation buttons', () => {
    const source = load('src/views/admin/AdminRoundOperationsHub.vue')
    expect(source).not.toContain('<iframe')
    expect(source).toContain('AdminRoundAllocation')
    expect(source).toContain('AdminTournamentSubmissions')
    expect(source).toContain('DrawPreviewTable')
    expect(source).not.toContain('buildEmbedUrl(')
    expect(source).not.toContain('openAllocationPage')
    expect(source).not.toContain('openRawResultPage')
    expect(source).not.toContain('openSubmissionsPage')
    expect(source).not.toContain('openReportsPage')
  })

  it('shows submission speed detail and venue-based submission table with search', () => {
    const source = load('src/views/admin/AdminRoundOperationsHub.vue')
    const submissionsView = load('src/views/admin/AdminTournamentSubmissions.vue')
    expect(source).toContain('提出スピード詳細')
    expect(source).toContain('selectedRoundSubmissionSpeed')
    expect(source).toContain('selectedRoundSubmissionDelayRows')
    expect(source).not.toContain("submissionEvaluationTab === 'team'")
    expect(source).not.toContain("submissionEvaluationTab === 'judge'")
    expect(source).not.toContain(':split-active-key="submissionEvaluationTab"')
    expect(source).not.toContain("提出者情報不足: Ballot {ballot} / Feedback {feedback}")
    expect(source).toContain('会場別提出状況')
    expect(source).toContain('submissionPreviewSearchQuery')
    expect(source).toContain('filteredSubmissionPreviewRows')
    expect(source).toContain('会場・チーム・提出者で検索')
    expect(source).toContain('submissionPreviewRows')
    expect(source).toContain(':show-submission-columns="true"')
    expect(source).toContain(':focus-edit-only="true"')
    expect(source).toContain('openSubmissionEditorModal')
    expect(submissionsView).toContain('splitActiveKey')
    expect(submissionsView).toContain('focusEditOnly')
  })

  it('uses round tie settings to control ballot winner options without an unselected option', () => {
    const submissionsView = load('src/views/admin/AdminTournamentSubmissions.vue')
    expect(submissionsView).toContain("const DRAW_WINNER_OPTION_VALUE = '__draw__'")
    expect(submissionsView).toContain('const editingBallotAllowDraw = computed(() =>')
    expect(submissionsView).toContain('allowLowTieWin: found?.userDefinedData?.allow_low_tie_win !== false')
    expect(submissionsView).toContain('allowWinnerScoreMismatch: roundAllowsWinnerScoreMismatch(found?.userDefinedData)')
    expect(submissionsView).toContain('const editingBallotWinnerOptions = computed<Array<{ value: string; label: string }>>(() => {')
    expect(submissionsView).toContain('v-for="option in editingBallotWinnerOptions"')
    expect(submissionsView).not.toMatch(
      /:label=\"\$t\('勝者'\)\"[\s\S]{0,220}<option value=\"\">\{\{ \$t\('未選択'\) \}\}<\/option>/
    )
  })
})
