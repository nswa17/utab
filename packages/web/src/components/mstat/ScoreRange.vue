<template>
  <div ref="container" class="chart" />
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHighcharts } from '@/composables/useHighcharts'

const props = defineProps<{
  id?: string
  results: any[]
  score: string
}>()

const container = ref<HTMLDivElement | null>(null)
const { Highcharts } = useHighcharts()
const { t, locale } = useI18n({ useScope: 'global' })
const MIN_CHART_HEIGHT = 360
const ROW_HEIGHT = 22
const CHART_VERTICAL_PADDING = 90

type CandleColorPalette = {
  up: string
  down: string
  flat: string
}

function render() {
  if (!container.value) return
  const styles = getComputedStyle(document.documentElement)
  const candleColors: CandleColorPalette = {
    up: styles.getPropertyValue('--color-success').trim() || '#16a34a',
    down: styles.getPropertyValue('--color-danger').trim() || '#ef4444',
    flat: styles.getPropertyValue('--color-muted').trim() || '#64748b',
  }
  const rows = props.results
    .map((result, index) => {
      const roundScores = ((result.details ?? []) as any[])
        .map((detail: any) => ({
          round: toFiniteNumber(detail?.r),
          score: toFiniteNumber(detail?.[props.score]),
        }))
        .filter(
          (
            item
          ): item is {
            round: number | null
            score: number
          } => item.score !== null
        )
        .sort((left, right) => {
          if (left.round === null && right.round === null) return 0
          if (left.round === null) return 1
          if (right.round === null) return -1
          return left.round - right.round
        })
      const values = roundScores.map((item) => item.score)
      let open: number | null = null
      let close: number | null = null
      let low: number | null = null
      let high: number | null = null
      if (values.length > 0) {
        open = values[0]
        close = values[values.length - 1]
        low = Math.min(...values)
        high = Math.max(...values)
      } else {
        const fallback = result?.[props.score]
        if (typeof fallback === 'number') {
          open = fallback
          close = fallback
          low = fallback
          high = fallback
        }
      }
      return {
        index,
        name: String(result.name ?? result.id ?? t('エントリー')),
        open,
        close,
        low,
        high,
      }
    })
    .sort((a, b) => {
      const leftMax = typeof a.high === 'number' ? a.high : Number.NEGATIVE_INFINITY
      const rightMax = typeof b.high === 'number' ? b.high : Number.NEGATIVE_INFINITY
      if (leftMax !== rightMax) return leftMax - rightMax
      const nameDiff = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      return nameDiff !== 0 ? nameDiff : a.index - b.index
    })

  const categories = rows.map((row) => row.name)
  const chartHeight = Math.max(
    MIN_CHART_HEIGHT,
    categories.length * ROW_HEIGHT + CHART_VERTICAL_PADDING
  )
  const numericMins = rows
    .map((row) => row.low)
    .filter((value): value is number => typeof value === 'number')
  const numericMaxes = rows
    .map((row) => row.high)
    .filter((value): value is number => typeof value === 'number')
  const chartMin = numericMins.length > 0 ? Math.min(...numericMins) : 0
  const chartMax = numericMaxes.length > 0 ? Math.max(...numericMaxes) : chartMin + 1
  const epsilon = Math.max(0.05, (chartMax - chartMin) * 0.008)
  const formatScore = (value: unknown) => {
    const numeric = toFiniteNumber(value)
    if (numeric === null) return '—'
    return Highcharts.numberFormat(numeric, 2)
  }
  const data = rows.map((row, pointIndex) => {
    if (
      typeof row.open === 'number' &&
      typeof row.close === 'number' &&
      typeof row.low === 'number' &&
      typeof row.high === 'number'
    ) {
      const hasRange = row.high !== row.low
      const highValue = hasRange ? row.high : row.high + epsilon
      const lowValue = hasRange ? row.low : Math.max(0, row.low - epsilon)
      const color = colorByOpenClose(row.open, row.close, candleColors)
      return {
        x: pointIndex,
        open: row.open,
        high: highValue,
        low: lowValue,
        close: row.close,
        color,
        lineColor: color,
      }
    }
    return null
  })

  const options = {
    chart: {
      type: 'candlestick',
      inverted: true,
      backgroundColor: 'transparent',
      height: chartHeight,
    },
    title: { text: t('スコア範囲') },
    xAxis: {
      categories,
      labels: { step: 1 },
    },
    yAxis: {
      title: { text: t('スコア') },
      min: chartMin - epsilon,
      max: chartMax + epsilon,
    },
    legend: { enabled: false },
    plotOptions: {
      candlestick: {
        lineWidth: 1.2,
      },
    },
    tooltip: {
      shared: false,
      pointFormatter() {
        const point = this as any
        return [
          `<span style="color:${point.color}">●</span> ${point.series.name}<br/>`,
          `${t('開始得点')}: <b>${formatScore(point.open)}</b><br/>`,
          `${t('最高得点')}: <b>${formatScore(point.high)}</b><br/>`,
          `${t('最低得点')}: <b>${formatScore(point.low)}</b><br/>`,
          `${t('終了得点')}: <b>${formatScore(point.close)}</b>`,
        ].join('')
      },
    },
    series: [
      {
        name: t('スコア'),
        data,
        type: 'candlestick',
        color: candleColors.down,
        upColor: candleColors.up,
        lineColor: candleColors.down,
        upLineColor: candleColors.up,
      },
    ],
  }

  Highcharts.chart(container.value as HTMLElement, options as any)
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim().length === 0) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function colorByOpenClose(open: number, close: number, colors: CandleColorPalette): string {
  if (close > open) return colors.down
  if (close < open) return colors.up
  return colors.flat
}

onMounted(render)
watch(
  () => [props.results, props.score, locale.value],
  () => render(),
  { deep: true }
)
</script>

<style scoped>
.chart {
  width: 100%;
  min-height: 320px;
}
</style>
