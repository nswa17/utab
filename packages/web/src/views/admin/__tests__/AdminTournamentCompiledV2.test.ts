import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function load(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('AdminTournamentCompiled V2', () => {
  it('provides a snapshot selector in the report workflow', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('過去の集計結果')
    expect(source).toContain('selectedCompiledId')
    expect(source).toContain('snapshotSelectOptions')
  })

  it('opens recomputation options in the detailed settings modal', () => {
    const source = load('src/views/admin/AdminTournamentCompiled.vue')
    expect(source).toContain('showRecomputeOptions')
    expect(source).toContain('詳細設定')
    expect(source).toContain('recompute-modal')
    expect(source).toContain("@click=\"showRecomputeOptions = true\"")
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
