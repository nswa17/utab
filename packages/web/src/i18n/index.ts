import { createI18n } from 'vue-i18n'
import { messages } from './messages'

export type Locale = 'ja' | 'en'

const STORAGE_KEY = 'utab_locale'

function normalizeLocale(value: string | null | undefined): Locale | null {
  if (value === 'ja' || value === 'en') return value
  return null
}

function resolveBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  if (import.meta.env.VITEST) return null
  try {
    const storage = window.localStorage as Storage | undefined
    return storage ?? null
  } catch {
    return null
  }
}

export function resolveLocale(): Locale {
  const storage = resolveBrowserStorage()
  const stored = normalizeLocale(
    storage && typeof storage.getItem === 'function' ? storage.getItem(STORAGE_KEY) : null
  )
  return stored ?? 'en'
}

export function persistLocale(locale: Locale) {
  const storage = resolveBrowserStorage()
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
