<template>
  <section class="stack">
    <p class="muted">{{ $t('評価するジャッジを選択してください。') }}</p>

    <LoadingState v-if="isLoading" />
    <p
      v-else-if="
        adjudicators.error ||
        draws.error ||
        rounds.error ||
        teams.error ||
        speakersStore.error
      "
      class="error"
    >
      {{
        adjudicators.error ||
        draws.error ||
        rounds.error ||
        teams.error ||
        speakersStore.error
      }}
    </p>

    <div v-else-if="!evaluationEnabled" class="card stack">
      <p class="muted">{{ $t('このラウンドではフィードバックが無効です。') }}</p>
    </div>

    <div v-else-if="!drawAvailable" class="card stack">
      <p class="muted">{{ $t('ドローと割り当てが公開されるまでフィードバックは利用できません。') }}</p>
    </div>

    <div v-else class="card stack">
      <p v-if="identityMissing" class="muted">{{ identityHint }}</p>
      <p v-else-if="identityMatchMissing" class="muted">{{ identityMatchMessage }}</p>

      <div v-if="filteredAdjudicators.length === 0" class="muted">
        {{ $t('ジャッジが登録されていません。') }}
      </div>
      <ul v-else class="list">
        <li v-for="judge in filteredAdjudicators" :key="judge._id" class="list-item">
          <button type="button" class="judge-select" @click="openFeedback(judge._id)">
            <strong>{{ judge.name }}</strong>
            <span class="muted small">{{ $t('タップしてフィードバック入力') }}</span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { useDrawsStore } from '@/stores/draws'
import { useRoundsStore } from '@/stores/rounds'
import { useTeamsStore } from '@/stores/teams'
import { useSpeakersStore } from '@/stores/speakers'
import LoadingState from '@/components/common/LoadingState.vue'
import { useParticipantIdentity } from '@/composables/useParticipantIdentity'

const route = useRoute()
const router = useRouter()
const adjudicators = useAdjudicatorsStore()
const draws = useDrawsStore()
const rounds = useRoundsStore()
const teams = useTeamsStore()
const speakersStore = useSpeakersStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const participant = computed(() => route.params.participant as string)
const round = computed(() => route.params.round as string)

const { identityId: teamIdentityId } = useParticipantIdentity(tournamentId, participant)
const { identityId: speakerIdentityId } = useParticipantIdentity(tournamentId, participant, 'speaker')
const { identityId: judgeFeedbackTeamIdentityId } = useParticipantIdentity(
  tournamentId,
  participant,
  'team-feedback-team'
)
const { identityId: judgeFeedbackSpeakerIdentityId } = useParticipantIdentity(
  tournamentId,
  participant,
  'team-feedback-speaker'
)

const isLoading = computed(
  () =>
    adjudicators.loading ||
    draws.loading ||
    rounds.loading ||
    teams.loading ||
    speakersStore.loading
)

const draw = computed(() => draws.draws.find((item) => item.round === Number(round.value)))
const roundConfig = computed(() => rounds.rounds.find((item) => item.round === Number(round.value)))
const teamAllocationVisible = computed(() => roundConfig.value?.teamAllocationOpened !== false)
const adjudicatorAllocationVisible = computed(
  () => roundConfig.value?.adjudicatorAllocationOpened !== false
)
const drawAvailable = computed(
  () =>
    Boolean(draw.value?.drawOpened) &&
    teamAllocationVisible.value &&
    adjudicatorAllocationVisible.value
)
const filter = computed(() => (typeof route.query.filter === 'string' ? route.query.filter : ''))
const actorMode = computed<'team' | 'adjudicator'>(() => {
  if (typeof route.query.actor === 'string' && route.query.actor === 'team') return 'team'
  if (participant.value === 'speaker') return 'team'
  return 'adjudicator'
})
const evaluatorMode = computed(() => roundConfig.value?.userDefinedData?.evaluator_in_team ?? 'team')

