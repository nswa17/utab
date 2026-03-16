<template>
  <section class="stack">
    <div v-if="!isEmbeddedRoute" class="row section-row">
      <h3>{{ $t('ラウンド詳細設定') }}</h3>
    </div>

    <div v-if="!isEmbeddedRoute && !sectionLoading" class="card stack">
      <p class="muted">{{ $t('ラウンド作成は大会セットアップで行います。') }}</p>
      <div class="row">
        <Button variant="ghost" size="sm" :to="`/admin/${tournamentId}/setup`">
          {{ $t('大会セットアップ') }}
        </Button>
      </div>
    </div>

    <LoadingState v-if="sectionLoading" />
    <p v-else-if="roundsLoadError" class="error">{{ roundsLoadError }}</p>
    <p v-else-if="displayRounds.length === 0" class="muted">
      {{ $t('ラウンドがまだありません。') }}
    </p>

    <div v-else class="stack round-cards" :class="{ embed: isEmbeddedRoute }">
      <article v-for="round in displayRounds" :key="round._id" class="card stack round-card">
        <div v-if="!isEmbeddedRoute" class="stack round-head">
          <div class="row round-head-row">
            <button type="button" class="round-toggle" @click="toggleRound(round._id)">
              <CollapseHeader
                :title="round.name || $t('ラウンド {round}', { round: round.round })"
                :subtitle="$t('ラウンド番号') + ': ' + round.round"
                :meta="
                  drawUpdatedLabel(round.round)
                    ? $t('更新: {time}', { time: drawUpdatedLabel(round.round) })
                    : ''
                "
                :open="isExpanded(round._id)"
              />
            </button>
            <div v-if="!isEmbeddedRoute" class="row round-head-actions">
              <Button
                variant="danger"
                size="sm"
                class="round-delete"
                @click="requestRemoveRound(round._id)"
              >
                {{ $t('削除') }}
              </Button>
            </div>
          </div>
        </div>

        <div class="card soft stack round-status-frame">
          <div class="grid status-grid">
            <div class="card soft stack status-card">
              <div class="stack status-head status-head-vertical">
                <h4 class="status-card-title">{{ $t('モーション公開') }}</h4>
                <div class="switch-state">
                  <span class="switch-label">{{ $t('非公開') }}</span>
                  <label class="switch">
                    <input
                      type="checkbox"
                      :checked="Boolean(round.motionOpened)"
                      :disabled="isLoading"
                      @change="onMotionOpenedChange(round, $event)"
                    />
                    <span class="switch-slider"></span>
                  </label>
                  <span class="switch-label">{{ $t('公開') }}</span>
                </div>
              </div>
            </div>
            <div class="card soft stack status-card">
              <div class="stack status-head status-head-vertical">
                <h4 class="status-card-title">{{ $t('チーム割り当て') }}</h4>
                <div class="switch-state">
                  <span class="switch-label">{{ $t('非公開') }}</span>
                  <label class="switch">
                    <input
                      type="checkbox"
                      :checked="roundTeamAllocationOpened(round.round)"
                      :disabled="isLoading || !roundHasDraw(round.round)"
                      @change="onTeamAllocationChange(round, $event)"
                    />
                    <span class="switch-slider"></span>
                  </label>
                  <span class="switch-label">{{ $t('公開') }}</span>
                </div>
              </div>
            </div>
            <div class="card soft stack status-card">
              <div class="stack status-head status-head-vertical">
                <h4 class="status-card-title">{{ $t('ジャッジ割り当て') }}</h4>
                <div class="switch-state">
                  <span class="switch-label">{{ $t('非公開') }}</span>
                  <label class="switch">
                    <input
                      type="checkbox"
                      :checked="roundAdjudicatorAllocationOpened(round.round)"
                      :disabled="isLoading || !roundHasDraw(round.round)"
                      @change="onAdjudicatorAllocationChange(round, $event)"
                    />
                    <span class="switch-slider"></span>
                  </label>
                  <span class="switch-label">{{ $t('公開') }}</span>
                </div>
              </div>
            </div>
            <div class="card soft stack status-card">
              <h4 class="status-card-title">{{ $t('提出状況') }}</h4>
              <div class="status-line">
                <span>{{ $t('スコアシート') }}</span>
                <strong>{{ ballotSubmittedCount(round) }}/{{ ballotExpectedCount(round) }}</strong>
              </div>
              <div class="status-line">
                <span>{{ $t('フィードバック') }}</span>
                <strong
                  >{{ feedbackSubmittedCount(round) }}/{{ feedbackExpectedCount(round) }}</strong
                >
              </div>
              <div class="row">
                <Button variant="secondary" size="sm" @click="openMissingModal(round.round)">
                  {{ $t('未提出者を表示') }}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div v-show="isEmbeddedRoute || isExpanded(round._id)" class="stack round-body">
          <div class="card soft stack round-settings-frame">
            <div class="stack motion-editor">
              <Field class="motion-field" :label="$t('モーション')" v-slot="{ id, describedBy }">
                <input
                  v-model="roundDraft(round).motion"
                  :id="id"
                  :aria-describedby="describedBy"
                  type="text"
                />
              </Field>
              <div class="row motion-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  class="round-settings-open-button"
                  :aria-pressed="isAdvancedSettingsExpanded(round._id) ? 'true' : 'false'"
                  :disabled="isLoading"
                  @click="toggleAdvancedSettings(round._id)"
                >
                  {{ $t('ラウンド詳細設定') }}
                </Button>
                <Button
                  variant="secondary"
                  class="motion-update-button"
                  size="sm"
                  :disabled="isLoading"
                  @click="saveRoundMotion(round)"
                >
                  {{ $t('モーションを更新') }}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!isEmbeddedRoute" class="row round-shortcuts">
          <Button variant="secondary" size="sm" @click="openRoundPage(round.round, 'allocation')">
            {{ $t('対戦表設定') }}
          </Button>
          <Button variant="secondary" size="sm" @click="openRoundPage(round.round, 'submissions')">
            {{ $t('提出データ閲覧') }}
          </Button>
        </div>

        <div
          v-if="isAdvancedSettingsExpanded(round._id)"
          class="modal-backdrop"
          role="presentation"
          @click.self="toggleAdvancedSettings(round._id)"
        >
          <div class="modal card stack round-settings-modal" role="dialog" aria-modal="true">
            <div class="modal-head">
              <strong>
                {{ round.name || $t('ラウンド {round}', { round: round.round }) }} /
                {{ $t('ラウンド詳細設定') }}
              </strong>
              <button
                type="button"
                class="modal-close"
                :aria-label="$t('閉じる')"
                @click="toggleAdvancedSettings(round._id)"
              >
                ×
              </button>
            </div>

            <div class="stack advanced-settings">
              <div class="grid weight-grid">
                <Field :label="$t('チェア重み')" v-slot="{ id, describedBy }">
                  <input
                    v-model.number="roundDraft(round).weights.chair"
                    :id="id"
                    :aria-describedby="describedBy"
                    type="number"
                  />
                </Field>
                <Field :label="$t('パネル重み')" v-slot="{ id, describedBy }">
                  <input
                    v-model.number="roundDraft(round).weights.panel"
                    :id="id"
                    :aria-describedby="describedBy"
                    type="number"
                  />
                </Field>
                <Field :label="$t('トレーニー重み')" v-slot="{ id, describedBy }">
                  <input
                    v-model.number="roundDraft(round).weights.trainee"
                    :id="id"
                    :aria-describedby="describedBy"
                    type="number"
                  />
                </Field>
              </div>

              <section class="stack settings-group">
                <RoundOptionEditor
                  v-model:evaluate-from-adjudicators="
                    roundDraft(round).userDefined.evaluate_from_adjudicators
                  "
                  v-model:evaluate-from-teams="roundDraft(round).userDefined.evaluate_from_teams"
                  v-model:chairs-always-evaluated="
                    roundDraft(round).userDefined.chairs_always_evaluated
                  "
                  v-model:evaluator-in-team="roundDraft(round).userDefined.evaluator_in_team"
                  v-model:no-speaker-score="roundDraft(round).userDefined.no_speaker_score"
                  v-model:allow-low-tie-win="roundDraft(round).userDefined.allow_low_tie_win"
                  v-model:score-by-matter-manner="
                    roundDraft(round).userDefined.score_by_matter_manner
                  "
                  v-model:poi="roundDraft(round).userDefined.poi"
                  v-model:best="roundDraft(round).userDefined.best"
                  v-model:best-min-count="roundDraft(round).userDefined.best_min_count"
                  v-model:best-max-count="roundDraft(round).userDefined.best_max_count"
                  v-model:poi-min-count="roundDraft(round).userDefined.poi_min_count"
                  v-model:poi-max-count="roundDraft(round).userDefined.poi_max_count"
                  :lock-allow-low-tie-win="roundDraft(round).breakEnabled"
                  :disabled="isLoading"
                >
                  <template #after-team-settings>
                    <section class="stack round-ranking-settings">
                      <CompileOptionsEditor
                        v-model:source-rounds="roundDraft(round).compile.source_rounds"
                        v-model:winner-policy="roundDraft(round).compile.options.winner_policy"
                        v-model:tie-points="roundDraft(round).compile.options.tie_points"
                        v-model:merge-policy="
                          roundDraft(round).compile.options.duplicate_normalization.merge_policy
                        "
                        v-model:poi-aggregation="
                          roundDraft(round).compile.options.duplicate_normalization.poi_aggregation
                        "
                        v-model:best-aggregation="
                          roundDraft(round).compile.options.duplicate_normalization.best_aggregation
                        "
                        v-model:missing-data-policy="
                          roundDraft(round).compile.options.missing_data_policy
                        "
                        :show-winner-scoring="false"
                        :show-source-rounds="false"
                        :show-merge-and-missing="false"
                        :source-round-options="compileSourceRoundSelectOptions(round.round)"
                        :disabled="isLoading"
                      />
                      <RankingPriorityEditor
                        v-model="roundDraft(round).compile.options.adjudicator_ranking_priority.order"
                        :title="$t('ジャッジ順位優先度設定')"
                        :help-text="$t('使用する基準を有効化し、上から優先順に並べてください。')"
                        :options="adjudicatorRankingPriorityOptions"
                        :disabled="isLoading"
                        :min-active="1"
                        :active-title="$t('使用する基準')"
                        :inactive-title="$t('不使用')"
                        :inactive-empty-text="$t('不使用の指標はありません。')"
                        :active-action-label="$t('除外')"
                      />
                    </section>
                  </template>
                </RoundOptionEditor>
              </section>

              <div class="row modal-actions">
                <Button variant="ghost" size="sm" @click="toggleAdvancedSettings(round._id)">
                  {{ $t('閉じる') }}
                </Button>
                <Button size="sm" :disabled="isLoading" @click="saveRoundSettings(round)">
                  {{ $t('設定を保存') }}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div
      v-if="missingModalRound !== null"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeMissingModal"
    >
      <div class="modal card stack missing-modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <strong>{{ roundLabel(missingModalRound) }} {{ $t('未提出') }}</strong>
          <button
            type="button"
            class="modal-close"
            :aria-label="$t('閉じる')"
            @click="closeMissingModal"
          >
            ×
          </button>
        </div>
        <template v-if="missingModalRoundConfig">
          <p
            v-if="
              missingBallotNames(missingModalRoundConfig).length === 0 &&
              missingFeedbackTeamNames(missingModalRoundConfig).length === 0 &&
              missingFeedbackAdjudicatorNames(missingModalRoundConfig).length === 0
            "
            class="muted small"
          >
            {{ $t('未提出者はいません。') }}
          </p>
          <div v-if="missingBallotNames(missingModalRoundConfig).length > 0" class="stack tight">
            <strong class="small">{{ $t('スコアシート未提出（ジャッジ）') }}</strong>
            <p class="muted small">
              {{ missingBallotNames(missingModalRoundConfig).join(', ') }}
            </p>
          </div>
          <div
            v-if="missingFeedbackTeamNames(missingModalRoundConfig).length > 0"
            class="stack tight"
          >
            <strong class="small">{{
              $t('評価未提出（{label}）', { label: feedbackTeamLabel(missingModalRoundConfig) })
            }}</strong>
            <p class="muted small">
              {{ missingFeedbackTeamNames(missingModalRoundConfig).join(', ') }}
            </p>
          </div>
          <div
            v-if="missingFeedbackAdjudicatorNames(missingModalRoundConfig).length > 0"
            class="stack tight"
          >
            <strong class="small">{{ $t('評価未提出（ジャッジ）') }}</strong>
            <p class="muted small">
              {{ missingFeedbackAdjudicatorNames(missingModalRoundConfig).join(', ') }}
            </p>
          </div>
        </template>
        <p v-else class="muted small">{{ $t('ラウンドがまだありません。') }}</p>
      </div>
    </div>

    <div
      v-if="roundDeleteModalRound"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeRoundDeleteModal"
    >
      <div class="modal card stack" role="dialog" aria-modal="true">
        <h4>{{ $t('ラウンド削除') }}</h4>
        <p class="muted">
          {{
            $t('{round} を削除しますか？', {
              round:
                roundDeleteModalRound.name ||
                $t('ラウンド {round}', { round: roundDeleteModalRound.round }),
            })
          }}
        </p>
        <p v-if="roundDeleteError" class="error small">{{ roundDeleteError }}</p>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="closeRoundDeleteModal">{{
            $t('キャンセル')
          }}</Button>
          <Button variant="danger" size="sm" :disabled="isLoading" @click="confirmRemoveRound">
            {{ $t('削除') }}
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from '@/components/common/Button.vue'
import CollapseHeader from '@/components/common/CollapseHeader.vue'
import CompileOptionsEditor from '@/components/common/CompileOptionsEditor.vue'
import RankingPriorityEditor from '@/components/common/RankingPriorityEditor.vue'
import RoundOptionEditor from '@/components/common/RoundOptionEditor.vue'
import Field from '@/components/common/Field.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useRoundsStore } from '@/stores/rounds'
import { useDrawsStore } from '@/stores/draws'
import { useSubmissionsStore } from '@/stores/submissions'
import { useTournamentStore } from '@/stores/tournament'
import { useTeamsStore } from '@/stores/teams'
import { useSpeakersStore } from '@/stores/speakers'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import {
  defaultRoundDefaults,
  normalizeRoundCompileOptions,
  normalizeRoundDefaults,
} from '@/utils/round-defaults'
import {
  isRoundBreakEnabled as readRoundBreakEnabled,
  withRoundBreakEnabled,
} from '@/utils/tournament-break'
import {
  compileAdjudicatorRankingMetrics,
  type CompileAdjudicatorRankingMetric,
} from '@/types/compiled'
import { createLatestRequestGate } from '@/utils/latest-request'

