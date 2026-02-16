<template>
  <section class="stack">
    <div class="row section-header">
      <h3 class="page-title">{{ $t('大会結果レポート') }}</h3>
      <ReloadButton
        class="header-reload"
        @click="refresh"
        :target="$t('大会結果レポート')"
        :disabled="isLoading"
        :loading="isLoading"
      />
    </div>

    <LoadingState v-if="isLoading" />
    <p v-else-if="compiledStore.error" class="error">{{ compiledStore.error }}</p>

    <div v-else class="stack">
      <section class="card stack compile-card">
        <div class="row">
          <h4>{{ $t('集計オプション') }}</h4>
        </div>
        <div v-if="baselineCompiledOptions.length > 0" class="row snapshot-selector-row">
          <CompiledSnapshotSelect
            v-model="selectedCompiledId"
            class="compile-diff-field compile-diff-field-wide"
            :label="$t('過去の集計結果')"
            :options="snapshotSelectOptions"
          />
          <span v-if="isDisplayedRawSource" class="raw-source-badge">{{ $t('例外モード') }}</span>
        </div>
        <p v-else class="muted small">{{ $t('集計スナップショットはまだありません。') }}</p>
        <p class="muted small">
          {{ $t('必要な場合のみ詳細設定で再計算条件を変更してください。') }}
        </p>
        <div v-if="roundSubmissionSummaries.length > 0" class="stack submission-summary">
          <div class="row submission-summary-header">
            <h5>{{ $t('提出状況サマリー') }}</h5>
            <div class="row submission-summary-actions">
              <Button
                variant="secondary"
                size="sm"
                @click="downloadCommentSheetCsv"
                :disabled="commentSheetRows.length === 0"
              >
                {{ $t('コメントシートCSV') }}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                @click="downloadParticipantCsv"
                :disabled="participantExportRows.length === 0"
              >
                {{ $t('参加者CSV') }}
              </Button>
              <RouterLink :to="`/admin/${tournamentId}/submissions`" class="submission-link">
                {{ $t('提出一覧を開く') }}
              </RouterLink>
            </div>
          </div>
          <Table hover striped>
            <thead>
              <tr>
                <th>{{ $t('ラウンド') }}</th>
                <th>Ballot</th>
                <th>Feedback</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="summary in roundSubmissionSummaries" :key="summary.round">
                <td>{{ roundName(summary.round) }}</td>
                <td>{{ summarizeSubmissionCell(summary, 'ballot') }}</td>
                <td>{{ summarizeSubmissionCell(summary, 'feedback') }}</td>
              </tr>
            </tbody>
          </Table>
        </div>
        <div v-if="compileRounds.length > 0" class="stack compile-warning-list">
          <div v-for="r in compileRounds" :key="r">
            <p v-if="missingBallotByRound(r).length > 0" class="muted warning">
              {{ roundName(r) }}:
              {{ $t('スコアシート未提出: {names}', { names: missingBallotByRound(r).map(adjudicatorName).join(', ') }) }}
            </p>
            <p v-if="missingFeedbackTeamsByRound(r).length > 0" class="muted warning">
              {{ roundName(r) }}:
              {{
                $t('評価未提出（{label}）: {names}', {
                  label: feedbackTeamLabel(r),
                  names: missingFeedbackTeamsByRound(r)
                    .map((item) => item.name)
                    .join(', '),
                })
              }}
            </p>
            <p v-if="missingFeedbackAdjudicatorsByRound(r).length > 0" class="muted warning">
              {{ roundName(r) }}:
              {{
                $t('評価未提出（ジャッジ）: {names}', {
                  names: missingFeedbackAdjudicatorsByRound(r)
                    .map(adjudicatorName)
                    .join(', '),
                })
              }}
            </p>
            <p
              v-if="
                unknownCountsByRound(r).ballot > 0 || unknownCountsByRound(r).feedback > 0
              "
              class="muted"
            >
              {{ roundName(r) }}:
              {{
                $t('提出者情報不足: Ballot {ballot} / Feedback {feedback}', {
                  ballot: unknownCountsByRound(r).ballot,
                  feedback: unknownCountsByRound(r).feedback,
                })
              }}
            </p>
          </div>
        </div>
        <div class="row compile-actions">
          <Button @click="runCompile" :disabled="isLoading || !canRunCompile">
            {{ $t('レポート生成') }}
          </Button>
          <Button variant="secondary" @click="showRecomputeOptions = true">
            {{ $t('詳細設定') }}
          </Button>
        </div>
        <div v-if="compileWarnings.length > 0" class="stack compile-warning-list">
          <p v-for="warning in compileWarnings" :key="warning" class="muted warning">
            {{ warning }}
          </p>
        </div>
        <div v-if="isRawModeActive" class="card stack migration-guide">
          <h5>{{ $t('提出データ一本化ガイド') }}</h5>
          <ol class="migration-guide-list">
            <li>{{ $t('提出一覧で不足提出を解消し、重複提出を整理します。') }}</li>
            <li>{{ $t('生結果での補正が必要な場合は、提出データ編集へ反映して再集計します。') }}</li>
            <li>{{ $t('提出データソースに戻して再計算し、確定snapshotを選択して出力します。') }}</li>
          </ol>
          <div class="row migration-guide-actions">
            <RouterLink :to="`/admin/${tournamentId}/submissions`" class="migration-guide-link">
              {{ $t('提出一覧を開く') }}
            </RouterLink>
            <RouterLink :to="`/admin/${tournamentId}/operations`" class="migration-guide-link">
              {{ $t('ラウンド運営へ') }}
            </RouterLink>
          </div>
        </div>
      </section>

      <template v-if="compiled">
        <p v-if="isDisplayedRawSource" class="muted warning raw-source-notice">
          {{ $t('表示中スナップショットは「生結果データ」です（例外モード）。') }}
        </p>
        <div v-if="showCategoryTabs" class="stack compile-category-inline">
          <div class="row compile-category-row">
            <h4>{{ $t('集計区分') }}</h4>
          </div>
          <div class="label-tabs">
            <button
              v-for="label in availableLabels"
              :key="label"
              type="button"
              class="label-tab"
              :class="{ active: activeLabel === label }"
              @click="setActiveLabel(label)"
            >
              {{ labelDisplay(label) }}
            </button>
          </div>
        </div>

        <section class="card stack">
          <div class="row result-list-head">
            <h4>{{ $t('一覧') }}</h4>
            <div class="row result-list-actions">
              <label class="stack compile-diff-field">
                <span class="muted compile-label">
                  {{ $t('差分比較') }}
                  <HelpTip :text="optionHelp('diff')" />
                </span>
                <select v-model="compileDiffBaselineSelection">
                  <option value="latest">{{ $t('最新集計') }}</option>
                  <option
                    v-for="option in baselineCompiledOptions"
                    :key="option.compiledId"
                    :value="option.compiledId"
                  >
                    {{ baselineCompiledOptionLabel(option) }}
                  </option>
                </select>
              </label>
              <span v-if="isDisplayedRawSource" class="raw-source-badge">{{ $t('例外モード') }}</span>
            </div>
          </div>
          <div v-if="showDiffLegend" class="row diff-legend">
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
            <span class="muted">{{ $t('差分基準: {baseline}', { baseline: diffBaselineLabel }) }}</span>
            <span v-if="isDisplayedRawSource" class="raw-source-badge">{{ $t('例外モード') }}</span>
          </div>
          <div v-if="activeResults.length === 0" class="muted">{{ $t('結果がありません。') }}</div>
          <Table v-else hover striped sticky-header>
            <thead>
              <tr>
                <th v-for="key in tableColumns" :key="key">
                  <SortHeaderButton
                    compact
                    :label="columnLabel(key)"
                    :indicator="resultSortIndicator(key)"
                    @click="setResultSort(key)"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in sortedActiveResults" :key="row.id">
                <td v-for="key in tableColumns" :key="key">
                  <span v-if="key === 'id'">{{ entityName(row.id) }}</span>
                  <span v-else-if="key === 'ranking'" class="diff-value">
                    <span>{{ formatValue(row[key]) }}</span>
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
                  <span v-else-if="key === 'comments' || key === 'judged_teams'">
                    {{ formatList(row[key]) }}
                  </span>
                  <span v-else class="diff-value">
                    <span>{{ formatValue(row[key]) }}</span>
                    <span v-if="metricDeltaText(row, key)" class="muted diff-delta">
                      {{ metricDeltaText(row, key) }}
                    </span>
                  </span>
                </td>
              </tr>
            </tbody>
          </Table>
          <div class="row section-download-row">
            <Button
              variant="secondary"
              class="section-download-button"
              :disabled="activeResults.length === 0"
              @click="downloadCsv"
            >
              {{ $t('CSVダウンロード') }}
            </Button>
          </div>
        </section>

        <section class="card stack">
          <div class="row">
            <h4>{{ $t('スライド') }}</h4>
            <div class="inline">
              <Button variant="secondary" size="sm" @click="showSlides = !showSlides">
                {{ showSlides ? $t('閉じる') : $t('表示') }}
              </Button>
              <Button variant="secondary" size="sm" @click="slideSettingsOpen = !slideSettingsOpen">
                {{ slideSettingsOpen ? $t('設定を隠す') : $t('設定を表示') }}
              </Button>
            </div>
          </div>
          <div v-if="slideSettingsOpen" class="row wrap">
            <label class="stack">
              <span class="muted">{{ $t('表彰枠') }}</span>
              <input v-model.number="maxRankingRewarded" type="number" min="1" />
            </label>
            <label class="stack">
              <span class="muted">{{ $t('クレジット') }}</span>
              <input v-model="slideCredit" type="text" />
            </label>
            <label class="stack">
              <span class="muted">{{ $t('タイプ') }}</span>
              <select v-model="slideType">
                <option value="listed">{{ $t('一覧') }}</option>
                <option value="pretty">{{ $t('装飾') }}</option>
              </select>
            </label>
          </div>
          <Slides
            v-if="showSlides"
            :label="activeLabel"
            :tournament="compiledWithSubPrizes"
            :entities="entities"
            :max-ranking-rewarded="maxRankingRewarded"
            :type="slideType"
            :credit="slideCredit"
            @close="showSlides = false"
          />
        </section>

        <section class="card stack" v-if="isStandardLabel">
          <h4>{{ $t('統計') }} ({{ labelDisplay(activeLabel) }})</h4>
          <ScoreChange :results="activeResults" :tournament="compiled" :score="scoreKey" />
          <ScoreRange :results="activeResults" :score="scoreKey" />
          <div class="stack" v-if="sortedRounds.length > 0">
            <ScoreHistogram
              v-for="round in sortedRounds"
              :key="`hist-${round.round}`"
              :results="activeResults"
              :score="scoreKey"
              :round="round.round"
            />
          </div>
          <ScoreHistogram v-else :results="activeResults" :score="scoreKey" />
          <TeamPerformance v-if="activeLabel === 'teams'" :results="activeResults" />
        </section>

        <section class="card stack" v-if="teamResults.length > 0">
          <h4>{{ $t('公平性') }}</h4>
          <SideScatter v-if="teamHasScores" :results="teamResults" :rounds="sortedRounds" />
          <div v-for="round in sortedRounds" :key="round.round" class="stack">
            <SideHeatmap
              :results="teamResults"
              :round="round.round"
              :round-name="round.name"
              :labels="entities"
            />
            <SideMarginHeatmap
              v-if="teamHasScores"
              :results="teamResults"
              :round="round.round"
              :round-name="round.name"
              :labels="entities"
            />
            <SidePieChart
              :results="teamResults"
              :round="round.round"
              :round-name="round.name"
              :total-teams="teams.teams.length"
            />
          </div>
        </section>

        <section class="card stack" v-if="awardCopyRows.length > 0">
          <div class="row award-copy-toolbar">
            <h4>{{ $t('表彰コピー') }}</h4>
            <div class="row award-copy-controls">
              <label class="stack award-copy-limit">
                <span class="muted">{{ $t('表彰枠') }}</span>
                <input v-model.number="awardCopyLimit" type="number" min="1" />
              </label>
              <Button variant="secondary" size="sm" @click="copyAwardText">
                {{ $t('コピー') }}
              </Button>
            </div>
          </div>
          <p v-if="awardCopyCopied" class="muted">{{ $t('コピーしました。') }}</p>
          <pre class="award-copy-text">{{ awardCopyText }}</pre>
          <div class="row section-download-row">
            <Button
              variant="secondary"
              class="section-download-button"
              :disabled="awardExportRows.length === 0"
              @click="downloadAwardCsv"
            >
              {{ $t('受賞者CSV') }}
            </Button>
          </div>
        </section>
      </template>
    </div>

    <div
      v-if="showRecomputeOptions"
      class="modal-backdrop"
      role="presentation"
      @click.self="showRecomputeOptions = false"
    >
      <div class="modal card stack report-modal recompute-modal" role="dialog" aria-modal="true">
        <div class="row report-modal-head">
          <strong>{{ $t('詳細設定') }}</strong>
          <Button variant="ghost" size="sm" @click="showRecomputeOptions = false">
            {{ $t('閉じる') }}
          </Button>
        </div>
        <p class="muted small">
          {{ $t('必要な場合のみ詳細設定で再計算条件を変更してください。') }}
        </p>
        <div class="stack recompute-panel">
          <CompileOptionsEditor
            v-model:source="compileSource"
            v-model:source-rounds="compileRounds"
            v-model:ranking-preset="rankingPriorityPreset"
            v-model:ranking-order="rankingPriorityOrder"
            v-model:winner-policy="compileWinnerPolicy"
            v-model:tie-points="compileTiePoints"
            v-model:merge-policy="compileDuplicateMergePolicy"
            v-model:poi-aggregation="compilePoiAggregation"
            v-model:best-aggregation="compileBestAggregation"
            v-model:missing-data-policy="compileMissingDataPolicy"
            v-model:include-labels="compileIncludeLabels"
            :show-source-rounds="true"
            :source-round-options="sortedRounds.map((round) => ({ value: round.round, label: round.name ?? $t('ラウンド {round}', { round: round.round }) }))"
            :disabled="isLoading"
          />
          <p v-if="isRawSourceSelected" class="muted warning">
            {{
              $t(
                '例外モードです。生結果データで再計算します。通常運用では提出データに戻してください。'
              )
            }}
          </p>
        </div>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="showRecomputeOptions = false">
            {{ $t('取消') }}
          </Button>
        </div>
      </div>
    </div>

    <div
      v-if="rawCompileConfirmOpen"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeRawCompileConfirm"
    >
      <div class="modal card stack report-modal" role="dialog" aria-modal="true">
        <div class="row report-modal-head">
          <strong>{{ $t('強制実行の確認') }}</strong>
          <Button variant="ghost" size="sm" @click="closeRawCompileConfirm">
            {{ $t('閉じる') }}
          </Button>
        </div>
        <p class="muted">
          {{
            $t(
              '強制実行では生結果ソースを使用します。提出データとの差異や提出者情報不足がある場合、順位が不安定になる可能性があります。'
            )
          }}
        </p>
        <ul class="list compact">
          <li class="list-item">{{ $t('未提出・重複提出があると結果が偏る可能性があります。') }}</li>
          <li class="list-item">{{ $t('提出者ID不足のデータは集計漏れ・誤集計の原因になります。') }}</li>
          <li class="list-item">{{ $t('提出ソースが混在している場合、直近の入力で上書きされることがあります。') }}</li>
        </ul>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="closeRawCompileConfirm">
            {{ $t('取消') }}
          </Button>
          <Button size="sm" :disabled="isLoading" @click="confirmRawCompile">
            {{ $t('強制実行する') }}
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTournamentStore } from '@/stores/tournament'
import { useCompiledStore } from '@/stores/compiled'
import { useTeamsStore } from '@/stores/teams'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { useSpeakersStore } from '@/stores/speakers'
import { useInstitutionsStore } from '@/stores/institutions'
import { useRoundsStore } from '@/stores/rounds'
import { useDrawsStore } from '@/stores/draws'
import { useSubmissionsStore } from '@/stores/submissions'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'
import Table from '@/components/common/Table.vue'
import ReloadButton from '@/components/common/ReloadButton.vue'
import HelpTip from '@/components/common/HelpTip.vue'
import SortHeaderButton from '@/components/common/SortHeaderButton.vue'
import CompiledSnapshotSelect from '@/components/common/CompiledSnapshotSelect.vue'
import CompileOptionsEditor from '@/components/common/CompileOptionsEditor.vue'
import Slides from '@/components/slides/Slides.vue'
import ScoreChange from '@/components/mstat/ScoreChange.vue'
import ScoreRange from '@/components/mstat/ScoreRange.vue'
import ScoreHistogram from '@/components/mstat/ScoreHistogram.vue'
import SideScatter from '@/components/mstat/SideScatter.vue'
import SideHeatmap from '@/components/mstat/SideHeatmap.vue'
import SideMarginHeatmap from '@/components/mstat/SideMarginHeatmap.vue'
import SidePieChart from '@/components/mstat/SidePieChart.vue'
import TeamPerformance from '@/components/mstat/TeamPerformance.vue'
import { api } from '@/utils/api'
import {
  DEFAULT_COMPILE_OPTIONS,
  normalizeCompileOptions,
  type CompileIncludeLabel,
  type CompileOptions,
  type CompileRankingMetric,
} from '@/types/compiled'
import { normalizeRoundDefaults } from '@/utils/round-defaults'
import {
  formatSignedDelta,
  rankingTrendSymbol,
  resolveRankingTrend,
  toFiniteNumber,
} from '@/utils/diff-indicator'
import {
  buildCommentSheetCsv,
  buildCommentSheetRows,
  type CommentSheetCsvLabels,
} from '@/utils/comment-sheet'
import {
  buildAwardExportCsv,
  buildParticipantExportCsv,
  type AwardExportRowInput,
  type ParticipantExportRowInput,
} from '@/utils/certificate-export'

