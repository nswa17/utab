<template>
  <section class="stack">
    <div class="row section-header">
      <h3>{{ title }}</h3>
      <ReloadButton
        class="header-reload"
        @click="refresh"
        :disabled="results.loading"
        :loading="results.loading"
      />
    </div>

    <form v-if="showCreateFlag" class="stack" @submit.prevent="handleCreate">
      <div class="grid">
        <Field :label="$t('ラウンド')" required v-slot="{ id, describedBy }">
          <input
            v-model.number="createRound"
            :id="id"
            :aria-describedby="describedBy"
            type="number"
            min="1"
          />
        </Field>
        <Button type="submit" :disabled="results.loading">{{ $t('追加') }}</Button>
      </div>
      <textarea v-model="createPayload" rows="4" placeholder='{"standings": []}' />
    </form>

    <div v-if="items.length === 0" class="muted">{{ $t('結果がありません。') }}</div>
    <ul v-else class="list">
      <li v-for="result in items" :key="result._id" class="list-item result-item">
        <div class="stack">
          <div>
            <strong>{{ $t('ラウンド {round}', { round: result.round }) }}</strong>
            <div class="muted">
              {{ $t('作成者: {name}', { name: result.createdBy || $t('不明') }) }}
            </div>
          </div>
          <div v-if="isStandingsPayload(result.payload)" class="stack standings-preview">
            <div class="grid headings">
              <span>{{ $t('名前/チーム') }}</span>
              <span>{{ $t('順位') }}</span>
              <span>{{ $t('ポイント') }}</span>
            </div>
            <div
              v-for="(row, index) in standingsPreview(result.payload)"
              :key="`${result._id}-${index}`"
              class="grid standings-row preview"
            >
              <span>{{ row.name || '—' }}</span>
              <span>{{ row.rank ?? '—' }}</span>
              <span>{{ row.points ?? '—' }}</span>
            </div>
          </div>
          <details class="payload-details">
            <summary>{{ $t('JSONを表示') }}</summary>
            <pre class="payload">{{ formatPayload(result.payload) }}</pre>
          </details>
        </div>
        <div v-if="canEdit" class="row">
          <Button variant="ghost" size="sm" @click.stop="startEdit(result)">
            {{ editingId === result._id ? $t('編集中') : $t('編集') }}
          </Button>
          <Button variant="danger" size="sm" @click="remove(result)">{{ $t('削除') }}</Button>
        </div>
      </li>
    </ul>

    <div v-if="editingId && canEdit" ref="editCardRef" class="card stack">
      <div class="row">
        <strong>{{ $t('結果編集') }}</strong>
        <Button variant="ghost" size="sm" @click="cancelEdit">{{ $t('閉じる') }}</Button>
      </div>
      <div class="grid">
        <Field :label="$t('ラウンド')" required v-slot="{ id, describedBy }">
          <input
            v-model.number="editRound"
            :id="id"
            :aria-describedby="describedBy"
            type="number"
            min="1"
          />
        </Field>
        <Button :disabled="results.loading" @click="saveEdit">
          {{ $t('保存') }}
        </Button>
      </div>
      <div class="row">
        <span class="muted small">{{ $t('standings を構造化編集できます') }}</span>
        <Button
          variant="ghost"
          size="sm"
          :disabled="!structuredAvailable"
          @click="useStructured = structuredAvailable ? !useStructured : false"
        >
          {{ useStructured && structuredAvailable ? $t('JSON編集に切替') : $t('構造化編集に切替') }}
        </Button>
      </div>
      <div v-if="useStructured && structuredAvailable" class="stack">
        <div class="grid headings">
          <span>{{ $t('名前/チーム') }}</span>
          <span>{{ $t('順位') }}</span>
          <span>{{ $t('ポイント') }}</span>
        </div>
        <div v-for="(row, index) in editStandings" :key="index" class="grid standings-row">
          <input v-model="row.name" :aria-label="$t('名前')" />
          <input v-model.number="row.rank" type="number" min="1" :aria-label="$t('順位')" />
          <input v-model.number="row.points" type="number" step="0.01" :aria-label="$t('ポイント')" />
          <Button variant="ghost" size="sm" @click="removeStandingRow(index)">
            {{ $t('削除') }}
          </Button>
        </div>
        <div class="row">
          <Button variant="ghost" size="sm" @click="addStandingRow">{{ $t('行を追加') }}</Button>
        </div>
      </div>
      <textarea v-else v-model="editPayload" rows="6" />
    </div>

    <div
      v-if="deleteTarget"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeDeleteModal"
    >
      <div class="modal card stack" role="dialog" aria-modal="true">
        <h4>{{ $t('削除') }}</h4>
        <p class="muted">{{ $t('この結果を削除しますか？') }}</p>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="closeDeleteModal">{{ $t('キャンセル') }}</Button>
          <Button variant="danger" size="sm" :disabled="results.loading" @click="confirmDeleteResult">
            {{ $t('削除') }}
          </Button>
        </div>
      </div>
    </div>

    <NoticeDialog v-model:open="showNoticeDialog" :message="noticeMessage" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import NoticeDialog from '@/components/common/NoticeDialog.vue'
import ReloadButton from '@/components/common/ReloadButton.vue'
import { useResultsStore } from '@/stores/results'
import type { Result } from '@/types/result'

const props = defineProps<{
  tournamentId: string
  round?: number
  title?: string
  showCreate?: boolean
  editable?: boolean
}>()

