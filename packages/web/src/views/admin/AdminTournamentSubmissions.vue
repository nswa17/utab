<template>
  <section class="stack">
    <div v-if="!isEmbeddedRoute" class="row section-header">
      <div class="stack tight">
        <h3>{{ $t('提出データ') }}</h3>
        <span v-if="contextRoundLabel" class="muted small">{{ contextRoundLabel }}</span>
      </div>
      <div class="row section-header-actions">
        <RouterLink v-if="!isEmbeddedRoute && contextRound !== null" class="context-link" :to="contextRoundPath">
          {{ $t('対戦表設定に戻る') }}
        </RouterLink>
      </div>
    </div>

    <LoadingState v-if="sectionLoading" />

    <template v-else>
      <section v-if="!hideSummaryCards" class="stats-grid">
        <div class="card soft stack stat-card">
          <span class="muted small">{{ $t('提出数') }}</span>
          <strong>{{ items.length }}</strong>
        </div>
        <div class="card soft stack stat-card">
          <span class="muted small">{{ $t('スコアシート') }}</span>
          <strong>{{ ballotCount }}</strong>
        </div>
        <div class="card soft stack stat-card">
          <span class="muted small">{{ $t('フィードバック') }}</span>
          <strong>{{ feedbackCount }}</strong>
        </div>
      </section>

      <div v-if="!splitByEvaluation && !focusEditOnly" :class="['stack', 'filter-bar', { card: !isEmbeddedRoute }]">
        <div class="grid">
          <Field :label="$t('種類')" v-slot="{ id, describedBy }">
            <select v-model="typeFilter" :id="id" :aria-describedby="describedBy">
              <option value="all">{{ $t('すべて') }}</option>
              <option value="ballot">{{ $t('スコアシート') }}</option>
              <option value="feedback">{{ $t('フィードバック') }}</option>
            </select>
          </Field>
          <Field v-if="!isRoundContext" :label="$t('ラウンド')" v-slot="{ id, describedBy }">
            <select v-model="roundFilter" :id="id" :aria-describedby="describedBy">
              <option value="">{{ $t('すべて') }}</option>
              <option v-for="round in sortedRounds" :key="round.round" :value="String(round.round)">
                {{ round.name ?? $t('ラウンド {round}', { round: round.round }) }}
              </option>
            </select>
          </Field>
          <div class="stack search-field">
            <input
              v-model="searchQuery"
              :placeholder="$t('提出者名で検索')"
            />
          </div>
        </div>
        <p v-if="isRoundContext && !focusEditOnly" class="muted small">
          {{ $t('この画面はラウンド固定です。') }}
        </p>
      </div>

      <p v-if="loadError" class="error">{{ loadError }}</p>
      <div v-else-if="focusEditOnly && focusedEditItem" class="stack focus-edit-only-content">
        <div v-if="focusedEditItem.type === 'ballot'" class="card soft stack ballot-card">
          <div class="grid ballot-meta-grid">
            <Field :label="govLabel" v-slot="{ id, describedBy }">
              <select :id="id" :aria-describedby="describedBy" v-model="editingBallotGovTeamId">
                <option value="">{{ $t('未選択') }}</option>
                <option
                  v-for="option in editingBallotSideTeamOptions"
                  :key="option.id"
                  :value="option.id"
                >
                  {{ option.name }}
                </option>
              </select>
            </Field>
            <Field :label="oppLabel" v-slot="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="teamName(editingBallotOppTeamId)"
                readonly
              />
            </Field>
            <Field :label="$t('勝者')" v-slot="{ id, describedBy }">
              <select :id="id" :aria-describedby="describedBy" v-model="editingBallotWinnerId">
                <option
                  v-for="option in editingBallotWinnerOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </Field>
            <Field :label="$t('提出者')" v-slot="{ id, describedBy }">
              <select :id="id" :aria-describedby="describedBy" v-model="editingBallotSubmittedEntityId">
                <option value="">{{ $t('未選択') }}</option>
                <optgroup :label="$t('ジャッジ')">
                  <option
                    v-for="option in adjudicatorEntityOptions"
                    :key="`adj-${option.id}`"
                    :value="option.id"
                  >
                    {{ option.name }}
                  </option>
                </optgroup>
              </select>
            </Field>
            <Field :label="$t('コメント')" class="full" v-slot="{ id, describedBy }">
              <textarea
                :id="id"
                :aria-describedby="describedBy"
                rows="3"
                v-model="editingBallotComment"
              />
            </Field>
          </div>

          <p v-if="editingBallotNoSpeakerScore" class="muted small">
            {{ $t('このラウンドはスピーカースコアを入力しません。') }}
          </p>

          <div v-if="editingSpeakerRowsFor(focusedEditItem).length === 0" class="muted small">
            {{ $t('編集対象のスピーカー行がありません。') }}
          </div>
          <table v-else class="speaker-table speaker-table-editable">
            <thead>
              <tr>
                <th>{{ $t('サイド') }}</th>
                <th>{{ $t('チーム') }}</th>
                <th>{{ $t('スピーカー') }}</th>
                <th>{{ $t('スコア') }}</th>
                <th>{{ $t('Matter') }}</th>
                <th>{{ $t('Manner') }}</th>
                <th>{{ $t('Best') }}</th>
                <th>{{ $t('POI') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in editingSpeakerRowsFor(focusedEditItem)" :key="row.key">
                <td>{{ row.side }}</td>
                <td>{{ row.teamName }}</td>
                <td>
                  <select v-model="row.entry.speakerId">
                    <option value="">{{ $t('スピーカーを選択してください') }}</option>
                    <option
                      v-for="option in speakerOptionsForEditor(row.teamSlot, row.index)"
                      :key="option.id"
                      :value="option.id"
                    >
                      {{ option.name }}
                    </option>
                  </select>
                </td>
                <td>
                  <input
                    v-if="!editingBallotNoSpeakerScore && editingBallotScoreMode === 'total'"
                    type="number"
                    step="0.1"
                    v-model="row.entry.score"
                  />
                  <span v-else>{{ row.score }}</span>
                </td>
                <td>
                  <input
                    v-if="!editingBallotNoSpeakerScore && editingBallotScoreMode === 'matter_manner'"
                    type="number"
                    step="0.1"
                    v-model="row.entry.matter"
                  />
                  <span v-else>{{ row.matter }}</span>
                </td>
                <td>
                  <input
                    v-if="!editingBallotNoSpeakerScore && editingBallotScoreMode === 'matter_manner'"
                    type="number"
                    step="0.1"
                    v-model="row.entry.manner"
                  />
                  <span v-else>{{ row.manner }}</span>
                </td>
                <td>
                  <input
                    v-if="!editingBallotNoSpeakerScore"
                    class="flag-input"
                    type="checkbox"
                    v-model="row.entry.best"
                  />
                  <span v-else>{{ row.best ? '✓' : '—' }}</span>
                </td>
                <td>
                  <input
                    v-if="!editingBallotNoSpeakerScore"
                    class="flag-input"
                    type="checkbox"
                    v-model="row.entry.poi"
                  />
                  <span v-else>{{ row.poi ? '✓' : '—' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="card soft stack feedback-card">
          <div class="grid feedback-meta-grid">
            <Field :label="$t('評価対象ジャッジ')" v-slot="{ id, describedBy }">
              <select :id="id" :aria-describedby="describedBy" v-model="editingFeedbackAdjudicatorId">
                <option value="">{{ $t('未選択') }}</option>
                <option
                  v-for="option in adjudicatorEntityOptions"
                  :key="`feedback-adj-${option.id}`"
                  :value="option.id"
                >
                  {{ option.name }}
                </option>
              </select>
            </Field>
            <Field :label="$t('スコア')" v-slot="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                type="number"
                step="0.1"
                min="0"
                v-model="editingFeedbackScore"
              />
            </Field>
            <Field :label="$t('Matter')" v-slot="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                type="number"
                step="0.1"
                v-model="editingFeedbackMatter"
              />
            </Field>
            <Field :label="$t('Manner')" v-slot="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                type="number"
                step="0.1"
                v-model="editingFeedbackManner"
              />
            </Field>
            <Field :label="$t('提出者')" v-slot="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                v-model="editingFeedbackSubmittedEntityId"
              >
                <option value="">{{ $t('未選択') }}</option>
                <optgroup :label="$t('ジャッジ')">
                  <option
                    v-for="option in adjudicatorEntityOptions"
                    :key="`feedback-sub-adj-${option.id}`"
                    :value="option.id"
                  >
                    {{ option.name }}
                  </option>
                </optgroup>
                <optgroup :label="$t('スピーカー')">
                  <option
                    v-for="option in speakerEntityOptions"
                    :key="`feedback-sub-spk-${option.id}`"
                    :value="option.id"
                  >
                    {{ option.name }}
                  </option>
                </optgroup>
                <optgroup :label="$t('チーム')">
                  <option
                    v-for="option in teamEntityOptions"
                    :key="`feedback-sub-team-${option.id}`"
                    :value="option.id"
                  >
                    {{ option.name }}
                  </option>
                </optgroup>
              </select>
            </Field>
            <Field :label="$t('コメント')" class="full" v-slot="{ id, describedBy }">
              <textarea
                :id="id"
                :aria-describedby="describedBy"
                rows="3"
                v-model="editingFeedbackComment"
              />
            </Field>
          </div>
        </div>
        <p v-if="editError" class="error">{{ editError }}</p>
        <div class="row ballot-action-row focus-edit-action-row">
          <Button
            variant="primary"
            size="sm"
            :loading="editingSaving"
            :disabled="editingSaving"
            @click="requestSaveEdit(focusedEditItem)"
          >
            {{ $t('更新を保存') }}
          </Button>
          <Button
            variant="danger"
            size="sm"
            :disabled="editingSaving"
            @click="requestDeleteSubmission(focusedEditItem)"
          >
            {{ $t('評価を削除') }}
          </Button>
        </div>
      </div>
      <div v-else-if="!hasAnyVisibleItems" class="muted">{{ $t('提出がありません。') }}</div>

      <div v-else-if="splitByEvaluation" class="stack split-section-list">
        <section
          v-for="group in splitTableGroups"
          :key="`split-table-${group.key}`"
          class="card soft stack split-section-card"
        >
          <div v-if="!focusEditOnly" class="row split-section-head">
            <strong class="split-section-title">{{ group.label }}</strong>
            <div class="stack split-search-field">
              <input
                v-model="splitSearchQueries[group.key]"
                :placeholder="$t('提出者名で検索')"
              />
            </div>
          </div>
          <div v-if="group.items.length === 0" class="muted small">{{ $t('提出がありません。') }}</div>
          <Table v-else hover striped sticky-header>
            <thead>
              <tr>
                <th>
                  <SortHeaderButton
                    compact
                    :label="$t('ラウンド')"
                    :indicator="splitSortIndicator(group.key, 'round')"
                    @click="setSplitSort(group.key, 'round')"
                  />
                </th>
                <th>
                  <SortHeaderButton
                    compact
                    :label="$t('提出者')"
                    :indicator="splitSortIndicator(group.key, 'submittedBy')"
                    @click="setSplitSort(group.key, 'submittedBy')"
                  />
                </th>
                <th>
                  <SortHeaderButton
                    compact
                    :label="$t('概要')"
                    :indicator="splitSortIndicator(group.key, 'summary')"
                    @click="setSplitSort(group.key, 'summary')"
                  />
                </th>
                <th>
                  <SortHeaderButton
                    compact
                    :label="$t('作成日時')"
                    :indicator="splitSortIndicator(group.key, 'createdAt')"
                    @click="setSplitSort(group.key, 'createdAt')"
                  />
                </th>
                <th>{{ $t('操作') }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="item in group.items" :key="item._id">
                <tr
                  class="submission-summary-row"
                  :class="{ 'is-expanded': isExpanded(item._id) }"
                >
                  <td>{{ item.round }}</td>
                  <td>{{ submittedByLabel(item) }}</td>
                  <td>{{ submissionSummary(item) }}</td>
                  <td>{{ formatDate(item.createdAt) }}</td>
                  <td>
                    <div class="row row-actions">
                      <Button variant="ghost" size="sm" @click="toggleExpand(item)">
                        {{ isExpanded(item._id) ? $t('詳細を隠す') : $t('詳細を表示') }}
                      </Button>
                    </div>
                  </td>
                </tr>
                <tr v-if="isExpanded(item._id)" class="submission-detail-row">
                  <td colspan="5">
                    <div class="stack">
                      <div v-if="item.type === 'ballot'" class="card soft stack ballot-card">
                        <div class="row ballot-card-header">
                          <strong>{{ matchupLabelForDisplay(item) }}</strong>
                        </div>

                        <div v-if="isEditing(item._id)" class="grid ballot-meta-grid">
                          <Field :label="$t('対戦チーム')" v-slot="{ id, describedBy }">
                            <input
                              :id="id"
                              :aria-describedby="describedBy"
                              :value="editingBallotTeamPairLabel"
                              readonly
                            />
                          </Field>
                          <Field :label="govLabel" v-slot="{ id, describedBy }">
                            <select :id="id" :aria-describedby="describedBy" v-model="editingBallotGovTeamId">
                              <option value="">{{ $t('未選択') }}</option>
                              <option
                                v-for="option in editingBallotSideTeamOptions"
                                :key="option.id"
                                :value="option.id"
                              >
                                {{ option.name }}
                              </option>
                            </select>
                          </Field>
                          <Field :label="oppLabel" v-slot="{ id, describedBy }">
                            <input
                              :id="id"
                              :aria-describedby="describedBy"
                              :value="teamName(editingBallotOppTeamId)"
                              readonly
                            />
                          </Field>
                          <Field :label="$t('勝者')" v-slot="{ id, describedBy }">
                            <select :id="id" :aria-describedby="describedBy" v-model="editingBallotWinnerId">
                              <option
                                v-for="option in editingBallotWinnerOptions"
                                :key="option.value"
                                :value="option.value"
                              >
                                {{ option.label }}
                              </option>
                            </select>
                          </Field>
                          <Field :label="$t('提出者')" v-slot="{ id, describedBy }">
                            <select :id="id" :aria-describedby="describedBy" v-model="editingBallotSubmittedEntityId">
                              <option value="">{{ $t('未選択') }}</option>
                              <optgroup :label="$t('ジャッジ')">
                                <option
                                  v-for="option in adjudicatorEntityOptions"
                                  :key="`adj-${option.id}`"
                                  :value="option.id"
                                >
                                  {{ option.name }}
                                </option>
                              </optgroup>
                            </select>
                          </Field>
                          <Field :label="$t('コメント')" class="full" v-slot="{ id, describedBy }">
                            <textarea
                              :id="id"
                              :aria-describedby="describedBy"
                              rows="3"
                              v-model="editingBallotComment"
                            />
                          </Field>
                        </div>

                        <p v-if="isEditing(item._id) && editingBallotNoSpeakerScore" class="muted small">
                          {{ $t('このラウンドはスピーカースコアを入力しません。') }}
                        </p>

                        <div v-if="!isEditing(item._id) && speakerRowsFor(item).length === 0" class="muted small">
                          {{ $t('スピーカーが登録されていません') }}
                        </div>
                        <table v-else-if="!isEditing(item._id)" class="speaker-table">
                          <thead>
                            <tr>
                              <th>{{ $t('サイド') }}</th>
                              <th>{{ $t('チーム') }}</th>
                              <th>{{ $t('スピーカー') }}</th>
                              <th>{{ $t('スコア') }}</th>
                              <th>{{ $t('Matter') }}</th>
                              <th>{{ $t('Manner') }}</th>
                              <th>{{ $t('Best') }}</th>
                              <th>{{ $t('POI') }}</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="row in speakerRowsFor(item)" :key="row.key">
                              <td>{{ row.side }}</td>
                              <td>{{ row.teamName }}</td>
                              <td>{{ row.speakerName }}</td>
                              <td>{{ row.score }}</td>
                              <td>{{ row.matter }}</td>
                              <td>{{ row.manner }}</td>
                              <td>{{ row.best ? '✓' : '—' }}</td>
                              <td>{{ row.poi ? '✓' : '—' }}</td>
                            </tr>
                          </tbody>
                        </table>

                        <div v-else-if="editingSpeakerRowsFor(item).length === 0" class="muted small">
                          {{ $t('編集対象のスピーカー行がありません。') }}
                        </div>
                        <table v-else class="speaker-table speaker-table-editable">
                          <thead>
                            <tr>
                              <th>{{ $t('サイド') }}</th>
                              <th>{{ $t('チーム') }}</th>
                              <th>{{ $t('スピーカー') }}</th>
                              <th>{{ $t('スコア') }}</th>
                              <th>{{ $t('Matter') }}</th>
                              <th>{{ $t('Manner') }}</th>
                              <th>{{ $t('Best') }}</th>
                              <th>{{ $t('POI') }}</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="row in editingSpeakerRowsFor(item)" :key="row.key">
                              <td>{{ row.side }}</td>
                              <td>{{ row.teamName }}</td>
                              <td>
                                <select v-model="row.entry.speakerId">
                                  <option value="">{{ $t('スピーカーを選択してください') }}</option>
                                  <option
                                    v-for="option in speakerOptionsForEditor(row.teamSlot, row.index)"
                                    :key="option.id"
                                    :value="option.id"
                                  >
                                    {{ option.name }}
                                  </option>
                                </select>
                              </td>
                              <td>
                                <input
                                  v-if="!editingBallotNoSpeakerScore && editingBallotScoreMode === 'total'"
                                  type="number"
                                  step="0.1"
                                  v-model="row.entry.score"
                                />
                                <span v-else>{{ row.score }}</span>
                              </td>
                              <td>
                                <input
                                  v-if="!editingBallotNoSpeakerScore && editingBallotScoreMode === 'matter_manner'"
                                  type="number"
                                  step="0.1"
                                  v-model="row.entry.matter"
                                />
                                <span v-else>{{ row.matter }}</span>
                              </td>
                              <td>
                                <input
                                  v-if="!editingBallotNoSpeakerScore && editingBallotScoreMode === 'matter_manner'"
                                  type="number"
                                  step="0.1"
                                  v-model="row.entry.manner"
                                />
                                <span v-else>{{ row.manner }}</span>
                              </td>
                              <td>
                                <input
                                  v-if="!editingBallotNoSpeakerScore"
                                  class="flag-input"
                                  type="checkbox"
                                  v-model="row.entry.best"
                                />
                                <span v-else>{{ row.best ? '✓' : '—' }}</span>
                              </td>
                              <td>
                                <input
                                  v-if="!editingBallotNoSpeakerScore"
                                  class="flag-input"
                                  type="checkbox"
                                  v-model="row.entry.poi"
                                />
                                <span v-else>{{ row.poi ? '✓' : '—' }}</span>
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <p v-if="isEditing(item._id) && editError" class="error">{{ editError }}</p>
                        <div v-if="isEditing(item._id)" class="row ballot-action-row">
                          <Button
                            variant="primary"
                            size="sm"
                            :loading="editingSaving"
                            :disabled="editingSaving"
                            @click="requestSaveEdit(item)"
                          >
                            {{ $t('更新を保存') }}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            :disabled="editingSaving"
                            @click="requestDeleteSubmission(item)"
                          >
                            {{ $t('評価を削除') }}
                          </Button>
                        </div>
                      </div>
                      <div v-else class="card soft stack feedback-card">
                        <div class="row ballot-card-header">
                          <strong>{{ feedbackSummaryForDisplay(item) }}</strong>
                        </div>

                        <div v-if="isEditing(item._id)" class="grid feedback-meta-grid">
                          <Field :label="$t('評価対象ジャッジ')" v-slot="{ id, describedBy }">
                            <select :id="id" :aria-describedby="describedBy" v-model="editingFeedbackAdjudicatorId">
                              <option value="">{{ $t('未選択') }}</option>
                              <option
                                v-for="option in adjudicatorEntityOptions"
                                :key="`feedback-adj-${option.id}`"
                                :value="option.id"
                              >
                                {{ option.name }}
                              </option>
                            </select>
                          </Field>
                          <Field :label="$t('スコア')" v-slot="{ id, describedBy }">
                            <input
                              :id="id"
                              :aria-describedby="describedBy"
                              type="number"
                              step="0.1"
                              min="0"
                              v-model="editingFeedbackScore"
                            />
                          </Field>
                          <Field :label="$t('Matter')" v-slot="{ id, describedBy }">
                            <input
                              :id="id"
                              :aria-describedby="describedBy"
                              type="number"
                              step="0.1"
                              v-model="editingFeedbackMatter"
                            />
                          </Field>
                          <Field :label="$t('Manner')" v-slot="{ id, describedBy }">
                            <input
                              :id="id"
                              :aria-describedby="describedBy"
                              type="number"
                              step="0.1"
                              v-model="editingFeedbackManner"
                            />
                          </Field>
                          <Field :label="$t('提出者')" v-slot="{ id, describedBy }">
                            <select
                              :id="id"
                              :aria-describedby="describedBy"
                              v-model="editingFeedbackSubmittedEntityId"
                            >
                              <option value="">{{ $t('未選択') }}</option>
                              <optgroup :label="$t('ジャッジ')">
                                <option
                                  v-for="option in adjudicatorEntityOptions"
                                  :key="`feedback-sub-adj-${option.id}`"
                                  :value="option.id"
                                >
                                  {{ option.name }}
                                </option>
                              </optgroup>
                              <optgroup :label="$t('スピーカー')">
                                <option
                                  v-for="option in speakerEntityOptions"
                                  :key="`feedback-sub-spk-${option.id}`"
                                  :value="option.id"
                                >
                                  {{ option.name }}
                                </option>
                              </optgroup>
                              <optgroup :label="$t('チーム')">
                                <option
                                  v-for="option in teamEntityOptions"
                                  :key="`feedback-sub-team-${option.id}`"
                                  :value="option.id"
                                >
                                  {{ option.name }}
                                </option>
                              </optgroup>
                            </select>
                          </Field>
                          <Field :label="$t('コメント')" class="full" v-slot="{ id, describedBy }">
                            <textarea
                              :id="id"
                              :aria-describedby="describedBy"
                              rows="3"
                              v-model="editingFeedbackComment"
                            />
                          </Field>
                        </div>

                        <div v-else class="grid feedback-read-grid">
                          <div class="stack feedback-read-item">
                            <span class="muted small">{{ $t('評価対象ジャッジ') }}</span>
                            <strong>{{ adjudicatorName(String((item.payload as any)?.adjudicatorId ?? '')) }}</strong>
                          </div>
                          <div class="stack feedback-read-item">
                            <span class="muted small">{{ $t('スコア') }}</span>
                            <strong>{{ feedbackScoreText((item.payload ?? {}) as Record<string, unknown>) }}</strong>
                          </div>
                          <div class="stack feedback-read-item">
                            <span class="muted small">{{ $t('Matter') }}</span>
                            <strong>{{ feedbackMatterText((item.payload ?? {}) as Record<string, unknown>) }}</strong>
                          </div>
                          <div class="stack feedback-read-item">
                            <span class="muted small">{{ $t('Manner') }}</span>
                            <strong>{{ feedbackMannerText((item.payload ?? {}) as Record<string, unknown>) }}</strong>
                          </div>
                          <div class="stack feedback-read-item">
                            <span class="muted small">{{ $t('提出者') }}</span>
                            <strong>{{ submittedByLabel(item) }}</strong>
                          </div>
                          <div class="stack feedback-read-item full">
                            <span class="muted small">{{ $t('コメント') }}</span>
                            <span>{{ String((item.payload as any)?.comment ?? '—') }}</span>
                          </div>
                        </div>

                        <p v-if="isEditing(item._id) && editError" class="error">{{ editError }}</p>
                        <div v-if="isEditing(item._id)" class="row ballot-action-row">
                          <Button
                            variant="primary"
                            size="sm"
                            :loading="editingSaving"
                            :disabled="editingSaving"
                            @click="requestSaveEdit(item)"
                          >
                            {{ $t('更新を保存') }}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            :disabled="editingSaving"
                            @click="requestDeleteSubmission(item)"
                          >
                            {{ $t('評価を削除') }}
                          </Button>
                        </div>
                      </div>

                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </Table>
        </section>
      </div>

      <Table
        v-else-if="items.length > 0"
        hover
        striped
        sticky-header
      >
        <thead>
          <tr>
            <th>{{ $t('種類') }}</th>
            <th>{{ $t('ラウンド') }}</th>
            <th>{{ $t('提出者') }}</th>
            <th>{{ $t('概要') }}</th>
            <th>{{ $t('作成日時') }}</th>
            <th>{{ $t('操作') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="item in items" :key="item._id">
            <tr
              class="submission-summary-row"
              :class="{ 'is-expanded': isExpanded(item._id) }"
            >
              <td>{{ typeLabel(item.type) }}</td>
              <td>{{ item.round }}</td>
              <td>{{ submittedByLabel(item) }}</td>
              <td>{{ submissionSummary(item) }}</td>
              <td>{{ formatDate(item.createdAt) }}</td>
              <td>
                <div class="row row-actions">
                  <Button variant="ghost" size="sm" @click="toggleExpand(item)">
                    {{ isExpanded(item._id) ? $t('詳細を隠す') : $t('詳細を表示') }}
                  </Button>
                </div>
              </td>
            </tr>
            <tr v-if="isExpanded(item._id)" class="submission-detail-row">
              <td colspan="6">
                <div class="stack">
                  <div v-if="item.type === 'ballot'" class="card soft stack ballot-card">
                    <div class="row ballot-card-header">
                      <strong>{{ matchupLabelForDisplay(item) }}</strong>
                    </div>

                    <div v-if="isEditing(item._id)" class="grid ballot-meta-grid">
                      <Field :label="$t('対戦チーム')" v-slot="{ id, describedBy }">
                        <input
                          :id="id"
                          :aria-describedby="describedBy"
                          :value="editingBallotTeamPairLabel"
                          readonly
                        />
                      </Field>
                      <Field :label="govLabel" v-slot="{ id, describedBy }">
                        <select :id="id" :aria-describedby="describedBy" v-model="editingBallotGovTeamId">
                          <option value="">{{ $t('未選択') }}</option>
                          <option
                            v-for="option in editingBallotSideTeamOptions"
                            :key="option.id"
                            :value="option.id"
                          >
                            {{ option.name }}
                          </option>
                        </select>
                      </Field>
                      <Field :label="oppLabel" v-slot="{ id, describedBy }">
                        <input
                          :id="id"
                          :aria-describedby="describedBy"
                          :value="teamName(editingBallotOppTeamId)"
                          readonly
                        />
                      </Field>
                      <Field :label="$t('勝者')" v-slot="{ id, describedBy }">
                        <select :id="id" :aria-describedby="describedBy" v-model="editingBallotWinnerId">
                          <option
                            v-for="option in editingBallotWinnerOptions"
                            :key="option.value"
                            :value="option.value"
                          >
                            {{ option.label }}
                          </option>
                        </select>
                      </Field>
                      <Field :label="$t('提出者')" v-slot="{ id, describedBy }">
                        <select :id="id" :aria-describedby="describedBy" v-model="editingBallotSubmittedEntityId">
                          <option value="">{{ $t('未選択') }}</option>
                          <optgroup :label="$t('ジャッジ')">
                            <option
                              v-for="option in adjudicatorEntityOptions"
                              :key="`adj-${option.id}`"
                              :value="option.id"
                            >
                              {{ option.name }}
                            </option>
                          </optgroup>
                        </select>
                      </Field>
                      <Field :label="$t('コメント')" class="full" v-slot="{ id, describedBy }">
                        <textarea
                          :id="id"
                          :aria-describedby="describedBy"
                          rows="3"
                          v-model="editingBallotComment"
                        />
                      </Field>
                    </div>

                    <p v-if="isEditing(item._id) && editingBallotNoSpeakerScore" class="muted small">
                      {{ $t('このラウンドはスピーカースコアを入力しません。') }}
                    </p>

                    <div v-if="!isEditing(item._id) && speakerRowsFor(item).length === 0" class="muted small">
                      {{ $t('スピーカーが登録されていません') }}
                    </div>
                    <table v-else-if="!isEditing(item._id)" class="speaker-table">
                      <thead>
                        <tr>
                          <th>{{ $t('サイド') }}</th>
                          <th>{{ $t('チーム') }}</th>
                          <th>{{ $t('スピーカー') }}</th>
                          <th>{{ $t('スコア') }}</th>
                          <th>{{ $t('Matter') }}</th>
                          <th>{{ $t('Manner') }}</th>
                          <th>{{ $t('Best') }}</th>
                          <th>{{ $t('POI') }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in speakerRowsFor(item)" :key="row.key">
                          <td>{{ row.side }}</td>
                          <td>{{ row.teamName }}</td>
                          <td>{{ row.speakerName }}</td>
                          <td>{{ row.score }}</td>
                          <td>{{ row.matter }}</td>
                          <td>{{ row.manner }}</td>
                          <td>{{ row.best ? '✓' : '—' }}</td>
                          <td>{{ row.poi ? '✓' : '—' }}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div v-else-if="editingSpeakerRowsFor(item).length === 0" class="muted small">
                      {{ $t('編集対象のスピーカー行がありません。') }}
                    </div>
                    <table v-else class="speaker-table speaker-table-editable">
                      <thead>
                        <tr>
                          <th>{{ $t('サイド') }}</th>
                          <th>{{ $t('チーム') }}</th>
                          <th>{{ $t('スピーカー') }}</th>
                          <th>{{ $t('スコア') }}</th>
                          <th>{{ $t('Matter') }}</th>
                          <th>{{ $t('Manner') }}</th>
                          <th>{{ $t('Best') }}</th>
                          <th>{{ $t('POI') }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in editingSpeakerRowsFor(item)" :key="row.key">
                          <td>{{ row.side }}</td>
                          <td>{{ row.teamName }}</td>
                          <td>
                            <select v-model="row.entry.speakerId">
                              <option value="">{{ $t('スピーカーを選択してください') }}</option>
                              <option
                                v-for="option in speakerOptionsForEditor(row.teamSlot, row.index)"
                                :key="option.id"
                                :value="option.id"
                              >
                                {{ option.name }}
                              </option>
                            </select>
                          </td>
                          <td>
                            <input
                              v-if="!editingBallotNoSpeakerScore && editingBallotScoreMode === 'total'"
                              type="number"
                              step="0.1"
                              v-model="row.entry.score"
                            />
                            <span v-else>{{ row.score }}</span>
                          </td>
                          <td>
                            <input
                              v-if="!editingBallotNoSpeakerScore && editingBallotScoreMode === 'matter_manner'"
                              type="number"
                              step="0.1"
                              v-model="row.entry.matter"
                            />
                            <span v-else>{{ row.matter }}</span>
                          </td>
                          <td>
                            <input
                              v-if="!editingBallotNoSpeakerScore && editingBallotScoreMode === 'matter_manner'"
                              type="number"
                              step="0.1"
                              v-model="row.entry.manner"
                            />
                            <span v-else>{{ row.manner }}</span>
                          </td>
                          <td>
                            <input
                              v-if="!editingBallotNoSpeakerScore"
                              class="flag-input"
                              type="checkbox"
                              v-model="row.entry.best"
                            />
                            <span v-else>{{ row.best ? '✓' : '—' }}</span>
                          </td>
                          <td>
                            <input
                              v-if="!editingBallotNoSpeakerScore"
                              class="flag-input"
                              type="checkbox"
                              v-model="row.entry.poi"
                            />
                            <span v-else>{{ row.poi ? '✓' : '—' }}</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <p v-if="isEditing(item._id) && editError" class="error">{{ editError }}</p>
                    <div v-if="isEditing(item._id)" class="row ballot-action-row">
                      <Button
                        variant="primary"
                        size="sm"
                        :loading="editingSaving"
                        :disabled="editingSaving"
                        @click="requestSaveEdit(item)"
                      >
                        {{ $t('更新を保存') }}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        :disabled="editingSaving"
                        @click="requestDeleteSubmission(item)"
                      >
                        {{ $t('評価を削除') }}
                      </Button>
                    </div>
                  </div>
                  <div v-else class="card soft stack feedback-card">
                    <div class="row ballot-card-header">
                      <strong>{{ feedbackSummaryForDisplay(item) }}</strong>
                    </div>

                    <div v-if="isEditing(item._id)" class="grid feedback-meta-grid">
                      <Field :label="$t('評価対象ジャッジ')" v-slot="{ id, describedBy }">
                        <select :id="id" :aria-describedby="describedBy" v-model="editingFeedbackAdjudicatorId">
                          <option value="">{{ $t('未選択') }}</option>
                          <option
                            v-for="option in adjudicatorEntityOptions"
                            :key="`feedback-adj-${option.id}`"
                            :value="option.id"
                          >
                            {{ option.name }}
                          </option>
                        </select>
                      </Field>
                      <Field :label="$t('スコア')" v-slot="{ id, describedBy }">
                        <input
                          :id="id"
                          :aria-describedby="describedBy"
                          type="number"
                          step="0.1"
                          min="0"
                          v-model="editingFeedbackScore"
                        />
                      </Field>
                      <Field :label="$t('Matter')" v-slot="{ id, describedBy }">
                        <input
                          :id="id"
                          :aria-describedby="describedBy"
                          type="number"
                          step="0.1"
                          v-model="editingFeedbackMatter"
                        />
                      </Field>
                      <Field :label="$t('Manner')" v-slot="{ id, describedBy }">
                        <input
                          :id="id"
                          :aria-describedby="describedBy"
                          type="number"
                          step="0.1"
                          v-model="editingFeedbackManner"
                        />
                      </Field>
                      <Field :label="$t('提出者')" v-slot="{ id, describedBy }">
                        <select
                          :id="id"
                          :aria-describedby="describedBy"
                          v-model="editingFeedbackSubmittedEntityId"
                        >
                          <option value="">{{ $t('未選択') }}</option>
                          <optgroup :label="$t('ジャッジ')">
                            <option
                              v-for="option in adjudicatorEntityOptions"
                              :key="`feedback-sub-adj-${option.id}`"
                              :value="option.id"
                            >
                              {{ option.name }}
                            </option>
                          </optgroup>
                          <optgroup :label="$t('スピーカー')">
                            <option
                              v-for="option in speakerEntityOptions"
                              :key="`feedback-sub-spk-${option.id}`"
                              :value="option.id"
                            >
                              {{ option.name }}
                            </option>
                          </optgroup>
                          <optgroup :label="$t('チーム')">
                            <option
                              v-for="option in teamEntityOptions"
                              :key="`feedback-sub-team-${option.id}`"
                              :value="option.id"
                            >
                              {{ option.name }}
                            </option>
                          </optgroup>
                        </select>
                      </Field>
                      <Field :label="$t('コメント')" class="full" v-slot="{ id, describedBy }">
                        <textarea
                          :id="id"
                          :aria-describedby="describedBy"
                          rows="3"
                          v-model="editingFeedbackComment"
                        />
                      </Field>
                    </div>

                    <div v-else class="grid feedback-read-grid">
                      <div class="stack feedback-read-item">
                        <span class="muted small">{{ $t('評価対象ジャッジ') }}</span>
                        <strong>{{ adjudicatorName(String((item.payload as any)?.adjudicatorId ?? '')) }}</strong>
                      </div>
                      <div class="stack feedback-read-item">
                        <span class="muted small">{{ $t('スコア') }}</span>
                        <strong>{{ feedbackScoreText((item.payload ?? {}) as Record<string, unknown>) }}</strong>
                      </div>
                      <div class="stack feedback-read-item">
                        <span class="muted small">{{ $t('Matter') }}</span>
                        <strong>{{ feedbackMatterText((item.payload ?? {}) as Record<string, unknown>) }}</strong>
                      </div>
                      <div class="stack feedback-read-item">
                        <span class="muted small">{{ $t('Manner') }}</span>
                        <strong>{{ feedbackMannerText((item.payload ?? {}) as Record<string, unknown>) }}</strong>
                      </div>
                      <div class="stack feedback-read-item">
                        <span class="muted small">{{ $t('提出者') }}</span>
                        <strong>{{ submittedByLabel(item) }}</strong>
                      </div>
                      <div class="stack feedback-read-item full">
                        <span class="muted small">{{ $t('コメント') }}</span>
                        <span>{{ String((item.payload as any)?.comment ?? '—') }}</span>
                      </div>
                    </div>

                    <p v-if="isEditing(item._id) && editError" class="error">{{ editError }}</p>
                    <div v-if="isEditing(item._id)" class="row ballot-action-row">
                      <Button
                        variant="primary"
                        size="sm"
                        :loading="editingSaving"
                        :disabled="editingSaving"
                        @click="requestSaveEdit(item)"
                      >
                        {{ $t('更新を保存') }}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        :disabled="editingSaving"
                        @click="requestDeleteSubmission(item)"
                      >
                        {{ $t('評価を削除') }}
                      </Button>
                    </div>
                  </div>

                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </Table>
    </template>

    <div
      v-if="actionConfirm"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeActionConfirm"
    >
      <div class="modal card stack submission-confirm-modal" role="dialog" aria-modal="true">
        <h4>{{ actionConfirm.title }}</h4>
        <p class="muted">{{ actionConfirm.message }}</p>
        <p v-if="actionConfirm.summary" class="muted small">{{ actionConfirm.summary }}</p>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" :disabled="editingSaving" @click="closeActionConfirm">
            {{ $t('キャンセル') }}
          </Button>
          <Button
            :variant="actionConfirm.action === 'delete' ? 'danger' : 'primary'"
            size="sm"
            :loading="editingSaving"
            :disabled="editingSaving"
            @click="executeConfirmedAction"
          >
            {{ actionConfirm.confirmLabel }}
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSubmissionsStore } from '@/stores/submissions'
import { useDrawsStore } from '@/stores/draws'
import { useTeamsStore } from '@/stores/teams'
import { useSpeakersStore } from '@/stores/speakers'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { useTournamentStore } from '@/stores/tournament'
import { useStylesStore } from '@/stores/styles'
import { useRoundsStore } from '@/stores/rounds'
import type { Submission } from '@/types/submission'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import Table from '@/components/common/Table.vue'
import SortHeaderButton from '@/components/common/SortHeaderButton.vue'
import { getSideShortLabel } from '@/utils/side-labels'
import { toBooleanArray, toStringArray } from '@/utils/array-coercion'

const route = useRoute()
const submissions = useSubmissionsStore()
const draws = useDrawsStore()
const teams = useTeamsStore()
const speakers = useSpeakersStore()
const adjudicators = useAdjudicatorsStore()
const tournamentStore = useTournamentStore()
const stylesStore = useStylesStore()
const rounds = useRoundsStore()
const { t } = useI18n({ useScope: 'global' })
const props = withDefaults(
  defineProps<{
    embedded?: boolean
    embeddedRound?: number | null
    hideSummaryCards?: boolean
    splitByEvaluation?: boolean
    splitActiveKey?: 'team' | 'judge' | null
    focusSubmissionId?: string | null
    autoOpenFocusSubmission?: boolean
    autoEditFocusSubmission?: boolean
    focusEditOnly?: boolean
  }>(),
  {
    embedded: false,
    embeddedRound: null,
    hideSummaryCards: false,
    splitByEvaluation: false,
    splitActiveKey: null,
    focusSubmissionId: null,
    autoOpenFocusSubmission: false,
    autoEditFocusSubmission: false,
    focusEditOnly: false,
  }
)

function normalizeRoundValue(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null
}

const tournamentId = computed(() => route.params.tournamentId as string)
const isEmbeddedRoute = computed(
  () => props.embedded || route.path.startsWith('/admin-embed/') || String(route.query.embed ?? '') === '1'
)
const contextRound = computed<number | null>(() => {
  const fromProp = normalizeRoundValue(props.embeddedRound)
  if (fromProp !== null) return fromProp
  if (String(route.query.context ?? '') !== 'round') return null
  return normalizeRoundValue(route.query.round)
})
const isRoundContext = computed(() => contextRound.value !== null)
const hideSummaryCards = computed(() => props.hideSummaryCards)
const splitByEvaluation = computed(() => props.splitByEvaluation)
const splitActiveKey = computed(() => props.splitActiveKey)
const focusedSubmissionId = computed(() => String(props.focusSubmissionId ?? '').trim())
const focusEditOnly = computed(() => props.focusEditOnly)
const typeFilter = ref<'all' | 'ballot' | 'feedback'>('all')
const roundFilter = ref('')
const searchQuery = ref('')
type SplitTableKey = 'team' | 'judge'
type SubmissionSortKey = 'round' | 'submittedBy' | 'summary' | 'createdAt'
const splitSearchQueries = reactive<Record<SplitTableKey, string>>({
  team: '',
  judge: '',
})
const splitSortStates = reactive<
  Record<SplitTableKey, { key: SubmissionSortKey; direction: 'asc' | 'desc' }>
>({
  team: { key: 'createdAt', direction: 'desc' },
  judge: { key: 'createdAt', direction: 'desc' },
})
const DRAW_WINNER_OPTION_VALUE = '__draw__'
const sectionLoading = ref(true)
const expandedIds = ref<Set<string>>(new Set())
const editingSubmissionId = ref<string | null>(null)
const editingRound = ref(1)
const editingPayloadText = ref('')
const editingSaving = ref(false)
const editError = ref('')
const editingBallotBasePayload = ref<Record<string, unknown>>({})
const editingBallotTeamAId = ref('')
const editingBallotTeamBId = ref('')
const editingBallotGovTeamId = ref('')
const editingBallotWinnerId = ref('')
const editingBallotSubmittedEntityId = ref('')
const editingBallotComment = ref('')
const editingBallotNoSpeakerScore = ref(false)
const editingBallotScoreMode = ref<'matter_manner' | 'total'>('matter_manner')
const editingBallotRowsA = ref<EditableBallotRow[]>([])
const editingBallotRowsB = ref<EditableBallotRow[]>([])
const editingFeedbackBasePayload = ref<Record<string, unknown>>({})
const editingFeedbackAdjudicatorId = ref('')
const editingFeedbackSubmittedEntityId = ref('')
const editingFeedbackScore = ref('')
const editingFeedbackMatter = ref('')
const editingFeedbackManner = ref('')
const editingFeedbackComment = ref('')
const editingFeedbackRole = ref('')
type SubmissionAction = 'save' | 'delete'
type SubmissionActionConfirm = {
  action: SubmissionAction
  submissionId: string
  title: string
  message: string
  summary?: string
  confirmLabel: string
}
const actionConfirm = ref<SubmissionActionConfirm | null>(null)
const naturalSortCollator = new Intl.Collator(['ja', 'en'], {
  numeric: true,
  sensitivity: 'base',
})

const isLoading = computed(
  () =>
    submissions.loading ||
    draws.loading ||
    teams.loading ||
    speakers.loading ||
    adjudicators.loading ||
    rounds.loading ||
    tournamentStore.loading ||
    stylesStore.loading
)
const loadError = computed(
  () =>
    submissions.error ||
    draws.error ||
    teams.error ||
    speakers.error ||
    adjudicators.error ||
    rounds.error ||
    tournamentStore.error ||
    stylesStore.error ||
    null
)
const sortedRounds = computed(() => rounds.rounds.slice().sort((a, b) => a.round - b.round))

const tournament = computed(() =>
  tournamentStore.tournaments.find((item) => item._id === tournamentId.value)
)
const style = computed(() => stylesStore.styles.find((item) => item.id === tournament.value?.style))
const govLabel = computed(() => getSideShortLabel(style.value, 'gov', t('政府')))
const oppLabel = computed(() => getSideShortLabel(style.value, 'opp', t('反対')))
const contextRoundLabel = computed(() => {
  if (contextRound.value === null) return ''
  const name =
    rounds.rounds.find((item) => Number(item.round) === contextRound.value)?.name ??
    t('ラウンド {round}', { round: contextRound.value })
  return t('{name} の提出データ', { name })
})
const contextRoundPath = computed(() => {
  if (contextRound.value === null) return `/admin/${tournamentId.value}/operations`
  return `/admin/${tournamentId.value}/rounds/${contextRound.value}/allocation`
})

const teamOptions = computed(() => {
  return teams.teams
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
    .map((team) => ({ id: team._id, name: team.name }))
})

const adjudicatorEntityOptions = computed(() => {
  return adjudicators.adjudicators
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
    .map((item) => ({ id: item._id, name: item.name }))
})

const speakerEntityOptions = computed(() => {
  return speakers.speakers
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
    .map((item) => ({ id: item._id, name: item.name }))
})

const teamEntityOptions = computed(() => {
  return teamOptions.value.slice()
})

const editingBallotSideTeamOptions = computed(() => {
  const options: Array<{ id: string; name: string }> = []
  const seen = new Set<string>()
  const teamIds = [editingBallotTeamAId.value.trim(), editingBallotTeamBId.value.trim()]
  teamIds.forEach((teamId) => {
    if (!teamId || seen.has(teamId)) return
    seen.add(teamId)
    options.push({ id: teamId, name: teamName(teamId) })
  })
  return options
})

const editingBallotOppTeamId = computed(() => {
  const teamAId = editingBallotTeamAId.value.trim()
  const teamBId = editingBallotTeamBId.value.trim()
  const govTeamId = editingBallotGovTeamId.value.trim()
  if (govTeamId === teamAId) return teamBId
  if (govTeamId === teamBId) return teamAId
  return ''
})

const editingBallotAllowDraw = computed(() =>
  roundScoreSettings(editingRound.value).allowLowTieWin
)
const editingBallotWinnerOptions = computed<Array<{ value: string; label: string }>>(() => {
  const options: Array<{ value: string; label: string }> = []
  const teamAId = editingBallotTeamAId.value.trim()
  const teamBId = editingBallotTeamBId.value.trim()

  if (teamAId) options.push({ value: teamAId, label: teamName(teamAId) })
  if (teamBId && teamBId !== teamAId) options.push({ value: teamBId, label: teamName(teamBId) })
  if (editingBallotAllowDraw.value && teamAId && teamBId) {
    options.push({ value: DRAW_WINNER_OPTION_VALUE, label: t('引き分け') })
  }
  return options
})

const editingBallotTeamPairLabel = computed(() => {
  const names = editingBallotSideTeamOptions.value.map((option) => option.name)
  if (names.length === 0) return t('未選択')
  return names.join(' / ')
})

const roundScopedItems = computed(() => {
  const fixedRound = contextRound.value
  const focusId = focusedSubmissionId.value
  const round = Number(roundFilter.value)
  const hasRoundFilter = fixedRound === null && roundFilter.value !== '' && Number.isFinite(round)
  const filtered = submissions.submissions.filter((item) => {
    const matchesRound =
      fixedRound !== null
        ? Number(item.round) === fixedRound
        : hasRoundFilter
          ? Number(item.round) === round
          : true
    if (!matchesRound) return false
    if (!focusId) return true
    return String(item._id ?? '') === focusId
  })
  return filtered.slice().sort((a, b) => {
    const roundDiff = Number(a.round) - Number(b.round)
    if (roundDiff !== 0) return roundDiff
    const nameA = submittedBySearchText(a)
    const nameB = submittedBySearchText(b)
    const nameCompare = naturalSortCollator.compare(nameA, nameB)
    if (nameCompare !== 0) return nameCompare
    return naturalSortCollator.compare(String(a._id ?? ''), String(b._id ?? ''))
  })
})

function evaluationKeyForSubmission(item: Submission): SplitTableKey {
  if (item.type === 'feedback') return 'judge'
  return 'team'
}

const items = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return roundScopedItems.value.filter((item) => {
    const matchesType = typeFilter.value === 'all' ? true : item.type === typeFilter.value
    const submittedByText = submittedBySearchText(item).toLowerCase()
    const matchesSearch = q ? submittedByText.includes(q) : true
    return matchesType && matchesSearch
  })
})

const ballotCount = computed(() => items.value.filter((item) => item.type === 'ballot').length)
const feedbackCount = computed(() => items.value.filter((item) => item.type === 'feedback').length)
const focusedEditItem = computed<Submission | null>(() => {
  if (!focusEditOnly.value) return null
  const focusId = focusedSubmissionId.value
  if (focusId) {
    return roundScopedItems.value.find((item) => String(item._id ?? '') === focusId) ?? null
  }
  return roundScopedItems.value[0] ?? null
})
const hasAnyVisibleItems = computed(() => {
  if (focusEditOnly.value) return focusedEditItem.value !== null
  if (!splitByEvaluation.value) return items.value.length > 0
  return splitTableGroups.value.some((group) => group.items.length > 0)
})

function splitSortValue(item: Submission, key: SubmissionSortKey): number | string {
  if (key === 'round') return Number(item.round)
  if (key === 'submittedBy') return submittedBySearchText(item)
  if (key === 'summary') return submissionSummary(item)
  if (key === 'createdAt') {
    const parsed = Date.parse(String(item.createdAt ?? ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return ''
}

function setSplitSort(tableKey: SplitTableKey, key: SubmissionSortKey) {
  const current = splitSortStates[tableKey]
  if (current.key === key) {
    current.direction = current.direction === 'asc' ? 'desc' : 'asc'
    return
  }
  current.key = key
  current.direction = key === 'createdAt' ? 'desc' : 'asc'
}

function splitSortIndicator(tableKey: SplitTableKey, key: SubmissionSortKey) {
  const current = splitSortStates[tableKey]
  if (current.key !== key) return '↕'
  return current.direction === 'asc' ? '↑' : '↓'
}

function sortedSplitItems(tableKey: SplitTableKey, rows: Submission[]) {
  const current = splitSortStates[tableKey]
  const direction = current.direction === 'asc' ? 1 : -1
  return rows
    .slice()
    .sort((left, right) => {
      const leftValue = splitSortValue(left, current.key)
      const rightValue = splitSortValue(right, current.key)
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        const diff = leftValue - rightValue
        if (diff !== 0) return direction * diff
      } else {
        const diff = naturalSortCollator.compare(String(leftValue), String(rightValue))
        if (diff !== 0) return direction * diff
      }
      return naturalSortCollator.compare(String(left._id ?? ''), String(right._id ?? ''))
    })
}

const splitTableGroups = computed<Array<{ key: SplitTableKey; label: string; items: Submission[] }>>(() => {
  const sources: Array<{ key: SplitTableKey; label: string }> = [
    { key: 'team', label: t('チーム評価') },
    { key: 'judge', label: t('ジャッジ評価') },
  ]
  const visibleSources =
    splitByEvaluation.value && splitActiveKey.value
      ? sources.filter((source) => source.key === splitActiveKey.value)
      : sources
  return visibleSources.map((source) => {
    const query = splitSearchQueries[source.key].trim().toLowerCase()
    const filtered = roundScopedItems.value.filter((item) => {
      if (evaluationKeyForSubmission(item) !== source.key) return false
      if (!query) return true
      const searchable = `${submittedBySearchText(item)} ${submissionSummary(item)}`.toLowerCase()
      return searchable.includes(query)
    })
    return {
      ...source,
      items: sortedSplitItems(source.key, filtered),
    }
  })
})

const drawByRound = computed(() => {
  const map = new Map<number, any>()
  draws.draws.forEach((draw) => {
    map.set(Number(draw.round), draw)
  })
  return map
})

type BallotPayload = {
  teamAId?: string
  teamBId?: string
  winnerId?: string
  draw?: boolean
  speakerIdsA?: unknown
  speakerIdsB?: unknown
  scoresA?: unknown
  scoresB?: unknown
  matterA?: unknown
  mannerA?: unknown
  matterB?: unknown
  mannerB?: unknown
  bestA?: unknown
  bestB?: unknown
  poiA?: unknown
  poiB?: unknown
  submittedEntityId?: string
  comment?: string
}

type SpeakerRow = {
  key: string
  side: string
  teamName: string
  speakerName: string
  score: string
  matter: string
  manner: string
  best: boolean
  poi: boolean
}

type EditableBallotRow = {
  speakerId: string
  score: string
  matter: string
  manner: string
  best: boolean
  poi: boolean
}

type EditableSpeakerRowView = {
  key: string
  side: string
  teamName: string
  teamSlot: 'A' | 'B'
  index: number
  score: string
  matter: string
  manner: string
  best: boolean
  poi: boolean
  entry: EditableBallotRow
}

type SpeakerOption = {
  id: string
  name: string
}

type NumberParseResult = { ok: true; value: number } | { ok: false; message: string }

type SideMapping = {
  govTeamId: string
  oppTeamId: string
  govSlot: 'A' | 'B'
  oppSlot: 'A' | 'B'
}

function toNumberArray(value: unknown): Array<number | undefined> {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const parsed = Number(item)
    return Number.isFinite(parsed) ? parsed : undefined
  })
}

function toFiniteNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—'
  return String(Math.round(value * 1000) / 1000)
}

function formatNumberForInput(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return ''
  return String(Math.round(value * 1000) / 1000)
}

function parseRequiredNumber(value: string, label: string): NumberParseResult {
  const token = value.trim()
  if (!token) {
    return { ok: false, message: t('{label} を入力してください。', { label }) }
  }
  const parsed = Number(token)
  if (!Number.isFinite(parsed)) {
    return { ok: false, message: t('{label} は数値で入力してください。', { label }) }
  }
  return { ok: true, value: parsed }
}

function teamName(teamId?: string) {
  if (!teamId) return t('未選択')
  return teams.teams.find((team) => team._id === teamId)?.name ?? teamId
}

function entityNameForRound(
  entityId?: string,
  roundNumber?: number,
  options?: { fallbackId?: boolean }
) {
  if (!entityId) return ''
  const token = String(entityId)
  const team = teams.teams.find((item) => item._id === token)
  if (team) return team.name
  const speaker = speakers.speakers.find((item) => item._id === token)
  if (speaker) return speaker.name
  const adjudicator = adjudicators.adjudicators.find((item) => item._id === token)
  if (adjudicator) return adjudicator.name
  if (token.includes(':')) {
    const [teamId, indexRaw] = token.split(':')
    const index = Number(indexRaw)
    if (teamId && Number.isFinite(index) && index >= 0) {
      const speakerNames = teamSpeakerNames(teamId, Number(roundNumber ?? 0))
      if (speakerNames[index]) return speakerNames[index]
    }
  }
  return options?.fallbackId === false ? '' : token
}

function adjudicatorName(adjudicatorId?: string) {
  if (!adjudicatorId) return t('不明')
  return adjudicators.adjudicators.find((item) => item._id === adjudicatorId)?.name ?? adjudicatorId
}

function submittedByLabel(item: Submission) {
  const submittedEntityId = String((item.payload as any)?.submittedEntityId ?? '')
  if (submittedEntityId) {
    return entityNameForRound(submittedEntityId, item.round)
  }
  if (item.submittedBy) {
    return entityNameForRound(item.submittedBy, item.round)
  }
  return t('不明')
}

function submittedBySearchText(item: Submission) {
  const submittedEntityId = String((item.payload as any)?.submittedEntityId ?? '')
  if (submittedEntityId) {
    return entityNameForRound(submittedEntityId, item.round, { fallbackId: false })
  }
  if (item.submittedBy) {
    return entityNameForRound(item.submittedBy, item.round, { fallbackId: false })
  }
  return ''
}

function teamSpeakerNames(teamId: string, round: number): string[] {
  const team = teams.teams.find((item) => item._id === teamId)
  if (!team) return []
  const detail = team.details?.find((item: any) => Number(item.r) === Number(round))
  const detailSpeakerIds = (detail?.speakers ?? []).map((id: any) => String(id)).filter(Boolean)
  if (detailSpeakerIds.length > 0) {
    return detailSpeakerIds.map((id: string) => {
      return speakers.speakers.find((speaker) => speaker._id === id)?.name ?? id
    })
  }
  return (team.speakers ?? []).map((speaker: any) => String(speaker?.name ?? '')).filter(Boolean)
}

function speakerName(
  teamId: string,
  speakerId: string | undefined,
  round: number,
  order: number
): string {
  const fallback = teamSpeakerNames(teamId, round)
  if (!speakerId) return fallback[order] ?? t('スピーカー {index}', { index: order + 1 })
  const direct = speakers.speakers.find((speaker) => speaker._id === speakerId)
  if (direct) return direct.name
  if (speakerId.includes(':')) {
    const [speakerTeamId, indexRaw] = speakerId.split(':')
    if (speakerTeamId === teamId) {
      const index = Number(indexRaw)
      if (Number.isFinite(index) && fallback[index]) return fallback[index]
    }
  }
  return speakerId
}

function speakerOptionsForTeam(teamId: string, round: number, minimumCount = 0): SpeakerOption[] {
  const team = teams.teams.find((item) => item._id === teamId)
  if (!team) return []

  const seen = new Set<string>()
  const options: SpeakerOption[] = []
  const detail = team.details?.find((item: any) => Number(item.r) === Number(round))
  const detailSpeakerIds = (detail?.speakers ?? []).map((id: any) => String(id)).filter(Boolean)

  if (detailSpeakerIds.length > 0) {
    detailSpeakerIds.forEach((speakerId) => {
      if (seen.has(speakerId)) return
      seen.add(speakerId)
      const name = speakers.speakers.find((speaker) => speaker._id === speakerId)?.name ?? speakerId
      options.push({ id: speakerId, name })
    })
  }

  const fallbackNames = teamSpeakerNames(teamId, round)
  if (options.length === 0) {
    fallbackNames.forEach((name, index) => {
      const fallbackId = `${teamId}:${index}`
      if (seen.has(fallbackId)) return
      seen.add(fallbackId)
      options.push({ id: fallbackId, name: name || t('スピーカー {index}', { index: index + 1 }) })
    })
  }

  const targetLength = Math.max(minimumCount, fallbackNames.length, options.length)
  for (let index = 0; index < targetLength; index += 1) {
    const fallbackId = `${teamId}:${index}`
    if (seen.has(fallbackId)) continue
    seen.add(fallbackId)
    const name = fallbackNames[index] || t('スピーカー {index}', { index: index + 1 })
    options.push({ id: fallbackId, name })
  }

  return options
}

function speakerOptionsForEditor(teamSlot: 'A' | 'B', rowIndex: number): SpeakerOption[] {
  const teamId =
    teamSlot === 'A' ? editingBallotTeamAId.value.trim() : editingBallotTeamBId.value.trim()
  if (!teamId) return []

  const rows = teamSlot === 'A' ? editingBallotRowsA.value : editingBallotRowsB.value
  const options = speakerOptionsForTeam(teamId, editingRound.value, Math.max(rows.length, rowIndex + 1)).slice()
  const currentSpeakerId = String(rows[rowIndex]?.speakerId ?? '').trim()
  if (currentSpeakerId && !options.some((option) => option.id === currentSpeakerId)) {
    options.unshift({
      id: currentSpeakerId,
      name: speakerName(teamId, currentSpeakerId, editingRound.value, rowIndex),
    })
  }
  return options
}

function drawRow(round: number, teamAId: string, teamBId: string) {
  const draw = drawByRound.value.get(Number(round))
  if (!draw?.allocation || !Array.isArray(draw.allocation)) return null
  return draw.allocation.find((row: any) => {
    const gov = String(row?.teams?.gov ?? row?.teams?.[0] ?? '')
    const opp = String(row?.teams?.opp ?? row?.teams?.[1] ?? '')
    return (gov === teamAId && opp === teamBId) || (gov === teamBId && opp === teamAId)
  })
}

function rowGovTeamId(row: any) {
  return String(row?.teams?.gov ?? row?.teams?.[0] ?? '')
}

function rowOppTeamId(row: any) {
  return String(row?.teams?.opp ?? row?.teams?.[1] ?? '')
}

function resolveBallotSides(round: number, teamAId: string, teamBId: string): SideMapping {
  const row = drawRow(round, teamAId, teamBId)
  const govTeamId = row ? rowGovTeamId(row) : teamAId
  const oppTeamId = row ? rowOppTeamId(row) : teamBId
  const govSlot: 'A' | 'B' = govTeamId === teamBId ? 'B' : 'A'
  const oppSlot: 'A' | 'B' = oppTeamId === teamAId ? 'A' : 'B'
  return { govTeamId, oppTeamId, govSlot, oppSlot }
}

function resolveEditingBallotSides(round: number, teamAId: string, teamBId: string): SideMapping {
  const selectedGovTeamId = editingBallotGovTeamId.value.trim()
  if (selectedGovTeamId === teamAId) {
    return {
      govTeamId: teamAId,
      oppTeamId: teamBId,
      govSlot: 'A',
      oppSlot: 'B',
    }
  }
  if (selectedGovTeamId === teamBId) {
    return {
      govTeamId: teamBId,
      oppTeamId: teamAId,
      govSlot: 'B',
      oppSlot: 'A',
    }
  }
  return resolveBallotSides(round, teamAId, teamBId)
}

function matchupLabelFromTeams(round: number, teamAId: string, teamBId: string) {
  const mapping = resolveBallotSides(round, teamAId, teamBId)
  return `${teamName(mapping.govTeamId)} ${t('vs')} ${teamName(mapping.oppTeamId)}`
}

function matchupLabel(item: Submission) {
  if (item.type !== 'ballot') return t('スコアシート')
  const payload = (item.payload ?? {}) as BallotPayload
  return matchupLabelFromTeams(item.round, String(payload.teamAId ?? ''), String(payload.teamBId ?? ''))
}

function matchupLabelForDisplay(item: Submission) {
  if (item.type !== 'ballot') return matchupLabel(item)
  if (!isEditing(item._id)) return matchupLabel(item)
  const mapping = resolveEditingBallotSides(
    editingRound.value,
    editingBallotTeamAId.value.trim(),
    editingBallotTeamBId.value.trim()
  )
  return `${teamName(mapping.govTeamId)} ${t('vs')} ${teamName(mapping.oppTeamId)}`
}

function submissionSummary(item: Submission) {
  if (item.type === 'ballot') return matchupLabel(item)
  const adjudicatorId = String((item.payload as any)?.adjudicatorId ?? '')
  const score = Number((item.payload as any)?.score)
  const hasScore = Number.isFinite(score)
  if (!adjudicatorId && !hasScore) return t('フィードバック')
  const parts = []
  if (adjudicatorId) parts.push(`${t('ジャッジ')}: ${adjudicatorName(adjudicatorId)}`)
  if (hasScore) parts.push(`${t('スコア')}: ${score}`)
  return parts.join(' / ')
}

function feedbackScoreText(payload: Record<string, unknown>) {
  const score = Number(payload.score)
  return Number.isFinite(score) ? String(Math.round(score * 1000) / 1000) : '—'
}

function feedbackMatterText(payload: Record<string, unknown>) {
  const value = Number(payload.matter)
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : '—'
}

function feedbackMannerText(payload: Record<string, unknown>) {
  const value = Number(payload.manner)
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : '—'
}

function feedbackSummaryForDisplay(item: Submission) {
  const payload = (item.payload ?? {}) as Record<string, unknown>
  const adjudicatorId = String(payload.adjudicatorId ?? '')
  if (!adjudicatorId) return t('ジャッジ評価')
  return `${t('ジャッジ')}: ${adjudicatorName(adjudicatorId)}`
}

function speakerRowsFor(item: Submission): SpeakerRow[] {
  if (item.type !== 'ballot') return []
  const payload = (item.payload ?? {}) as BallotPayload
  const teamAId = String(payload.teamAId ?? '')
  const teamBId = String(payload.teamBId ?? '')
  if (!teamAId || !teamBId) return []

  const mapping = resolveBallotSides(item.round, teamAId, teamBId)

  const speakerIdsA = toStringArray(payload.speakerIdsA)
  const speakerIdsB = toStringArray(payload.speakerIdsB)
  const scoresA = toNumberArray(payload.scoresA)
  const scoresB = toNumberArray(payload.scoresB)
  const matterA = toNumberArray(payload.matterA)
  const matterB = toNumberArray(payload.matterB)
  const mannerA = toNumberArray(payload.mannerA)
  const mannerB = toNumberArray(payload.mannerB)
  const bestA = toBooleanArray(payload.bestA)
  const bestB = toBooleanArray(payload.bestB)
  const poiA = toBooleanArray(payload.poiA)
  const poiB = toBooleanArray(payload.poiB)

  const toRows = (
    side: 'gov' | 'opp',
    teamId: string,
    speakerIds: string[],
    scores: Array<number | undefined>,
    matter: Array<number | undefined>,
    manner: Array<number | undefined>,
    best: boolean[],
    poi: boolean[]
  ) => {
    const fallbackNames = teamSpeakerNames(teamId, item.round)
    const length = Math.max(
      speakerIds.length,
      scores.length,
      matter.length,
      manner.length,
      best.length,
      poi.length,
      fallbackNames.length
    )
    return Array.from({ length }, (_, index) => ({
      key: `${item._id}-${side}-${index}`,
      side: `${side === 'gov' ? govLabel.value : oppLabel.value} ${index + 1}`,
      teamName: teamName(teamId),
      speakerName: speakerName(teamId, speakerIds[index], item.round, index),
      score: formatNumber(scores[index]),
      matter: formatNumber(matter[index]),
      manner: formatNumber(manner[index]),
      best: Boolean(best[index]),
      poi: Boolean(poi[index]),
    }))
  }

  const govIsA = mapping.govSlot === 'A'

  return [
    ...toRows(
      'gov',
      mapping.govTeamId,
      govIsA ? speakerIdsA : speakerIdsB,
      govIsA ? scoresA : scoresB,
      govIsA ? matterA : matterB,
      govIsA ? mannerA : mannerB,
      govIsA ? bestA : bestB,
      govIsA ? poiA : poiB
    ),
    ...toRows(
      'opp',
      mapping.oppTeamId,
      govIsA ? speakerIdsB : speakerIdsA,
      govIsA ? scoresB : scoresA,
      govIsA ? matterB : matterA,
      govIsA ? mannerB : mannerA,
      govIsA ? bestB : bestA,
      govIsA ? poiB : poiA
    ),
  ]
}

function derivedScoreFromEntry(entry: EditableBallotRow): string {
  const matter = Number(entry.matter)
  const manner = Number(entry.manner)
  if (!Number.isFinite(matter) || !Number.isFinite(manner)) return '—'
  return formatNumber(matter + manner)
}

function editingSpeakerRowsFor(item: Submission): EditableSpeakerRowView[] {
  if (item.type !== 'ballot' || !isEditing(item._id)) return []

  const teamAId = editingBallotTeamAId.value.trim()
  const teamBId = editingBallotTeamBId.value.trim()
  if (!teamAId || !teamBId) return []

  const mapping = resolveEditingBallotSides(editingRound.value, teamAId, teamBId)
  const rowsGov = mapping.govSlot === 'A' ? editingBallotRowsA.value : editingBallotRowsB.value
  const rowsOpp = mapping.govSlot === 'A' ? editingBallotRowsB.value : editingBallotRowsA.value

  const toRows = (
    side: 'gov' | 'opp',
    teamSlot: 'A' | 'B',
    teamId: string,
    rows: EditableBallotRow[]
  ) => {
    return rows.map((entry, index) => ({
      key: `${item._id}-${side}-${index}`,
      side: `${side === 'gov' ? govLabel.value : oppLabel.value} ${index + 1}`,
      teamName: teamName(teamId),
      teamSlot,
      index,
      score:
        editingBallotNoSpeakerScore.value
          ? '—'
          : editingBallotScoreMode.value === 'matter_manner'
            ? derivedScoreFromEntry(entry)
            : entry.score.trim() || '—',
      matter:
        editingBallotNoSpeakerScore.value
          ? '—'
          : editingBallotScoreMode.value === 'matter_manner'
            ? entry.matter.trim() || '—'
            : '—',
      manner:
        editingBallotNoSpeakerScore.value
          ? '—'
          : editingBallotScoreMode.value === 'matter_manner'
            ? entry.manner.trim() || '—'
            : '—',
      best: Boolean(entry.best),
      poi: Boolean(entry.poi),
      entry,
    }))
  }

  return [
    ...toRows('gov', mapping.govSlot, mapping.govTeamId, rowsGov),
    ...toRows('opp', mapping.oppSlot, mapping.oppTeamId, rowsOpp),
  ]
}

function formatPayload(payload: Record<string, unknown>) {
  return JSON.stringify(payload, null, 2)
}

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function typeLabel(value: string) {
  if (value === 'ballot') return t('スコアシート')
  if (value === 'feedback') return t('フィードバック')
  return value
}

function toggleExpand(item: Submission) {
  const id = String(item._id ?? '')
  if (!id) return
  if (expandedIds.value.has(id)) {
    expandedIds.value = new Set()
    if (editingSubmissionId.value === id) {
      cancelEdit()
    }
    return
  }
  expandedIds.value = new Set([id])
  startEdit(item)
}

function isExpanded(id: string) {
  return expandedIds.value.has(id)
}

function isEditing(id: string) {
  return editingSubmissionId.value === id
}

function syncFocusedSubmissionState() {
  const focusId = focusedSubmissionId.value
  if (!focusId) return
  const target = roundScopedItems.value.find((item) => String(item._id ?? '') === focusId)
  if (!target) return
  expandedIds.value = new Set([focusId])
  if (props.autoEditFocusSubmission) {
    if (editingSubmissionId.value !== focusId) {
      startEdit(target)
    }
    return
  }
  if (props.autoOpenFocusSubmission && editingSubmissionId.value && editingSubmissionId.value !== focusId) {
    cancelEdit()
  }
}

function submissionActionSummary(item: Submission) {
  return `${t('ラウンド')} ${item.round} / ${typeLabel(item.type)} / ${submittedByLabel(item)}`
}

function requestSaveEdit(item: Submission) {
  const submissionId = String(item._id ?? '')
  if (!submissionId || !isEditing(submissionId) || editingSaving.value) return
  actionConfirm.value = {
    action: 'save',
    submissionId,
    title: t('更新内容を保存しますか？'),
    message: t('現在の入力内容でこの評価を更新します。'),
    summary: submissionActionSummary(item),
    confirmLabel: t('更新を保存'),
  }
}

function requestDeleteSubmission(item: Submission) {
  const submissionId = String(item._id ?? '')
  if (!submissionId || !isEditing(submissionId) || editingSaving.value) return
  actionConfirm.value = {
    action: 'delete',
    submissionId,
    title: t('この評価を削除しますか？'),
    message: t('削除した評価は元に戻せません。'),
    summary: submissionActionSummary(item),
    confirmLabel: t('評価を削除'),
  }
}

function closeActionConfirm() {
  if (editingSaving.value) return
  actionConfirm.value = null
}

async function executeConfirmedAction() {
  if (editingSaving.value || !actionConfirm.value) return
  const pending = actionConfirm.value
  actionConfirm.value = null
  const submissionId = pending.submissionId
  const target = submissions.submissions.find((item) => String(item._id ?? '') === submissionId)
  if (!target) {
    if (editingSubmissionId.value === submissionId) {
      cancelEdit()
    }
    const next = new Set(expandedIds.value)
    next.delete(submissionId)
    expandedIds.value = next
    return
  }
  if (pending.action === 'save') {
    await saveEdit(target)
    return
  }
  await deleteCurrentSubmission(target)
}

function resetBallotEditor() {
  editingBallotBasePayload.value = {}
  editingBallotTeamAId.value = ''
  editingBallotTeamBId.value = ''
  editingBallotGovTeamId.value = ''
  editingBallotWinnerId.value = ''
  editingBallotSubmittedEntityId.value = ''
  editingBallotComment.value = ''
  editingBallotNoSpeakerScore.value = false
  editingBallotScoreMode.value = 'matter_manner'
  editingBallotRowsA.value = []
  editingBallotRowsB.value = []
}

function resetFeedbackEditor() {
  editingFeedbackBasePayload.value = {}
  editingFeedbackAdjudicatorId.value = ''
  editingFeedbackSubmittedEntityId.value = ''
  editingFeedbackScore.value = ''
  editingFeedbackMatter.value = ''
  editingFeedbackManner.value = ''
  editingFeedbackComment.value = ''
  editingFeedbackRole.value = ''
}

function parseWinnerPolicyToken(
  value: unknown
): 'winner_id_then_score' | 'score_only' | 'draw_on_missing' | '' {
  if (value === 'winner_id_then_score' || value === 'score_only' || value === 'draw_on_missing') {
    return value
  }
  return ''
}

function roundAllowsWinnerScoreMismatch(roundUserDefinedData: unknown): boolean {
  if (!roundUserDefinedData || typeof roundUserDefinedData !== 'object') return true
  const userDefined = roundUserDefinedData as Record<string, unknown>
  if (typeof userDefined.allow_score_winner_mismatch === 'boolean') {
    return userDefined.allow_score_winner_mismatch
  }
  const compile =
    userDefined.compile && typeof userDefined.compile === 'object'
      ? (userDefined.compile as Record<string, unknown>)
      : null
  const compileOptions =
    compile?.options && typeof compile.options === 'object'
      ? (compile.options as Record<string, unknown>)
      : compile
  const winnerPolicy =
    parseWinnerPolicyToken(userDefined.winner_policy) ||
    parseWinnerPolicyToken(compileOptions?.winner_policy)
  return winnerPolicy !== 'score_only'
}

function roundScoreSettings(roundNumber: number) {
  const found = rounds.rounds.find((item) => Number(item.round) === Number(roundNumber))
  return {
    noSpeakerScore: found?.userDefinedData?.no_speaker_score === true,
    scoreByMatterManner: found?.userDefinedData?.score_by_matter_manner !== false,
    allowLowTieWin: found?.userDefinedData?.allow_low_tie_win !== false,
    allowWinnerScoreMismatch: roundAllowsWinnerScoreMismatch(found?.userDefinedData),
  }
}

function normalizeEditingBallotWinnerSelection(preferredWinnerId?: string) {
  const options = editingBallotWinnerOptions.value
  if (options.length === 0) {
    editingBallotWinnerId.value = ''
    return
  }

  const preferred = String(preferredWinnerId ?? editingBallotWinnerId.value).trim()
  if (options.some((option) => option.value === preferred)) {
    editingBallotWinnerId.value = preferred
    return
  }

  if (!preferred && editingBallotAllowDraw.value) {
    const drawOption = options.find((option) => option.value === DRAW_WINNER_OPTION_VALUE)
    if (drawOption) {
      editingBallotWinnerId.value = drawOption.value
      return
    }
  }

  editingBallotWinnerId.value = options[0].value
}

function buildEditableRows(options: {
  teamId: string
  round: number
  speakerIds: string[]
  scores: number[]
  matter: number[]
  manner: number[]
  best: boolean[]
  poi: boolean[]
  noSpeakerScore: boolean
}) {
  if (options.noSpeakerScore) return []
  const speakerOptionLength = speakerOptionsForTeam(options.teamId, options.round).length
  const payloadRowLength = Math.max(
    options.speakerIds.length,
    options.scores.length,
    options.matter.length,
    options.manner.length,
    options.best.length,
    options.poi.length
  )
  const rowLength = payloadRowLength > 0 ? payloadRowLength : speakerOptionLength
  return Array.from({ length: rowLength }, (_, index) => ({
    speakerId: String(options.speakerIds[index] ?? ''),
    score: formatNumberForInput(options.scores[index]),
    matter: formatNumberForInput(options.matter[index]),
    manner: formatNumberForInput(options.manner[index]),
    best: Boolean(options.best[index]),
    poi: Boolean(options.poi[index]),
  }))
}

function hydrateBallotEditor(payload: Record<string, unknown>) {
  editingBallotBasePayload.value = { ...payload }
  editingBallotTeamAId.value = String(payload.teamAId ?? '')
  editingBallotTeamBId.value = String(payload.teamBId ?? '')
  const initialSideMapping = resolveBallotSides(
    editingRound.value,
    editingBallotTeamAId.value,
    editingBallotTeamBId.value
  )
  editingBallotGovTeamId.value =
    initialSideMapping.govTeamId === editingBallotTeamAId.value ||
    initialSideMapping.govTeamId === editingBallotTeamBId.value
      ? initialSideMapping.govTeamId
      : editingBallotTeamAId.value || editingBallotTeamBId.value
  normalizeEditingBallotWinnerSelection(
    payload.draw === true ? DRAW_WINNER_OPTION_VALUE : String(payload.winnerId ?? '')
  )
  editingBallotSubmittedEntityId.value = String(payload.submittedEntityId ?? '')
  editingBallotComment.value = typeof payload.comment === 'string' ? payload.comment : ''

  const settings = roundScoreSettings(editingRound.value)
  editingBallotNoSpeakerScore.value = settings.noSpeakerScore

  const scoresA = toFiniteNumberList(payload.scoresA)
  const scoresB = toFiniteNumberList(payload.scoresB)
  let matterA = toFiniteNumberList(payload.matterA)
  let mannerA = toFiniteNumberList(payload.mannerA)
  let matterB = toFiniteNumberList(payload.matterB)
  let mannerB = toFiniteNumberList(payload.mannerB)

  const hasMatterManner =
    Array.isArray(payload.matterA) ||
    Array.isArray(payload.mannerA) ||
    Array.isArray(payload.matterB) ||
    Array.isArray(payload.mannerB)

  editingBallotScoreMode.value =
    hasMatterManner || settings.scoreByMatterManner ? 'matter_manner' : 'total'

  if (editingBallotScoreMode.value === 'matter_manner') {
    if (matterA.length === 0 && scoresA.length > 0) {
      matterA = scoresA.slice()
      mannerA = Array.from({ length: scoresA.length }, () => 0)
    }
    if (matterB.length === 0 && scoresB.length > 0) {
      matterB = scoresB.slice()
      mannerB = Array.from({ length: scoresB.length }, () => 0)
    }
  }

  editingBallotRowsA.value = buildEditableRows({
    teamId: editingBallotTeamAId.value,
    round: editingRound.value,
    speakerIds: toStringArray(payload.speakerIdsA),
    scores: scoresA,
    matter: matterA,
    manner: mannerA,
    best: toBooleanArray(payload.bestA),
    poi: toBooleanArray(payload.poiA),
    noSpeakerScore: settings.noSpeakerScore,
  })

  editingBallotRowsB.value = buildEditableRows({
    teamId: editingBallotTeamBId.value,
    round: editingRound.value,
    speakerIds: toStringArray(payload.speakerIdsB),
    scores: scoresB,
    matter: matterB,
    manner: mannerB,
    best: toBooleanArray(payload.bestB),
    poi: toBooleanArray(payload.poiB),
    noSpeakerScore: settings.noSpeakerScore,
  })
}

function hydrateFeedbackEditor(payload: Record<string, unknown>) {
  editingFeedbackBasePayload.value = { ...payload }
  editingFeedbackAdjudicatorId.value = String(payload.adjudicatorId ?? '')
  editingFeedbackSubmittedEntityId.value = String(payload.submittedEntityId ?? '')
  const scoreValue = Number(payload.score)
  editingFeedbackScore.value = Number.isFinite(scoreValue) ? String(scoreValue) : ''
  const matterValue = Number(payload.matter)
  editingFeedbackMatter.value = Number.isFinite(matterValue) ? String(matterValue) : ''
  const mannerValue = Number(payload.manner)
  editingFeedbackManner.value = Number.isFinite(mannerValue) ? String(mannerValue) : ''
  editingFeedbackComment.value = typeof payload.comment === 'string' ? payload.comment : ''
  editingFeedbackRole.value = typeof payload.role === 'string' ? payload.role : ''
}

function parseOptionalNumber(value: string, label: string): NumberParseResult | { ok: true; value: undefined } {
  const token = value.trim()
  if (!token) return { ok: true, value: undefined }
  const parsed = Number(token)
  if (!Number.isFinite(parsed)) {
    return { ok: false, message: t('{label} は数値で入力してください。', { label }) }
  }
  return { ok: true, value: parsed }
}

function buildFeedbackPayloadFromForm() {
  const fail = (message: string) => {
    editError.value = message
    return null
  }

  const adjudicatorId = editingFeedbackAdjudicatorId.value.trim()
  if (!adjudicatorId) {
    return fail(t('ジャッジを選択してください。'))
  }

  const scoreResult = parseRequiredNumber(editingFeedbackScore.value, t('スコア'))
  if (!scoreResult.ok) return fail(scoreResult.message)
  if (scoreResult.value < 0) {
    return fail(t('スコアは0以上で入力してください。'))
  }

  const matterResult = parseOptionalNumber(editingFeedbackMatter.value, t('Matter'))
  if (!matterResult.ok) return fail(matterResult.message)
  const mannerResult = parseOptionalNumber(editingFeedbackManner.value, t('Manner'))
  if (!mannerResult.ok) return fail(mannerResult.message)

  const payload: Record<string, unknown> = {
    ...editingFeedbackBasePayload.value,
    adjudicatorId,
    score: scoreResult.value,
    comment: editingFeedbackComment.value,
  }

  if (matterResult.value !== undefined) payload.matter = matterResult.value
  else delete payload.matter
  if (mannerResult.value !== undefined) payload.manner = mannerResult.value
  else delete payload.manner

  const submittedEntityId = editingFeedbackSubmittedEntityId.value.trim()
  if (submittedEntityId) payload.submittedEntityId = submittedEntityId
  else delete payload.submittedEntityId

  const role = editingFeedbackRole.value.trim()
  if (role) payload.role = role
  else delete payload.role

  return payload
}

function buildBallotPayloadFromTable(): Record<string, unknown> | null {
  const fail = (message: string) => {
    editError.value = message
    return null
  }

  const teamAId = editingBallotTeamAId.value.trim()
  const teamBId = editingBallotTeamBId.value.trim()
  if (!teamAId || !teamBId || teamAId === teamBId) {
    return fail(t('チームを確認してください。'))
  }

  const govTeamId = editingBallotGovTeamId.value.trim()
  if (govTeamId !== teamAId && govTeamId !== teamBId) {
    return fail(t('{side} 側のチームを選択してください。', { side: govLabel.value }))
  }

  const winnerSelection = editingBallotWinnerId.value.trim()
  const availableWinnerValues = new Set(editingBallotWinnerOptions.value.map((option) => option.value))
  if (!availableWinnerValues.has(winnerSelection)) {
    return fail(
      editingBallotAllowDraw.value
        ? t('勝者または引き分けを選択してください。')
        : t('勝者を選択してください。')
    )
  }
  const settings = roundScoreSettings(editingRound.value)
  const winnerIsDraw = winnerSelection === DRAW_WINNER_OPTION_VALUE
  const winner = winnerIsDraw ? '' : winnerSelection
  const validateWinnerDecision = (totalA: number, totalB: number, hasComparableScores: boolean) => {
    if (winnerIsDraw) {
      if (!settings.allowLowTieWin) return t('このラウンドでは引き分けは選択できません。')
      if (!settings.allowWinnerScoreMismatch && hasComparableScores && totalA !== totalB) {
        return t('引き分けは同点時のみ選択できます。')
      }
      return ''
    }
    if (!settings.allowWinnerScoreMismatch && hasComparableScores && totalA !== totalB) {
      if (winner === teamAId && totalA < totalB) return t('勝者は点数の大小と一致させてください。')
      if (winner === teamBId && totalB < totalA) return t('勝者は点数の大小と一致させてください。')
    }
    return ''
  }

  const payload: Record<string, unknown> = {
    ...editingBallotBasePayload.value,
    teamAId,
    teamBId,
    comment: editingBallotComment.value,
  }

  if (winnerIsDraw) {
    payload.draw = true
    delete payload.winnerId
  } else {
    payload.winnerId = winner
    delete payload.draw
  }

  const submittedEntityId = editingBallotSubmittedEntityId.value.trim()
  if (
    submittedEntityId &&
    !adjudicatorEntityOptions.value.some((option) => option.id === submittedEntityId)
  ) {
    return fail(t('提出者はジャッジから選択してください。'))
  }
  if (submittedEntityId) payload.submittedEntityId = submittedEntityId
  else delete payload.submittedEntityId

  if (editingBallotNoSpeakerScore.value) {
    const winnerDecisionMessage = validateWinnerDecision(0, 0, false)
    if (winnerDecisionMessage) return fail(winnerDecisionMessage)

    payload.scoresA = []
    payload.scoresB = []
    payload.speakerIdsA = []
    payload.speakerIdsB = []
    payload.bestA = []
    payload.bestB = []
    payload.poiA = []
    payload.poiB = []
    delete payload.matterA
    delete payload.mannerA
    delete payload.matterB
    delete payload.mannerB
    return payload
  }

  type ParsedSideRows =
    | {
        ok: true
        speakerIds: string[]
        scores: number[]
        matter: number[]
        manner: number[]
        best: boolean[]
        poi: boolean[]
      }
    | {
        ok: false
        message: string
      }

  const parseSideRows = (sideRows: EditableBallotRow[], sideLabel: string): ParsedSideRows => {
    const speakerIds: string[] = []
    const scores: number[] = []
    const matter: number[] = []
    const manner: number[] = []
    const best: boolean[] = []
    const poi: boolean[] = []

    for (let index = 0; index < sideRows.length; index += 1) {
      const row = sideRows[index]
      const speakerId = row.speakerId.trim()
      if (!speakerId) {
        return { ok: false, message: t('{label} のスピーカーを選択してください。', { label: `${sideLabel} ${index + 1}` }) }
      }
      speakerIds.push(speakerId)
      best.push(Boolean(row.best))
      poi.push(Boolean(row.poi))

      if (editingBallotScoreMode.value === 'matter_manner') {
        const matterResult = parseRequiredNumber(row.matter, `${sideLabel} ${index + 1} Matter`)
        if (!matterResult.ok) return { ok: false as const, message: matterResult.message }
        const mannerResult = parseRequiredNumber(row.manner, `${sideLabel} ${index + 1} Manner`)
        if (!mannerResult.ok) return { ok: false as const, message: mannerResult.message }
        matter.push(matterResult.value)
        manner.push(mannerResult.value)
        scores.push(matterResult.value + mannerResult.value)
      } else {
        const scoreResult = parseRequiredNumber(row.score, `${sideLabel} ${index + 1} ${t('スコア')}`)
        if (!scoreResult.ok) return { ok: false as const, message: scoreResult.message }
        scores.push(scoreResult.value)
      }
    }

    return { ok: true as const, speakerIds, scores, matter, manner, best, poi }
  }

  const sideA = parseSideRows(editingBallotRowsA.value, teamName(teamAId))
  if (!sideA.ok) return fail(sideA.message)
  const sideB = parseSideRows(editingBallotRowsB.value, teamName(teamBId))
  if (!sideB.ok) return fail(sideB.message)
  const totalA = sideA.scores.reduce((sum, value) => sum + value, 0)
  const totalB = sideB.scores.reduce((sum, value) => sum + value, 0)
  const winnerDecisionMessage = validateWinnerDecision(totalA, totalB, true)
  if (winnerDecisionMessage) return fail(winnerDecisionMessage)

  payload.speakerIdsA = sideA.speakerIds
  payload.speakerIdsB = sideB.speakerIds
  payload.scoresA = sideA.scores
  payload.scoresB = sideB.scores
  payload.bestA = sideA.best
  payload.bestB = sideB.best
  payload.poiA = sideA.poi
  payload.poiB = sideB.poi

  if (editingBallotScoreMode.value === 'matter_manner') {
    payload.matterA = sideA.matter
    payload.mannerA = sideA.manner
    payload.matterB = sideB.matter
    payload.mannerB = sideB.manner
  } else {
    delete payload.matterA
    delete payload.mannerA
    delete payload.matterB
    delete payload.mannerB
  }

  return payload
}

function startEdit(item: Submission) {
  const id = String(item._id ?? '')
  if (!id) return
  editingSubmissionId.value = id
  editingRound.value = Number(item.round) || 1
  editingPayloadText.value = formatPayload(item.payload ?? {})

  if (item.type === 'ballot') {
    hydrateBallotEditor((item.payload ?? {}) as Record<string, unknown>)
    resetFeedbackEditor()
  } else if (item.type === 'feedback') {
    resetBallotEditor()
    hydrateFeedbackEditor((item.payload ?? {}) as Record<string, unknown>)
  } else {
    resetBallotEditor()
    resetFeedbackEditor()
  }

  editError.value = ''
  const next = new Set(expandedIds.value)
  next.add(id)
  expandedIds.value = next
}

function cancelEdit() {
  editingSubmissionId.value = null
  editingPayloadText.value = ''
  editingRound.value = 1
  editingSaving.value = false
  actionConfirm.value = null
  resetBallotEditor()
  resetFeedbackEditor()
  editError.value = ''
}

async function saveEdit(item: Submission) {
  if (!isEditing(item._id)) return
  if (!Number.isFinite(editingRound.value) || editingRound.value < 1) {
    editError.value = t('ラウンドは1以上で入力してください。')
    return
  }

  let parsed: Record<string, unknown>
  if (item.type === 'ballot') {
    const payload = buildBallotPayloadFromTable()
    if (!payload) return
    parsed = payload
    editingPayloadText.value = formatPayload(payload)
  } else if (item.type === 'feedback') {
    const payload = buildFeedbackPayloadFromForm()
    if (!payload) return
    parsed = payload
    editingPayloadText.value = formatPayload(payload)
  } else {
    try {
      const payload = JSON.parse(editingPayloadText.value)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        editError.value = t('JSONはオブジェクト形式で入力してください。')
        return
      }
      parsed = payload as Record<string, unknown>
    } catch {
      editError.value = t('JSONの形式が正しくありません。')
      return
    }
  }

  editError.value = ''
  editingSaving.value = true
  try {
    const updated = await submissions.updateSubmission({
      tournamentId: tournamentId.value,
      submissionId: String(item._id ?? ''),
      round: Math.floor(editingRound.value),
      payload: parsed,
    })
    if (!updated) {
      editError.value = submissions.error ?? t('提出データの更新に失敗しました。')
      return
    }
    startEdit(updated as Submission)
  } finally {
    editingSaving.value = false
  }
}

async function deleteCurrentSubmission(item: Submission) {
  const submissionId = String(item._id ?? '')
  if (!submissionId) return

  editError.value = ''
  editingSaving.value = true
  try {
    const deleted = await submissions.deleteSubmission({
      tournamentId: tournamentId.value,
      submissionId,
    })
    if (!deleted) {
      editError.value = submissions.error ?? t('提出データの削除に失敗しました。')
      return
    }

    const next = new Set(expandedIds.value)
    next.delete(submissionId)
    expandedIds.value = next
    if (editingSubmissionId.value === submissionId) {
      cancelEdit()
    }
  } finally {
    editingSaving.value = false
  }
}

async function refresh() {
  if (!tournamentId.value) return
  sectionLoading.value = true
  try {
    await Promise.all([
      submissions.fetchSubmissions({ tournamentId: tournamentId.value }),
      rounds.fetchRounds(tournamentId.value),
      draws.fetchDraws(tournamentId.value),
      teams.fetchTeams(tournamentId.value),
      speakers.fetchSpeakers(tournamentId.value),
      adjudicators.fetchAdjudicators(tournamentId.value),
      tournamentStore.fetchTournaments(),
      stylesStore.fetchStyles(),
    ])
  } finally {
    sectionLoading.value = false
  }
}

watch(editingRound, () => {
  if (!editingSubmissionId.value) return
  const editingItem = submissions.submissions.find(
    (item) => String(item._id ?? '') === editingSubmissionId.value
  )
  if (!editingItem || editingItem.type !== 'ballot') return

  const previousNoSpeaker = editingBallotNoSpeakerScore.value
  const settings = roundScoreSettings(editingRound.value)
  editingBallotNoSpeakerScore.value = settings.noSpeakerScore
  normalizeEditingBallotWinnerSelection()

  if (settings.noSpeakerScore) return

  if (previousNoSpeaker) {
    editingBallotScoreMode.value = settings.scoreByMatterManner ? 'matter_manner' : 'total'
    if (editingBallotRowsA.value.length === 0) {
      editingBallotRowsA.value = buildEditableRows({
        teamId: editingBallotTeamAId.value,
        round: editingRound.value,
        speakerIds: [],
        scores: [],
        matter: [],
        manner: [],
        best: [],
        poi: [],
        noSpeakerScore: false,
      })
    }
    if (editingBallotRowsB.value.length === 0) {
      editingBallotRowsB.value = buildEditableRows({
        teamId: editingBallotTeamBId.value,
        round: editingRound.value,
        speakerIds: [],
        scores: [],
        matter: [],
        manner: [],
        best: [],
        poi: [],
        noSpeakerScore: false,
      })
    }
  }

})

watch(
  editingBallotWinnerOptions,
  () => {
    if (!editingSubmissionId.value) return
    normalizeEditingBallotWinnerSelection()
  },
  { deep: true }
)

watch(
  [contextRound, () => route.query.round],
  ([fixedRound, value]) => {
    if (fixedRound !== null) {
      roundFilter.value = ''
      return
    }
    if (typeof value !== 'string') {
      roundFilter.value = ''
      return
    }
    roundFilter.value = value
  },
  { immediate: true }
)

watch(
  [focusedSubmissionId, roundScopedItems, () => props.autoOpenFocusSubmission, () => props.autoEditFocusSubmission],
  () => {
    syncFocusedSubmissionState()
  },
  { immediate: true }
)

watch(
  tournamentId,
  () => {
    refresh()
  },
  { immediate: true }
)
</script>

<style scoped>
.grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.stats-grid {
  display: grid;
  gap: var(--space-2);
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.stat-card {
  gap: 4px;
}

.filter-bar {
  position: sticky;
  top: var(--space-4);
  z-index: 3;
}

.filter-bar:not(.card) {
  position: static;
  top: auto;
  z-index: auto;
}

.split-section-list {
  gap: var(--space-2);
}

.split-section-card {
  border: 1px solid var(--color-border);
  gap: var(--space-1);
}

.split-section-card :deep(.table th),
.split-section-card :deep(.table td) {
  padding: 6px 8px;
}

.split-section-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding-bottom: 4px;
}

.split-section-title {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
}

.search-field {
  justify-content: end;
}

.search-field input {
  min-height: 34px;
}

.split-search-field {
  min-width: min(280px, 100%);
  flex: 1 1 280px;
}

.split-search-field input {
  min-height: 34px;
}

.focus-edit-only-content {
  gap: var(--space-2);
}

.ballot-card {
  gap: var(--space-3);
}

.feedback-card {
  gap: var(--space-3);
}

.ballot-card-header {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.ballot-meta-grid {
  align-items: start;
}

.ballot-meta-grid .full {
  grid-column: 1 / -1;
}

.feedback-meta-grid {
  align-items: start;
}

.feedback-meta-grid .full {
  grid-column: 1 / -1;
}

.feedback-read-grid {
  display: grid;
  gap: var(--space-2);
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.feedback-read-item.full {
  grid-column: 1 / -1;
}

.ballot-action-row {
  gap: var(--space-2);
}

.speaker-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.speaker-table th,
.speaker-table td {
  border: 1px solid var(--color-border);
  padding: 6px 8px;
  text-align: left;
}

.speaker-table select,
.speaker-table input[type='number'] {
  width: 100%;
  min-width: 90px;
}

.speaker-table .flag-input {
  width: auto;
  min-width: 0;
}

.error {
  color: var(--color-danger);
}

.section-header {
  align-items: center;
}

.header-reload {
  margin-left: 0;
}

.row-actions {
  gap: var(--space-2);
}

.submission-summary-row.is-expanded > td {
  background: rgba(37, 99, 235, 0.08);
  border-bottom-color: rgba(37, 99, 235, 0.25);
}

.submission-summary-row.is-expanded + .submission-detail-row > td {
  border-top-color: rgba(37, 99, 235, 0.25);
}

.submission-detail-row > td {
  background: #f3f6ff;
  padding: var(--space-3);
  box-shadow: inset 4px 0 0 rgba(37, 99, 235, 0.28);
}

.submission-detail-row .stack {
  gap: var(--space-3);
}

.submission-detail-row .ballot-card,
.submission-detail-row .feedback-card {
  background: var(--color-surface);
  border: 1px solid #dbe5ff;
  box-shadow: 0 2px 10px rgba(37, 99, 235, 0.08);
}

.submission-detail-row .speaker-table {
  background: var(--color-surface);
}

.submission-detail-row .speaker-table thead th {
  background: #eef3ff;
}

.submission-detail-row .speaker-table tbody tr:nth-child(even) td {
  background: #f8faff;
}

.section-header-actions {
  margin-left: auto;
  align-items: center;
  gap: var(--space-2);
}

.context-link {
  color: var(--color-primary);
  text-decoration: none;
  font-size: 0.85rem;
}

.context-link:hover {
  text-decoration: underline;
}

.tight {
  gap: 4px;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  z-index: 40;
}

.modal {
  width: min(560px, 100%);
  max-height: calc(100vh - 80px);
  overflow: auto;
}

.submission-confirm-modal {
  gap: var(--space-2);
}

.submission-confirm-modal h4 {
  margin: 0;
}

.modal-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.submission-editor textarea,
.ballot-meta-grid textarea {
  resize: vertical;
  min-height: 100px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace);
}
</style>
