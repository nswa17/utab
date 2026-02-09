<template>
  <span class="label">{{ value }}</span>
</template>

<script setup lang="ts">
defineProps<{
  value: string | number
  disabled?: boolean
}>()
</script>

<style scoped>
.label {
  background: #fff;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  color: #1f2937;
  display: inline-block;
  padding: 8px 10px;
  width: 100%;
}
</style>
