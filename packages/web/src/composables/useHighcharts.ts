import Highcharts from 'highcharts'
import HighchartsMore from 'highcharts/highcharts-more'
import HighchartsExporting from 'highcharts/modules/exporting'
import HighchartsHeatmap from 'highcharts/modules/heatmap'

let initialized = false

export function useHighcharts() {
  if (!initialized) {
    HighchartsMore(Highcharts)
    HighchartsExporting(Highcharts)
    HighchartsHeatmap(Highcharts)
    initialized = true
  }
  return { Highcharts }
}
