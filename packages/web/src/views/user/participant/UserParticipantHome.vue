<template>
  <section class="stack">
    <div class="row participant-home-header">
      <h3>{{ isAudience ? $t('対戦表') : $t('参加者ダッシュボード') }}</h3>
      <ReloadButton
        @click="refresh"
        :disabled="isLoading"
        :loading="isLoading"
        :target="isAudience ? $t('対戦表') : $t('参加者ダッシュボード')"
      />
    </div>
    <LoadingState v-if="isLoading" />
    <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>
    <div v-else-if="visibleRounds.length === 0" class="muted">
      {{ $t('ラウンドがまだありません。') }}
    </div>

    <div v-else class="stack">
      <div v-if="isSpeaker || isAdjudicator" class="card stack">
        <h4>{{ $t('あなたの情報') }}</h4>
        <label v-if="isSpeaker" class="field">
          <span>{{ $t('ジャッジ名') }}</span>
          <select v-model="teamIdentityId">
            <option value="">{{ $t('未選択') }}</option>
            <option v-for="adj in adjudicatorIdentityOptions" :key="adj._id" :value="adj._id">
              {{ adj.name }}
            </option>
          </select>
        </label>
        <label v-if="isAdjudicator" class="field">
          <span>{{ $t('評価者') }}</span>
          <select v-model="judgeEvaluationActorMode" :disabled="judgeEvaluationActorOptions.length <= 1">
            <option
              v-for="option in judgeEvaluationActorOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <label v-if="isAdjudicator && judgeEvaluationActorMode === 'team'" class="field">
          <span>{{ $t('チーム') }}</span>
          <select v-model="judgeFeedbackTeamIdentityId">
            <option value="">{{ $t('未選択') }}</option>
            <option v-for="team in judgeFeedbackTeamOptions" :key="team._id" :value="team._id">
              {{ team.name }}
            </option>
          </select>
        </label>
        <label
          v-if="
            isAdjudicator &&
            judgeEvaluationActorMode === 'team' &&
            speakerSelectionRequired
          "
          class="field"
        >
          <span>{{ $t('スピーカー') }}</span>
          <select
            v-model="judgeFeedbackSpeakerIdentityId"
            :disabled="!judgeFeedbackTeamIdentityId || judgeFeedbackSelectableSpeakers.length === 0"
          >
            <option value="">{{ $t('未選択') }}</option>
            <option
              v-for="speaker in judgeFeedbackSelectableSpeakers"
              :key="speaker._id"
              :value="speaker._id"
            >
              {{ speaker.name }}
            </option>
          </select>
        </label>
        <label v-if="isAdjudicator && judgeEvaluationActorMode === 'adjudicator'" class="field">
          <span>{{ $t('ジャッジ名') }}</span>
          <select v-model="teamIdentityId">
            <option value="">{{ $t('未選択') }}</option>
            <option v-for="adj in adjudicatorIdentityOptions" :key="adj._id" :value="adj._id">
              {{ adj.name }}
            </option>
          </select>
        </label>
        <p v-if="isSpeaker && !teamIdentityId" class="muted">
          {{ $t('先にジャッジを選択してください。') }}
        </p>
        <p
          v-if="
            isAdjudicator &&
            judgeEvaluationActorMode === 'team' &&
            !judgeFeedbackTeamIdentityId
          "
          class="muted"
        >
          {{ $t('先にチームを選択してください。') }}
        </p>
        <p
          v-if="
            isAdjudicator &&
            judgeEvaluationActorMode === 'team' &&
            speakerSelectionRequired &&
            judgeFeedbackTeamIdentityId &&
            judgeFeedbackSelectableSpeakers.length === 0
          "
          class="muted"
        >
          {{ $t('このチームに選択可能なスピーカーがいません。') }}
        </p>
        <template v-if="pendingTaskContext">
          <p class="muted small task-summary">
            {{
              $t('対象ラウンド: {round}', {
                round: pendingTaskContext.round,
              })
            }}
          </p>
          <p v-if="pendingBallotContext" class="muted">
            {{
              $t('対象試合: {gov} vs {opp}', {
                gov: teamName(pendingBallotContext.teamA),
                opp: teamName(pendingBallotContext.teamB),
              })
            }}
          </p>
          <p
            v-if="
              pendingBallotContext &&
              pendingBallotContext.submitterCandidates.length > 0
            "
            class="muted small"
          >
            {{
              $t('提出候補ジャッジ: {names}', {
                names: adjudicatorNames(pendingBallotContext.submitterCandidates),
              })
            }}
          </p>
          <p v-if="pendingFeedbackContext" class="muted">
            {{
              $t('対象試合: {gov} vs {opp}', {
                gov: teamName(pendingFeedbackContext.teamGov),
                opp: teamName(pendingFeedbackContext.teamOpp),
              })
            }}
          </p>
          <p v-if="!pendingTaskReady" class="muted">{{ pendingTaskHint }}</p>
          <div v-else class="row pending-task-actions">
            <Button :to="pendingTaskPrimaryPath">
              {{ pendingTaskPrimaryLabel }}
            </Button>
          </div>
        </template>
        <p v-else class="muted small task-summary">
          {{ $t('対戦表の評価ボタンから入力を開始してください。') }}
        </p>
      </div>

      <template v-if="isAudience">
        <div class="card stack audience-tools">
          <input
            v-model.trim="audienceTeamQuery"
            type="search"
            class="audience-team-input"
            :placeholder="$t('チーム名またはジャッジ名で検索')"
          />
        </div>

        <div v-for="round in visibleRounds" :key="round._id" class="card stack compact-round">
          <button
            type="button"
            class="round-toggle"
            :aria-expanded="isRoundExpanded(round.round)"
            @click="toggleRound(round.round)"
          >
            <span
              class="toggle-icon"
              :class="{ open: isRoundExpanded(round.round) }"
              aria-hidden="true"
            >
              <svg viewBox="0 0 20 20" width="14" height="14">
                <path
                  d="M7 4l6 6-6 6"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <div class="stack tight">
              <strong>{{ round.name ?? $t('ラウンド {round}', { round: round.round }) }}</strong>
              <span v-if="roundMotion(round.round)" class="muted small">
                {{ $t('モーション') }}: {{ roundMotion(round.round) }}
              </span>
            </div>
          </button>

          <div v-show="isRoundExpanded(round.round)" class="stack">
            <div
              v-if="roundHasPartialAllocation(round.round)"
              class="row round-visibility-note"
              role="status"
              aria-live="polite"
            >
              <span class="round-visibility-title">{{ $t('対戦表は一部のみ公開されています。') }}</span>
              <div class="row round-visibility-chip-list">
                <span class="round-visibility-chip" :class="teamAllocationVisible(round.round) ? 'is-open' : 'is-closed'">
                  {{ $t('チーム') }}: {{ teamAllocationVisible(round.round) ? $t('公開') : $t('非公開') }}
                </span>
                <span class="round-visibility-chip" :class="adjudicatorAllocationVisible(round.round) ? 'is-open' : 'is-closed'">
                  {{ $t('ジャッジ') }}: {{ adjudicatorAllocationVisible(round.round) ? $t('公開') : $t('非公開') }}
                </span>
              </div>
            </div>
            <div
              v-if="!drawForRound(round.round) || !roundHasVisibleAllocation(round.round)"
              class="row round-visibility-note"
              role="status"
              aria-live="polite"
            >
              <span class="round-visibility-title">{{ $t('ドローは未公開です。') }}</span>
              <div class="row round-visibility-chip-list">
                <span class="round-visibility-chip" :class="teamAllocationVisible(round.round) ? 'is-open' : 'is-closed'">
                  {{ $t('チーム') }}: {{ teamAllocationVisible(round.round) ? $t('公開') : $t('非公開') }}
                </span>
                <span class="round-visibility-chip" :class="adjudicatorAllocationVisible(round.round) ? 'is-open' : 'is-closed'">
                  {{ $t('ジャッジ') }}: {{ adjudicatorAllocationVisible(round.round) ? $t('公開') : $t('非公開') }}
                </span>
              </div>
            </div>
            <div v-else-if="sortedAllocation(round.round).length === 0" class="muted">
              {{ $t('ドローが登録されていません。') }}
            </div>
            <div v-else-if="audienceViewMode === 'card'" class="stack compact-draw-list">
              <div
                v-for="(row, index) in sortedAllocation(round.round)"
                :key="`${round.round}-${index}`"
                class="draw-row"
                :class="{ 'match-hit': isAudienceRowMatched(row) }"
                :data-audience-match="isAudienceRowMatched(row) ? 'true' : undefined"
              >
                <div class="row draw-main">
                  <span class="muted small">{{ venueName(row.venue) }}</span>
                </div>
                <div v-if="teamAllocationVisible(round.round)" class="match-sides">
                  <div class="side-card gov-card">
                    <span class="side-chip">{{ govLabel }}</span>
                    <strong>{{ teamName(row.teams.gov) }}</strong>
                  </div>
                  <span class="vs-chip">{{ $t('vs') }}</span>
                  <div class="side-card opp-card">
                    <span class="side-chip">{{ oppLabel }}</span>
                    <strong>{{ teamName(row.teams.opp) }}</strong>
                  </div>
                </div>
                <div v-if="adjudicatorAllocationVisible(round.round)" class="draw-chair-line">
                  <span class="draw-chair-label">{{ $t('チェア:') }}</span>
                  <span class="draw-chair-names">{{ adjudicatorNames(row.chairs) }}</span>
                </div>
                <div class="row draw-actions">
                  <Button variant="ghost" size="sm" :to="teamEvaluationPath(round.round, row)">
                    {{ $t('チーム評価') }}
                  </Button>
                  <Button
                    v-if="judgeEvaluationEnabled(round.round)"
                    variant="ghost"
                    size="sm"
                    :to="judgeEvaluationPath(round.round, row)"
                  >
                    {{ $t('ジャッジ評価') }}
                  </Button>
                </div>
              </div>
            </div>
            <div v-else class="table-wrap">
              <table class="draw-table">
                <thead>
                  <tr>
                    <th>
                      <button
                        type="button"
                        class="table-sort"
                        @click="setAudienceTableSort(round.round, 'venue')"
                      >
                        {{ $t('会場') }}
                        <span class="sort-indicator">{{
                          audienceSortIndicator(round.round, 'venue')
                        }}</span>
                      </button>
                    </th>
                    <th v-if="teamAllocationVisible(round.round)">
                      <button
                        type="button"
                        class="table-sort"
                        @click="setAudienceTableSort(round.round, 'gov')"
                      >
                        {{ govLabel }}
                        <span class="sort-indicator">{{
                          audienceSortIndicator(round.round, 'gov')
                        }}</span>
                      </button>
                    </th>
                    <th v-if="teamAllocationVisible(round.round)">
                      <button
                        type="button"
                        class="table-sort"
                        @click="setAudienceTableSort(round.round, 'opp')"
                      >
                        {{ oppLabel }}
                        <span class="sort-indicator">{{
                          audienceSortIndicator(round.round, 'opp')
                        }}</span>
                      </button>
                    </th>
                    <th v-if="adjudicatorAllocationVisible(round.round)">
                      <button
                        type="button"
                        class="table-sort"
                        @click="setAudienceTableSort(round.round, 'chair')"
                      >
                        {{ $t('チェア') }}
                        <span class="sort-indicator">{{
                          audienceSortIndicator(round.round, 'chair')
                        }}</span>
                      </button>
                    </th>
                    <th>{{ $t('操作') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, index) in sortedAudienceTableAllocation(round.round)"
                    :key="`table-${round.round}-${index}`"
                    :class="{ 'match-hit': isAudienceRowMatched(row) }"
                    :data-audience-match="isAudienceRowMatched(row) ? 'true' : undefined"
                  >
                    <td>{{ venueName(row.venue) }}</td>
                    <td v-if="teamAllocationVisible(round.round)">{{ teamName(row.teams.gov) }}</td>
                    <td v-if="teamAllocationVisible(round.round)">{{ teamName(row.teams.opp) }}</td>
                    <td v-if="adjudicatorAllocationVisible(round.round)">
                      {{ adjudicatorNames(row.chairs) }}
                    </td>
                    <td class="draw-actions-cell">
                      <div class="row draw-actions">
                        <Button variant="ghost" size="sm" :to="teamEvaluationPath(round.round, row)">
                          {{ $t('チーム評価') }}
                        </Button>
                        <Button
                          v-if="judgeEvaluationEnabled(round.round)"
                          variant="ghost"
                          size="sm"
                          :to="judgeEvaluationPath(round.round, row)"
                        >
                          {{ $t('ジャッジ評価') }}
                        </Button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>

    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTournamentStore } from '@/stores/tournament'
