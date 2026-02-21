<template>
  <div class="stack compile-options-editor">
    <section v-if="props.showSourceRounds" class="stack compile-group">
      <div class="row compile-group-head">
        <h6 class="compile-group-title">{{ $t('集計対象ラウンド') }}</h6>
        <HelpTip :text="$t('ここで選んだラウンドだけを集計します。')" />
      </div>
      <div class="grid compile-grid">
        <Field class="compile-source-rounds">
          <template #default="{ id, describedBy }">
            <div :id="id" :aria-describedby="describedBy" class="stack source-round-list">
              <p v-if="props.sourceRoundOptions.length === 0" class="muted small">
                {{ $t('このラウンドには前提となる集計ラウンドがありません。') }}
              </p>
              <label
                v-for="option in props.sourceRoundOptions"
                :key="`compile-source-round-${option.value}`"
                class="row small source-round-item"
              >
                <input
                  type="checkbox"
                  :checked="isSourceRoundSelected(option.value)"
                  :disabled="props.disabled || option.disabled === true"
                  @change="toggleSourceRound(option.value, $event)"
                />
                <span>{{ option.label }}</span>
              </label>
            </div>
          </template>
        </Field>
      </div>
    </section>

    <section v-if="props.showWinnerScoring || props.showRankingPriority" class="stack compile-group">
      <div class="row compile-group-head">
        <h6 class="compile-group-title">{{ $t('順位優先度設定') }}</h6>
        <HelpTip :text="$t('使用する基準を左列に並べてください。')" />
      </div>
      <div v-if="props.showWinnerScoring" class="grid compile-grid">
        <Field :label="$t('勝敗判定')">
          <template #default="{ id, describedBy }">
            <select
              v-model="winnerPolicy"
              :id="id"
              :aria-describedby="describedBy"
              :disabled="props.disabled"
            >
              <option value="score_only">{{ $t('勝者のスコアが敗者のスコアより高いことを要求') }}</option>
              <option value="winner_id_then_score">{{ $t('勝敗とスコアの大小が違うことを許容') }}</option>
              <option value="draw_on_missing">{{ $t('引き分けを許容（勝者未指定は引き分け扱い）') }}</option>
            </select>
          </template>
          <template #label-suffix>
            <HelpTip
              :text="$t('勝敗判定の方法を選択します。スコア整合を必須にするか、勝敗入力を優先するか、勝者未指定を引き分け扱いにするかを選べます。')"
            />
          </template>
        </Field>
        <Field :label="$t('引き分け時ポイント')">
          <template #default="{ id, describedBy }">
            <input
              v-model.number="tiePoints"
              :id="id"
              :aria-describedby="describedBy"
              type="number"
              min="0"
              step="0.5"
              :disabled="props.disabled"
            />
          </template>
          <template #label-suffix>
            <HelpTip :text="$t('引き分けを許可する設定のときに、各チームへ与える勝敗点です。')" />
          </template>
        </Field>
      </div>
      <div v-if="props.showRankingPriority" class="stack compile-ranking-field">
        <div class="grid ranking-columns">
          <section
            class="stack ranking-column ranking-column--active"
            @dragover.prevent
            @drop.prevent="dropRankingMetricToActiveEnd"
          >
            <div class="row ranking-column-head">
              <strong class="ranking-column-title">{{ $t('使用する基準') }}</strong>
            </div>
            <div
              v-for="(metric, index) in activeRankingMetrics"
              :key="`active-metric-${metric}`"
              class="row ranking-chip ranking-chip--active"
              :class="{
                'ranking-chip--dragging':
                  draggingRankingMetric?.metric === metric &&
                  draggingRankingMetric?.source === 'active',
              }"
              :draggable="!props.disabled"
              @dragstart="startRankingDrag(metric, 'active', $event)"
              @dragover.prevent
              @drop.prevent.stop="dropRankingMetricToActive(metric)"
              @dragend="endRankingDrag"
            >
              <span class="ranking-rank">{{ index + 1 }}</span>
              <span class="ranking-drag-handle" aria-hidden="true">⋮⋮</span>
              <span class="ranking-chip-label">{{ rankingMetricLabel(metric) }}</span>
              <Button
                variant="ghost"
                size="sm"
                class="ranking-exclude"
                :disabled="props.disabled || activeRankingMetrics.length <= 1"
                @click="excludeRankingMetric(metric)"
              >
                {{ $t('除外') }}
              </Button>
            </div>
          </section>
          <section
            class="stack ranking-column ranking-column--inactive"
            @dragover.prevent
            @drop.prevent="dropRankingMetricToInactive"
          >
            <div class="row ranking-column-head">
              <strong class="ranking-column-title">{{ $t('不使用') }}</strong>
            </div>
            <p v-if="inactiveRankingMetrics.length === 0" class="muted small">
              {{ $t('不使用の指標はありません。') }}
            </p>
            <div
              v-for="metric in inactiveRankingMetrics"
              :key="`inactive-metric-${metric}`"
              class="row ranking-chip ranking-chip--inactive"
              :class="{
                'ranking-chip--dragging':
                  draggingRankingMetric?.metric === metric &&
                  draggingRankingMetric?.source === 'inactive',
              }"
              :draggable="!props.disabled"
              @dragstart="startRankingDrag(metric, 'inactive', $event)"
              @dragend="endRankingDrag"
            >
              <span class="ranking-drag-handle" aria-hidden="true">⋮⋮</span>
              <span class="ranking-chip-label">{{ rankingMetricLabel(metric) }}</span>
            </div>
          </section>
        </div>
      </div>
    </section>

    <section v-if="props.showMergeAndMissing" class="stack compile-group">
      <div class="row compile-group-head">
        <h6 class="compile-group-title">{{ $t('集計・欠損') }}</h6>
        <HelpTip :text="$t('同じ提出者から複数提出がある場合の扱いです。')" />
      </div>
      <div class="grid compile-grid">
        <Field :label="$t('重複マージ')">
          <template #default="{ id, describedBy }">
            <select v-model="mergePolicy" :id="id" :aria-describedby="describedBy" :disabled="props.disabled">
              <option value="latest">{{ $t('最新を採用') }}</option>
              <option value="average">{{ $t('統合') }}</option>
              <option value="error">{{ $t('重複時はエラー') }}</option>
            </select>
          </template>
          <template #label-suffix>
            <HelpTip :text="$t('同じ提出者から複数提出がある場合の扱いです。')" />
          </template>
        </Field>
        <Field :label="$t('欠損データ')">
          <template #default="{ id, describedBy }">
            <select
              v-model="missingDataPolicy"
              :id="id"
              :aria-describedby="describedBy"
              :disabled="props.disabled"
            >
              <option value="warn">{{ $t('警告のみ') }}</option>
              <option value="exclude">{{ $t('欠損を除外') }}</option>
              <option value="error">{{ $t('エラー停止') }}</option>
            </select>
          </template>
          <template #label-suffix>
            <HelpTip :text="$t('必要データが欠けていた場合に、警告で続行するか、除外するか、エラー停止するかを選びます。')" />
          </template>
        </Field>
      </div>
      <div class="grid compile-grid compile-grid-aggregation">
        <Field :label="$t('同一スピーカーPOI処理')">
          <template #default="{ id, describedBy }">
            <select v-model="poiAggregation" :id="id" :aria-describedby="describedBy" :disabled="props.disabled">
              <option value="average">{{ $t('平均') }}</option>
              <option value="max">{{ $t('最大') }}</option>
            </select>
          </template>
          <template #label-suffix>
            <HelpTip :text="$t('同一スピーカーへのPOI複数入力を平均か最大でまとめます。')" />
          </template>
        </Field>
        <Field :label="$t('同一スピーカーBest Debater処理')">
          <template #default="{ id, describedBy }">
            <select v-model="bestAggregation" :id="id" :aria-describedby="describedBy" :disabled="props.disabled">
              <option value="average">{{ $t('平均') }}</option>
              <option value="max">{{ $t('最大') }}</option>
            </select>
          </template>
          <template #label-suffix>
            <HelpTip :text="$t('同一スピーカーへのBest Debater複数入力を平均か最大でまとめます。')" />
          </template>
        </Field>
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  CompileAggregationPolicy,
  CompileDuplicateMergePolicy,
  CompileMissingDataPolicy,
  CompileRankingMetric,
  CompileRankingPreset,
  CompileWinnerPolicy,
} from '@/types/compiled'
import { compileRankingMetrics } from '@/types/compiled'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import HelpTip from '@/components/common/HelpTip.vue'

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    showSourceRounds?: boolean
    showWinnerScoring?: boolean
    showRankingPriority?: boolean
    showMergeAndMissing?: boolean
    sourceRoundOptions?: Array<{ value: number; label: string; disabled?: boolean }>
  }>(),
  {
    disabled: false,
    showSourceRounds: false,
    showWinnerScoring: true,
    showRankingPriority: true,
    showMergeAndMissing: true,
    sourceRoundOptions: () => [],
  }
)

