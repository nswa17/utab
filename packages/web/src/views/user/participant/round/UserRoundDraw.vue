<template>
  <section class="stack">
    <div class="row header-row">
      <h4>{{ $t('ラウンド {round} ドロー', { round }) }}</h4>
      <div class="row header-actions">
        <div class="view-switch" role="group" :aria-label="$t('表示形式')">
          <button
            type="button"
            class="view-button"
            :class="{ active: viewMode === 'card' }"
            :aria-pressed="viewMode === 'card' ? 'true' : 'false'"
            :title="$t('カード表示')"
            @click="viewMode = 'card'"
          >
            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
              <rect x="3" y="4" width="14" height="5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
              <rect x="3" y="11" width="14" height="5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
            </svg>
          </button>
          <button
            type="button"
            class="view-button"
            :class="{ active: viewMode === 'table' }"
            :aria-pressed="viewMode === 'table' ? 'true' : 'false'"
            :title="$t('テーブル表示')"
            @click="viewMode = 'table'"
          >
            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
              <rect x="3" y="4" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
              <path d="M3 8h14M8 4v12M13 4v12" fill="none" stroke="currentColor" stroke-width="1.6" />
            </svg>
          </button>
        </div>
        <ReloadButton @click="refresh" :disabled="isLoading" :loading="isLoading" />
      </div>
    </div>

    <div v-if="isPartiallyVisible" class="row visibility-banner" role="status" aria-live="polite">
      <span class="visibility-banner-title">{{ $t('対戦表は一部のみ公開されています。') }}</span>
      <div class="row visibility-chip-list">
        <span class="visibility-chip" :class="teamAllocationVisible ? 'is-open' : 'is-closed'">
          {{ $t('チーム') }}: {{ teamAllocationVisible ? $t('公開') : $t('非公開') }}
        </span>
        <span class="visibility-chip" :class="adjudicatorAllocationVisible ? 'is-open' : 'is-closed'">
          {{ $t('ジャッジ') }}: {{ adjudicatorAllocationVisible ? $t('公開') : $t('非公開') }}
        </span>
      </div>
    </div>

    <LoadingState v-if="isLoading" />
    <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>
    <div
      v-else-if="!draw || !anyAllocationVisible"
      class="row visibility-banner"
      role="status"
      aria-live="polite"
    >
      <span class="visibility-banner-title">{{ $t('ドローは未公開です。') }}</span>
      <div class="row visibility-chip-list">
        <span class="visibility-chip" :class="teamAllocationVisible ? 'is-open' : 'is-closed'">
          {{ $t('チーム') }}: {{ teamAllocationVisible ? $t('公開') : $t('非公開') }}
        </span>
        <span class="visibility-chip" :class="adjudicatorAllocationVisible ? 'is-open' : 'is-closed'">
          {{ $t('ジャッジ') }}: {{ adjudicatorAllocationVisible ? $t('公開') : $t('非公開') }}
        </span>
      </div>
    </div>

    <div v-else class="stack">
      <div v-if="rows.length === 0" class="muted">{{ $t('ドローが登録されていません。') }}</div>
      <template v-else-if="viewMode === 'card'">
        <div v-for="(row, index) in cardRows" :key="index" class="card stack">
          <div class="row">
            <span class="muted">{{ venueName(row.venue) }}</span>
          </div>
          <div v-if="teamAllocationVisible" class="match-sides">
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
          <div v-if="adjudicatorAllocationVisible" class="stack draw-adjudicators">
            <div class="draw-adj-row">
              <span class="draw-adj-label">{{ $t('チェア:') }}</span>
              <span class="draw-adj-names">{{ adjudicatorNames(row.chairs) }}</span>
            </div>
            <div class="draw-adj-row">
              <span class="draw-adj-label">{{ $t('パネル:') }}</span>
              <span class="draw-adj-names">{{ adjudicatorNames(row.panels) }}</span>
            </div>
            <div class="draw-adj-row">
              <span class="draw-adj-label">{{ $t('トレーニー:') }}</span>
              <span class="draw-adj-names">{{ adjudicatorNames(row.trainees) }}</span>
            </div>
          </div>
          <div class="row draw-actions">
            <Button variant="ghost" size="sm" :to="teamEvaluationPath(row)">
              {{ $t('チーム評価') }}
            </Button>
            <Button v-if="judgeEvaluationEnabled()" variant="ghost" size="sm" :to="judgeEvaluationPath(row)">
              {{ $t('ジャッジ評価') }}
            </Button>
          </div>
        </div>
      </template>
      <div v-else class="card table-wrap">
        <table class="draw-table">
          <thead>
            <tr>
              <th>
                <button type="button" class="table-sort" @click="setTableSort('venue')">
                  {{ $t('会場') }}
                  <span class="sort-indicator">{{ sortIndicator('venue') }}</span>
                </button>
              </th>
              <th v-if="teamAllocationVisible">
                <button type="button" class="table-sort" @click="setTableSort('gov')">
                  {{ govLabel }}
                  <span class="sort-indicator">{{ sortIndicator('gov') }}</span>
                </button>
              </th>
              <th v-if="teamAllocationVisible">
                <button type="button" class="table-sort" @click="setTableSort('opp')">
                  {{ oppLabel }}
                  <span class="sort-indicator">{{ sortIndicator('opp') }}</span>
                </button>
              </th>
              <th v-if="adjudicatorAllocationVisible">{{ $t('チェア') }}</th>
              <th v-if="adjudicatorAllocationVisible">{{ $t('パネル') }}</th>
              <th v-if="adjudicatorAllocationVisible">{{ $t('トレーニー') }}</th>
              <th>{{ $t('操作') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in tableRows" :key="`table-${index}`">
              <td>{{ venueName(row.venue) }}</td>
              <td v-if="teamAllocationVisible">{{ teamName(row.teams.gov) }}</td>
              <td v-if="teamAllocationVisible">{{ teamName(row.teams.opp) }}</td>
              <td v-if="adjudicatorAllocationVisible">{{ adjudicatorNames(row.chairs) }}</td>
              <td v-if="adjudicatorAllocationVisible">{{ adjudicatorNames(row.panels) }}</td>
              <td v-if="adjudicatorAllocationVisible">{{ adjudicatorNames(row.trainees) }}</td>
              <td class="draw-actions-cell">
                <div class="row draw-actions">
                  <Button variant="ghost" size="sm" :to="teamEvaluationPath(row)">
                    {{ $t('チーム評価') }}
                  </Button>
                  <Button
                    v-if="judgeEvaluationEnabled()"
                    variant="ghost"
                    size="sm"
                    :to="judgeEvaluationPath(row)"
                  >
                    {{ $t('ジャッジ評価') }}
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDrawsStore } from '@/stores/draws'
import { useTeamsStore } from '@/stores/teams'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { useVenuesStore } from '@/stores/venues'
import { useTournamentStore } from '@/stores/tournament'
import { useStylesStore } from '@/stores/styles'
import { useRoundsStore } from '@/stores/rounds'
import LoadingState from '@/components/common/LoadingState.vue'
import ReloadButton from '@/components/common/ReloadButton.vue'
import Button from '@/components/common/Button.vue'
import { getSideShortLabel } from '@/utils/side-labels'

const route = useRoute()
const draws = useDrawsStore()
const teams = useTeamsStore()
const adjudicators = useAdjudicatorsStore()
const venues = useVenuesStore()
const tournamentStore = useTournamentStore()
const stylesStore = useStylesStore()
const roundsStore = useRoundsStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const round = computed(() => Number(route.params.round))
const viewMode = ref<'card' | 'table'>('card')
const sortKey = ref<'venue' | 'gov' | 'opp'>('venue')
const sortDirection = ref<'asc' | 'desc'>('asc')
const sortCollator = new Intl.Collator(['ja', 'en'], { numeric: true, sensitivity: 'base' })

const isLoading = computed(
  () =>
    draws.loading ||
    teams.loading ||
    adjudicators.loading ||
    venues.loading ||
    tournamentStore.loading ||
    stylesStore.loading ||
    roundsStore.loading
)
const errorMessage = computed(
  () => draws.error || teams.error || adjudicators.error || venues.error || roundsStore.error
)
const draw = computed(() => draws.draws.find((item) => item.round === round.value))
const roundConfig = computed(() => roundsStore.rounds.find((item) => item.round === round.value))
const teamAllocationVisible = computed(() => {
  if (typeof draw.value?.drawOpened === 'boolean') return draw.value.drawOpened
  return roundConfig.value?.teamAllocationOpened !== false
})
const adjudicatorAllocationVisible = computed(
  () => {
    if (typeof draw.value?.allocationOpened === 'boolean') return draw.value.allocationOpened
    return roundConfig.value?.adjudicatorAllocationOpened !== false
  }
)
const anyAllocationVisible = computed(() => teamAllocationVisible.value || adjudicatorAllocationVisible.value)
const isPartiallyVisible = computed(
  () => anyAllocationVisible.value && teamAllocationVisible.value !== adjudicatorAllocationVisible.value
)
const tournament = computed(() =>
  tournamentStore.tournaments.find((item) => item._id === tournamentId.value)
)
const style = computed(() =>
  stylesStore.styles.find((item) => item.id === tournament.value?.style)
)
const govLabel = computed(() => getSideShortLabel(style.value, 'gov', t('政府')))
const oppLabel = computed(() => getSideShortLabel(style.value, 'opp', t('反対')))

function rowSortValue(row: any, key: 'venue' | 'gov' | 'opp') {
  if (key === 'venue') return venueName(row.venue)
  if (key === 'gov') return teamName(row?.teams?.gov)
  return teamName(row?.teams?.opp)
}

const rows = computed(() => draw.value?.allocation ?? [])

const tableRows = computed(() => {
  const allocation = draw.value?.allocation ?? []
  const ordered = allocation
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const left = rowSortValue(a.row, sortKey.value)
      const right = rowSortValue(b.row, sortKey.value)
      const diff = sortCollator.compare(left, right)
      if (diff !== 0) return sortDirection.value === 'asc' ? diff : -diff
      return a.index - b.index
    })
  return ordered.map((entry) => entry.row)
})

