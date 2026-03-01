<template>
  <div ref="root" :class="['slideshow', slideshowClass]">
    <div class="header">
      <h2>{{ title }}</h2>
    </div>

    <div v-if="hasSlides" class="slide">
      <div v-for="(paragraph, index) in currentSlide" :key="index" class="paragraph">
        <component
          v-for="(phrase, idx) in paragraph"
          :key="idx"
          :is="phrase.tag"
          :class="['phrase', `phrase--${phrase.tag}`]"
        >
          {{ phrase.text }}
        </component>
      </div>
    </div>
    <div v-else class="empty">{{ emptyLabel }}</div>

    <div class="footer">
      <div class="credit credit-left">{{ leftCredit }}</div>
      <div class="footer-center">
        <div class="pagination">{{ paginationLabel }}</div>
        <div class="controls">
          <Button
            variant="ghost"
            size="sm"
            :aria-label="previousSlideLabel"
            @click="prev"
            :disabled="currentIndex === 0 || !hasSlides"
          >
            ←
          </Button>
          <Button
            variant="ghost"
            size="sm"
            :aria-label="nextSlideLabel"
            @click="next"
            :disabled="!hasSlides || currentIndex === slides.length - 1"
          >
            →
          </Button>
        </div>
      </div>
      <div class="footer-right">
        <div class="credit credit-right">{{ rightCredit }}</div>
        <Button
          variant="ghost"
          size="sm"
          class="fullscreen-icon-button"
          :aria-label="fullscreenButtonLabel"
          :title="fullscreenButtonLabel"
          @click="toggleFullscreen"
        >
          <span class="fullscreen-icon" :class="{ active: isFullscreen }" aria-hidden="true" />
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Button from '@/components/common/Button.vue'
import { normalizeSlideLanguage, type SlideLanguage } from '@/utils/slides-presentation'

export type SlidePhrase = { tag: string; text: string }
export type SlideParagraph = SlidePhrase[]
export type SlidePage = SlideParagraph[]

const props = withDefaults(
  defineProps<{
    slides: SlidePage[]
    title: string
    language?: SlideLanguage
    leftCredit?: string
    rightCredit?: string
    styleMode?: 'pretty' | 'simple'
    presentationMode?: boolean
  }>(),
  {
    language: 'en',
    leftCredit: '',
    rightCredit: '',
    styleMode: 'pretty',
    presentationMode: false,
  }
)

const currentIndex = ref(0)
const currentSlide = computed(() => props.slides[currentIndex.value] ?? [])
const hasSlides = computed(() => props.slides.length > 0)
const language = computed(() => normalizeSlideLanguage(props.language))
const emptyLabel = computed(() =>
  language.value === 'ja' ? 'スライドがありません。' : 'No slides available.'
)
const previousSlideLabel = computed(() =>
  language.value === 'ja' ? '前のスライド' : 'Previous slide'
)
const nextSlideLabel = computed(() =>
  language.value === 'ja' ? '次のスライド' : 'Next slide'
)
const paginationLabel = computed(() => {
  if (!hasSlides.value) return '0 / 0'
  return `${currentIndex.value + 1} / ${props.slides.length}`
})
const root = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
const slideshowClass = computed(() => `slideshow--${props.styleMode}`)
const fullscreenButtonLabel = computed(() => {
  if (isFullscreen.value) {
    return language.value === 'ja' ? 'フルスクリーン終了' : 'Exit fullscreen'
  }
  return language.value === 'ja' ? 'フルスクリーンで表示' : 'Show fullscreen'
})

function next() {
  if (!hasSlides.value) return
  if (currentIndex.value < props.slides.length - 1) currentIndex.value += 1
}

function prev() {
  if (!hasSlides.value) return
  if (currentIndex.value > 0) currentIndex.value -= 1
}

function first() {
  if (!hasSlides.value) return
  currentIndex.value = 0
}

function last() {
  if (!hasSlides.value) return
  currentIndex.value = props.slides.length - 1
}

