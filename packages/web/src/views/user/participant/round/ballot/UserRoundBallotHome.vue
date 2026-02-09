<template>
  <section class="stack">
    <p class="muted">{{ $t('スコアシートはドローから選択できます。') }}</p>

    <LoadingState v-if="isLoading" />
    <p v-else-if="teams.error || draws.error || venues.error" class="error">
      {{ teams.error || draws.error || venues.error }}
    </p>

    <div v-else-if="!drawAvailable" class="card stack">
      <p class="muted">{{ $t('ドローと割り当てが公開されるまでスコアシートは利用できません。') }}</p>
    </div>

    <div v-else class="stack">
      <div v-if="draw" class="card stack">
        <p v-if="identityMissing" class="muted">
          {{ $t('参加者ホームでジャッジを選択すると、割当の試合に絞り込めます。') }}
        </p>
        <p v-else-if="identityMatchMissing" class="muted">
          {{ $t('選択したジャッジの割当が見つかりません。') }}
        </p>

        <p class="muted">{{ $t('ドローから試合を選択') }}</p>
        <div v-if="filteredAllocation.length === 0" class="muted">{{ $t('まだ試合がありません。') }}</div>
        <ul v-else class="list">
          <li v-for="(row, index) in filteredAllocation" :key="index" class="list-item">
            <button
              type="button"
              class="match-select"
              @click="startBallotWith(row.teams.gov, row.teams.opp)"
            >
              <div class="row">
                <strong>{{ $t('マッチ番号 {index}', { index: index + 1 }) }}</strong>
                <span class="muted">{{ venueName(row.venue) }}</span>
              </div>
              <div class="match-sides">
                <div class="side-card gov-card">
                  <span class="side-chip">{{ govLabel }}</span>
                  <strong>{{ teamName(row.teams.gov) }}</strong>
                </div>
                <span class="vs-chip">{{ $t('vs') }}</span>
                <div class="side-card opp-card">
                  <span class="side-chip">{{ oppLabel }}</span>
                  <strong>{{ teamName(row.teams.opp) }}</strong>
                </div>
              </div>
            </button>
          </li>
        </ul>
      </div>

      <div class="card stack">
        <p class="muted">{{ $t('手動でチームを選択') }}</p>
        <div class="grid">
          <Field :label="$t('チーム A')" v-slot="{ id, describedBy }">
            <select v-model="teamA" :id="id" :aria-describedby="describedBy">
              <option value="">{{ $t('チームを選択') }}</option>
              <option v-for="team in teams.teams" :key="team._id" :value="team._id">
                {{ team.name }}
              </option>
            </select>
          </Field>
          <Field :label="$t('チーム B')" v-slot="{ id, describedBy }">
            <select v-model="teamB" :id="id" :aria-describedby="describedBy">
              <option value="">{{ $t('チームを選択') }}</option>
              <option v-for="team in teams.teams" :key="team._id" :value="team._id">
                {{ team.name }}
              </option>
            </select>
          </Field>
        </div>
        <Button size="sm" :disabled="!canStart" @click="startBallot">{{ $t('スコアシートへ') }}</Button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTeamsStore } from '@/stores/teams'
import { useDrawsStore } from '@/stores/draws'
import { useVenuesStore } from '@/stores/venues'
import { useTournamentStore } from '@/stores/tournament'
import { useStylesStore } from '@/stores/styles'
import { useRoundsStore } from '@/stores/rounds'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import { useParticipantIdentity } from '@/composables/useParticipantIdentity'
import { getSideShortLabel } from '@/utils/side-labels'

const route = useRoute()
const router = useRouter()
const teams = useTeamsStore()
const draws = useDrawsStore()
const venues = useVenuesStore()
const tournamentStore = useTournamentStore()
const stylesStore = useStylesStore()
const roundsStore = useRoundsStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const participant = computed(() => route.params.participant as string)
const round = computed(() => route.params.round as string)

const { identityId: adjudicatorIdentityId } = useParticipantIdentity(tournamentId, participant)

const teamA = ref('')
const teamB = ref('')

const canStart = computed(
  () => teamA.value !== '' && teamB.value !== '' && teamA.value !== teamB.value
)

