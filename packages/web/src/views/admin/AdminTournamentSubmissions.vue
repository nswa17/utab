<template>
  <section class="stack">
    <div class="row section-header">
      <div class="stack tight">
        <h3>{{ $t('提出データ') }}</h3>
        <span v-if="contextRoundLabel" class="muted small">{{ contextRoundLabel }}</span>
      </div>
      <div class="row section-header-actions">
        <span v-if="lastRefreshedLabel" class="muted small">{{
          $t('最終更新: {time}', { time: lastRefreshedLabel })
        }}</span>
        <RouterLink v-if="contextRound !== null" class="context-link" :to="contextRoundPath">
          {{ $t('対戦表設定に戻る') }}
        </RouterLink>
      </div>
    </div>

    <LoadingState v-if="sectionLoading" />

    <template v-else>
      <section class="stats-grid">
        <div class="card soft stack stat-card">
          <span class="muted small">{{ $t('提出数') }}</span>
          <strong>{{ items.length }}</strong>
        </div>
        <div class="card soft stack stat-card">
          <span class="muted small">{{ $t('スコアシート') }}</span>
          <strong>{{ ballotCount }}</strong>
        </div>
        <div class="card soft stack stat-card">
          <span class="muted small">{{ $t('フィードバック') }}</span>
          <strong>{{ feedbackCount }}</strong>
        </div>
      </section>

      <div class="card stack filter-bar">
        <div class="grid">
          <Field :label="$t('種類')" v-slot="{ id, describedBy }">
            <select v-model="typeFilter" :id="id" :aria-describedby="describedBy">
              <option value="all">{{ $t('すべて') }}</option>
              <option value="ballot">{{ $t('スコアシート') }}</option>
              <option value="feedback">{{ $t('フィードバック') }}</option>
            </select>
          </Field>
          <Field v-if="!isRoundContext" :label="$t('ラウンド')" v-slot="{ id, describedBy }">
            <select v-model="roundFilter" :id="id" :aria-describedby="describedBy">
              <option value="">{{ $t('すべて') }}</option>
              <option v-for="round in sortedRounds" :key="round.round" :value="String(round.round)">
                {{ round.name ?? $t('ラウンド {round}', { round: round.round }) }}
              </option>
            </select>
          </Field>
          <Field :label="$t('検索')" v-slot="{ id, describedBy }">
            <input
              v-model="searchQuery"
              :id="id"
              :aria-describedby="describedBy"
              :placeholder="$t('提出者名で検索')"
            />
          </Field>
        </div>
        <p v-if="isRoundContext" class="muted small">
          {{ $t('この画面はラウンド固定です。') }}
        </p>
      </div>

      <p v-if="loadError" class="error">{{ loadError }}</p>
      <div v-else-if="items.length === 0" class="muted">{{ $t('提出がありません。') }}</div>

      <Table v-if="items.length > 0" hover striped sticky-header>
        <thead>
          <tr>
            <th>{{ $t('種類') }}</th>
            <th>{{ $t('ラウンド') }}</th>
            <th>{{ $t('提出者') }}</th>
            <th>{{ $t('概要') }}</th>
            <th>{{ $t('作成日時') }}</th>
            <th>{{ $t('操作') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="item in items" :key="item._id">
            <tr>
              <td>{{ typeLabel(item.type) }}</td>
              <td>{{ item.round }}</td>
              <td>{{ submittedByLabel(item) }}</td>
              <td>{{ submissionSummary(item) }}</td>
              <td>{{ formatDate(item.createdAt) }}</td>
              <td>
                <div class="row row-actions">
                  <Button variant="ghost" size="sm" @click="toggleExpand(item._id)">
                    {{ isExpanded(item._id) ? $t('詳細を隠す') : $t('詳細を表示') }}
                  </Button>
                  <Button
                    v-if="item.type !== 'ballot'"
                    variant="secondary"
                    size="sm"
                    @click="startEdit(item)"
                  >
                    {{ isEditing(item._id) ? $t('編集中') : $t('編集') }}
                  </Button>
                </div>
              </td>
            </tr>
            <tr v-if="isExpanded(item._id)">
              <td colspan="6">
                <div class="stack">
                  <div v-if="item.type === 'ballot'" class="card soft stack ballot-card">
                    <div class="row ballot-card-header">
                      <strong>{{ matchupLabelForDisplay(item) }}</strong>
                      <Button
                        variant="secondary"
                        size="sm"
                        :disabled="editingSaving && isEditing(item._id)"
                        @click="isEditing(item._id) ? cancelEdit() : startEdit(item)"
                      >
                        {{ isEditing(item._id) ? $t('編集中') : $t('編集') }}
                      </Button>
                    </div>

                    <div v-if="isEditing(item._id)" class="grid ballot-meta-grid">
                      <Field :label="$t('ラウンド')" v-slot="{ id, describedBy }">
                        <input
                          :id="id"
                          :aria-describedby="describedBy"
                          type="number"
                          min="1"
                          v-model.number="editingRound"
                        />
                      </Field>
                      <Field
                        v-if="!editingBallotNoSpeakerScore"
                        :label="$t('入力方式')"
                        v-slot="{ id, describedBy }"
                      >
                        <select
                          :id="id"
                          :aria-describedby="describedBy"
                          v-model="editingBallotScoreMode"
                        >
                          <option value="matter_manner">{{ $t('Matter/Manner') }}</option>
                          <option value="total">{{ $t('合計スコア') }}</option>
                        </select>
                      </Field>
                      <Field :label="$t('チーム A')" v-slot="{ id, describedBy }">
                        <select
                          :id="id"
                          :aria-describedby="describedBy"
                          v-model="editingBallotTeamAId"
                          @change="onBallotTeamChanged('A')"
                        >
                          <option value="">{{ $t('未選択') }}</option>
                          <option v-for="option in teamOptions" :key="option.id" :value="option.id">
                            {{ option.name }}
                          </option>
                        </select>
                      </Field>
                      <Field :label="$t('チーム B')" v-slot="{ id, describedBy }">
                        <select
                          :id="id"
                          :aria-describedby="describedBy"
                          v-model="editingBallotTeamBId"
                          @change="onBallotTeamChanged('B')"
                        >
                          <option value="">{{ $t('未選択') }}</option>
                          <option v-for="option in teamOptions" :key="option.id" :value="option.id">
                            {{ option.name }}
                          </option>
                        </select>
                      </Field>
                      <Field :label="$t('勝者')" v-slot="{ id, describedBy }">
                        <select :id="id" :aria-describedby="describedBy" v-model="editingBallotWinnerId">
                          <option value="">{{ $t('未選択') }}</option>
                          <option :value="editingBallotTeamAId">{{ teamName(editingBallotTeamAId) }}</option>
                          <option :value="editingBallotTeamBId">{{ teamName(editingBallotTeamBId) }}</option>
                        </select>
                      </Field>
                      <Field :label="$t('提出者')" v-slot="{ id, describedBy }">
                        <select :id="id" :aria-describedby="describedBy" v-model="editingBallotSubmittedEntityId">
                          <option value="">{{ $t('未選択') }}</option>
                          <optgroup :label="$t('ジャッジ')">
                            <option
                              v-for="option in adjudicatorEntityOptions"
                              :key="`adj-${option.id}`"
                              :value="option.id"
                            >
                              {{ option.name }}
                            </option>
                          </optgroup>
                          <optgroup :label="$t('スピーカー')">
                            <option
                              v-for="option in speakerEntityOptions"
                              :key="`spk-${option.id}`"
                              :value="option.id"
                            >
                              {{ option.name }}
                            </option>
                          </optgroup>
                          <optgroup :label="$t('チーム')">
                            <option
                              v-for="option in teamEntityOptions"
                              :key="`team-${option.id}`"
                              :value="option.id"
                            >
                              {{ option.name }}
                            </option>
                          </optgroup>
                        </select>
                      </Field>
                      <Field :label="$t('コメント')" class="full" v-slot="{ id, describedBy }">
                        <textarea
                          :id="id"
                          :aria-describedby="describedBy"
                          rows="3"
                          v-model="editingBallotComment"
                        />
                      </Field>
                    </div>

                    <p v-if="isEditing(item._id) && editingBallotNoSpeakerScore" class="muted small">
                      {{ $t('このラウンドはスピーカースコアを入力しません。') }}
                    </p>

                    <div v-if="!isEditing(item._id) && speakerRowsFor(item).length === 0" class="muted small">
                      {{ $t('スピーカーが登録されていません') }}
                    </div>
                    <table v-else-if="!isEditing(item._id)" class="speaker-table">
                      <thead>
                        <tr>
                          <th>{{ $t('サイド') }}</th>
                          <th>{{ $t('チーム') }}</th>
                          <th>{{ $t('スピーカー') }}</th>
                          <th>{{ $t('スコア') }}</th>
                          <th>{{ $t('Matter') }}</th>
                          <th>{{ $t('Manner') }}</th>
                          <th>{{ $t('Best') }}</th>
                          <th>{{ $t('POI') }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in speakerRowsFor(item)" :key="row.key">
                          <td>{{ row.side }}</td>
                          <td>{{ row.teamName }}</td>
                          <td>{{ row.speakerName }}</td>
                          <td>{{ row.score }}</td>
                          <td>{{ row.matter }}</td>
                          <td>{{ row.manner }}</td>
                          <td>{{ row.best ? '✓' : '—' }}</td>
                          <td>{{ row.poi ? '✓' : '—' }}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div v-else-if="editingSpeakerRowsFor(item).length === 0" class="muted small">
                      {{ $t('編集対象のスピーカー行がありません。') }}
                    </div>
                    <table v-else class="speaker-table speaker-table-editable">
                      <thead>
                        <tr>
                          <th>{{ $t('サイド') }}</th>
                          <th>{{ $t('チーム') }}</th>
                          <th>{{ $t('スピーカー') }}</th>
                          <th>{{ $t('スコア') }}</th>
                          <th>{{ $t('Matter') }}</th>
                          <th>{{ $t('Manner') }}</th>
                          <th>{{ $t('Best') }}</th>
                          <th>{{ $t('POI') }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in editingSpeakerRowsFor(item)" :key="row.key">
                          <td>{{ row.side }}</td>
                          <td>{{ row.teamName }}</td>
                          <td>
                            <select v-model="row.entry.speakerId">
                              <option value="">{{ $t('スピーカーを選択してください') }}</option>
                              <option
                                v-for="option in speakerOptionsForEditor(row.teamSlot, row.index)"
                                :key="option.id"
                                :value="option.id"
                              >
                                {{ option.name }}
                              </option>
                            </select>
                          </td>
                          <td>
                            <input
                              v-if="!editingBallotNoSpeakerScore && editingBallotScoreMode === 'total'"
                              type="number"
                              step="0.1"
                              v-model="row.entry.score"
                            />
                            <span v-else>{{ row.score }}</span>
                          </td>
                          <td>
                            <input
                              v-if="!editingBallotNoSpeakerScore && editingBallotScoreMode === 'matter_manner'"
                              type="number"
                              step="0.1"
                              v-model="row.entry.matter"
                            />
                            <span v-else>{{ row.matter }}</span>
                          </td>
                          <td>
                            <input
                              v-if="!editingBallotNoSpeakerScore && editingBallotScoreMode === 'matter_manner'"
                              type="number"
                              step="0.1"
                              v-model="row.entry.manner"
                            />
                            <span v-else>{{ row.manner }}</span>
                          </td>
                          <td>
                            <input
                              v-if="!editingBallotNoSpeakerScore"
                              class="flag-input"
                              type="checkbox"
                              v-model="row.entry.best"
                            />
                            <span v-else>{{ row.best ? '✓' : '—' }}</span>
                          </td>
                          <td>
                            <input
                              v-if="!editingBallotNoSpeakerScore"
                              class="flag-input"
                              type="checkbox"
                              v-model="row.entry.poi"
                            />
                            <span v-else>{{ row.poi ? '✓' : '—' }}</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <p v-if="isEditing(item._id) && editError" class="error">{{ editError }}</p>
                    <div v-if="isEditing(item._id)" class="row ballot-action-row">
                      <Button
                        variant="primary"
                        size="sm"
                        :loading="editingSaving"
                        :disabled="editingSaving"
                        @click="saveEdit(item)"
                      >
                        {{ $t('更新を保存') }}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        :disabled="editingSaving"
                        @click="cancelEdit"
                      >
                        {{ $t('編集をキャンセル') }}
                      </Button>
                    </div>
                  </div>

                  <div class="row">
                    <Button variant="ghost" size="sm" @click="togglePayload(item._id)">
                      {{ isPayloadExpanded(item._id) ? $t('JSONを隠す') : $t('JSONを表示') }}
                    </Button>
                  </div>

                  <div v-if="isEditing(item._id) && item.type !== 'ballot'" class="card soft stack submission-editor">
                    <div class="grid">
                      <Field :label="$t('ラウンド')" v-slot="{ id, describedBy }">
                        <input
                          :id="id"
                          :aria-describedby="describedBy"
                          type="number"
                          min="1"
                          v-model.number="editingRound"
                        />
                      </Field>
                    </div>
                    <Field :label="$t('JSON')" v-slot="{ id, describedBy }">
                      <textarea
                        :id="id"
                        :aria-describedby="describedBy"
                        rows="8"
                        v-model="editingPayloadText"
                      />
                    </Field>
                    <p v-if="editError" class="error">{{ editError }}</p>
                    <div class="row">
                      <Button
                        variant="primary"
                        size="sm"
                        :loading="editingSaving"
                        :disabled="editingSaving"
                        @click="saveEdit(item)"
                      >
                        {{ $t('更新を保存') }}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        :disabled="editingSaving"
                        @click="cancelEdit"
                      >
                        {{ $t('編集をキャンセル') }}
                      </Button>
                    </div>
                  </div>

                  <pre v-if="isPayloadExpanded(item._id)" class="payload">{{
                    formatPayload(item.payload)
                  }}</pre>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </Table>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSubmissionsStore } from '@/stores/submissions'
import { useDrawsStore } from '@/stores/draws'
import { useTeamsStore } from '@/stores/teams'
import { useSpeakersStore } from '@/stores/speakers'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { useTournamentStore } from '@/stores/tournament'
import { useStylesStore } from '@/stores/styles'
import { useRoundsStore } from '@/stores/rounds'
import type { Submission } from '@/types/submission'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import Table from '@/components/common/Table.vue'
import { getSideShortLabel } from '@/utils/side-labels'

const route = useRoute()
const submissions = useSubmissionsStore()
const draws = useDrawsStore()
const teams = useTeamsStore()
const speakers = useSpeakersStore()
const adjudicators = useAdjudicatorsStore()
const tournamentStore = useTournamentStore()
const stylesStore = useStylesStore()
const rounds = useRoundsStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const contextRound = computed<number | null>(() => {
  if (String(route.query.context ?? '') !== 'round') return null
  const parsed = Number(route.query.round)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null
})
const isRoundContext = computed(() => contextRound.value !== null)
const typeFilter = ref<'all' | 'ballot' | 'feedback'>('all')
const roundFilter = ref('')
const searchQuery = ref('')
const sectionLoading = ref(true)
const lastRefreshedAt = ref<string>('')
const expandedIds = ref<Set<string>>(new Set())
const payloadExpandedIds = ref<Set<string>>(new Set())
const editingSubmissionId = ref<string | null>(null)
const editingRound = ref(1)
const editingPayloadText = ref('')
const editingSaving = ref(false)
const editError = ref('')
const editingBallotBasePayload = ref<Record<string, unknown>>({})
const editingBallotTeamAId = ref('')
const editingBallotTeamBId = ref('')
const editingBallotWinnerId = ref('')
const editingBallotSubmittedEntityId = ref('')
const editingBallotComment = ref('')
const editingBallotNoSpeakerScore = ref(false)
const editingBallotScoreMode = ref<'matter_manner' | 'total'>('matter_manner')
const editingBallotRowsA = ref<EditableBallotRow[]>([])
const editingBallotRowsB = ref<EditableBallotRow[]>([])
const naturalSortCollator = new Intl.Collator(['ja', 'en'], {
  numeric: true,
  sensitivity: 'base',
})

const isLoading = computed(
  () =>
    submissions.loading ||
    draws.loading ||
    teams.loading ||
    speakers.loading ||
    adjudicators.loading ||
    rounds.loading ||
    tournamentStore.loading ||
    stylesStore.loading
)
const loadError = computed(
  () =>
    submissions.error ||
    draws.error ||
    teams.error ||
    speakers.error ||
    adjudicators.error ||
    rounds.error ||
    tournamentStore.error ||
    stylesStore.error ||
    null
)
const lastRefreshedLabel = computed(() => {
  if (!lastRefreshedAt.value) return ''
  const date = new Date(lastRefreshedAt.value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
})
const sortedRounds = computed(() => rounds.rounds.slice().sort((a, b) => a.round - b.round))

const tournament = computed(() =>
  tournamentStore.tournaments.find((item) => item._id === tournamentId.value)
)
const style = computed(() => stylesStore.styles.find((item) => item.id === tournament.value?.style))
const govLabel = computed(() => getSideShortLabel(style.value, 'gov', t('政府')))
const oppLabel = computed(() => getSideShortLabel(style.value, 'opp', t('反対')))
const contextRoundLabel = computed(() => {
  if (contextRound.value === null) return ''
  const name =
    rounds.rounds.find((item) => Number(item.round) === contextRound.value)?.name ??
    t('ラウンド {round}', { round: contextRound.value })
  return t('{name} の提出データ', { name })
})
const contextRoundPath = computed(() => {
  if (contextRound.value === null) return `/admin/${tournamentId.value}/operations`
  return `/admin/${tournamentId.value}/rounds/${contextRound.value}/allocation`
})

const teamOptions = computed(() => {
  return teams.teams
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
    .map((team) => ({ id: team._id, name: team.name }))
})

const adjudicatorEntityOptions = computed(() => {
  return adjudicators.adjudicators
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
    .map((item) => ({ id: item._id, name: item.name }))
})

const speakerEntityOptions = computed(() => {
  return speakers.speakers
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
    .map((item) => ({ id: item._id, name: item.name }))
})

const teamEntityOptions = computed(() => {
  return teamOptions.value.slice()
})

const items = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const fixedRound = contextRound.value
  const round = Number(roundFilter.value)
  const hasRoundFilter = fixedRound === null && roundFilter.value !== '' && Number.isFinite(round)
  const filtered = submissions.submissions.filter((item) => {
    const matchesType = typeFilter.value === 'all' ? true : item.type === typeFilter.value
    const matchesRound =
      fixedRound !== null
        ? Number(item.round) === fixedRound
        : hasRoundFilter
          ? Number(item.round) === round
          : true
    const submittedByText = submittedBySearchText(item).toLowerCase()
    const matchesSearch = q ? submittedByText.includes(q) : true
    return matchesType && matchesRound && matchesSearch
  })
  return filtered.slice().sort((a, b) => {
    const roundDiff = Number(a.round) - Number(b.round)
    if (roundDiff !== 0) return roundDiff
    const nameA = submittedBySearchText(a)
    const nameB = submittedBySearchText(b)
    const nameCompare = naturalSortCollator.compare(nameA, nameB)
    if (nameCompare !== 0) return nameCompare
    return naturalSortCollator.compare(String(a._id ?? ''), String(b._id ?? ''))
  })
})

const ballotCount = computed(() => items.value.filter((item) => item.type === 'ballot').length)
const feedbackCount = computed(() => items.value.filter((item) => item.type === 'feedback').length)

const drawByRound = computed(() => {
  const map = new Map<number, any>()
  draws.draws.forEach((draw) => {
    map.set(Number(draw.round), draw)
  })
  return map
})

type BallotPayload = {
  teamAId?: string
  teamBId?: string
  winnerId?: string
  speakerIdsA?: unknown
  speakerIdsB?: unknown
  scoresA?: unknown
  scoresB?: unknown
  matterA?: unknown
  mannerA?: unknown
  matterB?: unknown
  mannerB?: unknown
  bestA?: unknown
  bestB?: unknown
  poiA?: unknown
  poiB?: unknown
  submittedEntityId?: string
  comment?: string
}

type SpeakerRow = {
  key: string
  side: string
  teamName: string
  speakerName: string
  score: string
  matter: string
  manner: string
  best: boolean
  poi: boolean
}

type EditableBallotRow = {
  speakerId: string
  score: string
  matter: string
  manner: string
  best: boolean
  poi: boolean
}

type EditableSpeakerRowView = {
  key: string
  side: string
  teamName: string
  teamSlot: 'A' | 'B'
  index: number
  score: string
  matter: string
  manner: string
  best: boolean
  poi: boolean
  entry: EditableBallotRow
}

type SpeakerOption = {
  id: string
  name: string
}

type NumberParseResult = { ok: true; value: number } | { ok: false; message: string }

type SideMapping = {
  govTeamId: string
  oppTeamId: string
  govSlot: 'A' | 'B'
  oppSlot: 'A' | 'B'
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item)).filter(Boolean)
}

