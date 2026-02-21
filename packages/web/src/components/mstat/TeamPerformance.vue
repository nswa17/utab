<template>
  <div class="team-performance-stack">
    <div ref="pointContainer" class="chart" />
    <div v-if="legendItems.length > 0" class="win-color-legend">
      <p class="muted small win-color-legend-title">{{ $t('凡例') }} ({{ $t('勝利数') }})</p>
      <div class="win-color-legend-items">
        <span v-for="item in legendItems" :key="item.key" class="win-color-legend-item">
          <span class="win-color-legend-swatch" :style="{ backgroundColor: item.color }" />
          <span>{{ item.label }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHighcharts } from '@/composables/useHighcharts'

const props = defineProps<{
  results: any[]
}>()

type TeamPerformanceRow = {
  name: string
  win: number
  sum: number
}
type WinColorLegendItem = {
  key: string
  label: string
  color: string
}

const pointContainer = ref<HTMLDivElement | null>(null)
const legendItems = ref<WinColorLegendItem[]>([])
const { Highcharts } = useHighcharts()
const { t, locale } = useI18n({ useScope: 'global' })
const sortCollator = new Intl.Collator(['ja', 'en'], { sensitivity: 'base', numeric: true })
const MIN_CHART_HEIGHT = 320
const ROW_HEIGHT = 24
const CHART_VERTICAL_PADDING = 120

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function buildRows(): TeamPerformanceRow[] {
  return props.results.map((result) => ({
    name: String(result.name ?? result.id ?? t('チーム')),
    win: toFiniteNumber(result.win),
    sum: toFiniteNumber(result.sum),
  }))
}

function sortRows(rows: TeamPerformanceRow[]): TeamPerformanceRow[] {
  return rows.slice().sort((left, right) => {
    const primary = right.sum - left.sum
    if (primary !== 0) return primary
    const secondary = right.win - left.win
    if (secondary !== 0) return secondary
    return sortCollator.compare(left.name, right.name)
  })
}

function renderChart(
  container: HTMLDivElement | null,
  config: {
    title: string
    yAxisLabel: string
    seriesName: string
    rows: TeamPerformanceRow[]
    maxWinCount: number
    fallbackColor: string
    chartHeight: number
  }
) {
  if (!container) return
  const categories = config.rows.map((row) => row.name)
  const data = config.rows.map((row) => ({
    y: row.sum,
    color: colorByWins(row.win, config.maxWinCount, config.fallbackColor),
  }))

  Highcharts.chart(container, {
    chart: { type: 'bar', backgroundColor: 'transparent', height: config.chartHeight },
    title: {
      text: config.title,
      align: 'center',
      style: { fontSize: '1.2rem', fontWeight: '700' as const },
    },
    xAxis: {
      categories,
      labels: { step: 1 },
    },
    yAxis: {
      title: { text: config.yAxisLabel },
      allowDecimals: true,
    },
    legend: { enabled: false },
    series: [{ name: config.seriesName, data, type: 'bar' }],
    credits: { enabled: false },
  })
}

function buildLegendItems(
  rows: TeamPerformanceRow[],
  maxWinCount: number,
  fallbackColor: string
): WinColorLegendItem[] {
  const wins = Array.from(
    new Set(
      rows
        .map((row) => row.win)
        .filter((value) => Number.isFinite(value))
    )
  ).sort((left, right) => right - left)
  return wins.map((winCount) => ({
    key: String(winCount),
    label: `${t('勝利数')}: ${formatWinCount(winCount)}`,
    color: colorByWins(winCount, maxWinCount, fallbackColor),
  }))
}

function formatWinCount(value: number): string {
  if (Number.isInteger(value)) return String(value)
  const rounded = Math.round(value * 100) / 100
  return String(rounded)
}

function colorByWins(winCount: number, maxWinCount: number, fallbackColor: string): string {
  if (maxWinCount <= 0) return fallbackColor
  const ratio = Math.max(0, Math.min(1, winCount / maxWinCount))
  const hue = 12 + ratio * 108
  const saturation = 72
  const lightness = 58 - ratio * 12
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

function render() {
  const rows = sortRows(buildRows())
  const styles = getComputedStyle(document.documentElement)
  const defaultBarColor = styles.getPropertyValue('--color-primary').trim() || '#2563eb'
  const maxWinCount = rows.reduce((maxValue, row) => Math.max(maxValue, row.win), 0)
  const chartHeight = Math.max(
    MIN_CHART_HEIGHT,
    rows.length * ROW_HEIGHT + CHART_VERTICAL_PADDING
  )
  legendItems.value = buildLegendItems(rows, maxWinCount, defaultBarColor)
  renderChart(pointContainer.value, {
    title: t('チーム成績'),
    yAxisLabel: t('得点'),
    seriesName: t('得点'),
    rows,
    maxWinCount,
    fallbackColor: defaultBarColor,
    chartHeight,
  })
}

onMounted(render)
watch(
  () => [props.results, locale.value],
  () => render(),
  { deep: true }
)
</script>

<style scoped>
.team-performance-stack {
  display: grid;
  gap: var(--space-2);
}

.chart {
  width: 100%;
  min-height: 320px;
}

.win-color-legend {
  display: grid;
  gap: 6px;
}

.win-color-legend-title {
  margin: 0;
}

.win-color-legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.win-color-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-muted);
}

.win-color-legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid rgba(15, 23, 42, 0.18);
}
</style>
