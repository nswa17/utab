<template>
  <section class="stack">
    <div class="row section-header">
      <h3>{{ $t('ラウンド運営ハブ') }}</h3>
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

          <section v-if="activeTask === 'draw'" class="card soft stack step-card">
            <div class="row step-title-row">
              <strong>1. {{ $t('対戦生成') }}</strong>
            </div>
            <p class="muted small">
              {{ $t('対象ラウンド: {round}', { round: selectedRound }) }}
            </p>
            <p v-if="drawDependencyWarning" class="muted warning">
              {{ drawDependencyWarning }}
            </p>
            <p class="muted small">
              {{ $t('対戦生成と保存は対戦表設定で実行します。') }}
            </p>
            <iframe
              v-if="allocationEmbedUrl"
              class="step-inline-frame"
              :src="allocationEmbedUrl"
              :title="$t('対戦表設定')"
              loading="lazy"
            />
          </section>

          <section v-else-if="activeTask === 'publish'" class="card soft stack step-card">
            <div class="row step-title-row">
              <strong>2. {{ $t('公開/ロック') }}</strong>
            </div>
            <p v-if="!selectedRoundHasDraw" class="muted small">{{ $t('まず対戦表を生成してください。') }}</p>
            <template v-else>
              <div class="publish-switch-grid">
                <label class="publish-switch-card">
                  <span class="publish-switch-label">{{ $t('ドロー公開') }}</span>
                  <span class="toggle-switch">
                    <input
                      type="checkbox"
                      :checked="drawPublishDraft.drawOpened"
                      :disabled="isLoading || publicationSaving"
                      @change="onPublishToggle('drawOpened', $event)"
                    />
                    <span class="toggle-slider"></span>
                  </span>
                </label>
                <label class="publish-switch-card">
                  <span class="publish-switch-label">{{ $t('割り当て公開') }}</span>
                  <span class="toggle-switch">
                    <input
                      type="checkbox"
                      :checked="drawPublishDraft.allocationOpened"
                      :disabled="isLoading || publicationSaving"
                      @change="onPublishToggle('allocationOpened', $event)"
                    />
                    <span class="toggle-slider"></span>
                  </span>
                </label>
                <label class="publish-switch-card">
                  <span class="publish-switch-label">{{ $t('ドローをロック') }}</span>
                  <span class="toggle-switch">
                    <input
                      type="checkbox"
                      :checked="drawPublishDraft.locked"
                      :disabled="isLoading || publicationSaving"
                      @change="onPublishToggle('locked', $event)"
                    />
                    <span class="toggle-slider"></span>
                  </span>
                </label>
              </div>
              <span v-if="publishMessage" class="muted small">{{ publishMessage }}</span>
              <iframe
                v-if="rawResultEmbedUrl"
                class="step-inline-frame"
                :src="rawResultEmbedUrl"
                :title="$t('生結果')"
                loading="lazy"
              />
            </template>
          </section>

          <section v-else-if="activeTask === 'submissions'" class="card soft stack step-card">
            <div class="row step-title-row">
              <strong>3. {{ $t('提出状況') }}</strong>
            </div>
            <div class="grid stat-grid">
              <div class="stat">
                <span class="muted small">{{ $t('スコアシート') }}</span>
                <strong>{{ ballotSubmittedCount(selectedRound) }} / {{ ballotExpectedCount(selectedRound) }}</strong>
              </div>
              <div class="stat">
                <span class="muted small">{{ $t('フィードバック') }}</span>
                <strong>{{ feedbackSubmittedCount(selectedRound) }} / {{ feedbackExpectedCount(selectedRound) }}</strong>
              </div>
            </div>
            <p v-if="selectedRoundBallotGapWarning" class="muted warning">
              {{ selectedRoundBallotGapWarning }}
            </p>
            <p v-if="selectedRoundUnknownBallotWarning" class="muted warning">
              {{ selectedRoundUnknownBallotWarning }}
            </p>
            <iframe
              v-if="submissionsEmbedUrl"
              class="step-inline-frame step-inline-frame-submissions"
              :src="submissionsEmbedUrl"
              :title="$t('提出一覧')"
              loading="lazy"
            />
          </section>

          <section v-else class="card soft stack step-card">
            <div class="row step-title-row">
              <strong>4. {{ $t('集計設定') }}</strong>
            </div>
            <p class="muted small">
              {{ $t('選択したラウンドを提出データで集計します。') }}
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
            <p v-if="selectedRoundBallotGapWarning" class="muted warning">
              {{ selectedRoundBallotGapWarning }}
            </p>
            <p v-if="selectedRoundUnknownBallotWarning" class="muted warning">
              {{ selectedRoundUnknownBallotWarning }}
            </p>
            <div class="row compile-diff-controls">
              <label class="stack compile-diff-field">
                <span class="muted small">{{ $t('差分比較') }}</span>
                <select v-model="compileDiffBaselineMode">
                  <option value="latest">{{ $t('最新集計') }}</option>
                  <option value="compiled">{{ $t('過去の集計結果を選択') }}</option>
                </select>
              </label>
              <label v-if="compileDiffBaselineMode === 'compiled'" class="stack compile-diff-field wide">
                <span class="muted small">{{ $t('比較対象') }}</span>
                <select v-model="compileDiffBaselineCompiledId">
                  <option value="">{{ $t('選択してください') }}</option>
                  <option
                    v-for="option in baselineCompiledOptions"
                    :key="option.compiledId"
                    :value="option.compiledId"
                  >
                    {{ baselineCompiledOptionLabel(option) }}
                  </option>
                </select>
              </label>
            </div>
            <p v-if="compileDiffBaselineMode === 'compiled' && !compileDiffBaselineCompiledId.trim()" class="muted warning">
              {{ $t('過去の集計結果を選ぶ場合は比較対象を選択してください。') }}
            </p>
            <div class="row step-actions">
              <Button
                size="sm"
                :disabled="isLoading || effectiveCompileTargetRounds.length === 0 || !selectedRoundPublished || shouldBlockSubmissionCompile || !canRunCompile"
                @click="runCompileWithSource('submissions')"
              >
                {{ $t('集計を実行') }}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                :disabled="isLoading || effectiveCompileTargetRounds.length === 0 || !selectedRoundPublished || !canRunCompile"
                @click="openForceCompileModal"
              >
                {{ $t('強制実行') }}
              </Button>
              <span v-if="compileMessage" class="muted small">{{ compileMessage }}</span>
            </div>
            <section v-if="compileRows.length > 0" class="card soft stack compile-result-panel">
              <div class="row compile-result-head">
                <strong>{{ $t('集計レポート') }}</strong>
                <span class="muted small">{{ $t('差分基準: {baseline}', { baseline: compileDiffBaselineLabel }) }}</span>
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
                      {{ compileColumnLabel(key) }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in compileRows" :key="String(row?.id ?? '')">
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
          <Button variant="ghost" size="sm" @click="closeForceCompileModal">
            {{ $t('キャンセル') }}
          </Button>
          <Button size="sm" :disabled="isLoading" @click="confirmForcedCompile">
            {{ $t('強制実行する') }}
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
import LoadingState from '@/components/common/LoadingState.vue'
import Table from '@/components/common/Table.vue'
import { useRoundsStore } from '@/stores/rounds'
import { useDrawsStore } from '@/stores/draws'
import { useSubmissionsStore } from '@/stores/submissions'
import { useTeamsStore } from '@/stores/teams'
import { useCompiledStore } from '@/stores/compiled'
import { api } from '@/utils/api'
import { DEFAULT_COMPILE_OPTIONS, type CompileOptions } from '@/types/compiled'
import {
  formatSignedDelta,
  rankingTrendSymbol,
  resolveRankingTrend,
  toFiniteNumber,
} from '@/utils/diff-indicator'
import { countSubmissionActors, resolveRoundOperationStatus, type RoundOperationStatus } from '@/stores/round-operations'

const route = useRoute()
const router = useRouter()
const { t } = useI18n({ useScope: 'global' })

const roundsStore = useRoundsStore()
const drawsStore = useDrawsStore()
const submissionsStore = useSubmissionsStore()
const teamsStore = useTeamsStore()
const compiledStore = useCompiledStore()

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
const compileDiffBaselineMode = ref<'latest' | 'compiled'>('latest')
const compileDiffBaselineCompiledId = ref('')
const compiledHistory = ref<any[]>([])
const selectedCompileRounds = ref<number[]>([])
const forceCompileModalOpen = ref(false)
const publicationSaving = ref(false)
const drawPublishDraft = reactive({
  drawOpened: false,
  allocationOpened: false,
  locked: false,
})

const isLoading = computed(
  () =>
    sectionLoading.value ||
    roundsStore.loading ||
    drawsStore.loading ||
    submissionsStore.loading ||
    teamsStore.loading ||
    compiledStore.loading
)
const loadError = computed(
  () =>
    actionError.value ||
    roundsStore.error ||
    drawsStore.error ||
    submissionsStore.error ||
    teamsStore.error ||
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
const selectedRoundHasDraw = computed(
  () => Boolean(selectedDraw.value && Array.isArray(selectedDraw.value.allocation) && selectedDraw.value.allocation.length > 0)
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
  roundNames: string[]
  createdAt?: string
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
        roundNames: roundsValue
          .map((entry: any) => String(entry?.name ?? '').trim())
          .filter((value: string) => value.length > 0),
        createdAt: item?.createdAt ? String(item.createdAt) : undefined,
      }
    })
    .filter((item) => item.compiledId.length > 0)
)
const canRunCompile = computed(() => {
  if (compileDiffBaselineMode.value !== 'compiled') return true
  return compileDiffBaselineCompiledId.value.trim().length > 0
})
const compileRows = computed<any[]>(() => {
  return Array.isArray(compiledStore.compiled?.compiled_team_results)
    ? compiledStore.compiled!.compiled_team_results
    : []
})
const compileColumns = computed(() => {
  const metricKeys = ['win', 'sum', 'margin', 'vote', 'average', 'sd']
  const visibleMetrics = metricKeys.filter((key) =>
    compileRows.value.some((row) => toFiniteNumber(row?.[key]) !== null)
  )
  return ['ranking', 'team', ...visibleMetrics]
})
const compileDiffMeta = computed<any | null>(() =>
  compiledStore.compiled?.compile_diff_meta && typeof compiledStore.compiled.compile_diff_meta === 'object'
    ? compiledStore.compiled.compile_diff_meta
    : null
)
const compileDiffBaselineLabel = computed(() => {
  const meta = compileDiffMeta.value
  if (!meta || meta.baseline_found !== true) return t('基準なし')
  const baselineId = String(meta.baseline_compiled_id ?? '')
  if (meta.baseline_mode === 'compiled') {
    const selected = baselineCompiledOptions.value.find((item) => item.compiledId === baselineId)
    if (selected) {
      return t('選択した過去集計: {label}', { label: baselineCompiledOptionLabel(selected) })
    }
    return t('選択した過去集計（ID: {id}）', { id: baselineId })
  }
  return t('最新集計（ID: {id}）', { id: baselineId })
})
const allocationEmbedUrl = computed(() => {
  if (selectedRound.value === null) return ''
  return buildEmbedUrl(`/admin-embed/${tournamentId.value}/rounds/${selectedRound.value}/allocation`, {
    embed: '1',
  })
})
const rawResultEmbedUrl = computed(() => {
  if (selectedRound.value === null) return ''
  return buildEmbedUrl(`/admin-embed/${tournamentId.value}/rounds/${selectedRound.value}/result`, {
    embed: '1',
  })
})
const submissionsEmbedUrl = computed(() => {
  if (selectedRound.value === null) return ''
  return buildEmbedUrl(`/admin-embed/${tournamentId.value}/submissions`, {
    context: 'round',
    round: selectedRound.value,
    embed: '1',
  })
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
  return t('未提出のチーム評価があります（提出 {submitted}/{expected}）。提出一覧を確認してください。', {
    submitted: selectedRoundBallotGap.value.submitted,
    expected: selectedRoundBallotGap.value.expected,
  })
})

