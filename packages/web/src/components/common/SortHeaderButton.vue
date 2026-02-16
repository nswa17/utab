<template>
  <button
    type="button"
    class="sort-header-button"
    :class="{ compact }"
    :aria-label="ariaLabel || label"
    @click="onClick"
  >
    <slot>{{ label }}</slot>
    <span class="sort-indicator">{{ indicator }}</span>
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
    indicator?: string
    compact?: boolean
    ariaLabel?: string
  }>(),
  {
    label: '',
    indicator: '↕',
    compact: false,
    ariaLabel: '',
  }
)

const emit = defineEmits<{
  (e: 'click'): void
}>()

function onClick() {
  emit('click')
}
</script>

<style scoped>
.sort-header-button {
  border: none;
  background: transparent;
  font: inherit;
  color: inherit;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 0;
}

.sort-header-button.compact {
  font-size: 0.82rem;
  font-weight: 700;
}

.sort-header-button:not(.compact) {
  font-weight: 600;
}

.sort-header-button:hover {
  color: var(--color-primary);
}

.sort-indicator {
  color: var(--color-muted);
  font-size: 11px;
  line-height: 1;
}
</style>