const cardRows = computed(() => rows.value)

function setTableSort(key: 'venue' | 'gov' | 'opp') {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  sortDirection.value = 'asc'
}

function sortIndicator(key: 'venue' | 'gov' | 'opp') {
  if (sortKey.value !== key) return '↕'
  return sortDirection.value === 'asc' ? '↑' : '↓'
}

function teamName(id?: string) {
  if (!id) return '—'
  return teams.teams.find((team) => team._id === id)?.name ?? id
}

function adjudicatorNames(ids: string[]) {
  if (!ids || ids.length === 0) return '—'
  return ids
    .map((id) => adjudicators.adjudicators.find((adj) => adj._id === id)?.name ?? id)
    .join(', ')
}

function venueName(id?: string) {
  if (!id) return t('会場未定')
  return venues.venues.find((venue) => venue._id === id)?.name ?? id
}

function teamEvaluationPath(row: any) {
  const teamA = String(row?.teams?.gov ?? '')
  const teamB = String(row?.teams?.opp ?? '')
  if (!teamA || !teamB) {
    return `/user/${tournamentId.value}/speaker/rounds/${round.value}/ballot/home`
  }
  const submitterCandidates = Array.from(
    new Set([...(row?.chairs ?? []), ...(row?.panels ?? []), ...(row?.trainees ?? [])])
  ).filter(Boolean)
  if (submitterCandidates.length === 1) {
    const query = new URLSearchParams({
      teamA,
      teamB,
      submitter: String(submitterCandidates[0]),
    })
    return `/user/${tournamentId.value}/speaker/rounds/${round.value}/ballot/entry?${query.toString()}`
  }
  const query = new URLSearchParams({
    task: 'ballot',
    round: String(round.value),
    teamA,
    teamB,
  })
  if (submitterCandidates.length > 0) {
    query.set(
      'submitters',
      submitterCandidates.map((id: string) => encodeURIComponent(String(id))).join(',')
    )
  }
  return `/user/${tournamentId.value}/speaker/home?${query.toString()}`
}

