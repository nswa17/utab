<template>
  <span class="help-tip" tabindex="0" role="note" :aria-label="text">
    ?
    <span class="help-tip-popup">{{ text }}</span>
  </span>
</template>

<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<style scoped>
.help-tip {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  font-size: 12px;
  line-height: 1;
  color: var(--color-muted);
  background: var(--color-surface);
  cursor: help;
}

.help-tip-popup {
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  z-index: 30;
  width: min(320px, 70vw);
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
  font-size: 12px;
  line-height: 1.5;
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity 120ms ease, transform 120ms ease;
  pointer-events: none;
}

.help-tip:hover .help-tip-popup,
.help-tip:focus .help-tip-popup,
.help-tip:focus-visible .help-tip-popup {
  opacity: 1;
  transform: translateY(0);
}
</style>