import { useStylesStore } from '@/stores/styles'
import { useRoundsStore } from '@/stores/rounds'
import { useTeamsStore } from '@/stores/teams'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { useSpeakersStore } from '@/stores/speakers'
import { useDrawsStore } from '@/stores/draws'
import { useVenuesStore } from '@/stores/venues'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'
import ReloadButton from '@/components/common/ReloadButton.vue'
import { useParticipantIdentity } from '@/composables/useParticipantIdentity'
import { getSideShortLabel } from '@/utils/side-labels'
import type { Draw, DrawAllocationRow } from '@/types/draw'

const route = useRoute()
const router = useRouter()
const tournamentStore = useTournamentStore()
const stylesStore = useStylesStore()
const roundsStore = useRoundsStore()
const teamsStore = useTeamsStore()
const adjudicatorsStore = useAdjudicatorsStore()
const speakersStore = useSpeakersStore()
const drawsStore = useDrawsStore()
const venuesStore = useVenuesStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const participant = computed(() => route.params.participant as string)

const { identityId: teamIdentityId } = useParticipantIdentity(tournamentId, participant)
const { identityId: judgeFeedbackTeamIdentityId } = useParticipantIdentity(
  tournamentId,
  participant,
  'team-feedback-team'
)
const { identityId: judgeFeedbackSpeakerIdentityId } = useParticipantIdentity(
  tournamentId,
  participant,
  'team-feedback-speaker'
)

