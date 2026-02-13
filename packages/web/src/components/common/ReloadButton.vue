<template>
  <Button :variant="variant" :size="size" :disabled="disabled || loading" v-bind="buttonAttrs">
    <span class="content" :class="{ loading }">
      <span class="label" :class="{ invisible: loading }">{{ labelText }}</span>
      <span class="icon" :class="{ visible: loading, spinning: loading }" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="2" opacity="0.25" />
          <path d="M10 3a7 7 0 0 1 7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </span>
    </span>
    <span v-if="loading" class="sr-only">{{ labelText }}</span>
  </Button>
</template>

<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/common/Button.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    label?: string
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    loading?: boolean
    disabled?: boolean
    target?: string
  }>(),
  {
    label: '',
    variant: 'ghost',
    size: 'sm',
    loading: false,
    disabled: false,
    target: '',
  }
)

const attrs = useAttrs()
const { t } = useI18n({ useScope: 'global' })
const labelText = computed(() => props.label || t('再読み込み'))
const buttonAttrs = computed(() => {
  const target = String(props.target ?? '').trim()
  const fallbackAriaLabel = target ? t('{target}を再読み込み', { target }) : labelText.value
  const ariaLabel = String(attrs['aria-label'] ?? '').trim() || fallbackAriaLabel
  const title = String(attrs.title ?? '').trim() || ariaLabel
  return {
    ...attrs,
    'aria-label': ariaLabel,
    title,
  }
})
</script>

<style scoped>
.content {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.label.invisible {
  visibility: hidden;
}

.icon {
  position: absolute;
  display: inline-flex;
  width: 14px;
  height: 14px;
  opacity: 0;
}

.icon.visible {
  opacity: 1;
}

.icon svg {
  width: 100%;
  height: 100%;
}

.icon.spinning {
  animation: reload-spin 0.75s linear infinite;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes reload-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
