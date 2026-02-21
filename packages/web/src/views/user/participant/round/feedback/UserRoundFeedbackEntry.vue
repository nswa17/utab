<template>
  <section class="stack">
    <LoadingState v-if="adjudicators.loading" />
    <p v-else-if="adjudicators.error" class="error">{{ adjudicators.error }}</p>

    <div v-else-if="judge" class="stack">
      <div class="card stack identity-panel">
        <h4 class="identity-panel-title">{{ $t('あなたの情報') }}</h4>
        <p class="identity-line">
          <span class="muted small">{{ selectedIdentityTypeLabel }}</span>
          <strong>{{ selectedIdentityName }}</strong>
        </p>
      </div>
      <div class="card stack">
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
        <p v-if="submissions.error" class="error">{{ submissions.error }}</p>
        <p v-if="!identityReady" class="muted">{{ identityHint }}</p>
        <p v-if="saved" class="muted">{{ $t('送信しました。') }}</p>
      </div>
    </div>

    <div v-else class="card stack">
      <p class="muted">{{ $t('対象のジャッジが見つかりません。') }}</p>
      <Button variant="ghost" size="sm" :to="homePath">{{ $t('一覧へ戻る') }}</Button>
    </div>

    <div v-if="confirmOpen" class="modal-backdrop" role="presentation">
      <div class="modal card stack" role="dialog" aria-modal="true">
        <h4>{{ $t('送信前の確認') }}</h4>
        <p class="muted">{{ $t('内容を確認してから送信してください。') }}</p>
        <div class="confirm-grid">
          <div class="stack">
            <span class="muted small">{{ $t('ジャッジ') }}</span>
            <strong>{{ judge?.name ?? '—' }}</strong>
          </div>
          <div class="stack">
            <span class="muted small">{{ $t('スコア') }}</span>
            <strong>{{ computedScore }}</strong>
          </div>
          <div class="stack full">
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
          <Button variant="ghost" size="sm" @click="goToDraw">{{ $t('対戦表に戻る') }}</Button>
          <Button size="sm" @click="goToTournamentHome">{{ $t('大会ホームに戻る') }}</Button>
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
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import { defaultAdjudicatorRange, normalizeSingleRange } from '@/utils/score'
import { useParticipantIdentity } from '@/composables/useParticipantIdentity'

const route = useRoute()
const router = useRouter()
const adjudicators = useAdjudicatorsStore()
const rounds = useRoundsStore()
const submissions = useSubmissionsStore()
const tournamentStore = useTournamentStore()
const stylesStore = useStylesStore()
const teamsStore = useTeamsStore()
const speakersStore = useSpeakersStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const participant = computed(() => route.params.participant as string)
const round = computed(() => route.params.round as string)
const adjudicatorId = computed(() => route.params.adjudicatorId as string)
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
const filter = computed(() => (typeof route.query.filter === 'string' ? route.query.filter : ''))
const actorMode = computed<'team' | 'adjudicator'>(() => {
  if (typeof route.query.actor === 'string' && route.query.actor === 'team') return 'team'
  if (participant.value === 'speaker') return 'team'
  return 'adjudicator'
})

const homePath = computed(() => {
  const query = new URLSearchParams()
  if (filter.value) query.set('filter', filter.value)
  query.set('actor', actorMode.value)
  const suffix = query.toString()
  return `/user/${tournamentId.value}/${participant.value}/rounds/${round.value}/feedback/home${
    suffix ? `?${suffix}` : ''
  }`
})
const drawPath = computed(
  () => `/user/${tournamentId.value}/${participant.value}/home`
)
const tournamentHomePath = computed(() => `/user/${tournamentId.value}/home`)

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

