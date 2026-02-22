<template>
  <div class="app" :class="{ embedded: isEmbeddedRoute, 'with-devtools': showDevToolsBar }">
    <DevToolsBar v-if="showDevToolsBar" />
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
import DevToolsBar from './devtools/DevToolsBar.vue'

const route = useRoute()
const isEmbeddedRoute = computed(() => route.path.startsWith('/admin-embed/'))
const showDevToolsBar = computed(
  () =>
    import.meta.env.DEV &&
    route.path.startsWith('/admin') &&
    !route.path.startsWith('/admin-embed/')
)
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app.with-devtools {
  padding-top: 70px;
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

@media (max-width: 860px) {
  .app.with-devtools {
    padding-top: 118px;
  }
}
</style>
