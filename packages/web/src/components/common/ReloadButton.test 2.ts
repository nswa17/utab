import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import ReloadButton from './ReloadButton.vue'

function mountReloadButton(props: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const i18n = createI18n({
    legacy: false,
    locale: 'ja',
    messages: {
      ja: {
        再読み込み: '再読み込み',
        '{target}を再読み込み': '{target}を再読み込み',
      },
    },
  })
  const app = createApp({
    render() {
      return h(ReloadButton, props as any)
    },
  })
  app.use(i18n)
  app.mount(container)
  return {
    container,
    unmount() {
      app.unmount()
      container.remove()
    },
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ReloadButton', () => {
  it('uses target to build aria-label and title by default', async () => {
    const mounted = mountReloadButton({ target: '大会一覧' })
    await nextTick()
    const button = mounted.container.querySelector('button')
    expect(button).not.toBeNull()
    expect(button?.getAttribute('aria-label')).toBe('大会一覧を再読み込み')
    expect(button?.getAttribute('title')).toBe('大会一覧を再読み込み')
    mounted.unmount()
  })

  it('prioritizes explicit aria-label and title attrs', async () => {
    const mounted = mountReloadButton({
      target: '大会一覧',
      'aria-label': '手動更新',
      title: '手動更新の説明',
    })
    await nextTick()
    const button = mounted.container.querySelector('button')
    expect(button).not.toBeNull()
    expect(button?.getAttribute('aria-label')).toBe('手動更新')
    expect(button?.getAttribute('title')).toBe('手動更新の説明')
    mounted.unmount()
  })

  it('disables button and renders loading text while loading', async () => {
    const mounted = mountReloadButton({ loading: true })
    await nextTick()
    const button = mounted.container.querySelector('button')
    const srOnly = mounted.container.querySelector('.sr-only')
    expect(button).not.toBeNull()
    expect(button?.hasAttribute('disabled')).toBe(true)
    expect(srOnly?.textContent?.trim()).toBe('再読み込み')
    mounted.unmount()
  })
})
