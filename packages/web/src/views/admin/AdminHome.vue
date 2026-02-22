<template>
  <section class="stack">
    <div class="row header-row">
      <h2>{{ $t('管理ダッシュボード') }}</h2>
    </div>
    <div class="card stack">
      <h3 class="section-title">{{ $t('新規大会作成') }}</h3>
      <form class="stack" @submit.prevent="handleCreate">
        <Field :label="$t('大会名')" required v-slot="{ id, describedBy }">
          <input v-model="form.name" :id="id" :aria-describedby="describedBy" type="text" />
        </Field>
        <Field :label="$t('スタイル')" v-slot="{ id, describedBy }">
          <select v-model.number="form.style" :id="id" :aria-describedby="describedBy">
            <option v-for="style in styles.styles" :key="style.id" :value="style.id">
              {{ style.id }}: {{ style.name }}
            </option>
          </select>
        </Field>
        <label class="checkbox-field small">
          <input v-model="form.hidden" type="checkbox" />
          {{ $t('大会を非公開') }}
        </label>
        <Button type="submit" :loading="tournament.loading">{{ $t('作成') }}</Button>
        <p v-if="createError" class="error">{{ createError }}</p>
      </form>
    </div>
    <div class="card stack">
      <h3 class="section-title">{{ $t('登録済み大会') }}</h3>
      <Field :label="$t('検索')" v-slot="{ id, describedBy }">
        <input
          v-model="searchQuery"
          :id="id"
          :aria-describedby="describedBy"
          :placeholder="$t('大会名で検索')"
        />
      </Field>
      <LoadingState v-if="tournament.loading || styles.loading" />
      <p v-else-if="tournamentsLoadError" class="error">{{ tournamentsLoadError }}</p>
      <template v-else>
        <p v-if="downloadError" class="error">{{ downloadError }}</p>
        <EmptyState
          v-if="filteredTournaments.length === 0"
          :title="$t('表示できる大会がありません。')"
        />
        <Table v-else hover striped sticky-header>
          <thead>
            <tr>
              <th>{{ $t('大会名') }}</th>
              <th>{{ $t('スタイル') }}</th>
              <th>{{ $t('更新日') }}</th>
              <th>{{ $t('操作') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredTournaments" :key="item._id">
              <td>
                <RouterLink class="name-link" :to="`/admin/${item._id}/setup`">
                  <strong>{{ item.name }}</strong>
                  <span v-if="item.user_defined_data?.hidden" class="visibility-badge">
                    {{ $t('非公開') }}
                  </span>
                </RouterLink>
              </td>
              <td>{{ styleName(item.style) }}</td>
              <td>{{ formatDate(item.updatedAt ?? item.createdAt) }}</td>
              <td>
                <div class="row">
                  <Button variant="secondary" size="sm" :to="`/admin/${item._id}/setup`">
                    {{ $t('大会管理') }}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    @click="downloadTournamentBundle(item._id, item.name)"
                  >
                    {{ $t('大会データ一括DL') }}
                  </Button>
                  <Button variant="danger" size="sm" @click="remove(item._id)">{{ $t('削除') }}</Button>
                </div>
              </td>
            </tr>
          </tbody>
        </Table>
      </template>
    </div>

    <div
      v-if="deleteModalTournament"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeDeleteModal"
    >
      <div class="modal card stack" role="dialog" aria-modal="true">
        <h4>{{ $t('削除') }}</h4>
        <p class="muted">{{ $t('大会を削除しますか？関連データも削除されます。') }}</p>
        <p class="muted small">{{ deleteModalTournament.name }}</p>
        <p v-if="deleteModalError" class="error small">{{ deleteModalError }}</p>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="closeDeleteModal">{{ $t('キャンセル') }}</Button>
          <Button variant="danger" size="sm" :disabled="tournament.loading" @click="confirmDeleteTournament">
            {{ $t('削除') }}
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTournamentStore } from '@/stores/tournament'
import { useAuthStore } from '@/stores/auth'
import { useStylesStore } from '@/stores/styles'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Table from '@/components/common/Table.vue'
import { api } from '@/utils/api'

const tournament = useTournamentStore()
const styles = useStylesStore()
const auth = useAuthStore()
const { t } = useI18n({ useScope: 'global' })
const downloadError = ref<string | null>(null)
const downloadLoadingMap = ref<Record<string, boolean>>({})
const createError = ref<string | null>(null)
const tournamentsLoadError = ref<string | null>(null)
const deleteModalError = ref<string | null>(null)

const visibleTournaments = computed(() => {
  if (auth.role === 'superuser') return tournament.tournaments
  if (auth.role === 'organizer') {
    if (auth.tournaments.length === 0) return []
    return tournament.tournaments.filter((item) => auth.tournaments.includes(item._id))
  }
  return []
})

const searchQuery = ref('')
const deleteModalTournamentId = ref('')
const naturalSortCollator = new Intl.Collator(['ja', 'en'], {
  numeric: true,
  sensitivity: 'base',
})
const filteredTournaments = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const filtered = q
    ? visibleTournaments.value.filter((item) => {
        return item.name?.toLowerCase().includes(q)
      })
    : visibleTournaments.value
  return filtered.slice().sort((a, b) => {
    const timeA = Date.parse(String(a.updatedAt ?? a.createdAt ?? ''))
    const timeB = Date.parse(String(b.updatedAt ?? b.createdAt ?? ''))
    if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) {
      return timeB - timeA
    }
    if (Number.isFinite(timeA) && !Number.isFinite(timeB)) return -1
    if (!Number.isFinite(timeA) && Number.isFinite(timeB)) return 1
    const nameCompare = naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? ''))
    if (nameCompare !== 0) return nameCompare
    return naturalSortCollator.compare(String(a._id ?? ''), String(b._id ?? ''))
  })
})
const deleteModalTournament = computed(
  () => visibleTournaments.value.find((item) => item._id === deleteModalTournamentId.value) ?? null
)

