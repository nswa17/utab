<template>
  <section class="devtools-bar" aria-label="開発補完ツール">
    <div class="devtools-layout">
      <section class="devtools-card devtools-card--setup">
        <h3 class="devtools-card-title">大会データ補完</h3>
        <div class="devtools-field-grid">
          <label class="devtools-field">
            <span class="devtools-field-label">Teams</span>
            <input v-model.number="targetTeams" type="number" min="0" />
          </label>
          <label class="devtools-field">
            <span class="devtools-field-label">Adjudicators</span>
            <input v-model.number="targetAdjudicators" type="number" min="0" />
          </label>
          <label class="devtools-field">
            <span class="devtools-field-label">Venues</span>
            <input v-model.number="targetVenues" type="number" min="0" />
          </label>
          <label class="devtools-field">
            <span class="devtools-field-label">Institutions</span>
            <input v-model.number="targetInstitutions" type="number" min="0" />
          </label>
          <label class="devtools-field">
            <span class="devtools-field-label">Speakers / Team</span>
            <input v-model.number="speakersPerTeam" type="number" min="1" />
          </label>
        </div>
        <div class="devtools-action-grid devtools-action-grid--setup">
          <button
            type="button"
            class="devtools-button primary"
            :disabled="setupBusy || clearSetupBusy || !tournamentId"
            @click="onFillSetup"
          >
            {{ setupBusy ? '補完中...' : '大会データ補完' }}
          </button>
          <button
            type="button"
            class="devtools-button warn"
            :disabled="setupBusy || clearSetupBusy || !tournamentId"
            @click="onClearSetupEntities"
          >
            {{ clearSetupBusy ? '削除中...' : '大会データ一括削除' }}
          </button>
        </div>
      </section>

      <section class="devtools-card devtools-card--round">
        <h3 class="devtools-card-title">ラウンド提出運営</h3>
        <label class="devtools-field devtools-field--round">
          <span class="devtools-field-label">Round</span>
          <input v-model.number="roundInput" type="number" min="1" />
        </label>
        <div class="devtools-action-grid devtools-action-grid--round">
          <button
            type="button"
            class="devtools-button primary"
            :disabled="roundBusy || !tournamentId || !resolvedRound"
            @click="onFillRoundSubmissions('ballot')"
          >
            {{ roundBusyMode === 'ballot' ? '補完中...' : 'チーム評価補完' }}
          </button>
          <button
            type="button"
            class="devtools-button primary"
            :disabled="roundBusy || !tournamentId || !resolvedRound"
            @click="onFillRoundSubmissions('feedback')"
          >
            {{ roundBusyMode === 'feedback' ? '補完中...' : 'ジャッジ評価補完' }}
          </button>
          <button
            type="button"
            class="devtools-button warn devtools-button--span"
            :disabled="clearRoundBusy || !tournamentId || !resolvedRound"
            @click="onClearRoundSubmissions"
          >
            {{ clearRoundBusy ? '削除中...' : '提出削除' }}
          </button>
        </div>
      </section>

      <section class="devtools-card devtools-card--copy">
        <h3 class="devtools-card-title">大会コピー</h3>
        <button
          type="button"
          class="devtools-button"
          :disabled="copyBusy || !tournamentId"
          @click="onCopyTournament"
        >
          {{ copyBusy ? 'コピー中...' : '大会コピー' }}
        </button>
      </section>
    </div>

    <div
      class="devtools-messages"
      v-if="
        errorMessage ||
        copySummary ||
        fillSetupSummary ||
        clearSetupSummary ||
        fillRoundSummary ||
        clearRoundSummary
      "
    >
      <p v-if="errorMessage" class="small error">{{ errorMessage }}</p>
      <p v-if="copySummary" class="small devtools-summary">
        copy: {{ copySummary.sourceTournamentName }} -> {{ copySummary.tournamentName }} (id
        {{ copySummary.tournamentId }}, docs {{ copySummary.copiedDocuments }})
        <a class="devtools-link" :href="`/admin/${copySummary.tournamentId}/setup`">開く</a>
      </p>
      <p v-if="fillSetupSummary" class="small devtools-summary">
        setup: +teams {{ fillSetupSummary.created.teams }} / +speakers
        {{ fillSetupSummary.created.speakers }} / +adjs {{ fillSetupSummary.created.adjudicators }} /
        +venues {{ fillSetupSummary.created.venues }} / +insts
        {{ fillSetupSummary.created.institutions }}
      </p>
      <p v-if="clearSetupSummary" class="small devtools-summary">
        data: deleted teams {{ clearSetupSummary.deleted.teams }} / speakers
        {{ clearSetupSummary.deleted.speakers }} / adjs
        {{ clearSetupSummary.deleted.adjudicators }} / venues
        {{ clearSetupSummary.deleted.venues }} / insts
        {{ clearSetupSummary.deleted.institutions }}
      </p>
      <p v-if="fillRoundSummary" class="small devtools-summary">
        round {{ fillRoundSummary.round }} ({{ fillModeLabel(fillRoundSummary.mode) }}): expected
        {{ fillRoundSummary.expected.total }} /
        created {{ fillRoundSummary.created.total }}
        (ballot {{ fillRoundSummary.created.ballot }}, feedback
        {{ fillRoundSummary.created.feedback }})
      </p>
      <p v-if="clearRoundSummary" class="small devtools-summary">
        round {{ clearRoundSummary.round }}: deleted {{ clearRoundSummary.deleted.total }} (ballot
        {{ clearRoundSummary.deleted.ballot }}, feedback
        {{ clearRoundSummary.deleted.feedback }})
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  type ClearSetupEntitiesResponse,
  type FillRoundSubmissionsMode,
  requestClearSetupEntities,
  requestClearRoundSubmissions,
  requestCopyTournament,
  requestFillRoundSubmissions,
  requestFillSetup,
  type ClearRoundSubmissionsResponse,
  type CopyTournamentResponse,
  type FillRoundSubmissionsResponse,
  type FillSetupResponse,
} from './api'
import { resolvePreferredRound } from './route-round'

