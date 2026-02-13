import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const nonReloadAdminPages = [
  'src/views/admin/AdminHome.vue',
  'src/views/admin/AdminTournament.vue',
  'src/views/admin/AdminRoundOperationsHub.vue',
  'src/views/admin/AdminTournamentHome.vue',
  'src/views/admin/AdminTournamentRounds.vue',
  'src/views/admin/AdminTournamentSubmissions.vue',
  'src/views/admin/round/AdminRoundAllocation.vue',
  'src/views/admin/round/AdminRoundResult.vue',
]
const compileReloadPage = 'src/views/admin/AdminTournamentCompiled.vue'

function loadSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('admin reload behavior', () => {
  it('removes ReloadButton from non-report admin pages', () => {
    for (const path of nonReloadAdminPages) {
      const source = loadSource(path)
      const reloadCount = (source.match(/<ReloadButton/g) ?? []).length
      expect(reloadCount, `${path} has ${reloadCount} ReloadButton`).toBe(0)
    }
  })

  it('keeps one ReloadButton with target label on report page', () => {
    const source = loadSource(compileReloadPage)
    const reloadCount = (source.match(/<ReloadButton/g) ?? []).length
    expect(reloadCount).toBe(1)
    expect(source).toMatch(/:target=/)
  })

  it('shows a last refreshed label near headers', () => {
    for (const path of [...nonReloadAdminPages, compileReloadPage]) {
      const source = loadSource(path)
      expect(source, `${path} is missing lastRefreshedLabel usage`).toContain('lastRefreshedLabel')
    }
  })
})
