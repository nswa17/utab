import Highcharts from 'highcharts'
import HighchartsMore from 'highcharts/highcharts-more'
import HighchartsExporting from 'highcharts/modules/exporting'
import HighchartsStock from 'highcharts/modules/stock'

let initialized = false

export function useHighcharts() {
  if (!initialized) {
    HighchartsMore(Highcharts)
    HighchartsExporting(Highcharts)
    HighchartsStock(Highcharts)
    initialized = true
  }
  return { Highcharts }
}
