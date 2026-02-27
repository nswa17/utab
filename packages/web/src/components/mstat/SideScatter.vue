<template>
  <div ref="container" class="chart" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Options } from 'highcharts'
import { useI18n } from 'vue-i18n'
import { useHighcharts } from '@/composables/useHighcharts'

const props = withDefaults(
  defineProps<{
    results: any[]
    rounds?: Array<{ round: number; name?: string }>
    showTitle?: boolean
    govLabel?: string
    oppLabel?: string
  }>(),
  {
    showTitle: true,
    govLabel: 'Gov',
    oppLabel: 'Opp',
  }
)

const container = ref<HTMLDivElement | null>(null)
const { Highcharts } = useHighcharts()
const { t, locale } = useI18n({ useScope: 'global' })

const roundList = computed(() => {
  if (props.rounds && props.rounds.length > 0) {
    return props.rounds
      .filter((item) => Number.isInteger(item.round) && item.round >= 1)
      .slice()
      .sort((a, b) => a.round - b.round)
  }
  const set = new Set<number>()
  props.results.forEach((result) => {
    result.details?.forEach((detail: any) => {
      if (Number.isInteger(detail.r) && detail.r >= 1) set.add(detail.r)
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
      const index = roundIndex(detail.r)
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
  const govColor = styles.getPropertyValue('--color-side-gov-card').trim() || '#eff6ff'
  const oppColor = styles.getPropertyValue('--color-side-opp-card').trim() || '#fffbeb'
  const govStroke = styles.getPropertyValue('--color-primary').trim() || '#2563eb'
  const oppStroke = styles.getPropertyValue('--color-warn').trim() || '#b45309'
  const surface = styles.getPropertyValue('--color-surface').trim() || '#ffffff'
  const border = styles.getPropertyValue('--color-border').trim() || '#e5e7eb'

  Highcharts.chart(container.value as HTMLElement, {
    chart: { type: 'scatter', backgroundColor: 'transparent', zoomType: 'xy' },
    credits: { enabled: false },
    exporting: { enabled: false },
    title: {
      text: props.showTitle ? t('サイド別スコア') : undefined,
      align: 'center',
      style: { fontSize: '1.2rem', fontWeight: '700' as const },
    },
    xAxis: {
      title: { text: '' },
      categories,
      min: categories.length > 0 ? -0.5 : undefined,
      max: categories.length > 0 ? categories.length - 0.5 : undefined,
      tickPositions: categories.map((_, index) => index),
      startOnTick: false,
      endOnTick: false,
      showLastLabel: true,
    },
    yAxis: { title: { text: t('スコア') } },
    legend: {
      layout: 'horizontal',
      align: 'center',
      verticalAlign: 'bottom',
      floating: false,
      backgroundColor: surface,
      borderColor: border,
      borderWidth: 1,
    },
    plotOptions: {
      scatter: {
        marker: {
          radius: 7,
          lineWidth: 2,
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
    series: [
      {
        name: props.govLabel,
        type: 'scatter',
        color: govColor,
        marker: { fillColor: govColor, lineColor: govStroke },
        data: govData,
      },
      {
        name: props.oppLabel,
        type: 'scatter',
        color: oppColor,
        marker: { fillColor: oppColor, lineColor: oppStroke },
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
  min-height: 320px;
}
</style>
