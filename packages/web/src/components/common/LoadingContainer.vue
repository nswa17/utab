<template>
  <section class="container">
    <LoadingState v-if="loading" />
    <div v-else>
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import LoadingState from '@/components/common/LoadingState.vue'

defineProps<{
  loading: boolean
}>()
</script>

<style scoped>
.container {
  min-height: 120px;
}
</style>
