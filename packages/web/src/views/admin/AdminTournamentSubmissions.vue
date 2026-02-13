<template>
  <section class="stack">
    <div class="row section-header">
      <h3>{{ $t('提出データ') }}</h3>
      <ReloadButton
        class="header-reload"
        @click="refresh"
        :disabled="isLoading"
        :loading="isLoading"
      />
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
          <Field :label="$t('ラウンド')" v-slot="{ id, describedBy }">
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
                  <Button variant="secondary" size="sm" @click="startEdit(item)">
                    {{ isEditing(item._id) ? $t('編集中') : $t('編集') }}
                  </Button>
                </div>
              </td>
            </tr>
            <tr v-if="isExpanded(item._id)">
              <td colspan="6">
                <div class="stack">
                  <div v-if="item.type === 'ballot'" class="card soft stack">
                    <strong>{{ matchupLabel(item) }}</strong>
                    <div v-if="speakerRowsFor(item).length === 0" class="muted small">
                      {{ $t('スピーカーが登録されていません') }}
                    </div>
                    <table v-else class="speaker-table">
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
                  </div>
                  <div class="row">
                    <Button variant="ghost" size="sm" @click="togglePayload(item._id)">
                      {{ isPayloadExpanded(item._id) ? $t('JSONを隠す') : $t('JSONを表示') }}
                    </Button>
                  </div>
                  <div v-if="isEditing(item._id)" class="card soft stack submission-editor">
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
                    <div v-if="item.type === 'ballot'" class="mode-card stack">
                      <span class="muted small">{{ $t('編集モード') }}</span>
                      <div class="mode-switch">
                        <button
                          type="button"
                          class="mode-button"
                          :class="{ active: editingBallotMode === 'form' }"
                          @click="setBallotEditMode('form')"
                        >
                          {{ $t('フォーム') }}
                        </button>
                        <button
                          type="button"
                          class="mode-button"
                          :class="{ active: editingBallotMode === 'json' }"
                          @click="setBallotEditMode('json')"
                        >
                          {{ $t('JSON') }}
                        </button>
                      </div>
                    </div>
                    <div
                      v-if="item.type === 'ballot' && editingBallotMode === 'form'"
                      class="grid ballot-edit-grid"
                    >
                      <Field :label="$t('チーム A')" v-slot="{ id, describedBy }">
                        <input :id="id" :aria-describedby="describedBy" v-model="editingBallotTeamAId" />
                      </Field>
                      <Field :label="$t('チーム B')" v-slot="{ id, describedBy }">
                        <input :id="id" :aria-describedby="describedBy" v-model="editingBallotTeamBId" />
                      </Field>
                      <Field :label="$t('勝者')" v-slot="{ id, describedBy }">
                        <select :id="id" :aria-describedby="describedBy" v-model="editingBallotWinnerId">
                          <option value="">{{ $t('未選択') }}</option>
                          <option :value="editingBallotTeamAId">{{ teamName(editingBallotTeamAId) }}</option>
                          <option :value="editingBallotTeamBId">{{ teamName(editingBallotTeamBId) }}</option>
                        </select>
                      </Field>
                      <Field :label="$t('提出者ID')" v-slot="{ id, describedBy }">
                        <input
                          :id="id"
                          :aria-describedby="describedBy"
                          v-model="editingBallotSubmittedEntityId"
                        />
                      </Field>
                      <Field :label="$t('コメント')" class="full" v-slot="{ id, describedBy }">
                        <textarea
                          :id="id"
                          :aria-describedby="describedBy"
                          rows="3"
                          v-model="editingBallotComment"
                        />
                      </Field>
                      <Field v-if="!editingBallotNoSpeakerScore" :label="$t('入力方式')" v-slot="{ id, describedBy }">
                        <select
                          :id="id"
                          :aria-describedby="describedBy"
                          v-model="editingBallotScoreMode"
                        >
                          <option value="matter_manner">{{ $t('Matter/Manner') }}</option>
                          <option value="total">{{ $t('合計スコア') }}</option>
                        </select>
                      </Field>
                      <template v-if="editingBallotNoSpeakerScore">
                        <p class="muted small full">
                          {{ $t('このラウンドはスピーカースコアを入力しません。') }}
                        </p>
                      </template>
                      <template v-else-if="editingBallotScoreMode === 'matter_manner'">
                        <Field :label="$t('チーム A Matter')" v-slot="{ id, describedBy }">
                          <input :id="id" :aria-describedby="describedBy" v-model="editingBallotMatterAText" />
                        </Field>
                        <Field :label="$t('チーム A Manner')" v-slot="{ id, describedBy }">
                          <input :id="id" :aria-describedby="describedBy" v-model="editingBallotMannerAText" />
                        </Field>
                        <Field :label="$t('チーム B Matter')" v-slot="{ id, describedBy }">
                          <input :id="id" :aria-describedby="describedBy" v-model="editingBallotMatterBText" />
                        </Field>
                        <Field :label="$t('チーム B Manner')" v-slot="{ id, describedBy }">
                          <input :id="id" :aria-describedby="describedBy" v-model="editingBallotMannerBText" />
                        </Field>
                        <p class="muted tiny full">
                          {{ $t('数値はカンマ区切りで入力してください。例: 75, 74, 73') }}
                        </p>
                      </template>
                      <template v-else>
                        <Field :label="$t('チーム A スコア')" v-slot="{ id, describedBy }">
                          <input :id="id" :aria-describedby="describedBy" v-model="editingBallotScoresAText" />
                        </Field>
                        <Field :label="$t('チーム B スコア')" v-slot="{ id, describedBy }">
                          <input :id="id" :aria-describedby="describedBy" v-model="editingBallotScoresBText" />
                        </Field>
                        <p class="muted tiny full">
                          {{ $t('数値はカンマ区切りで入力してください。例: 75, 74, 73') }}
                        </p>
                      </template>
                    </div>
                    <Field
                      v-if="item.type !== 'ballot' || editingBallotMode === 'json'"
                      :label="$t('JSON')"
                      v-slot="{ id, describedBy }"
                    >
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
import ReloadButton from '@/components/common/ReloadButton.vue'
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
const typeFilter = ref<'all' | 'ballot' | 'feedback'>('all')
const roundFilter = ref('')
const searchQuery = ref('')
const sectionLoading = ref(true)
const expandedIds = ref<Set<string>>(new Set())
const payloadExpandedIds = ref<Set<string>>(new Set())
const editingSubmissionId = ref<string | null>(null)
const editingRound = ref(1)
const editingPayloadText = ref('')
const editingSaving = ref(false)
const editError = ref('')
const editingBallotMode = ref<'form' | 'json'>('form')
const editingBallotBasePayload = ref<Record<string, unknown>>({})
const editingBallotTeamAId = ref('')
const editingBallotTeamBId = ref('')
const editingBallotWinnerId = ref('')
const editingBallotSubmittedEntityId = ref('')
const editingBallotComment = ref('')
const editingBallotNoSpeakerScore = ref(false)
const editingBallotScoreMode = ref<'matter_manner' | 'total'>('matter_manner')
const editingBallotScoresAText = ref('')
const editingBallotScoresBText = ref('')
const editingBallotMatterAText = ref('')
const editingBallotMannerAText = ref('')
const editingBallotMatterBText = ref('')
const editingBallotMannerBText = ref('')
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
const sortedRounds = computed(() => rounds.rounds.slice().sort((a, b) => a.round - b.round))

