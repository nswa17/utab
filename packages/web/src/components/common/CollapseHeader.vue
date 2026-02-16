<template>
  <div class="row collapse-header">
    <span class="collapse-icon" :class="{ open }" aria-hidden="true">
      <svg viewBox="0 0 20 20" width="14" height="14">
        <path
          d="M7 4l6 6-6 6"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
    <div class="stack tight collapse-text">
      <strong>{{ title }}</strong>
      <span v-if="subtitle" class="muted small">{{ subtitle }}</span>
      <span v-if="meta" class="muted small">{{ meta }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    meta?: string
    open?: boolean
  }>(),
  {
    subtitle: '',
    meta: '',
    open: false,
  }
)
</script>

<style scoped>
.collapse-header {
  align-items: center;
  gap: var(--space-2);
  justify-content: flex-start;
}

.collapse-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-muted);
  transition: transform 0.15s ease;
}

.collapse-icon.open {
  transform: rotate(90deg);
}

.collapse-text {
  min-width: 0;
}
</style>
