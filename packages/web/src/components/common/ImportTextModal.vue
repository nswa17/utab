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

      <p v-if="description" class="muted small">{{ description }}</p>
      <pre v-if="example" class="import-example">{{ example }}</pre>
      <div v-if="templateContent || hasHeaderGuide" class="row template-actions">
        <Button
          v-if="templateContent"
          variant="secondary"
          size="sm"
          class="template-download-button"
          @click="downloadTemplate"
        >
          {{ templateLabelText }}
        </Button>
        <Button
          v-if="hasHeaderGuide"
          variant="ghost"
          size="sm"
          class="header-guide-button"
          @click="showHeaderGuide = true"
        >
          {{ headerGuideLabelText }}
        </Button>
      </div>
      <p v-if="error" class="error import-error">{{ error }}</p>

      <div class="row import-modal-actions">
        <Button variant="ghost" size="sm" @click="emit('close')">{{ cancelLabelText }}</Button>
        <Button size="sm" :disabled="disabled" @click="emit('submit')">
          {{ submitLabelText }}
        </Button>
      </div>
    </section>
  </div>

  <teleport to="body">
    <div
      v-if="showHeaderGuide"
      class="header-guide-backdrop"
      role="presentation"
      @click.self="closeHeaderGuide"
    >
      <section class="header-guide-modal card stack" role="dialog" aria-modal="true">
        <div class="row header-guide-head">
          <strong>{{ headerGuideTitleText }}</strong>
          <Button variant="ghost" size="sm" @click="closeHeaderGuide">{{ closeLabelText }}</Button>
        </div>
        <p class="muted small">{{ guideIntroText }}</p>
        <div class="header-guide-table-wrap">
          <table class="header-guide-table">
            <thead>
              <tr>
                <th>{{ headerColumnText }}</th>
                <th>{{ descriptionColumnText }}</th>
                <th>{{ exampleColumnText }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in headerGuideRows" :key="row.header">
                <td class="header-guide-key">
                  <code>{{ row.header }}</code>
                  <span class="header-guide-tag" :class="{ optional: !row.required }">
                    {{ row.required ? requiredLabelText : optionalLabelText }}
                  </span>
                </td>
                <td>{{ row.description }}</td>
                <td>
                  <code v-if="row.example">{{ row.example }}</code>
                  <span v-else class="muted">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/common/Button.vue'
import HelpTip from '@/components/common/HelpTip.vue'

type ModeOption = {
  value: string
  label: string
}

type HeaderGuideRow = {
  header: string
  required: boolean
  description: string
  example?: string
}

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    helpText?: string
    modeLabel?: string
    modeOptions?: ModeOption[]
    fileLabel?: string
    fileAccept?: string
    description?: string
    example?: string
    templateContent?: string
    templateFilename?: string
    templateLabel?: string
    headerGuideTitle?: string
    headerGuideRows?: HeaderGuideRow[]
    headerGuideLabel?: string
    error?: string | null
    submitLabel?: string
    cancelLabel?: string
    closeLabel?: string
    disabled?: boolean
    showFileInput?: boolean
  }>(),
  {
    helpText: '',
    modeLabel: '',
    modeOptions: () => [],
    fileLabel: '',
    fileAccept: '.csv,.tsv,text/csv,text/tab-separated-values,text/plain',
    description: '',
    example: '',
    templateContent: '',
    templateFilename: '',
    templateLabel: '',
    headerGuideTitle: '',
    headerGuideRows: () => [],
    headerGuideLabel: '',
    error: '',
    submitLabel: '',
    cancelLabel: '',
    closeLabel: '',
    disabled: false,
    showFileInput: true,
  }
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit'): void
  (event: 'file-change', payload: Event): void
}>()

const { t } = useI18n({ useScope: 'global' })
const modeModel = defineModel('mode', { default: '' })
const showHeaderGuide = ref(false)

const hasModeOptions = computed(() => props.modeOptions.length > 0)
const hasHeaderGuide = computed(() => props.headerGuideRows.length > 0)
const modeLabelText = computed(() => props.modeLabel || t('取り込み方式'))
const fileLabelText = computed(() => props.fileLabel || t('CSV/TSVファイル'))
const templateLabelText = computed(
  () => props.templateLabel || t('CSVテンプレートをダウンロード')
)
const headerGuideLabelText = computed(() => props.headerGuideLabel || t('ヘッダー説明を見る'))
const headerGuideTitleText = computed(() => props.headerGuideTitle || t('CSVヘッダー説明'))
const submitLabelText = computed(() => props.submitLabel || t('取り込み'))
const cancelLabelText = computed(() => props.cancelLabel || t('取消'))
const closeLabelText = computed(() => props.closeLabel || t('閉じる'))
const headerColumnText = computed(() => t('ヘッダー'))
const descriptionColumnText = computed(() => t('意味'))
const exampleColumnText = computed(() => t('入力例'))
const requiredLabelText = computed(() => t('必須'))
const optionalLabelText = computed(() => t('任意'))
const guideIntroText = computed(() =>
  t('列名は変更せず、値のみ編集してください。複数値は | または ; で区切れます。')
)

function downloadTemplate() {
  if (!props.templateContent) return
  const bom = '\uFEFF'
  const blob = new Blob([bom, props.templateContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = props.templateFilename.trim() || 'import-template.csv'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function closeHeaderGuide() {
  showHeaderGuide.value = false
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (!showHeaderGuide.value) return
  event.stopPropagation()
  showHeaderGuide.value = false
}

watch(
  () => props.open,
  (nextOpen) => {
    if (!nextOpen) showHeaderGuide.value = false
  }
)

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
})
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

.import-error {
  white-space: pre-line;
  line-height: 1.5;
}

.template-download-button {
  width: 100%;
}

.template-actions {
  gap: var(--space-2);
  flex-wrap: wrap;
}

.template-actions > * {
  flex: 1 1 240px;
}

.header-guide-button {
  width: 100%;
}

.header-guide-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  z-index: 60;
}

.header-guide-modal {
  width: min(920px, 100%);
  max-height: calc(100vh - 64px);
  overflow: hidden;
  gap: var(--space-3);
}

.header-guide-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.header-guide-table-wrap {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: auto;
  background: linear-gradient(
    180deg,
    var(--color-surface-muted) 0,
    var(--color-surface-muted) 42px,
    var(--color-surface) 42px,
    var(--color-surface) 100%
  );
}

.header-guide-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  line-height: 1.5;
}

.header-guide-table th,
.header-guide-table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}

.header-guide-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  font-weight: 700;
  background: transparent;
}

.header-guide-table tbody tr:last-child td {
  border-bottom: none;
}

.header-guide-key {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 200px;
}

.header-guide-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.02em;
  color: var(--color-success);
  background: rgba(22, 163, 74, 0.14);
}

.header-guide-tag.optional {
  color: var(--color-muted);
  background: var(--color-surface-muted);
}

.import-modal-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.error {
  color: var(--color-danger);
}

@media (max-width: 768px) {
  .header-guide-modal {
    max-height: calc(100vh - 32px);
  }

  .header-guide-table th,
  .header-guide-table td {
    padding: 8px 10px;
  }

  .header-guide-key {
    min-width: 168px;
  }
}
</style>
