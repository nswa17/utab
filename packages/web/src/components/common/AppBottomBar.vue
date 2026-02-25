<template>
  <footer class="bottom-bar" role="contentinfo">
    <div class="bottom-bar-inner" :class="{ 'with-devtools-toggle': showDevToolsToggle }">
      <button
        v-if="showDevToolsToggle"
        type="button"
        class="devtools-toggle"
        :aria-expanded="devToolsOpen ? 'true' : 'false'"
        @click="emit('toggle-dev-tools')"
      >
        {{ devToolsOpen ? 'Dev Tools を閉じる' : 'Dev Tools' }}
      </button>

      <div class="lang-switch-shell" role="group" :aria-label="$t('表示言語')">
        <span class="lang-switch-icon" aria-hidden="true">🌐</span>
        <div class="lang-switch-track">
          <button
            type="button"
            class="lang-option"
            :class="{ active: locale === 'ja' }"
            :aria-pressed="locale === 'ja' ? 'true' : 'false'"
            @click="changeLocale('ja')"
          >
            日本語
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
    </div>
  </footer>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { setLocale, type Locale } from '@/i18n'

withDefaults(
  defineProps<{
    showDevToolsToggle?: boolean
    devToolsOpen?: boolean
  }>(),
  {
    showDevToolsToggle: false,
    devToolsOpen: false,
  }
)

const emit = defineEmits<{
  (e: 'toggle-dev-tools'): void
}>()

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
  gap: var(--space-3);
}

.bottom-bar-inner.with-devtools-toggle {
  justify-content: space-between;
}

.devtools-toggle {
  min-height: 34px;
  border-radius: 999px;
  border: 1px solid #b6c2d6;
  background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
  color: #0f172a;
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0 14px;
  cursor: pointer;
}

.devtools-toggle:focus-visible {
  outline: 3px solid rgba(59, 130, 246, 0.25);
  outline-offset: 1px;
}

.lang-switch-shell {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 5px;
  border: 1px solid #d7dde8;
  border-radius: 999px;
  background: linear-gradient(180deg, #f8fafd 0%, #eef2f7 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 1px 2px rgba(15, 23, 42, 0.08);
}

.lang-switch-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #64748b;
  font-size: 14px;
  line-height: 1;
}

.lang-switch-track {
  display: inline-grid;
  grid-auto-flow: column;
  gap: 4px;
}

.lang-option {
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: #64748b;
  font-size: 0.85rem;
  font-weight: 700;
  min-height: 34px;
  padding: 0 14px;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.lang-option:hover {
  color: #0f172a;
  background: rgba(255, 255, 255, 0.64);
}

.lang-option.active {
  border-color: #bfdbfe;
  background: #ffffff;
  color: #1d4ed8;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
}

.lang-option:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.28);
  outline-offset: 1px;
}

@media (max-width: 640px) {
  .bottom-bar-inner {
    justify-content: center;
    flex-wrap: wrap;
  }

  .lang-option {
    min-height: 34px;
    padding: 0 10px;
  }

  .devtools-toggle {
    min-width: 140px;
  }

  .lang-switch-icon {
    display: none;
  }
}
</style>
