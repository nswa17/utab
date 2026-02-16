<template>
  <section class="stack">
    <div class="row section-header">
      <h3 class="page-title">{{ $t('ラウンド運営ハブ') }}</h3>
    </div>

    <LoadingState v-if="sectionLoading" />
    <p v-else-if="loadError" class="error">{{ loadError }}</p>
    <div v-else class="stack">
      <section class="card stack">
        <div class="row round-bar-head">
          <strong>{{ $t('ラウンド一覧') }}</strong>
        </div>
        <p v-if="sortedRounds.length === 0" class="muted small">{{ $t('ラウンドがまだありません。') }}</p>
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
              <strong>{{ round.name || $t('ラウンド {round}', { round: round.round }) }}</strong>
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
          <span v-if="selectedRoundLabel" class="muted small">{{ selectedRoundLabel }}</span>
        </div>
        <p v-if="selectedRound === null" class="muted small">{{ $t('ラウンドを選択してください。') }}</p>
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
              <span v-if="index < operationTasks.length - 1" class="task-flow-arrow" aria-hidden="true">›</span>
            </template>
          </div>
          <p v-if="activeTaskHint" class="muted small">{{ activeTaskHint }}</p>

          <section v-if="activeTask === 'draw'" class="stack step-content">
            <p class="muted small">
              {{ $t('対象ラウンド: {round}', { round: selectedRound }) }}
            </p>
            <p class="muted small">
              {{ $t('対戦生成と保存は対戦表設定で実行します。') }}
            </p>
            <AdminRoundAllocation
              v-if="selectedRound !== null"
              :embedded="true"
              :embedded-round="selectedRound"
            />
          </section>

          <section v-else-if="activeTask === 'publish'" class="stack step-content">
            <p v-if="!selectedRoundHasDraw" class="muted small">{{ $t('まず対戦表を生成してください。') }}</p>
            <div class="publish-switch-grid">
              <section class="publish-switch-card motion-publish-card">
                <RoundMotionEditor
                  v-if="selectedRoundData"
                  :tournament-id="tournamentId"
                  :round-id="String(selectedRoundData._id)"
                  :saved-motion="selectedMotion"
                  :disabled="publicationSwitchBusy"
                >
                  <template #status>
                    <label class="row publish-switch-inline publish-switch-inline-compact">
                      <span class="publish-switch-label">{{ $t('モーション公開') }}</span>
                      <ToggleSwitch
                        class="publish-switch-toggle"
                        :model-value="motionOpenedValue"
                        :disabled="publicationSwitchBusy"
                        :aria-label="$t('モーション公開')"
                        @update:model-value="onMotionPublishToggle"
                      />
                    </label>
                    <label class="row publish-switch-inline publish-switch-inline-compact">
                      <span class="publish-switch-label">{{ $t('チーム割り当て') }}</span>
                      <ToggleSwitch
                        class="publish-switch-toggle"
                        :model-value="drawOpenedValue"
                        :disabled="publicationSwitchBusy || !selectedRoundHasDraw"
                        :aria-label="$t('チーム割り当て')"
                        @update:model-value="(checked) => onPublishToggle('drawOpened', checked)"
                      />
                    </label>
                    <label class="row publish-switch-inline publish-switch-inline-compact">
                      <span class="publish-switch-label">{{ $t('ジャッジ割り当て') }}</span>
                      <ToggleSwitch
                        class="publish-switch-toggle"
                        :model-value="allocationOpenedValue"
                        :disabled="publicationSwitchBusy || !selectedRoundHasDraw"
                        :aria-label="$t('ジャッジ割り当て')"
                        @update:model-value="(checked) => onPublishToggle('allocationOpened', checked)"
                      />
                    </label>
                  </template>
                </RoundMotionEditor>
              </section>
            </div>
            <section class="stack publish-preview-section">
              <div class="row preview-head">
                <h4>{{ $t('対戦表プレビュー') }}</h4>
                <div class="row preview-visibility-chip-list">
                  <span class="preview-visibility-chip" :class="drawOpenedValue ? 'is-open' : 'is-closed'">
                    {{ $t('チーム') }}: {{ drawOpenedValue ? $t('公開') : $t('非公開') }}
                  </span>
                  <span
                    class="preview-visibility-chip"
                    :class="allocationOpenedValue ? 'is-open' : 'is-closed'"
                  >
                    {{ $t('ジャッジ') }}: {{ allocationOpenedValue ? $t('公開') : $t('非公開') }}
                  </span>
                </div>
              </div>
              <DrawPreviewTable
                :rows="publishPreviewRows"
                :gov-label="$t('政府')"
                :opp-label="$t('反対')"
                :team-visible="drawOpenedValue"
                :adjudicator-visible="allocationOpenedValue"
              />
            </section>
            <span v-if="publishMessage" class="muted small">{{ publishMessage }}</span>
          </section>

          <section v-else-if="activeTask === 'submissions'" class="stack step-content">
            <div class="grid submission-overview-grid">
              <div class="card soft stack submission-overview-card">
                <span class="muted small">{{ $t('提出数') }}</span>
                <strong>{{ totalSubmittedCount(selectedRound) }} / {{ totalExpectedCount(selectedRound) }}</strong>
                <span class="muted small">
                  {{
                    $t('提出者情報不足: Ballot {ballot} / Feedback {feedback}', {
                      ballot: unknownSubmissionCount(selectedRound, 'ballot'),
                      feedback: unknownSubmissionCount(selectedRound, 'feedback'),
                    })
                  }}
                </span>
              </div>
              <div class="card soft stack submission-overview-card">
                <span class="muted small">{{ $t('スコアシート') }}</span>
                <strong>{{ ballotSubmittedCount(selectedRound) }} / {{ ballotExpectedCount(selectedRound) }}</strong>
                <span class="muted small">
                  {{ $t('提出者情報不足: {count}', { count: unknownSubmissionCount(selectedRound, 'ballot') }) }}
                </span>
              </div>
              <div class="card soft stack submission-overview-card">
                <span class="muted small">{{ $t('フィードバック') }}</span>
                <strong>{{ feedbackSubmittedCount(selectedRound) }} / {{ feedbackExpectedCount(selectedRound) }}</strong>
                <span class="muted small">
                  {{ $t('提出者情報不足: {count}', { count: unknownSubmissionCount(selectedRound, 'feedback') }) }}
                </span>
              </div>
            </div>
            <section class="card soft stack submission-speed-panel">
              <div class="row submission-speed-head">
                <h5>{{ $t('提出スピード詳細') }}</h5>
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
              <p v-if="selectedRoundSubmissionSpeed" class="muted small">
                {{ $t('遅延率 {rate}%', { rate: Math.round(selectedRoundSubmissionSpeed.delayedRate * 1000) / 10 }) }}
              </p>
              <p v-else class="muted small">{{ $t('提出時刻データがありません。') }}</p>
              <section class="stack">
                <div class="row submission-delay-head">
                  <h5>{{ $t('遅延上位提出者') }}</h5>
                  <p class="muted small">{{ $t('30分超の提出のみ表示') }}</p>
                </div>
                <Table v-if="selectedRoundSubmissionDelayRows.length > 0" hover striped>
                  <thead>
                    <tr>
                      <th>{{ $t('提出者') }}</th>
                      <th>{{ $t('種別') }}</th>
                      <th>{{ $t('経過(分)') }}</th>
                      <th>{{ $t('提出時刻') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in selectedRoundSubmissionDelayRows"
                      :key="`delay-${row.round}-${row.id}-${row.createdAt}`"
                    >
                      <td>{{ row.id ? submissionEntityName(row.id) : '—' }}</td>
                      <td>{{ submissionTypeLabel(row.type) }}</td>
                      <td>{{ row.elapsedMinutes }}</td>
                      <td>{{ formatSubmissionTimestamp(row.createdAt) }}</td>
                    </tr>
                  </tbody>
                </Table>
                <p v-else class="muted small">{{ $t('遅延提出は検出されませんでした。') }}</p>
              </section>
            </section>
            <p v-if="selectedRoundBallotGapWarning" class="muted warning">
              {{ selectedRoundBallotGapWarning }}
            </p>
            <p v-if="selectedRoundUnknownBallotWarning" class="muted warning">
              {{ selectedRoundUnknownBallotWarning }}
            </p>
            <div class="submission-evaluation-tabs" role="tablist" :aria-label="$t('提出種別')">
              <button
                type="button"
                class="submission-evaluation-tab"
                :class="{ active: submissionEvaluationTab === 'team' }"
                role="tab"
                :aria-selected="submissionEvaluationTab === 'team'"
                @click="setSubmissionEvaluationTab('team')"
              >
                {{ $t('チーム評価') }}
              </button>
              <button
                type="button"
                class="submission-evaluation-tab"
                :class="{ active: submissionEvaluationTab === 'judge' }"
                role="tab"
                :aria-selected="submissionEvaluationTab === 'judge'"
                @click="setSubmissionEvaluationTab('judge')"
              >
                {{ $t('ジャッジ評価') }}
              </button>
            </div>
            <AdminTournamentSubmissions
              v-if="selectedRound !== null"
              class="step-inline-submissions"
              :embedded="true"
              :embedded-round="selectedRound"
              :hide-summary-cards="true"
              :split-by-evaluation="true"
              :split-active-key="submissionEvaluationTab"
            />
          </section>

          <section v-else class="stack step-content">
            <p class="muted small">
              {{
                $t(
                  '提出結果を集計して、このラウンド終了時点の成績を確定します。成績に含めるラウンドを下で選択してください。未選択のラウンドはこの時点の成績に反映されません。'
                )
              }}
            </p>
            <p class="muted small">
              {{
                $t('集計対象ラウンド: {rounds}', {
                  rounds: compileTargetRoundsLabel || '-',
                })
              }}
            </p>
            <div v-if="compileTargetRounds.length > 0" class="compile-round-picker">
              <label
                v-for="roundNumber in compileTargetRounds"
                :key="`compile-round-${roundNumber}`"
                class="compile-round-option"
              >
                <input
                  type="checkbox"
                  :checked="selectedCompileRounds.includes(roundNumber)"
                  :disabled="isLoading || !selectedRoundPublished"
                  @change="onCompileRoundToggle(roundNumber, $event)"
                />
                <span>{{ roundLabel(roundNumber) }}</span>
              </label>
            </div>
            <section class="card soft stack compile-option-panel">
              <h5>{{ $t('集計オプション') }}</h5>
              <CompileOptionsEditor
                v-model:source="compileSource"
                v-model:ranking-preset="rankingPriorityPreset"
                v-model:ranking-order="rankingPriorityOrder"
                v-model:winner-policy="compileWinnerPolicy"
                v-model:tie-points="compileTiePoints"
                v-model:merge-policy="compileDuplicateMergePolicy"
                v-model:poi-aggregation="compilePoiAggregation"
                v-model:best-aggregation="compileBestAggregation"
                v-model:missing-data-policy="compileMissingDataPolicy"
                v-model:include-labels="compileIncludeLabels"
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
                size="sm"
                :disabled="isLoading || effectiveCompileTargetRounds.length === 0 || !selectedRoundPublished || (compileSource === 'submissions' && shouldBlockSubmissionCompile)"
                @click="runCompileWithSource(compileSource)"
              >
                {{ $t('集計を実行') }}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                :disabled="isLoading || effectiveCompileTargetRounds.length === 0 || !selectedRoundPublished"
                @click="openForceCompileModal"
              >
                {{ $t('強制実行') }}
              </Button>
              <span v-if="compileMessage" class="muted small">{{ compileMessage }}</span>
            </div>
            <section v-if="compileRows.length > 0" class="card soft stack compile-result-panel">
              <div class="row compile-result-head">
                <div class="stack tight">
                  <strong>{{ $t('集計レポート') }}</strong>
                  <span class="muted small">{{ $t('差分基準: {baseline}', { baseline: compileDiffBaselineLabel }) }}</span>
                </div>
                <CompiledDiffBaselineSelect
                  v-if="diffBaselineCompiledOptions.length > 0"
                  v-model="compileDiffBaselineCompiledId"
                  class="compile-result-baseline-select"
                  :label="$t('差分比較')"
                  :options="diffBaselineCompiledOptions"
                />
              </div>
              <div class="row diff-legend">
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
              <Table hover striped sticky-header>
                <thead>
                  <tr>
                    <th v-for="key in compileColumns" :key="`compile-col-${key}`">
                      <SortHeaderButton
                        compact
                        :label="compileColumnLabel(key)"
                        :indicator="compileSortIndicator(key)"
                        @click="setCompileSort(key)"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in sortedCompileRows" :key="String(row?.id ?? '')">
                    <td v-for="key in compileColumns" :key="`compile-${String(row?.id ?? '')}-${key}`">
                      <span v-if="key === 'team'">{{ teamName(String(row?.id ?? '')) }}</span>
                      <span v-else-if="key === 'ranking'" class="diff-value">
                        <span>{{ formatCompileValue(row?.ranking) }}</span>
                        <span
                          class="diff-marker"
                          :class="rankingTrendClass(row)"
                          :title="rankingTrendText(row)"
                          :aria-label="rankingTrendText(row)"
                        >
                          {{ rankingTrendSymbol(rankingTrendForRow(row)) }}
                        </span>
                        <span v-if="rankingDeltaText(row)" class="muted diff-delta">
                          {{ rankingDeltaText(row) }}
                        </span>
                      </span>
                      <span v-else class="diff-value">
                        <span>{{ formatCompileValue(row?.[key]) }}</span>
                        <span v-if="metricDeltaText(row, key)" class="muted diff-delta">
                          {{ metricDeltaText(row, key) }}
                        </span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </Table>
            </section>
            <p v-else-if="snapshotIncludesSelectedRound" class="muted small">
              {{ $t('集計結果を表示するデータがありません。') }}
            </p>
          </section>
        </template>
      </section>
    </div>

    <div
      v-if="forceCompileModalOpen"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeForceCompileModal"
    >
      <div class="modal card stack" role="dialog" aria-modal="true">
        <h4>{{ $t('強制実行の確認') }}</h4>
        <div class="force-warning-banner">
          <strong>{{ $t('注意: 強制実行は例外運用です。') }}</strong>
          <p>
            {{
              $t(
                '強制実行では生結果ソースを使用します。提出データとの差異や提出者情報不足がある場合、順位が不安定になる可能性があります。'
              )
            }}
          </p>
          <ul class="list compact force-warning-list">
            <li class="list-item">{{ $t('未提出・重複提出があると結果が偏る可能性があります。') }}</li>
            <li class="list-item">{{ $t('提出者ID不足のデータは集計漏れ・誤集計の原因になります。') }}</li>
            <li class="list-item">{{ $t('提出ソースが混在している場合、直近の入力で上書きされることがあります。') }}</li>
          </ul>
        </div>
        <section class="card soft stack force-option-panel">
          <h5>{{ $t('強制実行オプション') }}</h5>
          <label class="stack force-option-field">
            <span class="muted small">{{ $t('欠損データの扱い') }}</span>
            <select v-model="forceCompileMissingDataPolicy">
              <option value="warn">{{ $t('警告して続行') }}</option>
              <option value="exclude">{{ $t('欠損データを除外') }}</option>
              <option value="error">{{ $t('欠損があれば中止') }}</option>
            </select>
          </label>
          <div class="stack force-option-field">
            <span class="muted small">{{ $t('生成対象') }}</span>
            <div class="grid force-include-grid">
              <label v-for="option in forceIncludeLabelOptions" :key="`force-include-${option.value}`" class="row">
                <input
                  type="checkbox"
                  :checked="forceCompileIncludeLabels.includes(option.value)"
                  @change="toggleForceCompileIncludeLabel(option.value, $event)"
                />
                <span>{{ option.label }}</span>
              </label>
            </div>
          </div>
        </section>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="closeForceCompileModal">
            {{ $t('キャンセル') }}
          </Button>
          <Button variant="danger" size="sm" :disabled="isLoading" @click="confirmForcedCompile">
            {{ $t('強制実行する') }}
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from '@/components/common/Button.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Table from '@/components/common/Table.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import SortHeaderButton from '@/components/common/SortHeaderButton.vue'
import RoundMotionEditor from '@/components/common/RoundMotionEditor.vue'
import DrawPreviewTable from '@/components/common/DrawPreviewTable.vue'
import CompileOptionsEditor from '@/components/common/CompileOptionsEditor.vue'
import CompiledDiffBaselineSelect from '@/components/common/CompiledDiffBaselineSelect.vue'
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
import {
  DEFAULT_COMPILE_OPTIONS,
  normalizeCompileOptions,
  type CompileRankingMetric,
  type CompileIncludeLabel,
  type CompileOptions,
} from '@/types/compiled'
import type { DrawPreviewRow } from '@/types/draw-preview'
import {
  formatSignedDelta,
  rankingTrendSymbol,
  resolveRankingTrend,
  toFiniteNumber,
} from '@/utils/diff-indicator'
import { applyClientBaselineDiff } from '@/utils/compiled-diff'
import { countSubmissionActors, resolveRoundOperationStatus, type RoundOperationStatus } from '@/stores/round-operations'
import { buildSubmissionDelayRows, buildSubmissionSpeedRows } from '@/utils/insights'
import {
  formatCompiledSnapshotOptionLabel,
  resolvePreviousCompiledId,
} from '@/utils/compiled-snapshot'

const route = useRoute()
const router = useRouter()
const { t } = useI18n({ useScope: 'global' })

const roundsStore = useRoundsStore()
const drawsStore = useDrawsStore()
const submissionsStore = useSubmissionsStore()
const teamsStore = useTeamsStore()
const compiledStore = useCompiledStore()
const adjudicatorsStore = useAdjudicatorsStore()
const speakersStore = useSpeakersStore()
const venuesStore = useVenuesStore()

const tournamentId = computed(() => String(route.params.tournamentId ?? ''))
const sortedRounds = computed(() => roundsStore.rounds.slice().sort((a, b) => a.round - b.round))
const selectedRound = ref<number | null>(null)
type HubTask = 'submissions' | 'compile' | 'draw' | 'publish'
type HubTaskState = 'done' | 'ready' | 'blocked'
const hubTaskOrder: HubTask[] = ['draw', 'publish', 'submissions', 'compile']
const activeTask = ref<HubTask>('draw')
const roundTaskSelection = ref<Record<number, HubTask>>({})
const sectionLoading = ref(true)
const actionError = ref('')
const compileMessage = ref('')
const publishMessage = ref('')
const compileSource = ref<'submissions' | 'raw'>('submissions')
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
const compileIncludeLabels = ref<CompileIncludeLabel[]>([
  ...DEFAULT_COMPILE_OPTIONS.include_labels,
])
const compileDiffBaselineCompiledId = ref('')
const compiledHistory = ref<any[]>([])
const selectedCompileRounds = ref<number[]>([])
const forceCompileModalOpen = ref(false)
const publicationSaving = ref(false)
const compileSortKey = ref('ranking')
const compileSortDirection = ref<'asc' | 'desc'>('asc')
const forceCompileMissingDataPolicy = ref<CompileOptions['missing_data_policy']>(
  DEFAULT_COMPILE_OPTIONS.missing_data_policy
)
const forceCompileIncludeLabels = ref<CompileIncludeLabel[]>([
  ...DEFAULT_COMPILE_OPTIONS.include_labels,
])
const submissionEvaluationTab = ref<'team' | 'judge'>('team')
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
    submissionsStore.error ||
    teamsStore.error ||
    adjudicatorsStore.error ||
    speakersStore.error ||
    venuesStore.error ||
    compiledStore.error ||
    ''
)

const selectedRoundData = computed(() =>
  sortedRounds.value.find((round) => round.round === selectedRound.value) ?? null
)
const selectedRoundLabel = computed(() => {
  if (!selectedRoundData.value) return ''
  return selectedRoundData.value.name || t('ラウンド {round}', { round: selectedRoundData.value.round })
})
const selectedDraw = computed(() =>
  drawsStore.draws.find((draw) => Number(draw.round) === selectedRound.value) ?? null
)
const motionOpenedValue = computed(() => Boolean(selectedRoundData.value?.motionOpened))
const selectedMotion = computed(() => {
  const motions = Array.isArray(selectedRoundData.value?.motions) ? selectedRoundData.value?.motions : []
  return motions[0] ? String(motions[0]) : ''
})
const drawOpenedValue = computed(() => Boolean(selectedDraw.value?.drawOpened))
const allocationOpenedValue = computed(() => Boolean(selectedDraw.value?.allocationOpened))
const lockedValue = computed(() => Boolean(selectedDraw.value?.locked))
const selectedRoundHasDraw = computed(
  () => Boolean(selectedDraw.value && Array.isArray(selectedDraw.value.allocation) && selectedDraw.value.allocation.length > 0)
)
const publicationSwitchBusy = computed(
  () => publicationSaving.value || roundsStore.loading || drawsStore.loading
)
const selectedRoundPublished = computed(
  () => Boolean(selectedDraw.value?.drawOpened && selectedDraw.value?.allocationOpened)
)
const compileTargetRounds = computed(() => {
  if (selectedRound.value === null) return []
  return sortedRounds.value
    .filter((round) => round.round <= selectedRound.value!)
    .map((round) => Number(round.round))
})
const effectiveCompileTargetRounds = computed(() =>
  compileTargetRounds.value.filter((roundNumber) => selectedCompileRounds.value.includes(roundNumber))
)
const compileTargetRoundsLabel = computed(() =>
  effectiveCompileTargetRounds.value.length > 0 ? effectiveCompileTargetRounds.value.join(', ') : ''
)
type BaselineCompiledOption = {
  compiledId: string
  rounds: number[]
  createdAt?: string
}
function resolveCompiledDocId(doc: any): string {
  const payload = doc?.payload && typeof doc.payload === 'object' ? doc.payload : doc
  return String(doc?._id ?? payload?._id ?? '').trim()
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
const compiledSnapshotRoundSet = computed(() => {
  const rounds = Array.isArray(compiledStore.compiled?.rounds) ? compiledStore.compiled.rounds : []
  return new Set(
    rounds
      .map((item: any) => Number(item?.r ?? item?.round))
      .filter((value: number) => Number.isInteger(value) && value >= 1)
  )
})
const baselineCompiledOptions = computed<BaselineCompiledOption[]>(() =>
  compiledHistory.value
    .map((item) => {
      const payload = item?.payload && typeof item.payload === 'object' ? item.payload : item
      const roundsValue = Array.isArray(payload?.rounds) ? payload.rounds : []
      const normalizedRounds = roundsValue
        .map((entry: any) => Number(entry?.r ?? entry?.round ?? entry))
        .filter((value: number) => Number.isFinite(value))
      return {
        compiledId: String(item?._id ?? payload?._id ?? ''),
        rounds: normalizedRounds,
        createdAt: item?.createdAt ? String(item.createdAt) : undefined,
      }
    })
    .filter((item) => item.compiledId.length > 0)
)
const currentCompiledId = computed(() => String(compiledStore.compiled?._id ?? '').trim())
const diffBaselineCompiledOptions = computed<BaselineCompiledOption[]>(() =>
  baselineCompiledOptions.value.filter((item) => item.compiledId !== currentCompiledId.value)
)
const compileRowsBase = computed<any[]>(() => {
  return Array.isArray(compiledStore.compiled?.compiled_team_results)
    ? compiledStore.compiled!.compiled_team_results
    : []
})
const selectedCompileDiffBaselineCompiled = computed<Record<string, any> | null>(() => {
  const baselineId = compileDiffBaselineCompiledId.value.trim()
  if (!baselineId) return null
  const matched = compiledHistory.value.find((item) => resolveCompiledDocId(item) === baselineId)
  if (!matched) return null
  return normalizeCompiledDoc(matched)
})
const selectedCompileDiffBaselineRows = computed<any[]>(() =>
  Array.isArray(selectedCompileDiffBaselineCompiled.value?.compiled_team_results)
    ? selectedCompileDiffBaselineCompiled.value!.compiled_team_results
    : []
)
const compileRows = computed<any[]>(() => {
  if (!compileDiffBaselineCompiledId.value.trim() || selectedCompileDiffBaselineRows.value.length === 0) {
    return compileRowsBase.value
  }
  return applyClientBaselineDiff(compileRowsBase.value, selectedCompileDiffBaselineRows.value)
})
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
const compileDiffMeta = computed<any | null>(() =>
  compiledStore.compiled?.compile_diff_meta && typeof compiledStore.compiled.compile_diff_meta === 'object'
    ? compiledStore.compiled.compile_diff_meta
    : null
)
const compileDiffBaselineLabel = computed(() => {
  const selectedBaselineId = compileDiffBaselineCompiledId.value.trim()
  if (selectedBaselineId) {
    const selected = diffBaselineCompiledOptions.value.find(
      (item) => item.compiledId === selectedBaselineId
    )
    if (selected) {
      return t('選択した過去集計: {label}', {
        label: formatCompiledSnapshotOptionLabel(selected, 'ja-JP'),
      })
    }
    return t('選択した過去集計')
  }
  const meta = compileDiffMeta.value
  if (!meta || meta.baseline_found !== true) return t('基準なし')
  const baselineId = String(meta.baseline_compiled_id ?? '')
  if (meta.baseline_mode === 'compiled') {
    const selected = diffBaselineCompiledOptions.value.find((item) => item.compiledId === baselineId)
    if (selected) {
      return t('選択した過去集計: {label}', {
        label: formatCompiledSnapshotOptionLabel(selected, 'ja-JP'),
      })
    }
    return t('選択した過去集計')
  }
  return t('前回集計')
})
const snapshotIncludesSelectedRound = computed(() => {
  if (selectedRound.value === null) return false
  return compiledSnapshotRoundSet.value.has(selectedRound.value)
})

const compiledRoundSet = computed(() => {
  const rounds = Array.isArray(compiledStore.compiled?.rounds) ? compiledStore.compiled?.rounds : []
  return new Set(
    rounds
      .map((item: any) => Number(item?.r ?? item?.round))
      .filter((value: number) => Number.isInteger(value) && value >= 1)
  )
})

function submissionActorKey(item: any) {
  const payloadEntityId = String(item?.payload?.submittedEntityId ?? '').trim()
  if (payloadEntityId) return payloadEntityId
  const submittedBy = String(item?.submittedBy ?? '').trim()
  return submittedBy
}

function submissionsForRound(roundNumber: number, type?: 'ballot' | 'feedback') {
  return submissionsStore.submissions.filter((item) => {
    const sameRound = Number(item.round) === roundNumber
    const sameType = type ? item.type === type : true
    return sameRound && sameType
  })
}

const selectedRoundSubmissions = computed(() => {
  if (selectedRound.value === null) return []
  return submissionsForRound(selectedRound.value)
})

const selectedRoundSubmissionSpeed = computed(() => {
  if (selectedRound.value === null) return null
  return (
    buildSubmissionSpeedRows(selectedRoundSubmissions.value, { delayedMinutes: 30 }).find(
      (row) => Number(row.round) === selectedRound.value
    ) ?? null
  )
})

const selectedRoundSubmissionDelayRows = computed(() => {
  if (selectedRound.value === null) return []
  return buildSubmissionDelayRows(selectedRoundSubmissions.value, {
    delayedMinutes: 30,
    topPerRound: 6,
  }).filter((row) => Number(row.round) === selectedRound.value)
})

function unknownSubmissionCount(roundNumber: number, type?: 'ballot' | 'feedback') {
  return submissionsForRound(roundNumber, type).filter(
    (item) => submissionActorKey(item).trim().length === 0
  ).length
}

function selectedTeamIds(roundNumber: number) {
  const draw = drawsStore.draws.find((item) => Number(item.round) === roundNumber)
  if (!draw) return []
  const ids = new Set<string>()
  draw.allocation.forEach((row) => {
    const gov = String((row as any)?.teams?.gov ?? '')
    const opp = String((row as any)?.teams?.opp ?? '')
    if (gov) ids.add(gov)
    if (opp) ids.add(opp)
  })
  return Array.from(ids)
}

function adjudicatorCount(roundNumber: number) {
  const draw = drawsStore.draws.find((item) => Number(item.round) === roundNumber)
  if (!draw) return 0
  const ids = new Set<string>()
  draw.allocation.forEach((row) => {
    ;[...(row.chairs ?? []), ...(row.panels ?? []), ...(row.trainees ?? [])].forEach((id) => {
      const token = String(id ?? '').trim()
      if (token) ids.add(token)
    })
  })
  return ids.size
}

function ballotSubmittedCount(roundNumber: number) {
  return countSubmissionActors(submissionsForRound(roundNumber, 'ballot'), submissionActorKey)
}

function feedbackSubmittedCount(roundNumber: number) {
  return countSubmissionActors(submissionsForRound(roundNumber, 'feedback'), submissionActorKey)
}

function totalExpectedCount(roundNumber: number) {
  return ballotExpectedCount(roundNumber) + feedbackExpectedCount(roundNumber)
}

function totalSubmittedCount(roundNumber: number) {
  return ballotSubmittedCount(roundNumber) + feedbackSubmittedCount(roundNumber)
}

function ballotExpectedCount(roundNumber: number) {
  return adjudicatorCount(roundNumber)
}

function feedbackExpectedCount(roundNumber: number) {
  const round = sortedRounds.value.find((item) => item.round === roundNumber)
  if (!round) return 0
  const userDefined = (round.userDefinedData ?? {}) as Record<string, any>
  const fromTeams = userDefined.evaluate_from_teams === true
  const fromAdjudicators = userDefined.evaluate_from_adjudicators === true
  const evaluatorInTeam = userDefined.evaluator_in_team === 'speaker' ? 'speaker' : 'team'
  let expected = 0
  if (fromTeams) {
    const teamIds = selectedTeamIds(roundNumber)
    if (evaluatorInTeam === 'speaker') {
      expected += teamIds.reduce((count, id) => {
        const team = teamsStore.teams.find((item) => item._id === id)
        if (!team) return count
        const speakerCount = Array.isArray(team.speakers) ? team.speakers.length : 0
        return count + speakerCount
      }, 0)
    } else {
      expected += teamIds.length
    }
  }
  if (fromAdjudicators) {
    expected += adjudicatorCount(roundNumber)
  }
  return expected
}

const selectedRoundBallotGap = computed(() => {
  if (selectedRound.value === null) return { expected: 0, submitted: 0, unknown: 0, missing: 0, hasGap: false }
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
  return t('未提出のチーム評価があります（提出 {submitted}/{expected}）。提出状況タブを確認してください。', {
    submitted: selectedRoundBallotGap.value.submitted,
    expected: selectedRoundBallotGap.value.expected,
  })
})

const selectedRoundUnknownBallotWarning = computed(() => {
  if (selectedRoundBallotGap.value.unknown <= 0) return ''
  return t('提出者情報が不足したチーム評価が {count} 件あります。提出状況タブで提出者を補完してください。', {
    count: selectedRoundBallotGap.value.unknown,
  })
})

const shouldBlockSubmissionCompile = computed(() => selectedRoundBallotGap.value.hasGap)

function roundTaskStates(roundNumber: number): Record<HubTask, HubTaskState> {
  const draw = drawsStore.draws.find((item) => Number(item.round) === roundNumber)
  const hasDraw = Boolean(draw && Array.isArray(draw.allocation) && draw.allocation.length > 0)
  const published = Boolean(draw?.drawOpened && draw?.allocationOpened)
  const expected = ballotExpectedCount(roundNumber)
  const submitted = ballotSubmittedCount(roundNumber)
  const unknown = unknownSubmissionCount(roundNumber, 'ballot')
  const hasGap = (expected > 0 && submitted < expected) || unknown > 0

  const drawState: HubTaskState = hasDraw ? 'done' : 'ready'
  const publishState: HubTaskState = published ? 'done' : !hasDraw ? 'blocked' : 'ready'
  const submissionsState: HubTaskState = !published ? 'blocked' : hasGap ? 'ready' : 'done'
  const compileState: HubTaskState = compiledRoundSet.value.has(roundNumber)
    ? 'done'
    : !published || hasGap
      ? 'blocked'
      : 'ready'

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

const operationTasks = computed<Array<{ key: HubTask; order: number; label: string; state: HubTaskState; stateLabel: string }>>(() => {
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
      label: t('対戦生成'),
      state: states.draw,
      stateLabel: taskStateLabel(states.draw),
    },
    {
      key: 'publish',
      order: 2,
      label: t('公開設定'),
      state: states.publish,
      stateLabel: taskStateLabel(states.publish),
    },
    {
      key: 'submissions',
      order: 3,
      label: t('提出状況'),
      state: states.submissions,
      stateLabel: taskStateLabel(states.submissions),
    },
    {
      key: 'compile',
      order: 4,
      label: t('集計設定'),
      state: states.compile,
      stateLabel: taskStateLabel(states.compile),
    },
  ]
})

const activeTaskHint = computed(() => {
  if (selectedRound.value === null) return ''
  if (activeTask.value === 'draw') {
    return t('対戦生成では参照集計結果を選択できます。未選択でも自動生成できます。')
  }
  if (activeTask.value === 'publish' && !selectedRoundHasDraw.value) {
    return t('まず対戦表を生成してください。')
  }
  if (activeTask.value === 'submissions' && !selectedRoundPublished.value) {
    return t('公開後に提出を回収します。先に公開設定で公開してください。')
  }
  if (activeTask.value === 'compile') {
    if (!selectedRoundPublished.value) {
      return t('公開後に提出を回収します。先に公開設定で公開してください。')
    }
    if (selectedRoundBallotGapWarning.value) return selectedRoundBallotGapWarning.value
    return t(
      '提出結果を集計して成績を確定します。成績に含めるラウンドを確認してから実行してください。'
    )
  }
  return ''
})

function roundStatus(roundNumber: number): RoundOperationStatus {
  const draw = drawsStore.draws.find((item) => Number(item.round) === roundNumber)
  return resolveRoundOperationStatus({
    hasSubmissions: submissionsForRound(roundNumber).length > 0,
    hasCompiled: compiledRoundSet.value.has(roundNumber),
    hasDraw: Boolean(draw && Array.isArray(draw.allocation) && draw.allocation.length > 0),
    isPublished: Boolean(draw?.drawOpened && draw?.allocationOpened),
  })
}

function roundCurrentStepLabel(roundNumber: number) {
  const nextTask = recommendedTaskForRound(roundNumber)
  if (nextTask === 'draw') return `1. ${t('対戦生成')}`
  if (nextTask === 'publish') return `2. ${t('公開設定')}`
  if (nextTask === 'submissions') return `3. ${t('提出状況')}`
  return `4. ${t('集計設定')}`
}

function isRoundStepCompleted(roundNumber: number) {
  return compiledRoundSet.value.has(roundNumber)
}

function roundLabel(roundNumber: number) {
  const found = sortedRounds.value.find((round) => Number(round.round) === Number(roundNumber))
  return found?.name || t('ラウンド {round}', { round: roundNumber })
}

function roundStatusLabel(status: RoundOperationStatus) {
  if (status === 'finalized') return t('確定')
  if (status === 'generated') return t('生成済み')
  if (status === 'compiled') return t('集計済み')
  if (status === 'collecting') return t('回収中')
  return t('準備中')
}

const forceIncludeLabelOptions = computed<Array<{ value: CompileIncludeLabel; label: string }>>(() => [
  { value: 'teams', label: t('チーム') },
  { value: 'speakers', label: t('スピーカー') },
  { value: 'adjudicators', label: t('ジャッジ') },
  { value: 'poi', label: t('POI') },
  { value: 'best', label: t('Best') },
])

function normalizeCompileSourceRounds(sourceRounds: unknown, maxRound: number): number[] {
  if (!Array.isArray(sourceRounds)) return []
  return Array.from(
    new Set(
      sourceRounds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= maxRound)
    )
  ).sort((left, right) => left - right)
}