const selectedRoundUnknownBallotWarning = computed(() => {
  if (selectedRoundBallotGap.value.unknown <= 0) return ''
  return t('提出者情報が不足したチーム評価が {count} 件あります。提出一覧で提出者を補完してください。', {
    count: selectedRoundBallotGap.value.unknown,
  })
})

const previousRoundNumbersForDraw = computed(() => {
  if (selectedRound.value === null) return []
  return sortedRounds.value
    .filter((round) => Number(round.round) < selectedRound.value!)
    .map((round) => Number(round.round))
})
const missingCompiledRoundsForDraw = computed(() =>
  previousRoundNumbersForDraw.value.filter((round) => !compiledSnapshotRoundSet.value.has(round))
)
const drawDependencyWarning = computed(() => {
  if (previousRoundNumbersForDraw.value.length === 0) return ''
  if (missingCompiledRoundsForDraw.value.length === 0) return ''
  return t('対戦生成に必要な前ラウンド集計が不足しています。未集計: {rounds}', {
    rounds: missingCompiledRoundsForDraw.value.join(', '),
  })
})

const shouldBlockSubmissionCompile = computed(() => selectedRoundBallotGap.value.hasGap)
const shouldBlockDrawGeneration = computed(() => missingCompiledRoundsForDraw.value.length > 0)

