<template>
  <section class="stack">
    <div class="row">
      <Button variant="ghost" size="sm" @click="goBack">← {{ $t('大会一覧') }}</Button>
      <h2>{{ tournament?.name ?? $t('大会詳細') }}</h2>
    </div>
    <LoadingState v-if="sectionLoading" />
    <TournamentNotice v-else-if="showTournamentNotice" :tournament-id="tournamentId" />
    <nav v-if="showSubnav" class="subnav">
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        :class="{ active: isActive(link) }"
        :aria-current="isActive(link) ? 'page' : undefined"
      >
        {{ link.label }}
      </RouterLink>
    </nav>

    <RouterView v-if="!sectionLoading" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTournamentStore } from '@/stores/tournament'
import Button from '@/components/common/Button.vue'
import TournamentNotice from '@/components/common/TournamentNotice.vue'
import LoadingState from '@/components/common/LoadingState.vue'

const route = useRoute()
const router = useRouter()
const tournamentStore = useTournamentStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const tournament = computed(() =>
  tournamentStore.tournaments.find((t) => t._id === tournamentId.value)
)
const sectionLoading = ref(true)
const isTournamentHomeRoute = computed(() => {
  const homePath = `/user/${tournamentId.value}/home`
  const rootPath = `/user/${tournamentId.value}`
  return route.path === homePath || route.path === rootPath
})
const showTournamentNotice = computed(() => !isTournamentHomeRoute.value)
const showSubnav = computed(() => {
  const homePath = `/user/${tournamentId.value}/home`
  const rootPath = `/user/${tournamentId.value}`
  return route.path !== homePath && route.path !== rootPath
})

type ParticipantLink = {
  to: string
  label: string
  participant: 'audience' | 'speaker' | 'adjudicator'
}

const links = computed<ParticipantLink[]>(() => [
  { to: `/user/${tournamentId.value}/audience/home`, label: t('対戦表'), participant: 'audience' },
  {
    to: `/user/${tournamentId.value}/speaker/home`,
    label: t('スピーカー'),
    participant: 'speaker',
  },
  {
    to: `/user/${tournamentId.value}/adjudicator/home`,
    label: t('ジャッジ'),
    participant: 'adjudicator',
  },
])

function isActive(link: ParticipantLink) {
  return route.params.participant === link.participant
}

function goBack() {
  router.push('/user')
}

watch(
  tournamentId,
  async () => {
    sectionLoading.value = true
    try {
      await tournamentStore.fetchTournaments()
    } finally {
      sectionLoading.value = false
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.subnav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.subnav a {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  background: var(--color-surface);
}

.subnav a.router-link-active,
.subnav a.active {
  background: var(--color-primary);
  color: var(--color-primary-contrast);
  border-color: var(--color-primary);
}

@media (max-width: 720px) {
  .subnav {
    gap: var(--space-2);
  }
}
</style>
