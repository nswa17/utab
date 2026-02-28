<template>
  <section class="stack">
    <LoadingState v-if="adjudicators.loading" />
    <p v-else-if="adjudicators.error" class="error">{{ adjudicators.error }}</p>

    <div v-else class="stack">
      <div class="card stack identity-panel">
        <div class="row identity-head">
          <h4 class="identity-panel-title">{{ $t('あなたの情報') }}</h4>
          <span class="identity-kind-chip identity-kind-judge">{{ $t('ジャッジ評価') }}</span>
        </div>
        <label v-if="showActorModeSelector" class="stack">
          <span class="muted small">{{ $t('評価者') }}</span>
          <select v-model="actorModeSelection">
            <option v-for="option in actorOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="stack">
          <span class="muted small">{{ $t('評価対象ジャッジ') }}</span>
          <select v-model="selectedTargetJudgeId" :disabled="targetJudgeOptions.length === 0">
            <option value="">{{ $t('未選択') }}</option>
            <option v-for="option in targetJudgeOptions" :key="option.id" :value="option.id">
              {{ option.name }}
            </option>
          </select>
        </label>
        <label v-if="showTeamActorSelection" class="stack">
          <span class="muted small">{{ $t('チーム') }}</span>
          <select v-model="teamActorIdentityId" :disabled="teamActorOptions.length === 0">
            <option value="">{{ $t('未選択') }}</option>
            <option v-for="team in teamActorOptions" :key="team._id" :value="team._id">
              {{ team.name }}
            </option>
          </select>
        </label>
        <label v-if="showTeamActorSelection && speakerSelectionRequired" class="stack">
          <span class="muted small">{{ $t('スピーカー') }}</span>
          <select
            v-model="speakerActorIdentityId"
            :disabled="!teamActorIdentityId || teamActorSpeakerOptions.length === 0"
          >
            <option value="">{{ $t('未選択') }}</option>
            <option v-for="speaker in teamActorSpeakerOptions" :key="speaker._id" :value="speaker._id">
              {{ speaker.name }}
            </option>
          </select>
        </label>
        <label v-if="showAdjudicatorActorSelection" class="stack">
          <span class="muted small">{{ $t('ジャッジ名') }}</span>
          <select v-model="teamIdentityId" :disabled="adjudicatorIdentityOptions.length === 0">
            <option value="">{{ $t('未選択') }}</option>
            <option v-for="adj in adjudicatorIdentityOptions" :key="adj._id" :value="adj._id">
              {{ adj.name }}
            </option>
          </select>
        </label>
        <p class="identity-line">
          <span class="muted small">{{ $t('提出主体') }}</span>
          <strong>{{ selectedIdentityTypeLabel }} / {{ selectedIdentityName }}</strong>
        </p>
        <p v-if="!identityReady" class="muted">{{ identityHint }}</p>
      </div>

      <div v-if="judge" class="card stack">
        <h4>{{ judge.name }}</h4>
        <p class="muted">{{ $t('ジャッジのフィードバックを入力してください。') }}</p>
        <Field v-if="useMatterManner" :label="$t('Matter')" v-slot="{ id, describedBy }">
          <input
            v-model.number="matter"
            :id="id"
            :aria-describedby="describedBy"
            type="number"
            :min="range.from"
            :max="range.to"
            :step="range.unit"
          />
        </Field>
        <Field v-if="useMatterManner" :label="$t('Manner')" v-slot="{ id, describedBy }">
          <input
            v-model.number="manner"
            :id="id"
            :aria-describedby="describedBy"
            type="number"
            :min="range.from"
            :max="range.to"
            :step="range.unit"
          />
        </Field>
        <Field v-if="!useMatterManner" :label="$t('スコア')" v-slot="{ id, describedBy }">
          <input
            v-model.number="score"
            :id="id"
            :aria-describedby="describedBy"
            type="number"
            :min="range.from"
            :max="range.to"
            :step="range.unit"
          />
        </Field>
        <p class="muted small">
          {{
            $t('入力範囲: {from}〜{to} (刻み {unit})', {
              from: range.from,
              to: range.to,
              unit: range.unit,
            })
          }}
        </p>
        <Field :label="$t('コメント')" v-slot="{ id, describedBy }">
          <textarea v-model="comment" :id="id" :aria-describedby="describedBy" rows="4" />
        </Field>

        <Button :loading="submissions.loading" @click="requestSubmit">
          {{ $t('送信') }}
        </Button>
        <p v-if="submitError" class="error">{{ submitError }}</p>
        <p v-if="saved" class="muted">{{ $t('送信しました。') }}</p>
      </div>

      <div v-else class="card stack">
        <p class="muted">
          {{
            targetJudgeOptions.length === 0
              ? $t('対象のジャッジが見つかりません。')
              : $t('評価対象ジャッジを選択してください。')
          }}
        </p>
        <Button variant="ghost" size="sm" :to="homePath">{{ $t('大会トップに戻る') }}</Button>
      </div>
    </div>

    <div v-if="confirmOpen" class="modal-backdrop" role="presentation">
      <div class="modal card stack" role="dialog" aria-modal="true">
        <h4>{{ $t('送信前の確認') }}</h4>
        <p class="muted">{{ $t('内容を確認してから送信してください。') }}</p>
        <div class="confirm-grid">
          <div class="confirm-card stack">
            <span class="muted small">{{ $t('評価タイプ') }}</span>
            <strong>{{ $t('ジャッジ評価') }}</strong>
          </div>
          <div class="confirm-card stack">
            <span class="muted small">{{ $t('あなたの情報') }}</span>
            <strong>{{ selectedIdentityName }}</strong>
            <span class="muted small">{{ selectedIdentityTypeLabel }}</span>
          </div>
          <div class="confirm-card stack">
            <span class="muted small">{{ $t('評価対象ジャッジ') }}</span>
            <strong>{{ judge?.name ?? '—' }}</strong>
          </div>
          <div class="confirm-card stack">
            <span class="muted small">{{ $t('スコア') }}</span>
            <strong>{{ computedScore }}</strong>
          </div>
          <div class="confirm-card stack full confirm-comment">
            <span class="muted small">{{ $t('コメント') }}</span>
            <span>{{ comment.trim() || $t('なし') }}</span>
          </div>
        </div>
        <div class="row">
          <Button variant="ghost" size="sm" @click="closeConfirm">{{ $t('戻る') }}</Button>
          <Button
            size="sm"
            :loading="submissions.loading"
            :disabled="confirmCountdown > 0 || submissions.loading"
            @click="submitConfirmed"
          >
            {{ confirmButtonLabel }}
          </Button>
        </div>
        <p v-if="submissions.error" class="error">{{ submissions.error }}</p>
      </div>
    </div>

    <div v-if="successOpen" class="modal-backdrop" role="presentation">
      <div class="modal card stack success-modal" role="dialog" aria-modal="true">
        <h4>{{ $t('送信完了') }}</h4>
        <div class="row success-actions">
          <Button variant="ghost" size="sm" class="optional-back-action" @click="goToDraw">{{
            $t('対戦表に戻る')
          }}</Button>
          <Button size="sm" @click="goToTournamentHome">{{ $t('大会トップに戻る') }}</Button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { useRoundsStore } from '@/stores/rounds'
