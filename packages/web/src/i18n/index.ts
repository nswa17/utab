import { createI18n } from 'vue-i18n'
import { messages } from './messages'

export type Locale = 'ja' | 'en'

const STORAGE_KEY = 'utab_locale'

function normalizeLocale(value: string | null | undefined): Locale | null {
  if (value === 'ja' || value === 'en') return value
  return null
}

export function resolveLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  const storage = window.localStorage as Storage | undefined
  const stored = normalizeLocale(
    storage && typeof storage.getItem === 'function' ? storage.getItem(STORAGE_KEY) : null
  )
  return stored ?? 'en'
}

export function persistLocale(locale: Locale) {
  if (typeof window === 'undefined') return
  const storage = window.localStorage as Storage | undefined
  if (storage && typeof storage.setItem === 'function') {
    storage.setItem(STORAGE_KEY, locale)
  }
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: resolveLocale(),
  fallbackLocale: 'en',
  messages,
  missingWarn: false,
  fallbackWarn: false,
})

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  persistLocale(locale)
}