const route = useRoute()
const tournamentStore = useTournamentStore()
const compiledStore = useCompiledStore()
const teams = useTeamsStore()
const adjudicators = useAdjudicatorsStore()
const rounds = useRoundsStore()
const speakers = useSpeakersStore()
const institutions = useInstitutionsStore()
const draws = useDrawsStore()
const submissions = useSubmissionsStore()
const { t, locale } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const isLoading = computed(
  () =>
    compiledStore.loading ||
    tournamentStore.loading ||
    teams.loading ||
    adjudicators.loading ||
    rounds.loading ||
    speakers.loading ||
    institutions.loading ||
    draws.loading ||
    submissions.loading
)
const showSlides = ref(false)
const maxRankingRewarded = ref(3)
const slideType = ref<'listed' | 'pretty'>('listed')
const slideCredit = ref('UTab')
const slideSettingsOpen = ref(false)
const awardCopyLimit = ref(3)
const awardCopyCopied = ref(false)
const activeLabel = ref<'teams' | 'speakers' | 'adjudicators' | 'poi' | 'best'>('teams')
const compileSource = ref<'submissions' | 'raw'>('submissions')
const showRecomputeOptions = ref(false)
const rawCompileConfirmOpen = ref(false)
const compileRounds = ref<number[]>([])
const compileExecuted = ref(false)
const resultSortKey = ref('ranking')
const resultSortDirection = ref<'asc' | 'desc'>('asc')
const sortCollator = new Intl.Collator(['ja', 'en'], { numeric: true, sensitivity: 'base' })
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
const compileIncludeLabels = ref<CompileIncludeLabel[]>([...DEFAULT_COMPILE_OPTIONS.include_labels])
const defaultDiffBaseline = DEFAULT_COMPILE_OPTIONS.diff_baseline
const compileDiffBaselineSelection = ref<string>(
  defaultDiffBaseline.mode === 'compiled' ? String(defaultDiffBaseline.compiled_id) : 'latest'
)
const compiledHistory = ref<any[]>([])
const selectedCompiledId = ref('')
const compileDefaultsHydrated = ref(false)

