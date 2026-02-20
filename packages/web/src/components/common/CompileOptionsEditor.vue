<template>
  <div class="stack compile-options-editor">
    <section v-if="showSourceRounds" class="stack compile-group">
      <div class="row compile-group-head">
        <h6 class="compile-group-title">{{ $t('集計対象ラウンド') }}</h6>
        <HelpTip :text="$t('ここで選んだラウンドだけを集計します。未選択なら全ラウンドです。')" />
      </div>
      <div class="grid compile-grid">
        <Field class="compile-source-rounds">
          <template #default="{ id, describedBy }">
            <div :id="id" :aria-describedby="describedBy" class="stack source-round-list">
              <p v-if="sourceRoundOptions.length === 0" class="muted small">
                {{ $t('このラウンドには前提となる集計ラウンドがありません。') }}
              </p>
              <label
                v-for="option in sourceRoundOptions"
                :key="`compile-source-round-${option.value}`"
                class="row small source-round-item"
              >
                <input
                  type="checkbox"
                  :checked="isSourceRoundSelected(option.value)"
                  :disabled="disabled"
                  @change="toggleSourceRound(option.value, $event)"
                />
                <span>{{ option.label }}</span>
              </label>
              <p class="muted small">{{ $t('未選択時は直前までの全ラウンドを参照します。') }}</p>
            </div>
          </template>
        </Field>
      </div>
    </section>

    <section class="stack compile-group">
      <div class="row compile-group-head">
        <h6 class="compile-group-title">{{ $t('判定・順位') }}</h6>
        <HelpTip :text="$t('順位が同点のときにどの指標を先に比較するかを決めます。')" />
      </div>
      <div class="grid compile-grid">
        <Field :label="$t('順位比較')">
          <template #default="{ id, describedBy }">
            <select v-model="rankingPreset" :id="id" :aria-describedby="describedBy" :disabled="disabled">
              <option value="current">{{ $t('現行') }}</option>
              <option value="custom">{{ $t('カスタム') }}</option>
            </select>
          </template>
          <template #label-suffix>
            <HelpTip :text="$t('順位が同点のときにどの指標を先に比較するかを決めます。')" />
          </template>
        </Field>
        <Field :label="$t('勝敗判定')">
          <template #default="{ id, describedBy }">
            <select v-model="winnerPolicy" :id="id" :aria-describedby="describedBy" :disabled="disabled">
              <option value="score_only">{{ $t('勝者のスコアが敗者のスコアより高いことを要求') }}</option>
              <option value="winner_id_then_score">{{ $t('勝敗とスコアの大小が違うことを許容') }}</option>
              <option value="draw_on_missing">{{ $t('引き分けを許容（勝者未指定は引き分け扱い）') }}</option>
            </select>
          </template>
          <template #label-suffix>
            <HelpTip :text="$t('勝敗判定の方法を選択します。スコア整合を必須にするか、勝敗入力を優先するか、勝者未指定を引き分け扱いにするかを選べます。')" />
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
              :disabled="disabled"
            />
          </template>
          <template #label-suffix>
            <HelpTip :text="$t('引き分けを許可する設定のときに、各チームへ与える勝敗点です。')" />
          </template>
        </Field>
      </div>
      <section v-if="rankingPreset === 'custom'" class="stack ranking-builder">
        <div class="row ranking-builder-head">
          <strong>{{ $t('順位比較順（上から優先）') }}</strong>
          <HelpTip :text="$t('順位が同点のときにどの指標を先に比較するかを決めます。')" />
        </div>
        <div class="grid ranking-grid">
          <div class="stack ranking-column">
            <span class="muted small">{{ $t('比較に使う（上から優先）') }}</span>
            <div class="stack ranking-active-list">
              <div
                v-for="(metric, index) in activeRankingMetrics"
                :key="`active-metric-${metric}`"
                class="row ranking-item"
              >
                <span>{{ rankingMetricLabel(metric) }}</span>
                <div class="row ranking-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    :disabled="disabled || index === 0"
                    @click="moveRankingMetric(index, -1)"
                  >
                    {{ $t('上に移動') }}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    :disabled="disabled || index === activeRankingMetrics.length - 1"
                    @click="moveRankingMetric(index, 1)"
                  >
                    {{ $t('下に移動') }}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    :disabled="disabled || activeRankingMetrics.length <= 1"
                    @click="excludeRankingMetric(metric)"
                  >
                    {{ $t('除外') }}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div class="stack ranking-column">
            <span class="muted small">{{ $t('比較に使わない') }}</span>
            <div v-if="inactiveRankingMetrics.length === 0" class="muted small">
              {{ $t('すべて使用中です。') }}
            </div>
            <div v-else class="row ranking-inactive-list">
              <Button
                v-for="metric in inactiveRankingMetrics"
                :key="`inactive-metric-${metric}`"
                variant="secondary"
                size="sm"
                :disabled="disabled"
                @click="includeRankingMetric(metric)"
              >
                + {{ rankingMetricLabel(metric) }}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </section>

    <section class="stack compile-group">
      <div class="row compile-group-head">
        <h6 class="compile-group-title">{{ $t('集計・欠損') }}</h6>
        <HelpTip :text="$t('同じ提出者から複数提出がある場合の扱いです。')" />
      </div>
      <div class="grid compile-grid">
        <Field :label="$t('重複マージ')">
          <template #default="{ id, describedBy }">
            <select v-model="mergePolicy" :id="id" :aria-describedby="describedBy" :disabled="disabled">
              <option value="latest">{{ $t('最新を採用') }}</option>
              <option value="average">{{ $t('平均で統合') }}</option>
              <option value="error">{{ $t('重複時はエラー') }}</option>
            </select>
          </template>
          <template #label-suffix>
            <HelpTip :text="$t('同じ提出者から複数提出がある場合の扱いです。')" />
          </template>
        </Field>
        <Field :label="$t('POI集計')">
          <template #default="{ id, describedBy }">
            <select v-model="poiAggregation" :id="id" :aria-describedby="describedBy" :disabled="disabled">
              <option value="average">{{ $t('平均') }}</option>
              <option value="max">{{ $t('最大') }}</option>
            </select>
          </template>
          <template #label-suffix>
            <HelpTip :text="$t('POIの重複値を平均か最大でまとめます。')" />
          </template>
        </Field>
        <Field :label="$t('Best集計')">
          <template #default="{ id, describedBy }">
            <select v-model="bestAggregation" :id="id" :aria-describedby="describedBy" :disabled="disabled">
              <option value="average">{{ $t('平均') }}</option>
              <option value="max">{{ $t('最大') }}</option>
            </select>
          </template>
          <template #label-suffix>
            <HelpTip :text="$t('Best Speakerの重複値を平均か最大でまとめます。')" />
          </template>
        </Field>
        <Field :label="$t('欠損データ')">
          <template #default="{ id, describedBy }">
            <select v-model="missingDataPolicy" :id="id" :aria-describedby="describedBy" :disabled="disabled">
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
    </section>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
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

