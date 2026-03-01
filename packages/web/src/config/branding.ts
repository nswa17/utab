import defaultLogoUrl from '@/assets/logo.svg'

const DEFAULT_BRAND_NAME = 'UTab'

function normalizeEnvString(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const configuredBrandName = normalizeEnvString(import.meta.env.VITE_BRAND_NAME)
const configuredBrandLogoUrl = normalizeEnvString(import.meta.env.VITE_BRAND_LOGO_URL)

export const BRAND_NAME = configuredBrandName || DEFAULT_BRAND_NAME
export const BRAND_LOGO_URL = configuredBrandLogoUrl || defaultLogoUrl
export const BRAND_HOME_ARIA_LABEL = `${BRAND_NAME} home`
