<template>
  <div class="number-box">
    <Button variant="ghost" size="sm" :disabled="minusDisabled || disabled" @click="onMinus">
      -
    </Button>
    <input
      class="input"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :disabled="disabled"
      @input="onInput"
    />
    <Button variant="ghost" size="sm" :disabled="plusDisabled || disabled" @click="onPlus">
      +
    </Button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/components/common/Button.vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    step?: number
    disabled?: boolean
  }>(),
  {
    min: undefined,
    max: undefined,
    step: 1,
    disabled: false,
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: number): void
}>()

const minusDisabled = computed(() => props.min !== undefined && props.modelValue <= props.min)
const plusDisabled = computed(() => props.max !== undefined && props.modelValue >= props.max)

function clamp(value: number) {
  let next = value
  if (props.min !== undefined) next = Math.max(props.min, next)
  if (props.max !== undefined) next = Math.min(props.max, next)
  return next
}

function update(value: number) {
  if (Number.isNaN(value)) return
  emit('update:modelValue', clamp(value))
}

function onMinus() {
  update(props.modelValue - props.step)
}

function onPlus() {
  update(props.modelValue + props.step)
}

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  update(Number(target.value))
}
</script>

<style scoped>
.number-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  text-align: center;
}
</style>
