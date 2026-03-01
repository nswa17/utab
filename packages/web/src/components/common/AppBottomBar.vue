<template>
  <footer class="bottom-bar" role="contentinfo">
    <div class="bottom-bar-inner">
      <span class="bottom-bar-label">{{ $t('表示言語') }}</span>
      <div class="lang-switch" role="group" :aria-label="$t('表示言語')">
        <button
          type="button"
          class="lang-option"
          :class="{ active: locale === 'ja' }"
          :aria-pressed="locale === 'ja' ? 'true' : 'false'"
          @click="changeLocale('ja')"
        >
          {{ $t('日本語') }}
        </button>
        <button
          type="button"
          class="lang-option"
          :class="{ active: locale === 'en' }"
          :aria-pressed="locale === 'en' ? 'true' : 'false'"
          @click="changeLocale('en')"
        >
          {{ $t('English') }}
        </button>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { setLocale, type Locale } from '@/i18n'

const { locale } = useI18n({ useScope: 'global' })

function changeLocale(next: Locale) {
  if (locale.value === next) return
  setLocale(next)
}
</script>

<style scoped>
.bottom-bar {
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
}

.bottom-bar-inner {
  width: min(1200px, 100%);
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.bottom-bar-label {
  color: var(--color-muted);
  font-size: 0.85rem;
  font-weight: 600;
}

.lang-switch {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  overflow: hidden;
  background: var(--color-surface-muted);
}

.lang-option {
  border: none;
  background: transparent;
  color: var(--color-muted);
  font-size: 0.85rem;
  font-weight: 600;
  min-height: 36px;
  padding: 0 12px;
  cursor: pointer;
}

.lang-option + .lang-option {
  border-left: 1px solid var(--color-border);
}

.lang-option.active {
  background: var(--color-primary);
  color: var(--color-primary-contrast);
}

.lang-option:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: -2px;
}

@media (max-width: 640px) {
  .bottom-bar-inner {
    justify-content: center;
  }

  .bottom-bar-label {
    display: none;
  }

  .lang-option {
    min-height: 34px;
    padding: 0 10px;
  }
}
</style>
