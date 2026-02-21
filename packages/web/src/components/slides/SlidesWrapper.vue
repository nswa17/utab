<template>
  <SlideShow
    :slides="slides"
    :title="title"
    :credit="credit"
    :style-mode="slideStyle"
    :presentation-mode="presentationMode"
    @close="$emit('close')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ordinal } from '@/utils/math'
import {
  buildSlideRows,
  chunkSlideRows,
  type SlideStyle,
  type SlideType,
  type SlideResultInput,
} from '@/utils/slides-presentation'
import SlideShow from './SlideShow.vue'

type SlidePhrase = { tag: string; text: string }
type SlideParagraph = SlidePhrase[]
type SlidePage = SlideParagraph[]

function formatPlace(ranking: number, locale: string): string {
  const rounded = Math.round(ranking)
  if (locale.startsWith('ja')) return `${rounded}位`
  return `${ordinal(rounded)} Place`
}

function formatPlaceWithTie(
  ranking: number,
  tie: boolean,
  locale: string,
  tieLabel: string
): string {
  const place = formatPlace(ranking, locale)
  if (!tie) return place
  if (locale.startsWith('ja')) return `${place}（${tieLabel}）`
  return `${place} (${tieLabel})`
}

const props = withDefaults(
  defineProps<{
    title: string
    organizedResults: SlideResultInput[]
    maxRankingRewarded?: number
    credit?: string
    type?: SlideType
    slideStyle?: SlideStyle
    presentationMode?: boolean
  }>(),
  {
    maxRankingRewarded: 3,
    credit: '',
    type: 'listed',
    slideStyle: 'pretty',
    presentationMode: false,
  }
)

defineEmits<{ (event: 'close'): void }>()
const { t, locale } = useI18n({ useScope: 'global' })

const slideRows = computed(() => buildSlideRows(props.organizedResults, props.maxRankingRewarded))

const slides = computed<SlidePage[]>(() => {
  const pages = chunkSlideRows(slideRows.value, props.type).map((chunk) => {
    const page: SlideParagraph[] = chunk.map((row) => {
      const tieLabel = t('同率{count}名', { count: row.tieCount })
      const paragraphs: SlideParagraph = [
        {
          tag: 'h3',
          text: formatPlaceWithTie(row.ranking, row.tie, locale.value, tieLabel),
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
