<template>
  <section class="stack">
    <LoadingState v-if="checking" />
    <div v-else-if="blocked" class="card stack">
      <p class="muted">{{ blockReason }}</p>
      <Button variant="secondary" size="sm" :to="listPath">
        {{ $t('大会一覧') }}
      </Button>
    </div>
    <RouterView v-else />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '@/utils/api'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'

const route = useRoute()
const { t } = useI18n({ useScope: 'global' })
const tournamentId = computed(() => {
  const value = route.params.tournamentId
  return typeof value === 'string' ? value.trim() : ''
})
const listPath = computed(() => '/user')

const checking = ref(true)
const blocked = ref(false)
const blockReason = ref('')

async function evaluateAccess() {
  checking.value = true
  blocked.value = false
  blockReason.value = ''
  if (!tournamentId.value) {
    blocked.value = true
    blockReason.value = t('大会情報が見つかりません。')
    checking.value = false
    return
  }

  try {
    await api.get(`/tournaments/${tournamentId.value}`)
  } catch (err: any) {
    const status = err?.response?.status
    blocked.value = true
    if (status === 401) {
      blockReason.value = t('大会ホームでパスワードを入力してください。')
    } else if (status === 404) {
      blockReason.value = t('大会情報が見つかりません。')
    } else {
      blockReason.value = err?.response?.data?.errors?.[0]?.message ?? t('アクセス確認に失敗しました。')
    }
  } finally {
    checking.value = false
  }
}

onMounted(() => {
  evaluateAccess()
})

watch(tournamentId, () => {
  evaluateAccess()
})
</script>
