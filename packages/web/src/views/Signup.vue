<template>
  <div class="login-page">
    <div class="card stack">
      <div class="row">
        <img class="logo" src="@/assets/logo.svg" alt="UTab" />
        <div>
          <h1>{{ $t('新規登録') }}</h1>
          <p class="muted">{{ $t('アカウントを作成') }}</p>
        </div>
      </div>
      <form class="stack" @submit.prevent="handleSubmit">
        <Field :label="$t('ユーザー名')" required v-slot="{ id, describedBy }">
          <input v-model="username" :id="id" :aria-describedby="describedBy" type="text" />
        </Field>
        <Field :label="$t('パスワード')" required v-slot="{ id, describedBy }">
          <input v-model="password" :id="id" :aria-describedby="describedBy" type="password" />
        </Field>
        <Button type="submit" :loading="loading">
          {{ loading ? $t('登録中...') : $t('登録') }}
        </Button>
        <p v-if="error" class="error">{{ error }}</p>
      </form>
      <RouterLink to="/login" class="muted">{{ $t('ログインに戻る') }}</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '@/utils/api'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'

const router = useRouter()
const { t } = useI18n({ useScope: 'global' })

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

async function handleSubmit() {
  loading.value = true
  error.value = null
  try {
    await api.post('/auth/register', {
      username: username.value,
      password: password.value,
      role: 'organizer',
    })
    router.push('/login')
  } catch (err: any) {
    error.value = err?.response?.data?.errors?.[0]?.message ?? t('登録に失敗しました')
  } finally {
    loading.value = false
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
