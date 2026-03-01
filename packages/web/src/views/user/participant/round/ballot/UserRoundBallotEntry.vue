<template>
  <section class="stack">
    <LoadingState v-if="teams.loading" />
    <p v-else-if="teams.error" class="error">{{ teams.error }}</p>

    <div v-else-if="selectedTeamA && selectedTeamB" class="stack">
      <div class="card stack identity-panel">
        <div class="row identity-head">
          <h4 class="identity-panel-title">{{ $t('提出・対戦情報') }}</h4>
          <span class="identity-kind-chip identity-kind-team">{{ $t('チーム評価') }}</span>
        </div>
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
        <label class="stack">
          <span class="field-label">{{ $t('提出者ジャッジ') }}</span>
          <select v-model="identityId">
            <option value="">{{ $t('未選択') }}</option>
            <option v-for="adj in submitterOptions" :key="adj._id" :value="adj._id">
              {{ adj.name }}
            </option>
          </select>
        </label>
        <div class="grid">
          <label class="stack">
            <span class="field-label">{{ $t('勝者') }}</span>
            <select v-model="winnerSelectionValue">
              <option value="">{{ $t('勝者を選択') }}</option>
              <option :value="selectedTeamA?._id">{{ teamAName }}</option>
              <option :value="selectedTeamB?._id">{{ teamBName }}</option>
              <option v-if="allowLowTieWin" :value="DRAW_WINNER_OPTION_VALUE">{{ $t('引き分け') }}</option>
            </select>
          </label>
        </div>
        <p v-if="!hasSubmitterCandidateRestriction" class="muted small">
          {{ $t('提出候補の制限がないため、全ジャッジを表示しています。') }}
        </p>
      </div>

      <div class="card stack ballot-sheet">
        <h4 class="sheet-title">{{ $t('スコア入力') }}</h4>
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
                <span class="role-token">{{ role.abbr ?? `#${role.order}` }}</span>
                <span class="role-description">{{ role.long ?? '' }}</span>
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
                {{ $t('Best Debater') }}
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
                <span class="role-token">{{ role.abbr ?? `#${role.order}` }}</span>
                <span class="role-description">{{ role.long ?? '' }}</span>
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
                {{ $t('Best Debater') }}
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

      <Button :loading="submissions.loading" :disabled="submitButtonDisabled" @click="requestSubmit">
        {{ $t('送信') }}
      </Button>
      <p v-if="validationError" class="error">{{ validationError }}</p>
      <p v-if="!scoreInputReady" class="muted">{{
        $t('採点設定を読み込み中です。通信状況を確認して再度お試しください。')
      }}</p>
      <p v-if="prefillNotice" class="muted">{{ prefillNotice }}</p>
        <p v-if="saved" class="muted">{{ $t('送信しました。') }}</p>
      </div>
    </div>

    <div v-else class="card stack">
      <p class="muted">{{ $t('スコアシートを開始するチームを選択してください。') }}</p>
      <Button variant="ghost" size="sm" :to="homePath">{{ $t('大会トップに戻る') }}</Button>
    </div>

    <div v-if="confirmOpen" class="modal-backdrop modal-backdrop--scroll" role="presentation">
      <div class="modal card stack confirm-modal" role="dialog" aria-modal="true">
        <h4>{{ $t('送信前の確認') }}</h4>
        <p class="muted">{{ $t('内容を確認してから送信してください。') }}</p>
        <div class="confirm-grid">
          <div class="confirm-card stack">
            <span class="muted small">{{ $t('評価タイプ') }}</span>
            <strong>{{ $t('チーム評価') }}</strong>
          </div>
          <div class="confirm-card stack">
            <span class="muted small">{{ $t('あなたの情報') }}</span>
            <strong>{{ selectedSubmitterName }}</strong>
            <span class="muted small">{{ $t('提出者ジャッジ') }}</span>
          </div>
          <div class="confirm-card stack">
            <span class="muted small">{{ $t('勝者') }}</span>
            <strong>{{ winnerName }}</strong>
          </div>
          <div v-if="!noSpeakerScore" class="confirm-card stack">
            <span class="muted small">{{ $t('合計') }}</span>
            <strong>{{ govLabel }} {{ totalScoreA }} / {{ oppLabel }} {{ totalScoreB }}</strong>
          </div>
          <div v-if="bestEnabled && !noSpeakerScore" class="confirm-card stack full">
            <span class="muted small">{{ $t('Best Debater') }}</span>
            <div v-if="bestDebaterSummaryItems.length > 0" class="confirm-marker-inline">
              <span
                v-for="item in bestDebaterSummaryItems"
                :key="item.key"
                class="confirm-marker-token"
              >
                <span class="confirm-marker-name">{{ item.name }}</span>
                <span class="side-chip" :class="item.sideClass">{{ item.sideLabel }}</span>
              </span>
            </div>
            <strong v-else class="confirm-marker-list">{{ $t('なし') }}</strong>
          </div>
          <div v-if="poiEnabled && !noSpeakerScore" class="confirm-card stack full">
            <span class="muted small">{{ $t('POI') }}</span>
            <div v-if="poiSummaryItems.length > 0" class="confirm-marker-inline">
              <span
                v-for="item in poiSummaryItems"
                :key="item.key"
                class="confirm-marker-token"
              >
                <span class="confirm-marker-name">{{ item.name }}</span>
                <span class="side-chip" :class="item.sideClass">{{ item.sideLabel }}</span>
              </span>
            </div>
            <strong v-else class="confirm-marker-list">{{ $t('なし') }}</strong>
          </div>
          <div class="confirm-card stack full">
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
import { useTeamsStore } from '@/stores/teams'
import { useRoundsStore } from '@/stores/rounds'
import { useSubmissionsStore } from '@/stores/submissions'
import { useTournamentStore } from '@/stores/tournament'
import { useStylesStore } from '@/stores/styles'
import { useSpeakersStore } from '@/stores/speakers'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { useDrawsStore } from '@/stores/draws'
import { useParticipantIdentity } from '@/composables/useParticipantIdentity'
import { useParticipantMode, appendParticipantMode } from '@/composables/useParticipantMode'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'
import { getSideShortLabel } from '@/utils/side-labels'
import {
  defaultSpeakerRange,
  getRangeForIndex,
  normalizeScoreRanges,
} from '@/utils/score'
import { toBooleanArray, toStringArray } from '@/utils/array-coercion'