function resolveTeamIdForSpeaker(speakerId: string) {
  if (!speakerId) return ''
  const roundNumber = Number(round.value)
  const fromDetail = teams.teams.find((team) =>
    team.details?.some(
      (detail: any) =>
        Number(detail.r) === roundNumber &&
        (detail.speakers ?? []).map((id: string) => String(id)).includes(String(speakerId))
    )
  )
  if (fromDetail) return fromDetail._id
  const speaker = speakersStore.speakers.find((item) => item._id === speakerId)
  if (!speaker) return ''
  const fromName = teams.teams.find((team) =>
    team.speakers?.some((sp: any) => sp.name === speaker.name)
  )
  return fromName?._id ?? ''
}

const selectedTeamId = computed(() => {
  if (participant.value === 'speaker') {
    if (evaluatorMode.value === 'speaker') return resolveTeamIdForSpeaker(speakerIdentityId.value)
    return teamIdentityId.value
  }
  if (participant.value === 'adjudicator' && actorMode.value === 'team') {
    if (evaluatorMode.value === 'speaker') {
      return resolveTeamIdForSpeaker(judgeFeedbackSpeakerIdentityId.value)
    }
    return judgeFeedbackTeamIdentityId.value
  }
  return ''
})

const selectedAdjudicatorId = computed(() => {
  if (participant.value !== 'adjudicator') return teamIdentityId.value
  return actorMode.value === 'adjudicator' ? teamIdentityId.value : ''
})
const selectedSpeakerId = computed(() =>
  participant.value === 'speaker' && evaluatorMode.value === 'speaker'
    ? speakerIdentityId.value
    : participant.value === 'adjudicator' &&
        actorMode.value === 'team' &&
        evaluatorMode.value === 'speaker'
      ? judgeFeedbackSpeakerIdentityId.value
      : ''
)
const allocationRows = computed(() => draw.value?.allocation ?? [])

const rowForTeam = computed(() => {
  if (!selectedTeamId.value) return null
  return (
    allocationRows.value.find(
      (row) => row.teams.gov === selectedTeamId.value || row.teams.opp === selectedTeamId.value
    ) ?? null
  )
})

const rowForAdjudicator = computed(() => {
  if (!selectedAdjudicatorId.value) return null
  return (
    allocationRows.value.find((row) =>
      [...(row.chairs ?? []), ...(row.panels ?? []), ...(row.trainees ?? [])].includes(
        selectedAdjudicatorId.value
      )
    ) ?? null
  )
})

const allocationAdjudicators = computed(() => {
  const allocation = allocationRows.value
  const chairs = allocation.flatMap((row) => row.chairs ?? [])
  const panels = allocation.flatMap((row) => row.panels ?? [])
  const trainees = allocation.flatMap((row) => row.trainees ?? [])

  if ((participant.value === 'speaker' || actorMode.value === 'team') && selectedTeamId.value) {
    const row = rowForTeam.value
    if (!row) return []
    const chairsOnly = roundConfig.value?.userDefinedData?.chairs_always_evaluated === true
    return Array.from(
      new Set(chairsOnly ? row.chairs ?? [] : [...(row.chairs ?? []), ...(row.panels ?? [])])
    )
  }

  if (participant.value === 'adjudicator' && selectedAdjudicatorId.value) {
    const row = rowForAdjudicator.value
    if (!row) return []
    return Array.from(
      new Set(
        [...(row.chairs ?? []), ...(row.panels ?? []), ...(row.trainees ?? [])].filter(
          (id) => id !== selectedAdjudicatorId.value
        )
      )
    )
  }

  if (filter.value === 'team') {
    const chairsOnly = roundConfig.value?.userDefinedData?.chairs_always_evaluated === true
    return Array.from(new Set(chairsOnly ? chairs : [...chairs, ...panels]))
  }
  return Array.from(new Set([...chairs, ...panels, ...trainees]))
})

const filteredAdjudicators = computed(() => {
  if (allocationAdjudicators.value.length === 0) {
    if (identityMatchMissing.value) return []
    return adjudicators.adjudicators
  }
  return adjudicators.adjudicators.filter((adj) => allocationAdjudicators.value.includes(adj._id))
})

const evaluationEnabled = computed(() => {
  if (participant.value === 'speaker') {
    return roundConfig.value?.userDefinedData?.evaluate_from_teams !== false
  }
  if (participant.value === 'adjudicator') {
    if (actorMode.value === 'team') {
      return roundConfig.value?.userDefinedData?.evaluate_from_teams !== false
    }
    return roundConfig.value?.userDefinedData?.evaluate_from_adjudicators !== false
  }
  return true
})

