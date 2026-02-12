<template>
  <section class="stack">
    <LoadingState v-if="teams.loading" />
    <p v-else-if="teams.error" class="error">{{ teams.error }}</p>

    <div v-else-if="selectedTeamA && selectedTeamB" class="card stack ballot-sheet">
      <h4 class="sheet-title">{{ $t('スコア入力') }}</h4>
      <div class="row match-up">
        <div class="team-heading">
          <span class="side-chip gov-chip">{{ govLabel }}</span>
          <strong>{{ teamAName }}</strong>
        </div>
        <span class="muted">{{ $t('vs') }}</span>
        <div class="team-heading">
          <span class="side-chip opp-chip">{{ oppLabel }}</span>
          <strong>{{ teamBName }}</strong>
        </div>
      </div>

      <div class="grid">
        <label class="stack">
          <span class="field-label">{{ $t('勝者') }}</span>
          <select v-model="winnerId">
            <option value="">{{ $t('勝者を選択') }}</option>
            <option :value="selectedTeamA?._id">{{ teamAName }}</option>
            <option :value="selectedTeamB?._id">{{ teamBName }}</option>
          </select>
          <span v-if="allowLowTieWin" class="muted tiny">{{ $t('未選択で引き分けとして送信できます。') }}</span>
        </label>
      </div>

      <div v-if="noSpeakerScore" class="card stack soft">
        <p class="muted">{{ $t('このラウンドはスピーカースコアを入力しません。') }}</p>
      </div>

      <div v-else class="grid">
        <div class="stack team-column">
          <div class="row team-column-header">
            <span class="side-chip gov-chip">{{ govLabel }}</span>
            <strong>{{ teamAName }}</strong>
          </div>
          <div v-if="teamASpeakerEntries.length === 0" class="muted small">
            {{ $t('スピーカーが登録されていません') }}
          </div>
          <div v-if="rolesA.length === 0" class="muted">{{ $t('スピーカーがいません') }}</div>
          <div v-else class="stack">
            <div v-for="(role, index) in rolesA" :key="`gov-${role.order}`" class="role-card">
              <div class="row role-header">
                <span class="muted">{{ role.abbr ?? `#${role.order}` }}</span>
                <span class="muted small">{{ role.long ?? '' }}</span>
              </div>
              <label class="stack">
                <span class="muted">{{ $t('スピーカー') }}</span>
                <select v-model="speakerIdsA[index]" :disabled="teamASpeakerEntries.length === 0">
                  <option value="">{{ $t('スピーカーを選択') }}</option>
                  <option v-for="speaker in teamASpeakerEntries" :key="speaker.id" :value="speaker.id">
                    {{ speaker.name }}
                  </option>
                </select>
              </label>
              <template v-if="useMatterManner">
                <div class="row small">
                  <span class="muted">{{ $t('Matter') }}</span>
                  <input
                    v-model.number="matterA[index]"
                    type="number"
                    :min="scoreRange(index).from"
                    :max="scoreRange(index).to"
                    :step="scoreRange(index).unit"
                  />
                </div>
                <div class="row small">
                  <span class="muted">{{ $t('Manner') }}</span>
                  <input
                    v-model.number="mannerA[index]"
                    type="number"
                    :min="scoreRange(index).from"
                    :max="scoreRange(index).to"
                    :step="scoreRange(index).unit"
                  />
                </div>
                <div class="muted small">
                  {{ $t('合計: {score}', { score: speakerTotal(matterA[index], mannerA[index]) }) }}
                </div>
              </template>
              <input
                v-else
                v-model.number="scoresA[index]"
                type="number"
                :min="scoreRange(index).from"
                :max="scoreRange(index).to"
                :step="scoreRange(index).unit"
              />
              <p class="muted tiny">{{ scoreRangeHint(index) }}</p>
              <label v-if="bestEnabled" class="row small">
                <input v-model="bestA[index]" type="checkbox" />
                {{ $t('Best') }}
              </label>
              <label v-if="poiEnabled" class="row small">
                <input v-model="poiA[index]" type="checkbox" />
                {{ $t('POI') }}
              </label>
            </div>
          </div>
        </div>
        <div class="stack team-column">
          <div class="row team-column-header">
            <span class="side-chip opp-chip">{{ oppLabel }}</span>
            <strong>{{ teamBName }}</strong>
          </div>
          <div v-if="teamBSpeakerEntries.length === 0" class="muted small">
            {{ $t('スピーカーが登録されていません') }}
          </div>
          <div v-if="rolesB.length === 0" class="muted">{{ $t('スピーカーがいません') }}</div>
          <div v-else class="stack">
            <div v-for="(role, index) in rolesB" :key="`opp-${role.order}`" class="role-card">
              <div class="row role-header">
                <span class="muted">{{ role.abbr ?? `#${role.order}` }}</span>
                <span class="muted small">{{ role.long ?? '' }}</span>
              </div>
              <label class="stack">
                <span class="muted">{{ $t('スピーカー') }}</span>
                <select v-model="speakerIdsB[index]" :disabled="teamBSpeakerEntries.length === 0">
                  <option value="">{{ $t('スピーカーを選択') }}</option>
                  <option v-for="speaker in teamBSpeakerEntries" :key="speaker.id" :value="speaker.id">
                    {{ speaker.name }}
                  </option>
                </select>
              </label>
              <template v-if="useMatterManner">
                <div class="row small">
                  <span class="muted">{{ $t('Matter') }}</span>
                  <input
                    v-model.number="matterB[index]"
                    type="number"
                    :min="scoreRange(index).from"
                    :max="scoreRange(index).to"
                    :step="scoreRange(index).unit"
                  />
                </div>
                <div class="row small">
                  <span class="muted">{{ $t('Manner') }}</span>
                  <input
                    v-model.number="mannerB[index]"
                    type="number"
                    :min="scoreRange(index).from"
                    :max="scoreRange(index).to"
                    :step="scoreRange(index).unit"
                  />
                </div>
                <div class="muted small">
                  {{ $t('合計: {score}', { score: speakerTotal(matterB[index], mannerB[index]) }) }}
                </div>
              </template>
              <input
                v-else
                v-model.number="scoresB[index]"
                type="number"
                :min="scoreRange(index).from"
                :max="scoreRange(index).to"
                :step="scoreRange(index).unit"
              />
              <p class="muted tiny">{{ scoreRangeHint(index) }}</p>
              <label v-if="bestEnabled" class="row small">
                <input v-model="bestB[index]" type="checkbox" />
                {{ $t('Best') }}
              </label>
              <label v-if="poiEnabled" class="row small">
                <input v-model="poiB[index]" type="checkbox" />
                {{ $t('POI') }}
              </label>
            </div>
          </div>
        </div>
      </div>

      <label class="stack">
        <span class="muted">{{ $t('コメント') }}</span>
        <textarea v-model="comment" rows="4" />
      </label>

      <Button :loading="submissions.loading" @click="requestSubmit">
        {{ $t('送信') }}
      </Button>
      <p v-if="submitError" class="error">{{ submitError }}</p>
      <p v-if="!identityReady" class="muted">{{ $t('参加者ホームでジャッジを選択してください。') }}</p>
      <p v-if="lowTieWarning" class="error">{{ $t('低勝ち/同点勝ちは許可されていません。') }}</p>
      <p v-if="submissions.error" class="error">{{ submissions.error }}</p>
      <p v-if="saved" class="muted">{{ $t('送信しました。') }}</p>
    </div>

    <div v-else class="card stack">
      <p class="muted">{{ $t('スコアシートを開始するチームを選択してください。') }}</p>
      <Button variant="ghost" size="sm" :to="homePath">{{ $t('スコアシート一覧へ') }}</Button>
    </div>

    <div v-if="confirmOpen" class="modal-backdrop" role="presentation">
      <div class="modal card stack" role="dialog" aria-modal="true">
        <h4>{{ $t('送信前の確認') }}</h4>
        <p class="muted">{{ $t('内容を確認してから送信してください。') }}</p>
        <div class="confirm-grid">
          <div class="stack">
            <span class="muted small">{{ $t('勝者') }}</span>
            <strong>{{ winnerName }}</strong>
          </div>
          <div v-if="!noSpeakerScore" class="stack">
            <span class="muted small">{{ $t('合計') }}</span>
            <strong>{{ govLabel }} {{ totalScoreA }} / {{ oppLabel }} {{ totalScoreB }}</strong>
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
          <Button size="sm" @click="goToTaskList">{{ $t('タスク一覧に戻る') }}</Button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTeamsStore } from '@/stores/teams'
