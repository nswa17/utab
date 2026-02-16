<template>
  <CompiledSnapshotSelect
    :model-value="modelValue"
    :label="labelText"
    :options="normalizedOptions"
    :disabled="disabled"
    @update:model-value="onUpdate"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CompiledSnapshotSelect from '@/components/common/CompiledSnapshotSelect.vue'
import { formatCompiledSnapshotOptionLabel } from '@/utils/compiled-snapshot'

type DiffBaselineOption = {
  compiledId: string
  rounds: number[]
  createdAt?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: DiffBaselineOption[]
    label?: string
    disabled?: boolean
  }>(),
  {
    label: '',
    disabled: false,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const { t, locale } = useI18n({ useScope: 'global' })

const labelText = computed(() => props.label || t('差分比較'))
const localeTag = computed(() => (locale.value === 'ja' ? 'ja-JP' : 'en-US'))
const normalizedOptions = computed(() =>
  props.options.map((option) => ({
    value: option.compiledId,
    label: formatCompiledSnapshotOptionLabel(option, localeTag.value),
  }))
)

function onUpdate(value: string) {
  emit('update:modelValue', value)
}
</script>
