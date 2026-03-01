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

    <section v-if="props.showWinnerScoring" class="stack compile-group">
      <div class="row compile-group-head">
        <h6 class="compile-group-title">{{ $t('勝敗判定設定') }}</h6>
        <HelpTip :text="$t('勝敗判定と引き分け時の勝敗点を設定します。')" />
      </div>
      <div class="grid compile-grid">
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
    </section>

    <section v-if="props.showMergeAndMissing" class="stack compile-group">
      <div class="row compile-group-head">
        <h6 class="compile-group-title">{{ $t('集計・欠損') }}</h6>
        <HelpTip :text="$t('重複提出、同一スピーカー入力、欠損データの扱いを設定します。')" />
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
import type {
  CompileAggregationPolicy,
  CompileDuplicateMergePolicy,
  CompileMissingDataPolicy,
  CompileWinnerPolicy,
} from '@/types/compiled'
import Field from '@/components/common/Field.vue'
import HelpTip from '@/components/common/HelpTip.vue'

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    showSourceRounds?: boolean
    showWinnerScoring?: boolean
    showMergeAndMissing?: boolean
    sourceRoundOptions?: Array<{ value: number; label: string; disabled?: boolean }>
  }>(),
  {
    disabled: false,
    showSourceRounds: false,
    showWinnerScoring: true,
    showMergeAndMissing: true,
    sourceRoundOptions: () => [],
  }
)

const sourceRounds = defineModel<number[]>('sourceRounds', { default: () => [] })
const winnerPolicy = defineModel<CompileWinnerPolicy>('winnerPolicy', { required: true })
const tiePoints = defineModel<number>('tiePoints', { required: true })
const mergePolicy = defineModel<CompileDuplicateMergePolicy>('mergePolicy', { required: true })
const poiAggregation = defineModel<CompileAggregationPolicy>('poiAggregation', { required: true })
const bestAggregation = defineModel<CompileAggregationPolicy>('bestAggregation', { required: true })
const missingDataPolicy = defineModel<CompileMissingDataPolicy>('missingDataPolicy', { required: true })

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

</style>
