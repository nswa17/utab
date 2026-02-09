<template>
  <section class="link-list">
    <div class="legend">
      <slot name="legend" />
    </div>
    <ul class="container">
      <slot />
    </ul>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  loading?: boolean
  noItemText?: string
}>()
</script>

<style scoped>
.link-list {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
}

.legend {
  font-size: 12px;
  color: #6b7280;
}

.container {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}
</style>