const sourceRounds = defineModel<number[]>('sourceRounds', { default: () => [] })
const rankingPreset = defineModel<CompileRankingPreset>('rankingPreset', { required: true })
const rankingOrder = defineModel<CompileRankingMetric[]>('rankingOrder', { required: true })
const winnerPolicy = defineModel<CompileWinnerPolicy>('winnerPolicy', { required: true })
const tiePoints = defineModel<number>('tiePoints', { required: true })
const mergePolicy = defineModel<CompileDuplicateMergePolicy>('mergePolicy', { required: true })
const poiAggregation = defineModel<CompileAggregationPolicy>('poiAggregation', { required: true })
const bestAggregation = defineModel<CompileAggregationPolicy>('bestAggregation', { required: true })
const missingDataPolicy = defineModel<CompileMissingDataPolicy>('missingDataPolicy', { required: true })

const { t } = useI18n({ useScope: 'global' })

const allRankingMetrics: CompileRankingMetric[] = [...compileRankingMetrics]
type RankingDragState = {
  metric: CompileRankingMetric
  source: 'active' | 'inactive'
}
const draggingRankingMetric = ref<RankingDragState | null>(null)

const activeRankingMetrics = computed(() => normalizeRankingOrder(rankingOrder.value))
const inactiveRankingMetrics = computed(() =>
  allRankingMetrics.filter((metric) => !activeRankingMetrics.value.includes(metric))
)