import { useRoundsStore } from '@/stores/rounds'
import { useSubmissionsStore } from '@/stores/submissions'
import { useTournamentStore } from '@/stores/tournament'
import { useStylesStore } from '@/stores/styles'
import { useSpeakersStore } from '@/stores/speakers'
import { useParticipantIdentity } from '@/composables/useParticipantIdentity'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'
import { getSideShortLabel } from '@/utils/side-labels'
import {
  defaultSpeakerRange,
  getRangeForIndex,
  normalizeScoreRanges,
} from '@/utils/score'

const route = useRoute()
const router = useRouter()
const teams = useTeamsStore()
const rounds = useRoundsStore()
const submissions = useSubmissionsStore()
const tournamentStore = useTournamentStore()
const stylesStore = useStylesStore()
const speakersStore = useSpeakersStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const participant = computed(() => route.params.participant as string)
const round = computed(() => route.params.round as string)

const homePath = computed(
  () => `/user/${tournamentId.value}/${participant.value}/rounds/${round.value}/ballot/home`
)
const drawPath = computed(
  () => `/user/${tournamentId.value}/${participant.value}/rounds/${round.value}/draw`
)
const taskListPath = computed(() => `/user/${tournamentId.value}/${participant.value}/home`)
const { identityId } = useParticipantIdentity(tournamentId, participant)

