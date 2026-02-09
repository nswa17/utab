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

function render() {
  if (!container.value) return
  const categories = props.results.map((result) => result.name ?? result.id ?? t('エントリー'))
  const data = props.results.map((result) => {
    const values = result.details
      ?.map((detail: any) => detail[props.score])
      .filter((value: any) => typeof value === 'number') as number[]
    if (!values || values.length === 0) {
      const fallback = result?.[props.score]
      return typeof fallback === 'number' ? [fallback, fallback] : null
    }
    const min = Math.min(...values)
    const max = Math.max(...values)
    return [min, max]
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
  () => [props.results, props.score, locale.value],
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
