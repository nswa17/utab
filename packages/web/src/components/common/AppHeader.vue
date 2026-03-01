<template>
  <header class="header">
    <RouterLink to="/" class="brand" :aria-label="brandHomeAriaLabel">
      <img :src="brandLogoUrl" :alt="brandName" />
      <span>{{ brandName }}</span>
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
import { useAuthStore } from '@/stores/auth'
import Button from '@/components/common/Button.vue'
import { BRAND_HOME_ARIA_LABEL, BRAND_LOGO_URL, BRAND_NAME } from '@/config/branding'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const brandName = BRAND_NAME
const brandLogoUrl = BRAND_LOGO_URL
const brandHomeAriaLabel = BRAND_HOME_ARIA_LABEL

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
  display: block;
  object-fit: contain;
  object-position: center;
  flex: 0 0 auto;
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

  .actions :deep(.button) {
    min-height: 34px;
    padding-inline: 10px;
  }
}
</style>