import { useSubmissionsStore } from '@/stores/submissions'
import { useTournamentStore } from '@/stores/tournament'
import { useStylesStore } from '@/stores/styles'
import { useTeamsStore } from '@/stores/teams'
import { useSpeakersStore } from '@/stores/speakers'
import { useDrawsStore } from '@/stores/draws'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import { defaultAdjudicatorRange, normalizeSingleRange } from '@/utils/score'
import { useParticipantIdentity } from '@/composables/useParticipantIdentity'
import { useParticipantMode, appendParticipantMode } from '@/composables/useParticipantMode'

const route = useRoute()
const router = useRouter()
const adjudicators = useAdjudicatorsStore()
const rounds = useRoundsStore()
const submissions = useSubmissionsStore()
const tournamentStore = useTournamentStore()
const stylesStore = useStylesStore()
const teamsStore = useTeamsStore()
const speakersStore = useSpeakersStore()
const drawsStore = useDrawsStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const { participantMode } = useParticipantMode(route)
const round = computed(() => route.params.round as string)
const adjudicatorId = computed(() => route.params.adjudicatorId as string)
const { identityId: teamIdentityId } = useParticipantIdentity(tournamentId, participantMode)
const { identityId: speakerIdentityId } = useParticipantIdentity(
  tournamentId,
  participantMode,
  'speaker'
)
const { identityId: judgeFeedbackTeamIdentityId } = useParticipantIdentity(
  tournamentId,
  participantMode,
  'team-feedback-team'
)
const { identityId: judgeFeedbackSpeakerIdentityId } = useParticipantIdentity(
  tournamentId,
  participantMode,
  'team-feedback-speaker'
)
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

