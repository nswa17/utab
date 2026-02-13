<template>
  <section class="stack">
    <div v-if="!isEmbeddedRoute" class="row section-row">
      <h3>{{ $t('ラウンド詳細設定') }}</h3>
      <span v-if="lastRefreshedLabel" class="muted small section-meta">{{
        $t('最終更新: {time}', { time: lastRefreshedLabel })
      }}</span>
    </div>

    <div v-if="!isEmbeddedRoute && !sectionLoading" class="card stack">
      <p class="muted">{{ $t('ラウンド作成は大会セットアップで行います。') }}</p>
      <div class="row">
        <Button variant="ghost" size="sm" :to="`/admin/${tournamentId}/setup`">
          {{ $t('大会セットアップ') }}
        </Button>
      </div>
    </div>

    <LoadingState v-if="sectionLoading" />
    <p v-else-if="roundsStore.error" class="error">{{ roundsStore.error }}</p>
    <p v-else-if="displayRounds.length === 0" class="muted">
      {{ $t('ラウンドがまだありません。') }}
    </p>

    <div v-else class="stack round-cards" :class="{ embed: isEmbeddedRoute }">
      <article v-for="round in displayRounds" :key="round._id" class="card stack round-card">
        <div v-if="!isEmbeddedRoute" class="stack round-head">
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
            <div v-if="!isEmbeddedRoute" class="row round-head-actions">
              <Button variant="danger" size="sm" class="round-delete" @click="requestRemoveRound(round._id)">
                {{ $t('削除') }}
              </Button>
            </div>
          </div>
        </div>

        <div v-show="isEmbeddedRoute || isExpanded(round._id)" class="stack round-body">
          <div class="card soft stack round-settings-frame">
            <div class="grid status-grid">
              <div class="card soft stack status-card">
                <div class="stack status-head status-head-vertical">
                  <h4 class="status-card-title">{{ $t('モーション公開') }}</h4>
                  <div class="switch-state">
                    <span class="switch-label">{{ $t('非公開') }}</span>
                    <label class="switch">
                      <input
                        type="checkbox"
                        :checked="Boolean(round.motionOpened)"
                        :disabled="isLoading"
                        @change="onMotionOpenedChange(round, $event)"
                      />
                      <span class="switch-slider"></span>
                    </label>
                    <span class="switch-label">{{ $t('公開') }}</span>
                  </div>
                </div>
              </div>
              <div class="card soft stack status-card">
                <div class="stack status-head status-head-vertical">
                  <h4 class="status-card-title">{{ $t('チーム割り当て') }}</h4>
                  <div class="switch-state">
                    <span class="switch-label">{{ $t('非公開') }}</span>
                    <label class="switch">
                      <input
                        type="checkbox"
                        :checked="Boolean(round.teamAllocationOpened)"
                        :disabled="isLoading"
                        @change="onTeamAllocationChange(round, $event)"
                      />
                      <span class="switch-slider"></span>
                    </label>
                    <span class="switch-label">{{ $t('公開') }}</span>
                  </div>
                </div>
              </div>
              <div class="card soft stack status-card">
                <div class="stack status-head status-head-vertical">
                  <h4 class="status-card-title">{{ $t('ジャッジ割り当て') }}</h4>
                  <div class="switch-state">
                    <span class="switch-label">{{ $t('非公開') }}</span>
                    <label class="switch">
                      <input
                        type="checkbox"
                        :checked="Boolean(round.adjudicatorAllocationOpened)"
                        :disabled="isLoading"
                        @change="onAdjudicatorAllocationChange(round, $event)"
                      />
                      <span class="switch-slider"></span>
                    </label>
                    <span class="switch-label">{{ $t('公開') }}</span>
                  </div>
                </div>
              </div>
              <div class="card soft stack status-card">
                <h4 class="status-card-title">{{ $t('提出状況') }}</h4>
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
                  <Button variant="secondary" size="sm" @click="openMissingModal(round.round)">
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
                <Button
                  variant="secondary"
                  class="motion-update-button"
                  size="sm"
                  :disabled="isLoading"
                  @click="saveRoundMotion(round)"
                >
                  {{ $t('モーションを更新') }}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!isEmbeddedRoute" class="row round-shortcuts">
          <Button variant="secondary" size="sm" @click="openRoundPage(round.round, 'allocation')">
            {{ $t('対戦表設定') }}
          </Button>
          <Button variant="secondary" size="sm" @click="openRoundPage(round.round, 'submissions')">
            {{ $t('提出データ閲覧') }}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            class="advanced-toggle-button"
            :class="{ active: isAdvancedSettingsExpanded(round._id) }"
            :aria-pressed="isAdvancedSettingsExpanded(round._id) ? 'true' : 'false'"
            :disabled="isLoading"
            @click="toggleAdvancedSettings(round._id)"
          >
            {{ $t('ラウンド詳細設定') }}
          </Button>
        </div>

        <div
          v-show="isExpanded(round._id) && isAdvancedSettingsExpanded(round._id)"
          class="stack advanced-settings"
        >
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

          <section class="stack settings-group">
            <h5 class="settings-group-title">{{ $t('ブレイク設定') }}</h5>
            <div class="grid settings-options-grid">
              <label class="row small setting-option">
                <input v-model="roundDraft(round).break.enabled" type="checkbox" />
                <span>{{ $t('ブレイクラウンドとして扱う') }}</span>
                <span
                  class="help-badge"
                  :title="$t('有効化すると、参加チーム確定時に Team.details[r].available を同期します。')"
                  aria-hidden="true"
                  >?</span
                >
              </label>
              <Field :label="$t('参照ラウンド')" v-slot="{ id, describedBy }">
                <select
                  :id="id"
                  :aria-describedby="describedBy"
                  v-model="roundDraft(round).break.source"
                >
                  <option value="submissions">{{ $t('提出データ') }}</option>
                  <option value="raw">{{ $t('Raw結果') }}</option>
                </select>
                <div class="stack break-source-options">
                  <label
                    v-for="sourceRound in breakSourceRoundOptions(round.round)"
                    :key="`break-source-${round._id}-${sourceRound}`"
                    class="row small break-source-option"
                  >
                    <input
                      type="checkbox"
                      :checked="roundDraft(round).break.sourceRounds.includes(sourceRound)"
                      @change="onBreakSourceRoundToggle(roundDraft(round).break, sourceRound, $event)"
                    />
                    <span>{{ roundLabel(sourceRound) }}</span>
                  </label>
                </div>
                <p class="muted small">
                  {{ $t('未選択時は直前までの全ラウンドを参照します。') }}
                </p>
              </Field>
              <Field :label="$t('ブレイク人数')" v-slot="{ id, describedBy }">
                <input
                  v-model.number="roundDraft(round).break.size"
                  :id="id"
                  :aria-describedby="describedBy"
                  type="number"
                  min="1"
                />
              </Field>
              <Field :label="$t('境界同点の扱い')" v-slot="{ id, describedBy }">
                <select
                  v-model="roundDraft(round).break.cutoffTiePolicy"
                  :id="id"
                  :aria-describedby="describedBy"
                >
                  <option value="manual">{{ $t('手動選抜') }}</option>
                  <option value="include_all">{{ $t('同点は全員含める') }}</option>
                  <option value="strict">{{ $t('人数を厳密適用') }}</option>
                </select>
              </Field>
              <Field :label="$t('シード方式')" v-slot="{ id, describedBy }">
                <select v-model="roundDraft(round).break.seeding" :id="id" :aria-describedby="describedBy">
                  <option value="high_low">{{ $t('High-Low (1 vs N)') }}</option>
                </select>
              </Field>
            </div>

            <div class="row break-actions">
              <Button
                variant="secondary"
                size="sm"
                :disabled="isLoading || !roundDraft(round).break.enabled || roundDraft(round).break.loading"
                @click="refreshBreakCandidates(round)"
              >
                {{
                  roundDraft(round).break.loading
                    ? $t('候補更新中...')
                    : $t('ブレイク候補を更新')
                }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                :disabled="
                  isLoading ||
                  !roundDraft(round).break.enabled ||
                  roundDraft(round).break.participants.length === 0
                "
                @click="resetBreakParticipantSeeds(roundDraft(round).break)"
              >
                {{ $t('候補順位でシード再設定') }}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                :disabled="isLoading || !roundDraft(round).break.enabled"
                @click="saveRoundBreak(round)"
              >
                {{ $t('ブレイク参加を保存') }}
              </Button>
            </div>

            <p v-if="roundDraft(round).break.error" class="error small">
              {{ roundDraft(round).break.error }}
            </p>

            <p class="muted small">
              {{
                $t('選択中 {selected}/{total}', {
                  selected: roundDraft(round).break.participants.length,
                  total: roundDraft(round).break.candidates.length,
                })
              }}
            </p>

            <div
              v-if="roundDraft(round).break.candidates.length > 0"
              class="break-candidates-table-wrapper"
            >
              <table class="break-candidates-table">
                <thead>
                  <tr>
                    <th>{{ $t('参加') }}</th>
                    <th>{{ $t('シード') }}</th>
                    <th>{{ $t('順位') }}</th>
                    <th>{{ $t('チーム') }}</th>
                    <th>{{ $t('勝敗点') }}</th>
                    <th>{{ $t('スコア') }}</th>
                    <th>{{ $t('マージン') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="candidate in roundDraft(round).break.candidates"
                    :key="candidate.teamId"
                    :class="{ 'cutoff-tie-row': candidate.isCutoffTie }"
                  >
                    <td>
                      <input
                        type="checkbox"
                        :checked="isBreakParticipantSelected(roundDraft(round).break, candidate.teamId)"
                        @change="onBreakParticipantToggle(roundDraft(round).break, candidate.teamId, $event)"
                      />
                    </td>
                    <td>
                      <template
                        v-if="isBreakParticipantSelected(roundDraft(round).break, candidate.teamId)"
                      >
                        <input
                          class="break-seed-input"
                          type="number"
                          min="1"
                          :value="breakParticipantSeed(roundDraft(round).break, candidate.teamId)"
                          @change="
                            onBreakParticipantSeedChange(
                              roundDraft(round).break,
                              candidate.teamId,
                              $event
                            )
                          "
                        />
                      </template>
                      <span v-else class="muted">-</span>
                    </td>
                    <td>{{ candidate.ranking ?? '-' }}</td>
                    <td>{{ candidate.teamName }}</td>
                    <td>{{ candidate.win }}</td>
                    <td>{{ candidate.sum }}</td>
                    <td>{{ candidate.margin }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div class="row">
            <Button size="sm" :disabled="isLoading" @click="saveRoundSettings(round)">
              {{ $t('設定を保存') }}
            </Button>
          </div>
        </div>
      </article>
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

    <div
      v-if="roundDeleteModalRound"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeRoundDeleteModal"
    >
      <div class="modal card stack" role="dialog" aria-modal="true">
        <h4>{{ $t('ラウンド削除') }}</h4>
        <p class="muted">
          {{
            $t('ラウンド {round} を削除しますか？', {
              round: roundDeleteModalRound.name || $t('ラウンド {round}', { round: roundDeleteModalRound.round }),
            })
          }}
        </p>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="closeRoundDeleteModal">{{ $t('キャンセル') }}</Button>
          <Button variant="danger" size="sm" :disabled="isLoading" @click="confirmRemoveRound">
            {{ $t('削除') }}
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useRoundsStore } from '@/stores/rounds'
import { useDrawsStore } from '@/stores/draws'
import { useSubmissionsStore } from '@/stores/submissions'
import { useTeamsStore } from '@/stores/teams'
import { useSpeakersStore } from '@/stores/speakers'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { defaultRoundDefaults } from '@/utils/round-defaults'
import type { RoundBreakConfig } from '@/types/round'

const route = useRoute()
const router = useRouter()
const roundsStore = useRoundsStore()
const drawsStore = useDrawsStore()
const submissionsStore = useSubmissionsStore()
const teamsStore = useTeamsStore()
const speakersStore = useSpeakersStore()
const adjudicatorsStore = useAdjudicatorsStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const isEmbeddedRoute = computed(
  () => route.path.startsWith('/admin-embed/') || String(route.query.embed ?? '') === '1'
)
const sortedRounds = computed(() => roundsStore.rounds.slice().sort((a, b) => a.round - b.round))
const selectedRoundFromQuery = computed(() => {
  const queryRound = Number(route.query.round)
  if (!Number.isInteger(queryRound) || queryRound < 1) return null
  return queryRound
})
const displayRounds = computed(() => {
  if (selectedRoundFromQuery.value === null) return sortedRounds.value
  return sortedRounds.value.filter((round) => Number(round.round) === selectedRoundFromQuery.value)
})
const expandedRounds = ref<Record<string, boolean>>({})
const advancedSettingsExpanded = ref<Record<string, boolean>>({})
const missingModalRound = ref<number | null>(null)
const roundDeleteModalId = ref<string | null>(null)
const sectionLoading = ref(true)
const lastRefreshedAt = ref<string>('')
const isLoading = computed(
  () =>
    roundsStore.loading ||
    drawsStore.loading ||
    submissionsStore.loading ||
    teamsStore.loading ||
    speakersStore.loading ||
    adjudicatorsStore.loading
)
const lastRefreshedLabel = computed(() => {
  if (!lastRefreshedAt.value) return ''
  const date = new Date(lastRefreshedAt.value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
})
const roundDeleteModalRound = computed(() => {
  if (!roundDeleteModalId.value) return null
  return sortedRounds.value.find((round) => round._id === roundDeleteModalId.value) ?? null
})

function defaultRoundUserDefined() {
  return { ...defaultRoundDefaults().userDefinedData, hidden: false }
}

type BreakCandidate = {
  teamId: string
  teamName: string
  ranking: number | null
  win: number
  sum: number
  margin: number
  available: boolean
  tieGroup: number
  isCutoffTie: boolean
}

type BreakDraft = {
  enabled: boolean
  source: 'submissions' | 'raw'
  sourceRounds: number[]
  size: number
  cutoffTiePolicy: 'manual' | 'include_all' | 'strict'
  seeding: 'high_low'
  participants: Array<{ teamId: string; seed: number }>
  candidates: BreakCandidate[]
  loading: boolean
  error: string
}

function normalizeBreakParticipants(
  participants: unknown
): Array<{ teamId: string; seed: number }> {
  if (!Array.isArray(participants)) return []
  const seen = new Set<string>()
  const normalized: Array<{ teamId: string; seed: number }> = []
  for (const raw of participants) {
    const teamId = String((raw as any)?.teamId ?? '').trim()
    const seed = Number((raw as any)?.seed)
    if (teamId.length === 0 || !Number.isInteger(seed) || seed < 1) continue
    if (seen.has(teamId)) continue
    seen.add(teamId)
    normalized.push({ teamId, seed })
  }
  return normalized.sort((left, right) => left.seed - right.seed)
}

function normalizeSourceRounds(roundNumber: number, sourceRounds: unknown): number[] {
  if (!Array.isArray(sourceRounds)) return []
  return Array.from(
    new Set(
      sourceRounds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1 && value < roundNumber)
    )
  ).sort((left, right) => left - right)
}

function defaultBreakDraft(roundNumber: number, rawBreak: unknown): BreakDraft {
  const source = (rawBreak ?? {}) as Record<string, any>
  const sizeRaw = Number(source.size)
  const size = Number.isInteger(sizeRaw) && sizeRaw >= 1 ? sizeRaw : 8
  return {
    enabled: source.enabled === true,
    source: source.source === 'raw' ? 'raw' : 'submissions',
    sourceRounds: normalizeSourceRounds(roundNumber, source.source_rounds),
    size,
    cutoffTiePolicy:
      source.cutoff_tie_policy === 'include_all' || source.cutoff_tie_policy === 'strict'
        ? source.cutoff_tie_policy
        : 'manual',
    seeding: 'high_low',
    participants: normalizeBreakParticipants(source.participants),
    candidates: [],
    loading: false,
    error: '',
  }
}

type RoundSettingsDraft = {
  motion: string
  weights: { chair: number; panel: number; trainee: number }
  userDefined: ReturnType<typeof defaultRoundUserDefined>
  break: BreakDraft
}
const roundDrafts = reactive<Record<string, RoundSettingsDraft>>({})

function createRoundDraft(round: any): RoundSettingsDraft {
  const motions = Array.isArray(round.motions) ? round.motions : []
  const userDefined = round.userDefinedData ?? {}
  const userDefinedBreak = userDefined.break ?? {}
  const { break: _ignoredBreak, ...plainUserDefined } = userDefined
  void _ignoredBreak
  return {
    motion: motions[0] ? String(motions[0]) : '',
    weights: {
      chair: Number(round.weightsOfAdjudicators?.chair ?? 1),
      panel: Number(round.weightsOfAdjudicators?.panel ?? 1),
      trainee: Number(round.weightsOfAdjudicators?.trainee ?? 0),
    },
    userDefined: {
      ...defaultRoundUserDefined(),
      ...plainUserDefined,
      hidden: false,
      evaluator_in_team: plainUserDefined.evaluator_in_team === 'speaker' ? 'speaker' : 'team',
    },
    break: defaultBreakDraft(Number(round.round), userDefinedBreak),
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

function breakSourceRoundOptions(targetRound: number): number[] {
  return sortedRounds.value
    .map((round) => Number(round.round))
    .filter((roundNumber) => Number.isInteger(roundNumber) && roundNumber >= 1 && roundNumber < targetRound)
    .sort((left, right) => left - right)
}

function onBreakSourceRoundToggle(draft: BreakDraft, sourceRound: number, event: Event) {
  const target = event.target as HTMLInputElement | null
  const checked = Boolean(target?.checked)
  const current = new Set(draft.sourceRounds)
  if (checked) current.add(sourceRound)
  else current.delete(sourceRound)
  draft.sourceRounds = Array.from(current).sort((left, right) => left - right)
}

function selectedBreakTeamIds(draft: BreakDraft): Set<string> {
  return new Set(draft.participants.map((participant) => participant.teamId))
}

function pickBreakTeamIdsFromCandidates(
  candidates: BreakCandidate[],
  size: number,
  policy: 'manual' | 'include_all' | 'strict'
): string[] {
  if (candidates.length === 0 || size <= 0) return []
  if (policy === 'strict' || policy === 'manual') {
    return candidates.slice(0, size).map((candidate) => candidate.teamId)
  }
  const cutoff = candidates[Math.min(size - 1, candidates.length - 1)]
  if (!cutoff || cutoff.ranking === null) {
    return candidates.slice(0, size).map((candidate) => candidate.teamId)
  }
  const cutoffRanking = cutoff.ranking
  return candidates
    .filter((candidate) => candidate.ranking !== null && candidate.ranking <= cutoffRanking)
    .map((candidate) => candidate.teamId)
}

function resetBreakParticipantSeeds(draft: BreakDraft) {
  const order = new Map<string, number>(draft.candidates.map((candidate, index) => [candidate.teamId, index]))
  const sorted = draft.participants
    .filter((participant) => order.has(participant.teamId))
    .sort((left, right) => {
      const leftOrder = order.get(left.teamId) ?? Number.MAX_SAFE_INTEGER
      const rightOrder = order.get(right.teamId) ?? Number.MAX_SAFE_INTEGER
      if (leftOrder !== rightOrder) return leftOrder - rightOrder
      return left.teamId.localeCompare(right.teamId)
    })
    .map((participant, index) => ({ teamId: participant.teamId, seed: index + 1 }))
  draft.participants = sorted
}

function setBreakParticipantsFromTeamIds(draft: BreakDraft, teamIds: string[]) {
  const unique = Array.from(new Set(teamIds))
  draft.participants = unique.map((teamId, index) => ({ teamId, seed: index + 1 }))
}

function isBreakParticipantSelected(draft: BreakDraft, teamId: string): boolean {
  return selectedBreakTeamIds(draft).has(teamId)
}

function breakParticipantSeed(draft: BreakDraft, teamId: string): number | '' {
  const seed = draft.participants.find((participant) => participant.teamId === teamId)?.seed
  if (!Number.isInteger(seed) || Number(seed) < 1) return ''
  return Number(seed)
}

function nextBreakSeed(draft: BreakDraft): number {
  const usedSeeds = new Set<number>(
    draft.participants
      .map((participant) => Number(participant.seed))
      .filter((seed): seed is number => Number.isInteger(seed) && seed >= 1)
  )
  let nextSeed = 1
  while (usedSeeds.has(nextSeed)) {
    nextSeed += 1
  }
  return nextSeed
}

function onBreakParticipantSeedChange(draft: BreakDraft, teamId: string, event: Event) {
  const target = event.target as HTMLInputElement | null
  const nextSeedRaw = Number(target?.value)
  const nextSeed = Number.isInteger(nextSeedRaw) ? nextSeedRaw : 0
  draft.participants = draft.participants.map((participant) =>
    participant.teamId === teamId ? { ...participant, seed: nextSeed } : participant
  )
}

function onBreakParticipantToggle(draft: BreakDraft, teamId: string, event: Event) {
  const target = event.target as HTMLInputElement | null
  const checked = Boolean(target?.checked)
  if (checked) {
    if (!draft.participants.some((participant) => participant.teamId === teamId)) {
      draft.participants = [...draft.participants, { teamId, seed: nextBreakSeed(draft) }]
    }
  } else {
    draft.participants = draft.participants.filter((participant) => participant.teamId !== teamId)
  }
}

function effectiveBreakSourceRounds(round: any, draft: BreakDraft): number[] {
  const selected = normalizeSourceRounds(Number(round.round), draft.sourceRounds)
  if (selected.length > 0) return selected
  return breakSourceRoundOptions(Number(round.round))
}

async function refreshBreakCandidates(round: any) {
  const draft = roundDraft(round).break
  draft.loading = true
  draft.error = ''
  try {
    const response = await roundsStore.fetchBreakCandidates({
      tournamentId: tournamentId.value,
      roundId: round._id,
      source: draft.source,
      sourceRounds: effectiveBreakSourceRounds(round, draft),
      size: Number(draft.size),
    })
    if (!response) {
      draft.error = roundsStore.error ?? t('ブレイク候補の取得に失敗しました。')
      return
    }
    draft.candidates = Array.isArray(response.candidates) ? response.candidates : []
    draft.sourceRounds = Array.isArray(response.sourceRounds)
      ? response.sourceRounds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 1)
      : draft.sourceRounds

    const candidateTeamIds = new Set(draft.candidates.map((candidate) => candidate.teamId))
    draft.participants = draft.participants.filter((participant) => candidateTeamIds.has(participant.teamId))

    const currentSelected = selectedBreakTeamIds(draft)
    let selectedIds: string[] = []
    if (draft.cutoffTiePolicy === 'manual' && currentSelected.size > 0) {
      return
    }
    selectedIds = pickBreakTeamIdsFromCandidates(draft.candidates, Number(draft.size), draft.cutoffTiePolicy)
    setBreakParticipantsFromTeamIds(draft, selectedIds)
  } finally {
    draft.loading = false
  }
}

function validateBreakSeeds(draft: BreakDraft): string | null {
  const seenSeeds = new Set<number>()
  for (const participant of draft.participants) {
    const seed = Number(participant.seed)
    if (!Number.isInteger(seed) || seed < 1) {
      return t('シードは1以上の整数で入力してください。')
    }
    if (seenSeeds.has(seed)) {
      return t('シード番号が重複しています。')
    }
    seenSeeds.add(seed)
  }
  return null
}

function serializeBreakConfig(round: any, draft: BreakDraft): RoundBreakConfig {
  const source_rounds = normalizeSourceRounds(Number(round.round), draft.sourceRounds)
  const sizeRaw = Number(draft.size)
  const size = Number.isInteger(sizeRaw) && sizeRaw >= 1 ? sizeRaw : 1
  return {
    enabled: draft.enabled,
    source_rounds,
    size,
    cutoff_tie_policy: draft.cutoffTiePolicy,
    seeding: draft.seeding,
    participants: [...draft.participants]
      .sort((left, right) => left.seed - right.seed)
      .map((participant) => ({
        teamId: participant.teamId,
        seed: participant.seed,
      })),
  }
}

async function saveRoundBreak(round: any) {
  const draft = roundDraft(round).break
  draft.error = ''
  const seedError = validateBreakSeeds(draft)
  if (seedError) {
    draft.error = seedError
    return
  }
  const result = await roundsStore.saveBreakRound({
    tournamentId: tournamentId.value,
    roundId: round._id,
    breakConfig: serializeBreakConfig(round, draft),
    syncTeamAvailability: true,
  })
  if (!result) {
    draft.error = roundsStore.error ?? t('ブレイク設定の保存に失敗しました。')
    return
  }
  await teamsStore.fetchTeams(tournamentId.value)
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
    lastRefreshedAt.value = new Date().toISOString()
  } finally {
    sectionLoading.value = false
  }
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
  const existingBreak = (round.userDefinedData ?? {}).break
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
      ...(existingBreak ? { break: existingBreak } : {}),
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

function openRoundPage(roundNumber: number, type: 'allocation' | 'submissions') {
  if (type === 'allocation') {
    router.push(`/admin/${tournamentId.value}/rounds/${roundNumber}/allocation`)
    return
  }
  router.push({
    path: `/admin/${tournamentId.value}/submissions`,
    query: { round: String(roundNumber), context: 'round' },
  })
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

function requestRemoveRound(id: string) {
  roundDeleteModalId.value = id
}

function closeRoundDeleteModal() {
  roundDeleteModalId.value = null
}

async function confirmRemoveRound() {
  const id = roundDeleteModalId.value
  if (!id) return
  closeRoundDeleteModal()
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
  (roundsList) => {
    syncRoundDrafts(roundsList)
    if (
      missingModalRound.value !== null &&
      !roundsList.some((round) => Number(round.round) === Number(missingModalRound.value))
    ) {
      missingModalRound.value = null
    }
  },
  { immediate: true }
)

watch(
  displayRounds,
  (roundsList) => {
    const next: Record<string, boolean> = {}
    const nextAdvanced: Record<string, boolean> = {}
    roundsList.forEach((round, index) => {
      const existing = expandedRounds.value[round._id]
      next[round._id] = existing ?? index === 0
      nextAdvanced[round._id] = advancedSettingsExpanded.value[round._id] ?? false
    })
    expandedRounds.value = next
    advancedSettingsExpanded.value = nextAdvanced
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
  gap: var(--space-2);
}

.section-reload {
  margin-left: 0;
}

.section-meta {
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

.round-cards.embed .round-card {
  padding: 0;
  border: none;
  box-shadow: none;
  background: transparent;
}

.round-cards.embed .round-body {
  padding-top: 0;
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

.motion-update-button {
  background: #ffedd5;
  border-color: #fdba74;
  color: #9a3412;
}

.motion-update-button:hover {
  background: #fed7aa;
}

.motion-field {
  width: 100%;
}

.motion-field :deep(.field-control) {
  width: 100%;
}

.advanced-toggle-button {
  white-space: nowrap;
  border-color: var(--color-border);
}

.advanced-toggle-button.active {
  background: var(--color-secondary);
  border-color: var(--color-primary);
  color: var(--color-primary);
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

.status-card-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
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

.switch-label {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 700;
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

.break-source-options {
  margin-top: var(--space-2);
  max-height: 140px;
  overflow: auto;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.break-source-option {
  gap: 8px;
}

.break-actions {
  gap: var(--space-2);
  flex-wrap: wrap;
}

.break-candidates-table-wrapper {
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.break-candidates-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.break-candidates-table th,
.break-candidates-table td {
  border-bottom: 1px solid var(--color-border);
  padding: 8px;
  text-align: left;
  white-space: nowrap;
}

.break-candidates-table tbody tr:last-child td {
  border-bottom: none;
}

.break-seed-input {
  width: 72px;
  min-width: 72px;
}

.cutoff-tie-row {
  background: #fff7ed;
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

.modal-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
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