function applyCompileDraftFromRound() {
  if (selectedRound.value === null) return
  const userDefined = (selectedRoundData.value?.userDefinedData ?? {}) as Record<string, any>
  const rawCompile = (userDefined.compile ?? {}) as Record<string, any>
  const compileOptionsSource =
    rawCompile.options && typeof rawCompile.options === 'object'
      ? (rawCompile.options as CompileOptions)
      : (rawCompile as CompileOptions)
  const normalizedOptions = normalizeCompileOptions(compileOptionsSource)
  compileSource.value = rawCompile.source === 'raw' ? 'raw' : 'submissions'
  rankingPriorityPreset.value = normalizedOptions.ranking_priority.preset
  rankingPriorityOrder.value = [...normalizedOptions.ranking_priority.order]
  compileWinnerPolicy.value = normalizedOptions.winner_policy
  compileTiePoints.value = normalizedOptions.tie_points
  compileDuplicateMergePolicy.value = normalizedOptions.duplicate_normalization.merge_policy
  compilePoiAggregation.value = normalizedOptions.duplicate_normalization.poi_aggregation
  compileBestAggregation.value = normalizedOptions.duplicate_normalization.best_aggregation
  compileMissingDataPolicy.value = normalizedOptions.missing_data_policy
  compileIncludeLabels.value =
    normalizedOptions.include_labels.length > 0
      ? [...normalizedOptions.include_labels]
      : [...DEFAULT_COMPILE_OPTIONS.include_labels]
  const allowedRounds = compileTargetRounds.value
  const configuredRounds = normalizeCompileSourceRounds(rawCompile.source_rounds, selectedRound.value).filter(
    (roundNumber) => allowedRounds.includes(roundNumber)
  )
  selectedCompileRounds.value =
    configuredRounds.length > 0 ? configuredRounds : allowedRounds.slice()
}

