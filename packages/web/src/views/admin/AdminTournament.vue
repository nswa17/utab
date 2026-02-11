<template>
  <section class="stack">
    <div class="row">
      <Button variant="ghost" size="sm" @click="goBack">← {{ $t('大会一覧') }}</Button>
      <h2>{{ tournament?.name ?? $t('大会詳細') }}</h2>
      <span class="muted small tournament-id">{{ $t('大会ID: {id}', { id: tournamentId }) }}</span>
      <ReloadButton @click="refreshSection" :disabled="sectionLoading" :loading="sectionLoading" />
    </div>
    <LoadingState v-if="sectionLoading" />
    <template v-else>
      <article
        v-if="hasDuplicateSubmissions"
        class="card stack duplicate-warning"
        role="status"
        aria-live="polite"
      >
        <div class="row duplicate-head">
          <span class="duplicate-badge" aria-hidden="true">!</span>
          <h4>{{ $t('重複提出の注意') }}</h4>
        </div>
        <p>
          {{
            $t(
              '重複する提出が検知されました。詳細を確認の上、提出データから不要な評価を削除してください。'
            )
          }}
        </p>
        <p class="muted small">
          {{
            $t('重複: チーム評価 {ballot} / ジャッジフィードバック {feedback}', {
              ballot: duplicateBallotCount,
              feedback: duplicateFeedbackCount,
            })
          }}
        </p>
      </article>
      <TournamentNotice :tournament-id="tournamentId" />
    </template>

    <nav class="subnav">
      <button
        type="button"
        class="tab-link"
        :class="{ active: isOverviewActive }"
        @click="openOverview"
      >
        {{ $t('大会設定') }}
      </button>
      <RouterLink :to="`/admin/${tournamentId}/rounds`">{{ $t('ラウンド管理') }}</RouterLink>
      <button type="button" class="tab-link" :class="{ active: isDataActive }" @click="openData">
        {{ $t('大会データ管理') }}
      </button>
      <RouterLink :to="`/admin/${tournamentId}/compiled`">{{ $t('レポート生成') }}</RouterLink>
    </nav>

    <RouterView v-if="!sectionLoading" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from '@/components/common/Button.vue'
import ReloadButton from '@/components/common/ReloadButton.vue'
import TournamentNotice from '@/components/common/TournamentNotice.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useTournamentStore } from '@/stores/tournament'
import { api } from '@/utils/api'

const route = useRoute()
const router = useRouter()
const tournamentStore = useTournamentStore()

const tournamentId = computed(() => route.params.tournamentId as string)
const tournament = computed(() =>
  tournamentStore.tournaments.find((t) => t._id === tournamentId.value)
)
const sectionLoading = ref(true)
const duplicateBallotCount = ref(0)
const duplicateFeedbackCount = ref(0)
const hasDuplicateSubmissions = computed(
  () => duplicateBallotCount.value > 0 || duplicateFeedbackCount.value > 0
)
const isOverviewActive = computed(() => {
  if (route.path !== `/admin/${tournamentId.value}/home`) return false
  return String(route.query.section ?? 'overview') !== 'data'
})
const isDataActive = computed(() => {
  if (route.path !== `/admin/${tournamentId.value}/home`) return false
  return String(route.query.section ?? '') === 'data'
})

function goBack() {
  router.push('/admin')
}

function openOverview() {
  router.push({ path: `/admin/${tournamentId.value}/home`, query: { section: 'overview' } })
}

function openData() {
  router.push({ path: `/admin/${tournamentId.value}/home`, query: { section: 'data' } })
}

function submissionActorId(item: any) {
  const payloadEntityId = String(item?.payload?.submittedEntityId ?? '').trim()
  if (payloadEntityId) return payloadEntityId
  const submittedBy = String(item?.submittedBy ?? '').trim()
  return submittedBy
}

function countDuplicateSubmissions(items: any[]) {
  const ballotCountByKey = new Map<string, number>()
  const feedbackCountByKey = new Map<string, number>()

  items.forEach((item) => {
    const round = Number(item?.round)
    if (!Number.isFinite(round)) return
    const actor = submissionActorId(item)
    if (!actor) return
    if (item?.type === 'ballot') {
      const key = `${round}:${actor}`
      ballotCountByKey.set(key, (ballotCountByKey.get(key) ?? 0) + 1)
      return
    }
    if (item?.type === 'feedback') {
      const adjudicatorId = String(item?.payload?.adjudicatorId ?? '').trim()
      if (!adjudicatorId) return
      const key = `${round}:${actor}:${adjudicatorId}`
      feedbackCountByKey.set(key, (feedbackCountByKey.get(key) ?? 0) + 1)
    }
  })

  const ballotDuplicates = Array.from(ballotCountByKey.values()).reduce(
    (total, count) => total + (count > 1 ? count - 1 : 0),
    0
  )
  const feedbackDuplicates = Array.from(feedbackCountByKey.values()).reduce(
    (total, count) => total + (count > 1 ? count - 1 : 0),
    0
  )

  duplicateBallotCount.value = ballotDuplicates
  duplicateFeedbackCount.value = feedbackDuplicates
}

async function refreshDuplicateWarnings() {
  if (!tournamentId.value) return
  try {
    const res = await api.get('/submissions', { params: { tournamentId: tournamentId.value } })
    const items = Array.isArray(res.data?.data) ? res.data.data : []
    countDuplicateSubmissions(items)
  } catch {
    duplicateBallotCount.value = 0
    duplicateFeedbackCount.value = 0
  }
}

async function refreshSection() {
  sectionLoading.value = true
  try {
    await Promise.all([tournamentStore.fetchTournaments(), refreshDuplicateWarnings()])
  } finally {
    sectionLoading.value = false
  }
}

watch(
  tournamentId,
  () => {
    refreshSection()
  },
  { immediate: true }
)
</script>

<style scoped>
.subnav {
  display: flex;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.subnav a {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  background: var(--color-surface);
}

.tab-link {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
  font: inherit;
}

.subnav a.router-link-active,
.tab-link.active {
  background: var(--color-primary);
  color: var(--color-primary-contrast);
  border-color: var(--color-primary);
}

.tournament-id {
  margin-left: auto;
}

.duplicate-warning {
  border: 1px solid #fca5a5;
  border-left: 6px solid #dc2626;
  background: #fef2f2;
}

.duplicate-head {
  align-items: center;
  gap: var(--space-2);
}

.duplicate-head h4 {
  margin: 0;
}

.duplicate-badge {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 800;
}
</style>
