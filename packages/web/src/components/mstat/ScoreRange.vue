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
  sortBy?: 'none' | 'name' | 'min' | 'max' | 'spread'
  sortDirection?: 'asc' | 'desc'
}>()

const container = ref<HTMLDivElement | null>(null)
const { Highcharts } = useHighcharts()
const { t, locale } = useI18n({ useScope: 'global' })

function render() {
  if (!container.value) return
  const direction = props.sortDirection === 'desc' ? -1 : 1
  const sortBy = props.sortBy ?? 'none'
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
        spread:
          typeof min === 'number' && typeof max === 'number'
            ? max - min
            : null,
      }
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        const diff = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        return diff !== 0 ? direction * diff : a.index - b.index
      }
      if (sortBy === 'min' || sortBy === 'max' || sortBy === 'spread') {
        const left = a[sortBy]
        const right = b[sortBy]
        const missingValue = direction === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
        const leftNumber = typeof left === 'number' ? left : missingValue
        const rightNumber = typeof right === 'number' ? right : missingValue
        const diff = leftNumber - rightNumber
        return diff !== 0 ? direction * diff : a.index - b.index
      }
      return a.index - b.index
    })

  const categories = rows.map((row) => row.name)
  const data = rows.map((row) => {
    if (typeof row.min === 'number' && typeof row.max === 'number') {
      return [row.min, row.max]
    }
    return null
  })

  const options = {
    chart: { type: 'columnrange', inverted: true, backgroundColor: 'transparent' },
    title: { text: t('スコア範囲') },
    xAxis: { categories },
    yAxis: { title: { text: t('スコア') } },
    legend: { enabled: false },
    colors: (() => {
      const styles = getComputedStyle(document.documentElement)
      return [
        styles.getPropertyValue('--color-primary').trim() || '#2563eb',
        styles.getPropertyValue('--color-success').trim() || '#16a34a',
        styles.getPropertyValue('--color-warn').trim() || '#b45309',
        styles.getPropertyValue('--color-danger').trim() || '#ef4444',
      ]
    })(),
    series: [{ name: t('スコア'), data, type: 'columnrange' }],
  }

  Highcharts.chart(container.value as HTMLElement, options as any)
}

onMounted(render)
watch(
  () => [props.results, props.score, props.sortBy, props.sortDirection, locale.value],
  () => render(),
  { deep: true }
)
</script>

<style scoped>
.chart {
  width: 100%;
  min-height: 280px;
}
</style>
