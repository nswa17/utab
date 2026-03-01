<template>
  <section class="devtools-dock" aria-label="DevTools Dock">
    <div class="devtools-sheet">
      <div class="devtools-sheet-head">
        <strong class="devtools-sheet-title">Dev Tools</strong>
        <button type="button" class="devtools-close" @click="emit('close')">閉じる</button>
      </div>
      <div class="devtools-sheet-inner">
        <DevToolsBar />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import DevToolsBar from './DevToolsBar.vue'

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<style scoped>
.devtools-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1500;
  pointer-events: none;
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
}

.devtools-sheet {
  width: min(1200px, 100%);
  margin: 0 auto;
  pointer-events: auto;
  border-radius: 10px;
  border: 1px solid #334155;
  background: #0b1220;
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.32);
}

.devtools-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 0;
}

.devtools-sheet-title {
  color: #dbeafe;
  font-size: 12px;
  letter-spacing: 0.03em;
}

.devtools-close {
  min-height: 26px;
  border-radius: 6px;
  border: 1px solid #64748b;
  background: #1e293b;
  color: #f8fafc;
  font-size: 12px;
  font-weight: 600;
  padding: 0 10px;
  cursor: pointer;
}

.devtools-sheet-inner {
  max-height: 42vh;
  overflow: auto;
  padding: 8px;
}

@media (max-width: 640px) {
  .devtools-sheet-inner {
    max-height: 48vh;
  }
}
</style>
