<template>
  <section class="stack">
    <div class="operations-content-shell">
      <LoadingState v-if="!hasLoaded && sectionLoading" />
      <template v-else>
        <p v-if="loadError" class="error">{{ loadError }}</p>
        <div v-else class="stack">
          <section class="card stack">
            <div class="row round-bar-head">
              <strong>{{ $t('ラウンド一覧') }}</strong>
            </div>
            <p v-if="sortedRounds.length === 0" class="muted small">
              {{ $t('ラウンドがまだありません。') }}
            </p>
            <div v-else class="round-bar" role="tablist" :aria-label="$t('ラウンド一覧')">
              <button
                v-for="round in sortedRounds"
                :key="round._id"
                type="button"
                class="round-pill"
                :class="{ active: selectedRound === round.round }"
                role="tab"
                :aria-selected="selectedRound === round.round"
                @click="selectRound(round.round)"
              >
                <div class="row round-pill-head">
                  <strong>{{
                    round.name || $t('ラウンド {round}', { round: round.round })
                  }}</strong>
                  <span class="status-chip" :class="`status-${roundStatus(round.round)}`">
                    {{ roundStatusLabel(roundStatus(round.round)) }}
                  </span>
                </div>
                <div class="muted small round-pill-step">
                  <template v-if="isRoundStepCompleted(round.round)">
                    <span class="step-complete-badge">{{ $t('完了') }}</span>
                  </template>
                  <template v-else>
                    {{ $t('運営ステップ') }}: {{ roundCurrentStepLabel(round.round) }}
                  </template>
                </div>
              </button>
            </div>
          </section>

          <section class="card stack">
            <div class="row step-head">
              <h4>{{ $t('運営ステップ') }}</h4>
            </div>
            <p v-if="selectedRound === null" class="muted small">
              {{ $t('ラウンドを選択してください。') }}
            </p>
            <template v-else>
              <p class="muted small flow-caption">
                {{ $t('運営は左から順に進みます。後続ステップは前段の完了後に実行してください。') }}
              </p>
              <div class="task-flow" role="tablist" :aria-label="$t('運営ステップ')">
                <template v-for="(task, index) in operationTasks" :key="task.key">
                  <button
                    type="button"
                    class="task-tab"
                    :class="[`state-${task.state}`, { active: activeTask === task.key }]"
                    role="tab"
                    :aria-selected="activeTask === task.key"
                    @click="selectTask(task.key)"
                  >
                    <div class="row task-tab-head">
                      <div class="row task-tab-title">
                        <span class="task-order">{{ task.order }}.</span>
                        <span>{{ task.label }}</span>
                      </div>
                      <span class="task-state-chip">{{ task.stateLabel }}</span>
                    </div>
                  </button>
                  <span
                    v-if="index < operationTasks.length - 1"
                    class="task-flow-arrow"
                    aria-hidden="true"
                    >›</span
                  >
                </template>
              </div>

              <section v-if="activeTask === 'draw'" class="stack step-content">
                <AdminRoundAllocation
                  v-if="selectedRound !== null"
                  :embedded="true"
                  :embedded-round="selectedRound"
                  @update:reference-compiled-id="onDrawReferenceCompiledIdUpdate"
                  @update:reference-compiled-rounds="onDrawReferenceCompiledRoundsUpdate"
                />
              </section>

              <section v-else-if="activeTask === 'publish'" class="stack step-content">
                <p v-if="!selectedRoundHasDraw" class="muted small">
                  {{ $t('まず対戦表を生成してください。') }}
                </p>
                <div class="publish-switch-grid">
                  <section class="publish-switch-card">
                    <RoundMotionEditor
                      v-if="selectedRoundData"
                      :tournament-id="tournamentId"
                      :round-id="String(selectedRoundData._id)"
                      :saved-motion="selectedMotion"
                      :disabled="publicationSwitchBusy"
                    >
                      <template #status>
                        <RoundPublicationSwitches
                          :busy="publicationSwitchBusy"
                          :show-prior-rounds-hide-button="canShowPriorRoundsHideSwitch"
                          :prior-rounds-hide-disabled="priorRoundsFullyHidden"
                          :prior-rounds-hide-label="$t('このラウンドより前を一括非公開')"
                          :motion-opened="motionOpenedValue"
                          :motion-label="$t('モーション公開')"
                          :team-allocation-opened="drawOpenedValue"
                          :team-allocation-disabled="!selectedRoundHasDraw"
                          :team-allocation-label="$t('チーム割り当て')"
                          :adjudicator-allocation-opened="allocationOpenedValue"
                          :adjudicator-allocation-disabled="!selectedRoundHasDraw"
                          :adjudicator-allocation-label="$t('ジャッジ割り当て')"
                          @update:motion-opened="onMotionPublishToggle"
                          @update:team-allocation-opened="
                            (checked) => onPublishToggle('drawOpened', checked)
                          "
                          @update:adjudicator-allocation-opened="
                            (checked) => onPublishToggle('allocationOpened', checked)
                          "
                          @hide-prior-rounds="onPriorRoundsHideToggle(true)"
                        />
                      </template>
                    </RoundMotionEditor>
                  </section>
                </div>
                <p v-if="canShowPriorRoundsHideSwitch" class="muted small">
                  {{ $t('このラウンドより前のモーション・チーム割り当て・ジャッジ割り当てを同時に非公開にします。') }}
                </p>
                <section class="stack publish-preview-section">
                  <div class="row preview-head">
                    <h4>{{ $t('対戦表プレビュー') }}</h4>
                  </div>
                  <DrawPreviewTable
                    :rows="publishPreviewRows"
                    :gov-label="$t('政府')"
                    :opp-label="$t('反対')"
                    :team-visible="drawOpenedValue"
                    :adjudicator-visible="allocationOpenedValue"
                    :column-header-badges="publishPreviewColumnHeaderBadges"
                  />
                </section>
                <span v-if="publishMessage" class="muted small">{{ publishMessage }}</span>
              </section>

              <section v-else-if="activeTask === 'submissions'" class="stack step-content">
                <div class="row step-section-head">
                  <h5>{{ $t('提出状況確認') }}</h5>
                  <Button variant="secondary" size="sm" :loading="isLoading" @click="refresh">
                    {{ $t('再読み込み') }}
                  </Button>
                </div>
                <div class="grid submission-overview-grid">
                  <div class="card soft stack submission-overview-card">
                    <span class="muted small">{{ $t('スコアシート') }}</span>
                    <strong
                      >{{ ballotSubmittedCount(selectedRound) }} /
                      {{ ballotExpectedCount(selectedRound) }}</strong
                    >
                    <span class="muted small">
                      {{
                        $t('提出者情報不足: {count}', {
                          count: unknownSubmissionCount(selectedRound, 'ballot'),
                        })
                      }}
                    </span>
                  </div>
                  <div class="card soft stack submission-overview-card">
                    <span class="muted small">{{ $t('フィードバック') }}</span>
                    <strong
                      >{{ feedbackSubmittedCount(selectedRound) }} /
                      {{ feedbackExpectedCount(selectedRound) }}</strong
                    >
                    <span class="muted small">
                      {{
                        $t('提出者情報不足: {count}', {
                          count: unknownSubmissionCount(selectedRound, 'feedback'),
                        })
                      }}
                    </span>
                  </div>
                  <div class="card soft stack submission-overview-card submission-speed-summary-card">
                    <div class="row submission-speed-summary-head">
                      <span class="muted small">{{ $t('提出スピード詳細') }}</span>
                      <span
                        v-if="selectedRoundSubmissionSpeed"
                        class="speed-status-chip"
                        :class="`speed-status-${selectedRoundSubmissionSpeed.status}`"
                      >
                        {{ speedStatusLabel(selectedRoundSubmissionSpeed.status) }}
                      </span>
                    </div>
                    <p v-if="selectedRoundSubmissionSpeed" class="muted small">
                      {{
                        $t('中央値 {median}分 / P90 {p90}分', {
                          median: selectedRoundSubmissionSpeed.medianMinutes,
                          p90: selectedRoundSubmissionSpeed.p90Minutes,
                        })
                      }}
                    </p>
                    <p v-else class="muted small">{{ $t('提出時刻データがありません。') }}</p>
                    <template v-if="selectedRoundSubmissionDelayTopNames.length > 0">
                      <span class="muted small">{{ $t('遅延上位提出者') }}</span>
                      <p class="small submission-delay-name-list">
                        {{ selectedRoundSubmissionDelayTopNames.join(', ') }}
                      </p>
                    </template>
                    <p v-else class="muted small">{{ $t('遅延提出は検出されませんでした。') }}</p>
                  </div>
                </div>
                <p v-if="selectedRoundUnknownBallotWarning" class="muted warning">
                  {{ selectedRoundUnknownBallotWarning }}
                </p>
                <section v-if="selectedRoundHasDraw" class="stack submission-preview-section">
                  <div class="row preview-head submission-preview-head">
                    <h5>{{ $t('会場別提出状況') }}</h5>
                    <div class="stack submission-preview-search">
                      <input
                        v-model="submissionPreviewSearchQuery"
                        :placeholder="$t('会場・チーム・提出者で検索')"
                      />
                    </div>
                  </div>
                  <DrawPreviewTable
                    :rows="filteredSubmissionPreviewRows"
                    :gov-label="$t('政府')"
                    :opp-label="$t('反対')"
                    :win-column-label="$t('提出累計')"
                    :team-visible="true"
                    :adjudicator-visible="true"
                    :show-submission-columns="true"
                    :show-judge-submission-column="submissionPreviewShowJudgeColumn"
                    :team-submission-label="submissionPreviewTeamColumnLabel"
                    :judge-submission-label="submissionPreviewJudgeColumnLabel"
                    @edit-submission="openSubmissionEditorModal"
                  />
                </section>
              </section>

              <section v-else class="stack step-content">
                <div class="row step-section-head">
                  <h5>{{ $t('大会結果レポート') }}</h5>
                  <Button variant="secondary" size="sm" :loading="isLoading" @click="refresh">
                    {{ $t('再読み込み') }}
                  </Button>
                </div>
                <section class="card soft stack compile-option-panel">
                  <h5>{{ $t('集計オプション') }}</h5>
                  <CompileOptionsEditor
                    v-model:ranking-preset="rankingPriorityPreset"
                    v-model:ranking-order="rankingPriorityOrder"
                    v-model:winner-policy="compileWinnerPolicy"
                    v-model:tie-points="compileTiePoints"
                    v-model:merge-policy="compileDuplicateMergePolicy"
                    v-model:poi-aggregation="compilePoiAggregation"
                    v-model:best-aggregation="compileBestAggregation"
                    v-model:missing-data-policy="compileMissingDataPolicy"
                    :show-winner-scoring="false"
                    :show-ranking-priority="true"
                    :show-source-rounds="false"
                    :disabled="isLoading"
                  />
                </section>
                <p v-if="selectedRoundBallotGapWarning" class="muted warning">
                  {{ selectedRoundBallotGapWarning }}
                </p>
                <p v-if="selectedRoundUnknownBallotWarning" class="muted warning">
                  {{ selectedRoundUnknownBallotWarning }}
                </p>
                <div class="row step-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    :disabled="
                      isLoading ||
                      effectiveCompileTargetRounds.length === 0 ||
                      shouldBlockSubmissionCompile
                    "
                    @click="
                      compileManualSaveEnabled
                        ? runPreviewWithSource('submissions')
                        : runCompileWithSource('submissions')
                    "
                  >
                    {{ compileManualSaveEnabled ? $t('仮集計') : $t('集計を実行') }}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    :disabled="
                      isLoading ||
                      effectiveCompileTargetRounds.length === 0
                    "
                    @click="openForceCompileModal(compileManualSaveEnabled ? 'preview' : 'compile')"
                  >
                    {{ $t('強制仮集計') }}
                  </Button>
                  <Button
                    v-if="compileManualSaveEnabled"
                    size="sm"
                    :disabled="!canSavePreview || isLoading"
                    @click="openSaveSnapshotModal"
                  >
                    {{ $t('集計結果を保存') }}
                  </Button>
                  <span v-if="compileMessage" class="muted small">{{ compileMessage }}</span>
                </div>
                <p
                  v-if="compileManualSaveEnabled && compileWorkflow.previewStale"
                  class="muted warning"
                >
                  {{ $t('設定が変更されました。保存前に仮集計を実行してください。') }}
                </p>
                <p v-if="isShowingSavedCompiledForSelectedRound" class="muted small">
                  {{
                    $t('このラウンドを含む保存済み集計（最新）を表示中: {snapshot}', {
                      snapshot: selectedRoundLatestSavedCompiledLabel,
                    })
                  }}
                </p>
                <section
                  v-if="snapshotIncludesSelectedRound && compileRows.length > 0"
                  class="card soft stack compile-result-panel"
                >
                  <div class="row compile-result-head">
                    <strong>{{ $t('集計レポート') }}</strong>
                  </div>
                  <div v-if="showCompileDiffLegend" class="row diff-legend">
                    <span class="diff-legend-item">
                      <span class="diff-marker diff-improved">▲</span>{{ $t('改善') }}
                    </span>
                    <span class="diff-legend-item">
                      <span class="diff-marker diff-worsened">▼</span>{{ $t('悪化') }}
                    </span>
                    <span class="diff-legend-item">
                      <span class="diff-marker diff-unchanged">◆</span>{{ $t('変化なし') }}
                    </span>
                    <span class="diff-legend-item">
                      <span class="diff-marker diff-new">＋</span>{{ $t('新規') }}
                    </span>
                  </div>
                  <CategoryRankingTable
                    :rows="sortedCompileRows"
                    :columns="compileColumns"
                    identity-key="team"
                    :identity-label="compileTeamLabel"
                    :row-key="compileRowKey"
                    :column-label="compileColumnLabel"
                    :sort-indicator="compileSortIndicator"
                    :on-sort="setCompileSort"
                    :value-formatter="formatCompileValue"
                    :ranking-class="rankingTrendClass"
                    :ranking-text="rankingTrendText"
                    :ranking-symbol="compileRankingSymbolForRow"
                    :ranking-delta="rankingDeltaText"
                    :metric-delta="metricDeltaText"
                  />
                  <div class="row compile-download-row">
                    <Button
                      variant="secondary"
                      size="sm"
                      :disabled="sortedCompileRows.length === 0"
                      @click="downloadCompileReportCsv"
                    >
                      {{ $t('CSVダウンロード') }}
                    </Button>
                  </div>
                </section>
                <p
                  v-else-if="
                    selectedRound !== null && !snapshotIncludesSelectedRound && compileRowsBase.length > 0
                  "
                  class="muted warning"
                >
                  {{ $t('最新集計結果に選択ラウンドが含まれていません。先に集計を実行してください。') }}
                </p>
                <p v-else-if="snapshotIncludesSelectedRound" class="muted small">
                  {{ $t('集計結果を表示するデータがありません。') }}
                </p>
              </section>
              <p v-if="activeTaskHint" class="small task-hint-bottom">{{ activeTaskHint }}</p>
            </template>
          </section>
        </div>
      </template>
      <div
        v-if="hasLoaded && isLoading"
        class="reload-overlay"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <LoadingState />
      </div>
    </div>

    <div
      v-if="submissionEditorModalOpen"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeSubmissionEditorModal"
    >
      <div class="modal card stack submission-editor-modal" role="dialog" aria-modal="true">
        <div class="row submission-editor-head">
          <h4>{{ submissionEditorHeading }}</h4>
          <Button variant="ghost" size="sm" @click="closeSubmissionEditorModal">
            {{ $t('閉じる') }}
          </Button>
        </div>
        <p v-if="submissionEditorVenueLabel" class="muted small submission-editor-venue">
          {{ $t('会場') }}: {{ submissionEditorVenueLabel }}
        </p>
        <AdminTournamentSubmissions
          v-if="selectedRound !== null && submissionEditorSubmissionId"
          class="submission-editor-body"
          :embedded="true"
          :embedded-round="selectedRound"
          :hide-summary-cards="true"
          :focus-edit-only="true"
          :focus-submission-id="submissionEditorSubmissionId"
          :auto-open-focus-submission="true"
          :auto-edit-focus-submission="true"
        />
      </div>
    </div>

    <CompileForceRunModal
      v-model:open="forceCompileModalOpen"
      v-model:missing-data-policy="forceCompileMissingDataPolicy"
      :loading="isLoading"
      @confirm="confirmForcedCompile"
    />
    <CompileSaveSnapshotModal
      v-model:open="compileWorkflow.saveModalOpen"
      v-model:snapshot-memo="compileWorkflow.snapshotMemoDraft"
      :loading="isLoading"
      @confirm="saveCompiledSnapshot"
      @cancel="onSaveSnapshotModalCancel"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from '@/components/common/Button.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import CategoryRankingTable from '@/components/common/CategoryRankingTable.vue'
