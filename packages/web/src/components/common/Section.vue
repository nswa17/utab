<template>
  <section class="stack section" :class="{ compact }">
    <header v-if="title || description" class="stack section-header">
      <h3 v-if="title" class="section-title">{{ title }}</h3>
      <p v-if="description" class="section-description">{{ description }}</p>
    </header>
    <slot />
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
    compact?: boolean
  }>(),
  {
    title: undefined,
    description: undefined,
    compact: false,
  }
)
</script>

<style scoped>
.section.compact {
  gap: var(--space-3);
}

.section-title {
  margin: 0;
}

.section-description {
  margin: 0;
  color: var(--color-muted);
}
</style>
