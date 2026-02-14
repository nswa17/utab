<template>
  <section class="stack">
    <LoadingState v-if="isLoading" />
    <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>
    <div v-else-if="visibleRounds.length === 0" class="muted">
      {{ $t('ラウンドがまだありません。') }}
    </div>

    <div v-else class="stack">
      <div v-if="isSpeaker || isAdjudicator" class="card stack">
        <h4>{{ $t('あなたの情報') }}</h4>
        <label v-if="isSpeaker" class="field">
          <span>{{ $t('チーム') }}</span>
          <select v-model="teamIdentityId">
            <option value="">{{ $t('未選択') }}</option>
            <option v-for="team in teamsStore.teams" :key="team._id" :value="team._id">
              {{ team.name }}
            </option>
          </select>
        </label>
        <label v-if="isSpeaker && speakerSelectionRequired" class="field">
          <span>{{ $t('スピーカー') }}</span>
          <select
            v-model="speakerIdentityId"
            :disabled="!teamIdentityId || selectableSpeakers.length === 0"
          >
            <option value="">{{ $t('未選択') }}</option>
            <option v-for="speaker in selectableSpeakers" :key="speaker._id" :value="speaker._id">
              {{ speaker.name }}
            </option>
          </select>
        </label>
        <p v-if="isSpeaker && !teamIdentityId" class="muted">
          {{ $t('先にチームを選択してください。') }}
        </p>
        <p v-if="isSpeaker && speakerSelectionRequired && teamIdentityId && selectableSpeakers.length === 0" class="muted">
          {{ $t('このチームに選択可能なスピーカーがいません。') }}
        </p>
        <template v-if="isAdjudicator">
          <div class="stack">
            <span>{{ $t('ロール') }}</span>
            <div class="row role-switch" role="radiogroup" :aria-label="$t('ロール')">
              <label class="role-option">
                <input
                  type="radio"
                  :checked="adjudicatorRoleMode === 'adjudicator'"
                  @change="setAdjudicatorRoleMode('adjudicator')"
                />
                <span>{{ $t('ジャッジとして提出') }}</span>
              </label>
              <label class="role-option">
                <input
                  type="radio"
                  :checked="adjudicatorRoleMode === 'team'"
                  @change="setAdjudicatorRoleMode('team')"
                />
                <span>{{ adjudicatorTeamRoleLabel }}</span>
              </label>
            </div>
          </div>
          <label v-if="adjudicatorRoleMode === 'adjudicator'" class="field">
            <span>{{ $t('ジャッジ名') }}</span>
            <select v-model="teamIdentityId">
              <option value="">{{ $t('未選択') }}</option>
              <option v-for="adj in adjudicatorsStore.adjudicators" :key="adj._id" :value="adj._id">
                {{ adj.name }}
              </option>
            </select>
          </label>
          <label v-if="adjudicatorRoleMode === 'team'" class="field">
            <span>{{ $t('チーム名') }}</span>
            <select v-model="judgeFeedbackTeamIdentityId">
              <option value="">{{ $t('未選択') }}</option>
              <option v-for="team in teamsStore.teams" :key="team._id" :value="team._id">
                {{ team.name }}
              </option>
            </select>
          </label>
          <label v-if="adjudicatorRoleMode === 'team' && judgeFeedbackSpeakerSelectionRequired" class="field">
            <span>{{ $t('スピーカー名') }}</span>
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
          <p
            v-if="
              adjudicatorRoleMode === 'team' &&
              judgeFeedbackSpeakerSelectionRequired &&
              !judgeFeedbackTeamIdentityId
            "
            class="muted"
          >
            {{ $t('先にチームを選択してください。') }}
          </p>
          <p
            v-if="
              adjudicatorRoleMode === 'team' &&
              judgeFeedbackSpeakerSelectionRequired &&
              judgeFeedbackTeamIdentityId &&
              judgeFeedbackSelectableSpeakers.length === 0
            "
            class="muted"
          >
            {{ $t('このチームに選択可能なスピーカーがいません。') }}
          </p>
        </template>
      </div>

      <template v-if="isAudience">
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
            <div v-if="!drawForRound(round.round) || !teamAllocationVisible(round.round)" class="muted">
              {{ $t('ドローは未公開です。') }}
            </div>
            <div v-else-if="sortedAllocation(round.round).length === 0" class="muted">
              {{ $t('ドローが登録されていません。') }}
            </div>
            <div v-else-if="audienceViewMode === 'card'" class="stack compact-draw-list">
              <div
                v-for="(row, index) in sortedAllocation(round.round)"
                :key="`${round.round}-${index}`"
                class="draw-row"
              >
                <div class="row draw-main">
                  <span class="venue-pill">{{ venueName(row.venue) }}</span>
                  <span class="muted tiny">#{{ index + 1 }}</span>
                </div>
                <div class="match-sides">
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
                    <th>
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
                    <th>
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
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, index) in sortedAudienceTableAllocation(round.round)"
                    :key="`table-${round.round}-${index}`"
                  >
                    <td>{{ venueName(row.venue) }}</td>
                    <td>{{ teamName(row.teams.gov) }}</td>
                    <td>{{ teamName(row.teams.opp) }}</td>
                    <td v-if="adjudicatorAllocationVisible(round.round)">
                      {{ adjudicatorNames(row.chairs) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="card stack">
          <h4>{{ $t('タスク一覧') }}</h4>
          <p v-if="tasks.length === 0" class="muted">{{ tasksHint }}</p>
          <div v-else class="stack task-groups">
            <section
              v-for="group in taskGroups"
              :key="group.round"
              class="card soft stack task-group-card"
            >
              <h5 class="task-group-title">{{ group.label }}</h5>
              <ul class="list compact task-list">
                <li v-for="task in group.items" :key="task.id" class="list-item task-item">
                  <div class="stack tight">
                    <strong>{{ task.title }}</strong>
                    <span class="muted small">{{ task.statusLabel }}</span>
                    <span v-if="task.description" class="muted small">{{ task.description }}</span>
                  </div>
                  <Button
                    :variant="task.completed ? 'secondary' : 'primary'"
                    size="sm"
                    class="task-action"
                    :to="task.to"
                  >
                    {{ task.actionLabel }}
                  </Button>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
import { useSubmissionsStore } from '@/stores/submissions'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'
import { useParticipantIdentity } from '@/composables/useParticipantIdentity'
import { getSideShortLabel } from '@/utils/side-labels'
import type { Draw, DrawAllocationRow } from '@/types/draw'

type TaskItem = {
  id: string
  round: number
  title: string
  description?: string
  completed: boolean
  statusLabel: string
  actionLabel: string
  to: string
}

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
const submissionsStore = useSubmissionsStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const participant = computed(() => route.params.participant as string)

const { identityId: teamIdentityId } = useParticipantIdentity(tournamentId, participant)
const { identityId: speakerIdentityId } = useParticipantIdentity(tournamentId, participant, 'speaker')
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

const selectableSpeakers = computed(() => {
  if (!isSpeaker.value || !teamIdentityId.value) return []
  return speakersForTeam(teamIdentityId.value)
})

const speakerSelectionRequired = computed(() => {
  if (!isSpeaker.value) return false
  return visibleRounds.value.some((round) => {
    const userDefined = round.userDefinedData ?? {}
    return (
      userDefined.evaluate_from_teams !== false &&
      (userDefined.evaluator_in_team ?? 'team') === 'speaker'
    )
  })
})

const judgeFeedbackSpeakerSelectionRequired = computed(() =>
  visibleRounds.value.some((round) => {
    const userDefined = round.userDefinedData ?? {}
    return (
      userDefined.evaluate_from_teams !== false &&
      (userDefined.evaluator_in_team ?? 'team') === 'speaker'
    )
  })
)
const adjudicatorRoleMode = ref<'adjudicator' | 'team'>('adjudicator')
const adjudicatorTeamRoleLabel = computed(() =>
  judgeFeedbackSpeakerSelectionRequired.value ? t('スピーカーとして提出') : t('チームとして提出')
)

const judgeFeedbackSelectableSpeakers = computed(() => {
  if (!judgeFeedbackTeamIdentityId.value) return []
  return speakersForTeam(judgeFeedbackTeamIdentityId.value)
})

function setAdjudicatorRoleMode(mode: 'adjudicator' | 'team') {
  adjudicatorRoleMode.value = mode
}

const isLoading = computed(
  () =>
    tournamentStore.loading ||
    stylesStore.loading ||
    roundsStore.loading ||
    drawsStore.loading ||
    teamsStore.loading ||
    adjudicatorsStore.loading ||
    speakersStore.loading ||
    venuesStore.loading ||
    submissionsStore.loading
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
    submissionsStore.error ||
    ''
)

const roundExpanded = ref<Record<number, boolean>>({})
type AudienceSortKey = 'venue' | 'gov' | 'opp' | 'chair'
type AudienceSortDirection = 'asc' | 'desc'
type AudienceSortState = { key: AudienceSortKey; direction: AudienceSortDirection }
const audienceTableSortByRound = ref<Record<number, AudienceSortState>>({})
const audienceViewMode = computed<'card' | 'table'>(() => {
  if (route.query.viewMode === 'table') return 'table'
  if (route.query.viewMode === 'card') return 'card'
  return teamsStore.teams.length >= 20 ? 'table' : 'card'
})
const audienceSortCollator = new Intl.Collator(['ja', 'en'], { numeric: true, sensitivity: 'base' })

const feedbackSubmittedKeySet = computed(() => {
  const set = new Set<string>()
  submissionsStore.submissions.forEach((item) => {
    if (item.type !== 'feedback') return
    const submittedEntityId = String((item.payload as any)?.submittedEntityId ?? '')
    if (!submittedEntityId) return
    set.add(`${Number(item.round)}:${submittedEntityId}`)
  })
  return set
})

const ballotSubmittedKeySet = computed(() => {
  const set = new Set<string>()
  submissionsStore.submissions.forEach((item) => {
    if (item.type !== 'ballot') return
    const submittedEntityId = String((item.payload as any)?.submittedEntityId ?? '')
    if (!submittedEntityId) return
    set.add(`${Number(item.round)}:${submittedEntityId}`)
  })
  return set
})

const identityReadyForTasks = computed(() => {
  if (isSpeaker.value) {
    return Boolean(teamIdentityId.value)
  }
  if (isAdjudicator.value) {
    if (adjudicatorRoleMode.value === 'adjudicator') {
      return Boolean(teamIdentityId.value)
    }
    return Boolean(judgeFeedbackTeamIdentityId.value || judgeFeedbackSpeakerIdentityId.value)
  }
  return false
})

const activeSubmittedEntityId = computed(() => {
  if (isSpeaker.value) {
    return teamIdentityId.value
  }
  if (isAdjudicator.value) {
    return teamIdentityId.value
  }
  return ''
})

const tasks = computed<TaskItem[]>(() => {
  if (isAudience.value) return []
  if (!identityReadyForTasks.value) return []

  const list: TaskItem[] = []
  visibleRounds.value.forEach((roundItem) => {
    const roundNumber = Number(roundItem.round)
    const draw = drawsByRound.value.get(roundNumber)
    const teamOpen = teamAllocationVisible(roundNumber)
    const adjudicatorOpen = adjudicatorAllocationVisible(roundNumber)
    if (!draw || !teamOpen) return
    const allocation = Array.isArray(draw.allocation) ? draw.allocation : []

    if (isSpeaker.value) {
      const teamId = teamIdentityId.value
      const teamRows = allocation.filter(
        (row: any) => row?.teams?.gov === teamId || row?.teams?.opp === teamId
      )
      const hasAssignedMatch = teamRows.length > 0
      if (!hasAssignedMatch) return
      if (!adjudicatorOpen) return
      if (roundItem.userDefinedData?.evaluate_from_teams === false) return
      const evaluatorInTeam = roundItem.userDefinedData?.evaluator_in_team ?? 'team'
      const submittedEntityId = evaluatorInTeam === 'speaker' ? speakerIdentityId.value : teamId
      if (!submittedEntityId) return
      const chairsOnly = roundItem.userDefinedData?.chairs_always_evaluated === true
      const teamJudgeIds = Array.from(
        new Set(
          teamRows.flatMap((row: any) =>
            chairsOnly ? [...(row.chairs ?? [])] : [...(row.chairs ?? []), ...(row.panels ?? [])]
          )
        )
      )
      const targetPath =
        teamJudgeIds.length === 1
          ? `/user/${tournamentId.value}/speaker/rounds/${roundNumber}/feedback/${teamJudgeIds[0]}?filter=team&actor=team`
          : `/user/${tournamentId.value}/speaker/rounds/${roundNumber}/feedback/home?filter=team&actor=team`
      const completed = feedbackSubmittedKeySet.value.has(
        `${roundNumber}:${submittedEntityId}`
      )

      list.push({
        id: `speaker-feedback-${roundNumber}-${evaluatorInTeam}`,
        round: roundNumber,
        title: t('ジャッジ評価'),
        completed,
        statusLabel: completed ? t('完了') : t('未完了'),
        actionLabel: completed ? t('修正して送信') : t('入力'),
        to: targetPath,
      })
      return
    }

    if (isAdjudicator.value) {
      if (!adjudicatorOpen) return
      if (adjudicatorRoleMode.value === 'adjudicator') {
        const adjudicatorId = teamIdentityId.value
        const adjudicatorRows = adjudicatorId
          ? allocation.filter((row: any) =>
              [...(row.chairs ?? []), ...(row.panels ?? []), ...(row.trainees ?? [])].includes(
                adjudicatorId
              )
            )
          : []
        const hasJudgeAssignedMatch = adjudicatorRows.length > 0
        if (hasJudgeAssignedMatch) {
          const ballotTargetPath =
            adjudicatorRows.length === 1
              ? `/user/${tournamentId.value}/adjudicator/rounds/${roundNumber}/ballot/entry?teamA=${adjudicatorRows[0]?.teams?.gov ?? ''}&teamB=${adjudicatorRows[0]?.teams?.opp ?? ''}`
              : `/user/${tournamentId.value}/adjudicator/rounds/${roundNumber}/ballot/home`
          const ballotCompleted = ballotSubmittedKeySet.value.has(`${roundNumber}:${adjudicatorId}`)
          list.push({
            id: `adjudicator-ballot-${roundNumber}`,
            round: roundNumber,
            title: t('スコアシート'),
            description: t('ドローから試合を選択'),
            completed: ballotCompleted,
            statusLabel: ballotCompleted ? t('完了') : t('未完了'),
            actionLabel: ballotCompleted ? t('修正して送信') : t('入力'),
            to: ballotTargetPath,
          })
        }

        if (
          hasJudgeAssignedMatch &&
          roundItem.userDefinedData?.evaluate_from_adjudicators !== false
        ) {
          const feedbackPeers = Array.from(
            new Set(
              adjudicatorRows.flatMap((row: any) =>
                [...(row.chairs ?? []), ...(row.panels ?? []), ...(row.trainees ?? [])].filter(
                  (id: string) => id !== adjudicatorId
                )
              )
            )
          )
          const feedbackTargetPath =
            feedbackPeers.length === 1
              ? `/user/${tournamentId.value}/adjudicator/rounds/${roundNumber}/feedback/${feedbackPeers[0]}?filter=adjudicator&actor=adjudicator`
              : `/user/${tournamentId.value}/adjudicator/rounds/${roundNumber}/feedback/home?filter=adjudicator&actor=adjudicator`
          const feedbackCompleted = feedbackSubmittedKeySet.value.has(
            `${roundNumber}:${adjudicatorId}`
          )
          list.push({
            id: `adjudicator-feedback-${roundNumber}`,
            round: roundNumber,
            title: t('ジャッジ評価（ジャッジ）'),
            completed: feedbackCompleted,
            statusLabel: feedbackCompleted ? t('完了') : t('未完了'),
            actionLabel: feedbackCompleted ? t('修正して送信') : t('入力'),
            to: feedbackTargetPath,
          })
        }
      }

      if (adjudicatorRoleMode.value === 'team' && roundItem.userDefinedData?.evaluate_from_teams !== false) {
        const teamId = judgeFeedbackTeamIdentityId.value
        const teamRows = teamId
          ? allocation.filter(
              (row: any) => row?.teams?.gov === teamId || row?.teams?.opp === teamId
            )
          : []
        const hasTeamAssignedMatch = teamRows.length > 0
        if (!hasTeamAssignedMatch) return
        const evaluatorInTeam = roundItem.userDefinedData?.evaluator_in_team ?? 'team'
        const submittedEntityId =
          evaluatorInTeam === 'speaker'
            ? judgeFeedbackSpeakerIdentityId.value
            : judgeFeedbackTeamIdentityId.value
        if (!submittedEntityId) return
        const chairsOnly = roundItem.userDefinedData?.chairs_always_evaluated === true
        const teamJudgeIds = Array.from(
          new Set(
            teamRows.flatMap((row: any) =>
              chairsOnly ? [...(row.chairs ?? [])] : [...(row.chairs ?? []), ...(row.panels ?? [])]
            )
          )
        )
        const targetPath =
          teamJudgeIds.length === 1
            ? `/user/${tournamentId.value}/adjudicator/rounds/${roundNumber}/feedback/${teamJudgeIds[0]}?filter=team&actor=team`
            : `/user/${tournamentId.value}/adjudicator/rounds/${roundNumber}/feedback/home?filter=team&actor=team`
        const feedbackCompleted = feedbackSubmittedKeySet.value.has(
          `${roundNumber}:${submittedEntityId}`
        )
        list.push({
          id: `team-feedback-via-adjudicator-${roundNumber}-${evaluatorInTeam}`,
          round: roundNumber,
          title: t('ジャッジ評価（チーム）'),
          completed: feedbackCompleted,
          statusLabel: feedbackCompleted ? t('完了') : t('未完了'),
          actionLabel: feedbackCompleted ? t('修正して送信') : t('入力'),
          to: targetPath,
        })
      }
    }
  })

  return list
})

const taskGroups = computed(() => {
  const map = new Map<number, TaskItem[]>()
  tasks.value.forEach((task) => {
    const list = map.get(task.round) ?? []
    list.push(task)
    map.set(task.round, list)
  })
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([roundNumber, items]) => ({
      round: roundNumber,
      label:
        visibleRounds.value.find((round) => Number(round.round) === Number(roundNumber))?.name ??
        t('ラウンド {round}', { round: roundNumber }),
      items,
    }))
})

const tasksHint = computed(() => {
  if (!identityReadyForTasks.value) {
    return t('タスク一覧を表示するには「あなたの情報」を選択してください。')
  }
  if (isSpeaker.value && speakerSelectionRequired.value && !speakerIdentityId.value) {
    return t('参加者ホームでスピーカーを選択すると、評価対象を絞り込めます。')
  }
  if (
    isAdjudicator.value &&
    judgeFeedbackSpeakerSelectionRequired.value &&
    judgeFeedbackTeamIdentityId.value &&
    !judgeFeedbackSpeakerIdentityId.value
  ) {
    return t('ジャッジ評価でスピーカー単位を使うラウンドでは、スピーカーを選択してください。')
  }
  return t('タスクはありません。')
})

function isRoundExpanded(roundNumber: number) {
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
  return roundConfig(roundNumber)?.teamAllocationOpened !== false
}

function adjudicatorAllocationVisible(roundNumber: number) {
  return roundConfig(roundNumber)?.adjudicatorAllocationOpened !== false
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
  if (key === 'gov') return teamName(row.teams.gov)
  if (key === 'opp') return teamName(row.teams.opp)
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

function teamName(id: string) {
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
  await refreshTaskSubmissions()
}

async function refreshTaskSubmissions() {
  if (!tournamentId.value || isAudience.value) {
    submissionsStore.clearSubmissions()
    return
  }
  if (isSpeaker.value) {
    const ids = [teamIdentityId.value]
    if (speakerSelectionRequired.value && speakerIdentityId.value) {
      ids.push(speakerIdentityId.value)
    }
    const normalizedIds = Array.from(new Set(ids.map((id) => String(id)).filter(Boolean)))
    if (normalizedIds.length === 0) {
      submissionsStore.clearSubmissions()
      return
    }
    const merged = new Map<string, any>()
    for (const entityId of normalizedIds) {
      const rows = await submissionsStore.fetchParticipantSubmissions({
        tournamentId: tournamentId.value,
        submittedEntityId: entityId,
      })
      rows.forEach((item) => {
        merged.set(item._id, item)
      })
    }
    submissionsStore.submissions = Array.from(merged.values())
    return
  }
  if (isAdjudicator.value) {
    const ids =
      adjudicatorRoleMode.value === 'adjudicator'
        ? [teamIdentityId.value]
        : [judgeFeedbackTeamIdentityId.value]
    if (
      adjudicatorRoleMode.value === 'team' &&
      judgeFeedbackSpeakerSelectionRequired.value &&
      judgeFeedbackSpeakerIdentityId.value
    ) {
      ids.push(judgeFeedbackSpeakerIdentityId.value)
    }
    const normalizedIds = Array.from(new Set(ids.map((id) => String(id)).filter(Boolean)))
    if (normalizedIds.length === 0) {
      submissionsStore.clearSubmissions()
      return
    }
    const merged = new Map<string, any>()
    for (const entityId of normalizedIds) {
      const rows = await submissionsStore.fetchParticipantSubmissions({
        tournamentId: tournamentId.value,
        submittedEntityId: entityId,
      })
      rows.forEach((item) => {
        merged.set(item._id, item)
      })
    }
    submissionsStore.submissions = Array.from(merged.values())
    return
  }
  if (!activeSubmittedEntityId.value) {
    submissionsStore.clearSubmissions()
    return
  }
  await submissionsStore.fetchParticipantSubmissions({
    tournamentId: tournamentId.value,
    submittedEntityId: activeSubmittedEntityId.value,
  })
}

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
  [teamIdentityId, selectableSpeakers, speakerSelectionRequired],
  () => {
    if (!isSpeaker.value) return
    if (!speakerSelectionRequired.value) {
      return
    }
    if (!teamIdentityId.value) {
      speakerIdentityId.value = ''
      return
    }
    if (!speakerIdentityId.value) return
    const exists = selectableSpeakers.value.some((speaker) => speaker._id === speakerIdentityId.value)
    if (!exists) {
      speakerIdentityId.value = ''
    }
  },
  { immediate: true }
)

watch(
  [judgeFeedbackTeamIdentityId, judgeFeedbackSelectableSpeakers, judgeFeedbackSpeakerSelectionRequired],
  () => {
    if (!isAdjudicator.value) return
    if (!judgeFeedbackSpeakerSelectionRequired.value) {
      judgeFeedbackSpeakerIdentityId.value = ''
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
  [participant, () => teamsStore.teams],
  () => {
    if (isSpeaker.value && teamIdentityId.value) {
      const exists = teamsStore.teams.some((team) => team._id === teamIdentityId.value)
      if (!exists) {
        teamIdentityId.value = ''
      }
    }
    if (isAdjudicator.value && judgeFeedbackTeamIdentityId.value) {
      const exists = teamsStore.teams.some((team) => team._id === judgeFeedbackTeamIdentityId.value)
      if (!exists) {
        judgeFeedbackTeamIdentityId.value = ''
      }
    }
  },
  { immediate: true, deep: true }
)

watch(
  [participant, () => adjudicatorsStore.adjudicators],
  () => {
    if (!isAdjudicator.value) return
    if (!teamIdentityId.value) return
    const exists = adjudicatorsStore.adjudicators.some((adj) => adj._id === teamIdentityId.value)
    if (!exists) {
      teamIdentityId.value = ''
    }
  },
  { immediate: true, deep: true }
)

watch([activeSubmittedEntityId, speakerIdentityId, speakerSelectionRequired], () => {
  refreshTaskSubmissions()
})

watch(adjudicatorRoleMode, (mode) => {
  if (!isAdjudicator.value) return
  if (mode === 'adjudicator') {
    judgeFeedbackTeamIdentityId.value = ''
    judgeFeedbackSpeakerIdentityId.value = ''
    return
  }
  teamIdentityId.value = ''
})

watch(
  [judgeFeedbackTeamIdentityId, judgeFeedbackSpeakerIdentityId, judgeFeedbackSpeakerSelectionRequired],
  () => {
    refreshTaskSubmissions()
  }
)

watch(
  [participant, tournamentId, () => teamsStore.teams.length, () => route.query.viewMode],
  () => {
    if (!isAdjudicator.value) {
      adjudicatorRoleMode.value = 'adjudicator'
    }
    if (!isAudience.value) return
    if (route.query.viewMode === 'card' || route.query.viewMode === 'table') return
    router.replace({
      query: {
        ...route.query,
        viewMode: 'table',
      },
    })
  },
  { immediate: true }
)

watch(
  [isAdjudicator, teamIdentityId, judgeFeedbackTeamIdentityId],
  () => {
    if (!isAdjudicator.value) {
      adjudicatorRoleMode.value = 'adjudicator'
      return
    }
    if (teamIdentityId.value) {
      adjudicatorRoleMode.value = 'adjudicator'
      return
    }
    if (judgeFeedbackTeamIdentityId.value) {
      adjudicatorRoleMode.value = 'team'
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

.task-list {
  display: grid;
  gap: var(--space-2);
}

.task-groups {
  gap: var(--space-2);
}

.task-group-card {
  border: 1px solid var(--color-border);
  padding: var(--space-2);
}

.task-group-title {
  margin: 0;
  font-size: 14px;
}

.task-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
}

.task-action {
  min-width: 120px;
}

.tight {
  gap: 4px;
}

.role-switch {
  gap: var(--space-2);
  flex-wrap: wrap;
}

.role-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--color-surface);
  font-size: 12px;
  color: var(--color-text);
}

.compact-round {
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
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

.draw-row {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: 10px 12px;
  display: grid;
  gap: 8px;
}

.draw-chair-line {
  display: flex;
  gap: 6px;
  align-items: baseline;
  border-top: 1px solid var(--color-border);
  padding-top: 8px;
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
  gap: var(--space-3);
}

.draw-main {
  justify-content: space-between;
  align-items: center;
}

.venue-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-text);
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 600;
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
  background: var(--color-surface);
  padding: 8px 10px;
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
  border-color: var(--color-primary);
}

.opp-card {
  border-style: dashed;
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
  background: var(--color-surface-muted);
  border-radius: 999px;
  padding: 2px 8px;
  font-weight: 700;
}

.tiny {
  font-size: 11px;
}

@media (max-width: 720px) {
  .task-item {
    grid-template-columns: 1fr;
  }

  .match-sides {
    grid-template-columns: 1fr;
  }

  .vs-chip {
    justify-self: center;
  }
}
</style>
