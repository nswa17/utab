<template>
  <li class="item">
    <component :is="linkComponent" :to="to" :href="href" class="content">
      <span v-if="icon" class="icon">{{ icon }}</span>
      <span class="text"><slot /></span>
      <span v-if="navIcon" class="nav">{{ navIcon }}</span>
    </component>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps<{
  to?: string
  href?: string
  icon?: string
  navIcon?: string
}>()

const linkComponent = computed(() => {
  if (props.to) return RouterLink
  if (props.href) return 'a'
  return 'div'
})
</script>

<style scoped>
.item {
  background: #fff;
  border-radius: 8px;
  border-left: 6px solid #2563eb;
  box-shadow: 0 2px 6px rgba(31, 41, 55, 0.08);
}

.content {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  color: inherit;
  text-decoration: none;
}

.icon {
  width: 20px;
  text-align: center;
  color: #2563eb;
}

.text {
  flex: 1;
}

.nav {
  color: #2563eb;
}
</style>