const route = useRoute()

const targetTeams = ref(8)
const targetAdjudicators = ref(8)
const targetVenues = ref(4)
const targetInstitutions = ref(4)
const speakersPerTeam = ref(2)
const roundInput = ref(1)

const setupBusy = ref(false)
const clearSetupBusy = ref(false)
const roundBusyMode = ref<FillRoundSubmissionsMode | null>(null)
const clearRoundBusy = ref(false)
const copyBusy = ref(false)
const errorMessage = ref('')
const copySummary = ref<CopyTournamentResponse | null>(null)
const fillSetupSummary = ref<FillSetupResponse | null>(null)
const clearSetupSummary = ref<ClearSetupEntitiesResponse | null>(null)
const fillRoundSummary = ref<FillRoundSubmissionsResponse | null>(null)
const clearRoundSummary = ref<ClearRoundSubmissionsResponse | null>(null)
const roundBusy = computed(() => roundBusyMode.value !== null)

const tournamentId = computed(() => String(route.params.tournamentId ?? '').trim())

const resolvedRound = computed(() =>
  resolvePreferredRound({
    path: route.path,
    query: route.query as Record<string, unknown>,
    fallback: roundInput.value,
  })
)

watch(
  resolvedRound,
  (nextRound) => {
    if (nextRound === null) return
    roundInput.value = nextRound
  },
  { immediate: true }
)

function normalizeTarget(value: number, minValue: number): number {
  if (!Number.isFinite(value)) return minValue
  if (value < minValue) return minValue
  return Math.floor(value)
}

async function onFillSetup() {
  if (
    !tournamentId.value ||
    setupBusy.value ||
    clearSetupBusy.value ||
    roundBusy.value ||
    clearRoundBusy.value ||
    copyBusy.value
  )
    return

  setupBusy.value = true
  errorMessage.value = ''
  copySummary.value = null
  clearSetupSummary.value = null
  fillRoundSummary.value = null
  clearRoundSummary.value = null
  try {
    const data = await requestFillSetup(tournamentId.value, {
      targetTeams: normalizeTarget(targetTeams.value, 0),
      targetAdjudicators: normalizeTarget(targetAdjudicators.value, 0),
      targetVenues: normalizeTarget(targetVenues.value, 0),
      targetInstitutions: normalizeTarget(targetInstitutions.value, 0),
      speakersPerTeam: normalizeTarget(speakersPerTeam.value, 1),
    })
    fillSetupSummary.value = data
    window.setTimeout(() => {
      window.location.reload()
    }, 400)
  } catch (err: any) {
    errorMessage.value =
      err?.response?.data?.errors?.[0]?.message ?? '大会データ補完に失敗しました。'
  } finally {
    setupBusy.value = false
  }
}

async function onClearSetupEntities() {
  if (
    !tournamentId.value ||
    setupBusy.value ||
    clearSetupBusy.value ||
    roundBusy.value ||
    clearRoundBusy.value ||
    copyBusy.value
  )
    return

  const confirmed = window.confirm(
    'Teams / Speakers / Adjudicators / Venues / Institutions を全削除します。提出や結果は削除しません。続行しますか？'
  )
  if (!confirmed) return

  clearSetupBusy.value = true
  errorMessage.value = ''
  copySummary.value = null
  fillSetupSummary.value = null
  clearSetupSummary.value = null
  fillRoundSummary.value = null
  clearRoundSummary.value = null
  try {
    const data = await requestClearSetupEntities(tournamentId.value)
    clearSetupSummary.value = data
    window.setTimeout(() => {
      window.location.reload()
    }, 400)
  } catch (err: any) {
    errorMessage.value =
      err?.response?.data?.errors?.[0]?.message ?? '大会データ一括削除に失敗しました。'
  } finally {
    clearSetupBusy.value = false
  }
}

function fillModeLabel(mode: FillRoundSubmissionsMode): string {
  if (mode === 'ballot') return 'チーム評価'
  if (mode === 'feedback') return 'ジャッジ評価'
  if (mode === 'team_feedback') return 'チーム評価'
  if (mode === 'adjudicator_feedback') return 'ジャッジ評価'
  return '全部'
}

