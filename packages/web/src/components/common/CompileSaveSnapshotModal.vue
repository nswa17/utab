<template>
  <div v-if="open" class="modal-backdrop" role="presentation" @click.self="close">
    <div class="modal card stack save-modal" role="dialog" aria-modal="true">
      <div class="row save-modal-head">
        <h4>{{ $t('スナップショット保存') }}</h4>
        <Button variant="ghost" size="sm" @click="close">
          {{ $t('閉じる') }}
        </Button>
      </div>
      <p class="muted small">
        {{ $t('保存時のみ履歴を作成します。必要に応じて名前とメモを編集してください。') }}
      </p>
      <label class="stack">
        <span class="muted">{{ $t('スナップショット名') }}</span>
        <input v-model="snapshotName" type="text" :placeholder="$t('自動生成名')" :disabled="loading" />
      </label>
      <label class="stack">
        <span class="muted">{{ $t('メモ (任意)') }}</span>
        <textarea
          v-model="snapshotMemo"
          rows="4"
          :placeholder="$t('必要な場合のみ記録してください。')"
          :disabled="loading"
        />
      </label>
      <div class="row modal-actions">
        <Button variant="ghost" size="sm" @click="close">
          {{ $t('取消') }}
        </Button>
        <Button size="sm" :disabled="loading" @click="$emit('confirm')">
          {{ $t('スナップショットを保存') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'

defineProps<{
  loading?: boolean
}>()

const emit = defineEmits<{
  (event: 'confirm'): void
  (event: 'cancel'): void
}>()

const open = defineModel<boolean>('open', { default: false })
const snapshotName = defineModel<string>('snapshotName', { default: '' })
const snapshotMemo = defineModel<string>('snapshotMemo', { default: '' })

function close() {
  open.value = false
  emit('cancel')
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

.save-modal {
  gap: var(--space-3);
}

.save-modal-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.save-modal-head h4 {
  margin: 0;
  font-size: 1rem;
}

.modal-actions {
  justify-content: flex-end;
}

textarea {
  min-height: 96px;
  resize: vertical;
}
</style>