function syncFullscreenState() {
  isFullscreen.value = Boolean(root.value && document.fullscreenElement === root.value)
}

async function toggleFullscreen() {
  if (!root.value) return
  try {
    if (document.fullscreenElement === root.value) {
      if (document.exitFullscreen) await document.exitFullscreen()
      return
    }
    if (root.value.requestFullscreen) await root.value.requestFullscreen()
  } catch {
    // Ignore browser-specific fullscreen errors.
  }
}

function shouldCaptureKey(event: KeyboardEvent): boolean {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') return true
  if (!props.presentationMode) return false
  return (
    event.key === 'Enter' ||
    event.key === ' ' ||
    event.key === 'Spacebar' ||
    event.key === 'Backspace' ||
    event.key === 'Home' ||
    event.key === 'End'
  )
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tagName = target.tagName
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

function handleKeydown(event: KeyboardEvent) {
  if (isEditableTarget(event.target)) return
  if (!shouldCaptureKey(event)) return
  event.preventDefault()

  if (event.key === 'ArrowRight' || (props.presentationMode && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar'))) {
    next()
    return
  }
  if (event.key === 'ArrowLeft' || (props.presentationMode && event.key === 'Backspace')) {
    prev()
    return
  }
  if (props.presentationMode && event.key === 'Home') {
    first()
    return
  }
  if (props.presentationMode && event.key === 'End') {
    last()
  }
}

onMounted(() => {
  syncFullscreenState()
  window.addEventListener('keydown', handleKeydown)
  document.addEventListener('fullscreenchange', syncFullscreenState)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('fullscreenchange', syncFullscreenState)
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
  --certificate-border: #b8945c;
  --certificate-accent: #8b5d1f;
  --certificate-text: #33230f;
  border: 1px solid color-mix(in oklab, var(--certificate-border) 58%, white);
  border-radius: 20px;
  padding: clamp(16px, 2.6vw, 28px);
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.95) 0%, rgba(250, 242, 225, 0.9) 44%, rgba(243, 230, 201, 0.88) 100%),
    linear-gradient(155deg, #fffdf8 0%, #f9f2de 55%, #f2e5c6 100%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.85),
    0 18px 32px rgba(72, 52, 20, 0.12);
  display: grid;
  gap: clamp(12px, 2vh, 18px);
  color: var(--certificate-text);
  overflow: hidden;
}

.header,
.footer {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header {
  justify-content: flex-end;
  position: relative;
  min-height: 40px;
}

.header h2 {
  position: absolute;
  left: 50%;
  top: 2px;
  transform: translateX(-50%);
  margin: 0;
  font-family: 'Times New Roman', 'Hiragino Mincho ProN', 'Yu Mincho', serif;
  font-size: clamp(20px, 2.5vw, 34px);
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--certificate-accent);
  white-space: nowrap;
}

.header-actions {
  display: flex;
  gap: var(--space-2);
}

.slide {
  min-height: clamp(280px, 52vh, 680px);
  border: 6px double color-mix(in oklab, var(--certificate-border) 76%, white);
  border-radius: 14px;
  padding: clamp(16px, 3vw, 44px);
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.94) 0%, rgba(255, 249, 236, 0.88) 48%, rgba(249, 237, 208, 0.84) 100%);
  display: grid;
  align-content: center;
  justify-items: center;
  gap: clamp(12px, 1.7vh, 20px);
  text-align: center;
}

.empty {
  min-height: clamp(200px, 40vh, 360px);
  display: grid;
  place-items: center;
  color: color-mix(in oklab, var(--certificate-accent) 68%, #5d4a2f);
  border: 2px dashed color-mix(in oklab, var(--certificate-border) 70%, white);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.5);
}