function uniqueIds(values: Array<string | undefined | null>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )
  )
}

function rowJudgeTargetIds(row: any) {
  return uniqueIds([...(row?.chairs ?? []), ...(row?.panels ?? [])])
}

function rowAdjudicatorIds(row: any) {
  return uniqueIds([...(row?.chairs ?? []), ...(row?.panels ?? []), ...(row?.trainees ?? [])])
}

function speakersForTeam(teamId: string) {
  if (!teamId) return []
  const team = teamsStore.teams.find((item) => item._id === teamId)
  if (!team) return []
  const detailSpeakerIds = new Set<string>()
  ;(team.details ?? []).forEach((detail: any) => {
    if (Number(detail?.r) !== Number(round.value)) return
    ;(detail?.speakers ?? []).forEach((id: any) => {
      if (id) detailSpeakerIds.add(String(id))
    })
  })
  if (detailSpeakerIds.size > 0) {
    return speakersStore.speakers.filter((speaker) => detailSpeakerIds.has(speaker._id))
  }
  const templateSpeakerIds = new Set<string>(
    (team.template?.speakers ?? []).map((id: any) => String(id ?? '')).filter(Boolean)
  )
  return speakersStore.speakers.filter((speaker) => templateSpeakerIds.has(speaker._id))
}

const actorMode = computed<'team' | 'adjudicator'>(() => {
  if (participantMode.value === 'speaker') return 'team'
  if (typeof route.query.actor === 'string' && route.query.actor === 'team') return 'team'
  return 'adjudicator'
})
const actorModeSelection = computed<'adjudicator' | 'team'>({
  get: () => (actorMode.value === 'team' ? 'team' : 'adjudicator'),
  set: (mode) => {
    setActorMode(mode)
  },
})
const showActorModeSelector = computed(
  () => participantMode.value === 'adjudicator' && actorOptions.value.length > 1
)
const showTeamActorSelection = computed(
  () => participantMode.value === 'speaker' || actorMode.value === 'team'
)
const showAdjudicatorActorSelection = computed(
  () => participantMode.value === 'adjudicator' && actorMode.value === 'adjudicator'
)

const queryTeamGovId = computed(() =>
  typeof route.query.teamGov === 'string' ? route.query.teamGov.trim() : ''
)
const queryTeamOppId = computed(() =>
  typeof route.query.teamOpp === 'string' ? route.query.teamOpp.trim() : ''
)
const roundDraw = computed(() =>
  drawsStore.draws.find((item) => Number(item.round) === Number(round.value))
)
const drawRowForContext = computed(() => {
  const allocation = roundDraw.value?.allocation ?? []
  if (queryTeamGovId.value && queryTeamOppId.value) {
    const expected = [queryTeamGovId.value, queryTeamOppId.value].sort()
    const byTeams =
      allocation.find((row) => {
        const current = uniqueIds([row?.teams?.gov, row?.teams?.opp]).sort()
        return current.length === 2 && current[0] === expected[0] && current[1] === expected[1]
      }) ?? null
    if (byTeams) return byTeams
  }
  return (
    allocation.find((row) => rowJudgeTargetIds(row).includes(adjudicatorId.value)) ?? null
  )
})
const contextTeamIds = computed(() => {
  const row = drawRowForContext.value
  if (row) return uniqueIds([row?.teams?.gov, row?.teams?.opp])
  return uniqueIds([queryTeamGovId.value, queryTeamOppId.value])
})
const contextTeamIdSet = computed(() => new Set(contextTeamIds.value))
const teamActorOptions = computed(() => {
  if (contextTeamIdSet.value.size === 0) return teamsStore.teams
  return teamsStore.teams.filter((team) => contextTeamIdSet.value.has(team._id))
})

