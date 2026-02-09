<template>
  <section class="stack">
    <div class="row">
      <Button variant="ghost" size="sm" @click="goBack">← {{ $t('ラウンド一覧') }}</Button>
      <h3>{{ $t('ラウンド {round}', { round }) }}</h3>
    </div>
    <RouterView />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from '@/components/common/Button.vue'

const route = useRoute()
const router = useRouter()

const tournamentId = computed(() => route.params.tournamentId as string)
const round = computed(() => route.params.round as string)

function goBack() {
  router.push(`/admin/${tournamentId.value}/rounds`)
}
</script>
