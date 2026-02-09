<template>
  <component
    :is="component"
    :max-ranking-rewarded="maxRankingRewarded"
    :type="type"
    :credit="credit"
    :tournament="tournament"
    :entities="entities"
    @close="$emit('close')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TeamSlides from './TeamSlides.vue'
import SpeakerSlides from './SpeakerSlides.vue'
import AdjudicatorSlides from './AdjudicatorSlides.vue'
import PoiSlides from './PoiSlides.vue'
import BestSlides from './BestSlides.vue'

const props = withDefaults(
  defineProps<{
    label: 'teams' | 'speakers' | 'adjudicators' | 'poi' | 'best'
    maxRankingRewarded?: number
    type?: 'listed' | 'pretty'
    credit?: string
    tournament?: Record<string, any>
    entities?: Record<string, string>
  }>(),
  { maxRankingRewarded: 3, type: 'listed', credit: '' }
)

defineEmits<{ (event: 'close'): void }>()

const component = computed(() => {
  switch (props.label) {
    case 'teams':
      return TeamSlides
    case 'speakers':
      return SpeakerSlides
    case 'adjudicators':
      return AdjudicatorSlides
    case 'poi':
      return PoiSlides
    case 'best':
      return BestSlides
    default:
      return TeamSlides
  }
})
</script>