const identityMissing = computed(() => {
  if (participant.value === 'speaker') {
    if (evaluatorMode.value === 'speaker') return !selectedSpeakerId.value
    return !teamIdentityId.value
  }
  if (participant.value === 'adjudicator') {
    if (actorMode.value === 'team') {
      if (evaluatorMode.value === 'speaker') return !selectedSpeakerId.value
      return !judgeFeedbackTeamIdentityId.value
    }
    return !selectedAdjudicatorId.value
  }
  return false
})
const identityMatchMissing = computed(() => {
  if (participant.value === 'speaker') {
    if (evaluatorMode.value === 'speaker') {
      return Boolean(selectedSpeakerId.value) && !selectedTeamId.value
    }
    return Boolean(teamIdentityId.value) && !rowForTeam.value
  }
  if (participant.value === 'adjudicator') {
    if (actorMode.value === 'team') {
      if (evaluatorMode.value === 'speaker') {
        return Boolean(selectedSpeakerId.value) && !selectedTeamId.value
      }
      return Boolean(judgeFeedbackTeamIdentityId.value) && !rowForTeam.value
    }
    return Boolean(selectedAdjudicatorId.value) && !rowForAdjudicator.value
  }
  return false
})

const identityHint = computed(() => {
  if (participant.value === 'speaker') {
    return evaluatorMode.value === 'speaker'
      ? t('参加者ホームでチームとスピーカーを選択すると、評価対象を絞り込めます。')
      : t('参加者ホームでチームを選択すると、評価対象を絞り込めます。')
  }
  if (participant.value === 'adjudicator') {
    if (actorMode.value === 'team') {
      return evaluatorMode.value === 'speaker'
        ? t('参加者ホームでチームとスピーカーを選択すると、評価対象を絞り込めます。')
        : t('参加者ホームでチームを選択すると、評価対象を絞り込めます。')
    }
    return t('参加者ホームでジャッジを選択すると、評価対象を絞り込めます。')
  }
  return ''
})

const identityMatchMessage = computed(() => {
  if (participant.value === 'speaker') {
    return evaluatorMode.value === 'speaker'
      ? t('選択したスピーカーの割当が見つかりません。')
      : t('選択したチームの割当が見つかりません。')
  }
  if (participant.value === 'adjudicator') {
    if (actorMode.value === 'team') {
      return evaluatorMode.value === 'speaker'
        ? t('選択したスピーカーの割当が見つかりません。')
        : t('選択したチームの割当が見つかりません。')
    }
    return t('選択したジャッジの割当が見つかりません。')
  }
  return ''
})

function feedbackPath(id: string) {
  const query = new URLSearchParams()
  if (filter.value) query.set('filter', filter.value)
  query.set('actor', actorMode.value)
  const suffix = query.toString()
  return `/user/${tournamentId.value}/${participant.value}/rounds/${round.value}/feedback/${id}${
    suffix ? `?${suffix}` : ''
  }`
}

function openFeedback(id: string) {
  router.push(feedbackPath(id))
}

onMounted(() => {
  adjudicators.fetchAdjudicators(tournamentId.value)
  draws.fetchDraws(tournamentId.value, Number(round.value), { forcePublic: true })
  rounds.fetchRounds(tournamentId.value, { forcePublic: true })
  teams.fetchTeams(tournamentId.value)
  speakersStore.fetchSpeakers(tournamentId.value)
})

watch([tournamentId, round], () => {
  adjudicators.fetchAdjudicators(tournamentId.value)
  draws.fetchDraws(tournamentId.value, Number(round.value), { forcePublic: true })
  rounds.fetchRounds(tournamentId.value, { forcePublic: true })
  teams.fetchTeams(tournamentId.value)
  speakersStore.fetchSpeakers(tournamentId.value)
})
</script>

<style scoped>
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 12px;
}

.list-item {
  padding: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.judge-select {
  border: none;
  width: 100%;
  background: transparent;
  text-align: left;
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  cursor: pointer;
}

.judge-select:hover {
  background: #f8fafc;
}

.judge-select:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: -2px;
}

.error {
  color: #ef4444;
}
</style>