const teamAId = ref('')
const teamBId = ref('')
const winnerId = ref('')
const comment = ref('')
const saved = ref(false)
const submitError = ref('')
const confirmOpen = ref(false)
const successOpen = ref(false)
const confirmCountdown = ref(0)
let countdownTimer: number | null = null
let countdownDeadline = 0

const scoresValid = computed(() => {
  if (noSpeakerScore.value) return true
  const countA = rolesA.value.length
  const countB = rolesB.value.length
  if (countA === 0 && countB === 0) return true
  const scoresA = effectiveScoresA.value.slice(0, countA)
  const scoresB = effectiveScoresB.value.slice(0, countB)
  if (scoresA.length !== countA || scoresB.length !== countB) return false
  return scoresA.every((score) => Number.isFinite(score)) && scoresB.every((score) => Number.isFinite(score))
})

const speakerSelectionValid = computed(() => {
  if (noSpeakerScore.value) return true
  const countA = rolesA.value.length
  const countB = rolesB.value.length
  const availableA = new Set(teamASpeakerEntries.value.map((speaker) => speaker.id))
  const availableB = new Set(teamBSpeakerEntries.value.map((speaker) => speaker.id))
  const requireA = availableA.size > 0
  const requireB = availableB.size > 0
  const selectionA = speakerIdsA.value.slice(0, countA)
  const selectionB = speakerIdsB.value.slice(0, countB)
  const okA = !requireA || selectionA.every((id) => id && availableA.has(id))
  const okB = !requireB || selectionB.every((id) => id && availableB.has(id))
  return okA && okB
})

const allowLowTieWin = computed(
  () => roundConfig.value?.userDefinedData?.allow_low_tie_win !== false
)
const totalScoreA = computed(() =>
  effectiveScoresA.value.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0)
)
const totalScoreB = computed(() =>
  effectiveScoresB.value.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0)
)
const lowTieWarning = computed(() => {
  if (allowLowTieWin.value) return false
  if (!winnerId.value) return true
  if (winnerId.value === teamAId.value) return totalScoreA.value <= totalScoreB.value
  if (winnerId.value === teamBId.value) return totalScoreB.value <= totalScoreA.value
  return true
})
const identityReady = computed(() => Boolean(identityId.value))