import RoundMotionEditor from '@/components/common/RoundMotionEditor.vue'
import RoundPublicationSwitches from '@/components/common/RoundPublicationSwitches.vue'
import DrawPreviewTable from '@/components/common/DrawPreviewTable.vue'
import CompileOptionsEditor from '@/components/common/CompileOptionsEditor.vue'
import CompileForceRunModal from '@/components/common/CompileForceRunModal.vue'
import CompileSaveSnapshotModal from '@/components/common/CompileSaveSnapshotModal.vue'
import AdminRoundAllocation from '@/views/admin/round/AdminRoundAllocation.vue'
import AdminTournamentSubmissions from '@/views/admin/AdminTournamentSubmissions.vue'
import { useRoundsStore } from '@/stores/rounds'
import { useDrawsStore } from '@/stores/draws'
import { useSubmissionsStore } from '@/stores/submissions'
import { useTeamsStore } from '@/stores/teams'
import { useCompiledStore } from '@/stores/compiled'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { useSpeakersStore } from '@/stores/speakers'
import { useVenuesStore } from '@/stores/venues'
import { api } from '@/utils/api'
import type { Submission } from '@/types/submission'
import {
  DEFAULT_COMPILE_OPTIONS,
  normalizeCompileOptions,
  type CompileRankingMetric,
  type CompileOptions,
  type CompileSource,
} from '@/types/compiled'
import type { DrawPreviewRow, DrawPreviewSubmissionRow } from '@/types/draw-preview'
import {
  formatSignedDelta,
  rankingTrendSymbol,
  resolveRankingTrend,
  toFiniteNumber,
} from '@/utils/diff-indicator'
import { isBreakRoundLike, resolveBreakStageTeamIds } from '@/utils/break-round'
import { applyClientBaselineDiff } from '@/utils/compiled-diff'
import {
  resolveRoundOperationStatus,
  type RoundOperationStatus,
} from '@/stores/round-operations'
import { buildSubmissionDelayRows, buildSubmissionSpeedRows } from '@/utils/insights'
import {
  formatCompiledSnapshotOptionLabel,
  resolveLatestCompiledIdContainingRound,
} from '@/utils/compiled-snapshot'
import { includeLabelsFromRoundDetails } from '@/utils/compile-include-labels'
import {
  buildRoundSubmissionCoverage,
  expectedFeedbackCountForRow,
  normalizeIdList,
  resolveFeedbackExpectationSettings,
  type FeedbackExpectationSettings,
  type RoundSubmissionCoverage,
  type SubmissionExpectationRow,
} from '@/utils/submission-expectations'
import { useCompileWorkflow } from '@/composables/useCompileWorkflow'
import { trackAdminCompileWorkflowMetric } from '@/utils/compile-workflow-telemetry'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n({ useScope: 'global' })

const roundsStore = useRoundsStore()
const drawsStore = useDrawsStore()
const submissionsStore = useSubmissionsStore()
const teamsStore = useTeamsStore()
const compiledStore = useCompiledStore()
const adjudicatorsStore = useAdjudicatorsStore()
const speakersStore = useSpeakersStore()
const venuesStore = useVenuesStore()

const tournamentId = computed(() => route.params.tournamentId as string)
const sortedRounds = computed(() => roundsStore.rounds.slice().sort((a, b) => a.round - b.round))
const selectedRound = ref<number | null>(null)
type HubTask = 'submissions' | 'compile' | 'draw' | 'publish'
type HubTaskState = 'done' | 'ready' | 'blocked'
type RoundReferenceDraft = {
  compiledId: string
  rounds: number[]
}
const DRAW_REFERENCE_COMPILED_ID_KEY = 'reference_compiled_id'
const DRAW_REFERENCE_COMPILED_ROUNDS_KEY = 'reference_compiled_rounds'
const hubTaskOrder: HubTask[] = ['draw', 'publish', 'submissions', 'compile']
const activeTask = ref<HubTask>('draw')
const roundTaskSelection = ref<Record<number, HubTask>>({})
const roundReferenceDrafts = ref<Record<number, RoundReferenceDraft>>({})
const sectionLoading = ref(true)
const hasLoaded = ref(false)
const actionError = ref('')
const submissionsLoadError = ref('')
const compileMessage = ref('')
const publishMessage = ref('')
const compileManualSaveEnabled = true
const compileWorkflow = useCompileWorkflow('submissions')
const manualCompileSource = ref<CompileSource>('submissions')
const forceCompileAction = ref<'compile' | 'preview' | 'save'>('compile')
const manualCompileOptionOverrides = ref<
  { missing_data_policy?: CompileOptions['missing_data_policy'] } | undefined
>(undefined)
const rankingPriorityPreset = ref<CompileOptions['ranking_priority']['preset']>(
  DEFAULT_COMPILE_OPTIONS.ranking_priority.preset
)
const rankingPriorityOrder = ref<CompileRankingMetric[]>([
  ...DEFAULT_COMPILE_OPTIONS.ranking_priority.order,
])
const compileWinnerPolicy = ref<CompileOptions['winner_policy']>(
  DEFAULT_COMPILE_OPTIONS.winner_policy
)
const compileTiePoints = ref<number>(DEFAULT_COMPILE_OPTIONS.tie_points)
const compileDuplicateMergePolicy = ref<CompileOptions['duplicate_normalization']['merge_policy']>(
  DEFAULT_COMPILE_OPTIONS.duplicate_normalization.merge_policy
)
const compilePoiAggregation = ref<CompileOptions['duplicate_normalization']['poi_aggregation']>(
  DEFAULT_COMPILE_OPTIONS.duplicate_normalization.poi_aggregation
)
const compileBestAggregation = ref<CompileOptions['duplicate_normalization']['best_aggregation']>(
  DEFAULT_COMPILE_OPTIONS.duplicate_normalization.best_aggregation
)
const compileMissingDataPolicy = ref<CompileOptions['missing_data_policy']>(
  DEFAULT_COMPILE_OPTIONS.missing_data_policy
)
const compiledHistory = ref<any[]>([])
const forceCompileModalOpen = ref(false)
const publicationSaving = ref(false)
const compileSortKey = ref('ranking')
const compileSortDirection = ref<'asc' | 'desc'>('asc')
const forceCompileMissingDataPolicy = ref<CompileOptions['missing_data_policy']>(
  DEFAULT_COMPILE_OPTIONS.missing_data_policy
)
const submissionPreviewSearchQuery = ref('')
const submissionEditorModalOpen = ref(false)
const submissionEditorSubmissionId = ref('')
const sortCollator = new Intl.Collator(['ja', 'en'], { numeric: true, sensitivity: 'base' })

const isLoading = computed(
  () =>
    sectionLoading.value ||
    roundsStore.loading ||
    drawsStore.loading ||
    submissionsStore.loading ||
    teamsStore.loading ||
    adjudicatorsStore.loading ||
    speakersStore.loading ||
    venuesStore.loading ||
    compiledStore.loading
)
const loadError = computed(
  () =>
    actionError.value ||
    roundsStore.error ||
    drawsStore.error ||
    submissionsLoadError.value ||
    teamsStore.error ||
    adjudicatorsStore.error ||
    speakersStore.error ||
    venuesStore.error ||
    compiledStore.error ||
    ''
)

