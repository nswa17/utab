<template>
  <section class="stack">
    <div class="row section-header">
      <h3>{{ $t('レポート生成') }}</h3>
      <ReloadButton
        class="header-reload"
        @click="refresh"
        :disabled="isLoading"
        :loading="isLoading"
      />
    </div>

    <LoadingState v-if="isLoading" />
    <p v-else-if="compiledStore.error" class="error">{{ compiledStore.error }}</p>

    <div v-else class="stack">
      <section class="card stack compile-card">
        <div class="row">
          <h4>{{ $t('集計オプション') }}</h4>
        </div>
        <div class="compile-grid">
          <label class="stack compile-field">
            <span class="muted">{{ $t('ソース') }}</span>
            <select v-model="compileSource">
              <option value="submissions">{{ $t('提出データ') }}</option>
              <option value="raw">{{ $t('生結果データ') }}</option>
            </select>
          </label>
          <div class="stack compile-field">
            <span class="muted">{{ $t('ラウンド') }}</span>
            <div class="pill-group">
              <label
                v-for="round in sortedRounds"
                :key="round.round"
                class="pill"
              >
                <input type="checkbox" :value="round.round" v-model="compileRounds" />
                <span>
                  {{ round.name ?? $t('ラウンド {round}', { round: round.round }) }}
                </span>
              </label>
            </div>
          </div>
        </div>
        <div v-if="compileRounds.length > 0" class="stack compile-warning-list">
          <div v-for="r in compileRounds" :key="r">
            <p v-if="missingBallotByRound(r).length > 0" class="muted warning">
              {{ roundName(r) }}:
              {{ $t('スコアシート未提出: {names}', { names: missingBallotByRound(r).map(adjudicatorName).join(', ') }) }}
            </p>
            <p v-if="missingFeedbackTeamsByRound(r).length > 0" class="muted warning">
              {{ roundName(r) }}:
              {{
                $t('評価未提出（{label}）: {names}', {
                  label: feedbackTeamLabel(r),
                  names: missingFeedbackTeamsByRound(r)
                    .map((item) => item.name)
                    .join(', '),
                })
              }}
            </p>
            <p v-if="missingFeedbackAdjudicatorsByRound(r).length > 0" class="muted warning">
              {{ roundName(r) }}:
              {{
                $t('評価未提出（ジャッジ）: {names}', {
                  names: missingFeedbackAdjudicatorsByRound(r)
                    .map(adjudicatorName)
                    .join(', '),
                })
              }}
            </p>
            <p
              v-if="
                unknownCountsByRound(r).ballot > 0 || unknownCountsByRound(r).feedback > 0
              "
              class="muted"
            >
              {{ roundName(r) }}:
              {{
                $t('提出者情報不足: Ballot {ballot} / Feedback {feedback}', {
                  ballot: unknownCountsByRound(r).ballot,
                  feedback: unknownCountsByRound(r).feedback,
                })
              }}
            </p>
          </div>
        </div>
        <div class="row compile-actions">
          <Button @click="runCompile" :disabled="isLoading || compileRounds.length === 0">
            {{ $t('レポート生成') }}
          </Button>
        </div>
      </section>

      <template v-if="compiled">
        <div v-if="showCategoryTabs" class="stack compile-category-inline">
          <h4>{{ $t('集計区分') }}</h4>
          <div class="label-tabs">
            <button
              v-for="label in availableLabels"
              :key="label"
              type="button"
              class="label-tab"
              :class="{ active: activeLabel === label }"
              @click="setActiveLabel(label)"
            >
              {{ labelDisplay(label) }}
            </button>
          </div>
        </div>

        <section class="card stack">
          <div class="row">
            <h4>{{ $t('一覧') }}</h4>
            <Button variant="secondary" size="sm" @click="downloadCsv">
              {{ $t('CSVダウンロード') }}
            </Button>
          </div>
          <div v-if="activeResults.length === 0" class="muted">{{ $t('結果がありません。') }}</div>
          <Table v-else hover striped sticky-header>
            <thead>
              <tr>
                <th v-for="key in tableColumns" :key="key">{{ columnLabel(key) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in activeResults" :key="row.id">
                <td v-for="key in tableColumns" :key="key">
                  <span v-if="key === 'id'">{{ entityName(row.id) }}</span>
                  <span v-else-if="key === 'comments' || key === 'judged_teams'">
                    {{ formatList(row[key]) }}
                  </span>
                  <span v-else>{{ formatValue(row[key]) }}</span>
                </td>
              </tr>
            </tbody>
          </Table>
        </section>

        <section class="card stack">
          <div class="row">
            <h4>{{ $t('スライド') }}</h4>
            <div class="inline">
              <Button variant="secondary" size="sm" @click="showSlides = !showSlides">
                {{ showSlides ? $t('閉じる') : $t('表示') }}
              </Button>
              <Button variant="secondary" size="sm" @click="slideSettingsOpen = !slideSettingsOpen">
                {{ slideSettingsOpen ? $t('設定を隠す') : $t('設定を表示') }}
              </Button>
            </div>
          </div>
          <div v-if="slideSettingsOpen" class="row wrap">
            <label class="stack">
              <span class="muted">{{ $t('表彰枠') }}</span>
              <input v-model.number="maxRankingRewarded" type="number" min="1" />
            </label>
            <label class="stack">
              <span class="muted">{{ $t('クレジット') }}</span>
              <input v-model="slideCredit" type="text" />
            </label>
            <label class="stack">
              <span class="muted">{{ $t('タイプ') }}</span>
              <select v-model="slideType">
                <option value="listed">{{ $t('一覧') }}</option>
                <option value="pretty">{{ $t('装飾') }}</option>
              </select>
            </label>
          </div>
          <Slides
            v-if="showSlides"
            :label="activeLabel"
            :tournament="compiledWithSubPrizes"
            :entities="entities"
            :max-ranking-rewarded="maxRankingRewarded"
            :type="slideType"
            :credit="slideCredit"
            @close="showSlides = false"
          />
        </section>

        <section class="card stack" v-if="isStandardLabel">
          <h4>{{ $t('統計') }} ({{ labelDisplay(activeLabel) }})</h4>
          <ScoreChange :results="activeResults" :tournament="compiled" :score="scoreKey" />
          <ScoreRange :results="activeResults" :score="scoreKey" />
          <div class="stack" v-if="sortedRounds.length > 0">
            <ScoreHistogram
              v-for="round in sortedRounds"
              :key="`hist-${round.round}`"
              :results="activeResults"
              :score="scoreKey"
              :round="round.round"
            />
          </div>
          <ScoreHistogram v-else :results="activeResults" :score="scoreKey" />
          <TeamPerformance v-if="activeLabel === 'teams'" :results="activeResults" />
        </section>

        <section class="card stack" v-if="teamResults.length > 0">
          <h4>{{ $t('公平性') }}</h4>
          <SideScatter v-if="teamHasScores" :results="teamResults" :rounds="sortedRounds" />
          <div v-for="round in sortedRounds" :key="round.round" class="stack">
            <SideHeatmap
              :results="teamResults"
              :round="round.round"
              :round-name="round.name"
              :labels="entities"
            />
            <SideMarginHeatmap
              v-if="teamHasScores"
              :results="teamResults"
              :round="round.round"
              :round-name="round.name"
              :labels="entities"
            />
            <SidePieChart
              :results="teamResults"
              :round="round.round"
              :round-name="round.name"
              :total-teams="teams.teams.length"
            />
          </div>
        </section>

        <section class="card stack" v-if="awardCopyRows.length > 0">
          <div class="row award-copy-toolbar">
            <h4>{{ $t('表彰コピー') }}</h4>
            <div class="row award-copy-controls">
              <label class="stack award-copy-limit">
                <span class="muted">{{ $t('表彰枠') }}</span>
                <input v-model.number="awardCopyLimit" type="number" min="1" />
              </label>
              <Button variant="secondary" size="sm" @click="copyAwardText">
                {{ $t('コピー') }}
              </Button>
            </div>
          </div>
          <p v-if="awardCopyCopied" class="muted">{{ $t('コピーしました。') }}</p>
          <pre class="award-copy-text">{{ awardCopyText }}</pre>
        </section>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCompiledStore } from '@/stores/compiled'
import { useTeamsStore } from '@/stores/teams'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { useSpeakersStore } from '@/stores/speakers'
import { useInstitutionsStore } from '@/stores/institutions'
import { useRoundsStore } from '@/stores/rounds'
import { useDrawsStore } from '@/stores/draws'
import { useSubmissionsStore } from '@/stores/submissions'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'
import Table from '@/components/common/Table.vue'
import ReloadButton from '@/components/common/ReloadButton.vue'
import Slides from '@/components/slides/Slides.vue'
import ScoreChange from '@/components/mstat/ScoreChange.vue'
import ScoreRange from '@/components/mstat/ScoreRange.vue'
import ScoreHistogram from '@/components/mstat/ScoreHistogram.vue'
import SideScatter from '@/components/mstat/SideScatter.vue'
import SideHeatmap from '@/components/mstat/SideHeatmap.vue'
import SideMarginHeatmap from '@/components/mstat/SideMarginHeatmap.vue'
import SidePieChart from '@/components/mstat/SidePieChart.vue'
import TeamPerformance from '@/components/mstat/TeamPerformance.vue'

const route = useRoute()
const compiledStore = useCompiledStore()
const teams = useTeamsStore()
const adjudicators = useAdjudicatorsStore()
const rounds = useRoundsStore()
const speakers = useSpeakersStore()
const institutions = useInstitutionsStore()
const draws = useDrawsStore()
const submissions = useSubmissionsStore()
const { t, locale } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const isLoading = computed(
  () =>
    compiledStore.loading ||
    teams.loading ||
    adjudicators.loading ||
    rounds.loading ||
    speakers.loading ||
    institutions.loading ||
    draws.loading ||
    submissions.loading
)
const showSlides = ref(false)
const maxRankingRewarded = ref(3)
const slideType = ref<'listed' | 'pretty'>('listed')
const slideCredit = ref('UTab')
const slideSettingsOpen = ref(false)
const awardCopyLimit = ref(3)
const awardCopyCopied = ref(false)
const activeLabel = ref<'teams' | 'speakers' | 'adjudicators' | 'poi' | 'best'>('teams')
const compileSource = ref<'submissions' | 'raw'>('submissions')
const compileRounds = ref<number[]>([])
const compileExecuted = ref(false)

const compiled = computed<Record<string, any> | null>(() => compiledStore.compiled)
const compiledWithSubPrizes = computed<Record<string, any> | undefined>(() => {
  if (!compiled.value) return undefined
  return {
    ...compiled.value,
    compiled_poi_results: poiResults.value,
    compiled_best_results: bestResults.value,
  }
})
type RoundSummary = { round: number; name?: string }
const sortedRounds = computed<RoundSummary[]>(() => {
  if (rounds.rounds.length > 0) {
    return rounds.rounds.slice().sort((a, b) => a.round - b.round)
  }
  const payloadRounds = compiled.value?.rounds ?? []
  return payloadRounds
    .map((item: any) => {
      const roundValue = Number(item?.r ?? item?.round ?? item)
      return {
        round: roundValue,
        name: item?.name ?? t('ラウンド {round}', { round: roundValue }),
      }
    })
    .filter((round: any) => Number.isFinite(round.round))
    .sort((a: any, b: any) => a.round - b.round)
})
const teamResults = computed<any[]>(() => compiled.value?.compiled_team_results ?? [])
const teamHasScores = computed(() =>
  teamResults.value.some((result) =>
    result.details?.some((detail: any) => typeof detail.sum === 'number')
  )
)

const entities = computed(() => {
  const map: Record<string, string> = {}
  teams.teams.forEach((team) => {
    map[team._id] = team.name
    team.speakers?.forEach((speaker, index) => {
      map[`${team._id}:${index}`] = speaker.name
    })
  })
  speakers.speakers.forEach((speaker) => {
    map[speaker._id] = speaker.name
  })
  adjudicators.adjudicators.forEach((adj) => {
    map[adj._id] = adj.name
  })
  return map
})

const availableLabels = computed(() => {
  if (!compiled.value) return ['teams']
  const labels: Array<'teams' | 'speakers' | 'adjudicators' | 'poi' | 'best'> = []
  if (compiled.value.compiled_team_results?.length) labels.push('teams')
  if (compiled.value.compiled_speaker_results?.length) labels.push('speakers')
  if (compiled.value.compiled_adjudicator_results?.length) labels.push('adjudicators')
  if (poiResults.value.length > 0) labels.push('poi')
  if (bestResults.value.length > 0) labels.push('best')
  return labels.length > 0 ? labels : ['teams']
})
const showCategoryTabs = computed(() => Boolean(compiled.value) && compileExecuted.value)

function mapInstitutions(values: any): string[] {
  if (!Array.isArray(values)) return []
  if (institutions.institutions.length === 0) return values.map((v) => String(v))
  return values.map((value) => {
    const token = String(value)
    const match = institutions.institutions.find(
      (inst) => inst._id === token || inst.name === token
    )
    return match?.name ?? token
  })
}

function mapEntityNames(values: any): string[] {
  if (!Array.isArray(values)) return []
  return values.map((value) => entities.value[String(value)] ?? String(value))
}

const activeResults = computed<any[]>(() => {
  if (!compiled.value) return []
  const source =
    activeLabel.value === 'speakers'
      ? (compiled.value.compiled_speaker_results ?? [])
      : activeLabel.value === 'adjudicators'
        ? (compiled.value.compiled_adjudicator_results ?? [])
        : activeLabel.value === 'poi'
          ? poiResults.value
          : activeLabel.value === 'best'
            ? bestResults.value
            : (compiled.value.compiled_team_results ?? [])
  return source.map((result: any) => {
    const base = {
      ...result,
      name: entityName(result.id),
      institutions: mapInstitutions(result.institutions),
    }
    if (activeLabel.value === 'adjudicators') {
      const comments =
        result.details?.flatMap((detail: any) =>
          Array.isArray(detail.comments) ? detail.comments : []
        ) ?? []
      return {
        ...base,
        comments: comments.filter((comment: any) => typeof comment === 'string' && comment.trim() !== ''),
        judged_teams: mapEntityNames(result.judged_teams ?? []),
      }
    }
    return base
  })
})

const awardCopyRows = computed(() => {
  if (activeResults.value.length === 0) return []
  const ranked = activeResults.value
    .filter((row) => Number.isFinite(Number(row.ranking)))
    .slice()
    .sort((a, b) => Number(a.ranking) - Number(b.ranking))
  const max = Math.max(1, Number(awardCopyLimit.value || 1))
  return ranked.filter((row) => Number(row.ranking) <= max)
})

const awardCopyText = computed(() => {
  return awardCopyRows.value
    .map((row) => {
      const name = entityName(String(row.id))
      const teamText =
        Array.isArray(row.teams) && row.teams.length > 0 ? `（${row.teams.map((item: any) => String(item)).join('/')}）` : ''
      const metric =
        activeLabel.value === 'poi'
          ? formatTimesCount(Number(row.poi ?? 0))
          : activeLabel.value === 'best'
            ? formatTimesCount(Number(row.best ?? 0))
            : locale.value === 'ja'
              ? `${row.ranking}位`
              : ordinal(Number(row.ranking))
      return `${name}${teamText} ${metric}`
    })
    .join('\n')
})

const tableColumns = computed(() => {
  if (activeLabel.value === 'poi' || activeLabel.value === 'best') {
    return ['ranking', 'id', 'teams', activeLabel.value]
  }
  if (activeLabel.value === 'adjudicators') {
    return [
      'ranking',
      'id',
      'institutions',
      'average',
      'sd',
      'num_experienced',
      'num_experienced_chair',
      'comments',
    ]
  }
  if (activeLabel.value === 'speakers') {
    return ['ranking', 'id', 'teams', 'average', 'sum', 'sd']
  }
  if (teamHasScores.value) {
    return ['ranking', 'id', 'institutions', 'win', 'average', 'sum', 'margin', 'vote', 'sd']
  }
  return ['ranking', 'id', 'institutions', 'win']
})

const scoreKey = computed(() => {
  if (activeLabel.value === 'adjudicators') return 'score'
  if (activeLabel.value === 'speakers') return 'average'
  const hasSum = activeResults.value.some((result) =>
    result.details?.some((detail: any) => typeof detail.sum === 'number')
  )
  return hasSum ? 'sum' : 'win'
})

const isStandardLabel = computed(() =>
  ['teams', 'speakers', 'adjudicators'].includes(activeLabel.value)
)

const poiResults = computed(() => buildSubPrizeResults('poi'))
const bestResults = computed(() => buildSubPrizeResults('best'))

function entityName(id: string) {
  return entities.value[id] ?? id
}

function teamName(id: string) {
  return teams.teams.find((team) => team._id === id)?.name ?? id
}

function adjudicatorName(id: string) {
  return adjudicators.adjudicators.find((adj) => adj._id === id)?.name ?? id
}

function speakerName(id: string) {
  return speakers.speakers.find((speaker) => speaker._id === id)?.name ?? id
}

function roundName(r: number) {
  return (
    rounds.rounds.find((round) => round.round === r)?.name ??
    sortedRounds.value.find((round: RoundSummary) => round.round === r)?.name ??
    t('ラウンド {round}', { round: r })
  )
}

const drawByRound = computed(() => {
  const map = new Map<number, any>()
  draws.draws.forEach((draw) => {
    map.set(Number(draw.round), draw)
  })
  return map
})

const submissionsByRound = computed(() => {
  const map = new Map<number, any[]>()
  submissions.submissions.forEach((item) => {
    const round = Number(item.round)
    const list = map.get(round) ?? []
    list.push(item)
    map.set(round, list)
  })
  return map
})

const roundConfigByRound = computed(() => {
  const map = new Map<number, any>()
  rounds.rounds.forEach((round) => {
    map.set(Number(round.round), round)
  })
  return map
})

function expectedIdsForRound(r: number) {
  const draw = drawByRound.value.get(r)
  const expectedAdjudicators = new Set<string>()
  const expectedTeams = new Set<string>()
  draw?.allocation?.forEach((row: any) => {
    if (row?.teams?.gov) expectedTeams.add(String(row.teams.gov))
    if (row?.teams?.opp) expectedTeams.add(String(row.teams.opp))
    ;(row?.chairs ?? []).forEach((id: string) => expectedAdjudicators.add(String(id)))
    ;(row?.panels ?? []).forEach((id: string) => expectedAdjudicators.add(String(id)))
    ;(row?.trainees ?? []).forEach((id: string) => expectedAdjudicators.add(String(id)))
  })
  return { expectedAdjudicators, expectedTeams }
}

function speakerIdsForTeamRound(teamId: string, r: number) {
  const team = teams.teams.find((item) => item._id === teamId)
  if (!team) return []
  const detail = team.details?.find((d: any) => Number(d.r) === Number(r))
  const detailSpeakers = (detail?.speakers ?? []).map((id: any) => String(id)).filter(Boolean)
  if (detailSpeakers.length > 0) return detailSpeakers
  if (Array.isArray(team.speakers)) {
    return team.speakers
      .map((speaker: any) => {
        const name = speaker?.name
        if (!name) return ''
        return speakers.speakers.find((item) => item.name === name)?._id ?? ''
      })
      .filter(Boolean)
  }
  return []
}

function expectedSpeakerIdsForRound(r: number) {
  const { expectedTeams } = expectedIdsForRound(r)
  const set = new Set<string>()
  expectedTeams.forEach((teamId) => {
    speakerIdsForTeamRound(teamId, r).forEach((id) => set.add(id))
  })
  return set
}

function ballotSubmittedIds(r: number) {
  const list = submissionsByRound.value.get(r) ?? []
  const set = new Set<string>()
  list
    .filter((item) => item.type === 'ballot')
    .forEach((item: any) => {
      const id = item.payload?.submittedEntityId
      if (id) set.add(String(id))
    })
  return set
}

function feedbackSubmittedIds(r: number) {
  const list = submissionsByRound.value.get(r) ?? []
  const set = new Set<string>()
  list
    .filter((item) => item.type === 'feedback')
    .forEach((item: any) => {
      const id = item.payload?.submittedEntityId
      if (id) set.add(String(id))
    })
  return set
}

function unknownCountsByRound(r: number) {
  const list = submissionsByRound.value.get(r) ?? []
  const ballot = list.filter(
    (item: any) => item.type === 'ballot' && !(item.payload as any)?.submittedEntityId
  ).length
  const feedback = list.filter(
    (item: any) => item.type === 'feedback' && !(item.payload as any)?.submittedEntityId
  ).length
  return { ballot, feedback }
}

function missingBallotByRound(r: number) {
  const { expectedAdjudicators } = expectedIdsForRound(r)
  const submitted = ballotSubmittedIds(r)
  return Array.from(expectedAdjudicators).filter((id) => !submitted.has(id))
}

function missingFeedbackTeamsByRound(r: number) {
  const config = roundConfigByRound.value.get(r)
  if (config?.userDefinedData?.evaluate_from_teams === false) return []
  const submitted = feedbackSubmittedIds(r)
  if (config?.userDefinedData?.evaluator_in_team === 'speaker') {
    return Array.from(expectedSpeakerIdsForRound(r))
      .filter((id) => !submitted.has(id))
      .map((id) => ({ id, name: speakerName(id) }))
  }
  const { expectedTeams } = expectedIdsForRound(r)
  return Array.from(expectedTeams)
    .filter((id) => !submitted.has(id))
    .map((id) => ({ id, name: teamName(id) }))
}

function missingFeedbackAdjudicatorsByRound(r: number) {
  const config = roundConfigByRound.value.get(r)
  if (config?.userDefinedData?.evaluate_from_adjudicators === false) return []
  const { expectedAdjudicators } = expectedIdsForRound(r)
  const submitted = feedbackSubmittedIds(r)
  return Array.from(expectedAdjudicators).filter((id) => !submitted.has(id))
}

function feedbackTeamLabel(r: number) {
  const config = roundConfigByRound.value.get(r)
  return config?.userDefinedData?.evaluator_in_team === 'speaker' ? t('スピーカー') : t('チーム')
}

function formatValue(value: unknown) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—'
    const rounded = Math.round(value * 1000) / 1000
    return String(rounded)
  }
  if (Array.isArray(value)) {
    if (value.length <= 3) return value.join(', ')
    return t('{count} 件', { count: value.length })
  }
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function formatList(value: unknown) {
  if (!Array.isArray(value)) return formatValue(value)
  const items = value.map((item) => String(item)).filter((item) => item !== '')
  if (items.length === 0) return '—'
  if (items.length <= 5) return items.join(', ')
  return `${items.slice(0, 5).join(', ')} (+${items.length - 5})`
}

function formatCsvValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (Array.isArray(value)) return value.map((item) => String(item)).join(',')
  if (value === null || value === undefined || value === '') return ''
  return String(value)
}

function columnLabel(key: string) {
  const map: Record<string, string> = {
    ranking: t('順位'),
    id: t('名前'),
    institutions: t('所属機関'),
    win: t('勝利数'),
    average: t('平均'),
    sum: t('合計'),
    margin: t('マージン'),
    vote: t('票'),
    sd: t('標準偏差'),
    num_experienced: t('担当数'),
    num_experienced_chair: t('チェア担当'),
    comments: t('コメント'),
    teams: t('チーム'),
    poi: t('POI'),
    best: t('ベストスピーカー'),
  }
  return map[key] ?? key
}

function escapeCsv(value: string) {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function ordinal(value: number) {
  if (!Number.isFinite(value)) return ''
  const v = Math.round(value)
  if (locale.value === 'ja') return `${v}位`
  const mod10 = v % 10
  const mod100 = v % 100
  if (mod10 === 1 && mod100 !== 11) return `${v}st`
  if (mod10 === 2 && mod100 !== 12) return `${v}nd`
  if (mod10 === 3 && mod100 !== 13) return `${v}rd`
  return `${v}th`
}

function formatTimesCount(value: number) {
  const rounded = Math.round(value * 1000) / 1000
  if (locale.value === 'ja') return `${rounded}回`
  return `${rounded} times`
}

function labelDisplay(label: string) {
  const map: Record<string, string> = {
    teams: t('チーム'),
    speakers: t('スピーカー'),
    adjudicators: t('ジャッジ'),
    poi: t('POI'),
    best: t('ベストスピーカー'),
  }
  return map[label] ?? label
}

function setActiveLabel(label: string) {
  if (!['teams', 'speakers', 'adjudicators', 'poi', 'best'].includes(label)) return
  activeLabel.value = label as 'teams' | 'speakers' | 'adjudicators' | 'poi' | 'best'
}

function downloadCsv() {
  if (activeResults.value.length === 0) return
  const label = activeLabel.value
  let headerLabels: string[] = []
  let headerKeys: string[] = []

  if (label === 'teams') {
    headerLabels = [
      t('順位'),
      t('順位(序数)'),
      t('名前'),
      t('勝利数'),
      t('合計'),
      t('マージン'),
      t('票'),
      t('標準偏差'),
    ]
    headerKeys = ['ranking', 'place', 'name', 'win', 'sum', 'margin', 'vote', 'sd']
  } else if (label === 'speakers') {
    headerLabels = [
      t('順位'),
      t('順位(序数)'),
      t('名前'),
      t('チーム'),
      t('平均'),
      t('合計'),
      t('標準偏差'),
    ]
    headerKeys = ['ranking', 'place', 'name', 'team_name', 'average', 'sum', 'sd']
  } else if (label === 'adjudicators') {
    headerLabels = [t('順位'), t('順位(序数)'), t('名前'), t('平均'), t('標準偏差')]
    headerKeys = ['ranking', 'place', 'name', 'average', 'sd']
  } else if (label === 'poi' || label === 'best') {
    headerLabels = [
      t('順位'),
      t('順位(序数)'),
      t('名前'),
      t('チーム'),
      label === 'poi' ? t('POI合計') : t('ベストスピーカー合計'),
    ]
    headerKeys = ['ranking', 'place', 'name', 'team_name', label]
  } else {
    headerLabels = tableColumns.value
    headerKeys = tableColumns.value
  }

  const rows = activeResults.value
    .slice()
    .sort((a, b) => (a.ranking ?? 0) - (b.ranking ?? 0))
    .map((row) => {
      const enriched: Record<string, any> = { ...row }
      enriched.name = entityName(row.id)
      enriched.place = ordinal(Number(row.ranking))
      if (label === 'speakers' || label === 'poi' || label === 'best') {
        const teamsValue = Array.isArray(row.teams) ? row.teams.join(',') : row.teams
        enriched.team_name = teamsValue ?? ''
      }
      return headerKeys.map((key) => {
        const value = key === 'name' ? enriched.name : enriched[key]
        const formatted = formatCsvValue(value)
        return escapeCsv(String(formatted))
      })
    })

  const csv = [headerLabels.join(','), ...rows.map((row) => row.join(','))].join('\n')
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  if (label === 'teams') link.download = 'team_results.csv'
  else if (label === 'speakers') link.download = 'speaker_results.csv'
  else if (label === 'adjudicators') link.download = 'adjudicator_results.csv'
  else if (label === 'poi') link.download = 'poi_results.csv'
  else if (label === 'best') link.download = 'best_speaker_results.csv'
  else link.download = `compiled-${activeLabel.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

async function copyAwardText() {
  const text = awardCopyText.value
  if (!text) return
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
  } else {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
  awardCopyCopied.value = true
  window.setTimeout(() => {
    awardCopyCopied.value = false
  }, 2000)
}

async function refresh() {
  if (!tournamentId.value) return
  await Promise.all([
    compiledStore.fetchLatest(tournamentId.value),
    teams.fetchTeams(tournamentId.value),
    adjudicators.fetchAdjudicators(tournamentId.value),
    rounds.fetchRounds(tournamentId.value),
    speakers.fetchSpeakers(tournamentId.value),
    institutions.fetchInstitutions(tournamentId.value),
    draws.fetchDraws(tournamentId.value),
    submissions.fetchSubmissions({ tournamentId: tournamentId.value }),
  ])
}

async function runCompile() {
  if (!tournamentId.value) return
  if (compileRounds.value.length === 0) return
  const roundsPayload = compileRounds.value.length > 0 ? compileRounds.value : undefined
  const compiledResult = await compiledStore.runCompile(tournamentId.value, {
    source: compileSource.value,
    rounds: roundsPayload,
  })
  if (compiledResult) {
    compileExecuted.value = true
  }
  await Promise.all([
    teams.fetchTeams(tournamentId.value),
    adjudicators.fetchAdjudicators(tournamentId.value),
    rounds.fetchRounds(tournamentId.value),
    speakers.fetchSpeakers(tournamentId.value),
    institutions.fetchInstitutions(tournamentId.value),
    draws.fetchDraws(tournamentId.value),
    submissions.fetchSubmissions({ tournamentId: tournamentId.value }),
  ])
}

onMounted(() => {
  refresh()
})

watch(availableLabels, (labels) => {
  if (!labels.includes(activeLabel.value)) {
    activeLabel.value = (labels[0] ?? 'teams') as
      | 'teams'
      | 'speakers'
      | 'adjudicators'
      | 'poi'
      | 'best'
  }
})

watch(tournamentId, () => {
  compileExecuted.value = false
  refresh()
})

function buildSubPrizeResults(kind: 'poi' | 'best') {
  if (!compiled.value) return []
  const base = compiled.value.compiled_speaker_results ?? []
  const results = base.map((result: any) => {
    let total = 0
    const details = result.details ?? []
    for (const detail of details) {
      const collection = detail.user_defined_data_collection ?? []
      if (!Array.isArray(collection) || collection.length === 0) continue
      const counts = collection.map((ud: any) => {
        const list = Array.isArray(ud?.[kind]) ? ud[kind] : []
        return list.filter((item: any) => item?.value).length
      })
      if (counts.length > 0) {
        total += counts.reduce((a: number, b: number) => a + b, 0) / counts.length
      }
    }
    return { ...result, [kind]: total }
  })
  results.sort((a: any, b: any) => (b[kind] ?? 0) - (a[kind] ?? 0))
  let rank = 0
  let prevValue: number | null = null
  let stay = 0
  results.forEach((item: any) => {
    const value = item[kind] ?? 0
    if (prevValue === null || value !== prevValue) {
      rank += stay + 1
      stay = 0
      prevValue = value
    } else {
      stay += 1
    }
    item.ranking = rank
  })
  return results
}
</script>

<style scoped>
.error {
  color: var(--color-danger);
}

.section-header {
  align-items: center;
}

.header-reload {
  margin-left: auto;
}

.warning {
  color: var(--color-warn);
}

.grow {
  flex: 1;
}

.compile-card {
  gap: var(--space-3);
}

.compile-grid {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: var(--space-3);
}

.compile-field {
  gap: var(--space-2);
}

.compile-warning-list {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface-muted);
}

.compile-actions {
  justify-content: flex-end;
}

.pill-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 6px 10px;
  background: var(--color-surface);
  font-size: 14px;
}

.pill input {
  margin: 0;
}

.label-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.compile-category-inline {
  gap: var(--space-2);
}

.compile-category-inline .row {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.label-tab {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-muted);
  min-height: 34px;
  padding: 0 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.label-tab:hover {
  border-color: #bfdbfe;
  color: var(--color-primary);
}

.label-tab.active {
  background: var(--color-secondary);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

@media (max-width: 900px) {
  .compile-grid {
    grid-template-columns: 1fr;
  }
}

.wrap {
  flex-wrap: wrap;
}

.award-copy-toolbar {
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.award-copy-controls {
  gap: var(--space-2);
  align-items: flex-end;
  flex-wrap: wrap;
}

.award-copy-limit {
  min-width: 120px;
}

.award-copy-text {
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
  white-space: pre-wrap;
  line-height: 1.65;
  max-height: 360px;
  overflow: auto;
}

textarea {
  width: 100%;
}
</style>