const canSubmit = computed(() => {
  if (!selectedTeamA.value || !selectedTeamB.value) return false
  if (!allowLowTieWin.value && !winnerId.value) return false
  if (!scoresValid.value || !speakerSelectionValid.value) return false
  if (!allowLowTieWin.value && lowTieWarning.value) return false
  if (!identityReady.value) return false
  return true
})
const winnerName = computed(() => {
  if (winnerId.value === teamAId.value) return teamAName.value
  if (winnerId.value === teamBId.value) return teamBName.value
  if (allowLowTieWin.value) return t('引き分け')
  return t('未選択')
})
const confirmButtonLabel = computed(() =>
  confirmCountdown.value > 0
    ? t('{seconds}秒後に送信できます', { seconds: confirmCountdown.value })
    : t('確認して送信')
)

const scoresA = ref<number[]>([])
const scoresB = ref<number[]>([])
const matterA = ref<number[]>([])
const mannerA = ref<number[]>([])
const matterB = ref<number[]>([])
const mannerB = ref<number[]>([])
const speakerIdsA = ref<string[]>([])
const speakerIdsB = ref<string[]>([])
const bestA = ref<boolean[]>([])
const bestB = ref<boolean[]>([])
const poiA = ref<boolean[]>([])
const poiB = ref<boolean[]>([])

const selectedTeamA = computed(() => teams.teams.find((team) => team._id === teamAId.value))
const selectedTeamB = computed(() => teams.teams.find((team) => team._id === teamBId.value))
const teamAName = computed(() => selectedTeamA.value?.name ?? '')
const teamBName = computed(() => selectedTeamB.value?.name ?? '')
type SpeakerEntry = { id: string; name: string }
type RoleDefinition = { order: number; abbr?: string; long?: string }

function speakerEntriesFromDetail(team: any): SpeakerEntry[] {
  if (!team) return []
  const detail = team.details?.find((d: any) => Number(d.r) === Number(round.value))
  const ids = (detail?.speakers ?? []).map((id: string) => String(id)).filter(Boolean)
  if (ids.length === 0) return []
  return ids.map((id: string) => ({
    id,
    name: speakersStore.speakers.find((speaker) => speaker._id === id)?.name ?? id,
  }))
}

function speakerEntriesFromTeam(team: any): SpeakerEntry[] {
  if (!team) return []
  return (
    team.speakers?.map((speaker: any, index: number) => ({
      id: `${team._id}:${index}`,
      name: speaker.name,
    })) ?? []
  )
}

const teamASpeakerEntries = computed(() => {
  const detailEntries = speakerEntriesFromDetail(selectedTeamA.value)
  return detailEntries.length > 0 ? detailEntries : speakerEntriesFromTeam(selectedTeamA.value)
})

const teamBSpeakerEntries = computed(() => {
  const detailEntries = speakerEntriesFromDetail(selectedTeamB.value)
  return detailEntries.length > 0 ? detailEntries : speakerEntriesFromTeam(selectedTeamB.value)
})

const roundConfig = computed(() =>
  rounds.rounds.find((item) => item.round === Number(round.value))
)
const noSpeakerScore = computed(() => roundConfig.value?.userDefinedData?.no_speaker_score === true)
const useMatterManner = computed(
  () => !noSpeakerScore.value && roundConfig.value?.userDefinedData?.score_by_matter_manner !== false
)
const bestEnabled = computed(
  () => !noSpeakerScore.value && roundConfig.value?.userDefinedData?.best !== false
)
const poiEnabled = computed(
  () => !noSpeakerScore.value && roundConfig.value?.userDefinedData?.poi !== false
)

