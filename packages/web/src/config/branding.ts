import defaultLogoUrl from '@/assets/logo.svg'

const DEFAULT_BRAND_NAME = 'UTab'

function normalizeEnvString(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function resolveBrandName(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_BRAND_NAME
  return value.trim()
}

const configuredBrandName = resolveBrandName(import.meta.env.VITE_BRAND_NAME)
const configuredBrandLogoUrl = normalizeEnvString(import.meta.env.VITE_BRAND_LOGO_URL)

export const BRAND_NAME = configuredBrandName
export const BRAND_LOGO_URL = configuredBrandLogoUrl || defaultLogoUrl
export const BRAND_HOME_ARIA_LABEL = BRAND_NAME.length > 0 ? `${BRAND_NAME} home` : 'home'
