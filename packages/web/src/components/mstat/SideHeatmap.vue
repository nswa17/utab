<template>
  <div v-if="hasData" ref="container" class="chart" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Options, SeriesHeatmapOptions } from 'highcharts'
import { useHighcharts } from '@/composables/useHighcharts'

const props = defineProps<{
  results: any[]
  round: number
  roundName?: string
  labels?: Record<string, string>
}>()

const container = ref<HTMLDivElement | null>(null)
const { Highcharts } = useHighcharts()
const { t, locale } = useI18n({ useScope: 'global' })

const sortedResults = computed(() =>
  props.results.slice().sort((a, b) => (a.ranking ?? 0) - (b.ranking ?? 0))
)
const categories = computed(() => sortedResults.value.map((result) => String(result.id)))
const nameById = computed(() => props.labels ?? {})

const hasData = computed(() =>
  sortedResults.value.some((result) =>
    result.details?.some((detail: any) => Number(detail.r) === props.round)
  )
)

function buildSeries(): SeriesHeatmapOptions[] {
  const cats = categories.value
  const data: Array<[number, number, number | null]> = []
  for (let i = 0; i < cats.length; i += 1) {
    for (let j = 0; j < cats.length; j += 1) {
      data.push([i, j, i >= j ? null : 0])
    }
  }

  sortedResults.value.forEach((result) => {
    result.details?.forEach((detail: any) => {
      if (Number(detail.r) !== props.round) return
      const thisIndex = cats.findIndex((id) => id === String(detail.id))
      const opponentId = Array.isArray(detail.opponents) ? detail.opponents[0] : undefined
      const thatIndex = cats.findIndex((id) => id === String(opponentId))
      if (thisIndex < 0 || thatIndex < 0) return
      const i = detail.side === 'gov' ? thisIndex : thatIndex
      const j = detail.side === 'gov' ? thatIndex : thisIndex
      const entry = data.find((cell) => cell[0] === Math.min(i, j) && cell[1] === Math.max(i, j))
      if (!entry) return
      if (i < j) {
        entry[2] = detail.win === 1 ? -1 : 1
      } else {
        entry[2] = detail.win === 1 ? 1 : -1
      }
    })
  })

  return [
    {
      type: 'heatmap',
      name: t('Gov勝利'),
      borderWidth: 0,
      nullColor: '#efefef',
      data,
    },
  ]
}

function render() {
  if (!container.value || !hasData.value) return
  const cats = categories.value
  const labels = cats.map((id) => nameById.value[id] ?? id)
  const roundLabel = props.roundName ?? t('ラウンド {round}', { round: props.round })
  const styles = getComputedStyle(document.documentElement)
  const primary = styles.getPropertyValue('--color-primary').trim() || '#2563eb'
  const warn = styles.getPropertyValue('--color-warn').trim() || '#b45309'
  const surface = styles.getPropertyValue('--color-surface').trim() || '#ffffff'
  const muted = styles.getPropertyValue('--color-muted').trim() || '#6b7280'

  const series = buildSeries()
  if (series[0]) {
    series[0].nullColor = surface
  }

  Highcharts.chart(container.value as HTMLElement, {
    chart: { type: 'heatmap', marginTop: 40, marginBottom: 80, plotBorderWidth: 1 },
    title: { text: t('チームペアのGov勝利（{round}）', { round: roundLabel }) },
    xAxis: { title: { text: '' }, categories: labels },
    yAxis: { title: { text: '' }, categories: labels },
    plotOptions: {
      heatmap: {
        tooltip: {
          headerFormat: '',
          pointFormatter() {
            const value = (this as any).value
            if (value === 1) return t('勝ち')
            if (value === -1) return t('負け')
            return t('未定')
          },
        },
      },
    },
    colorAxis: {
      reversed: false,
      min: -1,
      max: 1,
      stops: [
        [0, primary],
        [0.5, surface],
        [1, warn],
      ],
      labels: {
        enabled: true,
        formatter() {
          if ((this as any).value === 1) return t('勝ち')
          if ((this as any).value === -1) return t('負け')
          return ''
        },
      },
    },
    legend: {
      align: 'right',
      layout: 'vertical',
      margin: 0,
      verticalAlign: 'top',
      y: 25,
      symbolHeight: 280,
      itemStyle: { color: muted },
    },
    series,
  } as Options)
}

onMounted(render)
watch(
  () => [props.results, props.round, props.labels, locale.value],
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
