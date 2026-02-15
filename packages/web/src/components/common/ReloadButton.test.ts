import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveReloadButtonAttrs, resolveReloadButtonLabel } from './reload-button'

function t(key: string, params?: Record<string, unknown>): string {
  if (key === '再読み込み') return '再読み込み'
  if (key === '{target}を再読み込み') return `${String(params?.target ?? '')}を再読み込み`
  return key
}

describe('ReloadButton', () => {
  it('uses target to build aria-label and title by default', () => {
    const labelText = resolveReloadButtonLabel('', t)
    const attrs = resolveReloadButtonAttrs({
      attrs: {},
      target: '大会一覧',
      labelText,
      t,
    })

    expect(attrs['aria-label']).toBe('大会一覧を再読み込み')
    expect(attrs.title).toBe('大会一覧を再読み込み')
  })

  it('prioritizes explicit aria-label and title attrs', () => {
    const attrs = resolveReloadButtonAttrs({
      attrs: { 'aria-label': '手動更新', title: '手動更新の説明' },
      target: '大会一覧',
      labelText: resolveReloadButtonLabel('', t),
      t,
    })

    expect(attrs['aria-label']).toBe('手動更新')
    expect(attrs.title).toBe('手動更新の説明')
  })

  it('falls back to translated reload label when label is not provided', () => {
    expect(resolveReloadButtonLabel('', t)).toBe('再読み込み')
    expect(resolveReloadButtonLabel(undefined, t)).toBe('再読み込み')
    expect(resolveReloadButtonLabel(' 手動更新 ', t)).toBe('手動更新')
  })

  it('keeps loading accessibility/output wiring in SFC template', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/common/ReloadButton.vue'), 'utf8')
    expect(source).toContain(':disabled="disabled || loading"')
    expect(source).toContain('<span v-if="loading" class="sr-only">{{ labelText }}</span>')
  })
})
