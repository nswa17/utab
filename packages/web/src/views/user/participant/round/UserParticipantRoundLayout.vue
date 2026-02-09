<template>
  <section class="stack">
    <div class="row">
      <Button variant="ghost" size="sm" @click="goBack">← {{ $t('ラウンド一覧') }}</Button>
      <h3>{{ $t('ラウンド {round}', { round }) }}</h3>
    </div>
    <nav class="subnav">
      <RouterLink
        v-if="isAudience"
        :to="roundPath('draw')"
        :class="{ active: isTabActive('draw') }"
      >
        {{ $t('対戦表') }}
      </RouterLink>
      <RouterLink
        v-if="isAdjudicator"
        :to="roundPath('ballot/home')"
        :class="{ active: isTabActive('ballot') }"
      >
        {{ $t('スコアシート') }}
      </RouterLink>
      <RouterLink
        v-if="feedbackEnabled"
        :to="feedbackPath"
        :class="{ active: isTabActive('feedback') }"
      >
        {{ $t('フィードバック') }}
      </RouterLink>
    </nav>
    <RouterView />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRoundsStore } from '@/stores/rounds'
import Button from '@/components/common/Button.vue'

const route = useRoute()
const router = useRouter()
const roundsStore = useRoundsStore()

const tournamentId = computed(() => route.params.tournamentId as string)
const participant = computed(() => route.params.participant as string)
const round = computed(() => route.params.round as string)

const isAudience = computed(() => participant.value === 'audience')
const isAdjudicator = computed(() => participant.value === 'adjudicator')
const isSpeaker = computed(() => participant.value === 'speaker')
const roundConfig = computed(() =>
  roundsStore.rounds.find((item) => item.round === Number(round.value))
)
const feedbackEnabled = computed(() => {
  if (isSpeaker.value) {
    return roundConfig.value?.userDefinedData?.evaluate_from_teams !== false
  }
  if (isAdjudicator.value) {
    return roundConfig.value?.userDefinedData?.evaluate_from_adjudicators !== false
  }
  return false
})

function roundPath(tab: string) {
  return `/user/${tournamentId.value}/${participant.value}/rounds/${round.value}/${tab}`
}

function isTabActive(tab: 'draw' | 'ballot' | 'feedback') {
  return route.path.includes(`/rounds/${round.value}/${tab}`)
}

const feedbackPath = computed(() => {
  const base = roundPath('feedback/home')
  if (isAdjudicator.value) return `${base}?filter=adjudicator`
  if (isSpeaker.value) return `${base}?filter=team`
  return base
})

function goBack() {
  router.push(`/user/${tournamentId.value}/${participant.value}/home`)
}

onMounted(() => {
  roundsStore.fetchRounds(tournamentId.value, { forcePublic: true })
})

watch(tournamentId, () => {
  roundsStore.fetchRounds(tournamentId.value, { forcePublic: true })
})
</script>

<style scoped>
.subnav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.subnav a {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.subnav a.router-link-active,
.subnav a.active {
  background: var(--color-primary);
  color: var(--color-primary-contrast);
  border-color: var(--color-primary);
}
</style>