function roundTaskStates(roundNumber: number): Record<HubTask, HubTaskState> {
  const draw = drawsStore.draws.find((item) => Number(item.round) === roundNumber)
  const hasDraw = Boolean(draw && Array.isArray(draw.allocation) && draw.allocation.length > 0)
  const published = Boolean(draw?.drawOpened && draw?.allocationOpened)
  const previousRounds = sortedRounds.value
    .filter((round) => Number(round.round) < roundNumber)
    .map((round) => Number(round.round))
  const shouldBlockDraw = previousRounds.some((round) => !compiledSnapshotRoundSet.value.has(round))
  const expected = ballotExpectedCount(roundNumber)
  const submitted = ballotSubmittedCount(roundNumber)
  const unknown = unknownSubmissionCount(roundNumber, 'ballot')
  const hasGap = (expected > 0 && submitted < expected) || unknown > 0

  const drawState: HubTaskState = hasDraw ? 'done' : shouldBlockDraw ? 'blocked' : 'ready'
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
      label: t('公開/ロック'),
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
    if (drawDependencyWarning.value) return drawDependencyWarning.value
    if (previousRoundNumbersForDraw.value.length === 0) {
      return t('このラウンドには前提となる集計ラウンドがありません。')
    }
    return t('対戦生成では最新スナップショットを参照します。')
  }
  if (activeTask.value === 'publish' && !selectedRoundHasDraw.value) {
    return t('まず対戦表を生成してください。')
  }
  if (activeTask.value === 'submissions' && !selectedRoundPublished.value) {
    return t('公開後に提出を回収します。先に公開/ロックで公開してください。')
  }
  if (activeTask.value === 'compile') {
    if (!selectedRoundPublished.value) {
      return t('公開後に提出を回収します。先に公開/ロックで公開してください。')
    }
    if (selectedRoundBallotGapWarning.value) return selectedRoundBallotGapWarning.value
    return t('提出回収後に集計を実行します。')
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
  if (nextTask === 'publish') return `2. ${t('公開/ロック')}`
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

function formatCompiledTimestamp(value?: string) {
  if (!value) return t('日時不明')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('日時不明')
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function baselineCompiledOptionLabel(option: BaselineCompiledOption) {
  const roundNames =
    option.roundNames.length > 0
      ? option.roundNames
      : option.rounds.length > 0
        ? option.rounds.map((roundNumber) => roundLabel(roundNumber))
        : [t('全ラウンド')]
  return `${formatCompiledTimestamp(option.createdAt)} / ${roundNames.join(', ')} / ID: ${option.compiledId}`
}

function buildEmbedUrl(path: string, query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    params.set(key, String(value))
  })
  const queryString = params.toString()
  if (!queryString) return path
  return `${path}?${queryString}`
}

