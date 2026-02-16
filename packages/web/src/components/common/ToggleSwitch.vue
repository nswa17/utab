<template>
  <span class="toggle-switch">
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @change="onChange"
    />
    <span class="toggle-slider"></span>
  </span>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean
    disabled?: boolean
    ariaLabel?: string
  }>(),
  {
    disabled: false,
    ariaLabel: '',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

function onChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  emit('update:modelValue', Boolean(target?.checked))
}
</script>

<style scoped>
.toggle-switch {
  position: relative;
  width: 54px;
  height: 30px;
  display: inline-flex;
  align-items: center;
}

.toggle-switch input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  margin: 0;
}

.toggle-slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: #cbd5e1;
  transition: background 0.2s ease;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  top: 3px;
  left: 3px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.35);
  transition: transform 0.2s ease;
}

.toggle-switch input:checked + .toggle-slider {
  background: var(--color-primary);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(24px);
}

.toggle-switch input:focus-visible + .toggle-slider {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.toggle-switch input:disabled + .toggle-slider {
  opacity: 0.7;
}
</style>