const route = useRoute()
const router = useRouter()
const tournamentStore = useTournamentStore()
const roundsStore = useRoundsStore()
const drawsStore = useDrawsStore()
const submissionsStore = useSubmissionsStore()
const teamsStore = useTeamsStore()
const speakersStore = useSpeakersStore()
const adjudicatorsStore = useAdjudicatorsStore()
const { t } = useI18n({ useScope: 'global' })
const props = withDefaults(
  defineProps<{
    embedded?: boolean
    embeddedRound?: number | null
  }>(),
  {
    embedded: false,
    embeddedRound: null,
  }
)

function normalizeRoundValue(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null
}

const tournamentId = computed(() => route.params.tournamentId as string)
const isEmbeddedRoute = computed(
  () =>
    props.embedded ||
    route.path.startsWith('/admin-embed/') ||
    String(route.query.embed ?? '') === '1'
)
const sortedRounds = computed(() => roundsStore.rounds.slice().sort((a, b) => a.round - b.round))
const selectedRoundFromQuery = computed(() => {
  const fromProp = normalizeRoundValue(props.embeddedRound)
  if (fromProp !== null) return fromProp
  return normalizeRoundValue(route.query.round)
})
const displayRounds = computed(() => {
  if (selectedRoundFromQuery.value === null) return sortedRounds.value
  return sortedRounds.value.filter((round) => Number(round.round) === selectedRoundFromQuery.value)
})
const expandedRounds = ref<Record<string, boolean>>({})
const advancedSettingsExpanded = ref<Record<string, boolean>>({})
const missingModalRound = ref<number | null>(null)
const roundDeleteModalId = ref<string | null>(null)
const roundsLoadError = ref('')
const roundDeleteError = ref('')
const sectionLoading = ref(true)
const refreshGate = createLatestRequestGate()
let foregroundRefreshCount = 0
const isLoading = computed(
  () =>
    roundsStore.loading ||
    drawsStore.loading ||
    submissionsStore.loading ||
    teamsStore.loading ||
    speakersStore.loading ||
    adjudicatorsStore.loading
)
const roundDeleteModalRound = computed(() => {
  if (!roundDeleteModalId.value) return null
  return sortedRounds.value.find((round) => round._id === roundDeleteModalId.value) ?? null
})

