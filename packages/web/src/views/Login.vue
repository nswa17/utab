<template>
  <div class="login-page">
    <div class="card stack">
      <div class="row">
        <img class="logo" src="@/assets/logo.svg" alt="UTab" />
        <div>
          <h1>UTab</h1>
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

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const username = ref('')
const password = ref('')

async function handleSubmit() {
  const ok = await auth.login(username.value, password.value)
  if (ok) {
    const redirect = (route.query.redirect as string) || '/admin'
    router.push(redirect)
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
}

.error {
  color: var(--color-danger);
}
</style>
