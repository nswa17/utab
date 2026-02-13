<template>
  <section class="stack">
    <div class="row section-header">
      <h3>{{ $t('ラウンド運営ハブ') }}</h3>
      <span v-if="lastRefreshedLabel" class="muted small section-meta">{{
        $t('最終更新: {time}', { time: lastRefreshedLabel })
      }}</span>
      <ReloadButton
        class="section-reload"
        @click="refresh"
        :target="$t('ラウンド運営ハブ')"
        :disabled="isLoading"
        :loading="isLoading"
      />
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
            <div class="muted small">
              {{ $t('提出') }}: {{ ballotSubmittedCount(round.round) }} / {{ ballotExpectedCount(round.round) }}
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
                <span class="muted small">{{ task.dependency }}</span>
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
            <div class="row step-actions">
              <Button
                size="sm"
                :disabled="isLoading || shouldBlockDrawGeneration"
                @click="generateRoundDraw"
              >
                {{ $t('このラウンドの対戦を生成') }}
              </Button>
              <span v-if="generateMessage" class="muted small">{{ generateMessage }}</span>
            </div>
            <section class="stack inline-embed">
              <div class="row inline-embed-head">
                <strong>{{ $t('対戦表設定（この画面内）') }}</strong>
              </div>
              <iframe
                class="inline-embed-frame"
                :src="allocationEmbedUrl"
                :title="$t('対戦表設定を開く')"
                loading="lazy"
              />
            </section>
          </section>

          <section v-else-if="activeTask === 'publish'" class="card soft stack step-card">
            <div class="row step-title-row">
              <strong>2. {{ $t('公開/ロック') }}</strong>
            </div>
            <p v-if="!selectedRoundHasDraw" class="muted small">{{ $t('まず対戦表を生成してください。') }}</p>
            <template v-else>
              <div class="publish-switch-grid">
                <label class="publish-switch-card">
                  <span class="muted small">{{ $t('ドロー公開') }}</span>
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
                  <span class="muted small">{{ $t('割り当て公開') }}</span>
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
                  <span class="muted small">{{ $t('ドローをロック') }}</span>
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
              <section class="stack inline-embed">
                <div class="row inline-embed-head">
                  <strong>{{ $t('生結果（この画面内）') }}</strong>
                </div>
                <iframe
                  class="inline-embed-frame"
                  :src="rawResultEmbedUrl"
                  :title="$t('生結果を開く')"
                  loading="lazy"
                />
              </section>
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
            <section class="stack inline-embed">
              <div class="row inline-embed-head">
                <strong>{{ $t('提出一覧（この画面内）') }}</strong>
              </div>
              <iframe
                class="inline-embed-frame"
                :src="submissionsEmbedUrl"
                :title="$t('提出一覧を開く')"
                loading="lazy"
              />
            </section>
          </section>

          <section v-else class="card soft stack step-card">
            <div class="row step-title-row">
              <strong>4. {{ $t('集計設定') }}</strong>
            </div>
            <p class="muted small">
              {{ $t('このラウンドまでを提出データで集計します。') }}
            </p>
            <p class="muted small">
              {{
                $t('集計対象ラウンド: {rounds}', {
                  rounds: compileTargetRoundsLabel || '-',
                })
              }}
            </p>
            <p v-if="selectedRoundBallotGapWarning" class="muted warning">
              {{ selectedRoundBallotGapWarning }}
            </p>
            <p v-if="selectedRoundUnknownBallotWarning" class="muted warning">
              {{ selectedRoundUnknownBallotWarning }}
            </p>
            <div class="row step-actions">
              <Button
                size="sm"
                :disabled="isLoading || compileTargetRounds.length === 0 || !selectedRoundPublished || shouldBlockSubmissionCompile"
                @click="runCompileWithSource('submissions')"
              >
                {{ $t('集計を実行') }}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                :disabled="isLoading || compileTargetRounds.length === 0 || !selectedRoundPublished"
                @click="runForcedCompile"
              >
                {{ $t('強制実行（生結果）') }}
              </Button>
              <span v-if="compileMessage" class="muted small">{{ compileMessage }}</span>
            </div>
            <section class="stack inline-embed">
              <div class="row inline-embed-head">
                <strong>{{ $t('レポート（この画面内）') }}</strong>
              </div>
              <iframe
                class="inline-embed-frame"
                :src="reportsEmbedUrl"
                :title="$t('レポートを開く')"
                loading="lazy"
              />
            </section>
          </section>
        </template>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from '@/components/common/Button.vue'
