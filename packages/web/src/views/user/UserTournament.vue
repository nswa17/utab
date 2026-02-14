<template>
  <section class="stack">
    <div class="stack header-stack">
      <div class="row tournament-header">
        <Button variant="secondary" size="sm" class="tournament-list-back" to="/user">
          ← {{ $t('大会一覧') }}
        </Button>
        <div v-if="participantUrl" class="header-qr-slot">
          <button
            type="button"
            class="title-qr-button"
            :disabled="!qrCodeDataUrl"
            :title="$t('URLをコピー')"
            :aria-label="$t('URLをコピー')"
            @click="copyParticipantUrl"
          >
            <img v-if="qrCodeDataUrl" class="title-qr-image" :src="qrCodeDataUrl" :alt="$t('QRコード')" />
            <span v-else-if="qrLoading" class="muted small">{{ $t('読み込み中...') }}</span>
            <span v-else class="muted small">{{ $t('QRコード') }}</span>
          </button>
        </div>
        <h1 class="tournament-title">{{ tournament?.name ?? $t('大会詳細') }}</h1>
      </div>
      <p v-if="copyStatus === 'copied'" class="muted small">{{ $t('コピーしました。') }}</p>
      <p v-else-if="copyStatus === 'error'" class="error small">{{ copyError }}</p>
      <p v-if="qrError" class="error small">{{ qrError }}</p>
    </div>
    <LoadingState v-if="sectionLoading" />
    <TournamentNotice v-else-if="showTournamentNotice" :tournament-id="tournamentId" />
    <div v-if="showSubnav" class="row subnav-row">
      <nav class="subnav">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="subnav-link"
          :class="{ active: isActive(link) }"
          :aria-current="isActive(link) ? 'page' : undefined"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
      <div v-if="showAudienceViewSwitch" class="view-switch" role="group" :aria-label="$t('表示形式')">
        <button
          type="button"
          class="view-button"
          :class="{ active: audienceViewMode === 'card' }"
          :aria-pressed="audienceViewMode === 'card' ? 'true' : 'false'"
          :title="$t('カード表示')"
          @click="setAudienceViewMode('card')"
        >
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
            <rect
              x="3"
              y="4"
              width="14"
              height="5"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            />
            <rect
              x="3"
              y="11"
              width="14"
              height="5"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            />
          </svg>
          <span>{{ $t('カード表示') }}</span>
        </button>
        <button
          type="button"
          class="view-button"
          :class="{ active: audienceViewMode === 'table' }"
          :aria-pressed="audienceViewMode === 'table' ? 'true' : 'false'"
          :title="$t('テーブル表示')"
          @click="setAudienceViewMode('table')"
        >
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
            <rect
              x="3"
              y="4"
              width="14"
              height="12"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            />
            <path
              d="M3 8h14M8 4v12M13 4v12"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            />
          </svg>
          <span>{{ $t('テーブル表示') }}</span>
        </button>
      </div>
    </div>

    <RouterView v-if="!sectionLoading" />
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { useTournamentStore } from '@/stores/tournament'
import TournamentNotice from '@/components/common/TournamentNotice.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'

const route = useRoute()
const router = useRouter()
const tournamentStore = useTournamentStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const tournament = computed(() =>
  tournamentStore.tournaments.find((t) => t._id === tournamentId.value)
)
const sectionLoading = ref(true)
const isTournamentHomeRoute = computed(() => {
  const homePath = `/user/${tournamentId.value}/home`
  const rootPath = `/user/${tournamentId.value}`
  return route.path === homePath || route.path === rootPath
})
const showTournamentNotice = computed(() => !isTournamentHomeRoute.value)
const showSubnav = computed(() => {
  const homePath = `/user/${tournamentId.value}/home`
  const rootPath = `/user/${tournamentId.value}`
  if (route.path.includes('/rounds/')) return false
  return route.path !== homePath && route.path !== rootPath
})
const showAudienceViewSwitch = computed(
  () => route.path === `/user/${tournamentId.value}/audience/home`
)
const audienceViewMode = computed<'card' | 'table'>(() =>
  route.query.viewMode === 'table' ? 'table' : 'card'
)
const currentOrigin = computed(() => {
  if (typeof window === 'undefined') return ''
  return window.location.origin
})
const participantUrl = computed(() => {
  if (!tournamentId.value) return ''
  return `${currentOrigin.value}/user/${tournamentId.value}/home`
})

