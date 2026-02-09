/// <reference types="vite/client" />

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
