import defaultLogoUrl from '@/assets/logo.svg'

const DEFAULT_BRAND_NAME = 'UTab'
const DEFAULT_APP_TITLE = 'UTab'

function normalizeEnvString(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function resolveBrandName(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_BRAND_NAME
  return value.trim()
}

function resolveAppTitle(value: unknown, brandName: string): string {
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized.length > 0) return normalized
  }
  if (brandName.length > 0) return brandName
  return DEFAULT_APP_TITLE
}

const configuredBrandName = resolveBrandName(import.meta.env.VITE_BRAND_NAME)
const configuredBrandLogoUrl = normalizeEnvString(import.meta.env.VITE_BRAND_LOGO_URL)
const configuredAppTitle = resolveAppTitle(import.meta.env.VITE_APP_TITLE, configuredBrandName)

export const BRAND_NAME = configuredBrandName
export const BRAND_LOGO_URL = configuredBrandLogoUrl || defaultLogoUrl
export const APP_TITLE = configuredAppTitle
export const BRAND_HOME_ARIA_LABEL =
  BRAND_NAME.length > 0 ? `${BRAND_NAME} home` : `${APP_TITLE} home`