const isAudience = computed(() => participant.value === 'audience')
const isAdjudicator = computed(() => participant.value === 'adjudicator')
const isSpeaker = computed(() => participant.value === 'speaker')
const judgeEvaluationActorMode = computed<'team' | 'adjudicator'>({
  get: () => (route.query.actor === 'adjudicator' ? 'adjudicator' : 'team'),
  set: (value) => {
    if (!isAdjudicator.value) return
    if (value === judgeEvaluationActorMode.value) return
    router.replace({
      query: {
        ...route.query,
        actor: value,
      },
    })
  },
})

const tournament = computed(() =>
  tournamentStore.tournaments.find((item) => item._id === tournamentId.value)
)
const style = computed(() => stylesStore.styles.find((item) => item.id === tournament.value?.style))
const govLabel = computed(() => getSideShortLabel(style.value, 'gov', t('政府')))
const oppLabel = computed(() => getSideShortLabel(style.value, 'opp', t('反対')))

const visibleRounds = computed(() => roundsStore.rounds.slice().sort((a, b) => a.round - b.round))
const drawsByRound = computed(() => {
  const map = new Map<number, Draw>()
  drawsStore.draws.forEach((draw) => {
    map.set(Number(draw.round), draw)
  })
  return map
})

function speakersForTeam(teamId: string) {
  if (!teamId) return []
  const team = teamsStore.teams.find((item) => item._id === teamId)
  if (!team) return []
  const detailSpeakerIds = new Set<string>()
  ;(team.details ?? []).forEach((detail: any) => {
    ;(detail?.speakers ?? []).forEach((id: any) => {
      if (id) detailSpeakerIds.add(String(id))
    })
  })
  if (detailSpeakerIds.size > 0) {
    return speakersStore.speakers.filter((speaker) => detailSpeakerIds.has(speaker._id))
  }

  const speakerNames = new Set<string>(
    (team.speakers ?? []).map((speaker: any) => String(speaker?.name ?? '')).filter(Boolean)
  )
  return speakersStore.speakers.filter((speaker) => speakerNames.has(speaker.name))
}

const judgeFeedbackSelectableSpeakers = computed(() => {
  if (!isAdjudicator.value || judgeEvaluationActorMode.value !== 'team') return []
  if (!judgeFeedbackTeamIdentityId.value) return []
  return speakersForTeam(judgeFeedbackTeamIdentityId.value)
})

const speakerSelectionRequired = computed(() => {
  if (!isAdjudicator.value || judgeEvaluationActorMode.value !== 'team') return false
  if (pendingFeedbackRoundConfig.value) {
    return (
      pendingFeedbackRoundConfig.value.evaluateFromTeams &&
      pendingFeedbackRoundConfig.value.evaluatorInTeam === 'speaker'
    )
  }
  return visibleRounds.value.some((round) => {
    const config = feedbackConfig(round.round)
    return config.evaluateFromTeams && config.evaluatorInTeam === 'speaker'
  })
})

const isLoading = computed(
  () =>
    tournamentStore.loading ||
    stylesStore.loading ||
    roundsStore.loading ||
    drawsStore.loading ||
    teamsStore.loading ||
    adjudicatorsStore.loading ||
    speakersStore.loading ||
    venuesStore.loading
)

const errorMessage = computed(
  () =>
    tournamentStore.error ||
    stylesStore.error ||
    roundsStore.error ||
    drawsStore.error ||
    teamsStore.error ||
    adjudicatorsStore.error ||
    speakersStore.error ||
    venuesStore.error ||
    ''
)

const roundExpanded = ref<Record<number, boolean>>({})
type AudienceSortKey = 'venue' | 'gov' | 'opp' | 'chair'
type AudienceSortDirection = 'asc' | 'desc'
type AudienceSortState = { key: AudienceSortKey; direction: AudienceSortDirection }
const audienceTableSortByRound = ref<Record<number, AudienceSortState>>({})
const audienceTeamQuery = ref('')
const audienceViewportMode = ref<'card' | 'table'>('table')
let disposeAudienceViewportWatcher: (() => void) | null = null
const audienceViewMode = computed<'card' | 'table'>(() => {
  if (route.query.viewMode === 'table') return 'table'
  if (route.query.viewMode === 'card') return 'card'
  return audienceViewportMode.value
})
const audienceSortCollator = new Intl.Collator(['ja', 'en'], { numeric: true, sensitivity: 'base' })
const normalizedAudienceTeamQuery = computed(() => audienceTeamQuery.value.trim().toLowerCase())
const hasAudienceTeamQuery = computed(() => normalizedAudienceTeamQuery.value.length > 0)

type PendingTaskContext =
  | {
      kind: 'ballot'
      round: number
      teamA: string
      teamB: string
      submitterCandidates: string[]
    }
  | {
      kind: 'feedback'
      round: number
      teamGov: string
      teamOpp: string
      targetJudgeIds: string[]
      submitterCandidates: string[]
    }

function parseQueryList(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) return []
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => {
          const token = item.trim()
          try {
            return decodeURIComponent(token)
          } catch {
            return token
          }
        })
        .filter(Boolean)
    )
  )
}

