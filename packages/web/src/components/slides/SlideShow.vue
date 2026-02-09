<template>
  <div ref="root" class="slideshow">
    <div class="header">
      <h2>{{ title }}</h2>
      <Button variant="ghost" size="sm" @click="emit('close')">{{ $t('閉じる') }}</Button>
    </div>

    <div v-if="hasSlides" class="slide">
      <div v-for="(paragraph, index) in currentSlide" :key="index" class="paragraph">
        <component v-for="(phrase, idx) in paragraph" :key="idx" :is="phrase.tag" class="phrase">
          {{ phrase.text }}
        </component>
      </div>
    </div>
    <div v-else class="empty">{{ $t('スライドがありません。') }}</div>

    <div class="footer">
      <div class="pagination">{{ paginationLabel }}</div>
      <div class="controls">
        <Button
          variant="ghost"
          size="sm"
          :aria-label="$t('前のスライド')"
          @click="prev"
          :disabled="currentIndex === 0 || !hasSlides"
        >
          ←
        </Button>
        <Button
          variant="ghost"
          size="sm"
          :aria-label="$t('次のスライド')"
          @click="next"
          :disabled="!hasSlides || currentIndex === slides.length - 1"
        >
          →
        </Button>
      </div>
      <div class="credit">{{ credit }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Button from '@/components/common/Button.vue'

export type SlidePhrase = { tag: string; text: string }
export type SlideParagraph = SlidePhrase[]
export type SlidePage = SlideParagraph[]

const props = withDefaults(
  defineProps<{
    slides: SlidePage[]
    title: string
    credit?: string
  }>(),
  { credit: '' }
)

const emit = defineEmits<{ (event: 'close'): void }>()

const currentIndex = ref(0)
const currentSlide = computed(() => props.slides[currentIndex.value] ?? [])
const hasSlides = computed(() => props.slides.length > 0)
const paginationLabel = computed(() => {
  if (!hasSlides.value) return '0 / 0'
  return `${currentIndex.value + 1} / ${props.slides.length}`
})
const root = ref<HTMLElement | null>(null)

function next() {
  if (!hasSlides.value) return
  if (currentIndex.value < props.slides.length - 1) currentIndex.value += 1
}

function prev() {
  if (!hasSlides.value) return
  if (currentIndex.value > 0) currentIndex.value -= 1
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight') next()
  else if (event.key === 'ArrowLeft') prev()
  else if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

watch(
  () => props.slides,
  () => {
    currentIndex.value = 0
  }
)
</script>

<style scoped>
.slideshow {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  background: var(--color-surface);
  display: grid;
  gap: var(--space-4);
}

.header,
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.slide {
  min-height: 200px;
  display: grid;
  gap: 12px;
}

.empty {
  min-height: 200px;
  display: grid;
  place-items: center;
  color: var(--color-muted);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
}

.paragraph {
  display: grid;
  gap: 6px;
}

.phrase {
  margin: 0;
}

.controls {
  display: flex;
  gap: var(--space-2);
}

.credit {
  color: var(--color-muted);
  font-size: 12px;
}
</style>
