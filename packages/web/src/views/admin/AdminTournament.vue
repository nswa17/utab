<template>
  <section class="stack">
    <div class="row">
      <Button variant="ghost" size="sm" @click="goBack">← {{ $t('大会一覧') }}</Button>
      <h2>{{ tournament?.name ?? $t('大会詳細') }}</h2>
      <span class="muted small tournament-id">{{ $t('大会ID: {id}', { id: tournamentId }) }}</span>
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
      <article class="card stack qr-share-card">
        <div class="row qr-share-head">
          <h4>{{ $t('参加者アクセス用QRコード') }}</h4>
        </div>
        <p class="muted small">{{ $t('参加者がスマホで読み取って大会ページを開けます。') }}</p>
        <div v-if="participantUrl" class="qr-grid">
          <div class="qr-box">
            <LoadingState v-if="qrLoading" />
            <img
              v-else-if="qrCodeDataUrl"
              class="qr-image"
              :src="qrCodeDataUrl"
              :alt="$t('QRコード')"
            />
            <p v-else class="muted small">{{ $t('QRコードを生成できませんでした。') }}</p>
            <p v-if="qrError" class="error">{{ qrError }}</p>
          </div>
          <div class="stack">
            <div class="muted small">{{ $t('大会アクセスURL') }}</div>
            <code class="qr-url">{{ participantUrl }}</code>
            <div class="row qr-actions">
              <Button variant="secondary" size="sm" @click="copyParticipantUrl">
                {{ copyStatus === 'copied' ? $t('コピーしました。') : $t('URLをコピー') }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                :href="participantUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ $t('参加者画面を開く') }}
              </Button>
            </div>
            <p v-if="copyStatus === 'error'" class="error small">{{ copyError }}</p>
            <p class="muted small">
              {{ $t('大会パスワードが必要な場合、参加者は表示された画面で入力します。') }}
            </p>
          </div>
        </div>
      </article>
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
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import Button from '@/components/common/Button.vue'
import TournamentNotice from '@/components/common/TournamentNotice.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useTournamentStore } from '@/stores/tournament'
import { api } from '@/utils/api'

const route = useRoute()
const router = useRouter()
const tournamentStore = useTournamentStore()
const { t } = useI18n({ useScope: 'global' })

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

function joinUrl(base: string, path: string) {
  const normalizedBase = base.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

const currentOrigin = computed(() => {
  if (typeof window === 'undefined') return ''
  return window.location.origin
})
const participantUrl = computed(() => {
  if (!tournamentId.value) return ''
  return joinUrl(currentOrigin.value, `/user/${tournamentId.value}/home`)
})

const qrLoading = ref(false)
const qrError = ref('')
const qrCodeDataUrl = ref('')
let qrGenerationId = 0

const copyStatus = ref<'idle' | 'copied' | 'error'>('idle')
const copyError = ref('')
let copyTimeout: number | null = null

async function generateQrCode(url: string) {
  const generationId = ++qrGenerationId
  qrLoading.value = true
  qrError.value = ''
  qrCodeDataUrl.value = ''
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
    if (generationId !== qrGenerationId) return
    qrCodeDataUrl.value = dataUrl
  } catch (err: any) {
    if (generationId !== qrGenerationId) return
    qrError.value = err?.message ?? t('QRコード生成に失敗しました。')
  } finally {
    if (generationId === qrGenerationId) {
      qrLoading.value = false
    }
  }
}

async function copyParticipantUrl() {
  const url = participantUrl.value
  if (!url) return
  copyStatus.value = 'idle'
  copyError.value = ''
  try {
    await navigator.clipboard.writeText(url)
    copyStatus.value = 'copied'
    if (copyTimeout) {
      window.clearTimeout(copyTimeout)
    }
    copyTimeout = window.setTimeout(() => {
      copyStatus.value = 'idle'
    }, 1200)
  } catch {
    copyStatus.value = 'error'
    copyError.value = t('クリップボードへのコピーに失敗しました。')
  }
}

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

watch(
  tournamentId,
  async () => {
    sectionLoading.value = true
    try {
      await Promise.all([tournamentStore.fetchTournaments(), refreshDuplicateWarnings()])
    } finally {
      sectionLoading.value = false
    }
  },
  { immediate: true }
)
watch(
  participantUrl,
  (url) => {
    if (!url) {
      qrError.value = ''
      qrCodeDataUrl.value = ''
      return
    }
    generateQrCode(url)
  },
  { immediate: true }
)

watch(
  () => route.fullPath,
  () => {
    if (!route.path.startsWith(`/admin/${tournamentId.value}`)) return
    refreshDuplicateWarnings()
  }
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

.qr-share-card h4 {
  margin: 0;
}

.qr-share-head {
  justify-content: space-between;
}

.qr-grid {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: var(--space-5);
  align-items: start;
}

.qr-box {
  display: grid;
  place-items: center;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px dashed var(--color-border);
  background: var(--color-surface-muted);
}

.qr-image {
  width: 220px;
  height: 220px;
  display: block;
}

.qr-url {
  display: block;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  word-break: break-all;
}

.qr-actions {
  flex-wrap: wrap;
}

.qr-actions :deep(.btn) {
  flex: 1 1 auto;
  justify-content: center;
}

.qr-actions :deep(.btn--secondary) {
  min-width: 140px;
}

.qr-actions :deep(.btn--ghost) {
  min-width: 160px;
  border-color: var(--color-border);
}

.qr-actions :deep(.btn--ghost):hover {
  border-color: var(--color-primary);
}

@media (max-width: 720px) {
  .qr-grid {
    grid-template-columns: 1fr;
  }

  .qr-box {
    width: min(320px, 100%);
    margin: 0 auto;
  }
}
</style>