const pendingTaskContext = computed<PendingTaskContext | null>(() => {
  if (isAudience.value) return null
  const task = typeof route.query.task === 'string' ? route.query.task : ''
  const roundNumber = Number(route.query.round)
  if (!Number.isFinite(roundNumber) || roundNumber < 1) return null

  if (task === 'ballot') {
    const teamA = typeof route.query.teamA === 'string' ? route.query.teamA.trim() : ''
    const teamB = typeof route.query.teamB === 'string' ? route.query.teamB.trim() : ''
    if (!teamA || !teamB) return null
    return {
      kind: 'ballot',
      round: roundNumber,
      teamA,
      teamB,
      submitterCandidates: parseQueryList(route.query.submitters),
    }
  }

  if (task === 'feedback') {
    const teamGov = typeof route.query.teamGov === 'string' ? route.query.teamGov.trim() : ''
    const teamOpp = typeof route.query.teamOpp === 'string' ? route.query.teamOpp.trim() : ''
    const targetJudgeIds = parseQueryList(route.query.targets)
    const submitterCandidates = parseQueryList(route.query.submitters)
    if (!teamGov || !teamOpp || targetJudgeIds.length === 0) return null
    return {
      kind: 'feedback',
      round: roundNumber,
      teamGov,
      teamOpp,
      targetJudgeIds,
      submitterCandidates,
    }
  }
  return null
})

const pendingBallotContext = computed(() => {
  if (!pendingTaskContext.value || pendingTaskContext.value.kind !== 'ballot') return null
  return pendingTaskContext.value
})

const pendingFeedbackContext = computed(() => {
  if (!pendingTaskContext.value || pendingTaskContext.value.kind !== 'feedback') return null
  return pendingTaskContext.value
})

function feedbackConfig(roundNumber: number) {
  const userDefined = roundConfig(roundNumber)?.userDefinedData ?? {}
  return {
    evaluateFromTeams: userDefined.evaluate_from_teams !== false,
    evaluateFromAdjudicators: userDefined.evaluate_from_adjudicators !== false,
    evaluatorInTeam: userDefined.evaluator_in_team === 'speaker' ? 'speaker' : 'team',
  } as const
}

const pendingFeedbackRoundConfig = computed(() => {
  if (!pendingFeedbackContext.value) return null
  return feedbackConfig(pendingFeedbackContext.value.round)
})

