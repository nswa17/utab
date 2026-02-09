import { createI18n } from 'vue-i18n'
import { messages } from './messages'

export type Locale = 'ja' | 'en'

const STORAGE_KEY = 'utab_locale'

function normalizeLocale(value: string | null | undefined): Locale | null {
  if (value === 'ja' || value === 'en') return value
  return null
}

function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'ja'
  const lang = navigator.language?.toLowerCase() ?? ''
  return lang.startsWith('ja') ? 'ja' : 'en'
}

export function resolveLocale(): Locale {
  if (typeof window === 'undefined') return 'ja'
  const stored = normalizeLocale(window.localStorage.getItem(STORAGE_KEY))
  return stored ?? detectBrowserLocale()
}

export function persistLocale(locale: Locale) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, locale)
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: resolveLocale(),
  fallbackLocale: 'ja',
  messages,
  missingWarn: false,
  fallbackWarn: false,
})

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  persistLocale(locale)
}
