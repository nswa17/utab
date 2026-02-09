<template>
  <component :is="as" class="list-item">
    <slot />
  </component>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    as?: 'li' | 'div'
  }>(),
  {
    as: 'li',
  }
)
</script>