const compiled = computed<Record<string, any> | null>(() => compiledStore.compiled)
const compiledWithSubPrizes = computed<Record<string, any> | undefined>(() => {
  if (!compiled.value) return undefined
  return {
    ...compiled.value,
    compiled_poi_results: poiResults.value,
    compiled_best_results: bestResults.value,
  }
})
type RoundSummary = { round: number; name?: string }
type BaselineCompiledOption = {
  compiledId: string
  rounds: number[]
  roundNames: string[]
  createdAt?: string
}
const sortedRounds = computed<RoundSummary[]>(() => {
  if (rounds.rounds.length > 0) {
    return rounds.rounds.slice().sort((a, b) => a.round - b.round)
  }
  const payloadRounds = compiled.value?.rounds ?? []
  return payloadRounds
    .map((item: any) => {
      const roundValue = Number(item?.r ?? item?.round ?? item)
      return {
        round: roundValue,
        name: item?.name ?? t('ラウンド {round}', { round: roundValue }),
      }
    })
    .filter((round: any) => Number.isFinite(round.round))
    .sort((a: any, b: any) => a.round - b.round)
})
const teamResults = computed<any[]>(() => compiled.value?.compiled_team_results ?? [])
const teamHasScores = computed(() =>
  teamResults.value.some((result) =>
    result.details?.some((detail: any) => typeof detail.sum === 'number')
  )
)

const entities = computed(() => {
  const map: Record<string, string> = {}
  teams.teams.forEach((team) => {
    map[team._id] = team.name
    team.speakers?.forEach((speaker, index) => {
      map[`${team._id}:${index}`] = speaker.name
    })
  })
  speakers.speakers.forEach((speaker) => {
    map[speaker._id] = speaker.name
  })
  adjudicators.adjudicators.forEach((adj) => {
    map[adj._id] = adj.name
  })
  return map
})

const selectedCompileLabels = computed<Set<string>>(
  () => new Set(compiled.value?.compile_options?.include_labels ?? DEFAULT_COMPILE_OPTIONS.include_labels)
)
function isCompileLabelEnabled(label: 'teams' | 'speakers' | 'adjudicators' | 'poi' | 'best') {
  return selectedCompileLabels.value.has(label)
}

const availableLabels = computed(() => {
  if (!compiled.value) return ['teams']
  const labels: Array<'teams' | 'speakers' | 'adjudicators' | 'poi' | 'best'> = []
  if (isCompileLabelEnabled('teams') && compiled.value.compiled_team_results?.length) labels.push('teams')
  if (isCompileLabelEnabled('speakers') && compiled.value.compiled_speaker_results?.length) labels.push('speakers')
  if (isCompileLabelEnabled('adjudicators') && compiled.value.compiled_adjudicator_results?.length) labels.push('adjudicators')
  if (isCompileLabelEnabled('poi') && poiResults.value.length > 0) labels.push('poi')
  if (isCompileLabelEnabled('best') && bestResults.value.length > 0) labels.push('best')
  return labels.length > 0 ? labels : ['teams']
})
const showCategoryTabs = computed(() => Boolean(compiled.value) && compileExecuted.value)
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
        roundNames: roundsValue
          .map((entry: any) => String(entry?.name ?? '').trim())
          .filter((value: string) => value.length > 0),
        createdAt: item?.createdAt ? String(item.createdAt) : undefined,
      }
    })
    .filter((item) => item.compiledId.length > 0)
)
const snapshotSelectOptions = computed(() =>
  baselineCompiledOptions.value.map((option) => ({
    value: option.compiledId,
    label: baselineCompiledOptionLabel(option),
  }))
)
const selectedDiffBaselineCompiledId = computed(() =>
  compileDiffBaselineSelection.value === 'latest'
    ? ''
    : String(compileDiffBaselineSelection.value).trim()
)
const canRunCompile = computed(() => {
  if (!selectedDiffBaselineCompiledId.value) return true
  return baselineCompiledOptions.value.some(
    (option) => option.compiledId === selectedDiffBaselineCompiledId.value
  )
})
const isRawSourceSelected = computed(() => compileSource.value === 'raw')
const displayedCompileSource = computed<'submissions' | 'raw'>(() =>
  compiled.value?.compile_source === 'raw' ? 'raw' : 'submissions'
)
const isDisplayedRawSource = computed(() => displayedCompileSource.value === 'raw')
const isRawModeActive = computed(
  () => isDisplayedRawSource.value || isRawSourceSelected.value
)
const compileOptionsPayload = computed<CompileOptions>(() => {
  const rankingOrder = Array.from(new Set(rankingPriorityOrder.value))
  const includeLabels = Array.from(new Set(compileIncludeLabels.value))
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
    missing_data_policy: compileMissingDataPolicy.value,
    include_labels:
      includeLabels.length > 0 ? includeLabels : [...DEFAULT_COMPILE_OPTIONS.include_labels],
    diff_baseline: selectedDiffBaselineCompiledId.value
      ? { mode: 'compiled', compiled_id: selectedDiffBaselineCompiledId.value }
      : { mode: 'latest' },
  }
})
const compileWarnings = computed<string[]>(() =>
  Array.isArray(compiled.value?.compile_warnings) ? compiled.value.compile_warnings : []
)
const compileDiffMeta = computed<any | null>(() =>
  compiled.value?.compile_diff_meta && typeof compiled.value.compile_diff_meta === 'object'
    ? compiled.value.compile_diff_meta
    : null
)
const diffBaselineLabel = computed(() => {
  const meta = compileDiffMeta.value
  if (!meta || meta.baseline_found !== true) return t('基準なし')
  const baselineId = String(meta.baseline_compiled_id ?? '')
  if (meta.baseline_mode === 'compiled') {
    const selected = baselineCompiledOptions.value.find((item) => item.compiledId === baselineId)
    if (selected) {
      return t('選択した過去集計: {label}', { label: baselineCompiledOptionLabel(selected) })
    }
    return t('選択した過去集計')
  }
  return t('最新集計')
})

