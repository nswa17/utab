<template>
  <div class="field">
    <label v-if="label" class="field-label" :for="inputId">
      <span class="field-label-main">
        {{ label }}
        <span v-if="required" class="field-required">*</span>
      </span>
      <span v-if="$slots['label-suffix']" class="field-label-suffix">
        <slot name="label-suffix" :id="inputId" />
      </span>
    </label>
    <div class="field-control">
      <slot :id="inputId" :described-by="describedBy" />
    </div>
    <p v-if="help && !error" class="field-help" :id="helpId">{{ help }}</p>
    <p v-if="error" class="field-error" :id="errorId">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// Keep a module-level counter to ensure unique ids across component instances.
let fieldIndex = 0

const props = withDefaults(
  defineProps<{
    label?: string
    help?: string
    error?: string
    required?: boolean
    id?: string
  }>(),
  {
    label: undefined,
    help: undefined,
    error: undefined,
    required: false,
    id: undefined,
  }
)

const localId = `field-${++fieldIndex}`
const inputId = computed(() => props.id ?? localId)
const helpId = computed(() => `${inputId.value}-help`)
const errorId = computed(() => `${inputId.value}-error`)
const describedBy = computed(() => {
  if (props.error) return errorId.value
  if (props.help) return helpId.value
  return undefined
})
</script>

<style scoped>
.field {
  display: grid;
  gap: 6px;
  font-size: 14px;
}

.field-label {
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2, 8px);
}

.field-label-main {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.field-label-suffix {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}

.field-required {
  color: var(--color-danger);
  margin-left: 4px;
}

.field-help {
  color: var(--color-muted);
  font-size: 12px;
  margin: 0;
}

.field-error {
  color: var(--color-danger);
  font-size: 12px;
  margin: 0;
}

.field:has(.field-error) :deep(input),
.field:has(.field-error) :deep(select),
.field:has(.field-error) :deep(textarea) {
  border-color: var(--color-danger);
}
</style>
