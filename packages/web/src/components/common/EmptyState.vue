<template>
  <div class="empty-state">
    <strong class="empty-title">{{ title }}</strong>
    <p v-if="message" class="empty-message">{{ message }}</p>
    <div v-if="$slots.action" class="empty-action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    message?: string
  }>(),
  {
    message: undefined,
  }
)
</script>

<style scoped>
.empty-state {
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: grid;
  gap: var(--space-2);
  text-align: center;
  background: var(--color-surface-muted);
}

.empty-title {
  font-size: 16px;
}

.empty-message {
  margin: 0;
  color: var(--color-muted);
  font-size: 14px;
}

.empty-action {
  display: flex;
  justify-content: center;
}
</style>
