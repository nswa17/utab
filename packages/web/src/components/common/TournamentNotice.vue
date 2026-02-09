<template>
  <article v-if="shouldRender" class="card stack notice-card" role="status" aria-live="polite">
    <div class="row notice-head">
      <span class="notice-badge" aria-hidden="true">!</span>
      <h4>{{ $t('重要なお知らせ') }}</h4>
      <span v-if="infoTime" class="muted small">{{ $t('更新: {time}', { time: infoTime }) }}</span>
    </div>
    <p v-if="loading && !infoText" class="muted">{{ $t('お知らせを読み込み中...') }}</p>
    <div v-else class="notice-content" v-html="infoHtml"></div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTournamentStore } from '@/stores/tournament'
import { api } from '@/utils/api'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{
  tournamentId: string
}>()

const tournamentStore = useTournamentStore()
const loading = ref(false)
const fallbackTournament = ref<Record<string, any> | null>(null)

const tournament = computed(
  () =>
    tournamentStore.tournaments.find((item) => item._id === props.tournamentId) ??
    fallbackTournament.value
)
const infoText = computed(() =>
  String(tournament.value?.user_defined_data?.info?.text ?? '').trim()
)
const shouldRender = computed(() => infoText.value.length > 0)
const infoTime = computed(() => {
  const raw = tournament.value?.user_defined_data?.info?.time
  if (!raw) return ''
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? String(raw) : date.toLocaleString()
})
const infoHtml = computed(() => renderMarkdown(infoText.value))

async function ensureTournament() {
  if (tournamentStore.tournaments.some((item) => item._id === props.tournamentId)) {
    return
  }
  loading.value = true
  try {
    const res = await api.get(`/tournaments/${props.tournamentId}`)
    fallbackTournament.value = res.data?.data ?? null
  } catch {
    fallbackTournament.value = null
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.tournamentId, tournamentStore.tournaments.length],
  () => {
    ensureTournament()
  },
  { immediate: true }
)
</script>

<style scoped>
.notice-card {
  border: 1px solid #fbbf24;
  border-left: 6px solid #d97706;
  background: #fffbeb;
}

.notice-head {
  align-items: center;
  gap: var(--space-2);
}

.notice-head h4 {
  margin: 0;
}

.notice-head .muted {
  margin-left: auto;
}

.notice-badge {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #d97706;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.8rem;
}

.notice-content {
  color: #78350f;
}
</style>