function toggleForceCompileIncludeLabel(label: CompileIncludeLabel, event: Event) {
  const input = event.target as HTMLInputElement | null
  const checked = Boolean(input?.checked)
  const current = new Set(forceCompileIncludeLabels.value)
  if (checked) {
    current.add(label)
  } else {
    current.delete(label)
  }
  const normalized = DEFAULT_COMPILE_OPTIONS.include_labels.filter((value) => current.has(value))
  forceCompileIncludeLabels.value =
    normalized.length > 0 ? normalized : [...DEFAULT_COMPILE_OPTIONS.include_labels]
}

function buildCompileOptions(overrides?: {
  missing_data_policy?: CompileOptions['missing_data_policy']
  include_labels?: CompileIncludeLabel[]
}): CompileOptions {
  const selectedBaselineId = compileDiffBaselineCompiledId.value.trim()
  const diffBaseline =
    selectedBaselineId.length > 0
      ? { mode: 'compiled' as const, compiled_id: selectedBaselineId }
      : { mode: 'latest' as const }
  const includeLabels =
    Array.isArray(overrides?.include_labels) && overrides.include_labels.length > 0
      ? Array.from(new Set(overrides.include_labels))
      : Array.from(new Set(compileIncludeLabels.value))
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
    include_labels:
      includeLabels.length > 0 ? includeLabels : [...DEFAULT_COMPILE_OPTIONS.include_labels],
    diff_baseline: diffBaseline,
  }
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