const route = useRoute()
const router = useRouter()
const teams = useTeamsStore()
const rounds = useRoundsStore()
const submissions = useSubmissionsStore()
const tournamentStore = useTournamentStore()
const stylesStore = useStylesStore()
const speakersStore = useSpeakersStore()
const adjudicatorsStore = useAdjudicatorsStore()
const drawsStore = useDrawsStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const { participantMode } = useParticipantMode(route)
const round = computed(() => route.params.round as string)

const homePath = computed(() => {
  const query = new URLSearchParams()
  appendParticipantMode(query, participantMode.value)
  query.set('focusRound', round.value)
  query.set('focusType', 'ballot')
  const suffix = query.toString()
  return `/user/${tournamentId.value}/home${suffix ? `?${suffix}` : ''}`
})
const tournamentHomePath = computed(() => {
  const query = new URLSearchParams()
  appendParticipantMode(query, participantMode.value)
  const suffix = query.toString()
  return `/user/${tournamentId.value}/home${suffix ? `?${suffix}` : ''}`
})
const { identityId } = useParticipantIdentity(tournamentId, participantMode)

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

const teamAId = ref('')
const teamBId = ref('')
const DRAW_WINNER_OPTION_VALUE = '__draw__'
const winnerId = ref('')
const winnerDrawSelected = ref(false)
const comment = ref('')
const saved = ref(false)
const prefillNotice = ref('')
const confirmOpen = ref(false)
const successOpen = ref(false)
const confirmCountdown = ref(0)
const prefillAppliedMatchKey = ref('')
const LOCAL_BALLOT_PREFILL_STORAGE_PREFIX = 'utab:ballot-prefill'
let countdownTimer: number | null = null
let countdownDeadline = 0