function mapInstitutions(values: any): string[] {
  if (!Array.isArray(values)) return []
  if (institutions.institutions.length === 0) return values.map((v) => String(v))
  return values.map((value) => {
    const token = String(value)
    const match = institutions.institutions.find(
      (inst) => inst._id === token || inst.name === token
    )
    return match?.name ?? token
  })
}

function mapEntityNames(values: any): string[] {
  if (!Array.isArray(values)) return []
  return values.map((value) => entities.value[String(value)] ?? String(value))
}

const activeResults = computed<any[]>(() => {
  if (!compiled.value) return []
  const source =
    activeLabel.value === 'speakers'
      ? (compiled.value.compiled_speaker_results ?? [])
      : activeLabel.value === 'adjudicators'
        ? (compiled.value.compiled_adjudicator_results ?? [])
        : activeLabel.value === 'poi'
          ? poiResults.value
          : activeLabel.value === 'best'
            ? bestResults.value
            : (compiled.value.compiled_team_results ?? [])
  return source.map((result: any) => {
    const base = {
      ...result,
      name: entityName(result.id),
      institutions: mapInstitutions(result.institutions),
    }
    if (activeLabel.value === 'adjudicators') {
      const comments =
        result.details?.flatMap((detail: any) =>
          Array.isArray(detail.comments) ? detail.comments : []
        ) ?? []
      return {
        ...base,
        comments: comments.filter((comment: any) => typeof comment === 'string' && comment.trim() !== ''),
        judged_teams: mapEntityNames(result.judged_teams ?? []),
      }
    }
    return base
  })
})
const sortedActiveResults = computed<any[]>(() => {
  const key = resultSortKey.value
  const direction = resultSortDirection.value === 'asc' ? 1 : -1
  return activeResults.value
    .map((row, index) => ({ row, index }))
    .sort((leftEntry, rightEntry) => {
      const left = resultSortValue(leftEntry.row, key)
      const right = resultSortValue(rightEntry.row, key)
      const numericLeft = typeof left === 'number' ? left : null
      const numericRight = typeof right === 'number' ? right : null
      if (numericLeft !== null && numericRight !== null) {
        const delta = numericLeft - numericRight
        if (delta !== 0) return direction * delta
        return leftEntry.index - rightEntry.index
      }
      const diff = sortCollator.compare(String(left ?? ''), String(right ?? ''))
      if (diff !== 0) return direction * diff
      return leftEntry.index - rightEntry.index
    })
    .map((entry) => entry.row)
})
const showDiffLegend = computed(() =>
  activeResults.value.some((row: any) => row?.diff?.ranking) || compileDiffMeta.value !== null
)

const awardCopyRows = computed(() => {
  if (activeResults.value.length === 0) return []
  const ranked = activeResults.value
    .filter((row) => Number.isFinite(Number(row.ranking)))
    .slice()
    .sort((a, b) => Number(a.ranking) - Number(b.ranking))
  const max = Math.max(1, Number(awardCopyLimit.value || 1))
  return ranked.filter((row) => Number(row.ranking) <= max)
})

const awardCopyText = computed(() => {
  return awardCopyRows.value
    .map((row) => {
      const name = entityName(String(row.id))
      const teamText =
        Array.isArray(row.teams) && row.teams.length > 0 ? `（${row.teams.map((item: any) => String(item)).join('/')}）` : ''
      const metric =
        activeLabel.value === 'poi'
          ? formatTimesCount(Number(row.poi ?? 0))
          : activeLabel.value === 'best'
            ? formatTimesCount(Number(row.best ?? 0))
            : locale.value === 'ja'
              ? `${row.ranking}位`
              : ordinal(Number(row.ranking))
      return `${name}${teamText} ${metric}`
    })
    .join('\n')
})

const institutionNameMap = computed(() => {
  const map = new Map<string, string>()
  institutions.institutions.forEach((institution) => {
    map.set(String(institution._id), institution.name)
  })
  return map
})

function resolveInstitutionName(token: string): string {
  return institutionNameMap.value.get(token) ?? token
}

function collectTeamInstitutionNames(team: any): string[] {
  const set = new Set<string>()
  const direct = String(team?.institution ?? '').trim()
  if (direct) set.add(resolveInstitutionName(direct))
  ;(team?.details ?? []).forEach((detail: any) => {
    ;(detail?.institutions ?? []).forEach((institutionId: any) => {
      const token = String(institutionId ?? '').trim()
      if (!token) return
      set.add(resolveInstitutionName(token))
    })
  })
  return Array.from(set)
}

function collectAdjudicatorInstitutionNames(adjudicator: any): string[] {
  const set = new Set<string>()
  ;(adjudicator?.details ?? []).forEach((detail: any) => {
    ;(detail?.institutions ?? []).forEach((institutionId: any) => {
      const token = String(institutionId ?? '').trim()
      if (!token) return
      set.add(resolveInstitutionName(token))
    })
  })
  return Array.from(set)
}

const speakerTeamNameMap = computed(() => {
  const byId = new Map<string, string>()
  const byName = new Map<string, string>()
  teams.teams.forEach((team) => {
    const teamName = String(team.name ?? '')
    ;(team.details ?? []).forEach((detail: any) => {
      ;(detail?.speakers ?? []).forEach((speakerId: any) => {
        const token = String(speakerId ?? '').trim()
        if (!token || byId.has(token)) return
        byId.set(token, teamName)
      })
    })
    ;(team.speakers ?? []).forEach((speaker: any) => {
      const name = String(speaker?.name ?? '').trim()
      if (!name || byName.has(name)) return
      byName.set(name, teamName)
    })
  })
  return { byId, byName }
})

function awardMetricLabel(label: typeof activeLabel.value) {
  if (label === 'teams') return teamHasScores.value ? t('合計') : t('勝利数')
  if (label === 'speakers') return t('平均')
  if (label === 'adjudicators') return t('平均')
  if (label === 'poi') return t('POI合計')
  if (label === 'best') return t('ベストスピーカー合計')
  return ''
}

function awardMetricValue(row: any, label: typeof activeLabel.value): string | number {
  if (label === 'teams') return teamHasScores.value ? Number(row?.sum ?? 0) : Number(row?.win ?? 0)
  if (label === 'speakers') return Number(row?.average ?? 0)
  if (label === 'adjudicators') return Number(row?.average ?? 0)
  if (label === 'poi') return Number(row?.poi ?? 0)
  if (label === 'best') return Number(row?.best ?? 0)
  return ''
}