function submissionTypeLabel(type: 'ballot' | 'feedback' | 'unknown') {
  if (type === 'ballot') return t('チーム評価')
  if (type === 'feedback') return t('ジャッジ評価')
  return t('不明')
}

function speedStatusLabel(status: 'ok' | 'warn' | 'danger') {
  if (status === 'danger') return t('要介入')
  if (status === 'warn') return t('注意')
  return t('正常')
}

function setSubmissionEvaluationTab(value: 'team' | 'judge') {
  submissionEvaluationTab.value = value
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

const publishPreviewRows = computed<DrawPreviewRow[]>(() => {
  const allocation = Array.isArray(selectedDraw.value?.allocation) ? selectedDraw.value?.allocation : []
  return allocation.map((row: any, index: number) => {
    const govId = String(row?.teams?.gov ?? '')
    const oppId = String(row?.teams?.opp ?? '')
    const govWin = compiledTeamWinMap.value.get(govId) ?? 0
    const oppWin = compiledTeamWinMap.value.get(oppId) ?? 0
    const venueId = String(row?.venue ?? '')
    return {
      key: `${index}-${govId}-${oppId}-${venueId}`,
      matchIndex: index,
      venuePriority: venuePriority(venueId),
      venueLabel: venueId ? venueName(venueId) : t('会場未定'),
      govName: govId ? teamName(govId) : t('未選択'),
      oppName: oppId ? teamName(oppId) : t('未選択'),
      winLabel: `${govWin}-${oppWin}`,
      winTotal: govWin + oppWin,
      winGap: Math.abs(govWin - oppWin),
      chairsLabel: adjudicatorLabel(Array.isArray(row?.chairs) ? row.chairs : []),
      panelsLabel: adjudicatorLabel(Array.isArray(row?.panels) ? row.panels : []),
      traineesLabel: adjudicatorLabel(Array.isArray(row?.trainees) ? row.trainees : []),
    }
  })
})

async function refresh() {
  if (!tournamentId.value) return
  sectionLoading.value = true
  actionError.value = ''
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
    const selectedBaselineId = compileDiffBaselineCompiledId.value.trim()
    if (!selectedBaselineId) {
      applyDefaultCompileDiffBaseline()
    }
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
  source: 'submissions' | 'raw',
  optionOverrides?: {
    missing_data_policy?: CompileOptions['missing_data_policy']
    include_labels?: CompileIncludeLabel[]
  }
) {
  if (selectedRound.value === null || effectiveCompileTargetRounds.value.length === 0) return
  compileMessage.value = ''
  actionError.value = ''
  closeForceCompileModal()
  compileSource.value = source
  if (!selectedRoundPublished.value) {
    actionError.value = t('公開後に提出を回収します。先に公開設定で公開してください。')
    return
  }
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
  compileMessage.value = t('集計が完了しました。')
  await Promise.all([compiledStore.fetchLatest(tournamentId.value), refreshCompiledHistory()])
  applyDefaultCompileDiffBaseline()
}

function onCompileRoundToggle(roundNumber: number, event: Event) {
  const input = event.target as HTMLInputElement | null
  const checked = Boolean(input?.checked)
  const current = new Set(selectedCompileRounds.value)
  if (checked) current.add(roundNumber)
  else current.delete(roundNumber)
  selectedCompileRounds.value = compileTargetRounds.value.filter((round) => current.has(round))
}

function openForceCompileModal() {
  if (
    selectedRound.value === null ||
    !selectedRoundPublished.value ||
    effectiveCompileTargetRounds.value.length === 0 ||
    isLoading.value
  ) {
    return
  }
  forceCompileMissingDataPolicy.value = compileMissingDataPolicy.value
  forceCompileIncludeLabels.value =
    compileIncludeLabels.value.length > 0
      ? [...compileIncludeLabels.value]
      : [...DEFAULT_COMPILE_OPTIONS.include_labels]
  forceCompileModalOpen.value = true
}

function closeForceCompileModal() {
  forceCompileModalOpen.value = false
}

async function confirmForcedCompile() {
  await runCompileWithSource('raw', {
    missing_data_policy: forceCompileMissingDataPolicy.value,
    include_labels: forceCompileIncludeLabels.value,
  })
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

function applyDefaultCompileDiffBaseline() {
  const resolved = resolvePreviousCompiledId(
    baselineCompiledOptions.value,
    String(compiledStore.compiled?._id ?? '')
  )
  compileDiffBaselineCompiledId.value = diffBaselineCompiledOptions.value.some(
    (option) => option.compiledId === resolved
  )
    ? resolved
    : ''
}

async function saveDrawPublication(
  nextState: Partial<{ drawOpened: boolean; allocationOpened: boolean; locked: boolean }>
): Promise<boolean> {
  if (!selectedDraw.value || selectedRound.value === null) return false
  publishMessage.value = ''
  actionError.value = ''
  publicationSaving.value = true
  try {
    const saved = await drawsStore.upsertDraw({
      tournamentId: tournamentId.value,
      round: selectedRound.value,
      allocation: selectedDraw.value.allocation,
      userDefinedData: selectedDraw.value.userDefinedData,
      drawOpened: nextState.drawOpened ?? drawOpenedValue.value,
      allocationOpened: nextState.allocationOpened ?? allocationOpenedValue.value,
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

async function onPublishToggle(
  key: 'drawOpened' | 'allocationOpened',
  checked: boolean
) {
  if (!selectedRoundHasDraw.value) return
  const current = key === 'drawOpened' ? drawOpenedValue.value : allocationOpenedValue.value
  if (current === checked) return
  await saveDrawPublication({ [key]: checked })
}

async function onMotionPublishToggle(checked: boolean) {
  if (motionOpenedValue.value === checked) return
  await saveRoundPublication({ motionOpened: checked })
}

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
      compileSortKey.value = columns.includes('ranking') ? 'ranking' : columns[0] ?? 'ranking'
      compileSortDirection.value = compileSortKey.value === 'ranking' ? 'asc' : 'desc'
    }
  },
  { immediate: true }
)

watch(
  compileTargetRounds,
  (rounds) => {
    const filtered = selectedCompileRounds.value.filter((round) => rounds.includes(round))
    if (filtered.length > 0) {
      selectedCompileRounds.value = filtered
      return
    }
    selectedCompileRounds.value = rounds.slice()
  },
  { immediate: true }
)

watch(
  selectedRound,
  () => {
    applyCompileDraftFromRound()
  },
  { immediate: true }
)

watch(
  diffBaselineCompiledOptions,
  (options) => {
    const selectedBaselineId = compileDiffBaselineCompiledId.value.trim()
    if (options.length === 0) {
      compileDiffBaselineCompiledId.value = ''
      return
    }
    if (!selectedBaselineId) {
      applyDefaultCompileDiffBaseline()
      return
    }
    const exists = options.some((option) => option.compiledId === selectedBaselineId)
    if (!exists) {
      applyDefaultCompileDiffBaseline()
    }
  },
  { immediate: true }
)

watch(
  tournamentId,
  () => {
    selectedRound.value = null
    roundTaskSelection.value = {}
    refresh()
  },
  { immediate: true }
)
</script>

<style scoped>
.section-header {
  align-items: center;
  gap: var(--space-2);
}

.page-title {
  margin: 0;
  color: var(--color-text);
  font-size: clamp(1.55rem, 1.9vw, 1.92rem);
  line-height: 1.2;
  letter-spacing: 0.01em;
  font-weight: 750;
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

.step-card {
  border: 1px solid var(--color-border);
}

.step-content {
  gap: var(--space-2);
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

.submission-speed-panel {
  border: 1px solid var(--color-border);
  gap: var(--space-2);
}

.submission-speed-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.submission-speed-head h5 {
  margin: 0;
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

.submission-delay-head {
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
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

.compile-result-baseline-select {
  margin-left: auto;
  width: min(340px, 100%);
}

.compile-result-baseline-select :deep(.compiled-snapshot-select) {
  min-width: 0;
}

.compile-result-baseline-select :deep(select) {
  min-height: 34px;
  font-size: 12px;
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

.compile-round-picker {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.compile-round-option {
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

.publish-switch-label {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
  text-align: left;
}

.publish-switch-toggle {
  align-self: center;
}

.publish-switch-inline {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.publish-switch-inline-compact {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  background: var(--color-surface-soft);
}

.publish-preview-section {
  gap: var(--space-2);
}

.preview-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.preview-visibility-chip-list {
  gap: 8px;
  flex-wrap: wrap;
}

.preview-visibility-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
}

.preview-visibility-chip.is-open {
  border-color: #86efac;
  color: #166534;
  background: #f0fdf4;
}

.preview-visibility-chip.is-closed {
  border-color: #fdba74;
  color: #9a3412;
  background: #fff7ed;
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
  width: min(680px, 100%);
  max-height: calc(100vh - 80px);
  overflow: auto;
}

.force-warning-banner {
  border: 1px solid #fca5a5;
  border-radius: var(--radius-md);
  background: #fff1f2;
  color: #9f1239;
  padding: var(--space-3);
  display: grid;
  gap: var(--space-2);
}

.force-warning-banner p {
  margin: 0;
}

.force-warning-list .list-item {
  border-color: #fecdd3;
  background: #fff;
}

.force-option-panel {
  border: 1px solid var(--color-border);
  gap: var(--space-2);
}

.force-option-panel h5 {
  margin: 0;
}

.force-option-field {
  gap: 4px;
}

.force-include-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.modal-actions {
  justify-content: flex-end;
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
