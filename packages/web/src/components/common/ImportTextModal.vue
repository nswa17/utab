<template>
  <div v-if="open" class="import-modal-backdrop" role="presentation" @click.self="emit('close')">
    <section class="import-modal card stack" role="dialog" aria-modal="true">
      <div class="row import-modal-head">
        <div class="row import-modal-title-row">
          <strong>{{ title }}</strong>
          <HelpTip v-if="helpText" :text="helpText" />
        </div>
        <Button variant="ghost" size="sm" @click="emit('close')">
          {{ closeLabelText }}
        </Button>
      </div>

      <label v-if="hasModeOptions" class="stack">
        <span class="option-title">{{ modeLabelText }}</span>
        <select v-model="modeModel" :disabled="disabled">
          <option v-for="option in modeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label v-if="showFileInput" class="stack">
        <span class="option-title">{{ fileLabelText }}</span>
        <input
          class="csv-file-input"
          type="file"
          :accept="fileAccept"
          :disabled="disabled"
          @change="emit('file-change', $event)"
        />
      </label>

      <label class="stack">
        <span class="option-title">{{ dataLabelText }}</span>
        <textarea
          v-model="textModel"
          class="import-textarea"
          :rows="rows"
          :placeholder="placeholder"
          :disabled="disabled"
        />
      </label>

      <p v-if="description" class="muted small">{{ description }}</p>
      <pre v-if="example" class="import-example">{{ example }}</pre>
      <p v-if="error" class="error">{{ error }}</p>

      <div class="row import-modal-actions">
        <Button variant="ghost" size="sm" @click="emit('close')">{{ cancelLabelText }}</Button>
        <Button size="sm" :disabled="disabled" @click="emit('submit')">
          {{ submitLabelText }}
        </Button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/common/Button.vue'
import HelpTip from '@/components/common/HelpTip.vue'

type ModeOption = {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    helpText?: string
    modeLabel?: string
    modeOptions?: ModeOption[]
    fileLabel?: string
    dataLabel?: string
    fileAccept?: string
    placeholder?: string
    description?: string
    example?: string
    error?: string | null
    submitLabel?: string
    cancelLabel?: string
    closeLabel?: string
    disabled?: boolean
    rows?: number
    showFileInput?: boolean
  }>(),
  {
    helpText: '',
    modeLabel: '',
    modeOptions: () => [],
    fileLabel: '',
    dataLabel: '',
    fileAccept: '.csv,.tsv,text/csv,text/tab-separated-values,text/plain',
    placeholder: '',
    description: '',
    example: '',
    error: '',
    submitLabel: '',
    cancelLabel: '',
    closeLabel: '',
    disabled: false,
    rows: 8,
    showFileInput: true,
  }
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit'): void
  (event: 'file-change', payload: Event): void
}>()

const { t } = useI18n({ useScope: 'global' })
const textModel = defineModel<string>('text', { default: '' })
const modeModel = defineModel('mode', { default: '' })

const hasModeOptions = computed(() => props.modeOptions.length > 0)
const modeLabelText = computed(() => props.modeLabel || t('取り込み方式'))
const fileLabelText = computed(() => props.fileLabel || t('CSV/TSVファイル'))
const dataLabelText = computed(() => props.dataLabel || t('取り込みデータ'))
const submitLabelText = computed(() => props.submitLabel || t('取り込み'))
const cancelLabelText = computed(() => props.cancelLabel || t('取消'))
const closeLabelText = computed(() => props.closeLabel || t('閉じる'))
</script>

<style scoped>
.import-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  z-index: 50;
}

.import-modal {
  width: min(720px, 100%);
  max-height: calc(100vh - 80px);
  overflow: auto;
  gap: var(--space-3);
}

.import-modal-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.import-modal-title-row {
  align-items: center;
  gap: var(--space-2);
}

.option-title {
  font-size: 0.85rem;
  font-weight: 700;
}

.csv-file-input {
  width: 100%;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px;
  background: var(--color-surface);
  color: var(--color-muted);
}

.csv-file-input::file-selector-button {
  appearance: none;
  border: none;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-primary-contrast);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  padding: 8px 12px;
  margin-right: 10px;
  cursor: pointer;
}

.csv-file-input::file-selector-button:hover {
  filter: brightness(0.96);
}

.import-textarea {
  min-height: 160px;
  resize: vertical;
}

.import-example {
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-surface-muted);
  color: var(--color-text);
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
}

.import-modal-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.error {
  color: var(--color-danger);
}
</style>