watchEffect(() => {
  if (!props.showRankingPriority) return
  if (rankingPreset.value !== 'custom') {
    rankingPreset.value = 'custom'
  }
})

function normalizeRankingOrder(value: CompileRankingMetric[] | undefined): CompileRankingMetric[] {
  const sourceOrder = Array.isArray(value) ? value : []
  const seen = new Set<CompileRankingMetric>()
  const normalized: CompileRankingMetric[] = []
  sourceOrder.forEach((metric) => {
    if (!allRankingMetrics.includes(metric)) return
    if (seen.has(metric)) return
    seen.add(metric)
    normalized.push(metric)
  })
  if (normalized.length === 0) {
    return [allRankingMetrics[0]]
  }
  return normalized
}

function setRankingOrder(next: CompileRankingMetric[]) {
  rankingOrder.value = normalizeRankingOrder(next)
}

function excludeRankingMetric(metric: CompileRankingMetric) {
  const next = activeRankingMetrics.value.filter((item) => item !== metric)
  if (next.length === 0) return
  setRankingOrder(next)
}

function startRankingDrag(
  metric: CompileRankingMetric,
  source: 'active' | 'inactive',
  event: DragEvent
) {
  if (props.disabled) return
  draggingRankingMetric.value = { metric, source }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.dropEffect = 'move'
    event.dataTransfer.setData('text/plain', metric)
  }
}

function endRankingDrag() {
  draggingRankingMetric.value = null
}

function dropRankingMetricToActive(targetMetric: CompileRankingMetric) {
  if (props.disabled) return
  const dragged = draggingRankingMetric.value
  if (!dragged) return
  const current = activeRankingMetrics.value
  const targetIndex = current.indexOf(targetMetric)
  if (targetIndex < 0) {
    endRankingDrag()
    return
  }

  if (dragged.source === 'active') {
    const fromIndex = current.indexOf(dragged.metric)
    if (fromIndex < 0 || fromIndex === targetIndex) {
      endRankingDrag()
      return
    }
    const next = [...current]
    next.splice(fromIndex, 1)
    const insertIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex
    next.splice(insertIndex, 0, dragged.metric)
    setRankingOrder(next)
    endRankingDrag()
    return
  }

  if (!current.includes(dragged.metric)) {
    const next = [...current]
    next.splice(targetIndex, 0, dragged.metric)
    setRankingOrder(next)
  }
  endRankingDrag()
}

