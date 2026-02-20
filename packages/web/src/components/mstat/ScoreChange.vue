<template>
  <div ref="container" class="chart" />
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHighcharts } from '@/composables/useHighcharts'
import { buildScoreChangeRounds, buildScoreChangeSeries } from '@/utils/score-change'

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

function render() {
  if (!container.value) return
  const rounds = buildScoreChangeRounds({
    tournament: props.tournament,
    results: props.results,
    roundLabel: (round) => t('ラウンド {round}', { round }),
  })
  const { rounds: safeRounds, series } = buildScoreChangeSeries({
    results: props.results,
    rounds,
    scoreKey: props.score,
    fallbackRoundName: t('合計'),
    entryName: (result) => String(result?.name ?? result?.id ?? t('エントリー')),
  })

  const options = {
    chart: { type: 'line', backgroundColor: 'transparent' },
    title: { text: t('スコア推移') },
    xAxis: { categories: safeRounds.map((round) => round.name) },
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