const awardExportRows = computed<AwardExportRowInput[]>(() =>
  awardCopyRows.value.map((row) => ({
    category: labelDisplay(activeLabel.value),
    ranking: Number(row?.ranking ?? 0),
    place: ordinal(Number(row?.ranking ?? 0)),
    id: String(row?.id ?? ''),
    name: entityName(String(row?.id ?? '')),
    team: Array.isArray(row?.teams) ? row.teams.map((item: any) => String(item)).join('/') : '',
    metric_name: awardMetricLabel(activeLabel.value),
    metric_value: awardMetricValue(row, activeLabel.value),
  }))
)

const participantExportRows = computed<ParticipantExportRowInput[]>(() => {
  const rows: ParticipantExportRowInput[] = []

  teams.teams.forEach((team) => {
    rows.push({
      participant_type: 'team',
      id: String(team._id),
      name: String(team.name ?? ''),
      institutions: collectTeamInstitutionNames(team),
    })
  })

  speakers.speakers.forEach((speaker) => {
    const speakerId = String(speaker._id)
    const speakerName = String(speaker.name ?? '')
    rows.push({
      participant_type: 'speaker',
      id: speakerId,
      name: speakerName,
      team:
        speakerTeamNameMap.value.byId.get(speakerId) ??
        speakerTeamNameMap.value.byName.get(speakerName) ??
        '',
    })
  })

  adjudicators.adjudicators.forEach((adjudicator) => {
    rows.push({
      participant_type: 'adjudicator',
      id: String(adjudicator._id),
      name: String(adjudicator.name ?? ''),
      institutions: collectAdjudicatorInstitutionNames(adjudicator),
      active: adjudicator.active === true,
    })
  })

  return rows
})

const tableColumns = computed(() => {
  if (activeLabel.value === 'poi' || activeLabel.value === 'best') {
    return ['ranking', 'id', 'teams', activeLabel.value]
  }
  if (activeLabel.value === 'adjudicators') {
    return [
      'ranking',
      'id',
      'institutions',
      'average',
      'sd',
      'num_experienced',
      'num_experienced_chair',
      'comments',
    ]
  }
  if (activeLabel.value === 'speakers') {
    return ['ranking', 'id', 'teams', 'average', 'sum', 'sd']
  }
  if (teamHasScores.value) {
    return ['ranking', 'id', 'institutions', 'win', 'average', 'sum', 'margin', 'vote', 'sd']
  }
  return ['ranking', 'id', 'institutions', 'win']
})

const scoreKey = computed(() => {
  if (activeLabel.value === 'adjudicators') return 'score'
  if (activeLabel.value === 'speakers') return 'average'
  const hasSum = activeResults.value.some((result) =>
    result.details?.some((detail: any) => typeof detail.sum === 'number')
  )
  return hasSum ? 'sum' : 'win'
})

const isStandardLabel = computed(() =>
  ['teams', 'speakers', 'adjudicators'].includes(activeLabel.value)
)

const poiResults = computed(() => buildSubPrizeResults('poi'))
const bestResults = computed(() => buildSubPrizeResults('best'))

function entityName(id: string) {
  return entities.value[id] ?? id
}

function teamName(id: string) {
  return teams.teams.find((team) => team._id === id)?.name ?? id
}

function adjudicatorName(id: string) {
  return adjudicators.adjudicators.find((adj) => adj._id === id)?.name ?? id
}

function speakerName(id: string) {
  return speakers.speakers.find((speaker) => speaker._id === id)?.name ?? id
}

function roundName(r: number) {
  return (
    rounds.rounds.find((round) => round.round === r)?.name ??
    sortedRounds.value.find((round: RoundSummary) => round.round === r)?.name ??
    t('ラウンド {round}', { round: r })
  )
}

