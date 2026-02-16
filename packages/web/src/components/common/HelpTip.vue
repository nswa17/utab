<template>
  <span
    class="help-tip-root"
    @mouseenter="open"
    @mouseleave="close"
    @focusin="open"
    @focusout="handleFocusOut"
  >
    <button
      ref="triggerRef"
      type="button"
      class="help-tip"
      :aria-label="text"
      :aria-expanded="isOpen ? 'true' : 'false'"
      @click.stop.prevent="open"
      @mousedown.stop.prevent
      @keydown.enter.stop.prevent="open"
      @keydown.space.stop.prevent="open"
      @keydown.esc.stop.prevent="close"
    >
      ?
    </button>
    <teleport to="body">
      <div
        v-if="isOpen"
        class="help-tip-popup"
        role="tooltip"
        :style="popupStyle"
        @click.stop
        @mousedown.stop
        @pointerdown.stop
      >
        {{ text }}
      </div>
    </teleport>
  </span>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

defineProps<{ text: string }>()

const triggerRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const popupStyle = ref<Record<string, string>>({})

function updatePopupPosition() {
  if (!triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const margin = 12
  const maxWidth = Math.min(320, Math.max(220, window.innerWidth - margin * 2))
  let left = rect.right - maxWidth
  if (left < margin) {
    left = margin
  }
  let top = rect.bottom + 8
  const estimatedHeight = 96
  if (top + estimatedHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - estimatedHeight - 8)
  }
  popupStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${maxWidth}px`,
  }
}

function open() {
  if (isOpen.value) return
  isOpen.value = true
  nextTick(updatePopupPosition)
}

function close() {
  isOpen.value = false
}

function handleFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (next && triggerRef.value?.parentElement?.contains(next)) return
  close()
}

function handlePointerDown(event: PointerEvent) {
  if (!isOpen.value) return
  const target = event.target as Node | null
  if (target && triggerRef.value?.contains(target)) return
  close()
}

function handleViewportUpdate() {
  if (!isOpen.value) return
  updatePopupPosition()
}

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('scroll', handleViewportUpdate, true)
  window.addEventListener('resize', handleViewportUpdate)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  window.removeEventListener('scroll', handleViewportUpdate, true)
  window.removeEventListener('resize', handleViewportUpdate)
})
</script>

<style scoped>
.help-tip-root {
  display: inline-flex;
}

.help-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  color: var(--color-muted);
  background: var(--color-surface);
  cursor: help;
  padding: 0;
}

.help-tip:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 1px;
}

.help-tip-popup {
  position: fixed;
  z-index: 1200;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  white-space: normal;
}
</style>