const qrLoading = ref(false)
const qrError = ref('')
const qrCodeDataUrl = ref('')
let qrGenerationId = 0

const copyStatus = ref<'idle' | 'copied' | 'error'>('idle')
const copyError = ref('')
let copyTimeout: number | null = null

type ParticipantLink = {
  to: string
  label: string
  participant: 'audience' | 'speaker' | 'adjudicator'
}

const links = computed<ParticipantLink[]>(() => [
  { to: `/user/${tournamentId.value}/audience/home`, label: t('対戦表'), participant: 'audience' },
  {
    to: `/user/${tournamentId.value}/speaker/home`,
    label: t('チーム評価'),
    participant: 'speaker',
  },
  {
    to: `/user/${tournamentId.value}/adjudicator/home`,
    label: t('ジャッジ評価'),
    participant: 'adjudicator',
  },
])

function isActive(link: ParticipantLink) {
  return route.params.participant === link.participant
}

async function generateQrCode(url: string) {
  const generationId = ++qrGenerationId
  qrLoading.value = true
  qrError.value = ''
  qrCodeDataUrl.value = ''
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      width: 140,
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
    if (copyTimeout) window.clearTimeout(copyTimeout)
    copyTimeout = window.setTimeout(() => {
      copyStatus.value = 'idle'
    }, 1200)
  } catch {
    copyStatus.value = 'error'
    copyError.value = t('クリップボードへのコピーに失敗しました。')
  }
}

function setAudienceViewMode(mode: 'card' | 'table') {
  if (!showAudienceViewSwitch.value) return
  if (route.query.viewMode === mode) return
  router.replace({
    query: {
      ...route.query,
      viewMode: mode,
    },
  })
}

watch(
  tournamentId,
  async () => {
    sectionLoading.value = true
    try {
      await tournamentStore.fetchTournaments()
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
      qrLoading.value = false
      qrError.value = ''
      qrCodeDataUrl.value = ''
      return
    }
    generateQrCode(url)
  },
  { immediate: true }
)

onUnmounted(() => {
  if (copyTimeout) window.clearTimeout(copyTimeout)
})
</script>

<style scoped>
.header-stack {
  gap: var(--space-2);
}

.tournament-header {
  width: 100%;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-3);
}

.tournament-list-back {
  flex-shrink: 0;
}

.tournament-title {
  margin: 0;
  font-size: clamp(1.8rem, 2.4vw, 2.2rem);
  line-height: 1.2;
}

.header-qr-slot {
  flex-shrink: 0;
}

.title-qr-button {
  width: 72px;
  height: 72px;
  display: inline-grid;
  place-items: center;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface-muted);
  padding: var(--space-1);
  cursor: pointer;
}

.title-qr-button:disabled {
  cursor: default;
}

.title-qr-image {
  width: 100%;
  height: 100%;
  display: block;
}

.subnav-row {
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
}

.subnav {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  overflow: hidden;
  background: var(--color-surface);
  margin-bottom: 0;
}

.subnav-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 14px;
  color: var(--color-muted);
  font-weight: 600;
}

.subnav-link + .subnav-link {
  border-left: 1px solid var(--color-border);
}

.subnav-link.router-link-active,
.subnav-link.active {
  background: var(--color-secondary);
  color: var(--color-primary);
}

.view-switch {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  overflow: hidden;
  background: var(--color-surface);
  flex-shrink: 0;
}

.view-button {
  border: none;
  background: transparent;
  color: var(--color-muted);
  min-height: 36px;
  padding: 0 12px;
  gap: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.view-button + .view-button {
  border-left: 1px solid var(--color-border);
}

.view-button.active {
  background: var(--color-secondary);
  color: var(--color-primary);
}

@media (max-width: 720px) {
  .tournament-header {
    align-items: center;
  }

  .title-qr-button {
    width: 64px;
    height: 64px;
  }

  .subnav-row {
    align-items: flex-start;
  }

  .subnav-link {
    min-height: 34px;
    padding: 0 12px;
    font-size: 0.85rem;
  }

  .view-button {
    min-height: 34px;
    padding: 0 10px;
    font-size: 11px;
  }
}
</style>
