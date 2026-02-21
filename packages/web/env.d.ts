/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_ADMIN_UI_V2?: string
  readonly VITE_ADMIN_UI_LEGACY_READONLY?: string
  readonly VITE_ADMIN_COMPILE_MANUAL_SAVE_V1?: string
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