const selectedRoundData = computed(
  () => sortedRounds.value.find((round) => round.round === selectedRound.value) ?? null
)
const selectedDraw = computed(
  () => drawsStore.draws.find((draw) => draw.round === selectedRound.value) ?? null
)
function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}
function readDrawReferenceCompiledId(value: unknown): string {
  const raw = asRecord(value)[DRAW_REFERENCE_COMPILED_ID_KEY]
  return typeof raw === 'string' ? raw.trim() : ''
}
function normalizeCompiledRoundNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((entry: any) => Number(entry?.r ?? entry?.round ?? entry))
        .filter((roundNumber: number) => Number.isInteger(roundNumber) && roundNumber >= 1)
    )
  ).sort((left, right) => left - right)
}
function readDrawReferenceCompiledRounds(value: unknown): number[] {
  return normalizeCompiledRoundNumbers(asRecord(value)[DRAW_REFERENCE_COMPILED_ROUNDS_KEY])
}
function isExistingCompiledId(compiledId: string): boolean {
  const normalizedId = compiledId.trim()
  if (!normalizedId) return false
  return compiledHistory.value.some((item) => String(item?._id ?? '').trim() === normalizedId)
}
const selectedRoundReferenceDraft = computed<RoundReferenceDraft | null>(() => {
  if (selectedRound.value === null) return null
  return roundReferenceDrafts.value[selectedRound.value] ?? null
})
const selectedRoundReferenceCompiledIdFromDraw = computed(() => {
  const compiledId = readDrawReferenceCompiledId(selectedDraw.value?.userDefinedData)
  return isExistingCompiledId(compiledId) ? compiledId : ''
})
const selectedRoundReferenceCompiledId = computed(() => {
  const draft = selectedRoundReferenceDraft.value
  if (draft) {
    return isExistingCompiledId(draft.compiledId) ? draft.compiledId : ''
  }
  return selectedRoundReferenceCompiledIdFromDraw.value
})
const selectedRoundReferenceCompiledRoundsFromDraw = computed(() => {
  if (!selectedRoundReferenceCompiledIdFromDraw.value) return []
  return readDrawReferenceCompiledRounds(selectedDraw.value?.userDefinedData)
})
function resolveCompiledRoundNumbersById(compiledId: string): number[] {
  const normalizedId = compiledId.trim()
  if (!normalizedId) return []
  const matched = compiledHistory.value.find(
    (item) => String(item?._id ?? '').trim() === normalizedId
  )
  if (!matched) return []
  const payload = matched?.payload && typeof matched.payload === 'object' ? matched.payload : matched
  return normalizeCompiledRoundNumbers((payload as Record<string, any>)?.rounds)
}
const selectedRoundReferenceCompiledRounds = computed<number[]>(() => {
  const draft = selectedRoundReferenceDraft.value
  if (draft) {
    if (!isExistingCompiledId(draft.compiledId)) return []
    if (draft.rounds.length > 0) return draft.rounds
    return resolveCompiledRoundNumbersById(draft.compiledId)
  }
  if (selectedRoundReferenceCompiledRoundsFromDraw.value.length > 0) {
    return selectedRoundReferenceCompiledRoundsFromDraw.value
  }
  const baselineId = selectedRoundReferenceCompiledIdFromDraw.value
  if (!baselineId) return []
  return resolveCompiledRoundNumbersById(baselineId)
})
function updateSelectedRoundReferenceDraft(next: Partial<RoundReferenceDraft>) {
  if (selectedRound.value === null) return
  const roundNumber = selectedRound.value
  const current = roundReferenceDrafts.value[roundNumber] ?? { compiledId: '', rounds: [] }
  const compiledId =
    typeof next.compiledId === 'string' ? next.compiledId.trim() : current.compiledId
  const rounds = Array.isArray(next.rounds)
    ? normalizeCompiledRoundNumbers(next.rounds)
    : current.rounds
  roundReferenceDrafts.value = {
    ...roundReferenceDrafts.value,
    [roundNumber]: {
      compiledId,
      rounds,
    },
  }
}
function onDrawReferenceCompiledIdUpdate(compiledId: string) {
  updateSelectedRoundReferenceDraft({ compiledId })
}
function onDrawReferenceCompiledRoundsUpdate(rounds: number[]) {
  updateSelectedRoundReferenceDraft({ rounds })
}
const priorRounds = computed(() => {
  if (selectedRound.value === null) return []
  return sortedRounds.value.filter((round) => round.round < selectedRound.value!)
})
const priorRoundNumberSet = computed(() => new Set(priorRounds.value.map((round) => round.round)))
const priorRoundDrawMap = computed(() => {
  const map = new Map<number, any>()
  drawsStore.draws.forEach((draw) => {
    if (!priorRoundNumberSet.value.has(draw.round)) return
    map.set(draw.round, draw)
  })
  return map
})
const canShowPriorRoundsHideSwitch = computed(() => priorRounds.value.length > 0)
const motionOpenedValue = computed(() => Boolean(selectedRoundData.value?.motionOpened))
const selectedMotion = computed(() => {
  const motions = Array.isArray(selectedRoundData.value?.motions)
    ? selectedRoundData.value?.motions
    : []
  return motions[0] ? String(motions[0]) : ''
})
const drawOpenedValue = computed(() => Boolean(selectedDraw.value?.drawOpened))
const allocationOpenedValue = computed(() => Boolean(selectedDraw.value?.allocationOpened))
const lockedValue = computed(() => Boolean(selectedDraw.value?.locked))
const priorRoundsFullyHidden = computed(() => {
  if (priorRounds.value.length === 0) return false
  return priorRounds.value.every((round) => {
    const draw = priorRoundDrawMap.value.get(round.round)
    return (
      !Boolean(round.motionOpened) &&
      !Boolean(draw?.drawOpened) &&
      !Boolean(draw?.allocationOpened)
    )
  })
})
const selectedRoundHasDraw = computed(() =>
  Boolean(
    selectedDraw.value &&
    Array.isArray(selectedDraw.value.allocation) &&
    selectedDraw.value.allocation.length > 0
  )
)
const publicationSwitchBusy = computed(
  () => publicationSaving.value || roundsStore.loading || drawsStore.loading
)
const effectiveCompileTargetRounds = computed(() => {
  if (selectedRound.value === null) return []
  const rounds = new Set<number>(selectedRoundReferenceCompiledRounds.value)
  rounds.add(selectedRound.value)
  return Array.from(rounds).sort((left, right) => left - right)
})
const canSavePreview = computed(() => compileManualSaveEnabled && compileWorkflow.canSave)
const manualCompileInputKey = computed(() =>
  buildCompileInputKey(manualCompileSource.value, manualCompileOptionOverrides.value)
)
const shouldUseCompilePreviewPayload = computed(
  () =>
    compileManualSaveEnabled &&
    Boolean(compiledStore.previewState?.preview) &&
    compileWorkflow.hasPreview &&
    !compileWorkflow.previewStale
)
type BaselineCompiledOption = {
  compiledId: string
  rounds: number[]
  createdAt?: string
  snapshotName?: string
}
function resolveCompiledDocId(doc: any): string {
  return String(doc?._id ?? '').trim()
}

function normalizeCompiledDoc(doc: any): Record<string, any> | null {
  const payload = doc?.payload && typeof doc.payload === 'object' ? doc.payload : doc
  if (!payload || typeof payload !== 'object') return null
  const normalized = { ...(payload as Record<string, any>) }
  const compiledId = resolveCompiledDocId(doc)
  if (compiledId) normalized._id = compiledId
  if (doc?.createdAt) normalized.createdAt = doc.createdAt
  if (doc?.updatedAt) normalized.updatedAt = doc.updatedAt
  return normalized
}
const baselineCompiledOptions = computed<BaselineCompiledOption[]>(() =>
  compiledHistory.value
    .map((item) => {
      const payload = item?.payload && typeof item.payload === 'object' ? item.payload : item
      const roundsValue = Array.isArray(payload?.rounds) ? payload.rounds : []
      const normalizedRounds = roundsValue
        .map((entry: any) => entry?.r ?? entry?.round ?? entry)
        .filter((value: number) => Number.isFinite(value))
      return {
        compiledId: String(item?._id ?? ''),
        rounds: normalizedRounds,
        createdAt: item?.createdAt ? String(item.createdAt) : undefined,
        snapshotName: String(payload?.snapshot_name ?? '').trim() || undefined,
      }
    })
    .filter((item) => item.compiledId.length > 0)
)
const selectedRoundLatestSavedCompiledId = computed(() => {
  if (selectedRound.value === null) return ''
  return resolveLatestCompiledIdContainingRound(baselineCompiledOptions.value, selectedRound.value)
})
const selectedRoundLatestSavedCompiled = computed<Record<string, any> | null>(() => {
  const compiledId = selectedRoundLatestSavedCompiledId.value.trim()
  if (!compiledId) return null
  const matched = compiledHistory.value.find((item) => resolveCompiledDocId(item) === compiledId)
  if (!matched) return null
  return normalizeCompiledDoc(matched)
})
const compileDisplayPayload = computed<Record<string, any> | null>(() => {
  if (shouldUseCompilePreviewPayload.value) {
    return compiledStore.previewState?.preview ?? compiledStore.compiled
  }
  return selectedRoundLatestSavedCompiled.value ?? compiledStore.compiled
})
const compiledSnapshotRoundSet = computed(() => {
  const rounds = Array.isArray(compileDisplayPayload.value?.rounds)
    ? compileDisplayPayload.value.rounds
    : []
  return new Set(
    rounds
      .map((item: any) => item?.r ?? item?.round)
      .filter((value: number) => Number.isInteger(value) && value >= 1)
  )
})
const snapshotLocaleTag = computed(() => (locale.value === 'ja' ? 'ja-JP' : 'en-US'))
const selectedRoundReferenceCompiledLabel = computed(() => {
  const baselineId = selectedRoundReferenceCompiledId.value
  if (!baselineId) return t('未選択')
  const matched = compiledHistory.value.find((item) => resolveCompiledDocId(item) === baselineId)
  if (!matched) {
    if (selectedRoundReferenceCompiledRounds.value.length > 0) {
      return `${compileRoundRangeLabel(selectedRoundReferenceCompiledRounds.value)} / ${baselineId}`
    }
    return baselineId
  }
  const payload = normalizeCompiledDoc(matched) ?? {}
  const rounds = normalizeCompiledRoundNumbers((payload as Record<string, any>)?.rounds)
  return formatCompiledSnapshotOptionLabel(
    {
      rounds: rounds.length > 0 ? rounds : selectedRoundReferenceCompiledRounds.value,
      createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : undefined,
      snapshotName: String(payload.snapshot_name ?? '').trim() || undefined,
    },
    snapshotLocaleTag.value
  )
})
const effectiveCompileTargetRoundsLabel = computed(() =>
  compileRoundRangeLabel(effectiveCompileTargetRounds.value)
)
const selectedRoundLatestSavedCompiledLabel = computed(() => {
  const payload = selectedRoundLatestSavedCompiled.value
  if (!payload) return ''
  const rounds = Array.isArray(payload.rounds)
    ? payload.rounds
        .map((entry: any) => entry?.r ?? entry?.round ?? entry)
        .filter((value: number) => Number.isFinite(value))
    : []
  return formatCompiledSnapshotOptionLabel(
    {
      rounds,
      createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : undefined,
      snapshotName: String(payload.snapshot_name ?? '').trim() || undefined,
    },
    snapshotLocaleTag.value
  )
})
const isShowingSavedCompiledForSelectedRound = computed(() => {
  if (shouldUseCompilePreviewPayload.value) return false
  const targetId = selectedRoundLatestSavedCompiledId.value.trim()
  if (!targetId) return false
  return String(compileDisplayPayload.value?._id ?? '').trim() === targetId
})
const selectedRoundIsBreakRound = computed(() => {
  return isBreakRoundLike({
    roundUserDefinedData: selectedRoundData.value?.userDefinedData,
    drawUserDefinedData: selectedDraw.value?.userDefinedData,
    allocation: selectedDraw.value?.allocation,
  })
})
const selectedRoundBreakTeamIds = computed(() => {
  if (!selectedRoundIsBreakRound.value) return new Set<string>()
  return new Set(
    resolveBreakStageTeamIds({
      roundUserDefinedData: selectedRoundData.value?.userDefinedData,
      drawUserDefinedData: selectedDraw.value?.userDefinedData,
      allocation: selectedDraw.value?.allocation,
    })
  )
})
function filterCompileRowsForBreak(rows: any[]): any[] {
  const breakTeamIds = selectedRoundBreakTeamIds.value
  if (breakTeamIds.size === 0) return rows
  return rows.filter((row) => breakTeamIds.has(String(row?.id ?? '').trim()))
}
const compileRowsBase = computed<any[]>(() => {
  const rows = Array.isArray(compileDisplayPayload.value?.compiled_team_results)
    ? compileDisplayPayload.value!.compiled_team_results
    : []
  return filterCompileRowsForBreak(rows)
})
const selectedCompileDiffBaselineCompiledId = computed(() => {
  const baselineId = selectedRoundReferenceCompiledId.value
  if (!baselineId) return ''
  const exists = compiledHistory.value.some((item) => resolveCompiledDocId(item) === baselineId)
  return exists ? baselineId : ''
})
const selectedCompileDiffBaselineCompiled = computed<Record<string, any> | null>(() => {
  const baselineId = selectedCompileDiffBaselineCompiledId.value
  if (!baselineId) return null
  const matched = compiledHistory.value.find((item) => resolveCompiledDocId(item) === baselineId)
  if (!matched) return null
  return normalizeCompiledDoc(matched)
})
const selectedCompileDiffBaselineRows = computed<any[]>(() =>
  filterCompileRowsForBreak(
    Array.isArray(selectedCompileDiffBaselineCompiled.value?.compiled_team_results)
      ? selectedCompileDiffBaselineCompiled.value!.compiled_team_results
      : []
  )
)
function stripDiffFields(rows: any[]): any[] {
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || !('diff' in row)) return row
    const { diff: _diff, ...rest } = row
    return rest
  })
}
const compileRows = computed<any[]>(() => {
  const currentRows = stripDiffFields(compileRowsBase.value)
  if (
    !selectedCompileDiffBaselineCompiledId.value ||
    selectedCompileDiffBaselineRows.value.length === 0
  ) {
    return currentRows
  }
  return applyClientBaselineDiff(currentRows, stripDiffFields(selectedCompileDiffBaselineRows.value))
})
const showCompileDiffLegend = computed(
  () =>
    selectedCompileDiffBaselineCompiledId.value.length > 0 &&
    compileRows.value.some((row) => row?.diff?.ranking)
)
const compileColumns = computed(() => {
  const metricKeys = ['win', 'sum', 'margin', 'vote', 'average', 'sd']
  const visibleMetrics = metricKeys.filter((key) =>
    compileRows.value.some((row) => toFiniteNumber(row?.[key]) !== null)
  )
  return ['ranking', 'team', ...visibleMetrics]
})
const sortedCompileRows = computed<any[]>(() => {
  const key = compileSortKey.value
  const direction = compileSortDirection.value === 'asc' ? 1 : -1
  return compileRows.value
    .map((row, index) => ({ row, index }))
    .sort((leftEntry, rightEntry) => {
      const left = compileSortValue(leftEntry.row, key)
      const right = compileSortValue(rightEntry.row, key)
      const numericLeft = typeof left === 'number' ? left : null
      const numericRight = typeof right === 'number' ? right : null
      if (numericLeft !== null && numericRight !== null) {
        const delta = numericLeft - numericRight
        if (delta !== 0) return direction * delta
        return leftEntry.index - rightEntry.index
      }
      const textLeft = String(left ?? '')
      const textRight = String(right ?? '')
      const diff = sortCollator.compare(textLeft, textRight)
      if (diff !== 0) return direction * diff
      return leftEntry.index - rightEntry.index
    })
    .map((entry) => entry.row)
})
const snapshotIncludesSelectedRound = computed(() => {
  if (selectedRound.value === null) return false
  return compiledSnapshotRoundSet.value.has(selectedRound.value)
})

