<template>
  <div ref="container" class="chart" />
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHighcharts } from '@/composables/useHighcharts'

const props = defineProps<{
  results: any[]
  score: string
  round?: number
  roundName?: string
}>()

const container = ref<HTMLDivElement | null>(null)
const { Highcharts } = useHighcharts()
const { t, locale } = useI18n({ useScope: 'global' })

function collectScores() {
  const values: number[] = []
  props.results.forEach((result) => {
    if (Array.isArray(result.details) && result.details.length > 0) {
      result.details.forEach((detail: any) => {
        if (props.round !== undefined && detail.r !== props.round) return
        const value = detail?.[props.score]
        if (typeof value === 'number') values.push(value)
      })
      return
    }
    const fallback = result?.[props.score]
    if (typeof fallback === 'number') values.push(fallback)
  })
  return values
}

function render() {
  if (!container.value) return
  const scores = collectScores()
  const buckets = new Map<number, number>()
  scores.forEach((value) => {
    const key = Math.round(value)
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  })
  const keys = Array.from(buckets.keys()).sort((a, b) => a - b)
  const data = keys.map((key) => buckets.get(key) ?? 0)
  const roundLabel =
    props.roundName ??
    (props.round !== undefined ? t('ラウンド {round}', { round: props.round }) : '')
  const titleText = props.round !== undefined ? t('スコアヒストグラム（{round}）', { round: roundLabel }) : t('スコアヒストグラム')
  const titleStyle = { fontSize: '1.2rem', fontWeight: '700' as const }

  const styles = getComputedStyle(document.documentElement)
  const palette = [
    styles.getPropertyValue('--color-primary').trim() || '#2563eb',
    styles.getPropertyValue('--color-success').trim() || '#16a34a',
    styles.getPropertyValue('--color-warn').trim() || '#b45309',
    styles.getPropertyValue('--color-danger').trim() || '#ef4444',
  ]

  Highcharts.chart(container.value, {
    chart: { type: 'column', backgroundColor: 'transparent' },
    title: { text: titleText, align: 'center', style: titleStyle },
    xAxis: { categories: keys.map((key) => key.toString()), title: { text: t('スコア') } },
    yAxis: { title: { text: t('件数') }, allowDecimals: false },
    colors: palette,
    series: [{ name: t('件数'), data, type: 'column' }],
  })
}

onMounted(render)
watch(
  () => [props.results, props.score, props.round, props.roundName, locale.value],
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
