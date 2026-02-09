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
                <Button variant="ghost" size="sm" @click="toggleExpand(item._id)">
                  {{ isExpanded(item._id) ? $t('詳細を隠す') : $t('詳細を表示') }}
                </Button>
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
  return submissions.submissions.filter((item) => {
    const matchesType = typeFilter.value === 'all' ? true : item.type === typeFilter.value
    const matchesRound = hasRoundFilter ? Number(item.round) === round : true
    const submittedByText = submittedBySearchText(item).toLowerCase()
    const matchesSearch = q ? submittedByText.includes(q) : true
    return matchesType && matchesRound && matchesSearch
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

async function refresh() {
  if (!tournamentId.value) return
  sectionLoading.value = true
  const type = typeFilter.value === 'all' ? undefined : typeFilter.value
  const round = roundFilter.value ? Number(roundFilter.value) : undefined
  const roundParam = round && !Number.isNaN(round) ? round : undefined
  try {
    await Promise.all([
      submissions.fetchSubmissions({
        tournamentId: tournamentId.value,
        type,
        round: roundParam,
      }),
      rounds.fetchRounds(tournamentId.value),
      draws.fetchDraws(tournamentId.value, roundParam),
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

watch([typeFilter, roundFilter], () => {
  refresh()
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

.mode-button + .mode-button {
  border-left: 1px solid var(--color-border);
}

.mode-button.active {
  background: var(--color-primary);
  color: var(--color-primary-contrast);
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
</style>