function defaultRoundUserDefined() {
  return { ...defaultRoundDefaults().userDefinedData, hidden: false }
}

function defaultRoundCompile() {
  const compileDefaults = defaultRoundDefaults().compile
  return {
    source: compileDefaults.source,
    source_rounds: [...compileDefaults.source_rounds],
    options: normalizeRoundCompileOptions(compileDefaults.options, compileDefaults.options),
  }
}

function normalizeSourceRounds(roundNumber: number, sourceRounds: unknown): number[] {
  if (!Array.isArray(sourceRounds)) return []
  return Array.from(
    new Set(
      sourceRounds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1 && value < roundNumber)
    )
  ).sort((left, right) => left - right)
}

type RoundSettingsDraft = {
  motion: string
  weights: { chair: number; panel: number; trainee: number }
  userDefined: ReturnType<typeof defaultRoundUserDefined>
  compile: ReturnType<typeof defaultRoundCompile>
  breakEnabled: boolean
}
const roundDrafts = reactive<Record<string, RoundSettingsDraft>>({})

function applyBreakRoundConstraints(draft: RoundSettingsDraft) {
  if (draft.breakEnabled) {
    draft.userDefined.allow_low_tie_win = false
  }
}

function createRoundDraft(round: any): RoundSettingsDraft {
  const motions = Array.isArray(round.motions) ? round.motions : []
  const userDefined = round.userDefinedData ?? {}
  const compileSource = (userDefined.compile ?? {}) as Record<string, any>
  const normalized = normalizeRoundDefaults({
    userDefinedData: userDefined,
    compile: compileSource,
  })
  const roundBreakEnabled = readRoundBreakEnabled(userDefined)
  const { break: _ignoredBreak, ...plainUserDefined } = userDefined
  void _ignoredBreak
  const roundNumber = Number(round.round)
  const draft: RoundSettingsDraft = {
    motion: motions[0] ? String(motions[0]) : '',
    weights: {
      chair: Number(round.weightsOfAdjudicators?.chair ?? 1),
      panel: Number(round.weightsOfAdjudicators?.panel ?? 1),
      trainee: Number(round.weightsOfAdjudicators?.trainee ?? 0),
    },
    userDefined: {
      ...defaultRoundUserDefined(),
      ...normalized.userDefinedData,
      ...plainUserDefined,
      hidden: false,
      evaluator_in_team: plainUserDefined.evaluator_in_team === 'speaker' ? 'speaker' : 'team',
    },
    compile: {
      source: normalized.compile.source,
      source_rounds: normalizeSourceRounds(roundNumber, normalized.compile.source_rounds),
      options: normalizeRoundCompileOptions(normalized.compile.options, normalized.compile.options),
    },
    breakEnabled: roundBreakEnabled,
  }
  applyBreakRoundConstraints(draft)
  return draft
}