function parseWinnerPolicyToken(
  value: unknown
): 'winner_id_then_score' | 'score_only' | 'draw_on_missing' | '' {
  if (value === 'winner_id_then_score' || value === 'score_only' || value === 'draw_on_missing') {
    return value
  }
  return ''
}

function roundAllowsWinnerScoreMismatch(roundUserDefinedData: unknown): boolean {
  if (!roundUserDefinedData || typeof roundUserDefinedData !== 'object') return true
  const userDefined = roundUserDefinedData as Record<string, unknown>
  if (typeof userDefined.allow_score_winner_mismatch === 'boolean') {
    return userDefined.allow_score_winner_mismatch
  }
  const compile =
    userDefined.compile && typeof userDefined.compile === 'object'
      ? (userDefined.compile as Record<string, unknown>)
      : null
  const compileOptions =
    compile?.options && typeof compile.options === 'object'
      ? (compile.options as Record<string, unknown>)
      : compile
  const winnerPolicy =
    parseWinnerPolicyToken(userDefined.winner_policy) ||
    parseWinnerPolicyToken(compileOptions?.winner_policy)
  return winnerPolicy !== 'score_only'
}

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
const allowWinnerScoreMismatch = computed(() =>
  roundAllowsWinnerScoreMismatch(roundConfig.value?.userDefinedData)
)
const effectiveWinnerId = computed(() => (winnerDrawSelected.value ? '' : winnerId.value))
const winnerSelectionValue = computed({
  get: () => (winnerDrawSelected.value ? DRAW_WINNER_OPTION_VALUE : winnerId.value),
  set: (value: string) => {
    if (value === DRAW_WINNER_OPTION_VALUE) {
      winnerDrawSelected.value = true
      winnerId.value = ''
      return
    }
    winnerDrawSelected.value = false
    winnerId.value = value
  },
})
const totalScoreA = computed(() =>
  effectiveScoresA.value.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0)
)
const totalScoreB = computed(() =>
  effectiveScoresB.value.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0)
)
const winnerSelectionMade = computed(() => Boolean(effectiveWinnerId.value) || winnerDrawSelected.value)
const hasComparableScores = computed(
  () => !noSpeakerScore.value && effectiveScoresA.value.length > 0 && effectiveScoresB.value.length > 0
)
const tiedScores = computed(() => !hasComparableScores.value || totalScoreA.value === totalScoreB.value)
const winnerRequiredMessage = computed(() =>
  allowLowTieWin.value ? t('勝者または引き分けを選択してください。') : t('勝者を選択してください。')
)
const winnerDecisionError = computed(() => {
  if (!winnerSelectionMade.value) return winnerRequiredMessage.value

  if (winnerDrawSelected.value) {
    if (!allowLowTieWin.value) return t('このラウンドでは引き分けは選択できません。')
    if (!allowWinnerScoreMismatch.value && !tiedScores.value) {
      return t('引き分けは同点時のみ選択できます。')
    }
    return ''
  }

  if (!allowWinnerScoreMismatch.value && hasComparableScores.value && !tiedScores.value) {
    if (effectiveWinnerId.value === teamAId.value && totalScoreA.value < totalScoreB.value) {
      return t('勝者は点数の大小と一致させてください。')
    }
    if (effectiveWinnerId.value === teamBId.value && totalScoreB.value < totalScoreA.value) {
      return t('勝者は点数の大小と一致させてください。')
    }
  }
  return ''
})
const identityReady = computed(() => Boolean(identityId.value))
const roundConfigReady = computed(() => Boolean(roundConfig.value))
const scoreInputReady = computed(() => {
  if (!roundConfigReady.value) return false
  if (noSpeakerScore.value) return true
  return Boolean(style.value) && rolesA.value.length > 0 && rolesB.value.length > 0
})