function toNumberArray(value: unknown): Array<number | undefined> {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const parsed = Number(item)
    return Number.isFinite(parsed) ? parsed : undefined
  })
}

function toFiniteNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
}

function toBooleanArray(value: unknown): boolean[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => Boolean(item))
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—'
  return String(Math.round(value * 1000) / 1000)
}

function formatNumberForInput(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return ''
  return String(Math.round(value * 1000) / 1000)
}

function parseRequiredNumber(value: string, label: string): NumberParseResult {
  const token = value.trim()
  if (!token) {
    return { ok: false, message: t('{label} を入力してください。', { label }) }
  }
  const parsed = Number(token)
  if (!Number.isFinite(parsed)) {
    return { ok: false, message: t('{label} は数値で入力してください。', { label }) }
  }
  return { ok: true, value: parsed }
}

function teamName(teamId?: string) {
  if (!teamId) return t('未選択')
  return teams.teams.find((team) => team._id === teamId)?.name ?? teamId
}

function entityNameForRound(
  entityId?: string,
  roundNumber?: number,
  options?: { fallbackId?: boolean }
) {
  if (!entityId) return ''
  const token = String(entityId)
  const team = teams.teams.find((item) => item._id === token)
  if (team) return team.name
  const speaker = speakers.speakers.find((item) => item._id === token)
  if (speaker) return speaker.name
  const adjudicator = adjudicators.adjudicators.find((item) => item._id === token)
  if (adjudicator) return adjudicator.name
  if (token.includes(':')) {
    const [teamId, indexRaw] = token.split(':')
    const index = Number(indexRaw)
    if (teamId && Number.isFinite(index) && index >= 0) {
      const speakerNames = teamSpeakerNames(teamId, Number(roundNumber ?? 0))
      if (speakerNames[index]) return speakerNames[index]
    }
  }
  return options?.fallbackId === false ? '' : token
}