function roundDraft(round: any): RoundSettingsDraft {
  if (!roundDrafts[round._id]) {
    roundDrafts[round._id] = createRoundDraft(round)
  }
  return roundDrafts[round._id]
}

const allAdjudicatorRankingMetrics: CompileAdjudicatorRankingMetric[] = [
  ...compileAdjudicatorRankingMetrics,
]

const adjudicatorRankingPriorityOptions = computed(() =>
  allAdjudicatorRankingMetrics.map((metric) => ({
    value: metric,
    label: adjudicatorRankingMetricLabel(metric),
    description: adjudicatorRankingMetricDescription(metric),
  }))
)

function adjudicatorRankingMetricLabel(metric: CompileAdjudicatorRankingMetric) {
  const labels: Record<CompileAdjudicatorRankingMetric, string> = {
    average: t('平均点'),
    sd: t('標準偏差'),
    num_experienced: t('ジャッジ担当回数'),
    num_experienced_chair: t('チェア担当回数'),
  }
  return labels[metric]
}

function adjudicatorRankingMetricDescription(metric: CompileAdjudicatorRankingMetric) {
  const descriptions: Record<CompileAdjudicatorRankingMetric, string> = {
    average: t('評価スコアの平均（高いほど上位）'),
    sd: t('評価スコアのばらつき（小さいほど上位）'),
    num_experienced: t('割り当てられた担当回数（多いほど上位）'),
    num_experienced_chair: t('チェア担当回数（多いほど上位）'),
  }
  return descriptions[metric]
}