import ReloadButton from '@/components/common/ReloadButton.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { api } from '@/utils/api'
import { useRoundsStore } from '@/stores/rounds'
import { useDrawsStore } from '@/stores/draws'
import { useSubmissionsStore } from '@/stores/submissions'
import { useTeamsStore } from '@/stores/teams'
import { useCompiledStore } from '@/stores/compiled'
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
const sectionLoading = ref(true)
const lastRefreshedAt = ref<string>('')
const actionError = ref('')
const compileMessage = ref('')
const generateMessage = ref('')
const publishMessage = ref('')
const compileSource = ref<'submissions' | 'raw'>('submissions')
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

const lastRefreshedLabel = computed(() => {
  if (!lastRefreshedAt.value) return ''
  const date = new Date(lastRefreshedAt.value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
})

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
const compileTargetRoundsLabel = computed(() =>
  compileTargetRounds.value.length > 0 ? compileTargetRounds.value.join(', ') : ''
)
const compiledSnapshotRoundSet = computed(() => {
  const rounds = Array.isArray(compiledStore.compiled?.rounds) ? compiledStore.compiled.rounds : []
  return new Set(
    rounds
      .map((item: any) => Number(item?.r ?? item?.round))
      .filter((value: number) => Number.isInteger(value) && value >= 1)
  )
})
const snapshotIncludesSelectedRound = computed(() => {
  if (selectedRound.value === null) return false
  return compiledSnapshotRoundSet.value.has(selectedRound.value)
})

function buildEmbedUrl(path: string, query: Record<string, string | undefined>) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (!value) return
    params.set(key, value)
  })
  params.set('embed', '1')
  const queryString = params.toString()
  return queryString.length > 0 ? `${path}?${queryString}` : path
}

