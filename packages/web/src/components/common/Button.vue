<template>
  <component
    :is="component"
    class="btn"
    :class="[`btn--${variant}`, `btn--${size}`, { 'is-loading': loading, 'is-disabled': isDisabled }]"
    :to="to"
    :href="href"
    :type="isButton ? type : undefined"
    :aria-label="ariaLabel"
    :aria-busy="loading ? 'true' : undefined"
    :aria-disabled="isDisabled ? 'true' : undefined"
    :disabled="isButton ? isDisabled : undefined"
    :tabindex="!isButton && isDisabled ? -1 : undefined"
    @click="handleClick"
  >
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <span class="label"><slot /></span>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    loading?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    to?: string
    href?: string
    ariaLabel?: string
  }>(),
  {
    variant: 'primary',
    size: 'md',
    loading: false,
    disabled: false,
    type: 'button',
    to: undefined,
    href: undefined,
    ariaLabel: undefined,
  }
)

const isDisabled = computed(() => props.disabled || props.loading)
const component = computed(() => {
  if (props.to) return RouterLink
  if (props.href) return 'a'
  return 'button'
})
const isButton = computed(() => component.value === 'button')

function handleClick(event: MouseEvent) {
  if (!isDisabled.value) return
  event.preventDefault()
  event.stopPropagation()
}
</script>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.05s ease, box-shadow 0.2s ease, background 0.2s ease,
    border-color 0.2s ease, color 0.2s ease;
  padding: 0 16px;
  min-height: 40px;
  background: var(--color-primary);
  color: var(--color-primary-contrast);
}

.btn:active {
  transform: translateY(1px);
}

.btn--primary {
  background: var(--color-primary);
  color: var(--color-primary-contrast);
}

.btn--secondary {
  background: var(--color-surface-muted);
  color: var(--color-text);
  border-color: var(--color-border);
}

.btn--ghost {
  background: transparent;
  color: var(--color-text);
  border-color: var(--color-border);
}

.btn--danger {
  background: transparent;
  color: var(--color-danger);
  border-color: rgba(239, 68, 68, 0.4);
}

.btn--sm {
  min-height: 36px;
  padding: 0 12px;
  font-size: 0.85rem;
}

.btn--md {
  min-height: 40px;
  padding: 0 16px;
  font-size: 0.95rem;
}

.btn--lg {
  min-height: 44px;
  padding: 0 18px;
  font-size: 1rem;
}

.btn.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
  pointer-events: none;
}

.btn.is-loading {
  cursor: progress;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
