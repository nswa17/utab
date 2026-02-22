<template>
  <section class="stack">
    <div v-if="isAudience" class="row">
      <Button variant="ghost" size="sm" @click="goBack">← {{ $t('ラウンド一覧') }}</Button>
      <h3>{{ $t('ラウンド {round}', { round }) }}</h3>
    </div>
    <nav v-if="isAudience" class="subnav">
      <RouterLink
        :to="roundPath('draw')"
        :class="{ active: isTabActive('draw') }"
      >
        {{ $t('対戦表') }}
      </RouterLink>
    </nav>
    <div v-else class="row task-header">
      <Button variant="ghost" size="sm" @click="goTaskList">← {{ taskListLabel }}</Button>
      <h3>{{ currentTaskLabel }}</h3>
    </div>
    <RouterView />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRoundsStore } from '@/stores/rounds'
import Button from '@/components/common/Button.vue'
import { useParticipantMode, appendParticipantMode } from '@/composables/useParticipantMode'

const route = useRoute()
const router = useRouter()
const { t } = useI18n({ useScope: 'global' })
const roundsStore = useRoundsStore()

const tournamentId = computed(() => route.params.tournamentId as string)
const { participantMode } = useParticipantMode(route)
const round = computed(() => route.params.round as string)

const isAudience = computed(() => participantMode.value === 'audience')
const isEvaluationEntry = computed(() => {
  if (route.path.includes('/ballot/entry')) return true
  return /\/feedback\/[^/]+$/.test(route.path)
})
const roundConfig = computed(() =>
  roundsStore.rounds.find((item) => item.round === Number(round.value))
)
const taskListLabel = computed(() =>
  isEvaluationEntry.value ? t('大会ホームに戻る') : t('参加者ホーム')
)

function roundPath(tab: string) {
  const query = new URLSearchParams()
  appendParticipantMode(query, participantMode.value)
  const querySuffix = query.toString()
  if (tab === 'draw') {
    return `/user/${tournamentId.value}/rounds/${round.value}/home${
      querySuffix ? `?${querySuffix}` : ''
    }`
  }
  return `/user/${tournamentId.value}/rounds/${round.value}/${tab}${querySuffix ? `?${querySuffix}` : ''}`
}

function isTabActive(tab: 'draw' | 'ballot' | 'feedback') {
  if (tab === 'draw') {
    return (
      route.path.includes(`/rounds/${round.value}/draw`) ||
      route.path.includes(`/rounds/${round.value}/home`)
    )
  }
  return route.path.includes(`/rounds/${round.value}/${tab}`)
}

const currentTaskLabel = computed(() => {
  if (route.path.includes('/ballot/')) return t('チーム評価')
  if (route.path.includes('/feedback/')) return t('ジャッジ評価')
  if (isAudience.value && route.path.includes(`/rounds/${round.value}/home`)) return t('対戦表')
  if (route.path.includes('/draw')) return t('対戦表')
  return t('ラウンド {round}', { round: round.value })
})

function goBack() {
  const query = new URLSearchParams()
  appendParticipantMode(query, participantMode.value)
  const suffix = query.toString()
  router.push(`/user/${tournamentId.value}/home${suffix ? `?${suffix}` : ''}`)
}

function goTaskList() {
  if (isEvaluationEntry.value) {
    router.push(`/user/${tournamentId.value}/home`)
    return
  }
  const query = new URLSearchParams()
  appendParticipantMode(query, participantMode.value)
  const suffix = query.toString()
  router.push(`/user/${tournamentId.value}/rounds/${round.value}/home${suffix ? `?${suffix}` : ''}`)
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

.task-header {
  align-items: center;
  gap: var(--space-2);
}
</style>
