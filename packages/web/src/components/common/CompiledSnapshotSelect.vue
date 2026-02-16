<template>
  <label class="stack compiled-snapshot-select">
    <span class="muted small">{{ label }}</span>
    <select :value="modelValue" :disabled="disabled" @change="onChange">
      <option v-if="placeholder" value="">{{ placeholder }}</option>
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>

<script setup lang="ts">
type CompiledSnapshotSelectOption = {
  value: string
  label: string
}

withDefaults(
  defineProps<{
    modelValue: string
    label: string
    options: CompiledSnapshotSelectOption[]
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    placeholder: '',
    disabled: false,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

function onChange(event: Event) {
  const target = event.target as HTMLSelectElement | null
  emit('update:modelValue', String(target?.value ?? ''))
}
</script>

<style scoped>
.compiled-snapshot-select {
  min-width: 220px;
}
</style>
