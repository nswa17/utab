<template>
  <div v-if="open" class="modal-backdrop" role="presentation" @click.self="handleBackdropClick">
    <section class="modal card stack notice-modal" role="alertdialog" aria-modal="true">
      <h4>{{ resolvedTitle }}</h4>
      <p class="notice-message">{{ message }}</p>
      <div class="row modal-actions">
        <Button variant="secondary" size="sm" @click="close">
          {{ resolvedConfirmLabel }}
        </Button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/common/Button.vue'

const props = withDefaults(
  defineProps<{
    title?: string
    message: string
    confirmLabel?: string
    closeOnBackdrop?: boolean
  }>(),
  {
    title: '',
    confirmLabel: '',
    closeOnBackdrop: true,
  }
)

const emit = defineEmits<{
  (event: 'close'): void
}>()

const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n({ useScope: 'global' })

const resolvedTitle = computed(() => props.title.trim() || t('注意'))
const resolvedConfirmLabel = computed(() => props.confirmLabel.trim() || t('閉じる'))

function close() {
  open.value = false
  emit('close')
}

function handleBackdropClick() {
  if (props.closeOnBackdrop) close()
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
  z-index: 50;
}

.modal {
  width: min(460px, 100%);
  max-height: calc(100vh - 80px);
  overflow: auto;
}

.notice-modal {
  gap: var(--space-3);
}

.notice-modal h4 {
  margin: 0;
}

.notice-message {
  margin: 0;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.modal-actions {
  justify-content: flex-end;
}
</style>