const queryTargetJudgeIds = computed(() => parseQueryList(route.query.targets))
const targetJudgeIds = computed(() => {
  if (queryTargetJudgeIds.value.length > 0) return queryTargetJudgeIds.value
  if (drawRowForContext.value) return rowJudgeTargetIds(drawRowForContext.value)
  return uniqueIds([adjudicatorId.value])
})
const targetJudgeOptions = computed(() =>
  targetJudgeIds.value.map((id) => ({
    id,
    name: adjudicators.adjudicators.find((item) => item._id === id)?.name ?? id,
  }))
)
const selectedTargetJudgeId = ref('')
const effectiveTargetJudgeId = computed(() => {
  const options = targetJudgeOptions.value
  if (options.length === 0) return ''
  if (options.some((option) => option.id === selectedTargetJudgeId.value)) {
    return selectedTargetJudgeId.value
  }
  if (options.some((option) => option.id === adjudicatorId.value)) {
    return adjudicatorId.value
  }
  if (options.length === 1) return options[0].id
  return ''
})
const judge = computed(() =>
  adjudicators.adjudicators.find((item) => item._id === effectiveTargetJudgeId.value)
)

const homePath = computed(() => {
  const query = new URLSearchParams()
  appendParticipantMode(query, participantMode.value)
  query.set('focusRound', round.value)
  query.set('focusType', 'feedback')
  const suffix = query.toString()
  return `/user/${tournamentId.value}/home${suffix ? `?${suffix}` : ''}`
})
const tournamentHomePath = computed(() => {
  const query = new URLSearchParams()
  appendParticipantMode(query, participantMode.value)
  const suffix = query.toString()
  return `/user/${tournamentId.value}/home${suffix ? `?${suffix}` : ''}`
})

const score = ref(8)
const matter = ref(4)
const manner = ref(4)
const comment = ref('')
const saved = ref(false)
const submitError = ref('')
const confirmOpen = ref(false)
const successOpen = ref(false)
const confirmCountdown = ref(0)
let countdownTimer: number | null = null
let countdownDeadline = 0

