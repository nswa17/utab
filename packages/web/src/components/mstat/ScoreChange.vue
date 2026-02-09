<template>
  <div ref="container" class="chart" />
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHighcharts } from '@/composables/useHighcharts'

type RoundEntry = { r: number; name: string }

const props = withDefaults(
  defineProps<{
    id?: string
    results: any[]
    tournament?: any
    score?: string
    marker?: { key: string; value: unknown }
  }>(),
  { score: 'average' }
)

const container = ref<HTMLDivElement | null>(null)
const { Highcharts } = useHighcharts()
const { t, locale } = useI18n({ useScope: 'global' })

function extractRounds(): RoundEntry[] {
  if (props.tournament?.rounds?.length) {
    return props.tournament.rounds.map((round: any) => ({
      r: round.r ?? round.round ?? round.id,
      name:
        round.name ??
        t('ラウンド {round}', { round: round.r ?? round.round ?? round.id ?? 0 }),
    }))
  }
  const rounds = new Set<number>()
  props.results.forEach((result) => {
    result.details?.forEach((detail: any) => {
      if (typeof detail.r === 'number') rounds.add(detail.r)
    })
  })
  return Array.from(rounds)
    .sort((a, b) => a - b)
    .map((round) => ({ r: round, name: t('ラウンド {round}', { round }) }))
}

function render() {
  if (!container.value) return
  const rounds = extractRounds()
  const safeRounds: RoundEntry[] = rounds.length > 0 ? rounds : [{ r: 1, name: t('合計') }]
  const series = props.results.map((result) => {
    const name = result.name ?? result.id ?? t('エントリー')
    const data = safeRounds.map((round: RoundEntry) => {
      const detail = result.details?.find((d: any) => d.r === round.r)
      const value = detail?.[props.score]
      if (typeof value === 'number') return value
      const fallback = result?.[props.score]
      return typeof fallback === 'number' ? fallback : null
    })
    return { name, data, type: 'line' }
  })

  const options = {
    chart: { type: 'line', backgroundColor: 'transparent' },
    title: { text: t('スコア推移') },
    xAxis: { categories: safeRounds.map((round: RoundEntry) => round.name) },
    yAxis: { title: { text: t('スコア') } },
    legend: { enabled: true },
    colors: (() => {
      const styles = getComputedStyle(document.documentElement)
      return [
        styles.getPropertyValue('--color-primary').trim() || '#2563eb',
        styles.getPropertyValue('--color-success').trim() || '#16a34a',
        styles.getPropertyValue('--color-warn').trim() || '#b45309',
        styles.getPropertyValue('--color-danger').trim() || '#ef4444',
      ]
    })(),
    series,
  }

  Highcharts.chart(container.value as HTMLElement, options as any)
}

onMounted(render)
watch(
  () => [props.results, props.tournament, props.score, locale.value],
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