const isLoading = computed(
  () =>
    teams.loading ||
    draws.loading ||
    venues.loading ||
    tournamentStore.loading ||
    stylesStore.loading ||
    roundsStore.loading
)
const draw = computed(() => draws.draws.find((item) => item.round === Number(round.value)))
const roundConfig = computed(() =>
  roundsStore.rounds.find((item) => item.round === Number(round.value))
)
const drawAvailable = computed(
  () =>
    Boolean(draw.value) &&
    roundConfig.value?.teamAllocationOpened !== false &&
    roundConfig.value?.adjudicatorAllocationOpened !== false
)
const selectedAdjudicatorId = computed(() => adjudicatorIdentityId.value)
const tournament = computed(() =>
  tournamentStore.tournaments.find((item) => item._id === tournamentId.value)
)
const style = computed(() =>
  stylesStore.styles.find((item) => item.id === tournament.value?.style)
)
const govLabel = computed(() => getSideShortLabel(style.value, 'gov', t('政府')))
const oppLabel = computed(() => getSideShortLabel(style.value, 'opp', t('反対')))

const allocationRows = computed(() => draw.value?.allocation ?? [])
const filteredAllocation = computed(() => {
  if (!selectedAdjudicatorId.value) return allocationRows.value
  return allocationRows.value.filter((row) =>
    [...(row.chairs ?? []), ...(row.panels ?? [])].includes(selectedAdjudicatorId.value)
  )
})
const identityMissing = computed(() => !selectedAdjudicatorId.value)
const identityMatchMissing = computed(
  () => Boolean(selectedAdjudicatorId.value) && filteredAllocation.value.length === 0
)

function teamName(id: string) {
  return teams.teams.find((team) => team._id === id)?.name ?? id
}

function venueName(id?: string) {
  if (!id) return t('会場未定')
  return venues.venues.find((venue) => venue._id === id)?.name ?? id
}

function startBallot() {
  if (!canStart.value) return
  router.push(
    `/user/${tournamentId.value}/${participant.value}/rounds/${round.value}/ballot/entry?teamA=${teamA.value}&teamB=${teamB.value}`
  )
}

function startBallotWith(teamAId: string, teamBId: string) {
  router.push(
    `/user/${tournamentId.value}/${participant.value}/rounds/${round.value}/ballot/entry?teamA=${teamAId}&teamB=${teamBId}`
  )
}

onMounted(() => {
  teams.fetchTeams(tournamentId.value)
  draws.fetchDraws(tournamentId.value, Number(round.value), { forcePublic: true })
  venues.fetchVenues(tournamentId.value)
  tournamentStore.fetchTournaments()
  stylesStore.fetchStyles()
  roundsStore.fetchRounds(tournamentId.value, { forcePublic: true })
})

watch([tournamentId, round], () => {
  teams.fetchTeams(tournamentId.value)
  draws.fetchDraws(tournamentId.value, Number(round.value), { forcePublic: true })
  venues.fetchVenues(tournamentId.value)
  tournamentStore.fetchTournaments()
  stylesStore.fetchStyles()
  roundsStore.fetchRounds(tournamentId.value, { forcePublic: true })
})

watch(
  () => teams.teams,
  (list) => {
    if (!teamA.value && list[0]) {
      teamA.value = list[0]._id
    }
    if (!teamB.value && list[1]) {
      teamB.value = list[1]._id
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.error {
  color: #ef4444;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 12px;
}

.list-item {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.match-select {
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  display: grid;
  gap: 8px;
  cursor: pointer;
}

.match-select:hover {
  background: #f8fafc;
}

.match-select:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: -2px;
}

.match-sides {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
}

.side-card {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 7px 9px;
  min-width: 0;
}

.side-card strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gov-card {
  background: #eff6ff;
}

.opp-card {
  background: #fffbeb;
}

.side-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.vs-chip {
  font-size: 10px;
  color: var(--color-muted);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 1px 7px;
}

@media (max-width: 720px) {
  .match-sides {
    grid-template-columns: 1fr;
  }

  .vs-chip {
    justify-self: center;
  }
}
</style>