function adjudicatorName(adjudicatorId?: string) {
  if (!adjudicatorId) return t('不明')
  return adjudicators.adjudicators.find((item) => item._id === adjudicatorId)?.name ?? adjudicatorId
}

function submittedByLabel(item: Submission) {
  const submittedEntityId = String((item.payload as any)?.submittedEntityId ?? '')
  if (submittedEntityId) {
    return entityNameForRound(submittedEntityId, item.round)
  }
  if (item.submittedBy) {
    return entityNameForRound(item.submittedBy, item.round)
  }
  return t('不明')
}

function submittedBySearchText(item: Submission) {
  const submittedEntityId = String((item.payload as any)?.submittedEntityId ?? '')
  if (submittedEntityId) {
    return entityNameForRound(submittedEntityId, item.round, { fallbackId: false })
  }
  if (item.submittedBy) {
    return entityNameForRound(item.submittedBy, item.round, { fallbackId: false })
  }
  return ''
}

function teamSpeakerNames(teamId: string, round: number): string[] {
  const team = teams.teams.find((item) => item._id === teamId)
  if (!team) return []
  const detail = team.details?.find((item: any) => Number(item.r) === Number(round))
  const detailSpeakerIds = (detail?.speakers ?? []).map((id: any) => String(id)).filter(Boolean)
  if (detailSpeakerIds.length > 0) {
    return detailSpeakerIds.map((id: string) => {
      return speakers.speakers.find((speaker) => speaker._id === id)?.name ?? id
    })
  }
  return (team.speakers ?? []).map((speaker: any) => String(speaker?.name ?? '')).filter(Boolean)
}