const tournament = computed(() =>
  tournamentStore.tournaments.find((item) => item._id === tournamentId.value)
)
const style = computed(() => stylesStore.styles.find((item) => item.id === tournament.value?.style))
const govLabel = computed(() => getSideShortLabel(style.value, 'gov', t('政府')))
const oppLabel = computed(() => getSideShortLabel(style.value, 'opp', t('反対')))

const items = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const round = Number(roundFilter.value)
  const hasRoundFilter = roundFilter.value !== '' && Number.isFinite(round)
  const filtered = submissions.submissions.filter((item) => {
    const matchesType = typeFilter.value === 'all' ? true : item.type === typeFilter.value
    const matchesRound = hasRoundFilter ? Number(item.round) === round : true
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

function toBooleanArray(value: unknown): boolean[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => Boolean(item))
}

function toFiniteNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
}

function formatNumberListText(values: number[]) {
  return values.join(', ')
}

type NumberListParseResult = { ok: true; value: number[] } | { ok: false; message: string }

function parseNumberListText(value: string, label: string): NumberListParseResult {
  const normalized = value
    .replace(/\r?\n/g, ',')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const parsed: number[] = []
  for (const token of normalized) {
    const numeric = Number(token)
    if (!Number.isFinite(numeric)) {
      return { ok: false, message: t('{label} に数値以外が含まれています。', { label }) }
    }
    parsed.push(numeric)
  }
  return { ok: true, value: parsed }
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—'
  return String(Math.round(value * 1000) / 1000)
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

function matchupLabel(item: Submission) {
  if (item.type !== 'ballot') return t('スコアシート')
  const payload = (item.payload ?? {}) as BallotPayload
  const teamAId = String(payload.teamAId ?? '')
  const teamBId = String(payload.teamBId ?? '')
  const row = drawRow(item.round, teamAId, teamBId)
  const govId = row ? rowGovTeamId(row) : teamAId
  const oppId = row ? rowOppTeamId(row) : teamBId
  return `${teamName(govId)} ${t('vs')} ${teamName(oppId)}`
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
  const row = drawRow(item.round, teamAId, teamBId)
  const govId = row ? rowGovTeamId(row) : teamAId
  const oppId = row ? rowOppTeamId(row) : teamBId
  const govFromA = teamAId === govId

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

  const govSpeakerIds = govFromA ? speakerIdsA : speakerIdsB
  const oppSpeakerIds = govFromA ? speakerIdsB : speakerIdsA
  const govScores = govFromA ? scoresA : scoresB
  const oppScores = govFromA ? scoresB : scoresA
  const govMatter = govFromA ? matterA : matterB
  const oppMatter = govFromA ? matterB : matterA
  const govManner = govFromA ? mannerA : mannerB
  const oppManner = govFromA ? mannerB : mannerA
  const govBest = govFromA ? bestA : bestB
  const oppBest = govFromA ? bestB : bestA
  const govPoi = govFromA ? poiA : poiB
  const oppPoi = govFromA ? poiB : poiA

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

  return [
    ...toRows('gov', govId, govSpeakerIds, govScores, govMatter, govManner, govBest, govPoi),
    ...toRows('opp', oppId, oppSpeakerIds, oppScores, oppMatter, oppManner, oppBest, oppPoi),
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
  editingBallotScoresAText.value = ''
  editingBallotScoresBText.value = ''
  editingBallotMatterAText.value = ''
  editingBallotMannerAText.value = ''
  editingBallotMatterBText.value = ''
  editingBallotMannerBText.value = ''
}

function roundScoreSettings(roundNumber: number) {
  const found = rounds.rounds.find((item) => Number(item.round) === Number(roundNumber))
  return {
    noSpeakerScore: found?.userDefinedData?.no_speaker_score === true,
    scoreByMatterManner: found?.userDefinedData?.score_by_matter_manner !== false,
  }
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
  if (settings.noSpeakerScore) {
    editingBallotScoreMode.value = 'total'
    editingBallotScoresAText.value = ''
    editingBallotScoresBText.value = ''
    editingBallotMatterAText.value = ''
    editingBallotMannerAText.value = ''
    editingBallotMatterBText.value = ''
    editingBallotMannerBText.value = ''
    return
  }

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

  editingBallotScoresAText.value = formatNumberListText(scoresA)
  editingBallotScoresBText.value = formatNumberListText(scoresB)
  editingBallotMatterAText.value = formatNumberListText(matterA)
  editingBallotMannerAText.value = formatNumberListText(mannerA)
  editingBallotMatterBText.value = formatNumberListText(matterB)
  editingBallotMannerBText.value = formatNumberListText(mannerB)
}

function buildBallotPayloadFromForm(
  options?: { suppressError?: boolean }
): Record<string, unknown> | null {
  const fail = (message: string) => {
    if (!options?.suppressError) {
      editError.value = message
    }
    return null
  }

  const teamAId = editingBallotTeamAId.value.trim()
  const teamBId = editingBallotTeamBId.value.trim()
  if (!teamAId || !teamBId || teamAId === teamBId) {
    return fail(t('チームIDを確認してください。'))
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

  const normalizeSpeakerScopedFields = (scoresLengthA: number, scoresLengthB: number) => {
    if (scoresLengthA <= 0) {
      payload.speakerIdsA = []
      payload.bestA = []
      payload.poiA = []
    } else {
      const speakerIdsA = toStringArray(payload.speakerIdsA).map((value) => value.trim())
      if (speakerIdsA.length === scoresLengthA && speakerIdsA.every((value) => value.length > 0)) {
        payload.speakerIdsA = speakerIdsA
      } else {
        delete payload.speakerIdsA
      }
      const bestA = toBooleanArray(payload.bestA)
      const poiA = toBooleanArray(payload.poiA)
      payload.bestA = Array.from({ length: scoresLengthA }, (_, index) => Boolean(bestA[index]))
      payload.poiA = Array.from({ length: scoresLengthA }, (_, index) => Boolean(poiA[index]))
    }

    if (scoresLengthB <= 0) {
      payload.speakerIdsB = []
      payload.bestB = []
      payload.poiB = []
    } else {
      const speakerIdsB = toStringArray(payload.speakerIdsB).map((value) => value.trim())
      if (speakerIdsB.length === scoresLengthB && speakerIdsB.every((value) => value.length > 0)) {
        payload.speakerIdsB = speakerIdsB
      } else {
        delete payload.speakerIdsB
      }
      const bestB = toBooleanArray(payload.bestB)
      const poiB = toBooleanArray(payload.poiB)
      payload.bestB = Array.from({ length: scoresLengthB }, (_, index) => Boolean(bestB[index]))
      payload.poiB = Array.from({ length: scoresLengthB }, (_, index) => Boolean(poiB[index]))
    }
  }

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

  if (editingBallotScoreMode.value === 'matter_manner') {
    const matterA = parseNumberListText(editingBallotMatterAText.value, t('チーム A Matter'))
    if (!matterA.ok) return fail(matterA.message)
    const mannerA = parseNumberListText(editingBallotMannerAText.value, t('チーム A Manner'))
    if (!mannerA.ok) return fail(mannerA.message)
    const matterB = parseNumberListText(editingBallotMatterBText.value, t('チーム B Matter'))
    if (!matterB.ok) return fail(matterB.message)
    const mannerB = parseNumberListText(editingBallotMannerBText.value, t('チーム B Manner'))
    if (!mannerB.ok) return fail(mannerB.message)

    if (matterA.value.length !== mannerA.value.length) {
      return fail(t('チーム A の Matter/Manner 件数を一致させてください。'))
    }
    if (matterB.value.length !== mannerB.value.length) {
      return fail(t('チーム B の Matter/Manner 件数を一致させてください。'))
    }

    payload.matterA = matterA.value
    payload.mannerA = mannerA.value
    payload.matterB = matterB.value
    payload.mannerB = mannerB.value
    const nextScoresA = matterA.value.map((value, index) => value + mannerA.value[index])
    const nextScoresB = matterB.value.map((value, index) => value + mannerB.value[index])
    payload.scoresA = nextScoresA
    payload.scoresB = nextScoresB
    normalizeSpeakerScopedFields(nextScoresA.length, nextScoresB.length)
    return payload
  }

  const scoresA = parseNumberListText(editingBallotScoresAText.value, t('チーム A スコア'))
  if (!scoresA.ok) return fail(scoresA.message)
  const scoresB = parseNumberListText(editingBallotScoresBText.value, t('チーム B スコア'))
  if (!scoresB.ok) return fail(scoresB.message)

  const nextScoresA = scoresA.value
  const nextScoresB = scoresB.value
  payload.scoresA = nextScoresA
  payload.scoresB = nextScoresB
  delete payload.matterA
  delete payload.mannerA
  delete payload.matterB
  delete payload.mannerB
  normalizeSpeakerScopedFields(nextScoresA.length, nextScoresB.length)
  return payload
}

function setBallotEditMode(mode: 'form' | 'json') {
  if (mode === editingBallotMode.value) return
  if (mode === 'json') {
    const payload = buildBallotPayloadFromForm({ suppressError: true })
    if (payload) {
      editingPayloadText.value = formatPayload(payload)
    }
    editingBallotMode.value = 'json'
    editError.value = ''
    return
  }
  try {
    const parsed = JSON.parse(editingPayloadText.value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      editError.value = t('JSONはオブジェクト形式で入力してください。')
      return
    }
    hydrateBallotEditor(parsed as Record<string, unknown>)
    editingBallotMode.value = 'form'
    editError.value = ''
  } catch {
    editError.value = t('JSONの形式が正しくありません。')
  }
}

function startEdit(item: Submission) {
  const id = String(item._id ?? '')
  if (!id) return
  editingSubmissionId.value = id
  editingRound.value = Number(item.round) || 1
  editingPayloadText.value = formatPayload(item.payload ?? {})
  if (item.type === 'ballot') {
    hydrateBallotEditor((item.payload ?? {}) as Record<string, unknown>)
    editingBallotMode.value = 'form'
  } else {
    resetBallotEditor()
    editingBallotMode.value = 'json'
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
  editingBallotMode.value = 'form'
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
  if (item.type === 'ballot' && editingBallotMode.value === 'form') {
    const payload = buildBallotPayloadFromForm()
    if (!payload) return
    parsed = payload
    editingPayloadText.value = formatPayload(parsed)
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
  } finally {
    sectionLoading.value = false
  }
}

watch(editingRound, () => {
  if (!editingSubmissionId.value) return
  if (editingBallotMode.value !== 'form') return
  const previousNoSpeaker = editingBallotNoSpeakerScore.value
  const settings = roundScoreSettings(editingRound.value)
  editingBallotNoSpeakerScore.value = settings.noSpeakerScore
  if (settings.noSpeakerScore) return
  if (previousNoSpeaker) {
    editingBallotScoreMode.value = settings.scoreByMatterManner ? 'matter_manner' : 'total'
  }
})

watch(
  () => route.query.round,
  (value) => {
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

.mode-card {
  padding: var(--space-2);
}

.mode-switch {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  overflow: hidden;
  background: var(--color-surface-muted);
}

.mode-button {
  border: none;
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  min-height: 34px;
  padding: 0 14px;
  cursor: pointer;
}

.mode-button:hover {
  color: var(--color-primary);
}

.mode-button + .mode-button {
  border-left: 1px solid var(--color-border);
}

.mode-button.active {
  background: var(--color-secondary);
  color: var(--color-primary);
}

.ballot-edit-grid {
  align-items: start;
}

.ballot-edit-grid .full {
  grid-column: 1 / -1;
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
  margin-left: auto;
}

.row-actions {
  gap: var(--space-2);
}

.submission-editor textarea {
  resize: vertical;
  min-height: 160px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace);
}
</style>