function syncRoundDrafts(rounds: any[]) {
  const ids = new Set(rounds.map((round) => String(round._id)))
  Object.keys(roundDrafts).forEach((id) => {
    if (!ids.has(id)) {
      delete roundDrafts[id]
    }
  })
  rounds.forEach((round) => {
    roundDrafts[round._id] = createRoundDraft(round)
  })
}

const drawByRound = computed(() => {
  const map = new Map<number, any>()
  drawsStore.draws.forEach((draw) => {
    map.set(Number(draw.round), draw)
  })
  return map
})

function roundDraw(roundNumber: number) {
  return drawByRound.value.get(Number(roundNumber))
}

function roundHasDraw(roundNumber: number) {
  const draw = roundDraw(roundNumber)
  return Boolean(draw && Array.isArray(draw.allocation) && draw.allocation.length > 0)
}

function roundTeamAllocationOpened(roundNumber: number) {
  return Boolean(roundDraw(roundNumber)?.drawOpened)
}

function roundAdjudicatorAllocationOpened(roundNumber: number) {
  return Boolean(roundDraw(roundNumber)?.allocationOpened)
}

function parseTimestamp(value?: string) {
  if (!value) return Number.NaN
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : Number.NaN
}

function drawUpdatedLabel(roundNumber: number) {
  const draw = roundDraw(roundNumber)
  if (!draw?.updatedAt) return ''
  const createdMs = parseTimestamp(draw.createdAt)
  const updatedMs = parseTimestamp(draw.updatedAt)
  if (Number.isFinite(createdMs) && Number.isFinite(updatedMs) && updatedMs <= createdMs + 1000) {
    return ''
  }
  const updatedDate = new Date(draw.updatedAt)
  if (Number.isNaN(updatedDate.getTime())) return String(draw.updatedAt)
  return updatedDate.toLocaleString()
}

function roundLabel(roundNumber: number) {
  const round = sortedRounds.value.find((item) => Number(item.round) === Number(roundNumber))
  return round?.name || t('ラウンド {round}', { round: roundNumber })
}

const missingModalRoundConfig = computed(() => {
  if (missingModalRound.value === null) return null
  return (
    sortedRounds.value.find((round) => Number(round.round) === Number(missingModalRound.value)) ??
    null
  )
})

function expectedAdjudicatorIds(roundNumber: number) {
  const set = new Set<string>()
  const draw = roundDraw(roundNumber)
  const allocation = Array.isArray(draw?.allocation) ? draw.allocation : []
  allocation.forEach((row: any) => {
    ;(row.chairs ?? []).forEach((id: string) => id && set.add(String(id)))
    ;(row.panels ?? []).forEach((id: string) => id && set.add(String(id)))
    ;(row.trainees ?? []).forEach((id: string) => id && set.add(String(id)))
  })
  return set
}

function expectedTeamIds(roundNumber: number) {
  const set = new Set<string>()
  const draw = roundDraw(roundNumber)
  const allocation = Array.isArray(draw?.allocation) ? draw.allocation : []
  allocation.forEach((row: any) => {
    if (row?.teams?.gov) set.add(String(row.teams.gov))
    if (row?.teams?.opp) set.add(String(row.teams.opp))
  })
  return set
}

function teamSpeakerIds(teamId: string, roundNumber: number) {
  const team = teamsStore.teams.find((item) => item._id === teamId)
  if (!team) return []
  const detail = team.details?.find((item: any) => Number(item.r) === Number(roundNumber))
  const detailSpeakerIds = (detail?.speakers ?? []).map((id: any) => String(id)).filter(Boolean)
  return detailSpeakerIds
}

function submittedIds(roundNumber: number, type: 'ballot' | 'feedback') {
  const set = new Set<string>()
  submissionsStore.submissions.forEach((item) => {
    if (Number(item.round) !== Number(roundNumber) || item.type !== type) return
    const id = (item.payload as any)?.submittedEntityId
    if (id) set.add(String(id))
  })
  return set
}