function speakerName(
  teamId: string,
  speakerId: string | undefined,
  round: number,
  order: number
): string {
  const fallback = teamSpeakerNames(teamId, round)
  if (!speakerId) return fallback[order] ?? t('スピーカー {index}', { index: order + 1 })
  const direct = speakers.speakers.find((speaker) => speaker._id === speakerId)
  if (direct) return direct.name
  if (speakerId.includes(':')) {
    const [speakerTeamId, indexRaw] = speakerId.split(':')
    if (speakerTeamId === teamId) {
      const index = Number(indexRaw)
      if (Number.isFinite(index) && fallback[index]) return fallback[index]
    }
  }
  return speakerId
}

function speakerOptionsForTeam(teamId: string, round: number, minimumCount = 0): SpeakerOption[] {
  const team = teams.teams.find((item) => item._id === teamId)
  if (!team) return []

  const seen = new Set<string>()
  const options: SpeakerOption[] = []
  const detail = team.details?.find((item: any) => Number(item.r) === Number(round))
  const detailSpeakerIds = (detail?.speakers ?? []).map((id: any) => String(id)).filter(Boolean)

  if (detailSpeakerIds.length > 0) {
    detailSpeakerIds.forEach((speakerId) => {
      if (seen.has(speakerId)) return
      seen.add(speakerId)
      const name = speakers.speakers.find((speaker) => speaker._id === speakerId)?.name ?? speakerId
      options.push({ id: speakerId, name })
    })
  }

  const fallbackNames = teamSpeakerNames(teamId, round)
  if (options.length === 0) {
    fallbackNames.forEach((name, index) => {
      const fallbackId = `${teamId}:${index}`
      if (seen.has(fallbackId)) return
      seen.add(fallbackId)
      options.push({ id: fallbackId, name: name || t('スピーカー {index}', { index: index + 1 }) })
    })
  }

  const targetLength = Math.max(minimumCount, fallbackNames.length, options.length)
  for (let index = 0; index < targetLength; index += 1) {
    const fallbackId = `${teamId}:${index}`
    if (seen.has(fallbackId)) continue
    seen.add(fallbackId)
    const name = fallbackNames[index] || t('スピーカー {index}', { index: index + 1 })
    options.push({ id: fallbackId, name })
  }

  return options
}