function buildCompileOptions(): CompileOptions {
  const diffBaseline =
    compileDiffBaselineMode.value === 'compiled' && compileDiffBaselineCompiledId.value.trim()
      ? { mode: 'compiled' as const, compiled_id: compileDiffBaselineCompiledId.value.trim() }
      : { mode: 'latest' as const }
  return {
    ranking_priority: {
      preset: DEFAULT_COMPILE_OPTIONS.ranking_priority.preset,
      order: [...DEFAULT_COMPILE_OPTIONS.ranking_priority.order],
    },
    winner_policy: DEFAULT_COMPILE_OPTIONS.winner_policy,
    tie_points: DEFAULT_COMPILE_OPTIONS.tie_points,
    duplicate_normalization: {
      merge_policy: DEFAULT_COMPILE_OPTIONS.duplicate_normalization.merge_policy,
      poi_aggregation: DEFAULT_COMPILE_OPTIONS.duplicate_normalization.poi_aggregation,
      best_aggregation: DEFAULT_COMPILE_OPTIONS.duplicate_normalization.best_aggregation,
    },
    missing_data_policy: DEFAULT_COMPILE_OPTIONS.missing_data_policy,
    include_labels: [...DEFAULT_COMPILE_OPTIONS.include_labels],
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

function syncPublishDraft() {
  drawPublishDraft.drawOpened = Boolean(selectedDraw.value?.drawOpened)
  drawPublishDraft.allocationOpened = Boolean(selectedDraw.value?.allocationOpened)
  drawPublishDraft.locked = Boolean(selectedDraw.value?.locked)
}

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
      compiledStore.fetchLatest(tournamentId.value),
      refreshCompiledHistory(),
    ])
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
    syncPublishDraft()
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

