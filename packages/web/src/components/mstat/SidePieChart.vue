<template>
  <div class="stack">
    <div v-if="!hasData" class="muted">{{ $t('データが不足しています。') }}</div>
    <div v-else ref="container" class="chart" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHighcharts } from '@/composables/useHighcharts'

const props = defineProps<{
  results: any[]
  round: number
  roundName?: string
  totalTeams?: number
}>()

const container = ref<HTMLDivElement | null>(null)
const hasData = ref(true)
const { Highcharts } = useHighcharts()
const { t, locale } = useI18n({ useScope: 'global' })

function collectSides() {
  const counts: Record<string, number> = { gov: 0, opp: 0 }
  const ids = new Set<string>()
  props.results.forEach((result) => {
    result.details?.forEach((detail: any) => {
      if (Number(detail.r) !== props.round) return
      ids.add(String(detail.id))
      if (detail.side === 'gov' && detail.win === 1) {
        counts.gov += 1
      } else if (detail.side === 'opp' && detail.win === 1) {
        counts.opp += 1
      }
    })
  })
  const total = props.totalTeams ?? ids.size
  const absent = Math.max(0, total - ids.size)
  const sum = counts.gov + counts.opp + absent
  if (sum === 0) return []
  return [
    {
      name: t('政府'),
      y: counts.gov / sum,
      num: counts.gov,
      color: 'rgb(237, 168, 123)',
    },
    {
      name: t('反対'),
      y: counts.opp / sum,
      num: counts.opp,
      color: 'rgb(111, 177, 209)',
    },
    {
      name: t('不明'),
      y: absent / sum,
      num: absent,
      color: 'rgb(147, 147, 147)',
    },
  ]
}

function render() {
  if (!container.value) return
  const data = collectSides()
  if (data.length === 0) {
    hasData.value = false
    return
  }
  hasData.value = true
  const roundLabel = props.roundName ?? t('ラウンド {round}', { round: props.round })
  const styles = getComputedStyle(document.documentElement)
  const primary = styles.getPropertyValue('--color-primary').trim() || '#2563eb'
  const warn = styles.getPropertyValue('--color-warn').trim() || '#b45309'
  const muted = styles.getPropertyValue('--color-muted').trim() || '#6b7280'
  data[0].color = warn
  data[1].color = primary
  data[2].color = muted

  Highcharts.chart(container.value, {
    chart: { type: 'pie', backgroundColor: 'transparent' },
    title: { text: t('勝者（{round}）', { round: roundLabel }) },
    plotOptions: {
      pie: {
        allowPointSelect: true,
        cursor: 'pointer',
        dataLabels: {
          enabled: true,
          formatter() {
            const point = (this as any).point
            const percentage = Highcharts.numberFormat(point.percentage, 1)
            return `<b>${point.name}</b>: ${percentage} %<br>${point.num} ${t('チーム')}`
          },
          connectorColor: muted,
        },
      },
    },
    tooltip: { enabled: false },
    series: [{ name: t('勝者'), data, type: 'pie' }],
  })
}

onMounted(render)
watch(
  () => [props.results, props.round, props.totalTeams, locale.value],
  () => render(),
  { deep: true }
)
</script>

<style scoped>
.chart {
  width: 100%;
  min-height: 240px;
}
</style>
