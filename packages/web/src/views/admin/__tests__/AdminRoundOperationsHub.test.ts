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
    expect(source).toContain('提出状況')
    expect(source).toContain('集計設定')
    expect(source).toContain('対戦生成')
    expect(source).toContain('公開設定')
    expect(source).toContain('対戦生成と保存は対戦表設定で実行します。')
    expect(source).toContain('強制実行')
    expect(source).toContain('compileSource')
    expect(source).toContain('compileDiffBaselineCompiledId')
    expect(source).not.toContain('compileDiffBaselineMode')
    expect(source).toContain('compileRows')
    expect(source).toContain('buildCompileOptions')
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
    expect(source).toContain('未提出のチーム評価があります（提出 {submitted}/{expected}）。提出一覧を確認してください。')
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
})
