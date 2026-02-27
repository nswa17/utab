import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function load(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('AdminRoundAllocation', () => {
  it('prioritizes saved draw reference compiled id when a draw already exists', () => {
    const source = load('src/views/admin/round/AdminRoundAllocation.vue')
    expect(source).toContain('[compiledSnapshotOptions, round, currentDraw]')
    expect(source).toContain('const hasSavedDraw = Boolean(draw)')
    expect(source).toContain('savedReferenceCompiledId')
    expect(source).toContain('if (!selected && hasSavedDraw)')
    expect(source).toContain('if (!selected && defaultDetailSnapshotId.value)')
  })
})
