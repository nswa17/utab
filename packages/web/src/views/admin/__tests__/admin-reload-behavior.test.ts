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

  it('shows last updated only on tournament shell header', () => {
    const shellSource = loadSource('src/views/admin/AdminTournament.vue')
    expect(shellSource).toContain('最終更新: {time}')

    for (const path of [...nonReloadAdminPages, compileReloadPage]) {
      if (path === 'src/views/admin/AdminTournament.vue') continue
      const source = loadSource(path)
      expect(source, `${path} should not show duplicate last-updated labels`).not.toContain(
        '最終更新: {time}'
      )
    }
  })
})
