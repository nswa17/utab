<template>
  <section class="stack">
    <div class="stack header-stack">
      <div class="row tournament-header">
        <Button variant="secondary" size="sm" class="tournament-list-back" :to="headerBackPath">
          ← {{ headerBackLabel }}
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
    <RouterView v-if="!sectionLoading" />
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { useTournamentStore } from '@/stores/tournament'
import TournamentNotice from '@/components/common/TournamentNotice.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'

const route = useRoute()
const tournamentStore = useTournamentStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => {
  const value = route.params.tournamentId
  return typeof value === 'string' ? value.trim() : ''
})
const tournament = computed(() =>
  tournamentStore.tournaments.find((t) => t._id === tournamentId.value)
)
const sectionLoading = ref(true)
const isTournamentHomeRoute = computed(() => {
  if (!tournamentId.value) return true
  const homePath = `/user/${tournamentId.value}/home`
  const rootPath = `/user/${tournamentId.value}`
  return route.path === homePath || route.path === rootPath
})
const headerBackPath = computed(() =>
  !tournamentId.value || isTournamentHomeRoute.value ? '/user' : `/user/${tournamentId.value}/home`
)
const headerBackLabel = computed(() =>
  !tournamentId.value || isTournamentHomeRoute.value ? t('大会一覧') : t('大会ホームに戻る')
)
const showTournamentNotice = computed(() => Boolean(tournamentId.value) && !isTournamentHomeRoute.value)
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

watch(
  tournamentId,
  async () => {
    if (!tournamentId.value) {
      sectionLoading.value = false
      return
    }
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

@media (max-width: 720px) {
  .tournament-header {
    align-items: center;
  }

  .title-qr-button {
    width: 64px;
    height: 64px;
  }

}
</style>
