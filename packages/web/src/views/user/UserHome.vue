<template>
  <section class="stack">
    <div class="row">
      <h2>{{ $t('参加者ダッシュボード') }}</h2>
      <ReloadButton @click="refresh" :disabled="isLoading" :loading="isLoading" />
    </div>
    <div class="card stack">
      <LoadingState v-if="isLoading" />
      <p v-else-if="tournament.error" class="error">{{ tournament.error }}</p>
      <EmptyState
        v-else-if="visibleTournaments.length === 0"
        :title="$t('表示できる大会がありません。')"
      />
      <div v-else class="stack tournament-list">
        <RouterLink
          v-for="item in visibleTournaments"
          :key="item._id"
          class="card tournament-card"
          :to="`/user/${item._id}/home`"
        >
          <div class="row">
            <strong>{{ item.name }}</strong>
            <span class="muted">{{ styleName(item.style) }}</span>
          </div>
        </RouterLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useTournamentStore } from '@/stores/tournament'
import { useStylesStore } from '@/stores/styles'
import LoadingState from '@/components/common/LoadingState.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ReloadButton from '@/components/common/ReloadButton.vue'

const tournament = useTournamentStore()
const styles = useStylesStore()

const visibleTournaments = computed(() =>
  tournament.tournaments.filter((item) => !(item.hidden ?? item.user_defined_data?.hidden))
)
const isLoading = computed(() => tournament.loading || styles.loading)

onMounted(() => {
  refresh()
})

async function refresh() {
  await Promise.all([tournament.fetchTournaments(), styles.fetchStyles()])
}

function styleName(styleId: number) {
  return styles.styles.find((style) => style.id === styleId)?.name ?? '—'
}
</script>

<style scoped>
.tournament-list {
  gap: var(--space-2);
}

.tournament-card {
  color: inherit;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.tournament-card:hover {
  border-color: var(--color-primary);
  background: var(--color-surface-muted);
}

.error {
  color: var(--color-danger);
}
</style>
