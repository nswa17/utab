import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function load(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('AdminTournament legacy mode controls', () => {
  it('supports legacy read-only lock with feature flag', () => {
    const source = load('src/views/admin/AdminTournament.vue')
    expect(source).toContain('isLegacyAdminReadOnlyEnabled')
    expect(source).toContain('shouldLockLegacyRoute')
    expect(source).toContain('legacy-readonly-banner')
    expect(source).toContain('legacy-content-shell')
  })

  it('keeps migration link from legacy to new flow', () => {
    const source = load('src/views/admin/AdminTournament.vue')
    expect(source).toContain('legacyUpgradePath')
    expect(source).toContain('showLegacyMigrationLink')
    expect(source).toContain('新画面へ移動')
  })
})
