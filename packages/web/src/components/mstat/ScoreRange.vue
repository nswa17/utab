<template>
  <div class="score-range-stack">
    <div ref="container" class="chart" />
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
  id?: string
  results: any[]
  score: string
}>()

const container = ref<HTMLDivElement | null>(null)
type WinColorLegendItem = {
  key: string
  label: string
  color: string
}
const legendItems = ref<WinColorLegendItem[]>([])
const { Highcharts } = useHighcharts()
const { t, locale } = useI18n({ useScope: 'global' })

function render() {
  if (!container.value) return
  const styles = getComputedStyle(document.documentElement)
  const defaultBarColor = styles.getPropertyValue('--color-primary').trim() || '#2563eb'
  const rows = props.results
    .map((result, index) => {
      const values = result.details
        ?.map((detail: any) => detail[props.score])
        .filter((value: any) => typeof value === 'number') as number[]
      let min: number | null = null
      let max: number | null = null
      if (values && values.length > 0) {
        min = Math.min(...values)
        max = Math.max(...values)
      } else {
        const fallback = result?.[props.score]
        if (typeof fallback === 'number') {
          min = fallback
          max = fallback
        }
      }
      return {
        index,
        name: String(result.name ?? result.id ?? t('エントリー')),
        min,
        max,
        win: resolveWinCount(result),
        spread:
          typeof min === 'number' && typeof max === 'number'
            ? max - min
            : null,
      }
    })
    .sort((a, b) => {
      const leftMax = typeof a.max === 'number' ? a.max : Number.NEGATIVE_INFINITY
      const rightMax = typeof b.max === 'number' ? b.max : Number.NEGATIVE_INFINITY
      if (rightMax !== leftMax) return rightMax - leftMax
      const leftMin = typeof a.min === 'number' ? a.min : Number.NEGATIVE_INFINITY
      const rightMin = typeof b.min === 'number' ? b.min : Number.NEGATIVE_INFINITY
      if (rightMin !== leftMin) return rightMin - leftMin
      const nameDiff = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      return nameDiff !== 0 ? nameDiff : a.index - b.index
    })

  const categories = rows.map((row) => row.name)
  const maxWinCount = rows.reduce((maxValue, row) => Math.max(maxValue, row.win), 0)
  const numericMins = rows
    .map((row) => row.min)
    .filter((value): value is number => typeof value === 'number')
  const numericMaxes = rows
    .map((row) => row.max)
    .filter((value): value is number => typeof value === 'number')
  const chartMin = numericMins.length > 0 ? Math.min(...numericMins) : 0
  const chartMax = numericMaxes.length > 0 ? Math.max(...numericMaxes) : chartMin + 1
  const epsilon = Math.max(0.05, (chartMax - chartMin) * 0.008)
  const data = rows.map((row) => {
    if (typeof row.min === 'number' && typeof row.max === 'number') {
      const highValue = row.max === row.min ? row.max + epsilon : row.max
      return {
        low: row.min,
        high: highValue,
        color: colorByWins(row.win, maxWinCount, defaultBarColor),
      }
    }
    return null
  })

  const options = {
    chart: { type: 'columnrange', inverted: true, backgroundColor: 'transparent' },
    title: { text: t('スコア範囲') },
    xAxis: { categories },
    yAxis: { title: { text: t('スコア') } },
    legend: { enabled: false },
    series: [{ name: t('スコア'), data, type: 'columnrange', minPointLength: 3 }],
  }

  legendItems.value = buildLegendItems(rows, maxWinCount, defaultBarColor, t)

  Highcharts.chart(container.value as HTMLElement, options as any)
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim().length === 0) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function resolveWinCount(result: any): number {
  const directWin = toFiniteNumber(result?.win)
  if (directWin !== null) return directWin
  const details = Array.isArray(result?.details) ? result.details : []
  return details.reduce((total: number, detail: any) => {
    const win = toFiniteNumber(detail?.win)
    return total + (win ?? 0)
  }, 0)
}

function colorByWins(winCount: number, maxWinCount: number, fallbackColor: string): string {
  if (maxWinCount <= 0) return fallbackColor
  const ratio = Math.max(0, Math.min(1, winCount / maxWinCount))
  const hue = 12 + ratio * 108
  const saturation = 72
  const lightness = 58 - ratio * 12
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

function buildLegendItems(
  rows: Array<{ win: number }>,
  maxWinCount: number,
  fallbackColor: string,
  t: (key: string) => string
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

onMounted(render)
watch(
  () => [props.results, props.score, locale.value],
  () => render(),
  { deep: true }
)
</script>

<style scoped>
.score-range-stack {
  display: grid;
  gap: var(--space-2);
}

.chart {
  width: 100%;
  min-height: 280px;
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
