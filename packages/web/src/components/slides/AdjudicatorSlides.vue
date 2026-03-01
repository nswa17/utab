<template>
  <SlidesWrapper
    :title="title"
    :language="language"
    :organized-results="organizedResults"
    :max-ranking-rewarded="maxRankingRewarded"
    :type="type"
    :slide-style="slideStyle"
    :left-credit="leftCredit"
    :right-credit="rightCredit"
    :presentation-mode="presentationMode"
    @close="$emit('close')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SlideLanguage } from '@/utils/slides-presentation'
import { resolveSubNames } from '@/utils/slides-presentation'
import SlidesWrapper from './SlidesWrapper.vue'

const props = withDefaults(
  defineProps<{
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

const title = computed(() => (props.language === 'ja' ? 'ジャッジ結果' : 'Adjudicator Results'))

const organizedResults = computed(() => {
  const results = props.tournament?.compiled_adjudicator_results ?? []
  return results.map((result: any) => ({
    id: result.id,
    name: props.entities?.[result.id] ?? result.name ?? result.id ?? 'Adjudicator',
    ranking: result.ranking ?? result.rank ?? 0,
    subNames: resolveSubNames(result.institutions, (token) => props.entities?.[token] ?? token),
  }))
})
</script>