function intersectionCount(expected: Set<string>, actual: Set<string>) {
  let count = 0
  expected.forEach((id) => {
    if (actual.has(id)) count += 1
  })
  return count
}

function ballotExpectedCount(round: any) {
  return expectedAdjudicatorIds(round.round).size
}

function ballotSubmittedCount(round: any) {
  const expected = expectedAdjudicatorIds(round.round)
  const actual = submittedIds(round.round, 'ballot')
  return intersectionCount(expected, actual)
}

function feedbackExpectedCount(round: any) {
  const expected = new Set<string>()
  const userDefined = round.userDefinedData ?? {}
  const teamIds = expectedTeamIds(round.round)
  if (userDefined.evaluate_from_teams !== false) {
    if ((userDefined.evaluator_in_team ?? 'team') === 'speaker') {
      teamIds.forEach((teamId) => {
        teamSpeakerIds(teamId, round.round).forEach((id) => expected.add(id))
      })
    } else {
      teamIds.forEach((id) => expected.add(id))
    }
  }
  if (userDefined.evaluate_from_adjudicators !== false) {
    expectedAdjudicatorIds(round.round).forEach((id) => expected.add(id))
  }
  return expected.size
}

function feedbackSubmittedCount(round: any) {
  const expected = new Set<string>()
  const userDefined = round.userDefinedData ?? {}
  const teamIds = expectedTeamIds(round.round)
  if (userDefined.evaluate_from_teams !== false) {
    if ((userDefined.evaluator_in_team ?? 'team') === 'speaker') {
      teamIds.forEach((teamId) => {
        teamSpeakerIds(teamId, round.round).forEach((id) => expected.add(id))
      })
    } else {
      teamIds.forEach((id) => expected.add(id))
    }
  }
  if (userDefined.evaluate_from_adjudicators !== false) {
    expectedAdjudicatorIds(round.round).forEach((id) => expected.add(id))
  }
  const actual = submittedIds(round.round, 'feedback')
  return intersectionCount(expected, actual)
}

function feedbackTeamLabel(round: any) {
  const userDefined = round.userDefinedData ?? {}
  return (userDefined.evaluator_in_team ?? 'team') === 'speaker' ? t('スピーカー') : t('チーム')
}

function teamName(id: string) {
  return teamsStore.teams.find((item) => item._id === id)?.name ?? id
}

function speakerName(id: string) {
  return speakersStore.speakers.find((item) => item._id === id)?.name ?? id
}

function adjudicatorName(id: string) {
  return adjudicatorsStore.adjudicators.find((item) => item._id === id)?.name ?? id
}

function missingBallotNames(round: any) {
  const roundNumber = Number(round.round)
  const submitted = submittedIds(roundNumber, 'ballot')
  return Array.from(expectedAdjudicatorIds(roundNumber))
    .filter((id) => !submitted.has(id))
    .map(adjudicatorName)
}

function missingFeedbackTeamNames(round: any) {
  const roundNumber = Number(round.round)
  const userDefined = round.userDefinedData ?? {}
  if (userDefined.evaluate_from_teams === false) return []
  const submitted = submittedIds(roundNumber, 'feedback')

  if ((userDefined.evaluator_in_team ?? 'team') === 'speaker') {
    const expected = new Set<string>()
    expectedTeamIds(roundNumber).forEach((teamId) => {
      teamSpeakerIds(teamId, roundNumber).forEach((speakerId) => expected.add(speakerId))
    })
    return Array.from(expected)
      .filter((id) => !submitted.has(id))
      .map(speakerName)
  }

  return Array.from(expectedTeamIds(roundNumber))
    .filter((id) => !submitted.has(id))
    .map(teamName)
}

function missingFeedbackAdjudicatorNames(round: any) {
  const roundNumber = Number(round.round)
  const userDefined = round.userDefinedData ?? {}
  if (userDefined.evaluate_from_adjudicators === false) return []
  const submitted = submittedIds(roundNumber, 'feedback')
  return Array.from(expectedAdjudicatorIds(roundNumber))
    .filter((id) => !submitted.has(id))
    .map(adjudicatorName)
}

function isExpanded(roundId: string) {
  return expandedRounds.value[roundId] === true
}

function toggleRound(roundId: string) {
  expandedRounds.value = {
    ...expandedRounds.value,
    [roundId]: !isExpanded(roundId),
  }
}

function isAdvancedSettingsExpanded(roundId: string) {
  return advancedSettingsExpanded.value[roundId] === true
}

function toggleAdvancedSettings(roundId: string) {
  advancedSettingsExpanded.value = {
    ...advancedSettingsExpanded.value,
    [roundId]: !isAdvancedSettingsExpanded(roundId),
  }
}

function compileSourceRoundSelectOptions(
  targetRound: number
): Array<{ value: number; label: string }> {
  return sortedRounds.value
    .map((round) => Number(round.round))
    .filter(
      (roundNumber) =>
        Number.isInteger(roundNumber) && roundNumber >= 1 && roundNumber < targetRound
    )
    .sort((left, right) => left - right)
    .map((roundNumber) => ({
      value: roundNumber,
      label: roundLabel(roundNumber),
    }))
}

