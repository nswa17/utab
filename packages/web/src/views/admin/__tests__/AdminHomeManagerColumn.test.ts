import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function load(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('AdminHome manager column', () => {
  it('renders manager name column only behind superuser condition', () => {
    const source = load('src/views/admin/AdminHome.vue')
    expect(source).toContain("const isSuperuser = computed(() => auth.role === 'superuser')")
    expect(source).toContain("<th v-if=\"isSuperuser\">{{ $t('管理者名') }}</th>")
    expect(source).toContain("<td v-if=\"isSuperuser\">{{ item.createdByName || $t('不明') }}</td>")
  })
})