const canSubmit = computed(() => {
  if (!scoreInputReady.value) return false
  if (!selectedTeamA.value || !selectedTeamB.value) return false
  if (winnerDecisionError.value) return false
  if (!scoresValid.value || !speakerSelectionValid.value) return false
  if (!identityReady.value) return false
  return true
})
const validationError = computed(() => {
  if (!scoreInputReady.value) return ''
  if (!selectedTeamA.value || !selectedTeamB.value) return t('チーム情報が不足しています。')
  if (!identityReady.value) return t('提出・対戦情報で提出者ジャッジを選択してください。')
  if (winnerDecisionError.value) return winnerDecisionError.value
  if (!scoresValid.value) return t('スコア入力を確認してください。')
  if (!speakerSelectionValid.value) return t('スピーカー選択を確認してください。')
  return ''
})
const submitButtonDisabled = computed(() => submissions.loading || !canSubmit.value)
const winnerName = computed(() => {
  if (effectiveWinnerId.value === teamAId.value) return teamAName.value
  if (effectiveWinnerId.value === teamBId.value) return teamBName.value
  if (winnerDrawSelected.value) return t('引き分け')
  return t('未選択')
})
const selectedSubmitterName = computed(() => {
  const selectedId = String(identityId.value ?? '').trim()
  if (!selectedId) return t('未選択')
  return adjudicatorsStore.adjudicators.find((adj) => adj._id === selectedId)?.name ?? selectedId
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
const drawRowForCurrentMatch = computed(() => {
  const draw = drawsStore.draws.find((item) => Number(item.round) === Number(round.value))
  if (!draw || !teamAId.value || !teamBId.value) return null
  const expected = [teamAId.value, teamBId.value].sort()
  return (
    draw.allocation.find((row) => {
      const gov = String(row?.teams?.gov ?? '')
      const opp = String(row?.teams?.opp ?? '')
      const current = [gov, opp].sort()
      return current[0] === expected[0] && current[1] === expected[1]
    }) ?? null
  )
})
const querySubmitterCandidates = computed(() =>
  parseQueryList(route.query.submitters).map((id) => String(id ?? '').trim()).filter(Boolean)
)
const matchSubmitterCandidates = computed(() =>
  Array.from(
    new Set([
      ...(drawRowForCurrentMatch.value?.chairs ?? []),
      ...(drawRowForCurrentMatch.value?.panels ?? []),
    ])
  )
    .map((id) => String(id ?? '').trim())
    .filter(Boolean)
)
const submitterCandidateIds = computed(() => {
  if (querySubmitterCandidates.value.length > 0) return querySubmitterCandidates.value
  return matchSubmitterCandidates.value
})
const submitterCandidateSet = computed(() => new Set(submitterCandidateIds.value))
const hasSubmitterCandidateRestriction = computed(() => submitterCandidateSet.value.size > 0)
const submitterOptions = computed(() => {
  if (!hasSubmitterCandidateRestriction.value) return adjudicatorsStore.adjudicators
  return adjudicatorsStore.adjudicators.filter((adj) => submitterCandidateSet.value.has(adj._id))
})
const teamAName = computed(() => selectedTeamA.value?.name ?? '')
const teamBName = computed(() => selectedTeamB.value?.name ?? '')
type SpeakerEntry = { id: string; name: string }
type RoleDefinition = { order: number; abbr?: string; long?: string }

function collectMarkedSpeakers(
  flags: boolean[],
  roles: RoleDefinition[],
  speakerIds: string[],
  entries: SpeakerEntry[]
) {
  return roles
    .map((role, index) => {
      if (!flags[index]) return ''
      const selectedId = String(speakerIds[index] ?? '').trim()
      if (selectedId) {
        const name = entries.find((entry) => entry.id === selectedId)?.name
        if (name) return name
      }
      return role.abbr ?? `#${role.order}`
    })
    .filter(Boolean)
}

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

const bestDebaterSummary = computed(() => ({
  gov: collectMarkedSpeakers(bestA.value, rolesA.value, speakerIdsA.value, teamASpeakerEntries.value),
  opp: collectMarkedSpeakers(bestB.value, rolesB.value, speakerIdsB.value, teamBSpeakerEntries.value),
}))
const poiSummary = computed(() => ({
  gov: collectMarkedSpeakers(poiA.value, rolesA.value, speakerIdsA.value, teamASpeakerEntries.value),
  opp: collectMarkedSpeakers(poiB.value, rolesB.value, speakerIdsB.value, teamBSpeakerEntries.value),
}))

type MarkerSummaryItem = {
  key: string
  name: string
  sideLabel: string
  sideClass: 'gov-chip' | 'opp-chip'
}

function toMarkerSummaryItems(values: { gov: string[]; opp: string[] }): MarkerSummaryItem[] {
  return [
    ...values.gov.map((name, index) => ({
      key: `gov-${index}-${name}`,
      name,
      sideLabel: govLabel.value,
      sideClass: 'gov-chip' as const,
    })),
    ...values.opp.map((name, index) => ({
      key: `opp-${index}-${name}`,
      name,
      sideLabel: oppLabel.value,
      sideClass: 'opp-chip' as const,
    })),
  ]
}

const bestDebaterSummaryItems = computed(() => toMarkerSummaryItems(bestDebaterSummary.value))
const poiSummaryItems = computed(() => toMarkerSummaryItems(poiSummary.value))

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

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
}

function currentMatchKey() {
  const ids = [teamAId.value, teamBId.value].map((value) => value.trim()).filter(Boolean).sort()
  if (ids.length !== 2) return ''
  return ids.join('|')
}

type PrefillBallotPayload = {
  teamAId: string
  teamBId: string
  winnerId?: string
  draw?: boolean
  comment?: string
  speakerIdsA?: string[]
  speakerIdsB?: string[]
  scoresA?: number[]
  scoresB?: number[]
  matterA?: number[]
  mannerA?: number[]
  matterB?: number[]
  mannerB?: number[]
  bestA?: boolean[]
  bestB?: boolean[]
  poiA?: boolean[]
  poiB?: boolean[]
}

function normalizePrefillPayload(
  payload: Record<string, unknown> | null
): PrefillBallotPayload | null {
  if (!payload) return null
  const sourceA = String(payload.teamAId ?? '')
  const sourceB = String(payload.teamBId ?? '')
  if (!sourceA || !sourceB) return null
  const direct = sourceA === teamAId.value && sourceB === teamBId.value
  const reverse = sourceA === teamBId.value && sourceB === teamAId.value
  if (!direct && !reverse) return null

  const winnerRaw = String(payload.winnerId ?? '')
  const drawSelected = payload.draw === true || (payload.draw === undefined && !winnerRaw)
  const winnerId = drawSelected
    ? ''
    : reverse
      ? winnerRaw === sourceA
        ? sourceB
        : winnerRaw === sourceB
          ? sourceA
          : ''
      : winnerRaw

  const mapSide = <T>(aValue: T, bValue: T): [T, T] =>
    reverse ? [bValue, aValue] : [aValue, bValue]

  const [speakerIdsAValue, speakerIdsBValue] = mapSide(
    toStringArray(payload.speakerIdsA),
    toStringArray(payload.speakerIdsB)
  )
  const [scoresAValue, scoresBValue] = mapSide(
    toNumberArray(payload.scoresA),
    toNumberArray(payload.scoresB)
  )
  const [matterAValue, matterBValue] = mapSide(
    toNumberArray(payload.matterA),
    toNumberArray(payload.matterB)
  )
  const [mannerAValue, mannerBValue] = mapSide(
    toNumberArray(payload.mannerA),
    toNumberArray(payload.mannerB)
  )
  const [bestAValue, bestBValue] = mapSide(
    toBooleanArray(payload.bestA),
    toBooleanArray(payload.bestB)
  )
  const [poiAValue, poiBValue] = mapSide(
    toBooleanArray(payload.poiA),
    toBooleanArray(payload.poiB)
  )

  return {
    teamAId: teamAId.value,
    teamBId: teamBId.value,
    winnerId: winnerId || undefined,
    draw: drawSelected || undefined,
    comment: typeof payload.comment === 'string' ? payload.comment : undefined,
    speakerIdsA: speakerIdsAValue,
    speakerIdsB: speakerIdsBValue,
    scoresA: scoresAValue,
    scoresB: scoresBValue,
    matterA: matterAValue,
    mannerA: mannerAValue,
    matterB: matterBValue,
    mannerB: mannerBValue,
    bestA: bestAValue,
    bestB: bestBValue,
    poiA: poiAValue,
    poiB: poiBValue,
  }
}

function applyPrefillPayload(payload: PrefillBallotPayload) {
  winnerDrawSelected.value = payload.draw === true
  winnerId.value = payload.draw === true ? '' : (payload.winnerId ?? '')
  comment.value = payload.comment ?? ''

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

  speakerIdsA.value = payload.speakerIdsA?.slice(0, countA) ?? speakerIdsA.value
  speakerIdsB.value = payload.speakerIdsB?.slice(0, countB) ?? speakerIdsB.value
  bestA.value = Array.from({ length: countA }, (_, index) => Boolean(payload.bestA?.[index]))
  bestB.value = Array.from({ length: countB }, (_, index) => Boolean(payload.bestB?.[index]))
  poiA.value = Array.from({ length: countA }, (_, index) => Boolean(payload.poiA?.[index]))
  poiB.value = Array.from({ length: countB }, (_, index) => Boolean(payload.poiB?.[index]))

  if (useMatterManner.value) {
    const fallbackScoresA = payload.scoresA ?? []
    const fallbackScoresB = payload.scoresB ?? []
    const matterAValues =
      payload.matterA && payload.matterA.length > 0
        ? payload.matterA
        : Array.from({ length: countA }, (_, index) => fallbackScoresA[index] ?? scoreRange(index).default)
    const matterBValues =
      payload.matterB && payload.matterB.length > 0
        ? payload.matterB
        : Array.from({ length: countB }, (_, index) => fallbackScoresB[index] ?? scoreRange(index).default)
    const mannerAValues =
      payload.mannerA && payload.mannerA.length > 0
        ? payload.mannerA
        : Array.from({ length: countA }, () => 0)
    const mannerBValues =
      payload.mannerB && payload.mannerB.length > 0
        ? payload.mannerB
        : Array.from({ length: countB }, () => 0)
    matterA.value = Array.from({ length: countA }, (_, index) => Number(matterAValues[index] ?? 0))
    mannerA.value = Array.from({ length: countA }, (_, index) => Number(mannerAValues[index] ?? 0))
    matterB.value = Array.from({ length: countB }, (_, index) => Number(matterBValues[index] ?? 0))
    mannerB.value = Array.from({ length: countB }, (_, index) => Number(mannerBValues[index] ?? 0))
    scoresA.value = []
    scoresB.value = []
    return
  }

  scoresA.value = Array.from({ length: countA }, (_, index) => Number(payload.scoresA?.[index] ?? 0))
  scoresB.value = Array.from({ length: countB }, (_, index) => Number(payload.scoresB?.[index] ?? 0))
  matterA.value = []
  mannerA.value = []
  matterB.value = []
  mannerB.value = []
}

function localPrefillStorageKey(matchKey = currentMatchKey()) {
  const identityToken = String(identityId.value ?? '').trim()
  const roundNumber = Number(round.value)
  if (!identityToken || !matchKey || !Number.isFinite(roundNumber) || roundNumber < 1) return ''
  return [
    LOCAL_BALLOT_PREFILL_STORAGE_PREFIX,
    tournamentId.value,
    roundNumber,
    identityToken,
    matchKey,
  ].join(':')
}

function loadLocalPrefillPayload(matchKey = currentMatchKey()): PrefillBallotPayload | null {
  const storageKey = localPrefillStorageKey(matchKey)
  if (!storageKey) return null
  const stored = localStorage.getItem(storageKey)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>
    return normalizePrefillPayload(parsed)
  } catch {
    localStorage.removeItem(storageKey)
    return null
  }
}

