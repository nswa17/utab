<template>
  <div class="app" :class="{ embedded: isEmbeddedRoute }">
    <AppHeader v-if="!isEmbeddedRoute" />
    <main class="content" :class="{ embedded: isEmbeddedRoute }">
      <div class="page" :class="{ embedded: isEmbeddedRoute }">
        <div class="page-content" :class="{ embedded: isEmbeddedRoute }">
          <RouterView />
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './components/common/AppHeader.vue'

const route = useRoute()
const isEmbeddedRoute = computed(() => route.path.startsWith('/admin-embed/'))
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  background: var(--color-bg);
}

.app.embedded {
  min-height: auto;
}

.content.embedded {
  background: transparent;
}

.page.embedded,
.page-content.embedded {
  padding: 0;
  margin: 0;
  max-width: none;
}
</style>
