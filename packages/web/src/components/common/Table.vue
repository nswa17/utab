<template>
  <table
    class="table"
    :class="{
      'table--striped': striped,
      'table--hover': hover,
      'table--sticky': stickyHeader,
    }"
  >
    <slot />
  </table>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    striped?: boolean
    hover?: boolean
    stickyHeader?: boolean
  }>(),
  {
    striped: false,
    hover: false,
    stickyHeader: false,
  }
)
</script>