async function runCompileWithSource(source: 'submissions' | 'raw') {
  if (selectedRound.value === null || effectiveCompileTargetRounds.value.length === 0) return
  if (!canRunCompile.value) return
  compileMessage.value = ''
  actionError.value = ''
  closeForceCompileModal()
  compileSource.value = source
  if (!selectedRoundPublished.value) {
    actionError.value = t('公開後に提出を回収します。先に公開/ロックで公開してください。')
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
    options: buildCompileOptions(),
  })
  if (!result) {
    actionError.value = compiledStore.error ?? t('集計に失敗しました。')
    return
  }
  compileMessage.value = t('集計が完了しました。')
  await Promise.all([compiledStore.fetchLatest(tournamentId.value), refreshCompiledHistory()])
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
  forceCompileModalOpen.value = true
}

function closeForceCompileModal() {
  forceCompileModalOpen.value = false
}

async function confirmForcedCompile() {
  await runCompileWithSource('raw')
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

async function saveDrawPublication(): Promise<boolean> {
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
      drawOpened: drawPublishDraft.drawOpened,
      allocationOpened: drawPublishDraft.allocationOpened,
      locked: drawPublishDraft.locked,
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

async function onPublishToggle(
  key: 'drawOpened' | 'allocationOpened' | 'locked',
  event: Event
) {
  const target = event.target as HTMLInputElement | null
  if (!target) return
  const previous = drawPublishDraft[key]
  drawPublishDraft[key] = target.checked
  const saved = await saveDrawPublication()
  if (!saved) {
    drawPublishDraft[key] = previous
  }
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

watch(selectedDraw, () => {
  syncPublishDraft()
})

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
  baselineCompiledOptions,
  (options) => {
    if (compileDiffBaselineMode.value !== 'compiled') return
    if (options.length === 0) {
      compileDiffBaselineCompiledId.value = ''
      return
    }
    const exists = options.some((option) => option.compiledId === compileDiffBaselineCompiledId.value)
    if (!exists) {
      compileDiffBaselineCompiledId.value = options[0].compiledId
    }
  },
  { immediate: true }
)

watch(
  compileDiffBaselineMode,
  (mode) => {
    if (mode !== 'compiled') {
      compileDiffBaselineCompiledId.value = ''
      return
    }
    const first = baselineCompiledOptions.value[0]
    if (first && !compileDiffBaselineCompiledId.value) {
      compileDiffBaselineCompiledId.value = first.compiledId
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

.step-inline-frame {
  width: 100%;
  min-height: 580px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.step-inline-frame-submissions {
  min-height: 680px;
}

.compile-diff-controls {
  align-items: flex-end;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.compile-diff-field {
  min-width: 180px;
  gap: 4px;
}

.compile-diff-field.wide {
  flex: 1 1 280px;
}

.compile-result-panel {
  border: 1px solid var(--color-border);
  gap: var(--space-2);
}

.compile-result-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
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

.publish-switch-grid {
  display: grid;
  gap: var(--space-2);
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.publish-switch-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  min-height: 88px;
  padding: var(--space-2);
  display: grid;
  grid-template-rows: auto 1fr;
  align-items: center;
  gap: var(--space-2);
}

.publish-switch-label {
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
  width: 100%;
  text-align: left;
}

.toggle-switch {
  position: relative;
  width: 54px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-self: center;
}

.toggle-switch input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  margin: 0;
}

.toggle-slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: #cbd5e1;
  transition: background 0.2s ease;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  top: 3px;
  left: 3px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.35);
  transition: transform 0.2s ease;
}

.toggle-switch input:checked + .toggle-slider {
  background: var(--color-primary);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(24px);
}

.toggle-switch input:focus-visible + .toggle-slider {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
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

  .step-inline-frame {
    min-height: 440px;
  }

  .step-inline-frame-submissions {
    min-height: 520px;
  }
}
</style>
