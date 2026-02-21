<template>
  <SlideShow
    :slides="slides"
    :title="title"
    :language="slideLanguage"
    :left-credit="leftCredit"
    :right-credit="rightCredit"
    :style-mode="slideStyle"
    :presentation-mode="presentationMode"
    @close="$emit('close')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ordinal } from '@/utils/math'
import {
  buildSlideRows,
  chunkSlideRows,
  normalizeSlideLanguage,
  type SlideLanguage,
  type SlideStyle,
  type SlideType,
  type SlideResultInput,
} from '@/utils/slides-presentation'
import SlideShow from './SlideShow.vue'

type SlidePhrase = { tag: string; text: string }
type SlideParagraph = SlidePhrase[]
type SlidePage = SlideParagraph[]

function formatPlace(ranking: number, locale: SlideLanguage): string {
  const rounded = Math.round(ranking)
  if (locale === 'ja') return `${rounded}位`
  return `${ordinal(rounded)} Place`
}

function formatPlaceWithTie(
  ranking: number,
  tie: boolean,
  locale: SlideLanguage,
  tieLabel: string
): string {
  const place = formatPlace(ranking, locale)
  if (!tie) return place
  if (locale === 'ja') return `${place}（${tieLabel}）`
  return `${place} (${tieLabel})`
}

function formatTieLabel(count: number, locale: SlideLanguage): string {
  if (locale === 'ja') return `同率${count}名`
  return `Tie ${count} entries`
}

const props = withDefaults(
  defineProps<{
    title: string
    organizedResults: SlideResultInput[]
    language?: SlideLanguage
    maxRankingRewarded?: number
    leftCredit?: string
    rightCredit?: string
    type?: SlideType
    slideStyle?: SlideStyle
    presentationMode?: boolean
  }>(),
  {
    language: 'en',
    maxRankingRewarded: 3,
    leftCredit: '',
    rightCredit: '',
    type: 'listed',
    slideStyle: 'pretty',
    presentationMode: false,
  }
)

defineEmits<{ (event: 'close'): void }>()
const slideLanguage = computed(() => normalizeSlideLanguage(props.language))

const slideRows = computed(() => buildSlideRows(props.organizedResults, props.maxRankingRewarded))

const slides = computed<SlidePage[]>(() => {
  const pages = chunkSlideRows(slideRows.value, props.type).map((chunk) => {
    const page: SlideParagraph[] = chunk.map((row) => {
      const tieLabel = formatTieLabel(row.tieCount, slideLanguage.value)
      const paragraphs: SlideParagraph = [
        {
          tag: 'h3',
          text: formatPlaceWithTie(row.ranking, row.tie, slideLanguage.value, tieLabel),
        },
        { tag: 'h2', text: row.name },
      ]
      if (row.subNames.length > 0) {
        paragraphs.push({ tag: 'p', text: row.subNames.join(', ') })
      }
      return paragraphs
    })
    return page
  })
  return pages
})
</script>
