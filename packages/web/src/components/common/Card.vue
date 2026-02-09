<template>
  <section class="card" :class="classes">
    <slot />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    soft?: boolean
  }>(),
  {
    soft: false,
  }
)

const classes = computed(() => ({ soft: props.soft }))
</script>