const roundConfig = computed(() =>
  rounds.rounds.find((item) => item.round === Number(round.value))
)
const teamFeedbackEnabled = computed(
  () => roundConfig.value?.userDefinedData?.evaluate_from_teams !== false
)
const adjudicatorFeedbackEnabled = computed(
  () => roundConfig.value?.userDefinedData?.evaluate_from_adjudicators !== false
)
const querySubmitterIds = computed(() => parseQueryList(route.query.submitters))
const adjudicatorSubmitterCandidateIds = computed(() => {
  if (querySubmitterIds.value.length > 0) return querySubmitterIds.value
  if (drawRowForContext.value) return rowAdjudicatorIds(drawRowForContext.value)
  return []
})
const adjudicatorSubmitterCandidateSet = computed(
  () => new Set(adjudicatorSubmitterCandidateIds.value)
)
const adjudicatorIdentityOptions = computed(() => {
  if (adjudicatorSubmitterCandidateSet.value.size === 0) return adjudicators.adjudicators
  return adjudicators.adjudicators.filter((adj) => adjudicatorSubmitterCandidateSet.value.has(adj._id))
})
const speakerSelectionRequired = computed(
  () => showTeamActorSelection.value && evaluatorMode.value === 'speaker'
)
const teamActorIdentityId = computed({
  get: () =>
    participantMode.value === 'speaker' ? teamIdentityId.value : judgeFeedbackTeamIdentityId.value,
  set: (value: string) => {
    if (participantMode.value === 'speaker') {
      teamIdentityId.value = value
      return
    }
    judgeFeedbackTeamIdentityId.value = value
  },
})
const speakerActorIdentityId = computed({
  get: () =>
    participantMode.value === 'speaker' ? speakerIdentityId.value : judgeFeedbackSpeakerIdentityId.value,
  set: (value: string) => {
    if (participantMode.value === 'speaker') {
      speakerIdentityId.value = value
      return
    }
    judgeFeedbackSpeakerIdentityId.value = value
  },
})
const teamActorSpeakerOptions = computed(() => speakersForTeam(teamActorIdentityId.value))
const actorOptions = computed<Array<{ value: 'adjudicator' | 'team'; label: string }>>(() => {
  if (participantMode.value !== 'adjudicator') return []
  const options: Array<{ value: 'adjudicator' | 'team'; label: string }> = []
  if (adjudicatorFeedbackEnabled.value && adjudicatorIdentityOptions.value.length > 0) {
    options.push({ value: 'adjudicator', label: t('ジャッジとして提出') })
  }
  if (teamFeedbackEnabled.value && teamActorOptions.value.length > 0) {
    options.push({
      value: 'team',
      label: evaluatorMode.value === 'speaker' ? t('スピーカーとして提出') : t('チームとして提出'),
    })
  }
  return options
})
const evaluatorMode = computed(() => roundConfig.value?.userDefinedData?.evaluator_in_team ?? 'team')
const useMatterManner = computed(
  () => roundConfig.value?.userDefinedData?.score_by_matter_manner !== false
)
const tournament = computed(() =>
  tournamentStore.tournaments.find((item) => item._id === tournamentId.value)
)
const style = computed(() =>
  stylesStore.styles.find((item) => item.id === tournament.value?.style)
)
const range = computed(() =>
  normalizeSingleRange(style.value?.adjudicator_range, defaultAdjudicatorRange)
)
const computedScore = computed(() =>
  useMatterManner.value ? Number(matter.value) + Number(manner.value) : Number(score.value)
)
const minScore = computed(() =>
  useMatterManner.value ? range.value.from * 2 : range.value.from
)
const maxScore = computed(() =>
  useMatterManner.value ? range.value.to * 2 : range.value.to
)
const submittedEntityId = computed(() => {
  if (showTeamActorSelection.value) {
    return evaluatorMode.value === 'speaker' ? speakerActorIdentityId.value : teamActorIdentityId.value
  }
  return teamIdentityId.value
})
const selectedIdentityType = computed<'adjudicator' | 'team' | 'speaker' | 'unknown'>(() => {
  if (showTeamActorSelection.value) {
    return evaluatorMode.value === 'speaker' ? 'speaker' : 'team'
  }
  if (showAdjudicatorActorSelection.value) {
    return 'adjudicator'
  }
  return 'unknown'
})
const selectedIdentityTypeLabel = computed(() => {
  if (selectedIdentityType.value === 'adjudicator') return t('ジャッジ')
  if (selectedIdentityType.value === 'team') return t('チーム')
  if (selectedIdentityType.value === 'speaker') return t('スピーカー')
  return t('提出者')
})
const selectedIdentityName = computed(() => {
  const selectedId = String(submittedEntityId.value ?? '').trim()
  if (!selectedId) return t('未選択')
  if (selectedIdentityType.value === 'adjudicator') {
    return adjudicators.adjudicators.find((item) => item._id === selectedId)?.name ?? selectedId
  }
  if (selectedIdentityType.value === 'team') {
    return teamsStore.teams.find((item) => item._id === selectedId)?.name ?? selectedId
  }
  if (selectedIdentityType.value === 'speaker') {
    return speakersStore.speakers.find((item) => item._id === selectedId)?.name ?? selectedId
  }
  return selectedId
})
const identityReady = computed(() => {
  if (showTeamActorSelection.value) {
    if (!teamActorIdentityId.value) return false
    if (speakerSelectionRequired.value) return Boolean(speakerActorIdentityId.value)
    return true
  }
  if (showAdjudicatorActorSelection.value) return Boolean(teamIdentityId.value)
  return false
})
const identityHint = computed(() => {
  if (showTeamActorSelection.value && !teamActorIdentityId.value) {
    return t('あなたの情報でチームを選択してください。')
  }
  if (showTeamActorSelection.value && speakerSelectionRequired.value && !speakerActorIdentityId.value) {
    return t('あなたの情報でスピーカーを選択してください。')
  }
  if (showAdjudicatorActorSelection.value && !teamIdentityId.value) {
    return t('あなたの情報でジャッジを選択してください。')
  }
  return t('あなたの情報を確認してください。')
})
const targetJudgeReady = computed(() => Boolean(effectiveTargetJudgeId.value))
const canSubmit = computed(
  () =>
    computedScore.value >= minScore.value &&
    computedScore.value <= maxScore.value &&
    Boolean(judge.value) &&
    targetJudgeReady.value &&
    identityReady.value
)
const confirmButtonLabel = computed(() =>
  confirmCountdown.value > 0
    ? t('{seconds}秒後に送信できます', { seconds: confirmCountdown.value })
    : t('確認して送信')
)