const compiledRoundSet = computed(() => {
  const set = new Set<number>()
  baselineCompiledOptions.value.forEach((option) => {
    option.rounds.forEach((roundNumber) => {
      const normalized = Number(roundNumber)
      if (Number.isInteger(normalized) && normalized >= 1) {
        set.add(normalized)
      }
    })
  })
  const latestRounds = Array.isArray(compiledStore.compiled?.rounds) ? compiledStore.compiled?.rounds : []
  latestRounds
    .map((item: any) => item?.r ?? item?.round)
    .filter((value: number) => Number.isInteger(value) && value >= 1)
    .forEach((roundNumber: number) => set.add(roundNumber))
  return set
})

const roundConfigByRound = computed(() => {
  const map = new Map<number, any>()
  sortedRounds.value.forEach((round) => {
    map.set(round.round, round)
  })
  return map
})

const drawByRound = computed(() => {
  const map = new Map<number, any>()
  drawsStore.draws.forEach((draw) => {
    map.set(draw.round, draw)
  })
  return map
})

const submissionsByRound = computed(() => {
  const map = new Map<number, Submission[]>()
  submissionsStore.submissions.forEach((submission) => {
    const roundNumber = Number(submission.round)
    if (!Number.isInteger(roundNumber) || roundNumber < 1) return
    const list = map.get(roundNumber) ?? []
    list.push(submission)
    map.set(roundNumber, list)
  })
  return map
})

function submissionsForRound(roundNumber: number, type?: 'ballot' | 'feedback') {
  const list = submissionsByRound.value.get(roundNumber) ?? []
  if (!type) return list
  return list.filter((item) => item.type === type)
}

const selectedRoundSubmissions = computed(() => {
  if (selectedRound.value === null) return []
  return submissionsForRound(selectedRound.value)
})

const submissionEditorTarget = computed<Submission | null>(() => {
  const id = submissionEditorSubmissionId.value.trim()
  if (!id) return null
  return selectedRoundSubmissions.value.find((item) => String(item?._id ?? '') === id) ?? null
})

const submissionEditorHeading = computed(() => {
  if (!submissionEditorTarget.value) return t('提出データを編集')
  if (submissionEditorTarget.value.type === 'ballot') {
    return `${t('チーム評価を編集')}：${submissionEditorTitleForItem(submissionEditorTarget.value)}`
  }
  if (submissionEditorTarget.value.type === 'feedback') {
    return `${t('ジャッジ評価を編集')}：${submissionEditorTitleForItem(submissionEditorTarget.value)}`
  }
  return `${t('提出データを編集')}：${submissionEditorTitleForItem(submissionEditorTarget.value)}`
})

const submissionEditorVenueLabel = computed(() => {
  const submissionId = submissionEditorSubmissionId.value.trim()
  if (!submissionId) return ''
  const matched = submissionPreviewRows.value.find((row) => {
    const team = row.submissionDetail?.team ?? []
    const judge = row.submissionDetail?.judge ?? []
    return [...team, ...judge].some((entry) => String(entry.submissionId ?? '') === submissionId)
  })
  return matched?.venueLabel ?? ''
})

const selectedRoundSubmissionSpeed = computed(() => {
  if (selectedRound.value === null) return null
  return (
    buildSubmissionSpeedRows(selectedRoundSubmissions.value, { delayedMinutes: 30 }).find(
      (row) => row.round === selectedRound.value
    ) ?? null
  )
})

const selectedRoundSubmissionDelayRows = computed(() => {
  if (selectedRound.value === null) return []
  return buildSubmissionDelayRows(selectedRoundSubmissions.value, {
    delayedMinutes: 30,
    topPerRound: 6,
  }).filter((row) => row.round === selectedRound.value)
})

const selectedRoundSubmissionDelayTopNames = computed(() =>
  Array.from(
    new Set(
      selectedRoundSubmissionDelayRows.value
        .map((row) => submissionEntityName(row.id))
        .map((name) => name.trim())
        .filter(Boolean)
    )
  ).slice(0, 6)
)

function teamSpeakerIdsForRound(team: any, roundNumber: number): string[] {
  if (!team) return []
  const detail = Array.isArray(team.details)
    ? team.details.find((item: any) => Number(item?.r) === Number(roundNumber))
    : null
  if (!detail) return []
  return normalizeIdList(detail.speakers ?? [])
}

function feedbackExpectationSettings(roundNumber: number): FeedbackExpectationSettings {
  const round = roundConfigByRound.value.get(roundNumber)
  return resolveFeedbackExpectationSettings(round?.userDefinedData)
}

const emptyRoundSubmissionCoverage: RoundSubmissionCoverage = {
  ballot: { expected: 0, submitted: 0, missing: 0, duplicates: 0, unknown: 0 },
  feedback: { expected: 0, submitted: 0, missing: 0, duplicates: 0, unknown: 0 },
}

const roundSubmissionCoverageByRound = computed(() => {
  const map = new Map<number, RoundSubmissionCoverage>()
  const roundNumbers = new Set<number>()
  roundConfigByRound.value.forEach((_, roundNumber) => roundNumbers.add(roundNumber))
  drawByRound.value.forEach((_, roundNumber) => roundNumbers.add(roundNumber))
  submissionsByRound.value.forEach((_, roundNumber) => roundNumbers.add(roundNumber))

  roundNumbers.forEach((roundNumber) => {
    const draw = drawByRound.value.get(roundNumber)
    const round = roundConfigByRound.value.get(roundNumber)
    map.set(
      roundNumber,
      buildRoundSubmissionCoverage({
        roundNumber,
        allocation: draw?.allocation,
        userDefinedData: round?.userDefinedData,
        submissions: submissionsByRound.value.get(roundNumber) ?? [],
        resolveTeamSpeakerIds: (teamId, targetRound) => {
          const team = teamsStore.teams.find((item) => item._id === teamId)
          return teamSpeakerIdsForRound(team, targetRound)
        },
      })
    )
  })

  return map
})

function roundSubmissionCoverage(roundNumber: number | null): RoundSubmissionCoverage {
  if (roundNumber === null) return emptyRoundSubmissionCoverage
  return roundSubmissionCoverageByRound.value.get(roundNumber) ?? emptyRoundSubmissionCoverage
}

function ballotExpectedCount(roundNumber: number | null) {
  return roundSubmissionCoverage(roundNumber).ballot.expected
}

function ballotSubmittedCount(roundNumber: number | null) {
  return roundSubmissionCoverage(roundNumber).ballot.submitted
}

function feedbackExpectedCount(roundNumber: number | null) {
  return roundSubmissionCoverage(roundNumber).feedback.expected
}

function feedbackSubmittedCount(roundNumber: number | null) {
  return roundSubmissionCoverage(roundNumber).feedback.submitted
}

function unknownSubmissionCount(roundNumber: number | null, type?: 'ballot' | 'feedback') {
  const coverage = roundSubmissionCoverage(roundNumber)
  if (!type) return coverage.ballot.unknown + coverage.feedback.unknown
  return coverage[type].unknown
}

const submissionPreviewShowJudgeColumn = computed(() => {
  if (selectedRound.value === null) return false
  const settings = feedbackExpectationSettings(selectedRound.value)
  return settings.fromTeams || settings.fromAdjudicators
})

const submissionPreviewTeamColumnLabel = computed(() => {
  return t('チーム評価')
})

const submissionPreviewJudgeColumnLabel = computed(() => {
  return t('ジャッジ評価')
})

const selectedRoundBallotGap = computed(() => {
  if (selectedRound.value === null)
    return { expected: 0, submitted: 0, unknown: 0, missing: 0, hasGap: false }
  const expected = ballotExpectedCount(selectedRound.value)
  const submitted = ballotSubmittedCount(selectedRound.value)
  const unknown = unknownSubmissionCount(selectedRound.value, 'ballot')
  const missing = Math.max(0, expected - submitted)
  const hasGap = (expected > 0 && submitted < expected) || unknown > 0
  return { expected, submitted, unknown, missing, hasGap }
})

const selectedRoundBallotGapWarning = computed(() => {
  if (!selectedRoundBallotGap.value.hasGap) return ''
  if (selectedRoundBallotGap.value.expected <= 0) return ''
  return t('未提出のチーム評価があります（提出 {submitted}/{expected}）。', {
    submitted: selectedRoundBallotGap.value.submitted,
    expected: selectedRoundBallotGap.value.expected,
  })
})

const selectedRoundUnknownBallotWarning = computed(() => {
  if (selectedRoundBallotGap.value.unknown <= 0) return ''
  return t(
    '提出者情報が不足したチーム評価が {count} 件あります。提出状況タブで提出者を補完してください。',
    {
      count: selectedRoundBallotGap.value.unknown,
    }
  )
})

const shouldBlockSubmissionCompile = computed(() => selectedRoundBallotGap.value.hasGap)

function roundTaskStates(roundNumber: number): Record<HubTask, HubTaskState> {
  const draw = drawsStore.draws.find((item) => item.round === roundNumber)
  const hasDraw = Boolean(draw && Array.isArray(draw.allocation) && draw.allocation.length > 0)
  const published = Boolean(draw?.drawOpened && draw?.allocationOpened)
  const hasCompiled = compiledRoundSet.value.has(roundNumber)
  const hasAnySubmission = submissionsForRound(roundNumber).length > 0
  const expected = ballotExpectedCount(roundNumber)
  const submitted = ballotSubmittedCount(roundNumber)
  const unknown = unknownSubmissionCount(roundNumber, 'ballot')
  const hasGap = (expected > 0 && submitted < expected) || unknown > 0

  const drawState: HubTaskState = hasDraw ? 'done' : 'ready'
  const publishState: HubTaskState =
    published || hasAnySubmission || hasCompiled ? 'done' : !hasDraw ? 'blocked' : 'ready'
  const submissionsState: HubTaskState = !hasDraw ? 'blocked' : hasGap ? 'ready' : 'done'
  const compileState: HubTaskState = hasCompiled ? 'done' : hasGap ? 'blocked' : 'ready'

  return {
    draw: drawState,
    publish: publishState,
    submissions: submissionsState,
    compile: compileState,
  }
}

function recommendedTaskForRound(roundNumber: number): HubTask {
  const states = roundTaskStates(roundNumber)
  const nextTask = hubTaskOrder.find((task) => states[task] !== 'done')
  return nextTask ?? 'compile'
}

function resolveTaskForRound(roundNumber: number): HubTask {
  const selected = roundTaskSelection.value[roundNumber]
  if (selected && hubTaskOrder.includes(selected)) return selected
  return recommendedTaskForRound(roundNumber)
}

function taskStateLabel(state: HubTaskState) {
  if (state === 'done') return t('完了')
  if (state === 'blocked') return t('前段階待ち')
  return t('実行可能')
}

const operationTasks = computed<
  Array<{ key: HubTask; order: number; label: string; state: HubTaskState; stateLabel: string }>
>(() => {
  const states =
    selectedRound.value === null
      ? {
          draw: 'ready' as HubTaskState,
          publish: 'blocked' as HubTaskState,
          submissions: 'blocked' as HubTaskState,
          compile: 'blocked' as HubTaskState,
        }
      : roundTaskStates(selectedRound.value)

  return [
    {
      key: 'draw',
      order: 1,
      label: t('対戦表作成'),
      state: states.draw,
      stateLabel: taskStateLabel(states.draw),
    },
    {
      key: 'publish',
      order: 2,
      label: t('ラウンド公開設定'),
      state: states.publish,
      stateLabel: taskStateLabel(states.publish),
    },
    {
      key: 'submissions',
      order: 3,
      label: t('提出状況確認'),
      state: states.submissions,
      stateLabel: taskStateLabel(states.submissions),
    },
    {
      key: 'compile',
      order: 4,
      label: t('ラウンド結果集計'),
      state: states.compile,
      stateLabel: taskStateLabel(states.compile),
    },
  ]
})