async function onFillRoundSubmissions(mode: FillRoundSubmissionsMode) {
  if (
    !tournamentId.value ||
    setupBusy.value ||
    clearSetupBusy.value ||
    roundBusy.value ||
    clearRoundBusy.value ||
    copyBusy.value ||
    resolvedRound.value === null
  )
    return

  roundBusyMode.value = mode
  errorMessage.value = ''
  copySummary.value = null
  fillSetupSummary.value = null
  clearSetupSummary.value = null
  clearRoundSummary.value = null
  try {
    const data = await requestFillRoundSubmissions(tournamentId.value, {
      round: resolvedRound.value,
      mode,
    })
    fillRoundSummary.value = data
    window.setTimeout(() => {
      window.location.reload()
    }, 400)
  } catch (err: any) {
    errorMessage.value =
      err?.response?.data?.errors?.[0]?.message ?? 'ラウンド提出補完に失敗しました。'
  } finally {
    roundBusyMode.value = null
  }
}

async function onClearRoundSubmissions() {
  if (
    !tournamentId.value ||
    setupBusy.value ||
    clearSetupBusy.value ||
    roundBusy.value ||
    clearRoundBusy.value ||
    copyBusy.value ||
    resolvedRound.value === null
  )
    return

  clearRoundBusy.value = true
  errorMessage.value = ''
  copySummary.value = null
  fillSetupSummary.value = null
  clearSetupSummary.value = null
  fillRoundSummary.value = null
  try {
    const data = await requestClearRoundSubmissions(tournamentId.value, {
      round: resolvedRound.value,
    })
    clearRoundSummary.value = data
    window.setTimeout(() => {
      window.location.reload()
    }, 400)
  } catch (err: any) {
    errorMessage.value =
      err?.response?.data?.errors?.[0]?.message ?? 'ラウンド提出削除に失敗しました。'
  } finally {
    clearRoundBusy.value = false
  }
}

async function onCopyTournament() {
  if (
    !tournamentId.value ||
    setupBusy.value ||
    clearSetupBusy.value ||
    roundBusy.value ||
    clearRoundBusy.value ||
    copyBusy.value
  )
    return

  copyBusy.value = true
  errorMessage.value = ''
  fillSetupSummary.value = null
  clearSetupSummary.value = null
  fillRoundSummary.value = null
  clearRoundSummary.value = null
  try {
    const data = await requestCopyTournament(tournamentId.value)
    copySummary.value = data
  } catch (err: any) {
    errorMessage.value = err?.response?.data?.errors?.[0]?.message ?? '大会コピーに失敗しました。'
  } finally {
    copyBusy.value = false
  }
}
</script>

<style scoped>
.devtools-bar {
  width: 100%;
  background: linear-gradient(180deg, #0f172a 0%, #0b1220 100%);
  color: #f8fafc;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 8px;
  display: grid;
  gap: 8px;
}

.devtools-layout {
  display: grid;
  grid-template-columns: 2.2fr 1.4fr 1.1fr;
  gap: 10px;
}

.devtools-card {
  background: rgba(15, 23, 42, 0.78);
  border: 1px solid #2f3f56;
  border-radius: 6px;
  padding: 10px;
  display: grid;
  gap: 10px;
}

.devtools-card--copy {
  align-content: space-between;
}

.devtools-card--round {
  align-content: start;
}

.devtools-card-title {
  margin: 0;
  font-size: 0.84rem;
  letter-spacing: 0.02em;
  color: #dbeafe;
}

.devtools-field-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(100px, 1fr));
  gap: 8px;
}

.devtools-field {
  display: grid;
  gap: 5px;
}

.devtools-field-label {
  font-size: 11px;
  color: #a8bbd3;
}

.devtools-field input {
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  border-radius: 7px;
  border: 1px solid #4a5f7b;
  background: #0a1429;
  color: #f8fafc;
  font-size: 0.95rem;
}

.devtools-field--round {
  max-width: 150px;
}

.devtools-action-grid {
  display: grid;
  gap: 8px;
}

.devtools-action-grid--setup {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.devtools-action-grid--round {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.devtools-button {
  width: 100%;
  min-height: 38px;
  border-radius: 6px;
  border: 1px solid #64748b;
  background: #1e293b;
  color: #f8fafc;
  padding: 0 10px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.devtools-button.primary {
  border-color: #5b6f8e;
  background: linear-gradient(180deg, #25334d 0%, #1f2c43 100%);
}

.devtools-button.warn {
  border-color: #b45f12;
  background: linear-gradient(180deg, #5b320a 0%, #4a2a08 100%);
}

.devtools-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.devtools-link {
  color: #7dd3fc;
  margin-left: 6px;
}

.devtools-button--span {
  grid-column: 1 / -1;
}

.devtools-messages {
  border-top: 1px solid #2c3d55;
  padding-top: 8px;
  display: grid;
  gap: 4px;
}

.devtools-summary {
  color: #cbd5e1;
  margin: 0;
}

@media (max-width: 860px) {
  .devtools-layout {
    grid-template-columns: 1fr;
  }

  .devtools-field-grid {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }

  .devtools-field--round {
    max-width: none;
  }
}
</style>