.paragraph {
  display: grid;
  justify-items: center;
  width: min(100%, 860px);
  gap: clamp(4px, 1vh, 10px);
  padding: clamp(10px, 1.8vw, 22px) clamp(14px, 3vw, 32px);
  border: 1px solid color-mix(in oklab, var(--certificate-border) 56%, white);
  border-radius: 12px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.72) 0%,
    rgba(255, 252, 246, 0.66) 100%
  );
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.62);
}

.phrase {
  margin: 0;
  text-align: center;
}

.phrase--h2 {
  font-family: 'Times New Roman', 'Hiragino Mincho ProN', 'Yu Mincho', serif;
  font-size: clamp(30px, 5vw, 56px);
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--certificate-text);
  text-wrap: balance;
}

.phrase--h3 {
  font-size: clamp(18px, 2.2vw, 30px);
  line-height: 1.25;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--certificate-accent);
}

.phrase--h4 {
  font-size: clamp(15px, 1.8vw, 22px);
  line-height: 1.4;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: color-mix(in oklab, var(--certificate-accent) 84%, #8a6e43);
}

.phrase--p {
  font-size: clamp(15px, 1.7vw, 21px);
  line-height: 1.45;
  color: color-mix(in oklab, var(--certificate-text) 86%, #7c6744);
  text-wrap: pretty;
}

.controls {
  display: flex;
  gap: var(--space-2);
}

.fullscreen-icon-button {
  min-width: 34px;
  width: 34px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.fullscreen-icon {
  display: inline-block;
  width: 13px;
  height: 10px;
  border: 2px solid currentColor;
  border-radius: 2px;
}

.fullscreen-icon.active {
  width: 11px;
  height: 8px;
}

.footer {
  justify-content: space-between;
  border-top: 1px solid color-mix(in oklab, var(--certificate-border) 56%, white);
  padding-top: 10px;
}

.footer-center {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-inline: auto;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pagination {
  font-size: 12px;
  letter-spacing: 0.08em;
  color: color-mix(in oklab, var(--certificate-accent) 72%, #6f5d44);
}

.credit {
  color: color-mix(in oklab, var(--certificate-text) 64%, #8f7b59);
  font-size: 12px;
  letter-spacing: 0.08em;
}

.credit-left {
  text-align: left;
}

.credit-right {
  text-align: right;
}

.slideshow--simple {
  --certificate-border: #d4d7dd;
  --certificate-accent: #334155;
  --certificate-text: #0f172a;
  border-color: #d4d7dd;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08);
}

.slideshow--simple .header h2 {
  font-family: 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif;
  font-size: clamp(19px, 2.1vw, 28px);
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: none;
}

.slideshow--simple .slide {
  min-height: clamp(260px, 46vh, 560px);
  border-width: 1px;
  border-style: solid;
  border-color: #d4d7dd;
  border-radius: 10px;
  background: #fff;
}

.slideshow--simple .paragraph {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  box-shadow: none;
}

.slideshow--simple .phrase--h2 {
  font-family: 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif;
  font-size: clamp(28px, 4.2vw, 48px);
  letter-spacing: 0.01em;
}

.slideshow--simple .phrase--h3 {
  letter-spacing: 0.02em;
  text-transform: none;
}

.slideshow--simple .footer {
  border-top-color: #e2e8f0;
}

.slideshow:fullscreen {
  width: 100vw;
  height: 100vh;
  max-width: none;
  border-radius: 0;
  padding: clamp(18px, 2.4vw, 32px);
}

.slideshow:fullscreen .slide {
  min-height: calc(100vh - 170px);
}

@media (max-width: 760px) {
  .header {
    position: static;
    min-height: 0;
    flex-direction: column;
    align-items: stretch;
  }

  .header h2 {
    position: static;
    transform: none;
    text-align: center;
    white-space: normal;
  }

  .header-actions {
    justify-content: flex-end;
  }

  .footer {
    display: grid;
    grid-template-columns: 1fr;
    align-items: center;
    justify-items: stretch;
  }

  .footer-center {
    margin-inline: 0;
    justify-content: center;
  }

  .footer-right {
    justify-content: flex-end;
  }
}
</style>
