<template>
  <div ref="container" class="chart" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Options } from 'highcharts'
import { useI18n } from 'vue-i18n'
import { useHighcharts } from '@/composables/useHighcharts'

const props = defineProps<{
  results: any[]
  rounds?: Array<{ round: number; name?: string }>
}>()

const container = ref<HTMLDivElement | null>(null)
const { Highcharts } = useHighcharts()
const { t, locale } = useI18n({ useScope: 'global' })

const roundList = computed(() => {
  if (props.rounds && props.rounds.length > 0) {
    return props.rounds.slice().sort((a, b) => a.round - b.round)
  }
  const set = new Set<number>()
  props.results.forEach((result) => {
    result.details?.forEach((detail: any) => {
      const r = Number(detail.r)
      if (Number.isFinite(r)) set.add(r)
    })
  })
  return Array.from(set)
    .sort((a, b) => a - b)
    .map((round) => ({ round, name: t('ラウンド {round}', { round }) }))
})

function roundIndex(roundValue: number) {
  return roundList.value.findIndex((item) => item.round === roundValue)
}

function render() {
  if (!container.value) return
  const govData: Array<[number, number]> = []
  const oppData: Array<[number, number]> = []
  props.results.forEach((result) => {
    result.details?.forEach((detail: any) => {
      const roundValue = Number(detail.r)
      const index = roundIndex(roundValue)
      if (index < 0) return
      if (typeof detail.sum !== 'number') return
      if (detail.side === 'gov') {
        govData.push([index + 0.05, detail.sum])
      } else if (detail.side === 'opp') {
        oppData.push([index - 0.05, detail.sum])
      }
    })
  })

  const categories = roundList.value.map(
    (item) => item.name ?? t('ラウンド {round}', { round: item.round })
  )

  const styles = getComputedStyle(document.documentElement)
  const palette = [
    styles.getPropertyValue('--color-primary').trim() || '#2563eb',
    styles.getPropertyValue('--color-success').trim() || '#16a34a',
    styles.getPropertyValue('--color-warn').trim() || '#b45309',
    styles.getPropertyValue('--color-danger').trim() || '#ef4444',
  ]
  const surface = styles.getPropertyValue('--color-surface').trim() || '#ffffff'
  const border = styles.getPropertyValue('--color-border').trim() || '#e5e7eb'

  Highcharts.chart(container.value as HTMLElement, {
    chart: { type: 'scatter', backgroundColor: 'transparent', zoomType: 'xy' },
    title: { text: t('サイド別スコア') },
    xAxis: {
      title: { text: '' },
      categories,
      startOnTick: true,
      endOnTick: true,
      showLastLabel: true,
    },
    yAxis: { title: { text: t('スコア') } },
    legend: {
      layout: 'vertical',
      align: 'left',
      verticalAlign: 'top',
      x: 80,
      y: 40,
      floating: true,
      backgroundColor: surface,
      borderColor: border,
      borderWidth: 1,
    },
    plotOptions: {
      scatter: {
        marker: {
          radius: 5,
          states: {
            hover: { enabled: true, lineColor: 'rgb(100,100,100)' },
          },
        },
        states: { hover: { marker: { enabled: false } } },
        tooltip: {
          headerFormat: '<b>{series.name}</b><br>',
          pointFormatter() {
            const value = Highcharts.numberFormat((this as any).y, 2)
            return t('{value} 点', { value })
          },
        },
      },
    },
    colors: palette,
    series: [
      {
        name: t('政府'),
        type: 'scatter',
        color: palette[0] + '80',
        data: govData,
      },
      {
        name: t('反対'),
        type: 'scatter',
        color: palette[1] + '80',
        data: oppData,
      },
    ],
  } as Options)
}

onMounted(render)
watch(
  () => [props.results, props.rounds, locale.value],
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