const judge = computed(() =>
  adjudicators.adjudicators.find((item) => item._id === adjudicatorId.value)
)
const roundConfig = computed(() =>
  rounds.rounds.find((item) => item.round === Number(round.value))
)
const teamFeedbackEnabled = computed(
  () => roundConfig.value?.userDefinedData?.evaluate_from_teams !== false
)
const adjudicatorFeedbackEnabled = computed(
  () => roundConfig.value?.userDefinedData?.evaluate_from_adjudicators !== false
)
const actorOptions = computed<Array<{ value: 'adjudicator' | 'team'; label: string }>>(() => {
  if (participant.value !== 'adjudicator') return []
  const options: Array<{ value: 'adjudicator' | 'team'; label: string }> = []
  if (adjudicatorFeedbackEnabled.value) {
    options.push({ value: 'adjudicator', label: t('ジャッジとして提出') })
  }
  if (teamFeedbackEnabled.value) {
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
  if (participant.value === 'speaker') {
    return evaluatorMode.value === 'speaker' ? speakerIdentityId.value : teamIdentityId.value
  }
  if (participant.value === 'adjudicator') {
    if (actorMode.value === 'team') {
      return evaluatorMode.value === 'speaker'
        ? judgeFeedbackSpeakerIdentityId.value
        : judgeFeedbackTeamIdentityId.value
    }
    return teamIdentityId.value
  }
  return ''
})
const selectedIdentityType = computed<'adjudicator' | 'team' | 'speaker' | 'unknown'>(() => {
  if (participant.value === 'speaker') {
    return evaluatorMode.value === 'speaker' ? 'speaker' : 'team'
  }
  if (participant.value === 'adjudicator') {
    if (actorMode.value === 'team') {
      return evaluatorMode.value === 'speaker' ? 'speaker' : 'team'
    }
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
  if (participant.value === 'speaker') {
    return evaluatorMode.value === 'speaker'
      ? Boolean(teamIdentityId.value) && Boolean(speakerIdentityId.value)
      : Boolean(teamIdentityId.value)
  }
  if (participant.value === 'adjudicator') {
    if (actorMode.value === 'team') {
      return evaluatorMode.value === 'speaker'
        ? Boolean(judgeFeedbackTeamIdentityId.value) && Boolean(judgeFeedbackSpeakerIdentityId.value)
        : Boolean(judgeFeedbackTeamIdentityId.value)
    }
    return Boolean(teamIdentityId.value)
  }
  return true
})
const identityHint = computed(() => {
  if (participant.value === 'speaker') {
    return evaluatorMode.value === 'speaker'
      ? t('参加者ホームでチームとスピーカーを選択してください。')
      : t('参加者ホームでチームを選択してください。')
  }
  if (participant.value === 'adjudicator') {
    if (actorMode.value === 'team') {
      return evaluatorMode.value === 'speaker'
        ? t('参加者ホームでチームとスピーカーを選択してください。')
        : t('参加者ホームでチームを選択してください。')
    }
    return t('参加者ホームでジャッジを選択してください。')
  }
  return t('参加者ホームで対象を選択してください。')
})
const canSubmit = computed(
  () =>
    computedScore.value >= minScore.value &&
    computedScore.value <= maxScore.value &&
    identityReady.value
)
const confirmButtonLabel = computed(() =>
  confirmCountdown.value > 0
    ? t('{seconds}秒後に送信できます', { seconds: confirmCountdown.value })
    : t('確認して送信')
)

function setActorMode(mode: 'adjudicator' | 'team') {
  const nextQuery = { ...route.query, actor: mode }
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
  if (!validateBeforeSubmit()) return
  confirmOpen.value = true
  startCountdown(3)
}

function closeConfirm() {
  confirmOpen.value = false
  clearCountdown()
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
    adjudicatorId: adjudicatorId.value,
    score: computedScore.value,
    comment: comment.value,
    role: participant.value,
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
  router.push(drawPath.value)
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
  tournamentStore.fetchTournaments()
  stylesStore.fetchStyles()
  window.addEventListener('keydown', onGlobalKeydown)
})

watch([tournamentId, round], () => {
  adjudicators.fetchAdjudicators(tournamentId.value)
  teamsStore.fetchTeams(tournamentId.value)
  speakersStore.fetchSpeakers(tournamentId.value)
  rounds.fetchRounds(tournamentId.value, { forcePublic: true })
  tournamentStore.fetchTournaments()
  stylesStore.fetchStyles()
})

watch(range, (next) => {
  matter.value = next.default
  manner.value = next.default
  score.value = next.default
}, { immediate: true })

watch(
  [participant, actorOptions],
  () => {
    if (participant.value !== 'adjudicator') return
    if (actorOptions.value.length === 0) return
    const current = actorMode.value
    if (actorOptions.value.some((option) => option.value === current)) return
    setActorMode(actorOptions.value[0].value)
  },
  { immediate: true }
)

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  clearCountdown()
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

.identity-panel-title {
  margin: 0;
  font-size: 1rem;
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

.confirm-grid .full {
  grid-column: 1 / -1;
}

</style>