const form = reactive({
  name: '',
  style: 1,
  hidden: true,
})

onMounted(() => {
  refresh()
})

async function handleCreate() {
  if (!form.name) return
  createError.value = null
  const created = await tournament.createTournament({
    name: form.name,
    style: form.style,
    options: {},
    user_defined_data: {
      hidden: form.hidden,
    },
  })
  if (!created) {
    createError.value = tournament.error ?? t('大会の作成に失敗しました。')
    return
  }
  if (created) {
    form.name = ''
    form.style = styles.styles[0]?.id ?? 1
    form.hidden = true
  }
}

function styleName(styleId: number) {
  return styles.styles.find((s) => s.id === styleId)?.name ?? String(styleId)
}

function formatDate(raw?: string) {
  if (!raw) return '—'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

async function refresh() {
  tournamentsLoadError.value = null
  await Promise.all([tournament.fetchTournaments(), styles.fetchStyles()])
  tournamentsLoadError.value = tournament.error
  if (!form.style && styles.styles.length > 0) {
    form.style = styles.styles[0].id
  }
}

function isDownloadLoading(tournamentId: string): boolean {
  return Boolean(downloadLoadingMap.value[tournamentId])
}

function setDownloadLoading(tournamentId: string, loading: boolean) {
  const next = { ...downloadLoadingMap.value }
  if (loading) next[tournamentId] = true
  else delete next[tournamentId]
  downloadLoadingMap.value = next
}

function buildZipFilename(tournamentName: string, tournamentId: string): string {
  const safeName = tournamentName.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'tournament'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${safeName}-${tournamentId}-${stamp}.zip`
}

function resolveDownloadFilename(headers: Record<string, unknown>, fallback: string): string {
  const contentDisposition = String(headers['content-disposition'] ?? '')
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim())
    } catch {
      return utf8Match[1].trim()
    }
  }
  const basicMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i)
  if (basicMatch?.[1]) return basicMatch[1].trim()
  return fallback
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function extractDownloadErrorMessage(err: any): Promise<string | null> {
  const directMessage = err?.response?.data?.errors?.[0]?.message
  if (typeof directMessage === 'string' && directMessage.length > 0) {
    return directMessage
  }
  const data = err?.response?.data
  if (!(data instanceof Blob)) return null
  try {
    const text = await data.text()
    const parsed = JSON.parse(text)
    const blobMessage = parsed?.errors?.[0]?.message
    return typeof blobMessage === 'string' && blobMessage.length > 0 ? blobMessage : null
  } catch {
    return null
  }
}

async function downloadTournamentBundle(tournamentId: string, tournamentName: string) {
  if (isDownloadLoading(tournamentId)) return
  downloadError.value = null
  setDownloadLoading(tournamentId, true)
  try {
    const fallbackFilename = buildZipFilename(tournamentName, tournamentId)
    const response = await api.get(`/tournaments/${tournamentId}/export`, {
      responseType: 'blob',
    })
    const filename = resolveDownloadFilename(
      response.headers as Record<string, unknown>,
      fallbackFilename
    )
    const blob =
      response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: 'application/zip' })
    triggerDownload(filename, blob)
  } catch (err: any) {
    downloadError.value =
      (await extractDownloadErrorMessage(err)) ?? t('大会データの一括ダウンロードに失敗しました。')
  } finally {
    setDownloadLoading(tournamentId, false)
  }
}

function remove(id: string) {
  deleteModalError.value = null
  deleteModalTournamentId.value = id
}

function closeDeleteModal() {
  deleteModalError.value = null
  deleteModalTournamentId.value = ''
}

async function confirmDeleteTournament() {
  if (!deleteModalTournament.value) return
  const id = deleteModalTournament.value._id
  deleteModalError.value = null
  const deleted = await tournament.deleteTournament(id)
  if (!deleted) {
    deleteModalError.value = tournament.error ?? t('大会の削除に失敗しました。')
    return
  }
  closeDeleteModal()
}
</script>

<style scoped>
.error {
  color: var(--color-danger);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  z-index: 40;
}

.modal {
  width: min(520px, 100%);
  max-height: calc(100vh - 80px);
  overflow: auto;
}

.modal-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.header-row {
  align-items: center;
  gap: var(--space-2);
}

.checkbox-field {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.name-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: inherit;
}

.visibility-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid #fdba74;
  background: #fff7ed;
  color: #9a3412;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  padding: 0.2rem 0.55rem;
}

.section-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
}
</style>