async function refresh() {
  const currentTournamentId = tournamentId.value
  const token = refreshGate.begin()
  foregroundRefreshCount += 1
  sectionLoading.value = true
  roundsLoadError.value = ''
  if (!currentTournamentId) {
    refreshGate.complete(token)
    foregroundRefreshCount = Math.max(0, foregroundRefreshCount - 1)
    sectionLoading.value = foregroundRefreshCount > 0
    return
  }
  try {
    await Promise.all([
      tournamentStore.fetchTournaments(),
      roundsStore.fetchRounds(currentTournamentId),
      drawsStore.fetchDraws(currentTournamentId),
      submissionsStore.fetchSubmissions({ tournamentId: currentTournamentId }),
      teamsStore.fetchTeams(currentTournamentId),
      speakersStore.fetchSpeakers(currentTournamentId),
      adjudicatorsStore.fetchAdjudicators(currentTournamentId),
    ])
    if (!refreshGate.isCurrent(token)) return
    roundsLoadError.value = roundsStore.error ?? ''
  } finally {
    refreshGate.complete(token)
    foregroundRefreshCount = Math.max(0, foregroundRefreshCount - 1)
    sectionLoading.value = foregroundRefreshCount > 0
  }
}

async function onMotionOpenedChange(round: any, event: Event) {
  const target = event.target as HTMLInputElement | null
  await roundsStore.updateRound({
    tournamentId: tournamentId.value,
    roundId: round._id,
    motionOpened: Boolean(target?.checked),
  })
}

async function saveRoundSettings(round: any) {
  const draft = roundDraft(round)
  applyBreakRoundConstraints(draft)
  const existingBreak = (round.userDefinedData ?? {}).break
  const compileSourceRounds = normalizeSourceRounds(
    Number(round.round),
    draft.compile.source_rounds
  )
  const compileOptions = normalizeRoundCompileOptions(draft.compile.options)
  const { ranking_priority: _ignoredRankingPriority, ...compileOptionsWithoutRanking } =
    compileOptions as Record<string, any>
  void _ignoredRankingPriority
  const nextUserDefined = withRoundBreakEnabled(
    {
      ...draft.userDefined,
      hidden: false,
      evaluator_in_team: draft.userDefined.evaluator_in_team === 'speaker' ? 'speaker' : 'team',
      ...(existingBreak ? { break: existingBreak } : {}),
      compile: {
        source: draft.compile.source === 'raw' ? 'raw' : 'submissions',
        source_rounds: compileSourceRounds,
        options: compileOptionsWithoutRanking,
      },
    },
    draft.breakEnabled
  ) as Record<string, any>
  if (draft.breakEnabled) {
    nextUserDefined.allow_low_tie_win = false
  }
  await roundsStore.updateRound({
    tournamentId: tournamentId.value,
    roundId: round._id,
    weightsOfAdjudicators: {
      chair: Number(draft.weights.chair),
      panel: Number(draft.weights.panel),
      trainee: Number(draft.weights.trainee),
    },
    userDefinedData: nextUserDefined,
  })
}

async function saveRoundMotion(round: any) {
  const draft = roundDraft(round)
  await roundsStore.updateRound({
    tournamentId: tournamentId.value,
    roundId: round._id,
    motions: draft.motion.trim() ? [draft.motion.trim()] : [],
  })
}

function openRoundPage(roundNumber: number, type: 'allocation' | 'submissions') {
  if (type === 'allocation') {
    router.push(`/admin/${tournamentId.value}/rounds/${roundNumber}/allocation`)
    return
  }
  router.push({
    path: `/admin/${tournamentId.value}/operations`,
    query: { round: String(roundNumber), task: 'submissions', context: 'round' },
  })
}

function openMissingModal(roundNumber: number) {
  missingModalRound.value = roundNumber
}

function closeMissingModal() {
  missingModalRound.value = null
}

async function onTeamAllocationChange(round: any, event: Event) {
  const target = event.target as HTMLInputElement | null
  const draw = roundDraw(Number(round?.round))
  if (!draw) return
  await drawsStore.upsertDraw({
    tournamentId: tournamentId.value,
    round: Number(round.round),
    allocation: Array.isArray(draw.allocation) ? draw.allocation : [],
    userDefinedData: draw.userDefinedData,
    drawOpened: Boolean(target?.checked),
    allocationOpened: Boolean(draw.allocationOpened),
    locked: Boolean(draw.locked),
  })
  await drawsStore.fetchDraws(tournamentId.value)
}

async function onAdjudicatorAllocationChange(round: any, event: Event) {
  const target = event.target as HTMLInputElement | null
  const draw = roundDraw(Number(round?.round))
  if (!draw) return
  await drawsStore.upsertDraw({
    tournamentId: tournamentId.value,
    round: Number(round.round),
    allocation: Array.isArray(draw.allocation) ? draw.allocation : [],
    userDefinedData: draw.userDefinedData,
    drawOpened: Boolean(draw.drawOpened),
    allocationOpened: Boolean(target?.checked),
    locked: Boolean(draw.locked),
  })
  await drawsStore.fetchDraws(tournamentId.value)
}

