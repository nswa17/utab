<template>
  <div class="team-performance-stack">
    <div ref="pointContainer" class="chart" />
    <div v-if="showLegend && legendItems.length > 0" class="win-color-legend">
      <p class="muted small win-color-legend-title">{{ $t('凡例') }} ({{ legendLabel }})</p>
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
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHighcharts } from '@/composables/useHighcharts'

const props = withDefaults(
  defineProps<{
    results: any[]
    title?: string
    scoreKey?: string
    valueLabel?: string
    colorKey?: string
    legendLabel?: string
    showLegend?: boolean
  }>(),
  {
    title: '',
    scoreKey: 'sum',
    valueLabel: '',
    colorKey: 'win',
    legendLabel: '',
    showLegend: true,
  }
)

type TeamPerformanceRow = {
  name: string
  colorMetric: number
  value: number
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
    colorMetric: toFiniteNumber(result[props.colorKey]),
    value: toFiniteNumber(result[props.scoreKey]),
  }))
}

function sortRows(rows: TeamPerformanceRow[]): TeamPerformanceRow[] {
  return rows.slice().sort((left, right) => {
    const primary = right.value - left.value
    if (primary !== 0) return primary
    const secondary = right.colorMetric - left.colorMetric
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
    maxColorMetric: number
    fallbackColor: string
    chartHeight: number
  }
) {
  if (!container) return
  const categories = config.rows.map((row) => row.name)
  const data = config.rows.map((row) => ({
    y: row.value,
    color: colorByMetric(row.colorMetric, config.maxColorMetric, config.fallbackColor),
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
  maxColorMetric: number,
  fallbackColor: string
): WinColorLegendItem[] {
  const metrics = Array.from(
    new Set(
      rows
        .map((row) => row.colorMetric)
        .filter((value) => Number.isFinite(value))
    )
  ).sort((left, right) => right - left)
  return metrics.map((metric) => ({
    key: String(metric),
    label: `${legendLabel.value}: ${formatMetric(metric)}`,
    color: colorByMetric(metric, maxColorMetric, fallbackColor),
  }))
}

function formatMetric(value: number): string {
  if (Number.isInteger(value)) return String(value)
  const rounded = Math.round(value * 100) / 100
  return String(rounded)
}

function colorByMetric(metric: number, maxColorMetric: number, fallbackColor: string): string {
  if (maxColorMetric <= 0) return fallbackColor
  const ratio = Math.max(0, Math.min(1, metric / maxColorMetric))
  const hue = 12 + ratio * 108
  const saturation = 72
  const lightness = 58 - ratio * 12
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

const chartTitle = computed(() => props.title || t('チーム成績'))
const valueLabel = computed(() => props.valueLabel || t('得点'))
const legendLabel = computed(() => props.legendLabel || t('勝利数'))
const showLegend = computed(() => props.showLegend)

function render() {
  const rows = sortRows(buildRows())
  const styles = getComputedStyle(document.documentElement)
  const defaultBarColor = styles.getPropertyValue('--color-primary').trim() || '#2563eb'
  const maxColorMetric = rows.reduce((maxValue, row) => Math.max(maxValue, row.colorMetric), 0)
  const chartHeight = Math.max(
    MIN_CHART_HEIGHT,
    rows.length * ROW_HEIGHT + CHART_VERTICAL_PADDING
  )
  legendItems.value = showLegend.value
    ? buildLegendItems(rows, maxColorMetric, defaultBarColor)
    : []
  renderChart(pointContainer.value, {
    title: chartTitle.value,
    yAxisLabel: valueLabel.value,
    seriesName: valueLabel.value,
    rows,
    maxColorMetric,
    fallbackColor: defaultBarColor,
    chartHeight,
  })
}

onMounted(render)
watch(
  () => [props.results, props.title, props.scoreKey, props.valueLabel, props.colorKey, props.legendLabel, props.showLegend, locale.value],
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