function dropRankingMetricToActiveEnd() {
  if (props.disabled) return
  const dragged = draggingRankingMetric.value
  if (!dragged) return
  const current = activeRankingMetrics.value

  if (dragged.source === 'active') {
    const fromIndex = current.indexOf(dragged.metric)
    if (fromIndex < 0 || fromIndex === current.length - 1) {
      endRankingDrag()
      return
    }
    const next = [...current]
    next.splice(fromIndex, 1)
    next.push(dragged.metric)
    setRankingOrder(next)
    endRankingDrag()
    return
  }

  if (!current.includes(dragged.metric)) {
    setRankingOrder([...current, dragged.metric])
  }
  endRankingDrag()
}

function dropRankingMetricToInactive() {
  if (props.disabled) return
  const dragged = draggingRankingMetric.value
  if (!dragged) return
  if (dragged.source !== 'active') {
    endRankingDrag()
    return
  }
  excludeRankingMetric(dragged.metric)
  endRankingDrag()
}

function rankingMetricLabel(metric: CompileRankingMetric) {
  const labels: Record<CompileRankingMetric, string> = {
    win: t('勝利数'),
    sum: t('合計'),
    margin: t('マージン'),
    vote: t('票'),
    average: t('平均'),
    sd: t('標準偏差'),
  }
  return labels[metric]
}

function isSourceRoundSelected(roundNumber: number) {
  return sourceRounds.value.includes(roundNumber)
}

function toggleSourceRound(roundNumber: number, event: Event) {
  const input = event.target as HTMLInputElement | null
  const checked = Boolean(input?.checked)
  const next = new Set(sourceRounds.value)
  if (checked) next.add(roundNumber)
  else next.delete(roundNumber)
  sourceRounds.value = Array.from(next).sort((left, right) => left - right)
}
</script>

<style scoped>
.compile-options-editor {
  gap: var(--space-3);
}

.compile-group {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-3);
  gap: var(--space-3);
}

.compile-group-head {
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--color-border);
}

.compile-group-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}

.compile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-2);
}

.compile-grid-aggregation {
  padding-top: var(--space-1);
  border-top: 1px dashed var(--color-border);
}

.compile-group :deep(.field-label) {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--color-muted);
}

.compile-group :deep(select),
.compile-group :deep(input) {
  font-size: 0.9rem;
  line-height: 1.45;
}

.compile-source-rounds {
  grid-column: 1 / -1;
}

.source-round-list {
  gap: var(--space-1);
}

.source-round-item {
  align-items: center;
  gap: var(--space-2);
}

.compile-ranking-field {
  grid-column: 1 / -1;
}

.ranking-columns {
  grid-template-columns: minmax(260px, 1fr) minmax(220px, 0.9fr);
  gap: var(--space-2);
}

@media (max-width: 900px) {
  .ranking-columns {
    grid-template-columns: 1fr;
  }
}

.ranking-column {
  gap: var(--space-1);
  min-height: 48px;
}

.ranking-column-head {
  align-items: center;
  justify-content: flex-start;
  padding: 2px 2px;
}

.ranking-column-title {
  font-size: 0.86rem;
  color: var(--color-muted);
}

.ranking-chip {
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  padding: 6px 8px;
}

.ranking-chip--active {
  cursor: grab;
}

.ranking-chip--inactive {
  cursor: grab;
}

.ranking-chip--dragging {
  opacity: 0.6;
}

.compile-ranking-field :deep(.ranking-exclude) {
  min-height: 28px;
  padding: 0 8px;
  font-size: 0.74rem;
}

.ranking-drag-handle {
  color: var(--color-muted);
  letter-spacing: -0.15em;
  user-select: none;
}

.ranking-rank {
  min-width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-soft);
  color: var(--color-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.ranking-chip-label {
  flex: 1;
  min-width: 0;
}

</style>
