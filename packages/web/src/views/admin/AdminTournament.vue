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
      >
        {{ $t(setupOverviewLabel) }}
      </RouterLink>
      <RouterLink
        :to="setupDataPath"
        class="subnav-link"
        :class="{ active: isSetupDataActive }"
      >
        {{ $t(setupDataLabel) }}
      </RouterLink>
      <RouterLink
        :to="operationsPath"
        class="subnav-link"
        :class="{ active: isOperationsActive }"
      >
        {{ $t(operationsLabel) }}
      </RouterLink>
      <RouterLink
        :to="reportsPath"
        class="subnav-link"
        :class="{ active: isReportsActive }"
      >
        {{ $t(reportsLabel) }}
      </RouterLink>
    </nav>
    <div v-if="showLegacyMigrationLink" class="row migration-link-row">
      <RouterLink class="migration-link" :to="legacyUpgradePath">
        {{ $t('新画面へ移動') }}
      </RouterLink>
    </div>
    <article v-if="shouldLockLegacyRoute" class="card stack legacy-readonly-banner" role="status">
      <div class="row legacy-readonly-head">
        <strong>{{ $t('読み取り専用') }}</strong>
      </div>
      <p>{{ $t('旧導線は読み取り専用です。新画面で操作してください。') }}</p>
      <RouterLink class="migration-link" :to="legacyUpgradePath || `/admin/${tournamentId}/setup`">
        {{ $t('新画面へ移動') }}
      </RouterLink>
    </article>
    <div class="legacy-content-shell" :class="{ locked: shouldLockLegacyRoute }">
      <RouterView v-if="!sectionLoading" />
    </div>
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
import { isAdminUiV2Enabled, isLegacyAdminReadOnlyEnabled } from '@/config/feature-flags'

const route = useRoute()
const router = useRouter()
const tournamentStore = useTournamentStore()

const tournamentId = computed(() => route.params.tournamentId as string)
const tournament = computed(() =>
  tournamentStore.tournaments.find((t) => t._id === tournamentId.value)
)
const sectionLoading = ref(true)
const lastRefreshedAt = ref<string>('')
const adminUiV2Enabled = computed(() => {
  const matchedWithFlag = route.matched.find((item) => item.meta?.adminUiV2 !== undefined)
  if (matchedWithFlag) return Boolean(matchedWithFlag.meta.adminUiV2)
  return isAdminUiV2Enabled()
})
const legacyAdminReadOnlyEnabled = ref(isLegacyAdminReadOnlyEnabled())
const duplicateBallotCount = ref(0)
const duplicateFeedbackCount = ref(0)
const hasDuplicateSubmissions = computed(
  () => duplicateBallotCount.value > 0 || duplicateFeedbackCount.value > 0
)
const isSetupRoute = computed(() => {
  const base = `/admin/${tournamentId.value}/`
  return route.path.startsWith(`${base}setup`) || route.path.startsWith(`${base}home`)
})
const isSetupDataActive = computed(
  () => isSetupRoute.value && String(route.query.section ?? '') === 'data'
)
const isSetupOverviewActive = computed(
  () => isSetupRoute.value && String(route.query.section ?? '') !== 'data'
)
const isOperationsActive = computed(() => {
  const base = `/admin/${tournamentId.value}/`
  return (
    route.path.startsWith(`${base}operations`) ||
    route.path.startsWith(`${base}rounds`)
  )
})
const isReportsActive = computed(() => {
  const base = `/admin/${tournamentId.value}/`
  return route.path.startsWith(`${base}reports`) || route.path.startsWith(`${base}compiled`)
})
const setupBasePath = computed(() =>
  adminUiV2Enabled.value ? `/admin/${tournamentId.value}/setup` : `/admin/${tournamentId.value}/home`
)
const setupOverviewPath = computed(() => setupBasePath.value)
const setupDataPath = computed(() => ({
  path: setupBasePath.value,
  query: { section: 'data' },
}))
const operationsPath = computed(() =>
  adminUiV2Enabled.value
    ? `/admin/${tournamentId.value}/operations`
    : `/admin/${tournamentId.value}/rounds`
)
const reportsPath = computed(() =>
  adminUiV2Enabled.value
    ? `/admin/${tournamentId.value}/reports`
    : `/admin/${tournamentId.value}/compiled`
)
const setupOverviewLabel = computed(() => '大会設定')
const setupDataLabel = computed(() => '大会データ準備')
const operationsLabel = computed(() =>
  adminUiV2Enabled.value ? 'ラウンド運営' : 'ラウンド管理'
)
const reportsLabel = computed(() =>
  adminUiV2Enabled.value ? '大会結果レポート' : 'レポート生成'
)
const isLegacyPrimaryRoute = computed(() => {
  const base = `/admin/${tournamentId.value}/`
  return (
    route.path === `${base}home` ||
    route.path === `${base}rounds` ||
    route.path === `${base}compiled`
  )
})
const legacyUpgradePath = computed(() => {
  if (adminUiV2Enabled.value) return ''
  const base = `/admin/${tournamentId.value}/`
  if (route.path.startsWith(`${base}home`)) return `${base}setup`
  if (route.path === `${base}rounds`) return `${base}operations`
  if (route.path.startsWith(`${base}compiled`)) return `${base}reports`
  return ''
})
const shouldLockLegacyRoute = computed(
  () =>
    legacyAdminReadOnlyEnabled.value &&
    !adminUiV2Enabled.value &&
    isLegacyPrimaryRoute.value
)
const showLegacyMigrationLink = computed(
  () => Boolean(legacyUpgradePath.value) && !shouldLockLegacyRoute.value
)
const lastRefreshedLabel = computed(() => {
  if (!lastRefreshedAt.value) return ''
  const date = new Date(lastRefreshedAt.value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
})

function goBack() {
  router.push('/admin')
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
    lastRefreshedAt.value = new Date().toISOString()
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

.header-reload {
  margin-left: 0;
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

.migration-link-row {
  margin-top: calc(var(--space-4) * -1);
  margin-bottom: var(--space-3);
}

.migration-link {
  color: var(--color-primary);
  font-size: 0.85rem;
  text-decoration: none;
}

.migration-link:hover {
  text-decoration: underline;
}

.legacy-readonly-banner {
  border: 1px solid #f59e0b;
  border-left: 4px solid #d97706;
  background: #fffbeb;
  margin-top: calc(var(--space-2) * -1);
  padding: var(--space-2) var(--space-3);
}

.legacy-readonly-head {
  align-items: center;
}

.legacy-content-shell.locked {
  pointer-events: none;
  opacity: 0.78;
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