function setActorMode(mode: 'adjudicator' | 'team') {
  const nextQuery = { ...route.query, actor: mode, mode: participantMode.value }
  router.replace({ query: nextQuery })
}

function startCountdown(seconds = 3) {
  clearCountdown(false)
  countdownDeadline = Date.now() + seconds * 1000
  confirmCountdown.value = Math.max(0, seconds)
  countdownTimer = window.setInterval(() => {
    const remaining = Math.max(0, Math.ceil((countdownDeadline - Date.now()) / 1000))
    confirmCountdown.value = remaining
    if (remaining <= 0) {
      clearCountdown(false)
      return
    }
  }, 200)
}

function clearCountdown(reset = true) {
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer)
    countdownTimer = null
  }
  if (reset) {
    confirmCountdown.value = 0
  }
}

function validateBeforeSubmit() {
  submitError.value = ''
  if (!judge.value) {
    submitError.value = t('対象のジャッジを確認してください。')
    return false
  }
  if (!targetJudgeReady.value) {
    submitError.value = t('評価対象ジャッジを選択してください。')
    return false
  }
  if (!identityReady.value) {
    submitError.value = identityHint.value
    return false
  }
  if (computedScore.value < minScore.value || computedScore.value > maxScore.value) {
    submitError.value = t('スコア入力を確認してください。')
    return false
  }
  if (!canSubmit.value) {
    submitError.value = t('入力内容を確認してください。')
    return false
  }
  return true
}

function requestSubmit() {
  saved.value = false
  submissions.clearError()
  if (!validateBeforeSubmit()) return
  confirmOpen.value = true
  startCountdown(3)
}

function closeConfirm() {
  confirmOpen.value = false
  clearCountdown()
  submissions.clearError()
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (confirmOpen.value) {
    closeConfirm()
    return
  }
  if (successOpen.value) successOpen.value = false
}

async function submitConfirmed() {
  if (confirmCountdown.value > 0) return
  if (!validateBeforeSubmit()) {
    closeConfirm()
    return
  }
  saved.value = false
  const created = await submissions.submitFeedback({
    tournamentId: tournamentId.value,
    round: Number(round.value),
    adjudicatorId: effectiveTargetJudgeId.value,
    score: computedScore.value,
    comment: comment.value,
    submittedEntityId: submittedEntityId.value || undefined,
    matter: useMatterManner.value ? matter.value : undefined,
    manner: useMatterManner.value ? manner.value : undefined,
  })
  if (created) {
    closeConfirm()
    saved.value = true
    successOpen.value = true
  }
}

function goToDraw() {
  successOpen.value = false
  router.push(homePath.value)
}

function goToTournamentHome() {
  successOpen.value = false
  router.push(tournamentHomePath.value)
}

onMounted(() => {
  adjudicators.fetchAdjudicators(tournamentId.value)
  teamsStore.fetchTeams(tournamentId.value)
  speakersStore.fetchSpeakers(tournamentId.value)
  rounds.fetchRounds(tournamentId.value, { forcePublic: true })
  drawsStore.fetchDraws(tournamentId.value, undefined, { forcePublic: true })
  tournamentStore.fetchTournaments()
  stylesStore.fetchStyles()
  window.addEventListener('keydown', onGlobalKeydown)
})

watch([tournamentId, round], () => {
  adjudicators.fetchAdjudicators(tournamentId.value)
  teamsStore.fetchTeams(tournamentId.value)
  speakersStore.fetchSpeakers(tournamentId.value)
  rounds.fetchRounds(tournamentId.value, { forcePublic: true })
  drawsStore.fetchDraws(tournamentId.value, undefined, { forcePublic: true })
  tournamentStore.fetchTournaments()
  stylesStore.fetchStyles()
})

watch(range, (next) => {
  matter.value = next.default
  manner.value = next.default
  score.value = next.default
}, { immediate: true })

