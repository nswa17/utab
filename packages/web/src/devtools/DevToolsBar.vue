<template>
  <section class="devtools-bar" aria-label="開発補完ツール">
    <div class="devtools-row">
      <strong class="devtools-title">DEV TOOLS</strong>
      <span class="small muted" v-if="tournamentId">tournament: {{ tournamentId }}</span>
      <span class="small muted" v-else>大会未選択</span>

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
        speakers/team
        <input v-model.number="speakersPerTeam" type="number" min="1" />
      </label>

      <label class="devtools-field">
        round
        <input v-model.number="roundInput" type="number" min="1" />
      </label>

      <button
        type="button"
        class="devtools-button"
        :disabled="setupBusy || !tournamentId"
        @click="onFillSetup"
      >
        {{ setupBusy ? '補完中...' : '大会データ補完' }}
      </button>

      <button
        type="button"
        class="devtools-button"
        :disabled="roundBusy || !tournamentId || !resolvedRound"
        @click="onFillRoundSubmissions"
      >
        {{ roundBusy ? '補完中...' : 'ラウンド提出補完' }}
      </button>
    </div>

    <p v-if="errorMessage" class="small error">{{ errorMessage }}</p>
    <p v-if="fillSetupSummary" class="small devtools-summary">
      setup: +teams {{ fillSetupSummary.created.teams }} / +speakers
      {{ fillSetupSummary.created.speakers }} / +adjs {{ fillSetupSummary.created.adjudicators }} /
      +venues {{ fillSetupSummary.created.venues }}
    </p>
    <p v-if="fillRoundSummary" class="small devtools-summary">
      round {{ fillRoundSummary.round }}: expected {{ fillRoundSummary.expected.total }} /
      created {{ fillRoundSummary.created.total }}
      (ballot {{ fillRoundSummary.created.ballot }}, feedback
      {{ fillRoundSummary.created.feedback }})
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  requestFillRoundSubmissions,
  requestFillSetup,
  type FillRoundSubmissionsResponse,
  type FillSetupResponse,
} from './api'
import { resolvePreferredRound } from './route-round'

const route = useRoute()

const targetTeams = ref(8)
const targetAdjudicators = ref(8)
const targetVenues = ref(4)
const speakersPerTeam = ref(2)
const roundInput = ref(1)

const setupBusy = ref(false)
const roundBusy = ref(false)
const errorMessage = ref('')
const fillSetupSummary = ref<FillSetupResponse | null>(null)
const fillRoundSummary = ref<FillRoundSubmissionsResponse | null>(null)

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
  if (!tournamentId.value || setupBusy.value || roundBusy.value) return

  setupBusy.value = true
  errorMessage.value = ''
  fillRoundSummary.value = null
  try {
    const data = await requestFillSetup(tournamentId.value, {
      targetTeams: normalizeTarget(targetTeams.value, 0),
      targetAdjudicators: normalizeTarget(targetAdjudicators.value, 0),
      targetVenues: normalizeTarget(targetVenues.value, 0),
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
  if (!tournamentId.value || setupBusy.value || roundBusy.value || resolvedRound.value === null) return

  roundBusy.value = true
  errorMessage.value = ''
  fillSetupSummary.value = null
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

.devtools-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