const submissionsEmbedUrl = computed(() =>
  buildEmbedUrl(`/admin/${tournamentId.value}/submissions`, {
    round: selectedRound.value === null ? undefined : String(selectedRound.value),
  })
)
const reportsEmbedUrl = computed(() =>
  buildEmbedUrl(`/admin/${tournamentId.value}/reports`, {
    round: selectedRound.value === null ? undefined : String(selectedRound.value),
  })
)
const allocationEmbedUrl = computed(() => {
  if (selectedRound.value === null) return `/admin/${tournamentId.value}/setup`
  return buildEmbedUrl(`/admin/${tournamentId.value}/rounds/${selectedRound.value}/allocation`, {})
})
const rawResultEmbedUrl = computed(() => {
  if (selectedRound.value === null) return `/admin/${tournamentId.value}/setup`
  return buildEmbedUrl(`/admin/${tournamentId.value}/rounds/${selectedRound.value}/result`, {})
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

function taskStateLabel(state: HubTaskState) {
  if (state === 'done') return t('完了')
  if (state === 'blocked') return t('前段階待ち')
  return t('実行可能')
}

const operationTasks = computed<
  Array<{ key: HubTask; order: number; label: string; state: HubTaskState; stateLabel: string; dependency: string }>
>(() => {
  const drawState: HubTaskState = selectedRoundHasDraw.value
    ? 'done'
    : shouldBlockDrawGeneration.value
      ? 'blocked'
      : 'ready'
  const publishState: HubTaskState = selectedRoundPublished.value
    ? 'done'
    : !selectedRoundHasDraw.value
      ? 'blocked'
      : 'ready'
  const submissionsState: HubTaskState = !selectedRoundPublished.value
    ? 'blocked'
    : selectedRoundBallotGap.value.hasGap
      ? 'ready'
      : 'done'
  const compileState: HubTaskState = snapshotIncludesSelectedRound.value
    ? 'done'
    : !selectedRoundPublished.value || shouldBlockSubmissionCompile.value
      ? 'blocked'
      : 'ready'

  return [
    {
      key: 'draw',
      order: 1,
      label: t('対戦生成'),
      state: drawState,
      stateLabel: taskStateLabel(drawState),
      dependency:
        previousRoundNumbersForDraw.value.length === 0
          ? t('開始ステップ')
          : t('前段: {task}', { task: t('前ラウンド集計') }),
    },
    {
      key: 'publish',
      order: 2,
      label: t('公開/ロック'),
      state: publishState,
      stateLabel: taskStateLabel(publishState),
      dependency: t('前段: {task}', { task: t('対戦生成') }),
    },
    {
      key: 'submissions',
      order: 3,
      label: t('提出状況'),
      state: submissionsState,
      stateLabel: taskStateLabel(submissionsState),
      dependency: t('前段: {task}', { task: t('公開/ロック') }),
    },
    {
      key: 'compile',
      order: 4,
      label: t('集計設定'),
      state: compileState,
      stateLabel: taskStateLabel(compileState),
      dependency: t('前段: {task}', { task: t('提出状況') }),
    },
  ]
})

function recommendedTask(): HubTask {
  if (selectedRound.value === null) return 'draw'
  const nextTask = operationTasks.value.find((task) => task.state !== 'done')
  return nextTask?.key ?? 'compile'
}

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

function roundStatusLabel(status: RoundOperationStatus) {
  if (status === 'finalized') return t('確定')
  if (status === 'generated') return t('生成済み')
  if (status === 'compiled') return t('集計済み')
  if (status === 'collecting') return t('回収中')
  return t('準備中')
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
    ])
    lastRefreshedAt.value = new Date().toISOString()
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
    if (isHubTask(queryTask)) {
      activeTask.value = queryTask
    } else {
      activeTask.value = recommendedTask()
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
  router.replace({
    path: route.path,
    query: {
      ...route.query,
      round: String(roundNumber),
    },
  })
}

function isHubTask(value: unknown): value is HubTask {
  return typeof value === 'string' && hubTaskOrder.includes(value as HubTask)
}

function selectTask(task: HubTask) {
  activeTask.value = task
  router.replace({
    path: route.path,
    query: {
      ...route.query,
      task,
    },
  })
}

async function runCompileWithSource(source: 'submissions' | 'raw') {
  if (selectedRound.value === null || compileTargetRounds.value.length === 0) return
  compileMessage.value = ''
  actionError.value = ''
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
  if (source === 'raw') {
    const ok = window.confirm(
      t(
        '強制実行では生結果データを使用します。未提出・提出者不足・入力揺れがあると順位が不安定になる可能性があります。続行しますか？'
      )
    )
    if (!ok) return
  }
  const result = await compiledStore.runCompile(tournamentId.value, {
    source,
    rounds: compileTargetRounds.value,
  })
  if (!result) {
    actionError.value = compiledStore.error ?? t('集計に失敗しました。')
    return
  }
  compileMessage.value = t('集計が完了しました。')
  await compiledStore.fetchLatest(tournamentId.value)
}

async function runForcedCompile() {
  await runCompileWithSource('raw')
}

async function generateRoundDraw() {
  if (selectedRound.value === null) return
  if (shouldBlockDrawGeneration.value) {
    actionError.value =
      drawDependencyWarning.value ||
      t('対戦生成に必要な前ラウンド集計が不足しています。未集計: {rounds}', { rounds: '-' })
    return
  }
  const snapshotId = String(compiledStore.compiled?._id ?? '').trim()
  const requiresSnapshot = previousRoundNumbersForDraw.value.length > 0
  if (requiresSnapshot && !snapshotId) {
    actionError.value = t('集計結果がありません。先に集計を実行してください。')
    return
  }
  generateMessage.value = ''
  actionError.value = ''
  try {
    const payload: Record<string, any> = {
      tournamentId: tournamentId.value,
      round: selectedRound.value,
      rounds: previousRoundNumbersForDraw.value,
    }
    if (requiresSnapshot) payload.snapshotId = snapshotId
    const res = await api.post('/allocations/teams', payload)
    const allocation = Array.isArray(res.data?.data?.allocation) ? res.data.data.allocation : []
    if (allocation.length === 0) {
      actionError.value = t('対戦生成に失敗しました。')
      return
    }
    const existing = drawsStore.draws.find((draw) => Number(draw.round) === selectedRound.value)
    await drawsStore.upsertDraw({
      tournamentId: tournamentId.value,
      round: selectedRound.value,
      allocation,
      userDefinedData:
        (res.data?.data?.userDefinedData as Record<string, any> | undefined) ?? existing?.userDefinedData,
      drawOpened: Boolean(existing?.drawOpened),
      allocationOpened: Boolean(existing?.allocationOpened),
      locked: Boolean(existing?.locked),
    })
    generateMessage.value = t('対戦を生成しました。')
    await drawsStore.fetchDraws(tournamentId.value)
  } catch (err: any) {
    actionError.value = err?.response?.data?.errors?.[0]?.message ?? t('対戦生成に失敗しました。')
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
    if (!isHubTask(route.query.task)) {
      activeTask.value = recommendedTask()
    }
  }
)

watch(
  () => route.query.task,
  (next) => {
    if (isHubTask(next)) {
      activeTask.value = next
      return
    }
    activeTask.value = recommendedTask()
  }
)

watch(selectedDraw, () => {
  syncPublishDraft()
})

watch(
  tournamentId,
  () => {
    selectedRound.value = null
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

.section-meta {
  margin-left: auto;
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

.publish-switch-grid {
  display: grid;
  gap: var(--space-2);
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.publish-switch-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  min-height: 76px;
  padding: var(--space-2);
  display: grid;
  gap: var(--space-2);
  align-content: center;
  justify-items: center;
}

.toggle-switch {
  position: relative;
  width: 54px;
  height: 30px;
  display: inline-flex;
  align-items: center;
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
}
</style>