const tournament = computed(() =>
  tournamentStore.tournaments.find((item) => item._id === tournamentId.value)
)
const style = computed(() =>
  stylesStore.styles.find((item) => item.id === tournament.value?.style)
)
const govLabel = computed(() => getSideShortLabel(style.value, 'gov', t('政府')))
const oppLabel = computed(() => getSideShortLabel(style.value, 'opp', t('反対')))
const speakerRanges = computed(() =>
  normalizeScoreRanges(style.value?.range, defaultSpeakerRange)
)

function normalizeRoles(side: 'gov' | 'opp'): RoleDefinition[] {
  const roles = (style.value?.roles as Record<string, any[]> | undefined)?.[side]
  if (Array.isArray(roles) && roles.length > 0) {
    return roles.slice().sort((a, b) => Number(a.order) - Number(b.order))
  }
  return speakerRanges.value.map((_, index) => ({
    order: index + 1,
    abbr: `#${index + 1}`,
    long: t('スピーカー {index}', { index: index + 1 }),
  }))
}

const rolesA = computed(() => normalizeRoles('gov'))
const rolesB = computed(() => normalizeRoles('opp'))

const effectiveScoresA = computed(() =>
  useMatterManner.value
    ? matterA.value.map((value, index) => Number(value) + Number(mannerA.value[index] ?? 0))
    : scoresA.value
)
const effectiveScoresB = computed(() =>
  useMatterManner.value
    ? matterB.value.map((value, index) => Number(value) + Number(mannerB.value[index] ?? 0))
    : scoresB.value
)

function reconcileSpeakerIds(
  current: string[],
  entries: SpeakerEntry[],
  roles: RoleDefinition[]
) {
  const available = new Set(entries.map((entry) => entry.id))
  return roles.map((_role, index) => {
    const existing = current[index]
    if (existing && available.has(existing)) return existing
    return entries[index]?.id ?? ''
  })
}

function initSpeakerSelections() {
  if (noSpeakerScore.value) {
    speakerIdsA.value = []
    speakerIdsB.value = []
    return
  }
  speakerIdsA.value = reconcileSpeakerIds(speakerIdsA.value, teamASpeakerEntries.value, rolesA.value)
  speakerIdsB.value = reconcileSpeakerIds(speakerIdsB.value, teamBSpeakerEntries.value, rolesB.value)
}

function initScores() {
  if (noSpeakerScore.value) {
    scoresA.value = []
    scoresB.value = []
    matterA.value = []
    mannerA.value = []
    matterB.value = []
    mannerB.value = []
    speakerIdsA.value = []
    speakerIdsB.value = []
    bestA.value = []
    bestB.value = []
    poiA.value = []
    poiB.value = []
    return
  }
  const countA = rolesA.value.length
  const countB = rolesB.value.length
  if (useMatterManner.value) {
    matterA.value = Array.from({ length: countA }, (_, index) => scoreRange(index).default)
    mannerA.value = Array.from({ length: countA }, (_, index) => scoreRange(index).default)
    matterB.value = Array.from({ length: countB }, (_, index) => scoreRange(index).default)
    mannerB.value = Array.from({ length: countB }, (_, index) => scoreRange(index).default)
    scoresA.value = []
    scoresB.value = []
  } else {
    scoresA.value = Array.from({ length: countA }, (_, index) => scoreRange(index).default)
    scoresB.value = Array.from({ length: countB }, (_, index) => scoreRange(index).default)
    matterA.value = []
    mannerA.value = []
    matterB.value = []
    mannerB.value = []
  }
  initSpeakerSelections()
  bestA.value = Array.from({ length: countA }, () => false)
  bestB.value = Array.from({ length: countB }, () => false)
  poiA.value = Array.from({ length: countA }, () => false)
  poiB.value = Array.from({ length: countB }, () => false)
}

function scoreRange(index: number) {
  return getRangeForIndex(speakerRanges.value, index, defaultSpeakerRange)
}

function scoreRangeHint(index: number) {
  const range = scoreRange(index)
  return t('入力範囲: {from}〜{to} (刻み {unit})', {
    from: range.from,
    to: range.to,
    unit: range.unit,
  })
}

