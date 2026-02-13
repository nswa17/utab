<template>
  <header class="header">
    <RouterLink to="/" class="brand" aria-label="UTab home">
      <img src="@/assets/logo.svg" alt="UTab" />
      <span>UTab</span>
    </RouterLink>
    <nav v-if="showPrimaryNav" class="primary-nav" aria-label="Primary">
      <RouterLink to="/user" :class="{ active: isPrimaryActive('user') }">
        {{ $t('参加者') }}
      </RouterLink>
      <RouterLink to="/admin" :class="{ active: isPrimaryActive('admin') }">
        {{ $t('大会管理') }}
      </RouterLink>
    </nav>
    <div v-else class="primary-nav-placeholder" aria-hidden="true"></div>
    <div class="actions">
      <span v-if="auth.username" class="muted">{{ auth.username }}</span>
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
      <Button v-if="auth.isAuthenticated" variant="secondary" size="sm" @click="handleLogout">
        {{ $t('ログアウト') }}
      </Button>
      <Button v-else variant="secondary" size="sm" to="/login">{{ $t('運営ログイン') }}</Button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { setLocale, type Locale } from '@/i18n'
import Button from '@/components/common/Button.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { locale } = useI18n({ useScope: 'global' })

const showPrimaryNav = computed(
  () => auth.isAuthenticated && (auth.role === 'superuser' || auth.role === 'organizer')
)

async function handleLogout() {
  await auth.logout()
  router.push('/')
}

function isPrimaryActive(section: 'admin' | 'user') {
  if (section === 'admin') return route.path.startsWith('/admin')
  return route.path.startsWith('/user') || route.path === '/'
}

function changeLocale(next: Locale) {
  if (locale.value === next) return
  setLocale(next)
}
</script>

<style scoped>
.header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 16px 24px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  gap: 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  color: inherit;
  justify-self: start;
}

.brand img {
  width: 28px;
  height: 28px;
}

.primary-nav {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
  justify-self: center;
}

.primary-nav a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-weight: 600;
}

.primary-nav a.active {
  border-color: var(--color-primary);
  background: var(--color-secondary);
  color: var(--color-primary);
}

.primary-nav-placeholder {
  min-height: 36px;
}

.actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  justify-self: end;
}

@media (max-width: 960px) {
  .header {
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      "brand actions"
      "nav nav";
    align-items: start;
    padding: 12px 16px;
    gap: 8px;
  }

  .brand {
    grid-area: brand;
  }

  .primary-nav {
    grid-area: nav;
    justify-content: flex-start;
    flex-wrap: wrap;
    width: 100%;
    gap: 6px;
  }

  .primary-nav a {
    min-height: 32px;
    padding: 0 12px;
    font-size: 0.85rem;
  }

  .primary-nav-placeholder {
    display: none;
  }

  .brand span {
    display: none;
  }

  .actions {
    grid-area: actions;
    justify-content: flex-end;
    flex-wrap: nowrap;
    width: auto;
    min-width: 0;
    gap: 8px;
  }

  .actions > .muted {
    display: none;
  }

  .lang-option {
    min-height: 34px;
    padding: 0 10px;
  }

  .actions :deep(.button) {
    min-height: 34px;
    padding-inline: 10px;
  }
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
</style>
