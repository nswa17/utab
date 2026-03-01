<template>
  <section class="stack break-policy-editor">
    <div class="grid break-policy-grid">
      <Field v-if="showSource" :label="$t('ソース')">
        <template #default="{ id, describedBy }">
          <select v-model="source" :id="id" :aria-describedby="describedBy" :disabled="disabled">
            <option value="submissions">{{ $t('提出データ') }}</option>
            <option value="raw">{{ $t('Raw結果') }}</option>
          </select>
        </template>
        <template #label-suffix>
          <HelpTip :text="$t('ブレイク判定の基準データを選びます。通常は提出データを使います。')" />
        </template>
      </Field>
      <Field :label="$t('ブレイクチーム数')">
        <template #default="{ id, describedBy }">
          <input
            v-model.number="size"
            :id="id"
            :aria-describedby="describedBy"
            type="number"
            min="1"
            :disabled="disabled"
          />
        </template>
        <template #label-suffix>
          <HelpTip :text="$t('ブレイク進出チーム数です。')" />
        </template>
      </Field>
      <Field :label="$t('境界同点の扱い')">
        <template #default="{ id, describedBy }">
          <select v-model="cutoffTiePolicy" :id="id" :aria-describedby="describedBy" :disabled="disabled">
            <option value="manual">{{ $t('手動選抜') }}</option>
            <option value="include_all">{{ $t('同点は全員含める') }}</option>
            <option value="strict">{{ $t('人数を厳密適用') }}</option>
          </select>
        </template>
        <template #label-suffix>
          <HelpTip :text="$t('カットラインが同点になった時の扱いです。')" />
        </template>
      </Field>
      <Field :label="$t('シード方式')">
        <template #default="{ id, describedBy }">
          <select v-model="seeding" :id="id" :aria-describedby="describedBy" :disabled="disabled">
            <option value="reseed_each_round">{{ $t('毎ラウンド再シード (1 vs N)') }}</option>
            <option value="fixed_bracket">{{ $t('固定ブラケット') }}</option>
            <option value="random_within_tie_group">{{ $t('同順位内ランダム') }}</option>
            <option value="random_full">{{ $t('完全ランダム') }}</option>
          </select>
        </template>
        <template #label-suffix>
          <HelpTip :text="$t('ブレイク対戦時の初期シード割り当て方式です。')" />
        </template>
      </Field>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { BreakCutoffTiePolicy, BreakSeeding } from '@/types/round'
import Field from '@/components/common/Field.vue'
import HelpTip from '@/components/common/HelpTip.vue'

withDefaults(
  defineProps<{
    disabled?: boolean
    showSource?: boolean
  }>(),
  {
    disabled: false,
    showSource: true,
  }
)

const source = defineModel<'submissions' | 'raw'>('source', { required: true })
const size = defineModel<number>('size', { required: true })
const cutoffTiePolicy = defineModel<BreakCutoffTiePolicy>('cutoffTiePolicy', { required: true })
const seeding = defineModel<BreakSeeding>('seeding', { required: true })
</script>

<style scoped>
.break-policy-editor {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-3);
  gap: var(--space-3);
}

.break-policy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-2);
}

.break-policy-editor :deep(.field-label) {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--color-muted);
}
</style>