function speakerOptionsForEditor(teamSlot: 'A' | 'B', rowIndex: number): SpeakerOption[] {
  const teamId =
    teamSlot === 'A' ? editingBallotTeamAId.value.trim() : editingBallotTeamBId.value.trim()
  if (!teamId) return []

  const rows = teamSlot === 'A' ? editingBallotRowsA.value : editingBallotRowsB.value
  const options = speakerOptionsForTeam(teamId, editingRound.value, Math.max(rows.length, rowIndex + 1)).slice()
  const currentSpeakerId = String(rows[rowIndex]?.speakerId ?? '').trim()
  if (currentSpeakerId && !options.some((option) => option.id === currentSpeakerId)) {
    options.unshift({
      id: currentSpeakerId,
      name: speakerName(teamId, currentSpeakerId, editingRound.value, rowIndex),
    })
  }
  return options
}

function drawRow(round: number, teamAId: string, teamBId: string) {
  const draw = drawByRound.value.get(Number(round))
  if (!draw?.allocation || !Array.isArray(draw.allocation)) return null
  return draw.allocation.find((row: any) => {
    const gov = String(row?.teams?.gov ?? row?.teams?.[0] ?? '')
    const opp = String(row?.teams?.opp ?? row?.teams?.[1] ?? '')
    return (gov === teamAId && opp === teamBId) || (gov === teamBId && opp === teamAId)
  })
}

function rowGovTeamId(row: any) {
  return String(row?.teams?.gov ?? row?.teams?.[0] ?? '')
}

function rowOppTeamId(row: any) {
  return String(row?.teams?.opp ?? row?.teams?.[1] ?? '')
}

function resolveBallotSides(round: number, teamAId: string, teamBId: string): SideMapping {
  const row = drawRow(round, teamAId, teamBId)
  const govTeamId = row ? rowGovTeamId(row) : teamAId
  const oppTeamId = row ? rowOppTeamId(row) : teamBId
  const govSlot: 'A' | 'B' = govTeamId === teamBId ? 'B' : 'A'
  const oppSlot: 'A' | 'B' = oppTeamId === teamAId ? 'A' : 'B'
  return { govTeamId, oppTeamId, govSlot, oppSlot }
}

function matchupLabelFromTeams(round: number, teamAId: string, teamBId: string) {
  const mapping = resolveBallotSides(round, teamAId, teamBId)
  return `${teamName(mapping.govTeamId)} ${t('vs')} ${teamName(mapping.oppTeamId)}`
}

function matchupLabel(item: Submission) {
  if (item.type !== 'ballot') return t('スコアシート')
  const payload = (item.payload ?? {}) as BallotPayload
  return matchupLabelFromTeams(item.round, String(payload.teamAId ?? ''), String(payload.teamBId ?? ''))
}

function matchupLabelForDisplay(item: Submission) {
  if (item.type !== 'ballot') return matchupLabel(item)
  if (!isEditing(item._id)) return matchupLabel(item)
  return matchupLabelFromTeams(
    editingRound.value,
    editingBallotTeamAId.value.trim(),
    editingBallotTeamBId.value.trim()
  )
}

function submissionSummary(item: Submission) {
  if (item.type === 'ballot') return matchupLabel(item)
  const adjudicatorId = String((item.payload as any)?.adjudicatorId ?? '')
  const score = Number((item.payload as any)?.score)
  const hasScore = Number.isFinite(score)
  if (!adjudicatorId && !hasScore) return t('フィードバック')
  const parts = []
  if (adjudicatorId) parts.push(`${t('ジャッジ')}: ${adjudicatorName(adjudicatorId)}`)
  if (hasScore) parts.push(`${t('スコア')}: ${score}`)
  return parts.join(' / ')
}

