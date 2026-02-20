<template>
  <div v-if="open" class="modal-backdrop" role="presentation" @click.self="close">
    <div class="modal card stack force-modal" role="dialog" aria-modal="true">
      <div class="row force-modal-head">
        <h4>{{ $t('強制実行の確認') }}</h4>
        <Button variant="ghost" size="sm" @click="close">
          {{ $t('閉じる') }}
        </Button>
      </div>
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
          <span class="muted">{{ $t('欠損データの扱い') }}</span>
          <select v-model="missingDataPolicy" :disabled="loading">
            <option value="warn">{{ $t('警告して続行') }}</option>
            <option value="exclude">{{ $t('欠損データを除外') }}</option>
            <option value="error">{{ $t('欠損があれば中止') }}</option>
          </select>
        </label>
      </section>
      <div class="row modal-actions">
        <Button variant="ghost" size="sm" @click="close">
          {{ $t('取消') }}
        </Button>
        <Button variant="danger" size="sm" :disabled="loading" @click="$emit('confirm')">
          {{ $t('強制実行する') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import type { CompileMissingDataPolicy } from '@/types/compiled'

defineProps<{
  loading?: boolean
}>()

defineEmits<{
  (event: 'confirm'): void
}>()

const open = defineModel<boolean>('open', { default: false })
const missingDataPolicy = defineModel<CompileMissingDataPolicy>('missingDataPolicy', { required: true })

function close() {
  open.value = false
}
</script>

<style scoped>
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

.force-modal {
  gap: var(--space-3);
}

.force-modal-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.force-modal-head h4 {
  margin: 0;
  font-size: 1rem;
}

.force-warning-banner {
  border: 1px solid #fecaca;
  background: #fff7ed;
  color: #9a3412;
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: grid;
  gap: var(--space-2);
}

.force-warning-banner p {
  margin: 0;
}

.force-warning-list .list-item {
  color: inherit;
}

.force-option-panel {
  gap: var(--space-2);
}

.force-option-panel h5 {
  margin: 0;
}

.force-option-field {
  gap: 4px;
}

.modal-actions {
  justify-content: flex-end;
}
</style>