function persistLocalPrefillPayload(payload: PrefillBallotPayload) {
  const matchKey = [payload.teamAId, payload.teamBId].map((value) => String(value ?? '').trim()).sort().join('|')
  const storageKey = localPrefillStorageKey(matchKey)
  if (!storageKey) return
  localStorage.setItem(storageKey, JSON.stringify(payload))
}

function buildCurrentPrefillPayload(): PrefillBallotPayload | null {
  const normalizedTeamAId = String(teamAId.value ?? '').trim()
  const normalizedTeamBId = String(teamBId.value ?? '').trim()
  if (!normalizedTeamAId || !normalizedTeamBId) return null
  return {
    teamAId: normalizedTeamAId,
    teamBId: normalizedTeamBId,
    winnerId: winnerDrawSelected.value ? undefined : (winnerId.value || undefined),
    draw: winnerDrawSelected.value || undefined,
    comment: comment.value,
    speakerIdsA: noSpeakerScore.value ? [] : speakerIdsA.value.slice(),
    speakerIdsB: noSpeakerScore.value ? [] : speakerIdsB.value.slice(),
    scoresA: noSpeakerScore.value ? [] : effectiveScoresA.value.slice(),
    scoresB: noSpeakerScore.value ? [] : effectiveScoresB.value.slice(),
    matterA: useMatterManner.value ? matterA.value.slice() : undefined,
    mannerA: useMatterManner.value ? mannerA.value.slice() : undefined,
    matterB: useMatterManner.value ? matterB.value.slice() : undefined,
    mannerB: useMatterManner.value ? mannerB.value.slice() : undefined,
    bestA: bestEnabled.value ? bestA.value.slice() : undefined,
    bestB: bestEnabled.value ? bestB.value.slice() : undefined,
    poiA: poiEnabled.value ? poiA.value.slice() : undefined,
    poiB: poiEnabled.value ? poiB.value.slice() : undefined,
  }
}

