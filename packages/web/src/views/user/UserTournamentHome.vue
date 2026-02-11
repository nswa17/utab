<template>
  <section class="stack">
    <LoadingState v-if="checkingAccess" />

    <div v-else-if="needsPassword" class="card stack access-card">
      <h4>{{ $t('大会アクセス') }}</h4>
      <p class="muted">{{ $t('大会パスワードを入力してください。') }}</p>

      <Field :label="$t('パスワード')" v-slot="{ id, describedBy }">
        <input
          v-model="password"
          :id="id"
          :aria-describedby="describedBy"
          type="password"
          autocomplete="current-password"
          @keydown.enter.prevent="enterTournament"
        />
      </Field>

      <Button :loading="submitting" @click="enterTournament">{{ $t('入場') }}</Button>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    </div>

    <div v-else class="card stack">
      <p class="error">{{ errorMessage || $t('アクセス確認に失敗しました。') }}</p>
      <Button variant="secondary" size="sm" to="/user">{{ $t('大会一覧') }}</Button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '@/utils/api'
import { useTournamentStore } from '@/stores/tournament'
import LoadingState from '@/components/common/LoadingState.vue'
import Field from '@/components/common/Field.vue'
import Button from '@/components/common/Button.vue'

const route = useRoute()
const router = useRouter()
const tournamentStore = useTournamentStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const password = ref('')
const checkingAccess = ref(true)
const needsPassword = ref(false)
const submitting = ref(false)
const errorMessage = ref('')

async function ensureTournamentAccess() {
  checkingAccess.value = true
  needsPassword.value = false
  errorMessage.value = ''

  try {
    await api.get(`/tournaments/${tournamentId.value}`)
    await tournamentStore.fetchTournaments()
    router.replace(`/user/${tournamentId.value}/audience/home`)
  } catch (err: any) {
    const status = err?.response?.status
    if (status === 401) {
      needsPassword.value = true
      return
    }
    if (status === 404) {
      errorMessage.value = t('大会情報が見つかりません。')
      return
    }
    errorMessage.value = err?.response?.data?.errors?.[0]?.message ?? t('アクセス確認に失敗しました。')
  } finally {
    checkingAccess.value = false
  }
}

async function enterTournament() {
  if (!password.value) {
    errorMessage.value = t('パスワードを入力してください。')
    return
  }
  submitting.value = true
  errorMessage.value = ''
  try {
    await api.post(`/tournaments/${tournamentId.value}/access`, {
      action: 'enter',
      password: password.value,
    })
    await tournamentStore.fetchTournaments()
    router.replace(`/user/${tournamentId.value}/audience/home`)
  } catch (err: any) {
    errorMessage.value = err?.response?.data?.errors?.[0]?.message ?? t('アクセス確認に失敗しました。')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  ensureTournamentAccess()
})

watch(tournamentId, () => {
  password.value = ''
  ensureTournamentAccess()
})
</script>

<style scoped>
.access-card {
  max-width: 420px;
  width: min(420px, 100%);
  margin: 0 auto;
}

.error {
  color: var(--color-danger);
}
</style>