function requestRemoveRound(id: string) {
  roundDeleteError.value = ''
  roundDeleteModalId.value = id
}

function closeRoundDeleteModal() {
  roundDeleteError.value = ''
  roundDeleteModalId.value = null
}

async function confirmRemoveRound() {
  const id = roundDeleteModalId.value
  if (!id) return
  roundDeleteError.value = ''
  const deleted = await roundsStore.deleteRound(tournamentId.value, id)
  if (!deleted) {
    roundDeleteError.value = roundsStore.error ?? t('ラウンドの削除に失敗しました。')
    return
  }
  closeRoundDeleteModal()
  const next = { ...expandedRounds.value }
  delete next[id]
  expandedRounds.value = next
  const nextAdvanced = { ...advancedSettingsExpanded.value }
  delete nextAdvanced[id]
  advancedSettingsExpanded.value = nextAdvanced
}

watch(
  tournamentId,
  () => {
    refresh()
  },
  { immediate: true }
)

watch(
  sortedRounds,
  (roundsList) => {
    syncRoundDrafts(roundsList)
    if (
      missingModalRound.value !== null &&
      !roundsList.some((round) => Number(round.round) === Number(missingModalRound.value))
    ) {
      missingModalRound.value = null
    }
  },
  { immediate: true }
)

watch(
  displayRounds,
  (roundsList) => {
    const next: Record<string, boolean> = {}
    const nextAdvanced: Record<string, boolean> = {}
    roundsList.forEach((round, index) => {
      const existing = expandedRounds.value[round._id]
      next[round._id] = existing ?? index === 0
      nextAdvanced[round._id] = advancedSettingsExpanded.value[round._id] ?? false
    })
    expandedRounds.value = next
    advancedSettingsExpanded.value = nextAdvanced
  },
  { immediate: true }
)
</script>

<style scoped>
.grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.section-row {
  align-items: center;
  gap: var(--space-2);
}

.section-reload {
  margin-left: 0;
}

.create-actions {
  grid-column: 1 / -1;
}

.round-cards {
  gap: var(--space-3);
}

.round-card {
  padding: var(--space-4);
}

.round-cards.embed .round-card {
  padding: 0;
  border: none;
  box-shadow: none;
  background: transparent;
}

.round-cards.embed .round-body {
  padding-top: 0;
}

.round-head {
  gap: var(--space-2);
}

.round-head-row {
  align-items: center;
  gap: var(--space-2);
}

.round-head-actions {
  margin-left: auto;
  align-items: center;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.round-shortcuts {
  padding-top: var(--space-1);
  gap: var(--space-2);
  flex-wrap: wrap;
}

.round-toggle {
  border: none;
  background: transparent;
  padding: 0;
  flex: 1;
  display: flex;
  align-items: center;
  text-align: left;
  cursor: pointer;
}

.round-body {
  padding-top: var(--space-1);
}

.round-status-frame {
  border: 1px solid var(--color-border);
  gap: var(--space-2);
}

.round-settings-frame {
  border: 1px solid var(--color-border);
  gap: var(--space-3);
}

.motion-editor {
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-2);
}

.motion-actions {
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.round-settings-open-button {
  white-space: nowrap;
  border-color: var(--color-border);
}

.motion-update-button {
  margin-left: auto;
  background: #ffedd5;
  border-color: #fdba74;
  color: #9a3412;
}

.motion-update-button:hover {
  background: #fed7aa;
}

.motion-field {
  width: 100%;
}

.motion-field :deep(.field-control) {
  width: 100%;
}

.advanced-settings {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface-muted);
}

.weight-grid {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.settings-group {
  gap: var(--space-2);
}

.round-ranking-settings {
  margin-top: var(--space-1);
  gap: var(--space-2);
}

.settings-group + .settings-group {
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-2);
}

.settings-group-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.settings-options-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.status-grid {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.status-card {
  padding: var(--space-2);
  border: 1px solid var(--color-border);
}

.status-card-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}

.status-head {
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}

.status-head-vertical {
  align-items: flex-start;
  justify-content: flex-start;
  gap: var(--space-1);
}

.switch-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.switch-label {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 700;
}

.status-line {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  align-items: center;
  font-size: 13px;
}

.switch {
  position: relative;
  display: inline-flex;
  width: 42px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: #cbd5e1;
  transition: background 0.15s ease;
}

.switch-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
  transition: transform 0.15s ease;
}

.switch input:checked + .switch-slider {
  background: var(--color-primary);
}

.switch input:checked + .switch-slider::before {
  transform: translateX(18px);
}

.tight {
  gap: 2px;
}

.error {
  color: var(--color-danger);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--space-5);
  z-index: 30;
}

.modal {
  max-width: 720px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
}

.round-settings-modal {
  max-width: min(1080px, 96vw);
}

.modal-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.missing-modal {
  max-width: min(780px, 95vw);
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.modal-close {
  width: 34px;
  height: 34px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.modal-close:hover {
  background: var(--color-surface-muted);
}

.modal-close:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 1px;
}

@media (max-width: 760px) {
  .round-shortcuts {
    padding-top: var(--space-1);
  }

  .motion-update-button {
    margin-left: 0;
  }
}
</style>