function normalizedPendingFeedbackSubmitterCandidates() {
  return Array.from(
    new Set(
      (pendingFeedbackContext.value?.submitterCandidates ?? [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
    )
  )
}

function rowJudgeTargetIds(row: DrawAllocationRow) {
  return Array.from(new Set([...(row.chairs ?? []), ...(row.panels ?? [])])).filter(Boolean)
}

function supportsAdjudicatorToAdjudicatorFeedback(row: DrawAllocationRow) {
  return rowJudgeTargetIds(row).length > 0 && rowAdjudicatorIds(row).length > 1
}

function findPendingFeedbackRow() {
  if (!pendingFeedbackContext.value) return null
  const expected = [pendingFeedbackContext.value.teamGov, pendingFeedbackContext.value.teamOpp].sort()
  return (
    sortedAllocation(pendingFeedbackContext.value.round).find((row) => {
      const gov = String(row?.teams?.gov ?? '')
      const opp = String(row?.teams?.opp ?? '')
      const current = [gov, opp].sort()
      return current[0] === expected[0] && current[1] === expected[1]
    }) ?? null
  )
}

function roundHasAdjudicatorToAdjudicatorFeedback(roundNumber: number) {
  return sortedAllocation(roundNumber).some((row) => supportsAdjudicatorToAdjudicatorFeedback(row))
}

const pendingFeedbackHasAdjudicatorPeerCandidate = computed(() => {
  if (!pendingFeedbackContext.value) return false
  const submitterCandidates = normalizedPendingFeedbackSubmitterCandidates()
  if (submitterCandidates.length > 0) {
    return submitterCandidates.length > 1
  }
  const row = findPendingFeedbackRow()
  if (!row) return false
  return supportsAdjudicatorToAdjudicatorFeedback(row)
})

const judgeEvaluationActorOptions = computed<Array<{ value: 'team' | 'adjudicator'; label: string }>>(() => {
  if (!isAdjudicator.value) return []
  if (pendingFeedbackRoundConfig.value) {
    const options: Array<{ value: 'team' | 'adjudicator'; label: string }> = []
    if (pendingFeedbackRoundConfig.value.evaluateFromTeams) {
      options.push({ value: 'team', label: t('チーム/スピーカー') })
    }
    if (
      pendingFeedbackRoundConfig.value.evaluateFromAdjudicators &&
      pendingFeedbackHasAdjudicatorPeerCandidate.value
    ) {
      options.push({ value: 'adjudicator', label: t('ジャッジ') })
    }
    return options
  }
  const canEvaluateAsTeam = visibleRounds.value.some(
    (round) => feedbackConfig(round.round).evaluateFromTeams
  )
  const canEvaluateAsAdjudicator = visibleRounds.value.some((round) => {
    const config = feedbackConfig(round.round)
    if (!config.evaluateFromAdjudicators) return false
    return roundHasAdjudicatorToAdjudicatorFeedback(round.round)
  })
  const options: Array<{ value: 'team' | 'adjudicator'; label: string }> = []
  if (canEvaluateAsTeam) options.push({ value: 'team', label: t('チーム/スピーカー') })
  if (canEvaluateAsAdjudicator) options.push({ value: 'adjudicator', label: t('ジャッジ') })
  return options
})

const pendingFeedbackAllowsTeamActor = computed(() => {
  if (!pendingFeedbackContext.value) return true
  return pendingFeedbackRoundConfig.value?.evaluateFromTeams !== false
})

const pendingFeedbackAllowsAdjudicatorActor = computed(() => {
  if (!pendingFeedbackContext.value) return true
  if (!pendingFeedbackRoundConfig.value?.evaluateFromAdjudicators) return false
  return pendingFeedbackHasAdjudicatorPeerCandidate.value
})

const pendingFeedbackSubmitterCandidates = computed(() =>
  normalizedPendingFeedbackSubmitterCandidates()
)
const pendingFeedbackSubmitterCandidateSet = computed(
  () => new Set(pendingFeedbackSubmitterCandidates.value)
)

const pendingBallotSubmitterCandidates = computed(() =>
  Array.from(
    new Set(
      (pendingBallotContext.value?.submitterCandidates ?? [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
    )
  )
)
const pendingBallotSubmitterCandidateSet = computed(
  () => new Set(pendingBallotSubmitterCandidates.value)
)
const ballotSubmitterOptions = computed(() => {
  if (pendingBallotSubmitterCandidateSet.value.size === 0) return adjudicatorsStore.adjudicators
  return adjudicatorsStore.adjudicators.filter((adj) =>
    pendingBallotSubmitterCandidateSet.value.has(adj._id)
  )
})

const judgeFeedbackAdjudicatorOptions = computed(() => {
  if (!isAdjudicator.value || judgeEvaluationActorMode.value !== 'adjudicator') {
    return adjudicatorsStore.adjudicators
  }
  if (!pendingFeedbackContext.value) return adjudicatorsStore.adjudicators
  if (!pendingFeedbackAllowsAdjudicatorActor.value) return []
  if (pendingFeedbackSubmitterCandidateSet.value.size === 0) return adjudicatorsStore.adjudicators
  return adjudicatorsStore.adjudicators.filter((adj) =>
    pendingFeedbackSubmitterCandidateSet.value.has(adj._id)
  )
})

const adjudicatorIdentityOptions = computed(() => {
  if (isSpeaker.value) return ballotSubmitterOptions.value
  if (isAdjudicator.value && judgeEvaluationActorMode.value === 'adjudicator') {
    return judgeFeedbackAdjudicatorOptions.value
  }
  return adjudicatorsStore.adjudicators
})

const pendingFeedbackTeamIds = computed(() =>
  Array.from(
    new Set(
      [pendingFeedbackContext.value?.teamGov, pendingFeedbackContext.value?.teamOpp]
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
    )
  )
)
const pendingFeedbackTeamSet = computed(() => new Set(pendingFeedbackTeamIds.value))
const judgeFeedbackTeamOptions = computed(() => {
  if (!isAdjudicator.value || judgeEvaluationActorMode.value !== 'team') return teamsStore.teams
  if (!pendingFeedbackAllowsTeamActor.value) return []
  if (pendingFeedbackTeamSet.value.size === 0) return teamsStore.teams
  return teamsStore.teams.filter((team) => pendingFeedbackTeamSet.value.has(team._id))
})

const selectedBallotSubmitterAllowed = computed(() => {
  const submitter = teamIdentityId.value
  if (!submitter) return false
  if (!pendingBallotContext.value) return true
  if (pendingBallotSubmitterCandidateSet.value.size === 0) return true
  return pendingBallotSubmitterCandidateSet.value.has(submitter)
})
const selectedFeedbackTeamAllowed = computed(() => {
  const selected = judgeFeedbackTeamIdentityId.value
  if (!selected) return false
  if (!pendingFeedbackContext.value) return true
  if (!pendingFeedbackAllowsTeamActor.value) return false
  if (pendingFeedbackTeamSet.value.size === 0) return true
  return pendingFeedbackTeamSet.value.has(selected)
})

const selectedFeedbackAdjudicatorAllowed = computed(() => {
  const selected = teamIdentityId.value
  if (!selected) return false
  if (!pendingFeedbackContext.value) return true
  if (!pendingFeedbackAllowsAdjudicatorActor.value) return false
  if (pendingFeedbackSubmitterCandidateSet.value.size === 0) return true
  return pendingFeedbackSubmitterCandidateSet.value.has(selected)
})

const pendingTaskReady = computed(() => {
  if (!pendingTaskContext.value) return false
  if (pendingTaskContext.value.kind === 'ballot') {
    return isSpeaker.value && selectedBallotSubmitterAllowed.value
  }
  if (!isAdjudicator.value) return false
  if (judgeEvaluationActorMode.value === 'adjudicator') {
    return selectedFeedbackAdjudicatorAllowed.value
  }
  if (!selectedFeedbackTeamAllowed.value) return false
  if (speakerSelectionRequired.value && !judgeFeedbackSpeakerIdentityId.value) return false
  return true
})

const pendingTaskHint = computed(() => {
  if (!pendingTaskContext.value) return ''
  if (pendingTaskContext.value.kind === 'ballot') {
    return t('先に提出者を選択すると入力ボタンが表示されます。')
  }
  if (speakerSelectionRequired.value) {
    return t('先に提出者を選択すると入力ボタンが表示されます。')
  }
  return t('先に提出者を選択すると入力ボタンが表示されます。')
})

const pendingTaskPrimaryLabel = computed(() => {
  if (!pendingTaskContext.value) return t('入力')
  return pendingTaskContext.value.kind === 'ballot'
    ? t('チーム評価を開始')
    : t('ジャッジ評価を開始')
})

const pendingTaskPrimaryPath = computed(() => {
  if (!pendingTaskContext.value || !pendingTaskReady.value) return ''
  if (pendingTaskContext.value.kind === 'ballot') {
    const query = new URLSearchParams({
      teamA: pendingTaskContext.value.teamA,
      teamB: pendingTaskContext.value.teamB,
      submitter: teamIdentityId.value,
    })
    return `/user/${tournamentId.value}/speaker/rounds/${pendingTaskContext.value.round}/ballot/entry?${query.toString()}`
  }
  if (judgeEvaluationActorMode.value === 'adjudicator') {
    const feedbackQuery = new URLSearchParams({
      actor: 'adjudicator',
    })
    return `/user/${tournamentId.value}/adjudicator/rounds/${pendingTaskContext.value.round}/feedback/home?${feedbackQuery.toString()}`
  }
  const feedbackQuery = new URLSearchParams({
    filter: 'team',
    actor: 'team',
    team: judgeFeedbackTeamIdentityId.value,
  })
  const judgeId = pendingTaskContext.value.targetJudgeIds[0]
  if (pendingTaskContext.value.targetJudgeIds.length === 1 && judgeId) {
    return `/user/${tournamentId.value}/adjudicator/rounds/${pendingTaskContext.value.round}/feedback/${encodeURIComponent(judgeId)}?${feedbackQuery.toString()}`
  }
  return `/user/${tournamentId.value}/adjudicator/rounds/${pendingTaskContext.value.round}/feedback/home?${feedbackQuery.toString()}`
})

function audienceTeamMatchesQuery(teamId?: string) {
  const query = normalizedAudienceTeamQuery.value
  if (!query || !teamId) return false
  const team = teamsStore.teams.find((item) => item._id === teamId)
  if (!team) return false
  const normalizedName = team.name.trim().toLowerCase()
  return normalizedName.includes(query) || team._id.toLowerCase().includes(query)
}

function audienceAdjudicatorMatchesQuery(adjudicatorId?: string) {
  const query = normalizedAudienceTeamQuery.value
  if (!query || !adjudicatorId) return false
  const adjudicator = adjudicatorsStore.adjudicators.find((item) => item._id === adjudicatorId)
  if (!adjudicator) return false
  const normalizedName = String(adjudicator.name ?? '').trim().toLowerCase()
  return normalizedName.includes(query) || adjudicator._id.toLowerCase().includes(query)
}

function isAudienceRowMatched(row: DrawAllocationRow) {
  if (!hasAudienceTeamQuery.value) return false
  const judgeIds = [...(row.chairs ?? []), ...(row.panels ?? [])]
  return (
    audienceTeamMatchesQuery(row?.teams?.gov) ||
    audienceTeamMatchesQuery(row?.teams?.opp) ||
    judgeIds.some((id) => audienceAdjudicatorMatchesQuery(id))
  )
}

function roundHasAudienceMatch(roundNumber: number) {
  if (!hasAudienceTeamQuery.value) return false
  return sortedAllocation(roundNumber).some((row) => isAudienceRowMatched(row))
}

function preferredTeamIdForRow(row: DrawAllocationRow) {
  const govMatched = audienceTeamMatchesQuery(row?.teams?.gov)
  const oppMatched = audienceTeamMatchesQuery(row?.teams?.opp)
  if (govMatched && !oppMatched) return row.teams?.gov ?? ''
  if (oppMatched && !govMatched) return row.teams?.opp ?? ''
  return ''
}

function rowAdjudicatorIds(row: DrawAllocationRow) {
  return Array.from(
    new Set([...(row.chairs ?? []), ...(row.panels ?? []), ...(row.trainees ?? [])])
  ).filter(Boolean)
}

function encodeList(values: string[]) {
  return values.map((value) => encodeURIComponent(value)).join(',')
}

function judgeEvaluationEnabled(roundNumber: number) {
  const config = roundConfig(roundNumber)
  const userDefined = config?.userDefinedData ?? {}
  const evaluateFromTeams = userDefined.evaluate_from_teams !== false
  if (evaluateFromTeams) return true
  const evaluateFromAdjudicators = userDefined.evaluate_from_adjudicators !== false
  if (!evaluateFromAdjudicators) return false
  return roundHasAdjudicatorToAdjudicatorFeedback(roundNumber)
}

function teamEvaluationPath(roundNumber: number, row: DrawAllocationRow) {
  const teamA = row?.teams?.gov
  const teamB = row?.teams?.opp
  if (!teamA || !teamB) {
    return `/user/${tournamentId.value}/speaker/rounds/${roundNumber}/ballot/home`
  }
  const adjudicatorIds = rowAdjudicatorIds(row)
  if (adjudicatorIds.length === 1) {
    const query = new URLSearchParams({
      teamA,
      teamB,
      submitter: adjudicatorIds[0],
    })
    return `/user/${tournamentId.value}/speaker/rounds/${roundNumber}/ballot/entry?${query.toString()}`
  }
  const query = new URLSearchParams({
    task: 'ballot',
    round: String(roundNumber),
    teamA,
    teamB,
  })
  if (adjudicatorIds.length > 0) {
    query.set('submitters', encodeList(adjudicatorIds))
  }
  return `/user/${tournamentId.value}/speaker/home?${query.toString()}`
}

function judgeEvaluationPath(roundNumber: number, row: DrawAllocationRow) {
  const teamGov = String(row?.teams?.gov ?? '')
  const teamOpp = String(row?.teams?.opp ?? '')
  const targetIds = Array.from(new Set([...(row.chairs ?? []), ...(row.panels ?? [])])).filter(Boolean)
  if (!teamGov || !teamOpp || targetIds.length === 0) {
    return `/user/${tournamentId.value}/adjudicator/home`
  }
  const submitterIds = rowAdjudicatorIds(row)
  const config = feedbackConfig(roundNumber)
  const canUseTeamActor = config.evaluateFromTeams
  const canUseAdjudicatorActor = config.evaluateFromAdjudicators && submitterIds.length > 1
  if (!canUseTeamActor && !canUseAdjudicatorActor) {
    return `/user/${tournamentId.value}/adjudicator/home`
  }
  const defaultActor: 'team' | 'adjudicator' = canUseTeamActor ? 'team' : 'adjudicator'

  if (defaultActor === 'adjudicator') {
    const adjudicatorQuery = new URLSearchParams({
      actor: 'adjudicator',
      task: 'feedback',
      round: String(roundNumber),
      teamGov,
      teamOpp,
      targets: encodeList(targetIds),
    })
    if (submitterIds.length > 0) {
      adjudicatorQuery.set('submitters', encodeList(submitterIds))
    }
    return `/user/${tournamentId.value}/adjudicator/home?${adjudicatorQuery.toString()}`
  }

  const teamId = preferredTeamIdForRow(row)
  if (teamId) {
    const query = new URLSearchParams({
      filter: 'team',
      actor: 'team',
      team: teamId,
    })
    if (targetIds.length === 1) {
      return `/user/${tournamentId.value}/adjudicator/rounds/${roundNumber}/feedback/${encodeURIComponent(targetIds[0])}?${query.toString()}`
    }
    return `/user/${tournamentId.value}/adjudicator/rounds/${roundNumber}/feedback/home?${query.toString()}`
  }

  const unresolvedQuery = new URLSearchParams({
    actor: 'team',
    task: 'feedback',
    round: String(roundNumber),
    teamGov,
    teamOpp,
    targets: encodeList(targetIds),
  })
  if (submitterIds.length > 0) {
    unresolvedQuery.set('submitters', encodeList(submitterIds))
  }
  return `/user/${tournamentId.value}/adjudicator/home?${unresolvedQuery.toString()}`
}

function isRoundExpanded(roundNumber: number) {
  if (isAudience.value && hasAudienceTeamQuery.value && roundHasAudienceMatch(roundNumber)) {
    return true
  }
  return roundExpanded.value[roundNumber] !== false
}

function toggleRound(roundNumber: number) {
  roundExpanded.value = {
    ...roundExpanded.value,
    [roundNumber]: !isRoundExpanded(roundNumber),
  }
}

function drawForRound(roundNumber: number) {
  return drawsByRound.value.get(roundNumber)
}

function roundMotion(roundNumber: number) {
  const round = roundConfig(roundNumber)
  if (round?.motionOpened !== true) return ''
  const motions = round?.motions
  if (!Array.isArray(motions) || motions.length === 0) return ''
  return String(motions[0] ?? '').trim()
}

function roundConfig(roundNumber: number) {
  return visibleRounds.value.find((round) => Number(round.round) === Number(roundNumber))
}

function teamAllocationVisible(roundNumber: number) {
  const draw = drawForRound(roundNumber)
  if (typeof draw?.drawOpened === 'boolean') return draw.drawOpened
  return roundConfig(roundNumber)?.teamAllocationOpened !== false
}

function adjudicatorAllocationVisible(roundNumber: number) {
  const draw = drawForRound(roundNumber)
  if (typeof draw?.allocationOpened === 'boolean') return draw.allocationOpened
  return roundConfig(roundNumber)?.adjudicatorAllocationOpened !== false
}

function roundHasVisibleAllocation(roundNumber: number) {
  return teamAllocationVisible(roundNumber) || adjudicatorAllocationVisible(roundNumber)
}

function roundHasPartialAllocation(roundNumber: number) {
  const teamOpen = teamAllocationVisible(roundNumber)
  const adjudicatorOpen = adjudicatorAllocationVisible(roundNumber)
  return (teamOpen || adjudicatorOpen) && teamOpen !== adjudicatorOpen
}

function venuePriority(roundNumber: number, venueId?: string) {
  if (!venueId) return 1
  const venue = venuesStore.venues.find((item) => item._id === venueId)
  const detail = venue?.details?.find((d) => d.r === roundNumber)
  return detail?.priority ?? 1
}

function sortedAllocation(roundNumber: number) {
  const draw = drawForRound(roundNumber)
  const allocation = draw?.allocation ?? []
  return allocation
    .slice()
    .sort(
      (a: DrawAllocationRow, b: DrawAllocationRow) =>
        venuePriority(roundNumber, a.venue) - venuePriority(roundNumber, b.venue)
    )
}

function audienceSortValue(row: DrawAllocationRow, key: AudienceSortKey) {
  if (key === 'venue') return venueName(row.venue)
  if (key === 'gov') return teamName(row.teams?.gov)
  if (key === 'opp') return teamName(row.teams?.opp)
  return adjudicatorNames(row.chairs ?? [])
}

function audienceSortState(roundNumber: number): AudienceSortState {
  return audienceTableSortByRound.value[roundNumber] ?? { key: 'venue', direction: 'asc' }
}

function sortedAudienceTableAllocation(roundNumber: number) {
  const state = audienceSortState(roundNumber)
  return sortedAllocation(roundNumber)
    .map((row: DrawAllocationRow, index: number) => ({ row, index }))
    .sort((a: { row: DrawAllocationRow; index: number }, b: { row: DrawAllocationRow; index: number }) => {
      const left = audienceSortValue(a.row, state.key)
      const right = audienceSortValue(b.row, state.key)
      const diff = audienceSortCollator.compare(left, right)
      if (diff !== 0) {
        return state.direction === 'asc' ? diff : -diff
      }
      return a.index - b.index
    })
    .map((entry: { row: DrawAllocationRow; index: number }) => entry.row)
}

function setAudienceTableSort(roundNumber: number, key: AudienceSortKey) {
  const state = audienceSortState(roundNumber)
  if (state.key === key) {
    audienceTableSortByRound.value = {
      ...audienceTableSortByRound.value,
      [roundNumber]: {
        key,
        direction: state.direction === 'asc' ? 'desc' : 'asc',
      },
    }
    return
  }
  audienceTableSortByRound.value = {
    ...audienceTableSortByRound.value,
    [roundNumber]: {
      key,
      direction: 'asc',
    },
  }
}

function audienceSortIndicator(roundNumber: number, key: AudienceSortKey) {
  const state = audienceSortState(roundNumber)
  if (state.key !== key) return '↕'
  return state.direction === 'asc' ? '↑' : '↓'
}

function teamName(id?: string) {
  if (!id) return '—'
  return teamsStore.teams.find((team) => team._id === id)?.name ?? id
}

function adjudicatorNames(ids: string[]) {
  if (!ids || ids.length === 0) return '—'
  return ids
    .map((id) => adjudicatorsStore.adjudicators.find((adj) => adj._id === id)?.name ?? id)
    .join(', ')
}

function venueName(id?: string) {
  if (!id) return '—'
  return venuesStore.venues.find((venue) => venue._id === id)?.name ?? id
}

async function refresh() {
  if (!tournamentId.value) return
  await Promise.all([
    tournamentStore.fetchTournaments(),
    stylesStore.fetchStyles(),
    roundsStore.fetchRounds(tournamentId.value, { forcePublic: true }),
    drawsStore.fetchDraws(tournamentId.value, undefined, { forcePublic: true }),
    teamsStore.fetchTeams(tournamentId.value),
    adjudicatorsStore.fetchAdjudicators(tournamentId.value),
    speakersStore.fetchSpeakers(tournamentId.value),
    venuesStore.fetchVenues(tournamentId.value),
  ])
}

function audienceTeamQueryStorageKey() {
  if (!tournamentId.value) return ''
  return `utab:audience:${tournamentId.value}:team-query`
}

function loadAudienceTeamQueryFromStorage() {
  if (typeof window === 'undefined') return ''
  const key = audienceTeamQueryStorageKey()
  if (!key) return ''
  return localStorage.getItem(key) ?? ''
}

function persistAudienceTeamQuery() {
  if (typeof window === 'undefined' || !isAudience.value) return
  const key = audienceTeamQueryStorageKey()
  if (!key) return
  const query = audienceTeamQuery.value.trim()
  if (!query) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, query)
}

function resolveAudienceViewportMode() {
  if (typeof window === 'undefined') return 'table'
  return window.matchMedia('(max-width: 860px)').matches ? 'card' : 'table'
}

onMounted(() => {
  audienceViewportMode.value = resolveAudienceViewportMode()
  if (typeof window === 'undefined') return
  const media = window.matchMedia('(max-width: 860px)')
  const handleChange = () => {
    audienceViewportMode.value = media.matches ? 'card' : 'table'
  }
  handleChange()
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', handleChange)
    disposeAudienceViewportWatcher = () => media.removeEventListener('change', handleChange)
    return
  }
  media.addListener(handleChange)
  disposeAudienceViewportWatcher = () => media.removeListener(handleChange)
})

onUnmounted(() => {
  if (!disposeAudienceViewportWatcher) return
  disposeAudienceViewportWatcher()
  disposeAudienceViewportWatcher = null
})

watch(
  [participant, tournamentId],
  () => {
    if (!isAudience.value) {
      audienceTeamQuery.value = ''
      return
    }
    audienceTeamQuery.value = loadAudienceTeamQueryFromStorage()
  },
  { immediate: true }
)

watch(audienceTeamQuery, () => {
  persistAudienceTeamQuery()
})

watch(
  visibleRounds,
  (rounds) => {
    const next = { ...roundExpanded.value }
    const nextSort: Record<number, AudienceSortState> = {}
    rounds.forEach((round) => {
      if (next[round.round] === undefined) {
        next[round.round] = true
      }
      nextSort[round.round] = audienceTableSortByRound.value[round.round] ?? {
        key: 'venue',
        direction: 'asc',
      }
    })
    roundExpanded.value = next
    audienceTableSortByRound.value = nextSort
  },
  { immediate: true }
)

watch(
  [participant, judgeEvaluationActorOptions],
  () => {
    if (!isAdjudicator.value) return
    if (judgeEvaluationActorOptions.value.length === 0) return
    const current = judgeEvaluationActorMode.value
    if (judgeEvaluationActorOptions.value.some((option) => option.value === current)) return
    judgeEvaluationActorMode.value = judgeEvaluationActorOptions.value[0].value
  },
  { immediate: true }
)

watch(
  [judgeFeedbackTeamIdentityId, judgeFeedbackSelectableSpeakers, speakerSelectionRequired, judgeEvaluationActorMode],
  () => {
    if (!isAdjudicator.value || judgeEvaluationActorMode.value !== 'team') return
    if (!speakerSelectionRequired.value) {
      return
    }
    if (!judgeFeedbackTeamIdentityId.value) {
      judgeFeedbackSpeakerIdentityId.value = ''
      return
    }
    if (!judgeFeedbackSpeakerIdentityId.value) return
    const exists = judgeFeedbackSelectableSpeakers.value.some(
      (speaker) => speaker._id === judgeFeedbackSpeakerIdentityId.value
    )
    if (!exists) {
      judgeFeedbackSpeakerIdentityId.value = ''
    }
  },
  { immediate: true }
)

watch(
  [participant, judgeEvaluationActorMode, judgeFeedbackTeamOptions],
  () => {
    if (isAdjudicator.value && judgeEvaluationActorMode.value === 'team' && judgeFeedbackTeamIdentityId.value) {
      const exists = judgeFeedbackTeamOptions.value.some(
        (team) => team._id === judgeFeedbackTeamIdentityId.value
      )
      if (!exists) {
        judgeFeedbackTeamIdentityId.value = ''
      }
    }
  },
  { immediate: true }
)

watch(
  [participant, judgeEvaluationActorMode, adjudicatorIdentityOptions],
  () => {
    if (!isSpeaker.value && !(isAdjudicator.value && judgeEvaluationActorMode.value === 'adjudicator')) return
    if (!teamIdentityId.value) return
    const exists = adjudicatorIdentityOptions.value.some((adj) => adj._id === teamIdentityId.value)
    if (!exists) {
      teamIdentityId.value = ''
    }
  },
  { immediate: true }
)

watch(
  [tournamentId, participant],
  () => {
    refresh()
  },
  { immediate: true }
)
</script>

<style scoped>
select {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  background: #fff;
}

.error {
  color: #ef4444;
}

.participant-home-header {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.audience-tools {
  padding: var(--space-2);
  background: var(--color-surface);
}

.audience-team-input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 14px;
  background: #fff;
  width: 100%;
}

.pending-task-actions {
  gap: var(--space-2);
  flex-wrap: wrap;
}

.task-summary {
  margin-top: 2px;
}

.tight {
  gap: 4px;
}

.compact-round {
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
}

.round-visibility-note {
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
}

.round-visibility-title {
  font-size: 12px;
  color: var(--color-muted);
  font-weight: 600;
}

.round-visibility-chip-list {
  gap: 6px;
  flex-wrap: wrap;
}

.round-visibility-chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  padding: 0 8px;
  font-size: 12px;
  font-weight: 700;
}

.round-visibility-chip.is-open {
  color: #166534;
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.round-visibility-chip.is-closed {
  color: #9a3412;
  border-color: #fed7aa;
  background: #fff7ed;
}

.round-toggle {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.toggle-icon {
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-muted);
  transition: transform 0.16s ease;
}

.toggle-icon.open {
  transform: rotate(90deg);
}

.table-wrap {
  overflow-x: auto;
}

.draw-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.draw-table th,
.draw-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

.table-sort {
  border: none;
  background: transparent;
  font: inherit;
  font-weight: 600;
  color: inherit;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.sort-indicator {
  font-size: 11px;
  color: var(--color-muted);
}

.draw-table tbody tr:last-child td {
  border-bottom: none;
}

.draw-table tbody tr:nth-child(even) td {
  background: var(--color-surface-muted);
}

.draw-table tr.match-hit td {
  background: color-mix(in srgb, var(--color-secondary) 52%, white);
}

.draw-row {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  display: grid;
  gap: 6px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.draw-row.match-hit {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 28%, transparent);
}

.match-jump {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 44%, transparent);
}

.draw-chair-line {
  display: flex;
  gap: 6px;
  align-items: baseline;
  color: var(--color-text);
  font-size: 13px;
}

.draw-chair-label {
  font-weight: 700;
  color: var(--color-text);
}

.draw-chair-names {
  font-weight: 600;
  color: var(--color-text);
}

.compact-draw-list {
  gap: var(--space-2);
}

.draw-main {
  justify-content: space-between;
  align-items: center;
}

.draw-actions {
  gap: var(--space-1);
  flex-wrap: wrap;
}

.compact-draw-list .draw-actions {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.compact-draw-list .draw-actions :deep(.btn) {
  width: 100%;
  justify-content: center;
}

.draw-actions-cell {
  min-width: 180px;
}

.match-sides {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
}

.side-card {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 6px 8px;
  min-width: 0;
}

.side-card strong {
  font-size: 1rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gov-card {
  background: #eff6ff;
}

.opp-card {
  background: #fffbeb;
}

.side-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.vs-chip {
  font-size: 10px;
  color: var(--color-muted);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 1px 7px;
}

.tiny {
  font-size: 11px;
}

@media (max-width: 720px) {
  .match-sides {
    grid-template-columns: 1fr;
  }

  .vs-chip {
    justify-self: center;
  }
}
</style>