function speakerRowsFor(item: Submission): SpeakerRow[] {
  if (item.type !== 'ballot') return []
  const payload = (item.payload ?? {}) as BallotPayload
  const teamAId = String(payload.teamAId ?? '')
  const teamBId = String(payload.teamBId ?? '')
  if (!teamAId || !teamBId) return []

  const mapping = resolveBallotSides(item.round, teamAId, teamBId)

  const speakerIdsA = toStringArray(payload.speakerIdsA)
  const speakerIdsB = toStringArray(payload.speakerIdsB)
  const scoresA = toNumberArray(payload.scoresA)
  const scoresB = toNumberArray(payload.scoresB)
  const matterA = toNumberArray(payload.matterA)
  const matterB = toNumberArray(payload.matterB)
  const mannerA = toNumberArray(payload.mannerA)
  const mannerB = toNumberArray(payload.mannerB)
  const bestA = toBooleanArray(payload.bestA)
  const bestB = toBooleanArray(payload.bestB)
  const poiA = toBooleanArray(payload.poiA)
  const poiB = toBooleanArray(payload.poiB)

  const toRows = (
    side: 'gov' | 'opp',
    teamId: string,
    speakerIds: string[],
    scores: Array<number | undefined>,
    matter: Array<number | undefined>,
    manner: Array<number | undefined>,
    best: boolean[],
    poi: boolean[]
  ) => {
    const fallbackNames = teamSpeakerNames(teamId, item.round)
    const length = Math.max(
      speakerIds.length,
      scores.length,
      matter.length,
      manner.length,
      best.length,
      poi.length,
      fallbackNames.length
    )
    return Array.from({ length }, (_, index) => ({
      key: `${item._id}-${side}-${index}`,
      side: `${side === 'gov' ? govLabel.value : oppLabel.value} ${index + 1}`,
      teamName: teamName(teamId),
      speakerName: speakerName(teamId, speakerIds[index], item.round, index),
      score: formatNumber(scores[index]),
      matter: formatNumber(matter[index]),
      manner: formatNumber(manner[index]),
      best: Boolean(best[index]),
      poi: Boolean(poi[index]),
    }))
  }

  const govIsA = mapping.govSlot === 'A'

  return [
    ...toRows(
      'gov',
      mapping.govTeamId,
      govIsA ? speakerIdsA : speakerIdsB,
      govIsA ? scoresA : scoresB,
      govIsA ? matterA : matterB,
      govIsA ? mannerA : mannerB,
      govIsA ? bestA : bestB,
      govIsA ? poiA : poiB
    ),
    ...toRows(
      'opp',
      mapping.oppTeamId,
      govIsA ? speakerIdsB : speakerIdsA,
      govIsA ? scoresB : scoresA,
      govIsA ? matterB : matterA,
      govIsA ? mannerB : mannerA,
      govIsA ? bestB : bestA,
      govIsA ? poiB : poiA
    ),
  ]
}

function derivedScoreFromEntry(entry: EditableBallotRow): string {
  const matter = Number(entry.matter)
  const manner = Number(entry.manner)
  if (!Number.isFinite(matter) || !Number.isFinite(manner)) return '—'
  return formatNumber(matter + manner)
}

function editingSpeakerRowsFor(item: Submission): EditableSpeakerRowView[] {
  if (item.type !== 'ballot' || !isEditing(item._id)) return []

  const teamAId = editingBallotTeamAId.value.trim()
  const teamBId = editingBallotTeamBId.value.trim()
  if (!teamAId || !teamBId) return []

  const mapping = resolveBallotSides(editingRound.value, teamAId, teamBId)
  const rowsGov = mapping.govSlot === 'A' ? editingBallotRowsA.value : editingBallotRowsB.value
  const rowsOpp = mapping.govSlot === 'A' ? editingBallotRowsB.value : editingBallotRowsA.value

  const toRows = (
    side: 'gov' | 'opp',
    teamSlot: 'A' | 'B',
    teamId: string,
    rows: EditableBallotRow[]
  ) => {
    return rows.map((entry, index) => ({
      key: `${item._id}-${side}-${index}`,
      side: `${side === 'gov' ? govLabel.value : oppLabel.value} ${index + 1}`,
      teamName: teamName(teamId),
      teamSlot,
      index,
      score:
        editingBallotNoSpeakerScore.value
          ? '—'
          : editingBallotScoreMode.value === 'matter_manner'
            ? derivedScoreFromEntry(entry)
            : entry.score.trim() || '—',
      matter:
        editingBallotNoSpeakerScore.value
          ? '—'
          : editingBallotScoreMode.value === 'matter_manner'
            ? entry.matter.trim() || '—'
            : '—',
      manner:
        editingBallotNoSpeakerScore.value
          ? '—'
          : editingBallotScoreMode.value === 'matter_manner'
            ? entry.manner.trim() || '—'
            : '—',
      best: Boolean(entry.best),
      poi: Boolean(entry.poi),
      entry,
    }))
  }

  return [
    ...toRows('gov', mapping.govSlot, mapping.govTeamId, rowsGov),
    ...toRows('opp', mapping.oppSlot, mapping.oppTeamId, rowsOpp),
  ]
}

function formatPayload(payload: Record<string, unknown>) {
  return JSON.stringify(payload, null, 2)
}

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function typeLabel(value: string) {
  if (value === 'ballot') return t('スコアシート')
  if (value === 'feedback') return t('フィードバック')
  return value
}

function toggleExpand(id: string) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

function isExpanded(id: string) {
  return expandedIds.value.has(id)
}

