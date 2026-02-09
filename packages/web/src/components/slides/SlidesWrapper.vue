<template>
  <SlideShow :slides="slides" :title="title" :credit="credit" @close="$emit('close')" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ordinal } from '@/utils/math'
import SlideShow from './SlideShow.vue'

type SlidePhrase = { tag: string; text: string }
type SlideParagraph = SlidePhrase[]
type SlidePage = SlideParagraph[]

const props = withDefaults(
  defineProps<{
    title: string
    organizedResults: Array<{ name: string; ranking: number; subNames?: string[] }>
    maxRankingRewarded?: number
    credit?: string
    type?: 'listed' | 'pretty'
  }>(),
  { maxRankingRewarded: 3, credit: '', type: 'listed' }
)

defineEmits<{ (event: 'close'): void }>()

const sortedResults = computed(() => {
  const results = [...props.organizedResults].sort((a, b) => a.ranking - b.ranking)
  return results.filter((result) => result.ranking <= props.maxRankingRewarded)
})

const slides = computed<SlidePage[]>(() => {
  const pages: SlidePage[] = []
  const chunkSize = props.type === 'listed' ? 4 : 1
  for (let i = 0; i < sortedResults.value.length; i += chunkSize) {
    const chunk = sortedResults.value.slice(i, i + chunkSize)
    const page: SlideParagraph[] = chunk.map((result) => {
      const paragraphs: SlideParagraph = [
        { tag: 'h3', text: `${ordinal(result.ranking)} Place` },
        { tag: 'h2', text: result.name },
      ]
      if (result.subNames && result.subNames.length > 0) {
        paragraphs.push({ tag: 'p', text: result.subNames.join(', ') })
      }
      return paragraphs
    })
    pages.push(page)
  }
  return pages
})
</script>
