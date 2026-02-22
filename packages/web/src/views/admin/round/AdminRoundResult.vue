<template>
  <section class="stack">
    <div v-if="!isEmbeddedRoute" class="row section-header">
      <div class="stack tight">
        <h4>{{ $t('ラウンド {round} 生結果', { round }) }}</h4>
      </div>
    </div>

    <div class="card stack">
      <div class="row">
        <Field :label="$t('ラベル')" v-slot="{ id, describedBy }">
          <select v-model="activeLabel" :id="id" :aria-describedby="describedBy">
            <option value="teams">{{ $t('チーム') }}</option>
            <option value="speakers">{{ $t('スピーカー') }}</option>
            <option value="adjudicators">{{ $t('ジャッジ') }}</option>
          </select>
        </Field>
        <label class="row">
          <input v-model="sortBySender" type="checkbox" />
          <span class="muted">{{ $t('送信者でグループ化') }}</span>
        </label>
        <Button variant="secondary" size="sm" @click="downloadCsv">
          {{ $t('CSVダウンロード') }}
        </Button>
      </div>
      <Field :label="$t('新規生結果 (JSON)')" v-slot="{ id, describedBy }">
        <textarea v-model="newPayload" :id="id" :aria-describedby="describedBy" rows="6" />
      </Field>
      <Button @click="createRaw">{{ $t('追加') }}</Button>
      <p v-if="raw.error" class="error">{{ raw.error }}</p>
    </div>

    <div v-if="raw.loading" class="muted">{{ $t('読み込み中...') }}</div>
    <div v-else class="card stack">
      <div class="row">
        <strong>{{ $t('{label} 結果', { label: labelDisplay(activeLabel) }) }}</strong>
        <Button variant="danger" size="sm" @click="openDeleteAllModal">{{ $t('全削除') }}</Button>
      </div>
      <p class="muted">
        {{ $t('{count} 件', { count: activeResults.length }) }}
      </p>
      <div v-if="activeLabel === 'teams'" class="card soft stack">
        <div class="row">
          <strong>{{ $t('部屋順サマリ') }}</strong>
          <span class="muted">{{ $t('スコアシート') }}: {{ teamBallotCount }}</span>
        </div>
        <div v-if="roomOrderSummaries.length === 0" class="muted">{{ $t('まだ試合がありません。') }}</div>
        <ul v-else class="room-summary-list">
          <li v-for="item in roomOrderSummaries" :key="item.key" class="room-summary-item">
            <span class="muted">{{ item.venueLabel }}</span>
            <span>{{ item.govName }} {{ $t('vs') }} {{ item.oppName }} {{ item.scoreLabel }}</span>
            <span class="muted">{{ $t('スコアシート') }} {{ item.ballotCount }}</span>
          </li>
        </ul>
      </div>
      <div v-if="groupedResults.length === 0" class="muted">{{ $t('結果がありません。') }}</div>
      <div v-else class="stack">
        <details v-for="group in groupedResults" :key="group.key" class="group">
          <summary class="row">
            <strong>{{ group.name }}</strong>
            <span class="muted">{{ $t('{count} 件', { count: group.results.length }) }}</span>
          </summary>
          <ul class="list">
            <li v-for="result in group.results" :key="result._id" class="list-item">
              <div class="row">
                <strong>{{ entityName(result.id) }}</strong>
                <span class="muted">{{ $t('送信元: {name}', { name: entityName(result.from_id) }) }}</span>
                <span class="muted">{{ $t('r: {round}', { round: result.r }) }}</span>
              </div>
              <pre class="payload">{{ format(result) }}</pre>
              <div class="row">
                <Button variant="ghost" size="sm" @click="startEdit(result)">
                  {{ $t('編集') }}
                </Button>
                <Button variant="danger" size="sm" @click="remove(result._id)">
                  {{ $t('削除') }}
                </Button>
              </div>
            </li>
          </ul>
        </details>
      </div>
    </div>

    <div v-if="editing" class="card stack">
      <div class="row">
        <strong>{{ $t('編集') }}</strong>
        <Button variant="ghost" size="sm" @click="cancelEdit">{{ $t('閉じる') }}</Button>
      </div>
      <Field :label="$t('編集内容 (JSON)')" v-slot="{ id, describedBy }">
        <textarea v-model="editPayload" :id="id" :aria-describedby="describedBy" rows="8" />
      </Field>
      <Button @click="saveEdit">{{ $t('保存') }}</Button>
    </div>

    <div
      v-if="deleteAllModalOpen"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeDeleteAllModal"
    >
      <div class="modal card stack" role="dialog" aria-modal="true">
        <h4>{{ $t('全削除') }}</h4>
        <p class="muted">{{ $t('このラウンドの結果をすべて削除しますか？') }}</p>
        <p v-if="deleteAllError" class="error small">{{ deleteAllError }}</p>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="closeDeleteAllModal">{{ $t('キャンセル') }}</Button>
          <Button variant="danger" size="sm" :disabled="raw.loading" @click="confirmDeleteAll">
            {{ $t('削除') }}
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import { useRawResultsStore } from '@/stores/raw-results'
import { useTeamsStore } from '@/stores/teams'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { useSpeakersStore } from '@/stores/speakers'
import { useDrawsStore } from '@/stores/draws'
import { useVenuesStore } from '@/stores/venues'

