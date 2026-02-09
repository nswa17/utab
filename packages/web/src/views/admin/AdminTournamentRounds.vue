<template>
  <section class="stack">
    <div class="row section-row">
      <h3>{{ $t('ラウンド管理') }}</h3>
      <ReloadButton
        class="section-reload"
        @click="refresh"
        :disabled="isLoading"
        :loading="isLoading"
      />
    </div>

    <div v-if="!sectionLoading" class="card stack">
      <p class="muted">{{ $t('新規ラウンド作成') }}</p>
      <form class="grid" @submit.prevent="createRound">
        <Field :label="$t('ラウンド番号')" required v-slot="{ id, describedBy }">
          <input
            v-model.number="createForm.round"
            :id="id"
            :aria-describedby="describedBy"
            type="number"
            min="1"
          />
        </Field>
        <Field :label="$t('ラウンド名')" v-slot="{ id, describedBy }">
          <input v-model="createForm.name" :id="id" :aria-describedby="describedBy" type="text" />
        </Field>
        <div class="row create-actions">
          <Button type="submit" :disabled="roundsStore.loading">{{ $t('追加') }}</Button>
        </div>
      </form>
    </div>

    <LoadingState v-if="sectionLoading" />
    <p v-else-if="roundsStore.error" class="error">{{ roundsStore.error }}</p>
    <p v-else-if="sortedRounds.length === 0" class="muted">
      {{ $t('ラウンドがまだありません。') }}
    </p>

    <div v-else class="stack round-cards">
      <article v-for="round in sortedRounds" :key="round._id" class="card stack round-card">
        <div class="stack round-head">
          <div class="row round-head-row">
            <button type="button" class="round-toggle" @click="toggleRound(round._id)">
              <span class="toggle-icon" :class="{ open: isExpanded(round._id) }" aria-hidden="true">
                <svg viewBox="0 0 20 20" width="16" height="16">
                  <path
                    d="M7 4l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
              <div class="stack tight">
                <strong>{{ round.name || $t('ラウンド {round}', { round: round.round }) }}</strong>
                <span class="muted small">{{ $t('ラウンド番号') }}: {{ round.round }}</span>
                <span v-if="drawUpdatedLabel(round.round)" class="muted small">
                  {{ $t('更新: {time}', { time: drawUpdatedLabel(round.round) }) }}
                </span>
              </div>
            </button>
            <div class="row round-head-actions">
              <Button variant="danger" size="sm" class="round-delete" @click="removeRound(round._id)">
                {{ $t('削除') }}
              </Button>
            </div>
          </div>
        </div>

        <div v-show="isExpanded(round._id)" class="stack round-body">
          <div class="card soft stack round-settings-frame">
            <div class="grid status-grid">
              <div class="card soft stack status-card">
                <div class="stack status-head status-head-vertical">
                  <span class="muted small">{{ $t('モーション公開') }}</span>
                  <div class="switch-state">
                    <span class="muted small">{{ $t('非公開') }}</span>
                    <label class="switch">
                      <input
                        type="checkbox"
                        :checked="Boolean(round.motionOpened)"
                        :disabled="isLoading"
                        @change="onMotionOpenedChange(round, $event)"
                      />
                      <span class="switch-slider"></span>
                    </label>
                    <span class="muted small">{{ $t('公開') }}</span>
                  </div>
                </div>
              </div>
              <div class="card soft stack status-card">
                <div class="stack status-head status-head-vertical">
                  <span class="muted small">{{ $t('チーム割り当て') }}</span>
                  <div class="switch-state">
                    <span class="muted small">{{ $t('非公開') }}</span>
                    <label class="switch">
                      <input
                        type="checkbox"
                        :checked="Boolean(round.teamAllocationOpened)"
                        :disabled="isLoading"
                        @change="onTeamAllocationChange(round, $event)"
                      />
                      <span class="switch-slider"></span>
                    </label>
                    <span class="muted small">{{ $t('公開') }}</span>
                  </div>
                </div>
              </div>
              <div class="card soft stack status-card">
                <div class="stack status-head status-head-vertical">
                  <span class="muted small">{{ $t('ジャッジ割り当て') }}</span>
                  <div class="switch-state">
                    <span class="muted small">{{ $t('非公開') }}</span>
                    <label class="switch">
                      <input
                        type="checkbox"
                        :checked="Boolean(round.adjudicatorAllocationOpened)"
                        :disabled="isLoading"
                        @change="onAdjudicatorAllocationChange(round, $event)"
                      />
                      <span class="switch-slider"></span>
                    </label>
                    <span class="muted small">{{ $t('公開') }}</span>
                  </div>
                </div>
              </div>
              <div class="card soft stack status-card">
                <span class="muted small">{{ $t('提出状況') }}</span>
                <div class="status-line">
                  <span>{{ $t('スコアシート') }}</span>
                  <strong>{{ ballotSubmittedCount(round) }}/{{ ballotExpectedCount(round) }}</strong>
                </div>
                <div class="status-line">
                  <span>{{ $t('フィードバック') }}</span>
                  <strong
                    >{{ feedbackSubmittedCount(round) }}/{{ feedbackExpectedCount(round) }}</strong
                  >
                </div>
                <div class="row">
                  <Button variant="ghost" size="sm" @click="openMissingModal(round.round)">
                    {{ $t('未提出者を表示') }}
                  </Button>
                </div>
              </div>
            </div>

            <div class="stack motion-editor">
              <Field class="motion-field" :label="$t('モーション')" v-slot="{ id, describedBy }">
                <input
                  v-model="roundDraft(round).motion"
                  :id="id"
                  :aria-describedby="describedBy"
                  type="text"
                />
              </Field>
              <div class="row motion-actions">
                <Button variant="ghost" size="sm" :disabled="isLoading" @click="saveRoundMotion(round)">
                  {{ $t('モーションを更新') }}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="advanced-toggle-button"
                  :disabled="isLoading"
                  @click="toggleAdvancedSettings(round._id)"
                >
                  {{
                    isAdvancedSettingsExpanded(round._id)
                      ? $t('詳細設定を隠す')
                      : $t('詳細設定を表示')
                  }}
                </Button>
              </div>
            </div>

            <div v-show="isAdvancedSettingsExpanded(round._id)" class="stack advanced-settings">
              <div class="grid weight-grid">
                <Field :label="$t('チェア重み')" v-slot="{ id, describedBy }">
                  <input
                    v-model.number="roundDraft(round).weights.chair"
                    :id="id"
                    :aria-describedby="describedBy"
                    type="number"
                  />
                </Field>
                <Field :label="$t('パネル重み')" v-slot="{ id, describedBy }">
                  <input
                    v-model.number="roundDraft(round).weights.panel"
                    :id="id"
                    :aria-describedby="describedBy"
                    type="number"
                  />
                </Field>
                <Field :label="$t('トレーニー重み')" v-slot="{ id, describedBy }">
                  <input
                    v-model.number="roundDraft(round).weights.trainee"
                    :id="id"
                    :aria-describedby="describedBy"
                    type="number"
                  />
                </Field>
              </div>

              <section class="stack settings-group">
                <h5 class="settings-group-title">{{ $t('評価提出設定') }}</h5>
                <div class="grid settings-options-grid">
                  <label class="row small setting-option">
                    <input
                      v-model="roundDraft(round).userDefined.evaluate_from_adjudicators"
                      type="checkbox"
                    />
                    <span>{{ $t('評価をジャッジから') }}</span>
                    <span
                      class="help-badge"
                      :title="$t('ジャッジからのフィードバック入力を有効にします。')"
                      aria-hidden="true"
                      >?</span
                    >
                  </label>
                  <label class="row small setting-option">
                    <input v-model="roundDraft(round).userDefined.evaluate_from_teams" type="checkbox" />
                    <span>{{ $t('評価をチームから') }}</span>
                    <span
                      class="help-badge"
                      :title="$t('チーム/スピーカーからのフィードバック入力を有効にします。')"
                      aria-hidden="true"
                      >?</span
                    >
                  </label>
                  <label class="row small setting-option">
                    <input
                      v-model="roundDraft(round).userDefined.chairs_always_evaluated"
                      type="checkbox"
                    />
                    <span>{{ $t('チェアを常に評価') }}</span>
                    <span
                      class="help-badge"
                      :title="$t('チェア評価を必須にします。')"
                      aria-hidden="true"
                      >?</span
                    >
                  </label>
                  <Field :label="$t('Evaluator in Team')" v-slot="{ id, describedBy }">
                    <select
                      v-model="roundDraft(round).userDefined.evaluator_in_team"
                      :id="id"
                      :aria-describedby="describedBy"
                    >
                      <option value="team">{{ $t('チーム') }}</option>
                      <option value="speaker">{{ $t('スピーカー') }}</option>
                    </select>
                    <p class="muted small">
                      {{ $t('評価者の単位をチームかスピーカーから選択します。') }}
                    </p>
                  </Field>
                </div>
              </section>

              <section class="stack settings-group">
                <h5 class="settings-group-title">{{ $t('スコア設定') }}</h5>
                <div class="grid settings-options-grid">
                  <label class="row small setting-option">
                    <input v-model="roundDraft(round).userDefined.no_speaker_score" type="checkbox" />
                    <span>{{ $t('スピーカースコア無し') }}</span>
                    <span
                      class="help-badge"
                      :title="$t('スピーカースコア入力を無効にします。')"
                      aria-hidden="true"
                      >?</span
                    >
                  </label>
                  <label class="row small setting-option">
                    <input v-model="roundDraft(round).userDefined.allow_low_tie_win" type="checkbox" />
                    <span>{{ $t('低勝ち/同点勝ち許可') }}</span>
                    <span
                      class="help-badge"
                      :title="$t('低勝ち・同点勝ちを許可します。')"
                      aria-hidden="true"
                      >?</span
                    >
                  </label>
                  <label class="row small setting-option">
                    <input
                      v-model="roundDraft(round).userDefined.score_by_matter_manner"
                      type="checkbox"
                    />
                    <span>{{ $t('Matter/Manner採点') }}</span>
                    <span
                      class="help-badge"
                      :title="$t('Matter/Manner の個別入力を有効にします。')"
                      aria-hidden="true"
                      >?</span
                    >
                  </label>
                </div>
              </section>

              <section class="stack settings-group">
                <h5 class="settings-group-title">{{ $t('賞設定') }}</h5>
                <div class="grid settings-options-grid">
                  <label class="row small setting-option">
                    <input v-model="roundDraft(round).userDefined.poi" type="checkbox" />
                    <span>{{ $t('POI賞') }}</span>
                    <span
                      class="help-badge"
                      :title="$t('POI賞の入力を有効にします。')"
                      aria-hidden="true"
                      >?</span
                    >
                  </label>
                  <label class="row small setting-option">
                    <input v-model="roundDraft(round).userDefined.best" type="checkbox" />
                    <span>{{ $t('Best Speaker賞') }}</span>
                    <span
                      class="help-badge"
                      :title="$t('ベストスピーカー賞の入力を有効にします。')"
                      aria-hidden="true"
                      >?</span
                    >
                  </label>
                </div>
              </section>

              <div class="row">
                <Button size="sm" :disabled="isLoading" @click="saveRoundSettings(round)">
                  {{ $t('設定を保存') }}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div class="row round-shortcuts">
          <Button variant="ghost" size="sm" @click="openRoundModal(round.round, 'allocation')">
            {{ $t('対戦表設定') }}
          </Button>
          <Button variant="ghost" size="sm" @click="openRoundModal(round.round, 'submissions')">
            {{ $t('提出データ閲覧') }}
          </Button>
        </div>
      </article>
    </div>

    <div v-if="quickView" class="modal-backdrop" role="presentation" @click.self="closeQuickView">
      <div class="modal card stack quick-modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <strong>{{ quickViewTitle }}</strong>
          <button type="button" class="modal-close" :aria-label="$t('閉じる')" @click="closeQuickView">
            ×
          </button>
        </div>
        <iframe :src="quickViewSrc" class="quick-frame" />
      </div>
    </div>

    <div
      v-if="missingModalRound !== null"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeMissingModal"
    >
      <div class="modal card stack missing-modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <strong>{{ roundLabel(missingModalRound) }} {{ $t('未提出') }}</strong>
          <button
            type="button"
            class="modal-close"
            :aria-label="$t('閉じる')"
            @click="closeMissingModal"
          >
            ×
          </button>
        </div>
        <template v-if="missingModalRoundConfig">
          <p
            v-if="
              missingBallotNames(missingModalRoundConfig).length === 0 &&
              missingFeedbackTeamNames(missingModalRoundConfig).length === 0 &&
              missingFeedbackAdjudicatorNames(missingModalRoundConfig).length === 0
            "
            class="muted small"
          >
            {{ $t('未提出者はいません。') }}
          </p>
          <div v-if="missingBallotNames(missingModalRoundConfig).length > 0" class="stack tight">
            <strong class="small">{{ $t('スコアシート未提出（ジャッジ）') }}</strong>
            <p class="muted small">
              {{ missingBallotNames(missingModalRoundConfig).join(', ') }}
            </p>
          </div>
          <div v-if="missingFeedbackTeamNames(missingModalRoundConfig).length > 0" class="stack tight">
            <strong class="small">{{
              $t('評価未提出（{label}）', { label: feedbackTeamLabel(missingModalRoundConfig) })
            }}</strong>
            <p class="muted small">
              {{ missingFeedbackTeamNames(missingModalRoundConfig).join(', ') }}
            </p>
          </div>
          <div v-if="missingFeedbackAdjudicatorNames(missingModalRoundConfig).length > 0" class="stack tight">
            <strong class="small">{{ $t('評価未提出（ジャッジ）') }}</strong>
            <p class="muted small">
              {{ missingFeedbackAdjudicatorNames(missingModalRoundConfig).join(', ') }}
            </p>
          </div>
        </template>
        <p v-else class="muted small">{{ $t('ラウンドがまだありません。') }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import ReloadButton from '@/components/common/ReloadButton.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useRoundsStore } from '@/stores/rounds'
import { useDrawsStore } from '@/stores/draws'
import { useSubmissionsStore } from '@/stores/submissions'
import { useTeamsStore } from '@/stores/teams'
import { useSpeakersStore } from '@/stores/speakers'
import { useAdjudicatorsStore } from '@/stores/adjudicators'

const route = useRoute()
const roundsStore = useRoundsStore()
const drawsStore = useDrawsStore()
const submissionsStore = useSubmissionsStore()
const teamsStore = useTeamsStore()
const speakersStore = useSpeakersStore()
const adjudicatorsStore = useAdjudicatorsStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const sortedRounds = computed(() => roundsStore.rounds.slice().sort((a, b) => a.round - b.round))
const expandedRounds = ref<Record<string, boolean>>({})
const advancedSettingsExpanded = ref<Record<string, boolean>>({})
const missingModalRound = ref<number | null>(null)
const sectionLoading = ref(true)
const quickView = ref<{ round: number; type: 'allocation' | 'submissions' } | null>(null)
const isLoading = computed(
  () =>
    roundsStore.loading ||
    drawsStore.loading ||
    submissionsStore.loading ||
    teamsStore.loading ||
    speakersStore.loading ||
    adjudicatorsStore.loading
)

const createForm = reactive({
  round: 1,
  name: '',
})

function defaultRoundUserDefined() {
  return {
    hidden: false,
    evaluate_from_adjudicators: true,
    evaluate_from_teams: true,
    chairs_always_evaluated: false,
    no_speaker_score: false,
    allow_low_tie_win: true,
    score_by_matter_manner: true,
    poi: true,
    best: true,
    evaluator_in_team: 'team',
  }
}

type RoundSettingsDraft = {
  motion: string
  weights: { chair: number; panel: number; trainee: number }
  userDefined: ReturnType<typeof defaultRoundUserDefined>
}
const roundDrafts = reactive<Record<string, RoundSettingsDraft>>({})

function createRoundDraft(round: any): RoundSettingsDraft {
  const motions = Array.isArray(round.motions) ? round.motions : []
  const userDefined = round.userDefinedData ?? {}
  return {
    motion: motions[0] ? String(motions[0]) : '',
    weights: {
      chair: Number(round.weightsOfAdjudicators?.chair ?? 1),
      panel: Number(round.weightsOfAdjudicators?.panel ?? 1),
      trainee: Number(round.weightsOfAdjudicators?.trainee ?? 0),
    },
    userDefined: {
      ...defaultRoundUserDefined(),
      ...userDefined,
      hidden: false,
      evaluator_in_team: userDefined.evaluator_in_team === 'speaker' ? 'speaker' : 'team',
    },
  }
}

function roundDraft(round: any): RoundSettingsDraft {
  if (!roundDrafts[round._id]) {
    roundDrafts[round._id] = createRoundDraft(round)
  }
  return roundDrafts[round._id]
}

function syncRoundDrafts(rounds: any[]) {
  const ids = new Set(rounds.map((round) => String(round._id)))
  Object.keys(roundDrafts).forEach((id) => {
    if (!ids.has(id)) {
      delete roundDrafts[id]
    }
  })
  rounds.forEach((round) => {
    roundDrafts[round._id] = createRoundDraft(round)
  })
}

const drawByRound = computed(() => {
  const map = new Map<number, any>()
  drawsStore.draws.forEach((draw) => {
    map.set(Number(draw.round), draw)
  })
  return map
})

function roundDraw(roundNumber: number) {
  return drawByRound.value.get(Number(roundNumber))
}

function parseTimestamp(value?: string) {
  if (!value) return Number.NaN
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : Number.NaN
}

function drawUpdatedLabel(roundNumber: number) {
  const draw = roundDraw(roundNumber)
  if (!draw?.updatedAt) return ''
  const createdMs = parseTimestamp(draw.createdAt)
  const updatedMs = parseTimestamp(draw.updatedAt)
  if (Number.isFinite(createdMs) && Number.isFinite(updatedMs) && updatedMs <= createdMs + 1000) {
    return ''
  }
  const updatedDate = new Date(draw.updatedAt)
  if (Number.isNaN(updatedDate.getTime())) return String(draw.updatedAt)
  return updatedDate.toLocaleString()
}

function roundLabel(roundNumber: number) {
  const round = sortedRounds.value.find((item) => Number(item.round) === Number(roundNumber))
  return round?.name || t('ラウンド {round}', { round: roundNumber })
}

const quickViewTitle = computed(() => {
  if (!quickView.value) return ''
  const label = roundLabel(quickView.value.round)
  return quickView.value.type === 'allocation'
    ? `${label} ${t('対戦表設定')}`
    : `${label} ${t('提出データ閲覧')}`
})

const quickViewSrc = computed(() => {
  if (!quickView.value) return ''
  if (quickView.value.type === 'allocation') {
    return `/admin-embed/${tournamentId.value}/rounds/${quickView.value.round}/allocation`
  }
  return `/admin-embed/${tournamentId.value}/submissions?round=${quickView.value.round}`
})

const missingModalRoundConfig = computed(() => {
  if (missingModalRound.value === null) return null
  return (
    sortedRounds.value.find((round) => Number(round.round) === Number(missingModalRound.value)) ?? null
  )
})

function expectedAdjudicatorIds(roundNumber: number) {
  const set = new Set<string>()
  const draw = roundDraw(roundNumber)
  const allocation = Array.isArray(draw?.allocation) ? draw.allocation : []
  allocation.forEach((row: any) => {
    ;(row.chairs ?? []).forEach((id: string) => id && set.add(String(id)))
    ;(row.panels ?? []).forEach((id: string) => id && set.add(String(id)))
    ;(row.trainees ?? []).forEach((id: string) => id && set.add(String(id)))
  })
  return set
}

function expectedTeamIds(roundNumber: number) {
  const set = new Set<string>()
  const draw = roundDraw(roundNumber)
  const allocation = Array.isArray(draw?.allocation) ? draw.allocation : []
  allocation.forEach((row: any) => {
    if (row?.teams?.gov) set.add(String(row.teams.gov))
    if (row?.teams?.opp) set.add(String(row.teams.opp))
  })
  return set
}

function teamSpeakerIds(teamId: string, roundNumber: number) {
  const team = teamsStore.teams.find((item) => item._id === teamId)
  if (!team) return []
  const detail = team.details?.find((item: any) => Number(item.r) === Number(roundNumber))
  const detailSpeakerIds = (detail?.speakers ?? []).map((id: any) => String(id)).filter(Boolean)
  if (detailSpeakerIds.length > 0) return detailSpeakerIds
  return (team.speakers ?? [])
    .map((speaker: any) => {
      const name = String(speaker?.name ?? '')
      if (!name) return ''
      return speakersStore.speakers.find((item) => item.name === name)?._id ?? ''
    })
    .filter(Boolean)
}

function submittedIds(roundNumber: number, type: 'ballot' | 'feedback') {
  const set = new Set<string>()
  submissionsStore.submissions.forEach((item) => {
    if (Number(item.round) !== Number(roundNumber) || item.type !== type) return
    const id = (item.payload as any)?.submittedEntityId
    if (id) set.add(String(id))
  })
  return set
}

function intersectionCount(expected: Set<string>, actual: Set<string>) {
  let count = 0
  expected.forEach((id) => {
    if (actual.has(id)) count += 1
  })
  return count
}

function ballotExpectedCount(round: any) {
  return expectedAdjudicatorIds(round.round).size
}

function ballotSubmittedCount(round: any) {
  const expected = expectedAdjudicatorIds(round.round)
  const actual = submittedIds(round.round, 'ballot')
  return intersectionCount(expected, actual)
}

function feedbackExpectedCount(round: any) {
  const expected = new Set<string>()
  const userDefined = round.userDefinedData ?? {}
  const teamIds = expectedTeamIds(round.round)
  if (userDefined.evaluate_from_teams !== false) {
    if ((userDefined.evaluator_in_team ?? 'team') === 'speaker') {
      teamIds.forEach((teamId) => {
        teamSpeakerIds(teamId, round.round).forEach((id) => expected.add(id))
      })
    } else {
      teamIds.forEach((id) => expected.add(id))
    }
  }
  if (userDefined.evaluate_from_adjudicators !== false) {
    expectedAdjudicatorIds(round.round).forEach((id) => expected.add(id))
  }
  return expected.size
}

function feedbackSubmittedCount(round: any) {
  const expected = new Set<string>()
  const userDefined = round.userDefinedData ?? {}
  const teamIds = expectedTeamIds(round.round)
  if (userDefined.evaluate_from_teams !== false) {
    if ((userDefined.evaluator_in_team ?? 'team') === 'speaker') {
      teamIds.forEach((teamId) => {
        teamSpeakerIds(teamId, round.round).forEach((id) => expected.add(id))
      })
    } else {
      teamIds.forEach((id) => expected.add(id))
    }
  }
  if (userDefined.evaluate_from_adjudicators !== false) {
    expectedAdjudicatorIds(round.round).forEach((id) => expected.add(id))
  }
  const actual = submittedIds(round.round, 'feedback')
  return intersectionCount(expected, actual)
}

function feedbackTeamLabel(round: any) {
  const userDefined = round.userDefinedData ?? {}
  return (userDefined.evaluator_in_team ?? 'team') === 'speaker' ? t('スピーカー') : t('チーム')
}

function teamName(id: string) {
  return teamsStore.teams.find((item) => item._id === id)?.name ?? id
}

function speakerName(id: string) {
  return speakersStore.speakers.find((item) => item._id === id)?.name ?? id
}

function adjudicatorName(id: string) {
  return adjudicatorsStore.adjudicators.find((item) => item._id === id)?.name ?? id
}

function missingBallotNames(round: any) {
  const roundNumber = Number(round.round)
  const submitted = submittedIds(roundNumber, 'ballot')
  return Array.from(expectedAdjudicatorIds(roundNumber))
    .filter((id) => !submitted.has(id))
    .map(adjudicatorName)
}

function missingFeedbackTeamNames(round: any) {
  const roundNumber = Number(round.round)
  const userDefined = round.userDefinedData ?? {}
  if (userDefined.evaluate_from_teams === false) return []
  const submitted = submittedIds(roundNumber, 'feedback')

  if ((userDefined.evaluator_in_team ?? 'team') === 'speaker') {
    const expected = new Set<string>()
    expectedTeamIds(roundNumber).forEach((teamId) => {
      teamSpeakerIds(teamId, roundNumber).forEach((speakerId) => expected.add(speakerId))
    })
    return Array.from(expected)
      .filter((id) => !submitted.has(id))
      .map(speakerName)
  }

  return Array.from(expectedTeamIds(roundNumber))
    .filter((id) => !submitted.has(id))
    .map(teamName)
}

function missingFeedbackAdjudicatorNames(round: any) {
  const roundNumber = Number(round.round)
  const userDefined = round.userDefinedData ?? {}
  if (userDefined.evaluate_from_adjudicators === false) return []
  const submitted = submittedIds(roundNumber, 'feedback')
  return Array.from(expectedAdjudicatorIds(roundNumber))
    .filter((id) => !submitted.has(id))
    .map(adjudicatorName)
}

function isExpanded(roundId: string) {
  return expandedRounds.value[roundId] === true
}

function toggleRound(roundId: string) {
  expandedRounds.value = {
    ...expandedRounds.value,
    [roundId]: !isExpanded(roundId),
  }
}

function isAdvancedSettingsExpanded(roundId: string) {
  return advancedSettingsExpanded.value[roundId] === true
}

function toggleAdvancedSettings(roundId: string) {
  advancedSettingsExpanded.value = {
    ...advancedSettingsExpanded.value,
    [roundId]: !isAdvancedSettingsExpanded(roundId),
  }
}

async function refresh() {
  if (!tournamentId.value) return
  sectionLoading.value = true
  try {
    await Promise.all([
      roundsStore.fetchRounds(tournamentId.value),
      drawsStore.fetchDraws(tournamentId.value),
      submissionsStore.fetchSubmissions({ tournamentId: tournamentId.value }),
      teamsStore.fetchTeams(tournamentId.value),
      speakersStore.fetchSpeakers(tournamentId.value),
      adjudicatorsStore.fetchAdjudicators(tournamentId.value),
    ])
  } finally {
    sectionLoading.value = false
  }
}

async function createRound() {
  if (!createForm.round) return
  const created = await roundsStore.createRound({
    tournamentId: tournamentId.value,
    round: Number(createForm.round),
    name: createForm.name || t('ラウンド {round}', { round: createForm.round }),
    motionOpened: false,
    teamAllocationOpened: false,
    adjudicatorAllocationOpened: false,
    userDefinedData: {
      ...defaultRoundUserDefined(),
      hidden: false,
    },
  })
  if (created?._id) {
    expandedRounds.value = {
      ...expandedRounds.value,
      [created._id]: true,
    }
  }
  createForm.round += 1
  createForm.name = ''
}

async function onMotionOpenedChange(round: any, event: Event) {
  const target = event.target as HTMLInputElement | null
  await roundsStore.updateRound({
    tournamentId: tournamentId.value,
    roundId: round._id,
    motionOpened: Boolean(target?.checked),
  })
}

async function saveRoundSettings(round: any) {
  const draft = roundDraft(round)
  await roundsStore.updateRound({
    tournamentId: tournamentId.value,
    roundId: round._id,
    weightsOfAdjudicators: {
      chair: Number(draft.weights.chair),
      panel: Number(draft.weights.panel),
      trainee: Number(draft.weights.trainee),
    },
    userDefinedData: {
      ...draft.userDefined,
      hidden: false,
      evaluator_in_team: draft.userDefined.evaluator_in_team === 'speaker' ? 'speaker' : 'team',
    },
  })
}

async function saveRoundMotion(round: any) {
  const draft = roundDraft(round)
  await roundsStore.updateRound({
    tournamentId: tournamentId.value,
    roundId: round._id,
    motions: draft.motion.trim() ? [draft.motion.trim()] : [],
  })
}

function openRoundModal(roundNumber: number, type: 'allocation' | 'submissions') {
  quickView.value = { round: roundNumber, type }
}

function closeQuickView() {
  quickView.value = null
}

function openMissingModal(roundNumber: number) {
  missingModalRound.value = roundNumber
}

function closeMissingModal() {
  missingModalRound.value = null
}

async function onTeamAllocationChange(round: any, event: Event) {
  const target = event.target as HTMLInputElement | null
  await roundsStore.updateRound({
    tournamentId: tournamentId.value,
    roundId: round._id,
    teamAllocationOpened: Boolean(target?.checked),
  })
}

async function onAdjudicatorAllocationChange(round: any, event: Event) {
  const target = event.target as HTMLInputElement | null
  await roundsStore.updateRound({
    tournamentId: tournamentId.value,
    roundId: round._id,
    adjudicatorAllocationOpened: Boolean(target?.checked),
  })
}

async function removeRound(id: string) {
  const ok = window.confirm(t('ラウンドを削除しますか？'))
  if (!ok) return
  const deleted = await roundsStore.deleteRound(tournamentId.value, id)
  if (deleted) {
    const next = { ...expandedRounds.value }
    delete next[id]
    expandedRounds.value = next
    const nextAdvanced = { ...advancedSettingsExpanded.value }
    delete nextAdvanced[id]
    advancedSettingsExpanded.value = nextAdvanced
  }
}

watch(
  tournamentId,
  () => {
    refresh()
  },
  { immediate: true }
)

watch(
  sortedRounds,
  (rounds) => {
    syncRoundDrafts(rounds)
    const next: Record<string, boolean> = {}
    const nextAdvanced: Record<string, boolean> = {}
    rounds.forEach((round, index) => {
      const existing = expandedRounds.value[round._id]
      next[round._id] = existing ?? index === 0
      nextAdvanced[round._id] = advancedSettingsExpanded.value[round._id] ?? false
    })
    expandedRounds.value = next
    advancedSettingsExpanded.value = nextAdvanced
    if (
      missingModalRound.value !== null &&
      !rounds.some((round) => Number(round.round) === Number(missingModalRound.value))
    ) {
      missingModalRound.value = null
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

.section-row {
  align-items: center;
}

.section-reload {
  margin-left: auto;
}

.create-actions {
  grid-column: 1 / -1;
}

.round-cards {
  gap: var(--space-3);
}

.round-card {
  padding: var(--space-4);
}

.round-head {
  gap: var(--space-2);
}

.round-head-row {
  align-items: center;
  gap: var(--space-2);
}

.round-head-actions {
  margin-left: auto;
  align-items: center;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.round-shortcuts {
  padding-top: var(--space-1);
  gap: var(--space-2);
  flex-wrap: wrap;
}

.round-toggle {
  border: none;
  background: transparent;
  padding: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  text-align: left;
  cursor: pointer;
}

.toggle-icon {
  width: 24px;
  height: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-muted);
  transition: transform 0.15s ease;
  flex-shrink: 0;
}

.toggle-icon.open {
  transform: rotate(90deg);
}

.round-body {
  padding-top: var(--space-1);
}

.round-settings-frame {
  border: 1px solid var(--color-border);
  gap: var(--space-3);
}

.motion-editor {
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-2);
}

.motion-actions {
  gap: var(--space-2);
  flex-wrap: wrap;
}

.motion-field {
  width: 100%;
}

.motion-field :deep(.field-control) {
  width: 100%;
}

.advanced-toggle-button {
  white-space: nowrap;
}

.advanced-settings {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface-muted);
}

.weight-grid {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.settings-group {
  gap: var(--space-2);
}

.settings-group + .settings-group {
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-2);
}

.settings-group-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.settings-options-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.status-grid {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.status-card {
  padding: var(--space-2);
  border: 1px solid var(--color-border);
}

.status-head {
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}

.status-head-vertical {
  align-items: flex-start;
  justify-content: flex-start;
  gap: var(--space-1);
}

.switch-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.status-line {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  align-items: center;
  font-size: 13px;
}

.switch {
  position: relative;
  display: inline-flex;
  width: 42px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: #cbd5e1;
  transition: background 0.15s ease;
}

.switch-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
  transition: transform 0.15s ease;
}

.switch input:checked + .switch-slider {
  background: var(--color-primary);
}

.switch input:checked + .switch-slider::before {
  transform: translateX(18px);
}

.tight {
  gap: 2px;
}

.setting-option {
  align-items: center;
  gap: 8px;
}

.help-badge {
  width: 18px;
  height: 18px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-muted);
  flex-shrink: 0;
  user-select: none;
}

.error {
  color: var(--color-danger);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--space-5);
  z-index: 30;
}

.modal {
  max-width: 720px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
}

.quick-modal {
  max-width: min(1200px, 95vw);
}

.quick-frame {
  width: 100%;
  height: min(80vh, 860px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.missing-modal {
  max-width: min(780px, 95vw);
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.modal-close {
  width: 34px;
  height: 34px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.modal-close:hover {
  background: var(--color-surface-muted);
}

.modal-close:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 1px;
}

@media (max-width: 760px) {
  .round-shortcuts {
    padding-top: var(--space-1);
  }
}
</style>
