<template>
  <div class="team-performance-grid">
    <div ref="winContainer" class="chart" />
    <div ref="pointContainer" class="chart" />
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

const winContainer = ref<HTMLDivElement | null>(null)
const pointContainer = ref<HTMLDivElement | null>(null)
const { Highcharts } = useHighcharts()
const { t, locale } = useI18n({ useScope: 'global' })
const sortCollator = new Intl.Collator(['ja', 'en'], { sensitivity: 'base', numeric: true })

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

function sortRows(rows: TeamPerformanceRow[], metric: 'win' | 'sum'): TeamPerformanceRow[] {
  return rows.slice().sort((left, right) => {
    const primary = right[metric] - left[metric]
    if (primary !== 0) return primary
    if (metric === 'win') {
      const secondary = right.sum - left.sum
      if (secondary !== 0) return secondary
    } else {
      const secondary = right.win - left.win
      if (secondary !== 0) return secondary
    }
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
    metric: 'win' | 'sum'
  }
) {
  if (!container) return
  const categories = config.rows.map((row) => row.name)
  const data = config.rows.map((row) => row[config.metric])

  const styles = getComputedStyle(document.documentElement)
  const palette = [
    styles.getPropertyValue('--color-primary').trim() || '#2563eb',
    styles.getPropertyValue('--color-success').trim() || '#16a34a',
    styles.getPropertyValue('--color-warn').trim() || '#b45309',
    styles.getPropertyValue('--color-danger').trim() || '#ef4444',
  ]

  Highcharts.chart(container, {
    chart: { type: 'bar', backgroundColor: 'transparent' },
    title: { text: config.title },
    xAxis: { categories },
    yAxis: {
      title: { text: config.yAxisLabel },
      allowDecimals: config.metric === 'win' ? false : true,
    },
    colors: palette,
    legend: { enabled: false },
    series: [{ name: config.seriesName, data, type: 'bar' }],
    credits: { enabled: false },
  })
}

function render() {
  const rows = buildRows()
  renderChart(winContainer.value, {
    title: t('チーム成績（勝利数）'),
    yAxisLabel: t('勝利数'),
    seriesName: t('勝利数'),
    rows: sortRows(rows, 'win'),
    metric: 'win',
  })
  renderChart(pointContainer.value, {
    title: t('チーム成績（得点）'),
    yAxisLabel: t('得点'),
    seriesName: t('得点'),
    rows: sortRows(rows, 'sum'),
    metric: 'sum',
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
.team-performance-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.chart {
  width: 100%;
  min-height: 320px;
}

@media (max-width: 980px) {
  .team-performance-grid {
    grid-template-columns: 1fr;
  }
}
</style>