const route = useRoute()
const raw = useRawResultsStore()
const teams = useTeamsStore()
const adjudicators = useAdjudicatorsStore()
const speakers = useSpeakersStore()
const draws = useDrawsStore()
const venues = useVenuesStore()
const { t } = useI18n({ useScope: 'global' })
const props = withDefaults(
  defineProps<{
    embedded?: boolean
    embeddedRound?: number | null
  }>(),
  {
    embedded: false,
    embeddedRound: null,
  }
)

function normalizeRoundValue(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null
}

const tournamentId = computed(() => route.params.tournamentId as string)
const round = computed(() => {
  const fromProp = normalizeRoundValue(props.embeddedRound)
  if (fromProp !== null) return fromProp
  const fromParam = normalizeRoundValue(route.params.round)
  if (fromParam !== null) return fromParam
  return normalizeRoundValue(route.query.round) ?? 1
})
const isEmbeddedRoute = computed(
  () => props.embedded || route.path.startsWith('/admin-embed/') || String(route.query.embed ?? '') === '1'
)
const activeLabel = ref<'teams' | 'speakers' | 'adjudicators'>('teams')
const newPayload = ref('')
const sortBySender = ref(true)

const activeResults = computed(() => {
  if (activeLabel.value === 'teams') return raw.teamResults
  if (activeLabel.value === 'speakers') return raw.speakerResults
  return raw.adjudicatorResults
})