function togglePayload(id: string) {
  const next = new Set(payloadExpandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  payloadExpandedIds.value = next
}

function isPayloadExpanded(id: string) {
  return payloadExpandedIds.value.has(id)
}

function isEditing(id: string) {
  return editingSubmissionId.value === id
}

function resetBallotEditor() {
  editingBallotBasePayload.value = {}
  editingBallotTeamAId.value = ''
  editingBallotTeamBId.value = ''
  editingBallotWinnerId.value = ''
  editingBallotSubmittedEntityId.value = ''
  editingBallotComment.value = ''
  editingBallotNoSpeakerScore.value = false
  editingBallotScoreMode.value = 'matter_manner'
  editingBallotRowsA.value = []
  editingBallotRowsB.value = []
}

function roundScoreSettings(roundNumber: number) {
  const found = rounds.rounds.find((item) => Number(item.round) === Number(roundNumber))
  return {
    noSpeakerScore: found?.userDefinedData?.no_speaker_score === true,
    scoreByMatterManner: found?.userDefinedData?.score_by_matter_manner !== false,
  }
}

function buildEditableRows(options: {
  teamId: string
  round: number
  speakerIds: string[]
  scores: number[]
  matter: number[]
  manner: number[]
  best: boolean[]
  poi: boolean[]
  noSpeakerScore: boolean
}) {
  if (options.noSpeakerScore) return []
  const speakerOptionLength = speakerOptionsForTeam(options.teamId, options.round).length
  const payloadRowLength = Math.max(
    options.speakerIds.length,
    options.scores.length,
    options.matter.length,
    options.manner.length,
    options.best.length,
    options.poi.length
  )
  const rowLength = payloadRowLength > 0 ? payloadRowLength : speakerOptionLength
  return Array.from({ length: rowLength }, (_, index) => ({
    speakerId: String(options.speakerIds[index] ?? ''),
    score: formatNumberForInput(options.scores[index]),
    matter: formatNumberForInput(options.matter[index]),
    manner: formatNumberForInput(options.manner[index]),
    best: Boolean(options.best[index]),
    poi: Boolean(options.poi[index]),
  }))
}

function hydrateBallotEditor(payload: Record<string, unknown>) {
  editingBallotBasePayload.value = { ...payload }
  editingBallotTeamAId.value = String(payload.teamAId ?? '')
  editingBallotTeamBId.value = String(payload.teamBId ?? '')
  editingBallotWinnerId.value = String(payload.winnerId ?? '')
  editingBallotSubmittedEntityId.value = String(payload.submittedEntityId ?? '')
  editingBallotComment.value = typeof payload.comment === 'string' ? payload.comment : ''

  const settings = roundScoreSettings(editingRound.value)
  editingBallotNoSpeakerScore.value = settings.noSpeakerScore

  const scoresA = toFiniteNumberList(payload.scoresA)
  const scoresB = toFiniteNumberList(payload.scoresB)
  let matterA = toFiniteNumberList(payload.matterA)
  let mannerA = toFiniteNumberList(payload.mannerA)
  let matterB = toFiniteNumberList(payload.matterB)
  let mannerB = toFiniteNumberList(payload.mannerB)

  const hasMatterManner =
    Array.isArray(payload.matterA) ||
    Array.isArray(payload.mannerA) ||
    Array.isArray(payload.matterB) ||
    Array.isArray(payload.mannerB)

  editingBallotScoreMode.value =
    hasMatterManner || settings.scoreByMatterManner ? 'matter_manner' : 'total'

  if (editingBallotScoreMode.value === 'matter_manner') {
    if (matterA.length === 0 && scoresA.length > 0) {
      matterA = scoresA.slice()
      mannerA = Array.from({ length: scoresA.length }, () => 0)
    }
    if (matterB.length === 0 && scoresB.length > 0) {
      matterB = scoresB.slice()
      mannerB = Array.from({ length: scoresB.length }, () => 0)
    }
  }

  editingBallotRowsA.value = buildEditableRows({
    teamId: editingBallotTeamAId.value,
    round: editingRound.value,
    speakerIds: toStringArray(payload.speakerIdsA),
    scores: scoresA,
    matter: matterA,
    manner: mannerA,
    best: toBooleanArray(payload.bestA),
    poi: toBooleanArray(payload.poiA),
    noSpeakerScore: settings.noSpeakerScore,
  })

  editingBallotRowsB.value = buildEditableRows({
    teamId: editingBallotTeamBId.value,
    round: editingRound.value,
    speakerIds: toStringArray(payload.speakerIdsB),
    scores: scoresB,
    matter: matterB,
    manner: mannerB,
    best: toBooleanArray(payload.bestB),
    poi: toBooleanArray(payload.poiB),
    noSpeakerScore: settings.noSpeakerScore,
  })
}

function onBallotTeamChanged(teamSlot: 'A' | 'B') {
  const targetRows = teamSlot === 'A' ? editingBallotRowsA.value : editingBallotRowsB.value
  targetRows.forEach((row) => {
    row.speakerId = ''
  })
  const winner = editingBallotWinnerId.value.trim()
  if (winner && winner !== editingBallotTeamAId.value && winner !== editingBallotTeamBId.value) {
    editingBallotWinnerId.value = ''
  }
}

function buildBallotPayloadFromTable(): Record<string, unknown> | null {
  const fail = (message: string) => {
    editError.value = message
    return null
  }

  const teamAId = editingBallotTeamAId.value.trim()
  const teamBId = editingBallotTeamBId.value.trim()
  if (!teamAId || !teamBId || teamAId === teamBId) {
    return fail(t('チームを確認してください。'))
  }

  const winner = editingBallotWinnerId.value.trim()
  if (winner && winner !== teamAId && winner !== teamBId) {
    return fail(t('勝者はチームA/チームBのいずれかを指定してください。'))
  }

  const payload: Record<string, unknown> = {
    ...editingBallotBasePayload.value,
    teamAId,
    teamBId,
    comment: editingBallotComment.value,
  }

  if (winner) payload.winnerId = winner
  else delete payload.winnerId

  const submittedEntityId = editingBallotSubmittedEntityId.value.trim()
  if (submittedEntityId) payload.submittedEntityId = submittedEntityId
  else delete payload.submittedEntityId

  if (editingBallotNoSpeakerScore.value) {
    payload.scoresA = []
    payload.scoresB = []
    payload.speakerIdsA = []
    payload.speakerIdsB = []
    payload.bestA = []
    payload.bestB = []
    payload.poiA = []
    payload.poiB = []
    delete payload.matterA
    delete payload.mannerA
    delete payload.matterB
    delete payload.mannerB
    return payload
  }

  const parseSideRows = (sideRows: EditableBallotRow[], sideLabel: string) => {
    const speakerIds: string[] = []
    const scores: number[] = []
    const matter: number[] = []
    const manner: number[] = []
    const best: boolean[] = []
    const poi: boolean[] = []

    for (let index = 0; index < sideRows.length; index += 1) {
      const row = sideRows[index]
      const speakerId = row.speakerId.trim()
      if (!speakerId) {
        return { ok: false, message: t('{label} のスピーカーを選択してください。', { label: `${sideLabel} ${index + 1}` }) }
      }
      speakerIds.push(speakerId)
      best.push(Boolean(row.best))
      poi.push(Boolean(row.poi))

      if (editingBallotScoreMode.value === 'matter_manner') {
        const matterResult = parseRequiredNumber(row.matter, `${sideLabel} ${index + 1} Matter`)
        if (!matterResult.ok) return matterResult
        const mannerResult = parseRequiredNumber(row.manner, `${sideLabel} ${index + 1} Manner`)
        if (!mannerResult.ok) return mannerResult
        matter.push(matterResult.value)
        manner.push(mannerResult.value)
        scores.push(matterResult.value + mannerResult.value)
      } else {
        const scoreResult = parseRequiredNumber(row.score, `${sideLabel} ${index + 1} ${t('スコア')}`)
        if (!scoreResult.ok) return scoreResult
        scores.push(scoreResult.value)
      }
    }

    return { ok: true as const, speakerIds, scores, matter, manner, best, poi }
  }

  const sideA = parseSideRows(editingBallotRowsA.value, t('チーム A'))
  if (!sideA.ok) return fail(sideA.message)
  const sideB = parseSideRows(editingBallotRowsB.value, t('チーム B'))
  if (!sideB.ok) return fail(sideB.message)

  payload.speakerIdsA = sideA.speakerIds
  payload.speakerIdsB = sideB.speakerIds
  payload.scoresA = sideA.scores
  payload.scoresB = sideB.scores
  payload.bestA = sideA.best
  payload.bestB = sideB.best
  payload.poiA = sideA.poi
  payload.poiB = sideB.poi

  if (editingBallotScoreMode.value === 'matter_manner') {
    payload.matterA = sideA.matter
    payload.mannerA = sideA.manner
    payload.matterB = sideB.matter
    payload.mannerB = sideB.manner
  } else {
    delete payload.matterA
    delete payload.mannerA
    delete payload.matterB
    delete payload.mannerB
  }

  return payload
}

function startEdit(item: Submission) {
  const id = String(item._id ?? '')
  if (!id) return
  editingSubmissionId.value = id
  editingRound.value = Number(item.round) || 1
  editingPayloadText.value = formatPayload(item.payload ?? {})

  if (item.type === 'ballot') {
    hydrateBallotEditor((item.payload ?? {}) as Record<string, unknown>)
  } else {
    resetBallotEditor()
  }

  editError.value = ''
  const next = new Set(expandedIds.value)
  next.add(id)
  expandedIds.value = next
}

function cancelEdit() {
  editingSubmissionId.value = null
  editingPayloadText.value = ''
  editingRound.value = 1
  editingSaving.value = false
  resetBallotEditor()
  editError.value = ''
}

async function saveEdit(item: Submission) {
  if (!isEditing(item._id)) return
  if (!Number.isFinite(editingRound.value) || editingRound.value < 1) {
    editError.value = t('ラウンドは1以上で入力してください。')
    return
  }

  let parsed: Record<string, unknown>
  if (item.type === 'ballot') {
    const payload = buildBallotPayloadFromTable()
    if (!payload) return
    parsed = payload
    editingPayloadText.value = formatPayload(payload)
  } else {
    try {
      const payload = JSON.parse(editingPayloadText.value)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        editError.value = t('JSONはオブジェクト形式で入力してください。')
        return
      }
      parsed = payload as Record<string, unknown>
    } catch {
      editError.value = t('JSONの形式が正しくありません。')
      return
    }
  }

  editError.value = ''
  editingSaving.value = true
  try {
    const updated = await submissions.updateSubmission({
      tournamentId: tournamentId.value,
      submissionId: String(item._id ?? ''),
      round: Math.floor(editingRound.value),
      payload: parsed,
    })
    if (!updated) {
      editError.value = submissions.error ?? t('提出データの更新に失敗しました。')
      return
    }
    cancelEdit()
  } finally {
    editingSaving.value = false
  }
}

