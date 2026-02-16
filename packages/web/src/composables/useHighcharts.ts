import Highcharts from 'highcharts'
import HighchartsMore from 'highcharts/highcharts-more'
import HighchartsExporting from 'highcharts/modules/exporting'

let initialized = false

export function useHighcharts() {
  if (!initialized) {
    HighchartsMore(Highcharts)
    HighchartsExporting(Highcharts)
    initialized = true
  }
  return { Highcharts }
}