withDefaults(
  defineProps<{
    disabled?: boolean
    showSourceRounds?: boolean
    sourceRoundOptions?: Array<{ value: number; label: string }>
  }>(),
  {
    disabled: false,
    showSourceRounds: false,
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

const activeRankingMetrics = computed(() => normalizeRankingOrder(rankingOrder.value))
const inactiveRankingMetrics = computed(() =>
  allRankingMetrics.filter((metric) => !activeRankingMetrics.value.includes(metric))
)

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

function moveRankingMetric(index: number, direction: -1 | 1) {
  const nextIndex = index + direction
  const current = activeRankingMetrics.value
  if (nextIndex < 0 || nextIndex >= current.length) return
  const next = [...current]
  const [picked] = next.splice(index, 1)
  next.splice(nextIndex, 0, picked)
  setRankingOrder(next)
}

function excludeRankingMetric(metric: CompileRankingMetric) {
  const next = activeRankingMetrics.value.filter((item) => item !== metric)
  if (next.length === 0) return
  setRankingOrder(next)
}

function includeRankingMetric(metric: CompileRankingMetric) {
  if (activeRankingMetrics.value.includes(metric)) return
  setRankingOrder([...activeRankingMetrics.value, metric])
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
  font-size: 1.12rem;
  font-weight: 700;
  color: var(--color-text);
}

.compile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-2);
}

.compile-group :deep(.field-label) {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}

.compile-group :deep(select),
.compile-group :deep(input) {
  font-size: 1rem;
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

.ranking-builder {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-surface-soft);
}

.ranking-builder-head {
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2);
}

.ranking-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-2);
}

.ranking-column {
  gap: var(--space-2);
}

.ranking-active-list {
  gap: var(--space-1);
}

.ranking-item {
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  background: var(--color-surface);
}

.ranking-actions {
  gap: var(--space-1);
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ranking-inactive-list {
  gap: var(--space-1);
  flex-wrap: wrap;
}

</style>
