<template>
  <component :is="as" class="list" :class="classes">
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    compact?: boolean
    as?: 'ul' | 'ol' | 'div'
  }>(),
  {
    compact: false,
    as: 'ul',
  }
)

const classes = computed(() => ({ compact: props.compact }))
</script>