function judgeEvaluationPath(row: any) {
  const teamGov = String(row?.teams?.gov ?? '')
  const teamOpp = String(row?.teams?.opp ?? '')
  const targetIds = Array.from(new Set([...(row?.chairs ?? []), ...(row?.panels ?? [])])).filter(Boolean)
  if (!teamGov || !teamOpp || targetIds.length === 0) {
    return `/user/${tournamentId.value}/adjudicator/home`
  }
  const query = new URLSearchParams({
    actor: 'team',
    task: 'feedback',
    round: String(round.value),
    teamGov,
    teamOpp,
    targets: targetIds.map((id: string) => encodeURIComponent(String(id))).join(','),
  })
  return `/user/${tournamentId.value}/adjudicator/home?${query.toString()}`
}

function judgeEvaluationEnabled() {
  const userDefined = roundConfig.value?.userDefinedData ?? {}
  return userDefined.evaluate_from_teams !== false || userDefined.evaluate_from_adjudicators !== false
}

async function refresh() {
  await Promise.all([
    draws.fetchDraws(tournamentId.value, round.value, { forcePublic: true }),
    teams.fetchTeams(tournamentId.value),
    adjudicators.fetchAdjudicators(tournamentId.value),
    venues.fetchVenues(tournamentId.value),
    tournamentStore.fetchTournaments(),
    stylesStore.fetchStyles(),
    roundsStore.fetchRounds(tournamentId.value, { forcePublic: true }),
  ])
}

