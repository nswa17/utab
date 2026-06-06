<template>
  <section class="stack">
    <div class="row header-row">
      <div class="row header-main">
        <Button variant="secondary" size="sm" @click="goBack">← {{ $t('大会一覧') }}</Button>
        <div class="stack header-title-block">
          <h2>{{ tournament?.name ?? $t('大会詳細') }}</h2>
          <span class="muted small tournament-id">{{
            $t('大会ID: {id}', { id: tournamentId })
          }}</span>
        </div>
      </div>
      <span v-if="lastRefreshedLabel" class="muted small header-meta">{{
        $t('最終更新: {time}', { time: lastRefreshedLabel })
      }}</span>
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
      <RouterLink
        :to="setupOverviewPath"
        class="subnav-link"
        :class="{ active: isSetupOverviewActive }"
        @click="refreshSectionInBackground"
      >
        {{ $t('大会設定') }}
      </RouterLink>
      <RouterLink
        :to="setupDataPath"
        class="subnav-link"
        :class="{ active: isSetupDataActive }"
        @click="refreshSectionInBackground"
      >
        {{ $t('大会データ準備') }}
      </RouterLink>
      <RouterLink
        :to="operationsPath"
        class="subnav-link"
        :class="{ active: isOperationsActive }"
        @click="refreshSectionInBackground"
      >
        {{ $t('大会運営') }}
      </RouterLink>
      <RouterLink
        :to="reportsPath"
        class="subnav-link"
        :class="{ active: isReportsActive }"
        @click="refreshSectionInBackground"
      >
        {{ $t('大会結果レポート') }}
      </RouterLink>
    </nav>

    <RouterView v-if="!sectionLoading" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from '@/components/common/Button.vue'
import TournamentNotice from '@/components/common/TournamentNotice.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useTournamentStore } from '@/stores/tournament'
import { api } from '@/utils/api'
import { createLatestRequestGate } from '@/utils/latest-request'
import { countDuplicateSubmissions } from '@/utils/submission-duplicates'

const route = useRoute()
const router = useRouter()
const tournamentStore = useTournamentStore()

const tournamentId = computed(() => route.params.tournamentId as string)
const tournament = computed(() =>
  tournamentStore.tournaments.find((item) => item._id === tournamentId.value)
)

const sectionLoading = ref(true)
const lastRefreshedAt = ref('')
const duplicateBallotCount = ref(0)
const duplicateFeedbackCount = ref(0)
const hasDuplicateSubmissions = computed(
  () => duplicateBallotCount.value > 0 || duplicateFeedbackCount.value > 0
)
const refreshGate = createLatestRequestGate()
let foregroundRefreshCount = 0

const basePath = computed(() => `/admin/${tournamentId.value}`)
const setupPath = computed(() => `${basePath.value}/setup`)
const operationsPath = computed(() => `${basePath.value}/operations`)
const reportsPath = computed(() => `${basePath.value}/reports`)

const setupOverviewPath = computed(() => setupPath.value)
const setupDataPath = computed(() => ({
  path: setupPath.value,
  query: { section: 'data' },
}))

const isSetupRoute = computed(() => route.path.startsWith(`${setupPath.value}`))
const isSetupDataActive = computed(
  () => isSetupRoute.value && String(route.query.section ?? '') === 'data'
)
const isSetupOverviewActive = computed(
  () => isSetupRoute.value && String(route.query.section ?? '') !== 'data'
)
const isOperationsActive = computed(
  () =>
    route.path.startsWith(`${operationsPath.value}`) ||
    route.path.startsWith(`${basePath.value}/rounds/`)
)
const isReportsActive = computed(() => route.path.startsWith(`${reportsPath.value}`))

const lastRefreshedLabel = computed(() => {
  if (!lastRefreshedAt.value) return ''
  const date = new Date(lastRefreshedAt.value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
})

function goBack() {
  router.push('/admin')
}

async function refreshDuplicateWarnings() {
  const currentTournamentId = tournamentId.value
  if (!currentTournamentId) {
    return {
      ballotDuplicates: 0,
      feedbackDuplicates: 0,
    }
  }
  try {
    const res = await api.get('/submissions', { params: { tournamentId: currentTournamentId } })
    const items = Array.isArray(res.data?.data) ? res.data.data : []
    return countDuplicateSubmissions(items)
  } catch {
    return {
      ballotDuplicates: 0,
      feedbackDuplicates: 0,
    }
  }
}

async function refreshSection(options: { showLoading?: boolean } = {}) {
  const showLoading = options.showLoading !== false
  const token = refreshGate.begin()
  if (showLoading) {
    foregroundRefreshCount += 1
    sectionLoading.value = true
  }
  try {
    const [, duplicateCounts] = await Promise.all([
      tournamentStore.fetchTournaments(),
      refreshDuplicateWarnings(),
    ])
    if (!refreshGate.isCurrent(token)) return
    duplicateBallotCount.value = duplicateCounts.ballotDuplicates
    duplicateFeedbackCount.value = duplicateCounts.feedbackDuplicates
    lastRefreshedAt.value = new Date().toISOString()
  } finally {
    refreshGate.complete(token)
    if (showLoading) {
      foregroundRefreshCount = Math.max(0, foregroundRefreshCount - 1)
      sectionLoading.value = foregroundRefreshCount > 0
    }
  }
}

function refreshSectionInBackground() {
  void refreshSection({ showLoading: false })
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
.header-row {
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.header-main {
  align-items: flex-start;
  gap: var(--space-2);
  flex-wrap: wrap;
  min-width: 0;
}

.header-title-block {
  gap: 2px;
  min-width: 0;
}

.header-title-block h2 {
  margin: 0;
  line-height: 1.2;
  color: var(--color-text);
  font-size: clamp(1.9rem, 2.4vw, 2.45rem);
  font-weight: 800;
  letter-spacing: 0.01em;
}

.header-meta {
  margin-left: auto;
}

.subnav {
  display: inline-flex;
  width: max-content;
  max-width: 100%;
  overflow-x: auto;
  gap: 0;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  margin-bottom: var(--space-4);
}

.subnav-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 18px;
  border-radius: 0;
  border: none;
  border-right: 1px solid var(--color-border);
  white-space: nowrap;
  color: var(--color-text);
  background: var(--color-surface);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  font: inherit;
  text-decoration: none;
}

.subnav-link:hover {
  background: #f8fafc;
  color: var(--color-text);
}

.subnav-link.active {
  background: var(--color-secondary);
  color: var(--color-text);
  font-weight: 700;
}

.subnav-link:last-child {
  border-right: none;
}

.tournament-id {
  margin: 0;
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

@media (max-width: 760px) {
  .subnav-link {
    min-height: 34px;
    padding: 0 12px;
    font-size: 0.85rem;
  }
}
</style>