const activeTaskHint = computed(() => {
  if (selectedRound.value === null) return ''
  if (activeTask.value === 'draw') {
    return t('対戦表作成では参照集計結果を選択できます。未選択でも自動生成できます。')
  }
  if (activeTask.value === 'publish' && !selectedRoundHasDraw.value) {
    return t('まず対戦表を生成してください。')
  }
  if (activeTask.value === 'compile') {
    return t(
      '提出結果を集計して成績を確定します。成績に含めるラウンドを確認してから実行してください。'
    )
  }
  return ''
})

function roundStatus(roundNumber: number): RoundOperationStatus {
  const draw = drawsStore.draws.find((item) => item.round === roundNumber)
  return resolveRoundOperationStatus({
    hasSubmissions: submissionsForRound(roundNumber).length > 0,
    hasCompiled: compiledRoundSet.value.has(roundNumber),
    hasDraw: Boolean(draw && Array.isArray(draw.allocation) && draw.allocation.length > 0),
    isPublished: Boolean(draw?.drawOpened && draw?.allocationOpened),
  })
}

function roundCurrentStepLabel(roundNumber: number) {
  const nextTask = recommendedTaskForRound(roundNumber)
  if (nextTask === 'draw') return `1. ${t('対戦表作成')}`
  if (nextTask === 'publish') return `2. ${t('ラウンド公開設定')}`
  if (nextTask === 'submissions') return `3. ${t('提出状況確認')}`
  return `4. ${t('ラウンド結果集計')}`
}

function isRoundStepCompleted(roundNumber: number) {
  return compiledRoundSet.value.has(roundNumber)
}

function roundLabel(roundNumber: number) {
  const found = sortedRounds.value.find((round) => round.round === roundNumber)
  return found?.name || t('ラウンド {round}', { round: roundNumber })
}

function roundStatusLabel(status: RoundOperationStatus) {
  if (status === 'finalized') return t('公開中')
  if (status === 'generated') return t('生成済み')
  if (status === 'compiled') return t('集計済み')
  if (status === 'collecting') return t('回収中')
  return t('準備中')
}

const compileIncludeLabelsFromRound = computed(() =>
  includeLabelsFromRoundDetails(selectedRoundData.value?.userDefinedData)
)

function applyCompileDraftFromRound() {
  if (selectedRound.value === null) return
  const userDefined = (selectedRoundData.value?.userDefinedData ?? {}) as Record<string, any>
  const rawCompile = (userDefined.compile ?? {}) as Record<string, any>
  const compileOptionsSource =
    rawCompile.options && typeof rawCompile.options === 'object'
      ? (rawCompile.options as CompileOptions)
      : (rawCompile as CompileOptions)
  const normalizedOptions = normalizeCompileOptions(compileOptionsSource)
  rankingPriorityPreset.value = normalizedOptions.ranking_priority.preset
  rankingPriorityOrder.value = [...normalizedOptions.ranking_priority.order]
  compileWinnerPolicy.value = normalizedOptions.winner_policy
  compileTiePoints.value = normalizedOptions.tie_points
  compileDuplicateMergePolicy.value = normalizedOptions.duplicate_normalization.merge_policy
  compilePoiAggregation.value = normalizedOptions.duplicate_normalization.poi_aggregation
  compileBestAggregation.value = normalizedOptions.duplicate_normalization.best_aggregation
  compileMissingDataPolicy.value = normalizedOptions.missing_data_policy
}

function buildCompileOptions(overrides?: {
  missing_data_policy?: CompileOptions['missing_data_policy']
}): CompileOptions {
  const selectedBaselineId = selectedCompileDiffBaselineCompiledId.value
  const diffBaseline =
    selectedBaselineId.length > 0
      ? { mode: 'compiled' as const, compiled_id: selectedBaselineId }
      : { mode: 'latest' as const }
  const rankingOrder = Array.from(new Set(rankingPriorityOrder.value))
  return {
    ranking_priority: {
      preset: rankingPriorityPreset.value,
      order:
        rankingOrder.length > 0
          ? rankingOrder
          : [...DEFAULT_COMPILE_OPTIONS.ranking_priority.order],
    },
    winner_policy: compileWinnerPolicy.value,
    tie_points:
      Number.isFinite(compileTiePoints.value) && compileTiePoints.value >= 0
        ? compileTiePoints.value
        : DEFAULT_COMPILE_OPTIONS.tie_points,
    duplicate_normalization: {
      merge_policy: compileDuplicateMergePolicy.value,
      poi_aggregation: compilePoiAggregation.value,
      best_aggregation: compileBestAggregation.value,
    },
    missing_data_policy: overrides?.missing_data_policy ?? compileMissingDataPolicy.value,
    include_labels: compileIncludeLabelsFromRound.value,
    diff_baseline: diffBaseline,
  }
}

function trackCompileMetric(
  metric: 'preview_run' | 'save_snapshot' | 'save_blocked_stale' | 'save_cancelled',
  source: CompileSource,
  reason?: string
) {
  if (!compileManualSaveEnabled) return
  trackAdminCompileWorkflowMetric({
    metric,
    tournamentId: tournamentId.value,
    screen: 'operations',
    source,
    reason,
  })
}

function buildCompileInputKey(
  source: CompileSource,
  optionOverrides?: {
    missing_data_policy?: CompileOptions['missing_data_policy']
  }
): string {
  return JSON.stringify({
    contextRound: selectedRound.value,
    source,
    rounds: [...effectiveCompileTargetRounds.value],
    options: buildCompileOptions(optionOverrides),
  })
}

function compileRoundRangeLabel(rounds: number[]): string {
  const normalized = Array.from(
    new Set(rounds.filter((round) => Number.isInteger(round) && round >= 1))
  ).sort((left, right) => left - right)
  if (normalized.length === 0) return t('全ラウンド')
  if (normalized.length === 1) return roundLabel(normalized[0])
  return `${roundLabel(normalized[0])}-${roundLabel(normalized[normalized.length - 1])}`
}

function rankingTrendForRow(row: any) {
  return resolveRankingTrend(row?.diff?.ranking?.trend)
}

function rankingTrendClass(row: any) {
  const trend = rankingTrendForRow(row)
  if (trend === 'improved') return 'diff-improved'
  if (trend === 'worsened') return 'diff-worsened'
  if (trend === 'unchanged') return 'diff-unchanged'
  if (trend === 'new') return 'diff-new'
  return 'diff-na'
}

function rankingTrendText(row: any) {
  const trend = rankingTrendForRow(row)
  const deltaText = formatSignedDelta(row?.diff?.ranking?.delta)
  if (trend === 'improved') return t('順位改善 {delta}', { delta: deltaText || '' }).trim()
  if (trend === 'worsened') return t('順位悪化 {delta}', { delta: deltaText || '' }).trim()
  if (trend === 'unchanged') return t('順位変化なし')
  if (trend === 'new') return t('新規エントリー')
  return t('差分なし')
}

function rankingDeltaText(row: any) {
  return formatSignedDelta(row?.diff?.ranking?.delta)
}

function compileRankingSymbolForRow(row: any) {
  return rankingTrendSymbol(rankingTrendForRow(row))
}

function metricDeltaText(row: any, key: string) {
  return formatSignedDelta(row?.diff?.metrics?.[key]?.delta)
}

function compileSortValue(row: any, key: string): number | string {
  if (key === 'team') return teamName(String(row?.id ?? ''))
  const numeric = toFiniteNumber(row?.[key])
  if (numeric !== null) return numeric
  return String(row?.[key] ?? '')
}

function setCompileSort(key: string) {
  if (compileSortKey.value === key) {
    compileSortDirection.value = compileSortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }
  compileSortKey.value = key
  compileSortDirection.value = key === 'ranking' ? 'asc' : 'desc'
}

function compileSortIndicator(key: string) {
  if (compileSortKey.value !== key) return '↕'
  return compileSortDirection.value === 'asc' ? '↑' : '↓'
}

function compileColumnLabel(key: string) {
  const map: Record<string, string> = {
    ranking: t('順位'),
    team: t('チーム'),
    win: t('勝利数'),
    sum: t('合計'),
    margin: t('マージン'),
    vote: t('票'),
    average: t('平均'),
    sd: t('標準偏差'),
  }
  return map[key] ?? key
}

function formatCompileValue(value: unknown) {
  if (Array.isArray(value)) {
    if (value.length === 0) return '—'
    return value.map((item) => String(item)).join(', ')
  }
  const numeric = toFiniteNumber(value)
  if (numeric !== null) {
    const rounded = Math.round(numeric * 1000) / 1000
    return String(rounded)
  }
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function formatCompileCsvValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (Array.isArray(value)) return value.map((item) => String(item)).join(',')
  if (value === null || value === undefined || value === '') return ''
  return String(value)
}

