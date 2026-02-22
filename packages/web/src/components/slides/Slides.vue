<template>
  <component
    :is="component"
    :language="language"
    :max-ranking-rewarded="maxRankingRewarded"
    :type="type"
    :slide-style="slideStyle"
    :left-credit="leftCredit"
    :right-credit="rightCredit"
    :presentation-mode="presentationMode"
    :tournament="tournament"
    :entities="entities"
    @close="$emit('close')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SlideLanguage } from '@/utils/slides-presentation'
import TeamSlides from './TeamSlides.vue'
import SpeakerSlides from './SpeakerSlides.vue'
import AdjudicatorSlides from './AdjudicatorSlides.vue'
import PoiSlides from './PoiSlides.vue'
import BestSlides from './BestSlides.vue'

const props = withDefaults(
  defineProps<{
    label: 'teams' | 'speakers' | 'adjudicators' | 'poi' | 'best'
    language?: SlideLanguage
    maxRankingRewarded?: number
    type?: 'listed' | 'single'
    slideStyle?: 'pretty' | 'simple'
    leftCredit?: string
    rightCredit?: string
    presentationMode?: boolean
    tournament?: Record<string, any>
    entities?: Record<string, string>
  }>(),
  {
    language: 'en',
    maxRankingRewarded: 3,
    type: 'listed',
    slideStyle: 'pretty',
    leftCredit: '',
    rightCredit: '',
    presentationMode: false,
  }
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
