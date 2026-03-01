<template>
  <div class="stack">
    <div v-if="!hasData" class="muted">{{ $t('データが不足しています。') }}</div>
    <div v-else class="stack">
      <div ref="container" class="chart" />
      <p v-if="toleranceBand" class="muted tiny tolerance-band-summary">{{ toleranceBandSummary }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHighcharts } from '@/composables/useHighcharts'

const props = withDefaults(
  defineProps<{
    results: any[]
    round: number
    roundName?: string
    totalTeams?: number
    govLabel?: string
    oppLabel?: string
  }>(),
  {
    govLabel: 'Gov',
    oppLabel: 'Opp',
  }
)

const container = ref<HTMLDivElement | null>(null)
const { Highcharts } = useHighcharts()
const { t, locale } = useI18n({ useScope: 'global' })

type SideCounts = {
  govWins: number
  oppWins: number
  absent: number
  total: number
  sampleSize: number
}

function collectSideCounts(): SideCounts {
  const counts: Record<string, number> = { gov: 0, opp: 0 }
  const ids = new Set<string>()
  props.results.forEach((result) => {
    result.details?.forEach((detail: any) => {
      if (detail.r !== props.round) return
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
  return {
    govWins: counts.gov,
    oppWins: counts.opp,
    absent,
    total: counts.gov + counts.opp + absent,
    sampleSize: counts.gov + counts.opp,
  }
}

const sideCounts = computed(() => collectSideCounts())
const hasData = computed(() => sideCounts.value.total > 0)

function formatPercent(value: number) {
  return String(Math.round(value * 1000) / 10)
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

const toleranceBand = computed(() => {
  const sampleSize = sideCounts.value.sampleSize
  if (!Number.isFinite(sampleSize) || sampleSize < 1) return null
  const z = 1.96
  const margin = z * Math.sqrt(0.25 / sampleSize)
  const lower = Math.max(0, 0.5 - margin)
  const upper = Math.min(1, 0.5 + margin)
  const govRate = sampleSize > 0 ? sideCounts.value.govWins / sampleSize : 0
  const govPct = govRate * 100
  const lowerPct = lower * 100
  const upperPct = upper * 100
  return {
    sampleSize,
    govPct,
    lowerPct,
    upperPct,
    govPctLabel: formatPercent(govRate),
    lowerPctLabel: formatPercent(lower),
    upperPctLabel: formatPercent(upper),
    outside: govRate < lower || govRate > upper,
  }
})

const toleranceBandSummary = computed(() => {
  const band = toleranceBand.value
  if (!band) return ''
  return `${props.govLabel}勝率 ${band.govPctLabel}%（許容帯 ${band.lowerPctLabel}%〜${band.upperPctLabel}%）`
})

function render() {
  if (!container.value) return
  if (!hasData.value) return
  const styles = getComputedStyle(document.documentElement)
  const govColor = styles.getPropertyValue('--color-side-gov-card').trim() || '#eff6ff'
  const oppColor = styles.getPropertyValue('--color-side-opp-card').trim() || '#fffbeb'
  const govStroke = styles.getPropertyValue('--color-primary').trim() || '#2563eb'
  const oppStroke = styles.getPropertyValue('--color-warn').trim() || '#b45309'
  const muted = styles.getPropertyValue('--color-muted').trim() || '#6b7280'
  const text = styles.getPropertyValue('--color-text').trim() || '#1f2937'
  const primary = styles.getPropertyValue('--color-primary').trim() || '#2563eb'
  const danger = styles.getPropertyValue('--color-danger').trim() || '#ef4444'
  const band = toleranceBand.value
  const data = [
    {
      name: props.govLabel,
      y: sideCounts.value.govWins / sideCounts.value.total,
      num: sideCounts.value.govWins,
      color: govColor,
      borderColor: govStroke,
      borderWidth: 2,
    },
    {
      name: props.oppLabel,
      y: sideCounts.value.oppWins / sideCounts.value.total,
      num: sideCounts.value.oppWins,
      color: oppColor,
      borderColor: oppStroke,
      borderWidth: 2,
    },
    {
      name: t('不明'),
      y: sideCounts.value.absent / sideCounts.value.total,
      num: sideCounts.value.absent,
      color: 'rgb(147, 147, 147)',
      borderColor: muted,
      borderWidth: 2,
    },
  ]
  const roundLabel = props.roundName ?? `${t('ラウンド')} ${props.round}`
  const titleStyle = { fontSize: '1.2rem', fontWeight: '700' as const }
  data[2].color = muted

  const ringSeries: any[] = []
  if (band) {
    const before = clampPercent(band.lowerPct)
    const bandWidth = clampPercent(band.upperPct - band.lowerPct)
    const after = clampPercent(100 - before - bandWidth)
    const markerWidth = 1.2
    const markerStart = clampPercent(band.govPct - markerWidth / 2)
    const markerSize = Math.max(0.8, Math.min(markerWidth, 100 - markerStart))
    const markerTail = clampPercent(100 - markerStart - markerSize)
    const bandColor = Highcharts.color(primary).setOpacity(0.15).get('rgba') || 'rgba(37,99,235,0.15)'
    const markerColor = band.outside ? danger : primary

    ringSeries.push(
      {
        name: t('統計的許容帯 (95%)'),
        type: 'pie',
        size: '102%',
        innerSize: '90%',
        dataLabels: { enabled: false },
        enableMouseTracking: false,
        borderWidth: 0,
        zIndex: 0,
        showInLegend: false,
        states: { inactive: { enabled: false }, hover: { enabled: false } },
        data: [
          { y: before, color: 'rgba(0,0,0,0)', borderWidth: 0 },
          { y: bandWidth, color: bandColor, borderWidth: 0 },
          { y: after, color: 'rgba(0,0,0,0)', borderWidth: 0 },
        ],
      },
      {
        name: `${props.govLabel}勝率 ${band.govPctLabel}%`,
        type: 'pie',
        size: '106%',
        innerSize: '102%',
        dataLabels: { enabled: false },
        enableMouseTracking: false,
        borderWidth: 0,
        zIndex: 1,
        showInLegend: false,
        states: { inactive: { enabled: false }, hover: { enabled: false } },
        data: [
          { y: markerStart, color: 'rgba(0,0,0,0)', borderWidth: 0 },
          { y: markerSize, color: markerColor, borderWidth: 0 },
          { y: markerTail, color: 'rgba(0,0,0,0)', borderWidth: 0 },
        ],
      }
    )
  }

  Highcharts.chart(container.value, {
    chart: { type: 'pie', backgroundColor: 'transparent' },
    credits: { enabled: false },
    exporting: { enabled: false },
    legend: { enabled: false },
    title: {
      text: `${t('勝者')}（${roundLabel}）`,
      align: 'center',
      style: titleStyle,
    },
    plotOptions: {
      pie: {
        allowPointSelect: true,
        cursor: 'pointer',
        startAngle: 0,
        dataLabels: {
          enabled: true,
          distance: 16,
          style: { color: text, textOutline: 'none', fontSize: '0.95rem' },
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
    series: [
      ...ringSeries,
      { name: t('勝者'), data, type: 'pie', size: '84%', innerSize: 0, zIndex: 2 },
    ],
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
  min-height: 260px;
}

.tolerance-band-summary {
  margin: 0;
}
</style>