watch(
  [participantMode, actorOptions],
  () => {
    if (participantMode.value !== 'adjudicator') return
    if (actorOptions.value.length === 0) return
    const current = actorMode.value
    if (actorOptions.value.some((option) => option.value === current)) return
    setActorMode(actorOptions.value[0].value)
  },
  { immediate: true }
)

watch(
  [targetJudgeOptions, adjudicatorId],
  ([options, routeTargetId]) => {
    if (options.length === 0) {
      selectedTargetJudgeId.value = ''
      return
    }
    if (options.some((option) => option.id === selectedTargetJudgeId.value)) return
    if (options.some((option) => option.id === routeTargetId)) {
      selectedTargetJudgeId.value = routeTargetId
      return
    }
    selectedTargetJudgeId.value = options.length === 1 ? options[0].id : ''
  },
  { immediate: true }
)

watch(
  [participantMode, actorMode, teamActorOptions],
  () => {
    if (!showTeamActorSelection.value) return
    if (teamActorOptions.value.some((team) => team._id === teamActorIdentityId.value)) return
    if (teamActorOptions.value.length === 1) {
      teamActorIdentityId.value = teamActorOptions.value[0]._id
      return
    }
    teamActorIdentityId.value = ''
  },
  { immediate: true }
)

watch(
  [teamActorIdentityId, teamActorSpeakerOptions, speakerSelectionRequired],
  () => {
    if (!speakerSelectionRequired.value) return
    if (!teamActorIdentityId.value) {
      speakerActorIdentityId.value = ''
      return
    }
    if (!speakerActorIdentityId.value) return
    const exists = teamActorSpeakerOptions.value.some(
      (speaker) => speaker._id === speakerActorIdentityId.value
    )
    if (!exists) {
      speakerActorIdentityId.value = ''
    }
  },
  { immediate: true }
)

watch(
  [participantMode, actorMode, adjudicatorIdentityOptions],
  () => {
    if (!showAdjudicatorActorSelection.value) return
    if (adjudicatorIdentityOptions.value.some((adj) => adj._id === teamIdentityId.value)) return
    if (adjudicatorIdentityOptions.value.length === 1) {
      teamIdentityId.value = adjudicatorIdentityOptions.value[0]._id
      return
    }
    teamIdentityId.value = ''
  },
  { immediate: true }
)

watch(
  [participantMode, actorMode, () => route.query.team],
  ([, , value]) => {
    if (typeof value !== 'string') return
    const normalized = value.trim()
    if (!normalized || !showTeamActorSelection.value) return
    if (teamActorIdentityId.value === normalized) return
    teamActorIdentityId.value = normalized
  },
  { immediate: true }
)

watch(
  [participantMode, actorMode, () => route.query.speaker],
  ([, , value]) => {
    if (typeof value !== 'string') return
    const normalized = value.trim()
    if (!normalized || !speakerSelectionRequired.value) return
    if (speakerActorIdentityId.value === normalized) return
    speakerActorIdentityId.value = normalized
  },
  { immediate: true }
)

watch(
  () => route.query.submitter,
  (value) => {
    if (typeof value !== 'string') return
    const normalized = value.trim()
    if (!normalized || !showAdjudicatorActorSelection.value) return
    if (teamIdentityId.value === normalized) return
    teamIdentityId.value = normalized
  },
  { immediate: true }
)

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  clearCountdown()
  submissions.clearError()
})
</script>

<style scoped>
.error {
  color: var(--color-danger);
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
}

.success-modal {
  width: min(420px, 100%);
}

.success-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.identity-panel {
  gap: var(--space-2);
}

.identity-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.identity-panel-title {
  margin: 0;
  font-size: 1rem;
}

.identity-kind-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
}

.identity-kind-judge {
  color: #92400e;
  border-color: #fde68a;
  background: #fffbeb;
}

.identity-line {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.confirm-grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.confirm-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  padding: var(--space-3);
  gap: 6px;
}

.confirm-card strong {
  line-height: 1.3;
}

.confirm-comment {
  background: var(--color-surface);
}

.confirm-grid .full {
  grid-column: 1 / -1;
}

@media (max-width: 720px) {
  .optional-back-action {
    display: none;
  }
}

</style>