function formatCompiledTimestamp(value?: string) {
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

function baselineCompiledOptionLabel(option: BaselineCompiledOption) {
  const roundLabel =
    option.roundNames.length > 0
      ? option.roundNames.join(', ')
      : option.rounds.length > 0
        ? option.rounds.map((roundNumber) => roundName(roundNumber)).join(', ')
        : t('全ラウンド')
  return `${t('集計ラウンド')}: ${roundLabel} (${formatCompiledTimestamp(option.createdAt)})`
}

function applyCompileDefaultsFromTournament() {
  if (!tournamentId.value) return
  const tournament = tournamentStore.tournaments.find((item) => item._id === tournamentId.value)
  if (!tournament) return
  const normalizedDefaults = normalizeRoundDefaults(tournament.user_defined_data?.round_defaults)
  const compileDefaults = normalizedDefaults.compile
  const normalizedOptions = normalizeCompileOptions(compileDefaults.options, compileDefaults.options)
  compileSource.value = compileDefaults.source === 'raw' ? 'raw' : 'submissions'
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
  const availableRounds = new Set(sortedRounds.value.map((round) => Number(round.round)))
  compileRounds.value = compileDefaults.source_rounds.filter((roundNumber) => availableRounds.has(roundNumber))
  compileDiffBaselineSelection.value = 'latest'
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

function applyCompiledSnapshot(compiledId: string) {
  const targetId = String(compiledId).trim()
  if (!targetId) return
  const matched = compiledHistory.value.find((item) => resolveCompiledDocId(item) === targetId)
  if (!matched) return
  const normalized = normalizeCompiledDoc(matched)
  if (!normalized) return
  compiledStore.compiled = normalized
  compileExecuted.value = true
}

const drawByRound = computed(() => {
  const map = new Map<number, any>()
  draws.draws.forEach((draw) => {
    map.set(Number(draw.round), draw)
  })
  return map
})

const submissionsByRound = computed(() => {
  const map = new Map<number, any[]>()
  submissions.submissions.forEach((item) => {
    const round = Number(item.round)
    const list = map.get(round) ?? []
    list.push(item)
    map.set(round, list)
  })
  return map
})

const roundConfigByRound = computed(() => {
  const map = new Map<number, any>()
  rounds.rounds.forEach((round) => {
    map.set(Number(round.round), round)
  })
  return map
})
const summaryTargetRounds = computed(() => {
  const baseRounds =
    compileRounds.value.length > 0
      ? compileRounds.value
      : sortedRounds.value.map((round) => Number(round.round))
  return Array.from(new Set(baseRounds.map((round) => Number(round))))
    .filter((round) => Number.isFinite(round))
    .sort((a, b) => a - b)
})

function expectedIdsForRound(r: number) {
  const draw = drawByRound.value.get(r)
  const expectedAdjudicators = new Set<string>()
  const expectedTeams = new Set<string>()
  draw?.allocation?.forEach((row: any) => {
    if (row?.teams?.gov) expectedTeams.add(String(row.teams.gov))
    if (row?.teams?.opp) expectedTeams.add(String(row.teams.opp))
    ;(row?.chairs ?? []).forEach((id: string) => expectedAdjudicators.add(String(id)))
    ;(row?.panels ?? []).forEach((id: string) => expectedAdjudicators.add(String(id)))
    ;(row?.trainees ?? []).forEach((id: string) => expectedAdjudicators.add(String(id)))
  })
  return { expectedAdjudicators, expectedTeams }
}

function speakerIdsForTeamRound(teamId: string, r: number) {
  const team = teams.teams.find((item) => item._id === teamId)
  if (!team) return []
  const detail = team.details?.find((d: any) => Number(d.r) === Number(r))
  const detailSpeakers = (detail?.speakers ?? []).map((id: any) => String(id)).filter(Boolean)
  if (detailSpeakers.length > 0) return detailSpeakers
  if (Array.isArray(team.speakers)) {
    return team.speakers
      .map((speaker: any) => {
        const name = speaker?.name
        if (!name) return ''
        return speakers.speakers.find((item) => item.name === name)?._id ?? ''
      })
      .filter(Boolean)
  }
  return []
}

function expectedSpeakerIdsForRound(r: number) {
  const { expectedTeams } = expectedIdsForRound(r)
  const set = new Set<string>()
  expectedTeams.forEach((teamId) => {
    speakerIdsForTeamRound(teamId, r).forEach((id) => set.add(id))
  })
  return set
}

function ballotSubmittedIds(r: number) {
  const list = submissionsByRound.value.get(r) ?? []
  const set = new Set<string>()
  list
    .filter((item) => item.type === 'ballot')
    .forEach((item: any) => {
      const id = item.payload?.submittedEntityId
      if (id) set.add(String(id))
    })
  return set
}

function feedbackSubmittedIds(r: number) {
  const list = submissionsByRound.value.get(r) ?? []
  const set = new Set<string>()
  list
    .filter((item) => item.type === 'feedback')
    .forEach((item: any) => {
      const id = item.payload?.submittedEntityId
      if (id) set.add(String(id))
    })
  return set
}

function unknownCountsByRound(r: number) {
  const list = submissionsByRound.value.get(r) ?? []
  const ballot = list.filter(
    (item: any) => item.type === 'ballot' && !(item.payload as any)?.submittedEntityId
  ).length
  const feedback = list.filter(
    (item: any) => item.type === 'feedback' && !(item.payload as any)?.submittedEntityId
  ).length
  return { ballot, feedback }
}

function missingBallotByRound(r: number) {
  const { expectedAdjudicators } = expectedIdsForRound(r)
  const submitted = ballotSubmittedIds(r)
  return Array.from(expectedAdjudicators).filter((id) => !submitted.has(id))
}

function missingFeedbackTeamsByRound(r: number) {
  const config = roundConfigByRound.value.get(r)
  if (config?.userDefinedData?.evaluate_from_teams === false) return []
  const submitted = feedbackSubmittedIds(r)
  if (config?.userDefinedData?.evaluator_in_team === 'speaker') {
    return Array.from(expectedSpeakerIdsForRound(r))
      .filter((id) => !submitted.has(id))
      .map((id) => ({ id, name: speakerName(id) }))
  }
  const { expectedTeams } = expectedIdsForRound(r)
  return Array.from(expectedTeams)
    .filter((id) => !submitted.has(id))
    .map((id) => ({ id, name: teamName(id) }))
}

function missingFeedbackAdjudicatorsByRound(r: number) {
  const config = roundConfigByRound.value.get(r)
  if (config?.userDefinedData?.evaluate_from_adjudicators === false) return []
  const { expectedAdjudicators } = expectedIdsForRound(r)
  const submitted = feedbackSubmittedIds(r)
  return Array.from(expectedAdjudicators).filter((id) => !submitted.has(id))
}

function feedbackTeamLabel(r: number) {
  const config = roundConfigByRound.value.get(r)
  return config?.userDefinedData?.evaluator_in_team === 'speaker' ? t('スピーカー') : t('チーム')
}

function duplicateSubmitterCountByRound(r: number, type: 'ballot' | 'feedback') {
  const list = submissionsByRound.value.get(r) ?? []
  const counter = new Map<string, number>()
  list
    .filter((item: any) => item.type === type)
    .forEach((item: any) => {
      const submittedEntityId = String(item?.payload?.submittedEntityId ?? '').trim()
      if (!submittedEntityId) return
      counter.set(submittedEntityId, (counter.get(submittedEntityId) ?? 0) + 1)
    })
  return Array.from(counter.values()).reduce((acc, count) => acc + Math.max(0, count - 1), 0)
}

function expectedFeedbackIdsForRound(r: number) {
  const config = roundConfigByRound.value.get(r)
  const set = new Set<string>()
  if (config?.userDefinedData?.evaluate_from_teams !== false) {
    if (config?.userDefinedData?.evaluator_in_team === 'speaker') {
      expectedSpeakerIdsForRound(r).forEach((id) => set.add(id))
    } else {
      expectedIdsForRound(r).expectedTeams.forEach((id) => set.add(id))
    }
  }
  if (config?.userDefinedData?.evaluate_from_adjudicators !== false) {
    expectedIdsForRound(r).expectedAdjudicators.forEach((id) => set.add(id))
  }
  return set
}

type RoundSubmissionSummary = {
  round: number
  ballot: {
    expected: number
    submitted: number
    missing: number
    duplicates: number
    unknown: number
  }
  feedback: {
    expected: number
    submitted: number
    missing: number
    duplicates: number
    unknown: number
  }
}

const roundSubmissionSummaries = computed<RoundSubmissionSummary[]>(() =>
  summaryTargetRounds.value.map((round) => {
    const { expectedAdjudicators } = expectedIdsForRound(round)
    const submittedBallot = ballotSubmittedIds(round)
    const unknown = unknownCountsByRound(round)
    const expectedFeedback = expectedFeedbackIdsForRound(round)
    const submittedFeedback = feedbackSubmittedIds(round)
    return {
      round,
      ballot: {
        expected: expectedAdjudicators.size,
        submitted: submittedBallot.size,
        missing: Math.max(0, expectedAdjudicators.size - submittedBallot.size),
        duplicates: duplicateSubmitterCountByRound(round, 'ballot'),
        unknown: unknown.ballot,
      },
      feedback: {
        expected: expectedFeedback.size,
        submitted: submittedFeedback.size,
        missing: Math.max(0, expectedFeedback.size - submittedFeedback.size),
        duplicates: duplicateSubmitterCountByRound(round, 'feedback'),
        unknown: unknown.feedback,
      },
    }
  })
)

const commentSheetRows = computed(() =>
  buildCommentSheetRows(submissions.submissions, {
    resolveRoundName: (round) => roundName(round),
    resolveTeamName: (id) => teamName(id),
    resolveAdjudicatorName: (id) => adjudicatorName(id),
    resolveEntityName: (id) => entityName(id),
  })
)

function summarizeSubmissionCell(
  summary: RoundSubmissionSummary,
  kind: 'ballot' | 'feedback'
) {
  const value = summary[kind]
  return t('提出 {submitted}/{expected} | 未提出 {missing} | 重複 {duplicates} | 不明 {unknown}', {
    submitted: value.submitted,
    expected: value.expected,
    missing: value.missing,
    duplicates: value.duplicates,
    unknown: value.unknown,
  })
}

function formatValue(value: unknown) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—'
    const rounded = Math.round(value * 1000) / 1000
    return String(rounded)
  }
  if (Array.isArray(value)) {
    if (value.length <= 3) return value.join(', ')
    return t('{count} 件', { count: value.length })
  }
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function formatList(value: unknown) {
  if (!Array.isArray(value)) return formatValue(value)
  const items = value.map((item) => String(item)).filter((item) => item !== '')
  if (items.length === 0) return '—'
  if (items.length <= 5) return items.join(', ')
  return `${items.slice(0, 5).join(', ')} (+${items.length - 5})`
}

function optionHelp(key: string) {
  const map: Record<string, string> = {
    source: t('提出データは提出フォームの内容を集計します。生結果データは「生結果編集」で手修正した値をそのまま使います。'),
    rounds: t('ここで選んだラウンドだけを集計します。未選択なら全ラウンドです。'),
    ranking: t('順位が同点のときにどの指標を先に比較するかを決めます。'),
    winner: t('Ballotの winnerId とスコアのどちらを優先して勝敗を判定するかを決めます。'),
    tie: t('引き分けを許可する設定のときに、各チームへ与える勝敗点です。'),
    merge: t('同じ提出者から複数提出がある場合の扱いです。'),
    poi: t('POIの重複値を平均か最大でまとめます。'),
    best: t('Best Speakerの重複値を平均か最大でまとめます。'),
    missing: t('必要データが欠けていた場合に、警告で続行するか、除外するか、エラー停止するかを選びます。'),
    include: t('生成するランキングの種類を選びます。'),
    diff: t('差分比較の基準です。最新集計、または具体的な過去集計を選んで比較できます。'),
  }
  return map[key] ?? ''
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

function resultSortValue(row: any, key: string): number | string {
  if (key === 'id') return entityName(String(row?.id ?? ''))
  if (key === 'comments' || key === 'judged_teams') return formatList(row?.[key])
  if (key === 'institutions' || key === 'teams') {
    if (Array.isArray(row?.[key])) return row[key].map((item: any) => String(item)).join(', ')
    return String(row?.[key] ?? '')
  }
  const numeric = toFiniteNumber(row?.[key])
  if (numeric !== null) return numeric
  return String(row?.[key] ?? '')
}

function setResultSort(key: string) {
  if (resultSortKey.value === key) {
    resultSortDirection.value = resultSortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }
  resultSortKey.value = key
  resultSortDirection.value = key === 'ranking' ? 'asc' : 'desc'
}

function resultSortIndicator(key: string) {
  if (resultSortKey.value !== key) return '↕'
  return resultSortDirection.value === 'asc' ? '↑' : '↓'
}

function formatCsvValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (Array.isArray(value)) return value.map((item) => String(item)).join(',')
  if (value === null || value === undefined || value === '') return ''
  return String(value)
}

function columnLabel(key: string) {
  const map: Record<string, string> = {
    ranking: t('順位'),
    id: t('名前'),
    institutions: t('所属機関'),
    win: t('勝利数'),
    average: t('平均'),
    sum: t('合計'),
    margin: t('マージン'),
    vote: t('票'),
    sd: t('標準偏差'),
    num_experienced: t('担当数'),
    num_experienced_chair: t('チェア担当'),
    comments: t('コメント'),
    teams: t('チーム'),
    poi: t('POI'),
    best: t('ベストスピーカー'),
  }
  return map[key] ?? key
}

function escapeCsv(value: string) {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function ordinal(value: number) {
  if (!Number.isFinite(value)) return ''
  const v = Math.round(value)
  if (locale.value === 'ja') return `${v}位`
  const mod10 = v % 10
  const mod100 = v % 100
  if (mod10 === 1 && mod100 !== 11) return `${v}st`
  if (mod10 === 2 && mod100 !== 12) return `${v}nd`
  if (mod10 === 3 && mod100 !== 13) return `${v}rd`
  return `${v}th`
}

function formatTimesCount(value: number) {
  const rounded = Math.round(value * 1000) / 1000
  if (locale.value === 'ja') return `${rounded}回`
  return `${rounded} times`
}

function labelDisplay(label: string) {
  const map: Record<string, string> = {
    teams: t('チーム'),
    speakers: t('スピーカー'),
    adjudicators: t('ジャッジ'),
    poi: t('POI'),
    best: t('ベストスピーカー'),
  }
  return map[label] ?? label
}

function setActiveLabel(label: string) {
  if (!['teams', 'speakers', 'adjudicators', 'poi', 'best'].includes(label)) return
  activeLabel.value = label as 'teams' | 'speakers' | 'adjudicators' | 'poi' | 'best'
}

function downloadCommentSheetCsv() {
  if (commentSheetRows.value.length === 0) return
  const labels: CommentSheetCsvLabels = {
    round: t('ラウンド'),
    round_name: t('ラウンド名'),
    submission_type: t('提出種別'),
    submitted_entity_id: t('提出者ID'),
    submitted_entity_name: t('提出者'),
    matchup: t('対戦'),
    winner: t('勝者'),
    adjudicator: t('対象ジャッジ'),
    score: t('スコア'),
    role: t('ロール'),
    comment: t('コメント'),
    created_at: t('作成日時'),
    updated_at: t('更新日時'),
  }
  const csv = buildCommentSheetCsv(commentSheetRows.value, labels)
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'comment_sheet.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function downloadAwardCsv() {
  if (awardExportRows.value.length === 0) return
  const csv = buildAwardExportCsv(awardExportRows.value)
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'awardees.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function downloadParticipantCsv() {
  if (participantExportRows.value.length === 0) return
  const csv = buildParticipantExportCsv(participantExportRows.value)
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'participants.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function downloadCsv() {
  if (activeResults.value.length === 0) return
  const label = activeLabel.value
  let headerLabels: string[] = []
  let headerKeys: string[] = []

  if (label === 'teams') {
    headerLabels = [
      t('順位'),
      t('順位(序数)'),
      t('名前'),
      t('勝利数'),
      t('合計'),
      t('マージン'),
      t('票'),
      t('標準偏差'),
    ]
    headerKeys = ['ranking', 'place', 'name', 'win', 'sum', 'margin', 'vote', 'sd']
  } else if (label === 'speakers') {
    headerLabels = [
      t('順位'),
      t('順位(序数)'),
      t('名前'),
      t('チーム'),
      t('平均'),
      t('合計'),
      t('標準偏差'),
    ]
    headerKeys = ['ranking', 'place', 'name', 'team_name', 'average', 'sum', 'sd']
  } else if (label === 'adjudicators') {
    headerLabels = [t('順位'), t('順位(序数)'), t('名前'), t('平均'), t('標準偏差')]
    headerKeys = ['ranking', 'place', 'name', 'average', 'sd']
  } else if (label === 'poi' || label === 'best') {
    headerLabels = [
      t('順位'),
      t('順位(序数)'),
      t('名前'),
      t('チーム'),
      label === 'poi' ? t('POI合計') : t('ベストスピーカー合計'),
    ]
    headerKeys = ['ranking', 'place', 'name', 'team_name', label]
  } else {
    headerLabels = tableColumns.value
    headerKeys = tableColumns.value
  }

  const rows = activeResults.value
    .slice()
    .sort((a, b) => (a.ranking ?? 0) - (b.ranking ?? 0))
    .map((row) => {
      const enriched: Record<string, any> = { ...row }
      enriched.name = entityName(row.id)
      enriched.place = ordinal(Number(row.ranking))
      if (label === 'speakers' || label === 'poi' || label === 'best') {
        const teamsValue = Array.isArray(row.teams) ? row.teams.join(',') : row.teams
        enriched.team_name = teamsValue ?? ''
      }
      return headerKeys.map((key) => {
        const value = key === 'name' ? enriched.name : enriched[key]
        const formatted = formatCsvValue(value)
        return escapeCsv(String(formatted))
      })
    })

  const csv = [headerLabels.join(','), ...rows.map((row) => row.join(','))].join('\n')
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  if (label === 'teams') link.download = 'team_results.csv'
  else if (label === 'speakers') link.download = 'speaker_results.csv'
  else if (label === 'adjudicators') link.download = 'adjudicator_results.csv'
  else if (label === 'poi') link.download = 'poi_results.csv'
  else if (label === 'best') link.download = 'best_speaker_results.csv'
  else link.download = `compiled-${activeLabel.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

async function copyAwardText() {
  const text = awardCopyText.value
  if (!text) return
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
  } else {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
  awardCopyCopied.value = true
  window.setTimeout(() => {
    awardCopyCopied.value = false
  }, 2000)
}

async function refresh() {
  if (!tournamentId.value) return
  await Promise.all([
    compiledStore.fetchLatest(tournamentId.value),
    tournamentStore.fetchTournaments(),
    teams.fetchTeams(tournamentId.value),
    adjudicators.fetchAdjudicators(tournamentId.value),
    rounds.fetchRounds(tournamentId.value),
    speakers.fetchSpeakers(tournamentId.value),
    institutions.fetchInstitutions(tournamentId.value),
    draws.fetchDraws(tournamentId.value),
    submissions.fetchSubmissions({ tournamentId: tournamentId.value }),
  ])
  if (!compileDefaultsHydrated.value) {
    applyCompileDefaultsFromTournament()
    compileDefaultsHydrated.value = true
  }
  await refreshCompiledHistory()
  const currentCompiledId = String(compiledStore.compiled?._id ?? '').trim()
  if (currentCompiledId) {
    selectedCompiledId.value = currentCompiledId
  } else if (baselineCompiledOptions.value.length > 0) {
    selectedCompiledId.value = baselineCompiledOptions.value[0].compiledId
    applyCompiledSnapshot(selectedCompiledId.value)
  } else {
    selectedCompiledId.value = ''
  }
  compileExecuted.value = Boolean(compiledStore.compiled)
}

function closeRawCompileConfirm() {
  rawCompileConfirmOpen.value = false
}

async function executeCompile() {
  if (!tournamentId.value) return
  if (!canRunCompile.value) return
  const roundsPayload = compileRounds.value.length > 0 ? compileRounds.value : undefined
  const compiledResult = await compiledStore.runCompile(tournamentId.value, {
    source: compileSource.value,
    rounds: roundsPayload,
    options: compileOptionsPayload.value,
  })
  if (compiledResult) {
    compileExecuted.value = true
  }
  await Promise.all([
    teams.fetchTeams(tournamentId.value),
    adjudicators.fetchAdjudicators(tournamentId.value),
    rounds.fetchRounds(tournamentId.value),
    speakers.fetchSpeakers(tournamentId.value),
    institutions.fetchInstitutions(tournamentId.value),
    draws.fetchDraws(tournamentId.value),
    submissions.fetchSubmissions({ tournamentId: tournamentId.value }),
  ])
  await refreshCompiledHistory()
  const latestCompiledId = String(compiledStore.compiled?._id ?? '').trim()
  if (latestCompiledId) {
    selectedCompiledId.value = latestCompiledId
  }
}

async function runCompile() {
  if (!tournamentId.value || !canRunCompile.value) return
  if (isRawSourceSelected.value) {
    rawCompileConfirmOpen.value = true
    return
  }
  await executeCompile()
}

async function confirmRawCompile() {
  closeRawCompileConfirm()
  await executeCompile()
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

onMounted(() => {
  refresh()
})

watch(availableLabels, (labels) => {
  if (!labels.includes(activeLabel.value)) {
    activeLabel.value = (labels[0] ?? 'teams') as
      | 'teams'
      | 'speakers'
      | 'adjudicators'
      | 'poi'
      | 'best'
  }
})

watch(
  tableColumns,
  (columns) => {
    if (!columns.includes(resultSortKey.value)) {
      resultSortKey.value = columns.includes('ranking') ? 'ranking' : columns[0] ?? 'ranking'
      resultSortDirection.value = resultSortKey.value === 'ranking' ? 'asc' : 'desc'
    }
  },
  { immediate: true }
)

watch(
  selectedCompiledId,
  (nextId) => {
    if (!nextId) return
    applyCompiledSnapshot(nextId)
  }
)

watch(
  baselineCompiledOptions,
  (options) => {
    if (options.length === 0) {
      selectedCompiledId.value = ''
      return
    }
    const exists = options.some((option) => option.compiledId === selectedCompiledId.value)
    if (!exists) {
      selectedCompiledId.value = options[0].compiledId
    }
  },
  { immediate: true }
)

watch(
  baselineCompiledOptions,
  (options) => {
    if (compileDiffBaselineSelection.value === 'latest') return
    const current = String(compileDiffBaselineSelection.value).trim()
    if (!current) {
      compileDiffBaselineSelection.value = 'latest'
      return
    }
    if (options.length === 0) {
      compileDiffBaselineSelection.value = 'latest'
      return
    }
    const exists = options.some((option) => option.compiledId === current)
    if (!exists) {
      compileDiffBaselineSelection.value = 'latest'
    }
  },
  { immediate: true }
)

watch(tournamentId, () => {
  compileExecuted.value = false
  compileDefaultsHydrated.value = false
  refresh()
})

function buildSubPrizeResults(kind: 'poi' | 'best') {
  if (!compiled.value) return []
  if (!isCompileLabelEnabled(kind)) return []
  const base = compiled.value.compiled_speaker_results ?? []
  const aggregation =
    kind === 'poi'
      ? compiled.value.compile_options?.duplicate_normalization?.poi_aggregation
      : compiled.value.compile_options?.duplicate_normalization?.best_aggregation
  const results = base.map((result: any) => {
    let total = 0
    const details = result.details ?? []
    for (const detail of details) {
      const collection = detail.user_defined_data_collection ?? []
      if (!Array.isArray(collection) || collection.length === 0) continue
      const counts = collection.map((ud: any) => {
        const list = Array.isArray(ud?.[kind]) ? ud[kind] : []
        return list.filter((item: any) => item?.value).length
      })
      if (counts.length > 0) {
        if (aggregation === 'max') {
          total += Math.max(...counts)
        } else {
          total += counts.reduce((a: number, b: number) => a + b, 0) / counts.length
        }
      }
    }
    return { ...result, [kind]: total }
  })
  results.sort((a: any, b: any) => (b[kind] ?? 0) - (a[kind] ?? 0))
  let rank = 0
  let prevValue: number | null = null
  let stay = 0
  results.forEach((item: any) => {
    const value = item[kind] ?? 0
    if (prevValue === null || value !== prevValue) {
      rank += stay + 1
      stay = 0
      prevValue = value
    } else {
      stay += 1
    }
    item.ranking = rank
  })
  return results
}
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
  width: min(560px, 100%);
  max-height: calc(100vh - 80px);
  overflow: auto;
}

.modal-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.section-header {
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.page-title {
  margin: 0;
  color: var(--color-text);
  font-size: clamp(1.55rem, 1.9vw, 1.92rem);
  line-height: 1.2;
  letter-spacing: 0.01em;
  font-weight: 750;
}

.header-reload {
  margin-left: var(--space-2);
}

.warning {
  color: var(--color-warn);
}

.grow {
  flex: 1;
}

.compile-card {
  gap: var(--space-3);
}

.snapshot-selector-row {
  align-items: flex-end;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.recompute-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface);
}

.compile-grid {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: var(--space-3);
}

.compile-field {
  gap: var(--space-2);
}

.source-primary-row {
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.source-help {
  margin: 0;
}

.source-advanced-toggle {
  justify-content: flex-start;
}

.raw-source-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid #f59e0b;
  background: #fffbeb;
  color: #92400e;
  font-size: 0.75rem;
  font-weight: 700;
}

.compile-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.compile-field-wide {
  grid-column: 1 / -1;
}

.compile-summary {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface-muted);
  gap: var(--space-2);
}

.compile-summary-list {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
  color: var(--color-text);
}

.submission-summary {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface);
}

.submission-link {
  color: var(--color-primary);
  text-decoration: none;
  font-size: 0.85rem;
}

.submission-summary-header {
  align-items: center;
  gap: var(--space-2);
}

.submission-summary-actions {
  margin-left: auto;
  align-items: center;
  gap: var(--space-2);
}

.submission-link:hover {
  text-decoration: underline;
}

.compile-warning-list {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface-muted);
}

.migration-guide {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  gap: var(--space-2);
}

.migration-guide-list {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 4px;
}

.migration-guide-actions {
  gap: var(--space-2);
  flex-wrap: wrap;
}

.migration-guide-link {
  color: var(--color-primary);
  text-decoration: none;
  font-size: 0.85rem;
}

.migration-guide-link:hover {
  text-decoration: underline;
}

.raw-source-notice {
  margin: 0;
}

.compile-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.report-modal {
  gap: var(--space-3);
}

.recompute-modal {
  width: min(980px, 100%);
}

.report-modal-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.pill-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 6px 10px;
  background: var(--color-surface);
  font-size: 14px;
}

.pill input {
  margin: 0;
}

.ranking-priority-list {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-surface-muted);
}

.ranking-priority-item {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.label-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.compile-category-inline {
  gap: var(--space-2);
}

.compile-category-row {
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.compile-diff-controls {
  align-items: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.compile-diff-field {
  min-width: 180px;
  gap: 4px;
}

.compile-diff-field-wide {
  min-width: min(460px, 100%);
}

.result-list-head {
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.result-list-actions {
  align-items: flex-end;
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.section-download-row {
  justify-content: flex-end;
}

.section-download-button {
  width: 100%;
  justify-content: center;
}

.diff-legend {
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.diff-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-muted);
}

.diff-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.diff-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  font-size: 12px;
  font-weight: 700;
}

.diff-improved {
  color: var(--color-success);
}

.diff-worsened {
  color: var(--color-danger);
}

.diff-unchanged,
.diff-na {
  color: var(--color-muted);
}

.diff-new {
  color: var(--color-primary);
}

.diff-delta {
  font-size: 12px;
}

.label-tab {
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

.label-tab:hover {
  border-color: #bfdbfe;
  color: var(--color-primary);
}

.label-tab.active {
  background: var(--color-secondary);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

@media (max-width: 900px) {
  .compile-grid {
    grid-template-columns: 1fr;
  }
}

.wrap {
  flex-wrap: wrap;
}

.award-copy-toolbar {
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.award-copy-controls {
  gap: var(--space-2);
  align-items: flex-end;
  flex-wrap: wrap;
}

.award-copy-limit {
  min-width: 120px;
}

.award-copy-text {
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
  white-space: pre-wrap;
  line-height: 1.65;
  max-height: 360px;
  overflow: auto;
}

textarea {
  width: 100%;
}
</style>
