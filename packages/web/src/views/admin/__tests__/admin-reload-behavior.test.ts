import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const adminReloadPages = [
  'src/views/admin/AdminHome.vue',
  'src/views/admin/AdminTournament.vue',
  'src/views/admin/AdminRoundOperationsHub.vue',
  'src/views/admin/AdminTournamentHome.vue',
  'src/views/admin/AdminTournamentRounds.vue',
  'src/views/admin/AdminTournamentSubmissions.vue',
  'src/views/admin/AdminTournamentCompiled.vue',
  'src/views/admin/round/AdminRoundAllocation.vue',
  'src/views/admin/round/AdminRoundResult.vue',
]

function loadSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('admin reload behavior', () => {
  it('keeps one ReloadButton per admin page', () => {
    for (const path of adminReloadPages) {
      const source = loadSource(path)
      const reloadCount = (source.match(/<ReloadButton/g) ?? []).length
      expect(reloadCount, `${path} has ${reloadCount} ReloadButton`).toBe(1)
    }
  })

  it('sets reload target labels for accessibility context', () => {
    for (const path of adminReloadPages) {
      const source = loadSource(path)
      expect(source, `${path} is missing :target on ReloadButton`).toMatch(/:target=/)
    }
  })

  it('shows a last refreshed label near the page header', () => {
    for (const path of adminReloadPages) {
      const source = loadSource(path)
      expect(source, `${path} is missing lastRefreshedLabel usage`).toContain('lastRefreshedLabel')
    }
  })
})