const groupedResults = computed(() => {
  const key = sortBySender.value ? 'from_id' : 'id'
  const groups = new Map<string, any[]>()
  activeResults.value.forEach((result: any) => {
    const groupKey = String(result[key] ?? 'unknown')
    const existing = groups.get(groupKey) ?? []
    existing.push(result)
    groups.set(groupKey, existing)
  })
  return Array.from(groups.entries())
    .map(([groupKey, results]) => ({
      key: groupKey,
      name: entityName(groupKey),
      results,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const drawForRound = computed(() => draws.draws.find((draw) => Number(draw.round) === round.value))

function venueName(id?: string) {
  if (!id) return t('会場未定')
  return venues.venues.find((venue) => venue._id === id)?.name ?? id
}

const teamBallotCount = computed(() => {
  if (activeLabel.value !== 'teams') return 0
  const fromIds = new Set(
    raw.teamResults
      .map((result: any) => String(result.from_id ?? ''))
      .filter((id: string) => id.length > 0)
  )
  if (fromIds.size > 0) return fromIds.size
  return Math.ceil(raw.teamResults.length / 2)
})

const roomOrderSummaries = computed(() => {
  if (activeLabel.value !== 'teams') return []
  const draw = drawForRound.value
  if (!draw?.allocation) return []
  return draw.allocation.map((row: any, index: number) => {
    const govId = String(row?.teams?.gov ?? row?.teams?.[0] ?? '')
    const oppId = String(row?.teams?.opp ?? row?.teams?.[1] ?? '')
    const govEntries = raw.teamResults.filter((result: any) => {
      const opponents = Array.isArray(result.opponents) ? result.opponents.map(String) : []
      return String(result.id) === govId && opponents.includes(oppId)
    })
    const oppEntries = raw.teamResults.filter((result: any) => {
      const opponents = Array.isArray(result.opponents) ? result.opponents.map(String) : []
      return String(result.id) === oppId && opponents.includes(govId)
    })
    const govWin = govEntries.reduce((acc: number, result: any) => acc + Number(result.win ?? 0), 0)
    const oppWin = oppEntries.reduce((acc: number, result: any) => acc + Number(result.win ?? 0), 0)
    const ballotIds = new Set<string>()
    ;[...govEntries, ...oppEntries].forEach((result: any) => {
      const token =
        result.from_id ?? `${result.id}:${result.r}:${JSON.stringify(result.opponents ?? [])}:${result.win}`
      ballotIds.add(String(token))
    })
    return {
      key: `room-${index}-${govId}-${oppId}`,
      venueLabel: venueName(String(row?.venue ?? '')),
      govName: entityName(govId),
      oppName: entityName(oppId),
      scoreLabel: `${govWin}-${oppWin}`,
      ballotCount: ballotIds.size,
    }
  })
})

const editing = ref(false)
const editingId = ref<string | null>(null)
const editPayload = ref('')
const deleteAllModalOpen = ref(false)
const deleteAllError = ref('')

function format(value: any) {
  return JSON.stringify(value, null, 2)
}

function buildDefaultPayload() {
  const base: any = {
    tournamentId: tournamentId.value,
    id: '',
    from_id: '',
    r: round.value,
  }
  if (activeLabel.value === 'teams') {
    base.win = 1
    base.side = 'gov'
    base.opponents = []
  } else if (activeLabel.value === 'speakers') {
    base.scores = [75]
    base.user_defined_data = { best: [], poi: [] }
  } else {
    base.score = 8
    base.judged_teams = []
  }
  newPayload.value = JSON.stringify(base, null, 2)
}

function labelDisplay(label: string) {
  const map: Record<string, string> = {
    teams: t('チーム'),
    speakers: t('スピーカー'),
    adjudicators: t('ジャッジ'),
  }
  return map[label] ?? label
}

function entityName(id: string) {
  return (
    teams.teams.find((t) => t._id === id)?.name ||
    adjudicators.adjudicators.find((a) => a._id === id)?.name ||
    speakers.speakers.find((s) => s._id === id)?.name ||
    id
  )
}

async function refresh() {
  await Promise.all([
    raw.fetchRawResults({ tournamentId: tournamentId.value, label: 'teams', round: round.value }),
    raw.fetchRawResults({
      tournamentId: tournamentId.value,
      label: 'speakers',
      round: round.value,
    }),
    raw.fetchRawResults({
      tournamentId: tournamentId.value,
      label: 'adjudicators',
      round: round.value,
    }),
    draws.fetchDraws(tournamentId.value, round.value),
    venues.fetchVenues(tournamentId.value),
    teams.fetchTeams(tournamentId.value),
    adjudicators.fetchAdjudicators(tournamentId.value),
    speakers.fetchSpeakers(tournamentId.value),
  ])
}

async function createRaw() {
  try {
    const payload = JSON.parse(newPayload.value)
    await raw.createRawResults(activeLabel.value, payload)
    await refresh()
  } catch {
    raw.error = t('JSON形式が正しくありません')
  }
}

function startEdit(result: any) {
  editing.value = true
  editingId.value = result._id
  editPayload.value = JSON.stringify(result, null, 2)
}

function cancelEdit() {
  editing.value = false
  editingId.value = null
  editPayload.value = ''
}

async function saveEdit() {
  if (!editingId.value) return
  try {
    const payload = JSON.parse(editPayload.value)
    await raw.updateRawResult(activeLabel.value, editingId.value, payload)
    await refresh()
    cancelEdit()
  } catch {
    raw.error = t('JSON形式が正しくありません')
  }
}

async function remove(id?: string) {
  if (!id) return
  await raw.deleteRawResult(activeLabel.value, id, tournamentId.value)
  await refresh()
}

function openDeleteAllModal() {
  if (raw.loading) return
  deleteAllError.value = ''
  deleteAllModalOpen.value = true
}

function closeDeleteAllModal() {
  deleteAllError.value = ''
  deleteAllModalOpen.value = false
}

async function confirmDeleteAll() {
  deleteAllError.value = ''
  const deleted = await raw.deleteRawResults(activeLabel.value, {
    tournamentId: tournamentId.value,
    round: round.value,
  })
  if (!deleted) {
    deleteAllError.value = raw.error ?? t('全削除に失敗しました。')
    raw.error = null
    return
  }
  closeDeleteAllModal()
  await refresh()
}

function csvEscape(value: any) {
  if (value === null || value === undefined) return ''
  const text = Array.isArray(value) ? value.join(';') : String(value)
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/\"/g, '""')}"`
  }
  return text
}

function downloadCsv() {
  const label = activeLabel.value
  let headers: string[] = []
  let rows: Record<string, any>[] = []

  if (label === 'teams') {
    headers = ['id', 'from_id', 'r', 'win', 'side', 'opponents']
    rows = activeResults.value.map((result: any) => ({
      id: result.id,
      from_id: result.from_id,
      r: result.r,
      win: result.win,
      side: result.side,
      opponents: result.opponents ?? [],
    }))
  } else if (label === 'speakers') {
    headers = ['id', 'from_id', 'r', 'scores', 'best', 'poi']
    rows = activeResults.value.map((result: any) => ({
      id: result.id,
      from_id: result.from_id,
      r: result.r,
      scores: result.scores ?? [],
      best: result.user_defined_data?.best?.filter((b: any) => b.value).map((b: any) => b.order) ?? [],
      poi: result.user_defined_data?.poi?.filter((b: any) => b.value).map((b: any) => b.order) ?? [],
    }))
  } else {
    headers = ['id', 'from_id', 'r', 'score', 'judged_teams']
    rows = activeResults.value.map((result: any) => ({
      id: result.id,
      from_id: result.from_id,
      r: result.r,
      score: result.score,
      judged_teams: result.judged_teams ?? [],
    }))
  }

  const csv = [headers.join(','), ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(','))].join(
    '\n'
  )
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `raw-${label}-round-${round.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

watch([activeLabel, round], () => {
  buildDefaultPayload()
})

watch(
  [tournamentId, round],
  () => {
    refresh()
  },
  { immediate: true }
)

onMounted(() => {
  buildDefaultPayload()
})
</script>

<style scoped>
textarea,
select {
  width: 100%;
}

.section-header {
  align-items: flex-start;
}

.header-reload {
  margin-left: auto;
}

.group summary {
  cursor: pointer;
  list-style: none;
}

.group summary::-webkit-details-marker {
  display: none;
}

.payload {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-muted);
}

.room-summary-list {
  margin: 0;
  padding-left: var(--space-4);
  display: grid;
  gap: var(--space-2);
}

.room-summary-item {
  display: grid;
  gap: 2px;
}

.section-header {
  align-items: center;
}

.header-reload {
  margin-left: auto;
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

.error {
  color: var(--color-danger);
}
</style>