const results = useResultsStore()
const { t } = useI18n({ useScope: 'global' })

const title = computed(() => props.title ?? t('結果'))
const canEdit = computed(() => props.editable ?? true)
const showCreateFlag = computed(() => props.showCreate ?? false)
const items = computed(() => {
  if (props.round !== undefined) {
    return results.results.filter((r) => r.round === props.round)
  }
  return results.results
})

const createRound = ref(props.round ?? 1)
const createPayload = ref('{"standings": []}')
const showNoticeDialog = ref(false)
const noticeMessage = ref('')

const editingId = ref<string | null>(null)
const editCardRef = ref<HTMLElement | null>(null)
const editRound = ref(1)
const editPayload = ref('')
const editObject = ref<any>(null)
const editStandings = ref<
  Array<{ name: string; rank: number | null; points: number | null; raw: Record<string, unknown> }>
>([])
const deleteTarget = ref<Result | null>(null)
const useStructured = ref(false)
const structuredAvailable = computed(() => isStandingsPayload(editObject.value))

function openNotice(message: string) {
  noticeMessage.value = message
  showNoticeDialog.value = true
}

function formatPayload(payload: Record<string, unknown>) {
  return JSON.stringify(payload, null, 2)
}

function isStandingsPayload(payload: any) {
  return Array.isArray(payload?.standings)
}

function standingsPreview(payload: any) {
  if (!isStandingsPayload(payload)) return []
  return toStandingsRows(payload).filter((row) => row.name.trim().length > 0)
}

function toStandingsRows(payload: any) {
  if (!isStandingsPayload(payload)) return []
  return (payload.standings as any[]).map((row) => ({
    name: String(row.name ?? row.team ?? row.id ?? ''),
    rank: row.rank ?? row.place ?? null,
    points: row.points ?? row.score ?? row.speaker_points ?? null,
    raw: { ...(row ?? {}) },
  }))
}

function addStandingRow() {
  editStandings.value = [...editStandings.value, { name: '', rank: null, points: null, raw: {} }]
}

function removeStandingRow(index: number) {
  editStandings.value = editStandings.value.filter((_, i) => i !== index)
}

async function refresh() {
  if (!props.tournamentId) return
  await results.fetchResults(props.tournamentId)
}

async function handleCreate() {
  try {
    const payload = JSON.parse(createPayload.value)
    await results.createResult({
      tournamentId: props.tournamentId,
      round: createRound.value,
      payload,
    })
    createPayload.value = '{"standings": []}'
  } catch {
    openNotice(t('JSON形式が正しくありません'))
  }
}

function startEdit(result: Result) {
  editingId.value = result._id
  editRound.value = result.round
  editObject.value = result.payload
  useStructured.value = structuredAvailable.value
  if (structuredAvailable.value) {
    editStandings.value = toStandingsRows(result.payload)
  }
  editPayload.value = JSON.stringify(result.payload, null, 2)
  nextTick(() => {
    editCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

function cancelEdit() {
  editingId.value = null
  editPayload.value = ''
  editObject.value = null
  editStandings.value = []
  useStructured.value = false
}

async function saveEdit() {
  if (!editingId.value) return
  try {
    let payload: any
    if (useStructured.value && structuredAvailable.value) {
      const base = { ...(editObject.value ?? {}) }
      delete base.standings
      payload = {
        ...base,
        standings: editStandings.value
          .filter((row) => row.name.trim().length > 0)
          .map((row) => {
            const nextRow: Record<string, unknown> = {
              ...row.raw,
              name: row.name.trim(),
            }
            if (row.rank === null) delete nextRow.rank
            else nextRow.rank = row.rank
            if (row.points === null) delete nextRow.points
            else nextRow.points = row.points
            return nextRow
          }),
      }
      editPayload.value = JSON.stringify(payload, null, 2)
    } else {
      payload = JSON.parse(editPayload.value)
    }
    await results.updateResult({
      tournamentId: props.tournamentId,
      resultId: editingId.value,
      round: editRound.value,
      payload,
    })
    cancelEdit()
  } catch {
    openNotice(t('JSON形式が正しくありません'))
  }
}

function closeDeleteModal() {
  deleteTarget.value = null
}

async function confirmDeleteResult() {
  const target = deleteTarget.value
  if (!target) return
  closeDeleteModal()
  await results.deleteResult(props.tournamentId, target._id)
}

function remove(result: Result) {
  deleteTarget.value = result
}

watch(
  () => props.round,
  (next) => {
    if (next !== undefined) {
      createRound.value = next
    }
  }
)

watch(
  () => results.error,
  (message) => {
    if (!message) return
    openNotice(message)
  }
)

onMounted(() => {
  refresh()
})
</script>

<style scoped>

.grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.payload {
  margin: 0;
  width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-muted);
}

.result-item {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
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

.standings-preview {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-surface);
}

.preview {
  font-size: 0.92rem;
}

.payload-details summary {
  cursor: pointer;
  color: var(--color-muted);
}

.payload-details[open] summary {
  margin-bottom: var(--space-2);
}

.standings-row {
  align-items: center;
  grid-template-columns: 2fr 1fr 1fr auto;
}

.headings {
  grid-template-columns: 2fr 1fr 1fr;
  font-weight: 600;
}

@media (max-width: 860px) {
  .result-item {
    grid-template-columns: 1fr;
  }
}

.section-header {
  align-items: center;
}

.header-reload {
  margin-left: auto;
}
</style>