function escapeCsv(value: string) {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function downloadCompileReportCsv() {
  if (sortedCompileRows.value.length === 0) return
  const headerKeys = [...compileColumns.value]
  const headerLabels = headerKeys.map((key) => compileColumnLabel(key))
  const rows = sortedCompileRows.value.map((row) =>
    headerKeys.map((key) => {
      const raw = key === 'team' ? teamName(String(row?.id ?? '')) : row?.[key]
      return escapeCsv(formatCompileCsvValue(raw))
    })
  )
  const csv = [
    headerLabels.map((label) => escapeCsv(label)).join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\n')
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const round = selectedRound.value
  link.download =
    round === null ? 'round_compiled_results.csv' : `round_${round}_compiled_results.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function compileRowKey(row: any, index: number): string {
  const id = String(row?.id ?? '').trim()
  return id || `compile-row-${index}`
}

function compileTeamLabel(row: any): string {
  return teamName(String(row?.id ?? ''))
}

function teamName(id: string) {
  return teamsStore.teams.find((team) => team._id === id)?.name ?? id
}

function adjudicatorName(id: string) {
  return adjudicatorsStore.adjudicators.find((item) => item._id === id)?.name ?? id
}

function submissionEntityName(id: string) {
  if (!id) return ''
  const normalized = String(id).trim()
  if (!normalized) return ''
  const team = teamsStore.teams.find((item) => item._id === normalized)
  if (team) return team.name
  const adjudicator = adjudicatorsStore.adjudicators.find((item) => item._id === normalized)
  if (adjudicator) return adjudicator.name
  const speaker = speakersStore.speakers.find((item) => item._id === normalized)
  if (speaker) return speaker.name
  return normalized
}

function formatSubmissionTimestamp(value?: string) {
  if (!value) return t('日時不明')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('日時不明')
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function speedStatusLabel(status: 'ok' | 'warn' | 'danger') {
  if (status === 'danger') return t('要介入')
  if (status === 'warn') return t('注意')
  return t('正常')
}

function openSubmissionEditorModal(submissionId: string) {
  const normalized = String(submissionId ?? '').trim()
  if (!normalized) return
  submissionEditorSubmissionId.value = normalized
  submissionEditorModalOpen.value = true
}

function closeSubmissionEditorModal() {
  submissionEditorModalOpen.value = false
  submissionEditorSubmissionId.value = ''
}

function venueName(id: string) {
  return venuesStore.venues.find((item) => item._id === id)?.name ?? id
}

const venueOrderMap = computed(() => {
  const map = new Map<string, number>()
  venuesStore.venues.forEach((venue, index) => {
    map.set(String(venue._id), index)
  })
  return map
})

function venuePriority(id?: string) {
  if (!id) return Number.MAX_SAFE_INTEGER
  return venueOrderMap.value.get(String(id)) ?? Number.MAX_SAFE_INTEGER - 1
}

const compiledTeamWinMap = computed(() => {
  const map = new Map<string, number>()
  const rows = Array.isArray(compiledStore.compiled?.compiled_team_results)
    ? compiledStore.compiled.compiled_team_results
    : []
  rows.forEach((row: any) => {
    const id = String(row?.id ?? '')
    if (!id) return
    map.set(id, toFiniteNumber(row?.win) ?? 0)
  })
  return map
})

function adjudicatorLabel(ids: string[]) {
  if (!ids || ids.length === 0) return '—'
  return ids.map((id) => adjudicatorName(String(id))).join(', ')
}

type HubDrawPreviewRow = DrawPreviewRow & {
  govId: string
  oppId: string
  pairKey: string
  chairIds: string[]
  panelIds: string[]
  traineeIds: string[]
  ballotSubmitterIds: string[]
  adjudicatorIds: string[]
}

type SubmissionPreviewEntry = DrawPreviewSubmissionRow & {
  sortValue: number
}

function normalizeTeamPairKey(teamAId: string, teamBId: string) {
  const left = String(teamAId ?? '').trim()
  const right = String(teamBId ?? '').trim()
  if (!left || !right) return ''
  return [left, right].sort((a, b) => sortCollator.compare(a, b)).join('::')
}

function ballotSummaryForPreview(payload: Record<string, unknown>) {
  const teamAId = String(payload.teamAId ?? '').trim()
  const teamBId = String(payload.teamBId ?? '').trim()
  if (!teamAId || !teamBId) return t('チーム評価')
  const matchup = `${teamName(teamAId)} vs ${teamName(teamBId)}`
  if (payload.draw === true) return `${matchup} / ${t('勝者')}: ${t('引き分け')}`
  const winnerId = String(payload.winnerId ?? '').trim()
  if (!winnerId) return matchup
  return `${matchup} / ${t('勝者')}: ${teamName(winnerId)}`
}

function feedbackSummaryForPreview(payload: Record<string, unknown>) {
  const adjudicatorId = String(payload.adjudicatorId ?? '').trim()
  if (!adjudicatorId) return t('ジャッジ評価')
  const label = `${t('ジャッジ')}: ${adjudicatorName(adjudicatorId)}`
  const score = toFiniteNumber(payload.score)
  if (score === null) return label
  return `${label} / ${t('スコア')}: ${score}`
}

function submissionSummaryForPreview(item: any) {
  const payload = (item?.payload ?? {}) as Record<string, unknown>
  if (item?.type === 'ballot') return ballotSummaryForPreview(payload)
  if (item?.type === 'feedback') return feedbackSummaryForPreview(payload)
  return t('提出データ')
}

function submissionEditorTitleForItem(item: Submission) {
  const payload = (item?.payload ?? {}) as Record<string, unknown>
  if (item.type === 'ballot') {
    const teamAId = String(payload.teamAId ?? '').trim()
    const teamBId = String(payload.teamBId ?? '').trim()
    if (teamAId && teamBId) return `${teamName(teamAId)} vs ${teamName(teamBId)}`
    return t('チーム評価')
  }
  if (item.type === 'feedback') {
    const adjudicatorId = String(payload.adjudicatorId ?? '').trim()
    if (adjudicatorId) return `${t('ジャッジ')}: ${adjudicatorName(adjudicatorId)}`
    return t('ジャッジ評価')
  }
  return t('提出データ')
}

function submissionSortValue(value?: string) {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function submissionActorKey(item: any) {
  const payloadEntityId = String(item?.payload?.submittedEntityId ?? '').trim()
  if (payloadEntityId) return payloadEntityId
  return String(item?.submittedBy ?? '').trim()
}

function buildSubmissionPreviewEntry(item: any, index: number): SubmissionPreviewEntry {
  const actorId = submissionActorKey(item)
  const submittedBy = actorId ? submissionEntityName(actorId) : ''
  return {
    key: String(item?._id ?? `${item?.type ?? 'submission'}-${index}`),
    submissionId: String(item?._id ?? '').trim() || undefined,
    submittedByLabel: submittedBy || t('不明'),
    summaryLabel: submissionSummaryForPreview(item),
    submittedAtLabel: formatSubmissionTimestamp(item?.createdAt),
    sortValue: submissionSortValue(item?.createdAt),
  }
}

function sortSubmissionPreviewEntries(
  entries: SubmissionPreviewEntry[]
): DrawPreviewSubmissionRow[] {
  return entries
    .slice()
    .sort((left, right) => right.sortValue - left.sortValue)
    .map(({ sortValue: _, ...entry }) => entry)
}

function toFiniteNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => toFiniteNumber(entry))
    .filter((entry: number | null): entry is number => entry !== null)
}

function sideScoreTotalFromPayload(payload: Record<string, unknown>, side: 'A' | 'B'): number | null {
  const scores = toFiniteNumberList(payload[`scores${side}`])
  if (scores.length > 0) {
    return scores.reduce((total, score) => total + score, 0)
  }
  const matter = toFiniteNumberList(payload[`matter${side}`])
  const manner = toFiniteNumberList(payload[`manner${side}`])
  const length = Math.max(matter.length, manner.length)
  if (length === 0) return null
  let hasAny = false
  let total = 0
  for (let index = 0; index < length; index += 1) {
    const matterValue = matter[index]
    const mannerValue = manner[index]
    if (matterValue !== undefined || mannerValue !== undefined) hasAny = true
    total += (matterValue ?? 0) + (mannerValue ?? 0)
  }
  return hasAny ? total : null
}

function resolveBallotSidesForRow(
  ballot: Submission,
  row: HubDrawPreviewRow
): { payload: Record<string, unknown>; govIsA: boolean } | null {
  const payload = (ballot?.payload ?? {}) as Record<string, unknown>
  const teamAId = String(payload.teamAId ?? '').trim()
  const teamBId = String(payload.teamBId ?? '').trim()
  if (!teamAId || !teamBId) return null
  if (teamAId === row.govId && teamBId === row.oppId) {
    return { payload, govIsA: true }
  }
  if (teamAId === row.oppId && teamBId === row.govId) {
    return { payload, govIsA: false }
  }
  return null
}

function ballotScoreSumBySideForRow(
  ballot: Submission,
  row: HubDrawPreviewRow
): { gov: number; opp: number } | null {
  const resolved = resolveBallotSidesForRow(ballot, row)
  if (!resolved) return null
  const { payload, govIsA } = resolved
  const sumA = sideScoreTotalFromPayload(payload, 'A')
  const sumB = sideScoreTotalFromPayload(payload, 'B')
  if (sumA === null || sumB === null) return null
  return govIsA ? { gov: sumA, opp: sumB } : { gov: sumB, opp: sumA }
}

function ballotWinSumBySideForRow(
  ballot: Submission,
  row: HubDrawPreviewRow
): { gov: number; opp: number } | null {
  const resolved = resolveBallotSidesForRow(ballot, row)
  if (!resolved) return null
  if (resolved.payload.draw === true) {
    return { gov: 0, opp: 0 }
  }
  const winnerId = String(resolved.payload.winnerId ?? '').trim()
  if (winnerId) {
    if (winnerId === row.govId) return { gov: 1, opp: 0 }
    if (winnerId === row.oppId) return { gov: 0, opp: 1 }
    return null
  }
  const score = ballotScoreSumBySideForRow(ballot, row)
  if (!score) return null
  if (score.gov > score.opp) return { gov: 1, opp: 0 }
  if (score.opp > score.gov) return { gov: 0, opp: 1 }
  return { gov: 0, opp: 0 }
}

function formatSubmissionSumValue(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded)
}

function buildSubmissionWinDisplay(
  row: HubDrawPreviewRow,
  ballots: Submission[],
  expectedCount: number
): Pick<
  DrawPreviewRow,
  | 'winLabel'
  | 'winTotal'
  | 'winGap'
  | 'winStatus'
  | 'winStatusLabel'
  | 'winMetaLabel'
  | 'scoreLabel'
  | 'scoreTotal'
  | 'scoreGap'
> {
  let govWinTotal = 0
  let oppWinTotal = 0
  let calculatedWinCount = 0
  let govScoreTotal = 0
  let oppScoreTotal = 0
  let calculatedScoreCount = 0

  ballots.forEach((ballot) => {
    const win = ballotWinSumBySideForRow(ballot, row)
    if (win) {
      govWinTotal += win.gov
      oppWinTotal += win.opp
      calculatedWinCount += 1
    }
    const score = ballotScoreSumBySideForRow(ballot, row)
    if (score) {
      govScoreTotal += score.gov
      oppScoreTotal += score.opp
      calculatedScoreCount += 1
    }
  })

  const hasExpected = expectedCount > 0
  const denominator = hasExpected ? expectedCount : Math.max(calculatedWinCount, ballots.length)
  const zeroPairLabel = '0-0'
  const scorePairLabel =
    calculatedScoreCount > 0
      ? `${formatSubmissionSumValue(govScoreTotal)}-${formatSubmissionSumValue(oppScoreTotal)}`
      : zeroPairLabel
  const scorePairWithUnitLabel = calculatedScoreCount > 0 ? `${scorePairLabel} pts` : scorePairLabel
  const scoreLabel = scorePairLabel
  const scoreTotal = calculatedScoreCount > 0 ? govScoreTotal + oppScoreTotal : -1
  const scoreGap = calculatedScoreCount > 0 ? Math.abs(govScoreTotal - oppScoreTotal) : 0

  if (calculatedWinCount === 0) {
    const winLabel = `0-0(${scorePairLabel})`
    return {
      winLabel,
      winTotal: -1,
      winGap: 0,
      winStatus: 'insufficient',
      winStatusLabel: t('未算出'),
      scoreLabel,
      scoreTotal,
      scoreGap,
    }
  }

  const winPairLabel = `${formatSubmissionSumValue(govWinTotal)}-${formatSubmissionSumValue(oppWinTotal)}`
  const confirmed = denominator > 0 && calculatedWinCount >= denominator
  return {
    winLabel: `${winPairLabel} (${scorePairWithUnitLabel})`,
    winTotal: govWinTotal + oppWinTotal,
    winGap: Math.abs(govWinTotal - oppWinTotal),
    winStatus: confirmed ? 'confirmed' : 'provisional',
    winStatusLabel: confirmed ? t('確定') : t('暫定'),
    scoreLabel,
    scoreTotal,
    scoreGap,
  }
}

const drawPreviewRows = computed<HubDrawPreviewRow[]>(() => {
  const allocation = Array.isArray(selectedDraw.value?.allocation)
    ? selectedDraw.value?.allocation
    : []
  return allocation.map((row: any, index: number) => {
    const govId = String(row?.teams?.gov ?? '')
    const oppId = String(row?.teams?.opp ?? '')
    const govWin = compiledTeamWinMap.value.get(govId) ?? 0
    const oppWin = compiledTeamWinMap.value.get(oppId) ?? 0
    const venueId = String(row?.venue ?? '')
    const chairs = normalizeIdList(row?.chairs ?? [])
    const panels = normalizeIdList(row?.panels ?? [])
    const trainees = normalizeIdList(row?.trainees ?? [])
    const ballotSubmitterIds = normalizeIdList([...chairs, ...panels])
    const adjudicatorIds = normalizeIdList([...chairs, ...panels, ...trainees])
    return {
      key: `${index}-${govId}-${oppId}-${venueId}`,
      matchIndex: index,
      venuePriority: venuePriority(venueId),
      venueLabel: venueId ? venueName(venueId) : t('会場未定'),
      govId,
      oppId,
      pairKey: normalizeTeamPairKey(govId, oppId),
      chairIds: chairs,
      panelIds: panels,
      traineeIds: trainees,
      ballotSubmitterIds,
      adjudicatorIds,
      govName: govId ? teamName(govId) : t('未選択'),
      oppName: oppId ? teamName(oppId) : t('未選択'),
      winLabel: `${govWin}-${oppWin}`,
      winTotal: govWin + oppWin,
      winGap: Math.abs(govWin - oppWin),
      chairsLabel: adjudicatorLabel(chairs),
      panelsLabel: adjudicatorLabel(panels),
      traineesLabel: adjudicatorLabel(trainees),
    }
  })
})

const publishPreviewRows = computed<DrawPreviewRow[]>(() => drawPreviewRows.value)
const publishPreviewColumnHeaderBadges = computed(() => {
  const teamTone: 'open' | 'closed' = drawOpenedValue.value ? 'open' : 'closed'
  const adjudicatorTone: 'open' | 'closed' = allocationOpenedValue.value ? 'open' : 'closed'
  const teamBadge: Array<{ text: string; tone: 'open' | 'closed' }> = [
    { text: drawOpenedValue.value ? t('公開') : t('非公開'), tone: teamTone },
  ]
  const adjudicatorBadge: Array<{ text: string; tone: 'open' | 'closed' }> = [
    { text: allocationOpenedValue.value ? t('公開') : t('非公開'), tone: adjudicatorTone },
  ]
  return {
    gov: teamBadge,
    opp: teamBadge,
    score: teamBadge,
    chair: adjudicatorBadge,
    panel: adjudicatorBadge,
    trainee: adjudicatorBadge,
  }
})

function feedbackExpectedCountForPreviewRow(row: HubDrawPreviewRow) {
  if (selectedRound.value === null) return 0
  const roundNumber = selectedRound.value
  const settings = feedbackExpectationSettings(selectedRound.value)
  const expectationRow: SubmissionExpectationRow = {
    govTeamId: row.govId,
    oppTeamId: row.oppId,
    teamIds: normalizeIdList([row.govId, row.oppId]),
    chairIds: row.chairIds,
    panelIds: row.panelIds,
    traineeIds: row.traineeIds,
    ballotSubmitterIds: row.ballotSubmitterIds,
    adjudicatorIds: row.adjudicatorIds,
  }
  return expectedFeedbackCountForRow({
    roundNumber,
    settings,
    row: expectationRow,
    resolveTeamSpeakerIds: (teamId, targetRound) => {
      const team = teamsStore.teams.find((item) => item._id === teamId)
      return teamSpeakerIdsForRound(team, targetRound)
    },
  })
}

const submissionPreviewRows = computed<DrawPreviewRow[]>(() => {
  const rows = drawPreviewRows.value
  if (rows.length === 0) return []

  const teamPairToRowKey = new Map<string, string>()
  const adjudicatorToRowKey = new Map<string, string>()
  const bucketByRowKey = new Map<
    string,
    { team: SubmissionPreviewEntry[]; teamBallots: Submission[]; judge: SubmissionPreviewEntry[] }
  >()

  rows.forEach((row) => {
    if (row.pairKey) teamPairToRowKey.set(row.pairKey, row.key)
    row.adjudicatorIds.forEach((adjudicatorId) => {
      if (!adjudicatorToRowKey.has(adjudicatorId)) adjudicatorToRowKey.set(adjudicatorId, row.key)
    })
    bucketByRowKey.set(row.key, { team: [], teamBallots: [], judge: [] })
  })

  selectedRoundSubmissions.value.forEach((item, index) => {
    const payload = (item?.payload ?? {}) as Record<string, unknown>
    if (item?.type === 'ballot') {
      const pairKey = normalizeTeamPairKey(
        String(payload.teamAId ?? ''),
        String(payload.teamBId ?? '')
      )
      const rowKey = teamPairToRowKey.get(pairKey)
      if (!rowKey) return
      const bucket = bucketByRowKey.get(rowKey)
      if (!bucket) return
      bucket.team.push(buildSubmissionPreviewEntry(item, index))
      bucket.teamBallots.push(item as Submission)
      return
    }
    if (item?.type === 'feedback') {
      const adjudicatorId = String(payload.adjudicatorId ?? '').trim()
      if (!adjudicatorId) return
      const rowKey = adjudicatorToRowKey.get(adjudicatorId)
      if (!rowKey) return
      bucketByRowKey.get(rowKey)?.judge.push(buildSubmissionPreviewEntry(item, index))
    }
  })

  return rows.map((row) => {
    const bucket = bucketByRowKey.get(row.key) ?? { team: [], teamBallots: [], judge: [] }
    const expectedBallotCount = row.ballotSubmitterIds.length
    const winDisplay = buildSubmissionWinDisplay(row, bucket.teamBallots, expectedBallotCount)
    return {
      ...row,
      ...winDisplay,
      teamSubmissionCount: bucket.team.length,
      teamSubmissionExpectedCount: expectedBallotCount,
      judgeSubmissionCount: bucket.judge.length,
      judgeSubmissionExpectedCount: feedbackExpectedCountForPreviewRow(row),
      submissionDetail: {
        team: sortSubmissionPreviewEntries(bucket.team),
        judge: sortSubmissionPreviewEntries(bucket.judge),
      },
    }
  })
})

function submissionPreviewSearchText(row: DrawPreviewRow): string {
  const teamDetails = row.submissionDetail?.team ?? []
  const judgeDetails = row.submissionDetail?.judge ?? []
  const detailText = [...teamDetails, ...judgeDetails]
    .map((entry) => `${entry.submittedByLabel} ${entry.summaryLabel} ${entry.submittedAtLabel}`)
    .join(' ')
  return [
    row.venueLabel,
    row.govName,
    row.oppName,
    row.chairsLabel,
    row.panelsLabel,
    row.traineesLabel,
    detailText,
  ]
    .filter((value) => String(value).trim().length > 0)
    .join(' ')
}

const filteredSubmissionPreviewRows = computed<DrawPreviewRow[]>(() => {
  const query = submissionPreviewSearchQuery.value.trim().toLowerCase()
  if (!query) return submissionPreviewRows.value
  return submissionPreviewRows.value.filter((row) =>
    submissionPreviewSearchText(row).toLowerCase().includes(query)
  )
})

async function refresh() {
  if (!tournamentId.value) {
    hasLoaded.value = true
    return
  }
  sectionLoading.value = true
  actionError.value = ''
  submissionsLoadError.value = ''
  try {
    await Promise.all([
      roundsStore.fetchRounds(tournamentId.value),
      drawsStore.fetchDraws(tournamentId.value),
      submissionsStore.fetchSubmissions({ tournamentId: tournamentId.value }),
      teamsStore.fetchTeams(tournamentId.value),
      adjudicatorsStore.fetchAdjudicators(tournamentId.value),
      speakersStore.fetchSpeakers(tournamentId.value),
      venuesStore.fetchVenues(tournamentId.value),
      compiledStore.fetchLatest(tournamentId.value),
      refreshCompiledHistory(),
    ])
    submissionsLoadError.value = submissionsStore.error ?? ''
    const queryRound = Number(route.query.round)
    const hasQueryRound = Number.isInteger(queryRound) && queryRound >= 1
    if (hasQueryRound && sortedRounds.value.some((item) => item.round === queryRound)) {
      selectedRound.value = queryRound
    } else if (
      selectedRound.value === null ||
      !sortedRounds.value.some((round) => round.round === selectedRound.value)
    ) {
      selectedRound.value = sortedRounds.value[0]?.round ?? null
    }
    const queryTask = route.query.task
    if (selectedRound.value !== null) {
      if (isHubTask(queryTask)) {
        roundTaskSelection.value = {
          ...roundTaskSelection.value,
          [selectedRound.value]: queryTask,
        }
        activeTask.value = queryTask
      } else {
        activeTask.value = resolveTaskForRound(selectedRound.value)
      }
    } else {
      activeTask.value = 'draw'
    }
  } catch (err: any) {
    actionError.value = err?.response?.data?.errors?.[0]?.message ?? t('読み込みに失敗しました。')
  } finally {
    hasLoaded.value = true
    sectionLoading.value = false
  }
}

function selectRound(roundNumber: number) {
  selectedRound.value = roundNumber
  const nextTask = resolveTaskForRound(roundNumber)
  activeTask.value = nextTask
  router.replace({
    path: route.path,
    query: {
      ...route.query,
      round: String(roundNumber),
      task: nextTask,
    },
  })
}

function isHubTask(value: unknown): value is HubTask {
  return typeof value === 'string' && hubTaskOrder.includes(value as HubTask)
}

function selectTask(task: HubTask) {
  activeTask.value = task
  if (selectedRound.value !== null) {
    const roundNumber = selectedRound.value
    roundTaskSelection.value = {
      ...roundTaskSelection.value,
      [roundNumber]: task,
    }
  }
  router.replace({
    path: route.path,
    query: {
      ...route.query,
      task,
    },
  })
}

async function runCompileWithSource(
  source: CompileSource,
  optionOverrides?: {
    missing_data_policy?: CompileOptions['missing_data_policy']
  }
) {
  if (selectedRound.value === null || effectiveCompileTargetRounds.value.length === 0) return
  compileMessage.value = ''
  actionError.value = ''
  closeForceCompileModal()
  if (source === 'submissions' && shouldBlockSubmissionCompile.value) {
    actionError.value =
      selectedRoundBallotGapWarning.value ||
      t('選択ラウンドのチーム評価が揃っていないため、集計を実行できません。')
    return
  }
  const result = await compiledStore.runCompile(tournamentId.value, {
    source,
    rounds: effectiveCompileTargetRounds.value,
    options: buildCompileOptions(optionOverrides),
  })
  if (!result) {
    actionError.value = compiledStore.error ?? t('集計に失敗しました。')
    return
  }
  manualCompileSource.value = source
  manualCompileOptionOverrides.value = optionOverrides
  compileWorkflow.clearPreview()
  compiledStore.clearPreview()
  compileMessage.value = t('集計が完了しました。')
  await Promise.all([compiledStore.fetchLatest(tournamentId.value), refreshCompiledHistory()])
}

async function runPreviewWithSource(
  source: CompileSource,
  optionOverrides?: {
    missing_data_policy?: CompileOptions['missing_data_policy']
  }
) {
  if (!compileManualSaveEnabled) return
  if (selectedRound.value === null || effectiveCompileTargetRounds.value.length === 0) return
  compileMessage.value = ''
  actionError.value = ''
  closeForceCompileModal()
  if (source === 'submissions' && shouldBlockSubmissionCompile.value) {
    actionError.value =
      selectedRoundBallotGapWarning.value ||
      t('選択ラウンドのチーム評価が揃っていないため、集計を実行できません。')
    return
  }
  const inputKey = buildCompileInputKey(source, optionOverrides)
  compileWorkflow.setCurrentInputKey(inputKey)
  manualCompileSource.value = source
  manualCompileOptionOverrides.value = optionOverrides
  const preview = await compiledStore.runPreview(tournamentId.value, {
    source,
    rounds: effectiveCompileTargetRounds.value,
    options: buildCompileOptions(optionOverrides),
  })
  const previewState = compiledStore.previewState
  if (!preview || !previewState) {
    actionError.value = compiledStore.error ?? t('集計に失敗しました。')
    return
  }
  compileWorkflow.applyPreview(
    {
      previewSignature: previewState.previewSignature,
      revision: previewState.revision,
      source,
    },
    inputKey
  )
  compileMessage.value = t('仮集計を実行しました。内容を確認して保存してください。')
  trackCompileMetric('preview_run', source)
}

function openForceCompileModal(action: 'compile' | 'preview' | 'save' = 'compile') {
  if (
    selectedRound.value === null ||
    effectiveCompileTargetRounds.value.length === 0 ||
    isLoading.value
  ) {
    return
  }
  forceCompileAction.value = action
  forceCompileMissingDataPolicy.value = compileMissingDataPolicy.value
  forceCompileModalOpen.value = true
}

function closeForceCompileModal() {
  forceCompileModalOpen.value = false
}

async function confirmForcedCompile() {
  const action = forceCompileAction.value
  if (compileManualSaveEnabled && action === 'save') {
    closeForceCompileModal()
    openSaveSnapshotModal(true)
    return
  }
  if (compileManualSaveEnabled && action === 'preview') {
    await runPreviewWithSource('raw', {
      missing_data_policy: forceCompileMissingDataPolicy.value,
    })
    return
  }
  await runCompileWithSource('raw', {
    missing_data_policy: forceCompileMissingDataPolicy.value,
  })
}

function openSaveSnapshotModal(rawConfirmed = false) {
  if (!compileManualSaveEnabled) return
  if (!compileWorkflow.canSave) {
    const source = manualCompileSource.value
    const reason = compileWorkflow.previewStale ? 'stale' : 'preview_required'
    actionError.value = compileWorkflow.previewStale
      ? t('設定が変更されました。保存前に仮集計を実行してください。')
      : t('仮集計を実行してから保存してください。')
    trackCompileMetric('save_blocked_stale', source, reason)
    return
  }
  const previewSource = compileWorkflow.previewSource === 'raw' ? 'raw' : 'submissions'
  if (previewSource === 'raw' && !rawConfirmed) {
    openForceCompileModal('save')
    return
  }
  compileWorkflow.openSaveModal()
}

function onSaveSnapshotModalCancel() {
  if (!compileManualSaveEnabled) return
  const source = compileWorkflow.previewSource === 'raw' ? 'raw' : 'submissions'
  trackCompileMetric('save_cancelled', source)
}

async function saveCompiledSnapshot() {
  if (!compileManualSaveEnabled) return
  if (selectedRound.value === null || effectiveCompileTargetRounds.value.length === 0) return
  if (!compileWorkflow.canSave) {
    openSaveSnapshotModal()
    return
  }
  const source = compileWorkflow.previewSource === 'raw' ? 'raw' : 'submissions'
  const snapshotMemo = compileWorkflow.snapshotMemoDraft
  const saved = await compiledStore.saveCompiled(tournamentId.value, {
    source,
    rounds: effectiveCompileTargetRounds.value,
    options: buildCompileOptions(manualCompileOptionOverrides.value),
    snapshotMemo,
    previewSignature: compileWorkflow.previewSignature,
    revision: compileWorkflow.previewRevision,
  })
  if (!saved) {
    const isPreviewStale = (compiledStore.error ?? '').toLowerCase().includes('preview is stale')
    if (isPreviewStale) {
      actionError.value = t('設定が変更されました。保存前に仮集計を実行してください。')
      trackCompileMetric('save_blocked_stale', source, 'server_stale')
      return
    }
    actionError.value = compiledStore.error ?? t('集計に失敗しました。')
    return
  }
  compileWorkflow.markSaved()
  compileMessage.value = t('集計結果を保存しました。')
  trackCompileMetric('save_snapshot', source)
  await refreshCompiledHistory()
}

async function refreshCompiledHistory() {
  if (!tournamentId.value) return
  try {
    const res = await api.get('/compiled', { params: { tournamentId: tournamentId.value } })
    compiledHistory.value = Array.isArray(res.data?.data) ? res.data.data : []
  } catch {
    compiledHistory.value = []
  }
}

async function saveDrawPublication(
  nextState: Partial<{ drawOpened: boolean; allocationOpened: boolean; locked: boolean }>
): Promise<boolean> {
  if (!selectedDraw.value || selectedRound.value === null) return false
  const nextDrawOpened = nextState.drawOpened ?? drawOpenedValue.value
  const nextAllocationOpened = nextState.allocationOpened ?? allocationOpenedValue.value
  publishMessage.value = ''
  actionError.value = ''
  publicationSaving.value = true
  try {
    const saved = await drawsStore.upsertDraw({
      tournamentId: tournamentId.value,
      round: selectedRound.value,
      allocation: selectedDraw.value.allocation,
      userDefinedData: selectedDraw.value.userDefinedData,
      drawOpened: nextDrawOpened,
      allocationOpened: nextAllocationOpened,
      locked: nextState.locked ?? lockedValue.value,
    })
    if (!saved) {
      actionError.value = drawsStore.error ?? t('公開設定の保存に失敗しました。')
      return false
    }
    publishMessage.value = t('公開状態を更新しました。')
    await drawsStore.fetchDraws(tournamentId.value)
    return true
  } finally {
    publicationSaving.value = false
  }
}

async function saveRoundPublication(nextState: { motionOpened: boolean }): Promise<boolean> {
  if (!selectedRoundData.value?._id) return false
  publishMessage.value = ''
  actionError.value = ''
  publicationSaving.value = true
  try {
    const saved = await roundsStore.updateRound({
      tournamentId: tournamentId.value,
      roundId: String(selectedRoundData.value._id),
      motionOpened: nextState.motionOpened,
    })
    if (!saved) {
      actionError.value = roundsStore.error ?? t('公開設定の保存に失敗しました。')
      return false
    }
    publishMessage.value = t('公開状態を更新しました。')
    await roundsStore.fetchRounds(tournamentId.value)
    return true
  } finally {
    publicationSaving.value = false
  }
}

async function onPublishToggle(key: 'drawOpened' | 'allocationOpened', checked: boolean) {
  if (!selectedRoundHasDraw.value) return
  const current = key === 'drawOpened' ? drawOpenedValue.value : allocationOpenedValue.value
  if (current === checked) return
  await saveDrawPublication({ [key]: checked })
}

async function onMotionPublishToggle(checked: boolean) {
  if (motionOpenedValue.value === checked) return
  await saveRoundPublication({ motionOpened: checked })
}

async function onPriorRoundsHideToggle(checked: boolean) {
  if (!checked) return
  if (priorRoundsFullyHidden.value) return
  if (!tournamentId.value || priorRounds.value.length === 0) return
  const targetRounds = priorRounds.value.map((round) => ({
    roundNumber: round.round,
    roundId: String(round._id),
  }))
  publishMessage.value = ''
  actionError.value = ''
  publicationSaving.value = true
  try {
    for (const target of targetRounds) {
      const updatedRound = await roundsStore.updateRound({
        tournamentId: tournamentId.value,
        roundId: target.roundId,
        motionOpened: false,
      })
      if (!updatedRound) {
        actionError.value = roundsStore.error ?? t('公開設定の保存に失敗しました。')
        return
      }
    }

    for (const target of targetRounds) {
      const previousDraw = priorRoundDrawMap.value.get(target.roundNumber)
      if (!previousDraw) continue
      const updatedDraw = await drawsStore.upsertDraw({
        tournamentId: tournamentId.value,
        round: target.roundNumber,
        allocation: previousDraw.allocation,
        userDefinedData: previousDraw.userDefinedData,
        drawOpened: false,
        allocationOpened: false,
        locked: previousDraw.locked ?? false,
      })
      if (!updatedDraw) {
        actionError.value = drawsStore.error ?? t('公開設定の保存に失敗しました。')
        return
      }
    }

    publishMessage.value = t('前ラウンドを一括非公開にしました。')
    await Promise.all([
      roundsStore.fetchRounds(tournamentId.value),
      drawsStore.fetchDraws(tournamentId.value),
    ])
  } finally {
    publicationSaving.value = false
  }
}

function clearUnsavedCompilePreview() {
  if (!compileManualSaveEnabled) return
  if (!compileWorkflow.hasPreview) return
  compileWorkflow.clearPreview()
  compiledStore.clearPreview()
  compileMessage.value = ''
}

watch(
  manualCompileInputKey,
  (nextKey) => {
    if (!compileManualSaveEnabled) return
    compileWorkflow.setCurrentInputKey(nextKey)
  },
  { immediate: true }
)

watch(
  activeTask,
  (nextTask, previousTask) => {
    if (nextTask === previousTask) return
    if (previousTask === 'compile' && nextTask !== 'compile') {
      clearUnsavedCompilePreview()
    }
  }
)

watch(
  () => route.query.round,
  (next) => {
    const nextRound = Number(next)
    if (!Number.isInteger(nextRound) || nextRound < 1) return
    if (!sortedRounds.value.some((round) => round.round === nextRound)) return
    selectedRound.value = nextRound
    if (isHubTask(route.query.task)) {
      roundTaskSelection.value = {
        ...roundTaskSelection.value,
        [nextRound]: route.query.task,
      }
      activeTask.value = route.query.task
      return
    }
    activeTask.value = resolveTaskForRound(nextRound)
  }
)

watch(
  () => route.query.task,
  (next) => {
    if (isHubTask(next)) {
      activeTask.value = next
      if (selectedRound.value !== null) {
        roundTaskSelection.value = {
          ...roundTaskSelection.value,
          [selectedRound.value]: next,
        }
      }
      return
    }
    if (selectedRound.value === null) {
      activeTask.value = 'draw'
      return
    }
    activeTask.value = resolveTaskForRound(selectedRound.value)
  }
)

watch(
  compileColumns,
  (columns) => {
    if (!columns.includes(compileSortKey.value)) {
      compileSortKey.value = columns.includes('ranking') ? 'ranking' : (columns[0] ?? 'ranking')
      compileSortDirection.value = compileSortKey.value === 'ranking' ? 'asc' : 'desc'
    }
  },
  { immediate: true }
)

watch(
  selectedRound,
  (nextRound, previousRound) => {
    if (nextRound !== previousRound) {
      clearUnsavedCompilePreview()
    }
    manualCompileSource.value = 'submissions'
    manualCompileOptionOverrides.value = undefined
    applyCompileDraftFromRound()
  },
  { immediate: true }
)

watch(submissionEditorTarget, (target) => {
  if (!submissionEditorModalOpen.value) return
  if (target) return
  closeSubmissionEditorModal()
})

watch(
  tournamentId,
  () => {
    selectedRound.value = null
    roundTaskSelection.value = {}
    manualCompileSource.value = 'submissions'
    manualCompileOptionOverrides.value = undefined
    compileWorkflow.clearPreview()
    compiledStore.clearPreview()
    refresh()
  },
  { immediate: true }
)
</script>

<style scoped>
.operations-content-shell {
  position: relative;
  min-height: 120px;
}

.reload-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-surface) 75%, transparent);
  pointer-events: none;
}

.round-bar-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.round-bar {
  display: grid;
  gap: var(--space-2);
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  overflow: auto;
  max-height: min(44vh, 320px);
  padding-right: 2px;
  align-content: start;
}

.round-pill {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-2);
  text-align: left;
  display: grid;
  gap: 4px;
  cursor: pointer;
}

.round-pill.active {
  border-color: var(--color-primary);
  background: var(--color-secondary);
}

.round-pill-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.round-pill-step {
  min-height: 20px;
  display: flex;
  align-items: center;
}

.step-complete-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid #86efac;
  background: #dcfce7;
  color: #166534;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  padding: 4px 8px;
}

.status-chip {
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  padding: 5px 8px;
}

.status-preparing {
  background: #f1f5f9;
  color: #334155;
}

.status-collecting {
  background: #ecfeff;
  color: #0e7490;
}

.status-compiled {
  background: #eff6ff;
  color: #1d4ed8;
}

.status-generated {
  background: #fef9c3;
  color: #a16207;
}

.status-finalized {
  background: #dcfce7;
  color: #166534;
}

.flow-caption {
  margin: 0;
}

.task-flow {
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
  overflow: auto;
  padding-bottom: 2px;
}

.task-tab {
  min-width: 220px;
  flex: 1 1 220px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 10px 12px;
  min-height: 64px;
  cursor: pointer;
  display: grid;
  gap: 4px;
  text-align: left;
}

.task-tab:hover {
  border-color: #bfdbfe;
  color: var(--color-primary);
}

.task-tab.active {
  border-color: var(--color-primary);
  background: var(--color-secondary);
  color: var(--color-primary);
}

.task-tab.state-blocked {
  border-style: dashed;
}

.task-tab.state-done {
  border-color: #86efac;
  background: #f0fdf4;
}

.task-tab.state-done.active {
  border-color: #22c55e;
  background: #dcfce7;
  color: #166534;
}

.task-order {
  font-variant-numeric: tabular-nums;
}

.task-tab-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.task-tab-title {
  align-items: center;
  gap: 6px;
}

.task-state-chip {
  border-radius: 999px;
  border: 1px solid var(--color-border);
  padding: 2px 8px;
  font-size: 0.72rem;
  line-height: 1.2;
  color: var(--color-muted);
  background: var(--color-surface);
}

.task-tab.state-ready .task-state-chip {
  border-color: #bfdbfe;
  color: #1d4ed8;
  background: #eff6ff;
}

.task-tab.state-blocked .task-state-chip {
  border-color: #fed7aa;
  color: #b45309;
  background: #fff7ed;
}

.task-tab.state-done .task-state-chip {
  border-color: #86efac;
  color: #166534;
  background: #dcfce7;
}

.task-flow-arrow {
  align-self: center;
  color: var(--color-muted);
  font-size: 1.15rem;
  line-height: 1;
  user-select: none;
}

.step-head {
  align-items: baseline;
  justify-content: space-between;
}

.step-head h4 {
  margin: 0;
}

.step-section-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.step-section-head h5 {
  margin: 0;
}

.step-card {
  border: 1px solid var(--color-border);
}

.step-content {
  gap: var(--space-2);
}

.task-hint-bottom {
  margin: 0;
  color: var(--color-danger);
}

.step-title-row {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.step-link {
  color: var(--color-primary);
  font-size: 0.85rem;
  text-decoration: none;
}

.step-link:hover {
  text-decoration: underline;
}

.stat-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.stat {
  display: grid;
  gap: 2px;
}

.step-actions {
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.submission-overview-grid {
  display: grid;
  gap: var(--space-2);
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.submission-overview-card {
  gap: 4px;
}

.submission-speed-summary-card {
  border: 1px solid var(--color-border);
}

.submission-speed-summary-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 22px;
}

.speed-status-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 0.72rem;
  font-weight: 700;
}

.speed-status-ok {
  color: #166534;
  background: #dcfce7;
  border: 1px solid #86efac;
}

.speed-status-warn {
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fcd34d;
}

.speed-status-danger {
  color: #991b1b;
  background: #fee2e2;
  border: 1px solid #fca5a5;
}

.submission-delay-name-list {
  margin: 0;
  color: var(--color-text);
  line-height: 1.5;
}

.submission-evaluation-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.submission-evaluation-tab {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-muted);
  min-height: 34px;
  padding: 0 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.submission-evaluation-tab:hover {
  border-color: #bfdbfe;
  color: var(--color-primary);
}

.submission-evaluation-tab.active {
  background: var(--color-secondary);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.step-inline-panel {
  width: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.step-inline-submissions {
  width: 100%;
}

.compile-result-panel {
  border: 1px solid var(--color-border);
  gap: var(--space-2);
}

.compile-result-head {
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.compile-download-row {
  justify-content: flex-end;
}

.diff-legend {
  gap: var(--space-2);
  flex-wrap: wrap;
}

.diff-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-muted);
}

.diff-marker {
  font-weight: 700;
  font-size: 0.88rem;
}

.diff-improved {
  color: #15803d;
}

.diff-worsened {
  color: #b91c1c;
}

.diff-unchanged {
  color: #475569;
}

.diff-new {
  color: #0f766e;
}

.diff-na {
  color: var(--color-muted);
}

.diff-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.diff-delta {
  font-size: 0.75rem;
}

.compile-option-panel {
  border: 1px solid var(--color-border);
  gap: var(--space-2);
}

.compile-option-panel h5 {
  margin: 0;
}

.publish-switch-grid {
  display: grid;
  gap: var(--space-2);
  grid-template-columns: 1fr;
  align-items: stretch;
}

.publish-switch-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: var(--space-2);
}

.publish-preview-section {
  gap: var(--space-2);
}

.submission-preview-section {
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.submission-preview-head {
  align-items: center;
}

.submission-preview-head h5 {
  margin: 0;
}

.submission-preview-search {
  min-width: min(320px, 100%);
  flex: 1 1 320px;
  max-width: 420px;
}

.submission-preview-search input {
  min-height: 34px;
}

.preview-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.setting-option {
  align-items: center;
  gap: var(--space-2);
}

.error {
  color: var(--color-danger);
}

.warning {
  color: #b45309;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(17 24 39 / 44%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-3);
  z-index: 1400;
}

.modal {
  width: min(1100px, 100%);
  max-height: calc(100vh - 48px);
  overflow: hidden;
}

.submission-editor-modal {
  gap: var(--space-2);
}

.submission-editor-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.submission-editor-head h4 {
  margin: 0;
}

.submission-editor-venue {
  margin: 0;
}

.submission-editor-body {
  overflow: auto;
  max-height: calc(100vh - 220px);
}

@media (max-width: 980px) {
  .round-bar {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    max-height: 260px;
  }

  .task-flow {
    flex-direction: column;
  }

  .task-tab {
    min-width: 0;
  }

  .task-flow-arrow {
    display: none;
  }

  .step-inline-panel {
    padding: var(--space-2);
  }

  .submission-overview-grid {
    grid-template-columns: 1fr;
  }

  .publish-switch-grid {
    grid-template-columns: 1fr;
  }
}
</style>
