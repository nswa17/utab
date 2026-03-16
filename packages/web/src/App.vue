<template>
  <div
    class="app"
    :class="{ embedded: isEmbeddedRoute, 'with-devtools-dock': showDevToolsDock && devToolsOpen }"
  >
    <AppHeader v-if="!isEmbeddedRoute" />
    <main class="content" :class="{ embedded: isEmbeddedRoute }">
      <div class="page" :class="{ embedded: isEmbeddedRoute }">
        <div class="page-content" :class="{ embedded: isEmbeddedRoute }">
          <RouterView />
        </div>
      </div>
    </main>
    <AppBottomBar
      v-if="!isEmbeddedRoute"
      :show-dev-tools-toggle="showDevToolsDock"
      :dev-tools-open="devToolsOpen"
      @toggle-dev-tools="devToolsOpen = !devToolsOpen"
    />
    <DevToolsDock v-if="showDevToolsDock && devToolsOpen" @close="devToolsOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import AppHeader from './components/common/AppHeader.vue'
import AppBottomBar from './components/common/AppBottomBar.vue'
import DevToolsDock from './devtools/DevToolsDock.vue'

const route = useRoute()
const auth = useAuthStore()
const devToolsOpen = ref(false)
const isEmbeddedRoute = computed(() => route.path.startsWith('/admin-embed/'))
const hasAdminTournamentContext = computed(() => {
  if (!route.path.startsWith('/admin/')) return false
  const tournamentId = String(route.params.tournamentId ?? '').trim()
  return tournamentId.length > 0
})
const showDevToolsDock = computed(
  () => !isEmbeddedRoute.value && auth.canAccessAdmin && hasAdminTournamentContext.value
)

watch(
  showDevToolsDock,
  (visible) => {
    if (visible) return
    devToolsOpen.value = false
  },
  { immediate: true }
)
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app.with-devtools-dock {
  padding-bottom: 56px;
}

.content {
  flex: 1;
  background: var(--color-bg);
}

.app.embedded {
  min-height: auto;
  padding-bottom: 0;
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
