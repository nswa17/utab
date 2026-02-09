<template>
  <div ref="container" class="chart" />
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHighcharts } from '@/composables/useHighcharts'

const props = defineProps<{
  results: any[]
}>()

const container = ref<HTMLDivElement | null>(null)
const { Highcharts } = useHighcharts()
const { t, locale } = useI18n({ useScope: 'global' })

function render() {
  if (!container.value) return
  const categories = props.results.map((result) => result.name ?? result.id ?? t('チーム'))
  const data = props.results.map((result) => (typeof result.win === 'number' ? result.win : 0))

  const styles = getComputedStyle(document.documentElement)
  const palette = [
    styles.getPropertyValue('--color-primary').trim() || '#2563eb',
    styles.getPropertyValue('--color-success').trim() || '#16a34a',
    styles.getPropertyValue('--color-warn').trim() || '#b45309',
    styles.getPropertyValue('--color-danger').trim() || '#ef4444',
  ]

  Highcharts.chart(container.value, {
    chart: { type: 'column', backgroundColor: 'transparent' },
    title: { text: t('チームの成績') },
    xAxis: { categories },
    yAxis: { title: { text: t('勝利数') }, allowDecimals: false },
    colors: palette,
    series: [{ name: t('勝利数'), data, type: 'column' }],
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
.chart {
  width: 100%;
  min-height: 260px;
}
</style>
