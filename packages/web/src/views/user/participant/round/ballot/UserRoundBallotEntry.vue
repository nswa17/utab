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
      </div>

      <div v-if="scoreInputReady" class="card stack stepper-card">
        <div class="row stepper-header">
          <h4 class="sheet-title">{{ $t('入力ステップ') }}</h4>
          <span class="muted small">{{ currentStepIndexDisplay }} / {{ ballotSteps.length }}</span>
        </div>
        <ol class="stepper-list">
          <li
            v-for="(step, index) in ballotSteps"
            :key="step.id"
            class="step-chip"
            :class="{
              'step-chip-active': index === activeStepIndex,
              'step-chip-complete': isStepCompleted(step.id),
            }"
          >
            <button
              type="button"
              class="step-chip-button"
              :disabled="!canGoToStep(index)"
              :aria-current="index === activeStepIndex ? 'step' : undefined"
              @click="goToStep(index)"
            >
              <span class="step-chip-index">{{ isStepCompleted(step.id) ? '✓' : index + 1 }}</span>
              <span class="step-chip-label">{{ step.label }}</span>
            </button>
          </li>
        </ol>
      </div>

      <div class="card stack ballot-sheet">
        <h4 class="sheet-title">{{ currentStepTitle }}</h4>

        <div v-if="scoreInputReady && isSubmitterStep" class="stack submitter-step">
          <label class="stack">
            <span class="field-label">{{ $t('提出者ジャッジ') }}</span>
            <select v-model="identityId">
              <option value="">{{ $t('未選択') }}</option>
              <option v-for="adj in submitterOptions" :key="adj._id" :value="adj._id">
                {{ adj.name }}
              </option>
            </select>
          </label>
          <p v-if="!hasSubmitterCandidateRestriction" class="muted small">
            {{ $t('提出候補の制限がないため、全ジャッジを表示しています。') }}
          </p>
        </div>

        <div v-else-if="scoreInputReady && isSpeakerStep" class="grid speaker-bulk-grid">
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
              <div v-for="(role, index) in rolesA" :key="`speaker-gov-${role.order}`" class="role-card">
                <div class="row role-header">
                  <span class="role-token">{{ role.abbr ?? `#${role.order}` }}</span>
                  <span class="role-description">{{ role.long ?? '' }}</span>
                </div>
                <label class="stack">
                  <select v-model="speakerIdsA[index]" :disabled="teamASpeakerEntries.length === 0">
                    <option value="">{{ $t('スピーカーを選択') }}</option>
                    <option
                      v-for="speaker in teamASpeakerEntries"
                      :key="speaker.id"
                      :value="speaker.id"
                    >
                      {{ speaker.name }}
                    </option>
                  </select>
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
              <div v-for="(role, index) in rolesB" :key="`speaker-opp-${role.order}`" class="role-card">
                <div class="row role-header">
                  <span class="role-token">{{ role.abbr ?? `#${role.order}` }}</span>
                  <span class="role-description">{{ role.long ?? '' }}</span>
                </div>
                <label class="stack">
                  <select v-model="speakerIdsB[index]" :disabled="teamBSpeakerEntries.length === 0">
                    <option value="">{{ $t('スピーカーを選択') }}</option>
                    <option
                      v-for="speaker in teamBSpeakerEntries"
                      :key="speaker.id"
                      :value="speaker.id"
                    >
                      {{ speaker.name }}
                    </option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="scoreInputReady && isScoreStep" class="stack role-sequence-panel">
          <div v-if="currentRoleEntry" class="stack role-sequence-main">
            <div class="row role-sequence-header">
              <div class="row role-sequence-team">
                <span class="side-chip" :class="currentRoleEntry.sideClass">{{
                  currentRoleEntry.sideLabel
                }}</span>
                <strong class="role-sequence-team-name">{{ currentRoleEntry.teamName }}</strong>
              </div>
              <span class="role-progress-text">{{ roleSequenceProgressText }}</span>
            </div>

            <div class="role-card role-card--focus">
              <div class="row role-header">
                <span class="role-token role-token--score">{{
                  currentRoleEntry.role.abbr ?? `#${currentRoleEntry.role.order}`
                }}</span>
                <span class="role-description role-description--score">{{
                  currentRoleEntry.role.long ?? ''
                }}</span>
              </div>

              <p class="selected-speaker-line">
                <strong class="selected-speaker-name">{{ activeRoleSpeakerLabel }}</strong>
              </p>

              <template v-if="useMatterManner">
                <label class="stack">
                  <span class="score-field-label">{{ $t('マター') }}</span>
                  <div class="row score-adjust-row">
                    <button
                      type="button"
                      class="score-adjust-btn"
                      @click="adjustCurrentRoleNumeric('matter', -1)"
                    >
                      -
                    </button>
                    <input
                      v-model.number="activeRoleMatter"
                      class="score-adjust-input"
                      type="number"
                      :min="activeRoleRange.from"
                      :max="activeRoleRange.to"
                      :step="activeRoleRange.unit"
                      @change="normalizeCurrentRoleNumeric('matter')"
                    />
                    <button
                      type="button"
                      class="score-adjust-btn"
                      @click="adjustCurrentRoleNumeric('matter', 1)"
                    >
                      +
                    </button>
                  </div>
                </label>
                <label class="stack">
                  <span class="score-field-label">{{ $t('マナー') }}</span>
                  <div class="row score-adjust-row">
                    <button
                      type="button"
                      class="score-adjust-btn"
                      @click="adjustCurrentRoleNumeric('manner', -1)"
                    >
                      -
                    </button>
                    <input
                      v-model.number="activeRoleManner"
                      class="score-adjust-input"
                      type="number"
                      :min="activeRoleRange.from"
                      :max="activeRoleRange.to"
                      :step="activeRoleRange.unit"
                      @change="normalizeCurrentRoleNumeric('manner')"
                    />
                    <button
                      type="button"
                      class="score-adjust-btn"
                      @click="adjustCurrentRoleNumeric('manner', 1)"
                    >
                      +
                    </button>
                  </div>
                </label>
              </template>
              <template v-else>
                <label class="stack">
                  <span class="score-field-label">{{ $t('スコア') }}</span>
                  <div class="row score-adjust-row">
                    <button
                      type="button"
                      class="score-adjust-btn"
                      @click="adjustCurrentRoleNumeric('score', -1)"
                    >
                      -
                    </button>
                    <input
                      v-model.number="activeRoleScore"
                      class="score-adjust-input"
                      type="number"
                      :min="activeRoleRange.from"
                      :max="activeRoleRange.to"
                      :step="activeRoleRange.unit"
                      @change="normalizeCurrentRoleNumeric('score')"
                    />
                    <button
                      type="button"
                      class="score-adjust-btn"
                      @click="adjustCurrentRoleNumeric('score', 1)"
                    >
                      +
                    </button>
                  </div>
                </label>
              </template>

              <div v-if="showActiveRoleTotalScore" class="stack">
                <span class="score-field-label">{{ $t('合計スコア') }}</span>
                <div class="score-total-box">{{ activeRoleTotalScore }}</div>
              </div>

              <div v-if="bestEnabled" class="row toggle-field">
                <span class="toggle-title">{{ $t('ベストディベーター') }}</span>
                <div class="award-choice" role="group" :aria-label="$t('ベストディベーター')">
                  <button
                    type="button"
                    class="award-choice-option"
                    :class="{ 'award-choice-option-active': !activeRoleBest }"
                    :aria-pressed="!activeRoleBest"
                    @click="activeRoleBest = false"
                  >
                    {{ $t('いいえ') }}
                  </button>
                  <button
                    type="button"
                    class="award-choice-option"
                    :class="{ 'award-choice-option-active': activeRoleBest }"
                    :aria-pressed="activeRoleBest"
                    @click="activeRoleBest = true"
                  >
                    {{ $t('はい') }}
                  </button>
                </div>
              </div>
              <div v-if="poiEnabled" class="row toggle-field">
                <span class="toggle-title">{{ $t('POI') }}</span>
                <div class="award-choice" role="group" :aria-label="$t('POI')">
                  <button
                    type="button"
                    class="award-choice-option"
                    :class="{ 'award-choice-option-active': !activeRolePoi }"
                    :aria-pressed="!activeRolePoi"
                    @click="activeRolePoi = false"
                  >
                    {{ $t('いいえ') }}
                  </button>
                  <button
                    type="button"
                    class="award-choice-option"
                    :class="{ 'award-choice-option-active': activeRolePoi }"
                    :aria-pressed="activeRolePoi"
                    @click="activeRolePoi = true"
                  >
                    {{ $t('はい') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="muted">{{ $t('入力可能なロールがありません。') }}</div>
        </div>

        <div v-else-if="scoreInputReady && isWinnerStep" class="stack winner-step">
          <label class="row winner-selection-row">
            <span class="field-label">{{ $t('勝者') }}</span>
            <select v-model="winnerSelectionValue">
              <option value="">{{ $t('勝者を選択') }}</option>
              <option :value="selectedTeamA?._id">{{ teamAName }}</option>
              <option :value="selectedTeamB?._id">{{ teamBName }}</option>
              <option v-if="allowLowTieWin" :value="DRAW_WINNER_OPTION_VALUE">
                {{ $t('引き分け') }}
              </option>
            </select>
          </label>
          <p v-if="noSpeakerScore" class="muted">
            {{ $t('このラウンドはスピーカースコアを入力しません。') }}
          </p>
          <p v-else class="muted small">
            {{ currentTotalSummaryText }}
          </p>
          <label class="stack">
            <span class="muted">{{ $t('コメント') }}</span>
            <textarea v-model="comment" rows="4" />
          </label>
        </div>

        <div v-if="scoreInputReady" class="row ballot-step-actions">
          <Button
            v-if="returnToConfirmAfterEdit"
            variant="secondary"
            size="sm"
            @click="returnToConfirmation"
          >
            {{ $t('確認画面に戻る') }}
          </Button>
          <Button v-if="!isFirstStep" variant="ghost" size="sm" @click="goToPreviousAction">
            {{ previousActionLabel }}
          </Button>
          <Button v-if="!isLastStep" size="sm" :disabled="stepActionDisabled" @click="goToNextAction">
            {{ nextActionLabel }}
          </Button>
          <Button
            v-else
            :loading="submissions.loading"
            :disabled="submitButtonDisabled"
            @click="requestSubmit"
          >
            {{ $t('確認へ') }}
          </Button>
        </div>
        <p v-if="validationError" class="error">{{ validationError }}</p>
        <p v-if="!scoreInputReady" class="muted">
          {{ $t('採点設定を読み込み中です。通信状況を確認して再度お試しください。') }}
        </p>
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
          </div>
          <div class="confirm-card stack">
            <span class="muted small">{{ $t('勝者') }}</span>
            <div class="confirm-winner-inline">
              <strong>{{ winnerName }}</strong>
              <span v-if="winnerSideClass" class="side-chip" :class="winnerSideClass">{{
                winnerSideLabel
              }}</span>
            </div>
          </div>
          <div v-if="!noSpeakerScore" class="confirm-card stack">
            <span class="muted small">{{ $t('合計') }}</span>
            <strong>{{ govLabel }} {{ totalScoreA }} / {{ oppLabel }} {{ totalScoreB }}</strong>
          </div>
          <div v-if="!noSpeakerScore" class="confirm-card stack full">
            <span class="muted small">{{ $t('スピーカー別内訳') }}</span>
            <div class="confirm-speaker-columns">
              <section
                v-for="team in confirmSpeakerTeams"
                :key="team.key"
                class="stack confirm-speaker-team"
                :class="team.panelClass"
              >
                <div class="row confirm-speaker-team-header">
                  <div class="row confirm-speaker-team-heading">
                    <span class="side-chip" :class="team.sideClass">{{ team.sideLabel }}</span>
                    <strong>{{ team.teamName }}</strong>
                  </div>
                  <span class="confirm-speaker-team-total">{{ team.totalLabel }}</span>
                </div>
                <div class="stack confirm-speaker-list">
                  <div
                    v-for="row in team.rows"
                    :key="row.key"
                    class="confirm-speaker-row"
                  >
                    <div class="stack confirm-speaker-main">
                      <div class="confirm-speaker-row-head">
                        <span class="confirm-role-token">{{ row.roleToken }}</span>
                        <strong class="confirm-speaker-row-name">{{ row.speakerName }}</strong>
                        <strong class="confirm-speaker-score">{{ row.scoreLabel }}</strong>
                      </div>
                      <div class="confirm-speaker-awards">
                        <span v-if="row.best" class="confirm-award-chip confirm-award-chip--best">{{
                          $t('ベストディベーター')
                        }}</span>
                        <span v-if="row.poi" class="confirm-award-chip confirm-award-chip--poi">{{
                          $t('POI')
                        }}</span>
                        <span v-if="!row.best && !row.poi" class="confirm-award-empty">{{
                          $t('付与なし')
                        }}</span>
                      </div>
                      <span class="muted tiny">{{ row.roleDescription }}</span>
                      <span v-if="row.scoreBreakdown" class="muted tiny">{{ row.scoreBreakdown }}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="confirm-speaker-edit"
                      @click="editConfirmSpeaker(row)"
                    >
                      {{ $t('編集') }}
                    </Button>
                  </div>
                </div>
              </section>
            </div>
          </div>
          <div class="confirm-card stack full">
            <span class="muted small">{{ $t('コメント') }}</span>
            <span>{{ comment.trim() || $t('なし') }}</span>
          </div>
        </div>
        <div class="row confirm-actions">
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
        <p class="muted">{{ $t('送信しました。') }}</p>
        <div class="success-vote-card stack" aria-live="polite">
          <span class="muted small">{{ $t('あなたの投票') }}</span>
          <div class="confirm-winner-inline">
            <strong>{{ winnerName }}</strong>
            <span v-if="winnerSideClass" class="side-chip" :class="winnerSideClass">{{
              winnerSideLabel
            }}</span>
          </div>
          <div v-if="selectedAwardSummaryRows.length > 0" class="stack success-award-summary">
            <span class="muted small">{{ $t('選択した賞') }}</span>
            <div v-for="row in selectedAwardSummaryRows" :key="row.key" class="success-award-row">
              <span class="row success-award-speaker">
                <span class="side-chip" :class="row.sideClass">{{ row.sideLabel }}</span>
                <strong>{{ row.speakerName }}</strong>
              </span>
              <span v-if="row.best" class="confirm-award-chip confirm-award-chip--best">{{
                $t('ベストディベーター')
              }}</span>
              <span v-if="row.poi" class="confirm-award-chip confirm-award-chip--poi">{{ $t('POI') }}</span>
            </div>
          </div>
        </div>
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
import {
  resolveRoundAwardSelectionValidationRules,
  validateAwardSelectionCounts,
} from '@/utils/award-selection'
import { getSideShortLabel } from '@/utils/side-labels'
import { defaultSpeakerRange, getRangeForIndex, normalizeScoreRanges } from '@/utils/score'
import { buildSpeakerRoleSequence } from '@/utils/style-speaker-sequence'
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
type BallotStepId = 'submitter' | 'speaker' | 'score' | 'winner'
type BallotStep = { id: BallotStepId; label: string; title: string }
type RoleSide = 'gov' | 'opp'
const DRAW_WINNER_OPTION_VALUE = '__draw__'
const winnerId = ref('')
const winnerDrawSelected = ref(false)
const comment = ref('')
const saved = ref(false)
const prefillNotice = ref('')
const confirmOpen = ref(false)
const successOpen = ref(false)
const confirmCountdown = ref(0)
const activeStepIndex = ref(0)
const activeRoleCursor = ref(0)
const preserveRoleCursorOnScoreStep = ref(false)
const returnToConfirmAfterEdit = ref(false)
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
  return (
    scoresA.every((score) => Number.isFinite(score)) &&
    scoresB.every((score) => Number.isFinite(score))
  )
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
const currentTotalSummaryText = computed(
  () =>
    t('現在の合計: {gov} {govScore} / {opp} {oppScore}', {
      gov: govLabel.value,
      govScore: totalScoreA.value,
      opp: oppLabel.value,
      oppScore: totalScoreB.value,
    })
)
const winnerSelectionMade = computed(
  () => Boolean(effectiveWinnerId.value) || winnerDrawSelected.value
)
const hasComparableScores = computed(
  () =>
    !noSpeakerScore.value && effectiveScoresA.value.length > 0 && effectiveScoresB.value.length > 0
)
const tiedScores = computed(
  () => !hasComparableScores.value || totalScoreA.value === totalScoreB.value
)
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

const ballotSteps = computed<BallotStep[]>(() => {
  if (noSpeakerScore.value) {
    return [
      { id: 'submitter', label: t('提出者入力'), title: t('提出者入力') },
      { id: 'winner', label: t('勝者入力'), title: t('勝者入力') },
    ]
  }
  return [
    { id: 'submitter', label: t('提出者入力'), title: t('提出者入力') },
    { id: 'speaker', label: t('スピーカー入力'), title: t('スピーカー入力') },
    { id: 'score', label: t('スコア入力'), title: t('スコア入力') },
    { id: 'winner', label: t('勝者入力'), title: t('勝者入力') },
  ]
})
const currentStepId = computed<BallotStepId>(
  () => ballotSteps.value[activeStepIndex.value]?.id ?? 'winner'
)
const currentStepTitle = computed(
  () => ballotSteps.value[activeStepIndex.value]?.title ?? t('勝者入力')
)
const currentStepIndexDisplay = computed(() =>
  Math.min(activeStepIndex.value + 1, Math.max(1, ballotSteps.value.length))
)
const isSubmitterStep = computed(() => currentStepId.value === 'submitter')
const isSpeakerStep = computed(() => currentStepId.value === 'speaker')
const isScoreStep = computed(() => currentStepId.value === 'score')
const isWinnerStep = computed(() => currentStepId.value === 'winner')
const isFirstStep = computed(() => activeStepIndex.value <= 0)
const isLastStep = computed(() => activeStepIndex.value >= ballotSteps.value.length - 1)
const speakerStepError = computed(() => {
  if (noSpeakerScore.value) return ''
  if (!speakerSelectionValid.value) return t('スピーカー選択を確認してください。')
  return ''
})
const scoreStepError = computed(() => {
  if (noSpeakerScore.value) return ''
  if (!scoresValid.value) return t('スコア入力を確認してください。')
  return ''
})
const submitterStepError = computed(() => {
  if (!identityReady.value) return t('提出者ジャッジを選択してください。')
  return ''
})
const winnerStepError = computed(() => {
  if (winnerDecisionError.value) return winnerDecisionError.value
  if (awardSelectionError.value) return awardSelectionError.value
  return ''
})

const canSubmit = computed(() => {
  if (!scoreInputReady.value) return false
  if (!selectedTeamA.value || !selectedTeamB.value) return false
  if (winnerDecisionError.value) return false
  if (awardSelectionError.value) return false
  if (!scoresValid.value || !speakerSelectionValid.value) return false
  if (!identityReady.value) return false
  return true
})
const validationError = computed(() => {
  if (!scoreInputReady.value) return ''
  if (!selectedTeamA.value || !selectedTeamB.value) return t('チーム情報が不足しています。')
  if (isSubmitterStep.value) return submitterStepError.value
  if (isSpeakerStep.value) return speakerStepError.value || submitterStepError.value
  if (isScoreStep.value) return scoreStepError.value || speakerStepError.value || submitterStepError.value
  return winnerStepError.value || scoreStepError.value || speakerStepError.value || submitterStepError.value
})
const stepActionDisabled = computed(() => {
  if (submissions.loading || !scoreInputReady.value) return true
  if (isSubmitterStep.value) return Boolean(submitterStepError.value)
  if (isSpeakerStep.value) return Boolean(speakerStepError.value || submitterStepError.value)
  if (isScoreStep.value)
    return Boolean(scoreStepError.value || speakerStepError.value || submitterStepError.value)
  return false
})
const submitButtonDisabled = computed(() => submissions.loading || !canSubmit.value)
const winnerName = computed(() => {
  if (effectiveWinnerId.value === teamAId.value) return teamAName.value
  if (effectiveWinnerId.value === teamBId.value) return teamBName.value
  if (winnerDrawSelected.value) return t('引き分け')
  return t('未選択')
})
const winnerSideClass = computed<'' | 'gov-chip' | 'opp-chip'>(() => {
  if (effectiveWinnerId.value === teamAId.value) return 'gov-chip'
  if (effectiveWinnerId.value === teamBId.value) return 'opp-chip'
  return ''
})
const winnerSideLabel = computed(() => {
  if (winnerSideClass.value === 'gov-chip') return govLabel.value
  if (winnerSideClass.value === 'opp-chip') return oppLabel.value
  return ''
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
  parseQueryList(route.query.submitters)
    .map((id) => String(id ?? '').trim())
    .filter(Boolean)
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

function selectedSpeakerLabel(
  entries: SpeakerEntry[],
  speakerIds: string[],
  role: RoleDefinition,
  index: number
) {
  const selectedId = String(speakerIds[index] ?? '').trim()
  if (selectedId) {
    const selected = entries.find((entry) => entry.id === selectedId)
    if (selected) return selected.name
  }
  return role.abbr ?? `#${role.order}`
}

const activeRoleSpeakerLabel = computed(() => {
  const entry = currentRoleEntry.value
  if (!entry) return ''
  const speakerIds = entry.side === 'gov' ? speakerIdsA.value : speakerIdsB.value
  return selectedSpeakerLabel(activeRoleSpeakerEntries.value, speakerIds, entry.role, entry.index)
})

function countDecimals(value: number) {
  const text = String(value)
  const pointIndex = text.indexOf('.')
  if (pointIndex < 0) return 0
  return Math.max(0, text.length - pointIndex - 1)
}

function clampByRange(value: number, index: number) {
  const range = scoreRange(index)
  const unit = Math.max(0.01, Number(range.unit) || 1)
  const from = Number(range.from)
  const to = Number(range.to)
  if (!Number.isFinite(value)) return range.default
  const stepped = from + Math.round((value - from) / unit) * unit
  const bounded = Math.min(to, Math.max(from, stepped))
  const decimals = Math.max(countDecimals(unit), countDecimals(from), countDecimals(to), 0)
  return Number(bounded.toFixed(decimals))
}

function readNumericValue(side: RoleSide, category: 'score' | 'matter' | 'manner', index: number) {
  const source =
    category === 'score'
      ? side === 'gov'
        ? scoresA.value
        : scoresB.value
      : category === 'matter'
        ? side === 'gov'
          ? matterA.value
          : matterB.value
        : side === 'gov'
          ? mannerA.value
          : mannerB.value
  const raw = Number(source[index] ?? scoreRange(index).default)
  if (!Number.isFinite(raw)) return scoreRange(index).default
  return clampByRange(raw, index)
}

function normalizeDisplayValue(value: number, index: number) {
  if (!Number.isFinite(value)) return scoreRange(index).default
  const decimals = Math.max(countDecimals(Number(scoreRange(index).unit) || 1), 0)
  return Number(value.toFixed(decimals))
}

function writeNumericValue(
  side: RoleSide,
  category: 'score' | 'matter' | 'manner',
  index: number,
  value: number
) {
  const normalized = clampByRange(value, index)
  if (category === 'score') {
    if (side === 'gov') {
      scoresA.value[index] = normalized
      return
    }
    scoresB.value[index] = normalized
    return
  }
  if (category === 'matter') {
    if (side === 'gov') {
      matterA.value[index] = normalized
      return
    }
    matterB.value[index] = normalized
    return
  }
  if (side === 'gov') {
    mannerA.value[index] = normalized
    return
  }
  mannerB.value[index] = normalized
}

const activeRoleRange = computed(() => scoreRange(currentRoleEntry.value?.index ?? 0))

const activeRoleScore = computed({
  get: () => {
    if (!currentRoleEntry.value) return activeRoleRange.value.default
    return readNumericValue(currentRoleEntry.value.side, 'score', currentRoleEntry.value.index)
  },
  set: (value: number) => {
    if (!currentRoleEntry.value) return
    writeNumericValue(
      currentRoleEntry.value.side,
      'score',
      currentRoleEntry.value.index,
      Number(value)
    )
  },
})

const activeRoleMatter = computed({
  get: () => {
    if (!currentRoleEntry.value) return activeRoleRange.value.default
    return readNumericValue(currentRoleEntry.value.side, 'matter', currentRoleEntry.value.index)
  },
  set: (value: number) => {
    if (!currentRoleEntry.value) return
    writeNumericValue(
      currentRoleEntry.value.side,
      'matter',
      currentRoleEntry.value.index,
      Number(value)
    )
  },
})

const activeRoleManner = computed({
  get: () => {
    if (!currentRoleEntry.value) return activeRoleRange.value.default
    return readNumericValue(currentRoleEntry.value.side, 'manner', currentRoleEntry.value.index)
  },
  set: (value: number) => {
    if (!currentRoleEntry.value) return
    writeNumericValue(
      currentRoleEntry.value.side,
      'manner',
      currentRoleEntry.value.index,
      Number(value)
    )
  },
})

function readToggleValue(side: RoleSide, category: 'best' | 'poi', index: number) {
  const source =
    category === 'best'
      ? side === 'gov'
        ? bestA.value
        : bestB.value
      : side === 'gov'
        ? poiA.value
        : poiB.value
  return Boolean(source[index])
}

function writeToggleValue(side: RoleSide, category: 'best' | 'poi', index: number, value: boolean) {
  if (category === 'best') {
    if (side === 'gov') {
      bestA.value[index] = value
      return
    }
    bestB.value[index] = value
    return
  }
  if (side === 'gov') {
    poiA.value[index] = value
    return
  }
  poiB.value[index] = value
}

const activeRoleBest = computed({
  get: () => {
    if (!currentRoleEntry.value) return false
    return readToggleValue(currentRoleEntry.value.side, 'best', currentRoleEntry.value.index)
  },
  set: (value: boolean) => {
    if (!currentRoleEntry.value) return
    writeToggleValue(currentRoleEntry.value.side, 'best', currentRoleEntry.value.index, value)
  },
})

const activeRolePoi = computed({
  get: () => {
    if (!currentRoleEntry.value) return false
    return readToggleValue(currentRoleEntry.value.side, 'poi', currentRoleEntry.value.index)
  },
  set: (value: boolean) => {
    if (!currentRoleEntry.value) return
    writeToggleValue(currentRoleEntry.value.side, 'poi', currentRoleEntry.value.index, value)
  },
})

const activeRoleTotalScore = computed(() => {
  const entry = currentRoleEntry.value
  if (!entry) return 0
  if (useMatterManner.value) {
    const total =
      readNumericValue(entry.side, 'matter', entry.index) +
      readNumericValue(entry.side, 'manner', entry.index)
    return normalizeDisplayValue(total, entry.index)
  }
  return normalizeDisplayValue(readNumericValue(entry.side, 'score', entry.index), entry.index)
})
const showActiveRoleTotalScore = computed(() => useMatterManner.value)

function adjustCurrentRoleNumeric(category: 'score' | 'matter' | 'manner', direction: -1 | 1) {
  const entry = currentRoleEntry.value
  if (!entry) return
  const delta = scoreRange(entry.index).unit * direction
  const current = readNumericValue(entry.side, category, entry.index)
  writeNumericValue(entry.side, category, entry.index, current + delta)
}

function normalizeCurrentRoleNumeric(category: 'score' | 'matter' | 'manner') {
  const entry = currentRoleEntry.value
  if (!entry) return
  const current = readNumericValue(entry.side, category, entry.index)
  writeNumericValue(entry.side, category, entry.index, current)
}

function goToNextRole() {
  if (isLastRoleCursor.value) return
  activeRoleCursor.value = normalizeRoleCursor(activeRoleCursor.value + 1)
}

function goToPreviousRole() {
  if (isFirstRoleCursor.value) return
  activeRoleCursor.value = normalizeRoleCursor(activeRoleCursor.value - 1)
}

function speakerEntriesFromDetail(team: any): SpeakerEntry[] {
  if (!team) return []
  const detail = team.details?.find((d: any) => Number(d.r) === Number(round.value))
  const ids = (detail?.speakers ?? []).map((id: string) => String(id)).filter(Boolean)
  if (ids.length === 0 && Array.isArray(team?.template?.speakers)) {
    const templateIds = team.template.speakers.map((id: any) => String(id)).filter(Boolean)
    return templateIds.map((id: string) => ({
      id,
      name: speakersStore.speakers.find((speaker) => speaker._id === id)?.name ?? id,
    }))
  }
  if (ids.length === 0) return []
  return ids.map((id: string) => ({
    id,
    name: speakersStore.speakers.find((speaker) => speaker._id === id)?.name ?? id,
  }))
}

const teamASpeakerEntries = computed(() => {
  return speakerEntriesFromDetail(selectedTeamA.value)
})

const teamBSpeakerEntries = computed(() => {
  return speakerEntriesFromDetail(selectedTeamB.value)
})

const roundConfig = computed(() => rounds.rounds.find((item) => item.round === Number(round.value)))
const noSpeakerScore = computed(() => roundConfig.value?.userDefinedData?.no_speaker_score === true)
const awardSelectionRules = computed(() =>
  resolveRoundAwardSelectionValidationRules(roundConfig.value?.userDefinedData)
)
const useMatterManner = computed(
  () =>
    !noSpeakerScore.value && roundConfig.value?.userDefinedData?.score_by_matter_manner !== false
)
const bestEnabled = computed(() => awardSelectionRules.value.best.enabled)
const poiEnabled = computed(() => awardSelectionRules.value.poi.enabled)

const tournament = computed(() =>
  tournamentStore.tournaments.find((item) => item._id === tournamentId.value)
)
const style = computed(() => stylesStore.styles.find((item) => item.id === tournament.value?.style))
const govLabel = computed(() => getSideShortLabel(style.value, 'gov', 'Gov'))
const oppLabel = computed(() => getSideShortLabel(style.value, 'opp', 'Opp'))
const speakerRanges = computed(() => normalizeScoreRanges(style.value?.range, defaultSpeakerRange))

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

type RoleSequenceEntry = {
  key: string
  side: RoleSide
  index: number
  role: RoleDefinition
  teamName: string
  sideLabel: string
  sideClass: 'gov-chip' | 'opp-chip'
}

const roleInputSequence = computed<RoleSequenceEntry[]>(() => {
  return buildSpeakerRoleSequence(style.value?.speaker_sequence, {
    gov: rolesA.value.length,
    opp: rolesB.value.length,
  })
    .map((entry, sequenceIndex) => {
      const role = entry.side === 'gov' ? rolesA.value[entry.index] : rolesB.value[entry.index]
      if (!role) return null
      return {
        key: `${entry.side}-${role.order}-${entry.index}-${sequenceIndex}`,
        side: entry.side,
        index: entry.index,
        role,
        teamName: entry.side === 'gov' ? teamAName.value : teamBName.value,
        sideLabel: entry.side === 'gov' ? govLabel.value : oppLabel.value,
        sideClass: entry.side === 'gov' ? 'gov-chip' : 'opp-chip',
      } satisfies RoleSequenceEntry
    })
    .filter((entry): entry is RoleSequenceEntry => entry !== null)
})

function normalizeRoleCursor(index: number) {
  if (roleInputSequence.value.length === 0) return 0
  return Math.min(Math.max(index, 0), roleInputSequence.value.length - 1)
}

const currentRoleEntry = computed(
  () => roleInputSequence.value[normalizeRoleCursor(activeRoleCursor.value)] ?? null
)
const currentRoleDisplayIndex = computed(() =>
  Math.min(activeRoleCursor.value + 1, Math.max(1, roleInputSequence.value.length))
)
const roleSequenceProgressText = computed(() => {
  const total = Math.max(1, roleInputSequence.value.length)
  const current = Math.min(currentRoleDisplayIndex.value, total)
  return t('ロール {current} / {total}', { current, total })
})
const isFirstRoleCursor = computed(() => activeRoleCursor.value <= 0)
const isLastRoleCursor = computed(
  () => activeRoleCursor.value >= Math.max(0, roleInputSequence.value.length - 1)
)
const activeRoleSpeakerEntries = computed(() => {
  if (!currentRoleEntry.value) return []
  return currentRoleEntry.value.side === 'gov'
    ? teamASpeakerEntries.value
    : teamBSpeakerEntries.value
})

type ConfirmSpeakerRow = {
  key: string
  side: RoleSide
  index: number
  roleToken: string
  roleDescription: string
  speakerName: string
  scoreLabel: string
  scoreBreakdown: string
  best: boolean
  poi: boolean
}

type ConfirmSpeakerTeam = {
  key: string
  teamName: string
  sideLabel: string
  sideClass: 'gov-chip' | 'opp-chip'
  panelClass: 'confirm-speaker-team--gov' | 'confirm-speaker-team--opp'
  totalLabel: string
  rows: ConfirmSpeakerRow[]
}

type SelectedAwardSummaryRow = {
  key: string
  speakerName: string
  sideLabel: string
  sideClass: 'gov-chip' | 'opp-chip'
  best: boolean
  poi: boolean
}

function formatScoreValue(value: number, index: number) {
  return String(normalizeDisplayValue(Number(value ?? 0), index))
}

function formatRoleDescription(role: RoleDefinition) {
  return role.long?.trim() || t('スピーカー {index}', { index: role.order })
}

function buildConfirmSpeakerRows(
  side: RoleSide,
  roles: RoleDefinition[],
  speakerIds: string[],
  entries: SpeakerEntry[],
  scores: number[],
  matter: number[],
  manner: number[],
  bestFlags: boolean[],
  poiFlags: boolean[]
) {
  return roles.map((role, index) => {
    const scoreValue = useMatterManner.value
      ? speakerTotal(matter[index], manner[index])
      : Number(scores[index] ?? 0)
    const scoreBreakdown = useMatterManner.value
      ? t('マター {matter} / マナー {manner}', {
          matter: formatScoreValue(matter[index] ?? 0, index),
          manner: formatScoreValue(manner[index] ?? 0, index),
        })
      : ''

    return {
      key: `${side}-${role.order}-${index}`,
      side,
      index,
      roleToken: role.abbr ?? `#${role.order}`,
      roleDescription: formatRoleDescription(role),
      speakerName: selectedSpeakerLabel(entries, speakerIds, role, index),
      scoreLabel: t('{score}点', { score: formatScoreValue(scoreValue, index) }),
      scoreBreakdown,
      best: Boolean(bestFlags[index]),
      poi: Boolean(poiFlags[index]),
    } satisfies ConfirmSpeakerRow
  })
}

function buildConfirmSpeakerTeam(
  side: RoleSide,
  teamName: string,
  roles: RoleDefinition[],
  speakerIds: string[],
  entries: SpeakerEntry[],
  scores: number[],
  matter: number[],
  manner: number[],
  bestFlags: boolean[],
  poiFlags: boolean[]
) {
  const total = side === 'gov' ? totalScoreA.value : totalScoreB.value
  return {
    key: `${side}-${teamName}`,
    teamName,
    sideLabel: side === 'gov' ? govLabel.value : oppLabel.value,
    sideClass: side === 'gov' ? 'gov-chip' : 'opp-chip',
    panelClass: side === 'gov' ? 'confirm-speaker-team--gov' : 'confirm-speaker-team--opp',
    totalLabel: t('合計 {score}点', { score: formatScoreValue(total, 0) }),
    rows: buildConfirmSpeakerRows(
      side,
      roles,
      speakerIds,
      entries,
      scores,
      matter,
      manner,
      bestFlags,
      poiFlags
    ),
  } satisfies ConfirmSpeakerTeam
}

const confirmSpeakerTeams = computed(() => [
  buildConfirmSpeakerTeam(
    'gov',
    teamAName.value,
    rolesA.value,
    speakerIdsA.value,
    teamASpeakerEntries.value,
    effectiveScoresA.value,
    matterA.value,
    mannerA.value,
    bestA.value,
    poiA.value
  ),
  buildConfirmSpeakerTeam(
    'opp',
    teamBName.value,
    rolesB.value,
    speakerIdsB.value,
    teamBSpeakerEntries.value,
    effectiveScoresB.value,
    matterB.value,
    mannerB.value,
    bestB.value,
    poiB.value
  ),
])

const selectedAwardSummaryRows = computed<SelectedAwardSummaryRow[]>(() =>
  confirmSpeakerTeams.value.flatMap((team) =>
    team.rows
      .filter((row) => row.best || row.poi)
      .map((row) => ({
        key: `award-${row.key}`,
        speakerName: row.speakerName,
        sideLabel: team.sideLabel,
        sideClass: team.sideClass,
        best: row.best,
        poi: row.poi,
      }))
  )
)

const awardSelectionError = computed(() => {
  const violation = validateAwardSelectionCounts(
    {
      bestA: bestA.value,
      bestB: bestB.value,
      poiA: poiA.value,
      poiB: poiB.value,
    },
    awardSelectionRules.value
  )
  if (!violation) return ''
  if (violation.kind === 'best') {
    return t('ベストディベーターは{min}〜{max}人選択してください。', {
      min: violation.min,
      max: violation.max,
    })
  }
  return t('POIは{min}〜{max}人選択してください。', {
    min: violation.min,
    max: violation.max,
  })
})

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

function reconcileSpeakerIds(current: string[], entries: SpeakerEntry[], roles: RoleDefinition[]) {
  const available = new Set(entries.map((entry) => entry.id))
  return roles.map((_role, index) => {
    const existing = current[index]
    if (existing && available.has(existing)) return existing
    return ''
  })
}

function initSpeakerSelections() {
  if (noSpeakerScore.value) {
    speakerIdsA.value = []
    speakerIdsB.value = []
    return
  }
  speakerIdsA.value = reconcileSpeakerIds(
    speakerIdsA.value,
    teamASpeakerEntries.value,
    rolesA.value
  )
  speakerIdsB.value = reconcileSpeakerIds(
    speakerIdsB.value,
    teamBSpeakerEntries.value,
    rolesB.value
  )
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

function speakerTotal(matter: number | undefined, manner: number | undefined) {
  return Number(matter ?? 0) + Number(manner ?? 0)
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
}

function currentMatchKey() {
  const ids = [teamAId.value, teamBId.value]
    .map((value) => value.trim())
    .filter(Boolean)
    .sort()
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

  const mapSide = <T,>(aValue: T, bValue: T): [T, T] =>
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
  const [poiAValue, poiBValue] = mapSide(toBooleanArray(payload.poiA), toBooleanArray(payload.poiB))

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
        : Array.from(
            { length: countA },
            (_, index) => fallbackScoresA[index] ?? scoreRange(index).default
          )
    const matterBValues =
      payload.matterB && payload.matterB.length > 0
        ? payload.matterB
        : Array.from(
            { length: countB },
            (_, index) => fallbackScoresB[index] ?? scoreRange(index).default
          )
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

  scoresA.value = Array.from({ length: countA }, (_, index) =>
    Number(payload.scoresA?.[index] ?? 0)
  )
  scoresB.value = Array.from({ length: countB }, (_, index) =>
    Number(payload.scoresB?.[index] ?? 0)
  )
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
  const matchKey = [payload.teamAId, payload.teamBId]
    .map((value) => String(value ?? '').trim())
    .sort()
    .join('|')
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
    winnerId: winnerDrawSelected.value ? undefined : winnerId.value || undefined,
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

function normalizeStepIndex(index: number) {
  if (ballotSteps.value.length === 0) return 0
  return Math.min(Math.max(index, 0), ballotSteps.value.length - 1)
}

function goToNextStep() {
  if (isLastStep.value || stepActionDisabled.value) return
  activeStepIndex.value = normalizeStepIndex(activeStepIndex.value + 1)
}

function goToPreviousStep() {
  if (isFirstStep.value) return
  activeStepIndex.value = normalizeStepIndex(activeStepIndex.value - 1)
}

function goToStep(index: number) {
  if (!canGoToStep(index)) return
  activeStepIndex.value = normalizeStepIndex(index)
}

function canGoToStep(index: number) {
  if (submissions.loading || !scoreInputReady.value) return false
  return index <= activeStepIndex.value
}

const previousActionLabel = computed(() => {
  if (isScoreStep.value && !isFirstRoleCursor.value) return t('前のロール')
  return t('戻る')
})

const nextActionLabel = computed(() => {
  if (isScoreStep.value && !isLastRoleCursor.value) return t('次のロール')
  return t('次へ')
})

function goToPreviousAction() {
  if (isScoreStep.value && !isFirstRoleCursor.value) {
    goToPreviousRole()
    return
  }
  goToPreviousStep()
}

function goToNextAction() {
  if (isScoreStep.value && !isLastRoleCursor.value) {
    goToNextRole()
    return
  }
  goToNextStep()
}

function isStepCompleted(stepId: BallotStepId) {
  const index = ballotSteps.value.findIndex((step) => step.id === stepId)
  if (index === -1) return false
  return index < activeStepIndex.value
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

function openConfirmation() {
  saved.value = false
  submissions.clearError()
  if (!validateBeforeSubmit()) return false
  confirmOpen.value = true
  startCountdown(3)
  return true
}

function requestSubmit() {
  openConfirmation()
}

function returnToConfirmation() {
  if (openConfirmation()) {
    returnToConfirmAfterEdit.value = false
  }
}

function closeConfirm() {
  confirmOpen.value = false
  clearCountdown()
  submissions.clearError()
}

function editConfirmSpeaker(row: ConfirmSpeakerRow) {
  const roleCursor = roleInputSequence.value.findIndex(
    (entry) => entry.side === row.side && entry.index === row.index
  )
  const scoreStepIndex = ballotSteps.value.findIndex((step) => step.id === 'score')
  if (roleCursor === -1 || scoreStepIndex === -1) return

  closeConfirm()
  returnToConfirmAfterEdit.value = true
  preserveRoleCursorOnScoreStep.value = true
  activeRoleCursor.value = roleCursor
  activeStepIndex.value = scoreStepIndex
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
    returnToConfirmAfterEdit.value = false
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

watch(
  ballotSteps,
  () => {
    activeStepIndex.value = normalizeStepIndex(activeStepIndex.value)
  },
  { immediate: true }
)

watch(
  roleInputSequence,
  () => {
    activeRoleCursor.value = normalizeRoleCursor(activeRoleCursor.value)
  },
  { immediate: true }
)

watch(currentStepId, (nextStep, previousStep) => {
  if (nextStep === previousStep) return
  if (nextStep === 'speaker') {
    activeRoleCursor.value = 0
    return
  }
  if (nextStep === 'score') {
    if (preserveRoleCursorOnScoreStep.value) {
      preserveRoleCursorOnScoreStep.value = false
      return
    }
    if (previousStep === 'winner') {
      activeRoleCursor.value = normalizeRoleCursor(roleInputSequence.value.length - 1)
      return
    }
    activeRoleCursor.value = 0
  }
})

watch([teamAId, teamBId], ([nextTeamA, nextTeamB], [prevTeamA, prevTeamB]) => {
  if (nextTeamA !== prevTeamA || nextTeamB !== prevTeamB) {
    activeStepIndex.value = 0
    activeRoleCursor.value = 0
    returnToConfirmAfterEdit.value = false
  }
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

watch([teamAId, teamBId, noSpeakerScore, useMatterManner], () => {
  prefillAppliedMatchKey.value = ''
  tryApplyPrefill()
})

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
  font-size: clamp(1.02rem, 3.2vw, 1.16rem);
  line-height: 1.2;
}

.stepper-card {
  gap: var(--space-3);
}

.stepper-header {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.stepper-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.step-chip {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: color-mix(in srgb, var(--color-text) 78%, white);
  overflow: hidden;
}

.step-chip-button {
  width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  padding: 6px 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.step-chip-button:hover {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.step-chip-button:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: -2px;
}

.step-chip-button:disabled {
  cursor: not-allowed;
}

.step-chip-active {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #1e3a8a;
}

.step-chip-complete {
  border-color: #16a34a;
  background: #f0fdf4;
  color: #166534;
}

.step-chip-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 16%, white);
  font-size: 11px;
  font-weight: 700;
}

.step-chip-label {
  font-size: 13px;
  font-weight: 600;
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

.role-sequence-panel {
  gap: var(--space-3);
}

.role-sequence-main {
  gap: var(--space-3);
}

.role-sequence-header {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.role-sequence-team {
  align-items: center;
  gap: 8px;
}

.role-sequence-team strong {
  font-size: clamp(1.05rem, 3.6vw, 1.2rem);
  line-height: 1.1;
}

.role-sequence-team-name {
  font-weight: 700;
}

.role-progress-text {
  color: color-mix(in srgb, var(--color-text) 68%, white);
  font-size: clamp(1rem, 3.3vw, 1.15rem);
  font-weight: 600;
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
  gap: 10px;
  background: var(--color-surface);
}

.role-card--focus {
  border-width: 2px;
  border-color: #bfdbfe;
  background: #f8fbff;
}

.role-header {
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2);
}

.role-token {
  color: var(--color-text);
  font-weight: 700;
  font-size: clamp(1.5rem, 4.8vw, 1.95rem);
  line-height: 1;
}

.role-token--score {
  font-size: clamp(1.22rem, 4vw, 1.45rem);
}

.role-description {
  color: color-mix(in srgb, var(--color-text) 84%, white);
  font-size: clamp(0.94rem, 3.1vw, 1.18rem);
  font-weight: 600;
}

.role-description--score {
  font-size: clamp(0.9rem, 2.9vw, 1rem);
  font-weight: 500;
}

.selected-speaker-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  gap: 8px;
}

.selected-speaker-name {
  font-size: clamp(1.08rem, 3.6vw, 1.28rem);
  line-height: 1.25;
}

.score-field-label {
  color: var(--color-text);
  font-size: clamp(0.94rem, 3vw, 1.04rem);
  font-weight: 600;
  line-height: 1.25;
}

.score-adjust-row {
  align-items: center;
  gap: 10px;
}

.score-adjust-btn {
  width: 40px;
  height: 40px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 1.45rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}

.score-adjust-btn:hover {
  background: color-mix(in srgb, var(--color-surface) 85%, var(--color-primary) 15%);
}

.score-adjust-input {
  flex: 1;
  min-height: 40px;
  text-align: center;
  font-size: clamp(1.04rem, 3.5vw, 1.18rem);
  font-weight: 600;
}

.score-total-box {
  min-height: 40px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(1.1rem, 3.7vw, 1.28rem);
  font-weight: 700;
  background: var(--color-surface);
}

.toggle-field {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.toggle-title {
  color: color-mix(in srgb, var(--color-text) 88%, white);
  font-size: clamp(0.92rem, 3vw, 1.02rem);
  font-weight: 600;
}

.award-choice {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(58px, 1fr));
  min-height: 44px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  touch-action: manipulation;
}

.award-choice-option {
  min-width: 58px;
  min-height: 44px;
  border: 0;
  border-left: 1px solid var(--color-border);
  background: transparent;
  color: color-mix(in srgb, var(--color-text) 68%, white);
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}

.award-choice-option:first-child {
  border-left: 0;
}

.award-choice-option-active {
  background: color-mix(in srgb, var(--color-primary) 14%, var(--color-surface));
  color: var(--color-primary);
}

.winner-step {
  gap: var(--space-3);
}

.winner-selection-row {
  align-items: center;
  gap: var(--space-2);
}

.winner-selection-row .field-label {
  white-space: nowrap;
}

.winner-selection-row select {
  flex: 1;
  min-width: 0;
}

.ballot-step-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.small {
  font-size: 0.9rem;
  gap: 6px;
}

.tiny {
  font-size: 0.84rem;
  line-height: 1.4;
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

.success-vote-card {
  border: 1px solid color-mix(in srgb, var(--color-primary) 42%, var(--color-border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-primary) 7%, var(--color-surface));
  padding: var(--space-3);
  gap: 6px;
}

.success-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.success-award-summary {
  gap: 8px;
  padding-top: var(--space-2);
  border-top: 1px solid color-mix(in srgb, var(--color-border) 86%, white);
}

.success-award-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.success-award-speaker {
  align-items: center;
  gap: 6px;
  margin-right: 2px;
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

.confirm-winner-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.confirm-speaker-columns {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.confirm-speaker-team {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: color-mix(in srgb, var(--color-surface) 92%, white);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
}

.confirm-speaker-team--gov {
  border-color: #93c5fd;
  background: linear-gradient(180deg, #f7fbff 0%, #ffffff 26%);
}

.confirm-speaker-team--opp {
  border-color: #fcd34d;
  background: linear-gradient(180deg, #fffdf3 0%, #ffffff 26%);
}

.confirm-speaker-team-header {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.confirm-speaker-team-heading {
  align-items: center;
  gap: 8px;
}

.confirm-speaker-team-total {
  display: inline-flex;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, white);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: color-mix(in srgb, var(--color-text) 82%, white);
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.confirm-speaker-list {
  gap: 10px;
}

.confirm-speaker-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 10px 0;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 84%, white);
}

.confirm-speaker-row:first-child {
  border-top: 0;
  padding-top: 0;
}

.confirm-speaker-row:last-child {
  padding-bottom: 0;
}

.confirm-speaker-main {
  min-width: 0;
  gap: 4px;
}

.confirm-speaker-edit {
  align-self: center;
}

.confirm-speaker-row-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.confirm-role-token {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: #1f2937;
  color: #f8fafc;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.confirm-speaker-row-name {
  line-height: 1.3;
  min-width: 0;
  overflow-wrap: anywhere;
}

.confirm-speaker-score {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #f8fafc;
  color: #1e293b;
  padding: 4px 10px;
  white-space: nowrap;
  font-size: 0.95rem;
  font-weight: 800;
  justify-self: end;
}

.confirm-speaker-awards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.confirm-award-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.confirm-award-chip--best {
  border: 1px solid #f59e0b;
  background: #fff7ed;
  color: #b45309;
}

.confirm-award-chip--poi {
  border: 1px solid #14b8a6;
  background: #f0fdfa;
  color: #0f766e;
}

.confirm-award-empty {
  color: color-mix(in srgb, var(--color-text) 58%, white);
  font-size: 12px;
  font-weight: 600;
}

.confirm-grid .full {
  grid-column: 1 / -1;
}

.confirm-actions {
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .stepper-list {
    grid-template-columns: 1fr;
  }

  .ballot-step-actions {
    justify-content: stretch;
  }

  .ballot-step-actions :deep(button),
  .ballot-step-actions :deep(a) {
    width: 100%;
  }

  .optional-back-action {
    display: none;
  }

  .confirm-speaker-row-head {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .confirm-speaker-row {
    align-items: start;
  }

  .confirm-speaker-edit {
    align-self: start;
  }

  .confirm-speaker-score {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
