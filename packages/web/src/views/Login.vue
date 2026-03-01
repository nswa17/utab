<template>
  <div class="login-page">
    <div class="card stack">
      <div class="row">
        <img class="logo" :src="brandLogoUrl" :alt="brandName" />
        <div>
          <h1 v-if="brandName">{{ brandName }}</h1>
          <p class="muted">{{ $t('大会管理へログイン') }}</p>
        </div>
      </div>
      <form class="stack" @submit.prevent="handleSubmit">
        <Field :label="$t('ユーザー名')" required v-slot="{ id, describedBy }">
          <input v-model="username" :id="id" :aria-describedby="describedBy" type="text" />
        </Field>
        <Field :label="$t('パスワード')" required v-slot="{ id, describedBy }">
          <input v-model="password" :id="id" :aria-describedby="describedBy" type="password" />
        </Field>
        <Button type="submit" :loading="auth.loading">
          {{ auth.loading ? $t('ログイン中...') : $t('ログイン') }}
        </Button>
        <p v-if="auth.error" class="error">{{ auth.error }}</p>
      </form>
      <RouterLink to="/signup" class="muted">{{ $t('新規登録') }}</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import { BRAND_LOGO_URL, BRAND_NAME } from '@/config/branding'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const brandName = BRAND_NAME
const brandLogoUrl = BRAND_LOGO_URL

const username = ref('')
const password = ref('')

function resolveRedirectTarget(rawRedirect: unknown): string {
  const redirect = Array.isArray(rawRedirect) ? rawRedirect[0] : rawRedirect
  if (typeof redirect !== 'string' || !redirect.startsWith('/')) return '/admin'
  if (redirect.startsWith('/login')) return '/admin'
  return redirect
}

async function handleSubmit() {
  if (auth.loading) return
  const ok = await auth.login(username.value.trim(), password.value)
  if (ok) {
    const redirect = resolveRedirectTarget(route.query.redirect)
    try {
      await router.replace(redirect)
    } catch {
      await router.replace('/admin')
    }
  }
}
</script>

<style scoped>
.login-page {
  min-height: calc(100vh - 80px);
  display: grid;
  place-items: center;
}

.logo {
  width: 48px;
  height: 48px;
  display: block;
  object-fit: contain;
  object-position: center;
  flex: 0 0 auto;
}

.error {
  color: var(--color-danger);
}
</style>
