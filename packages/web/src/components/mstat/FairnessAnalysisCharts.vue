<template>
  <section class="stack fairness-analysis-charts">
    <ScoreChange
      v-if="showScoreChangeChart"
      :results="results"
      :tournament="tournament"
      :score="scoreKey"
      :round-filter="roundFilter"
    />
    <ScoreRange v-if="showScoreRange" :results="results" :score="scoreKey" />
    <ScoreHistogram
      v-if="showScoreHistogram"
      :results="results"
      :score="scoreKey"
      :round="histogramRound ?? undefined"
      :round-name="histogramRoundName"
    />
    <TeamPerformance v-if="showTeamPerformance" :results="results" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ScoreChange from '@/components/mstat/ScoreChange.vue'
import ScoreRange from '@/components/mstat/ScoreRange.vue'
import ScoreHistogram from '@/components/mstat/ScoreHistogram.vue'
import TeamPerformance from '@/components/mstat/TeamPerformance.vue'
import { buildScoreChangeRounds } from '@/utils/score-change'

const props = withDefaults(
  defineProps<{
    results: any[]
    tournament?: any
    scoreKey: string
    roundFilter?: number[]
    showScoreRange?: boolean
    showTeamPerformance?: boolean
    showScoreHistogram?: boolean
    histogramRound?: number | null
    histogramRoundName?: string
    hideScoreChangeWhenSingleRound?: boolean
  }>(),
  {
    roundFilter: () => [],
    showScoreRange: true,
    showTeamPerformance: false,
    showScoreHistogram: false,
    hideScoreChangeWhenSingleRound: true,
  }
)

const showScoreChangeChart = computed(() => {
  if (props.results.length === 0) return false
  if (!props.hideScoreChangeWhenSingleRound) return true
  const rounds = buildScoreChangeRounds({
    tournament: props.tournament,
    results: props.results,
    roundLabel: (round) => String(round),
    roundFilter: props.roundFilter,
  })
  return rounds.length > 1
})
</script>
