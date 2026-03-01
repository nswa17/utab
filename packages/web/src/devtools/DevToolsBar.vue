<template>
  <section class="devtools-bar" aria-label="開発補完ツール">
    <div class="devtools-row">
      <strong class="devtools-title">DEV TOOLS</strong>
      <span class="small muted" v-if="tournamentId">tournament: {{ tournamentId }}</span>
      <span class="small muted" v-else>大会未選択</span>

      <button
        type="button"
        class="devtools-button"
        :disabled="copyBusy || !tournamentId"
        @click="onCopyTournament"
      >
        {{ copyBusy ? 'コピー中...' : '大会コピー' }}
      </button>

      <label class="devtools-field">
        teams
        <input v-model.number="targetTeams" type="number" min="0" />
      </label>

      <label class="devtools-field">
        adjs
        <input v-model.number="targetAdjudicators" type="number" min="0" />
      </label>

      <label class="devtools-field">
        venues
        <input v-model.number="targetVenues" type="number" min="0" />
      </label>

      <label class="devtools-field">
        insts
        <input v-model.number="targetInstitutions" type="number" min="0" />
      </label>

      <label class="devtools-field">
        speakers/team
        <input v-model.number="speakersPerTeam" type="number" min="1" />
      </label>

      <button
        type="button"
        class="devtools-button"
        :disabled="setupBusy || !tournamentId"
        @click="onFillSetup"
      >
        {{ setupBusy ? '補完中...' : '大会データ補完' }}
      </button>

      <label class="devtools-field">
        round
        <input v-model.number="roundInput" type="number" min="1" />
      </label>

      <button
        type="button"
        class="devtools-button"
        :disabled="roundBusy || !tournamentId || !resolvedRound"
        @click="onFillRoundSubmissions"
      >
        {{ roundBusy ? '補完中...' : 'ラウンド提出補完' }}
      </button>

      <button
        type="button"
        class="devtools-button warn"
        :disabled="clearRoundBusy || !tournamentId || !resolvedRound"
        @click="onClearRoundSubmissions"
      >
        {{ clearRoundBusy ? '削除中...' : '提出削除' }}
      </button>
    </div>

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
    <p v-if="fillRoundSummary" class="small devtools-summary">
      round {{ fillRoundSummary.round }}: expected {{ fillRoundSummary.expected.total }} /
      created {{ fillRoundSummary.created.total }}
      (ballot {{ fillRoundSummary.created.ballot }}, feedback
      {{ fillRoundSummary.created.feedback }})
    </p>
    <p v-if="clearRoundSummary" class="small devtools-summary">
      round {{ clearRoundSummary.round }}: deleted {{ clearRoundSummary.deleted.total }} (ballot
      {{ clearRoundSummary.deleted.ballot }}, feedback
      {{ clearRoundSummary.deleted.feedback }})
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
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
const roundBusy = ref(false)
const clearRoundBusy = ref(false)
const copyBusy = ref(false)
const errorMessage = ref('')
const copySummary = ref<CopyTournamentResponse | null>(null)
const fillSetupSummary = ref<FillSetupResponse | null>(null)
const fillRoundSummary = ref<FillRoundSubmissionsResponse | null>(null)
const clearRoundSummary = ref<ClearRoundSubmissionsResponse | null>(null)

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
    roundBusy.value ||
    clearRoundBusy.value ||
    copyBusy.value
  )
    return

  setupBusy.value = true
  errorMessage.value = ''
  copySummary.value = null
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

async function onFillRoundSubmissions() {
  if (
    !tournamentId.value ||
    setupBusy.value ||
    roundBusy.value ||
    clearRoundBusy.value ||
    copyBusy.value ||
    resolvedRound.value === null
  )
    return

  roundBusy.value = true
  errorMessage.value = ''
  copySummary.value = null
  fillSetupSummary.value = null
  clearRoundSummary.value = null
  try {
    const data = await requestFillRoundSubmissions(tournamentId.value, {
      round: resolvedRound.value,
    })
    fillRoundSummary.value = data
    window.setTimeout(() => {
      window.location.reload()
    }, 400)
  } catch (err: any) {
    errorMessage.value =
      err?.response?.data?.errors?.[0]?.message ?? 'ラウンド提出補完に失敗しました。'
  } finally {
    roundBusy.value = false
  }
}

async function onClearRoundSubmissions() {
  if (
    !tournamentId.value ||
    setupBusy.value ||
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
    roundBusy.value ||
    clearRoundBusy.value ||
    copyBusy.value
  )
    return

  copyBusy.value = true
  errorMessage.value = ''
  fillSetupSummary.value = null
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
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1400;
  background: #111827;
  color: #f8fafc;
  border-bottom: 1px solid #334155;
  padding: 8px 12px;
  display: grid;
  gap: 6px;
}

.devtools-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.devtools-title {
  letter-spacing: 0.04em;
}

.devtools-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.devtools-field input {
  width: 80px;
  min-height: 30px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #475569;
  background: #0f172a;
  color: #f8fafc;
}

.devtools-button {
  min-height: 30px;
  border-radius: 6px;
  border: 1px solid #64748b;
  background: #1e293b;
  color: #f8fafc;
  padding: 0 10px;
  font-weight: 600;
  cursor: pointer;
}

.devtools-button.warn {
  border-color: #b45309;
  background: #3f2a0f;
}

.devtools-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.devtools-link {
  color: #7dd3fc;
  margin-left: 6px;
}

.devtools-summary {
  color: #cbd5e1;
  margin: 0;
}

@media (max-width: 860px) {
  .devtools-field input {
    width: 68px;
  }
}
</style>
