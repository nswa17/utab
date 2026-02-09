<template>
  <section class="card stack">
    <h4>{{ $t('ラウンド {round}', { round }) }}</h4>
    <p v-if="motionText" class="motion-line">
      <strong>{{ $t('モーション') }}:</strong> {{ motionText }}
    </p>
    <p class="muted">{{ $t('上のタブからドロー確認や入力フォームに進んでください。') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useRoundsStore } from '@/stores/rounds'

const route = useRoute()
const roundsStore = useRoundsStore()
const round = computed(() => route.params.round as string)
const tournamentId = computed(() => route.params.tournamentId as string)
const roundConfig = computed(() =>
  roundsStore.rounds.find((item) => Number(item.round) === Number(round.value))
)
const motionText = computed(() => {
  if (roundConfig.value?.motionOpened !== true) return ''
  const motions = roundConfig.value?.motions
  if (!Array.isArray(motions) || motions.length === 0) return ''
  return String(motions[0] ?? '').trim()
})

function refresh() {
  if (!tournamentId.value) return
  roundsStore.fetchRounds(tournamentId.value, { forcePublic: true })
}

onMounted(() => {
  refresh()
})

watch(tournamentId, () => {
  refresh()
})
</script>

<style scoped>
.motion-line {
  margin: 0;
}
</style>
