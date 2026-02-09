<template>
  <SlidesWrapper
    title="Adjudicator Results"
    :organized-results="organizedResults"
    :max-ranking-rewarded="maxRankingRewarded"
    :type="type"
    :credit="credit"
    @close="$emit('close')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SlidesWrapper from './SlidesWrapper.vue'

const props = withDefaults(
  defineProps<{
    maxRankingRewarded?: number
    type?: 'listed' | 'pretty'
    credit?: string
    tournament?: Record<string, any>
    entities?: Record<string, string>
  }>(),
  { maxRankingRewarded: 3, type: 'listed', credit: '' }
)

defineEmits<{ (event: 'close'): void }>()

const organizedResults = computed(() => {
  const results = props.tournament?.compiled_adjudicator_results ?? []
  return results.map((result: any) => ({
    name: props.entities?.[result.id] ?? result.name ?? result.id ?? 'Adjudicator',
    ranking: result.ranking ?? result.rank ?? 0,
    subNames: result.institutions ?? [],
  }))
})
</script>