onMounted(() => {
  refresh()
})
</script>

<style scoped>
.header-row {
  align-items: center;
  gap: var(--space-3);
}

.header-actions {
  margin-left: auto;
  gap: var(--space-2);
  align-items: center;
}

.view-switch {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  overflow: hidden;
  background: var(--color-surface);
}

.view-button {
  border: none;
  background: transparent;
  color: var(--color-muted);
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.view-button + .view-button {
  border-left: 1px solid var(--color-border);
}

.view-button.active {
  background: var(--color-primary);
  color: var(--color-primary-contrast);
}

.view-button:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: -2px;
}

.table-wrap {
  overflow-x: auto;
}

.visibility-banner {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  padding: 8px 10px;
}

.visibility-banner-title {
  font-size: 12px;
  color: var(--color-text);
  font-weight: 700;
}

.visibility-chip-list {
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.visibility-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
}

.visibility-chip.is-open {
  background: #ecfdf5;
  border-color: #86efac;
  color: #166534;
}

.visibility-chip.is-closed {
  background: #fff7ed;
  border-color: #fed7aa;
  color: #9a3412;
}

.draw-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.draw-table th,
.draw-table td {
  text-align: left;
  padding: 10px;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

.table-sort {
  border: none;
  background: transparent;
  font: inherit;
  font-weight: 600;
  color: inherit;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.sort-indicator {
  font-size: 11px;
  color: var(--color-muted);
}

.draw-table tbody tr:last-child td {
  border-bottom: none;
}

.draw-table tbody tr:nth-child(even) td {
  background: var(--color-surface-muted);
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
  padding: 8px 10px;
  min-width: 0;
}

.side-card strong {
  font-size: 1.05rem;
  font-weight: 700;
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
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.vs-chip {
  font-size: 12px;
  color: var(--color-muted);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 2px 8px;
}

.draw-adjudicators {
  gap: 6px;
}

.draw-adj-row {
  display: flex;
  gap: 6px;
  align-items: baseline;
  color: var(--color-text);
  font-size: 13px;
}

.draw-adj-label {
  font-weight: 700;
  color: var(--color-text);
}

.draw-adj-names {
  font-weight: 600;
  color: var(--color-text);
}

.draw-actions {
  gap: var(--space-1);
  flex-wrap: wrap;
}

.card.stack > .draw-actions {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.card.stack > .draw-actions :deep(.btn) {
  width: 100%;
  justify-content: center;
}

.draw-actions-cell {
  min-width: 180px;
}

.error {
  color: #ef4444;
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
