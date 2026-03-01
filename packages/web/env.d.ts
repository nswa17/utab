/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_ADMIN_REPORTS_UX_V3?: string
  readonly VITE_APP_TITLE?: string
  readonly VITE_BRAND_NAME?: string
  readonly VITE_BRAND_LOGO_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>
  export default component
}

declare module 'highcharts/highcharts-more' {
  import Highcharts from 'highcharts'
  const init: (hc: typeof Highcharts) => void
  export default init
}

declare module 'highcharts/modules/exporting' {
  import Highcharts from 'highcharts'
  const init: (hc: typeof Highcharts) => void
  export default init
}