function speakerTotal(matter: number | undefined, manner: number | undefined) {
  return Number(matter ?? 0) + Number(manner ?? 0)
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
  if (!selectedTeamA.value || !selectedTeamB.value) {
    submitError.value = t('チーム情報が不足しています。')
    return false
  }
  if (!identityReady.value) {
    submitError.value = t('参加者ホームでジャッジを選択してください。')
    return false
  }
  if (!winnerId.value && !allowLowTieWin.value) {
    submitError.value = t('勝者を選択してください。')
    return false
  }
  if (!scoresValid.value) {
    submitError.value = t('スコア入力を確認してください。')
    return false
  }
  if (!speakerSelectionValid.value) {
    submitError.value = t('スピーカー選択を確認してください。')
    return false
  }
  if (!allowLowTieWin.value && lowTieWarning.value) {
    submitError.value = t('低勝ち/同点勝ちは許可されていません。')
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
  const created = await submissions.submitBallot({
    tournamentId: tournamentId.value,
    round: Number(round.value),
    teamAId: teamAId.value,
    teamBId: teamBId.value,
    winnerId: winnerId.value || undefined,
    submittedEntityId: identityId.value || undefined,
    speakerIdsA: noSpeakerScore.value ? undefined : speakerIdsA.value,
    speakerIdsB: noSpeakerScore.value ? undefined : speakerIdsB.value,
    scoresA: noSpeakerScore.value ? [] : effectiveScoresA.value,
    scoresB: noSpeakerScore.value ? [] : effectiveScoresB.value,
    comment: comment.value,
    role: participant.value,
    matterA: useMatterManner.value ? matterA.value : undefined,
    mannerA: useMatterManner.value ? mannerA.value : undefined,
    matterB: useMatterManner.value ? matterB.value : undefined,
    mannerB: useMatterManner.value ? mannerB.value : undefined,
    bestA: bestEnabled.value ? bestA.value : undefined,
    bestB: bestEnabled.value ? bestB.value : undefined,
    poiA: poiEnabled.value ? poiA.value : undefined,
    poiB: poiEnabled.value ? poiB.value : undefined,
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

function goToTaskList() {
  successOpen.value = false
  router.push(taskListPath.value)
}

watch([selectedTeamA, selectedTeamB, noSpeakerScore, useMatterManner, rolesA, rolesB], () => {
  initScores()
})

watch([teamAId, teamBId], () => {
  if (winnerId.value && winnerId.value !== teamAId.value && winnerId.value !== teamBId.value) {
    winnerId.value = ''
  }
})

onMounted(() => {
  teams.fetchTeams(tournamentId.value)
  rounds.fetchRounds(tournamentId.value, { forcePublic: true })
  tournamentStore.fetchTournaments()
  stylesStore.fetchStyles()
  speakersStore.fetchSpeakers(tournamentId.value)
  window.addEventListener('keydown', onGlobalKeydown)
  const query = route.query
  teamAId.value = typeof query.teamA === 'string' ? query.teamA : ''
  teamBId.value = typeof query.teamB === 'string' ? query.teamB : ''
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  clearCountdown()
})
</script>

<style scoped>
.grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.ballot-sheet {
  gap: var(--space-4);
}

.sheet-title {
  margin: 0;
  font-size: 1.2rem;
}

.match-up {
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}

.team-heading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.team-column {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: #fcfdff;
}

.team-column-header {
  gap: 8px;
  align-items: center;
}

.side-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.gov-chip {
  background: #e0f2fe;
  color: #075985;
  border: 1px solid #93c5fd;
}

.opp-chip {
  background: #fef9c3;
  color: #92400e;
  border: 1px solid #fcd34d;
}

.field-label {
  color: var(--color-text);
  font-weight: 600;
}

.role-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: grid;
  gap: 8px;
  background: var(--color-surface);
}

.role-header {
  justify-content: space-between;
}

.small {
  font-size: 12px;
  gap: 6px;
}

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
  width: min(560px, 100%);
}

.success-modal {
  width: min(420px, 100%);
}

.success-actions {
  justify-content: flex-end;
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
