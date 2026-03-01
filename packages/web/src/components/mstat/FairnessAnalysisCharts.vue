<template>
  <section class="stack fairness-analysis-charts">
    <div v-if="showScoreChangeChart" :class="{ 'fairness-analysis-chart-card': useCards }">
      <ScoreChange
        :results="results"
        :tournament="tournament"
        :score="scoreKey"
        :round-filter="roundFilter"
      />
    </div>
    <div v-if="showScoreRange" :class="{ 'fairness-analysis-chart-card': useCards }">
      <ScoreRange :results="results" :score="scoreKey" />
    </div>
    <div v-if="showScoreHistogram" :class="{ 'fairness-analysis-chart-card': useCards }">
      <ScoreHistogram
        :results="results"
        :score="scoreKey"
        :round="histogramRound ?? undefined"
        :round-name="histogramRoundName"
      />
    </div>
    <div v-if="showTeamPerformance" :class="{ 'fairness-analysis-chart-card': useCards }">
      <TeamPerformance :results="results" />
    </div>
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
    useCards?: boolean
  }>(),
  {
    roundFilter: () => [],
    showScoreRange: true,
    showTeamPerformance: false,
    showScoreHistogram: false,
    hideScoreChangeWhenSingleRound: true,
    useCards: false,
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

<style scoped>
.fairness-analysis-charts {
  gap: var(--space-2);
}

.fairness-analysis-chart-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-2);
}
</style>