async function refresh() {
  if (!tournamentId.value) return
  sectionLoading.value = true
  try {
    await Promise.all([
      submissions.fetchSubmissions({ tournamentId: tournamentId.value }),
      rounds.fetchRounds(tournamentId.value),
      draws.fetchDraws(tournamentId.value),
      teams.fetchTeams(tournamentId.value),
      speakers.fetchSpeakers(tournamentId.value),
      adjudicators.fetchAdjudicators(tournamentId.value),
      tournamentStore.fetchTournaments(),
      stylesStore.fetchStyles(),
    ])
    lastRefreshedAt.value = new Date().toISOString()
  } finally {
    sectionLoading.value = false
  }
}

watch(editingRound, () => {
  if (!editingSubmissionId.value) return
  const editingItem = submissions.submissions.find(
    (item) => String(item._id ?? '') === editingSubmissionId.value
  )
  if (!editingItem || editingItem.type !== 'ballot') return

  const previousNoSpeaker = editingBallotNoSpeakerScore.value
  const settings = roundScoreSettings(editingRound.value)
  editingBallotNoSpeakerScore.value = settings.noSpeakerScore

  if (settings.noSpeakerScore) return

  if (previousNoSpeaker) {
    editingBallotScoreMode.value = settings.scoreByMatterManner ? 'matter_manner' : 'total'
    if (editingBallotRowsA.value.length === 0) {
      editingBallotRowsA.value = buildEditableRows({
        teamId: editingBallotTeamAId.value,
        round: editingRound.value,
        speakerIds: [],
        scores: [],
        matter: [],
        manner: [],
        best: [],
        poi: [],
        noSpeakerScore: false,
      })
    }
    if (editingBallotRowsB.value.length === 0) {
      editingBallotRowsB.value = buildEditableRows({
        teamId: editingBallotTeamBId.value,
        round: editingRound.value,
        speakerIds: [],
        scores: [],
        matter: [],
        manner: [],
        best: [],
        poi: [],
        noSpeakerScore: false,
      })
    }
  }
})

watch(
  [() => route.query.round, () => route.query.context],
  ([value, context]) => {
    if (String(context ?? '') === 'round') {
      roundFilter.value = ''
      return
    }
    if (typeof value !== 'string') {
      roundFilter.value = ''
      return
    }
    roundFilter.value = value
  },
  { immediate: true }
)

watch(
  tournamentId,
  () => {
    refresh()
  },
  { immediate: true }
)
</script>

<style scoped>
.grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.stats-grid {
  display: grid;
  gap: var(--space-2);
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.stat-card {
  gap: 4px;
}

.filter-bar {
  position: sticky;
  top: var(--space-4);
  z-index: 3;
}

.ballot-card {
  gap: var(--space-3);
}

.ballot-card-header {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.ballot-meta-grid {
  align-items: start;
}

.ballot-meta-grid .full {
  grid-column: 1 / -1;
}

.ballot-action-row {
  gap: var(--space-2);
}

.speaker-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.speaker-table th,
.speaker-table td {
  border: 1px solid var(--color-border);
  padding: 6px 8px;
  text-align: left;
}

.speaker-table select,
.speaker-table input[type='number'] {
  width: 100%;
  min-width: 90px;
}

.speaker-table .flag-input {
  width: auto;
  min-width: 0;
}

.payload {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-muted);
}

.error {
  color: var(--color-danger);
}

.section-header {
  align-items: center;
}

.header-reload {
  margin-left: 0;
}

.row-actions {
  gap: var(--space-2);
}

.section-header-actions {
  margin-left: auto;
  align-items: center;
  gap: var(--space-2);
}

.context-link {
  color: var(--color-primary);
  text-decoration: none;
  font-size: 0.85rem;
}

.context-link:hover {
  text-decoration: underline;
}

.tight {
  gap: 4px;
}

.submission-editor textarea,
.ballot-meta-grid textarea {
  resize: vertical;
  min-height: 100px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace);
}
</style>