function tryApplyPrefill() {
  if (!identityReady.value || !identityId.value) {
    prefillAppliedMatchKey.value = ''
    prefillNotice.value = ''
    return
  }

  const key = currentMatchKey()
  if (!key) {
    prefillAppliedMatchKey.value = ''
    prefillNotice.value = ''
    return
  }
  if (prefillAppliedMatchKey.value === key) return

  const normalized = loadLocalPrefillPayload(key)
  if (!normalized) {
    prefillNotice.value = ''
    prefillAppliedMatchKey.value = key
    return
  }
  applyPrefillPayload(normalized)
  prefillNotice.value = t(
    'この端末に保存された前回入力を読み込みました。このラウンドの再送信はできません。修正が必要な場合は運営に報告してください。'
  )
  prefillAppliedMatchKey.value = key
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
  if (!scoreInputReady.value) {
    return false
  }
  if (!selectedTeamA.value || !selectedTeamB.value) {
    return false
  }
  if (!identityReady.value) {
    return false
  }
  if (winnerDecisionError.value) {
    return false
  }
  if (!scoresValid.value) {
    return false
  }
  if (!speakerSelectionValid.value) {
    return false
  }
  if (!canSubmit.value) {
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
  const created = await submissions.submitBallot({
    tournamentId: tournamentId.value,
    round: Number(round.value),
    teamAId: teamAId.value,
    teamBId: teamBId.value,
    winnerId: effectiveWinnerId.value || undefined,
    draw: winnerDrawSelected.value || undefined,
    submittedEntityId: identityId.value || undefined,
    speakerIdsA: noSpeakerScore.value ? undefined : speakerIdsA.value,
    speakerIdsB: noSpeakerScore.value ? undefined : speakerIdsB.value,
    scoresA: noSpeakerScore.value ? [] : effectiveScoresA.value,
    scoresB: noSpeakerScore.value ? [] : effectiveScoresB.value,
    comment: comment.value,
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
    const currentPayload = buildCurrentPrefillPayload()
    if (currentPayload) {
      persistLocalPrefillPayload(currentPayload)
    }
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

watch([selectedTeamA, selectedTeamB, noSpeakerScore, useMatterManner, rolesA, rolesB], () => {
  initScores()
})

watch([teamAId, teamBId], () => {
  if (winnerDrawSelected.value) return
  if (winnerId.value && winnerId.value !== teamAId.value && winnerId.value !== teamBId.value) {
    winnerId.value = ''
  }
})

watch(allowLowTieWin, (allowed) => {
  if (allowed) return
  winnerDrawSelected.value = false
})

watch(
  [identityId, round],
  () => {
    prefillAppliedMatchKey.value = ''
    tryApplyPrefill()
  },
  { immediate: true }
)

watch(
  [teamAId, teamBId, noSpeakerScore, useMatterManner],
  () => {
    prefillAppliedMatchKey.value = ''
    tryApplyPrefill()
  }
)

watch(
  () => route.query.submitter,
  (value) => {
    if (typeof value !== 'string') return
    const normalized = value.trim()
    if (!normalized) return
    if (identityId.value === normalized) return
    identityId.value = normalized
  },
  { immediate: true }
)

watch(
  [submitterOptions, hasSubmitterCandidateRestriction],
  ([options, restricted]) => {
    if (options.length === 0) return
    if (identityId.value && options.some((adj) => adj._id === identityId.value)) return
    if (options.length === 1) {
      identityId.value = options[0]._id
      return
    }
    if (restricted) {
      identityId.value = ''
    }
  },
  { immediate: true }
)

watch(
  [() => route.query.teamA, () => route.query.teamB],
  ([teamA, teamB]) => {
    teamAId.value = typeof teamA === 'string' ? teamA : ''
    teamBId.value = typeof teamB === 'string' ? teamB : ''
  },
  { immediate: true }
)

onMounted(() => {
  teams.fetchTeams(tournamentId.value)
  adjudicatorsStore.fetchAdjudicators(tournamentId.value)
  rounds.fetchRounds(tournamentId.value, { forcePublic: true })
  drawsStore.fetchDraws(tournamentId.value, undefined, { forcePublic: true })
  tournamentStore.fetchTournaments()
  stylesStore.fetchStyles()
  speakersStore.fetchSpeakers(tournamentId.value)
  window.addEventListener('keydown', onGlobalKeydown)
})

watch(tournamentId, () => {
  teams.fetchTeams(tournamentId.value)
  adjudicatorsStore.fetchAdjudicators(tournamentId.value)
  rounds.fetchRounds(tournamentId.value, { forcePublic: true })
  drawsStore.fetchDraws(tournamentId.value, undefined, { forcePublic: true })
  tournamentStore.fetchTournaments()
  stylesStore.fetchStyles()
  speakersStore.fetchSpeakers(tournamentId.value)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  clearCountdown()
  submissions.clearError()
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
  font-size: 1.2rem;
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

.identity-kind-team {
  color: #1d4ed8;
  border-color: #bfdbfe;
  background: #eff6ff;
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
  font-size: 14px;
  line-height: 1.4;
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
  align-items: baseline;
  gap: var(--space-2);
}

.role-token {
  color: var(--color-text);
  font-weight: 700;
}

.role-description {
  color: color-mix(in srgb, var(--color-text) 84%, white);
  font-size: 12px;
  font-weight: 500;
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

.modal-backdrop--scroll {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  align-items: flex-start;
}

.modal {
  width: min(560px, 100%);
  border-radius: var(--radius-lg);
}

.confirm-modal {
  margin-top: var(--space-5);
  margin-bottom: var(--space-5);
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

.confirm-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-3);
  gap: 6px;
}

.confirm-card strong {
  line-height: 1.3;
}

.confirm-marker-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.confirm-marker-token {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  padding: 4px 10px;
  font-size: 13px;
}

.confirm-marker-name {
  font-weight: 700;
}

.confirm-marker-list {
  line-height: 1.35;
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
