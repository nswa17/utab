<template>
  <section class="stack">
    <LoadingState v-if="isSectionLoading" />

    <template v-else-if="tournament && activeSection === 'overview'">
      <div class="card stack">
        <Field :label="$t('大会名')" required v-slot="{ id, describedBy }">
          <div class="row tournament-name-row">
            <input
              v-model="tournamentForm.name"
              :id="id"
              :aria-describedby="describedBy"
              type="text"
              @keyup.enter="saveTournamentName"
            />
            <Button
              size="sm"
              class="tournament-name-submit"
              :disabled="isLoading || !canSaveTournamentName"
              @click="saveTournamentName"
            >
              {{ $t('更新') }}
            </Button>
          </div>
        </Field>

        <div class="overview-setting-grid">
          <article class="overview-setting-card stack">
            <Field :label="$t('スタイル')" v-slot="{ id, describedBy }">
              <select
                v-model.number="tournamentForm.style"
                :id="id"
                :aria-describedby="describedBy"
              >
                <option v-for="style in styles.styles" :key="style.id" :value="style.id">
                  {{ style.name }}
                </option>
              </select>
            </Field>
          </article>

          <article class="overview-setting-card toggle-setting-card stack">
            <h4>{{ $t('大会を公開') }}</h4>
            <label class="switch-control" :aria-label="$t('大会を公開')">
              <span class="switch-label">{{ $t('非公開') }}</span>
              <ToggleSwitch v-model="isTournamentPublic" :aria-label="$t('大会を公開')" />
              <span class="switch-label">{{ $t('公開') }}</span>
            </label>
          </article>

          <article class="overview-setting-card toggle-setting-card password-setting-card stack">
            <h4>{{ $t('大会パスワード設定') }}</h4>
            <label class="switch-control" :aria-label="$t('大会パスワード設定')">
              <span class="switch-label">{{ $t('不要') }}</span>
              <ToggleSwitch
                v-model="tournamentForm.accessRequired"
                :aria-label="$t('大会パスワード設定')"
              />
              <span class="switch-label">{{ $t('設定') }}</span>
            </label>
            <input
              v-model="tournamentForm.accessPassword"
              :class="{ 'is-disabled': !tournamentForm.accessRequired }"
              :aria-label="$t('大会パスワード')"
              type="text"
              autocomplete="new-password"
              :disabled="!tournamentForm.accessRequired"
            />
          </article>
        </div>
        <article class="overview-setting-card notice-setting-card stack">
          <Field :label="$t('重要なお知らせ（Markdown形式対応）')" v-slot="{ id, describedBy }">
            <div class="markdown-grid">
              <textarea
                v-model="tournamentForm.infoText"
                :id="id"
                :aria-describedby="describedBy"
                rows="10"
              />
              <div class="markdown-preview">
                <div class="muted small">{{ $t('プレビュー') }}</div>
                <div
                  v-if="tournamentForm.infoText.trim().length > 0"
                  class="markdown-content"
                  v-html="infoPreviewHtml"
                ></div>
                <p v-else class="muted">{{ $t('プレビューはここに表示されます。') }}</p>
              </div>
            </div>
          </Field>
          <div class="row notice-actions">
            <Button
              size="sm"
              :disabled="isLoading || isSavingNotice || !canSaveTournamentNotice"
              @click="saveTournamentNotice"
            >
              {{ isSavingNotice ? $t('更新中...') : $t('重要なお知らせを更新') }}
            </Button>
            <span v-if="noticeSaved" class="muted small">{{ $t('更新しました。') }}</span>
          </div>
          <p v-if="noticeSaveError" class="error small">{{ noticeSaveError }}</p>
        </article>

        <article class="overview-setting-card overview-setting-card--collapsible stack">
          <div class="row overview-collapse-head">
            <button
              type="button"
              class="overview-collapse-trigger"
              :aria-expanded="showTournamentBreakSettings ? 'true' : 'false'"
              @click="showTournamentBreakSettings = !showTournamentBreakSettings"
            >
              <span class="overview-collapse-icon" aria-hidden="true">{{
                showTournamentBreakSettings ? '−' : '+'
              }}</span>
              <span class="overview-collapse-title">{{ $t('ブレイク設定') }}</span>
            </button>
            <span v-if="!hasBreakRounds" class="muted small overview-collapse-note">
              {{ $t('ブレイクラウンド未設定のため無効') }}
            </span>
          </div>
          <div v-if="showTournamentBreakSettings" class="stack">
            <BreakPolicyEditor
              v-model:source="tournamentBreakForm.source"
              v-model:size="tournamentBreakForm.size"
              v-model:cutoff-tie-policy="tournamentBreakForm.cutoff_tie_policy"
              v-model:seeding="tournamentBreakForm.seeding"
              :show-source="false"
              :disabled="isLoading || isSavingTournamentBreak"
            />
            <div class="row notice-actions">
              <Button
                size="sm"
                :disabled="isLoading || isSavingTournamentBreak || !hasBreakRounds"
                @click="saveTournamentBreakSettings"
              >
                {{ isSavingTournamentBreak ? $t('更新中...') : $t('ブレイク設定を保存') }}
              </Button>
              <span v-if="tournamentBreakSaved" class="muted small">{{ $t('更新しました。') }}</span>
            </div>
            <p v-if="tournamentBreakSaveError" class="error small">
              {{ tournamentBreakSaveError }}
            </p>
          </div>
        </article>

        <article
          class="overview-setting-card overview-setting-card--collapsible ranking-priority-card stack"
        >
          <button
            type="button"
            class="overview-collapse-trigger"
            :aria-expanded="showTournamentTeamRankingSettings ? 'true' : 'false'"
            @click="showTournamentTeamRankingSettings = !showTournamentTeamRankingSettings"
          >
            <span class="overview-collapse-icon" aria-hidden="true">{{
              showTournamentTeamRankingSettings ? '−' : '+'
            }}</span>
            <span class="overview-collapse-title">{{ $t('チーム順位優先度設定') }}</span>
          </button>
          <div v-if="showTournamentTeamRankingSettings" class="stack">
            <p class="muted small">
              {{ $t('順位が同点のときにどの指標を先に比較するかを決めます。') }}
            </p>
            <RankingPriorityEditor
              v-model="tournamentTeamRankingForm.order"
              :title="$t('チーム順位優先度設定')"
              :help-text="$t('使用する基準を有効化し、上から優先順に並べてください。')"
              :options="teamRankingPriorityOptions"
              :disabled="isLoading || isSavingTournamentTeamRanking"
              :min-active="1"
              :active-title="$t('使用する基準')"
              :inactive-title="$t('不使用')"
              :inactive-empty-text="$t('不使用の指標はありません。')"
              :active-action-label="$t('除外')"
            />
            <div class="row notice-actions">
              <Button
                size="sm"
                :disabled="isLoading || isSavingTournamentTeamRanking"
                @click="saveTournamentTeamRankingSettings"
              >
                {{
                  isSavingTournamentTeamRanking
                    ? $t('更新中...')
                    : $t('チーム順位優先度を保存')
                }}
              </Button>
              <span v-if="tournamentTeamRankingSaved" class="muted small">{{
                $t('更新しました。')
              }}</span>
            </div>
            <p v-if="tournamentTeamRankingSaveError" class="error small">
              {{ tournamentTeamRankingSaveError }}
            </p>
          </div>
        </article>

        <article
          class="overview-setting-card overview-setting-card--collapsible ranking-priority-card stack"
        >
          <button
            type="button"
            class="overview-collapse-trigger"
            :aria-expanded="showTournamentAdjudicatorRankingSettings ? 'true' : 'false'"
            @click="
              showTournamentAdjudicatorRankingSettings = !showTournamentAdjudicatorRankingSettings
            "
          >
            <span class="overview-collapse-icon" aria-hidden="true">{{
              showTournamentAdjudicatorRankingSettings ? '−' : '+'
            }}</span>
            <span class="overview-collapse-title">{{ $t('ジャッジ順位優先度設定') }}</span>
          </button>
          <div v-if="showTournamentAdjudicatorRankingSettings" class="stack">
            <p class="muted small">
              {{ $t('順位が同点のときにどの指標を先に比較するかを決めます。') }}
            </p>
            <RankingPriorityEditor
              v-model="tournamentAdjudicatorRankingForm.order"
              :title="$t('ジャッジ順位優先度設定')"
              :help-text="$t('使用する基準を有効化し、上から優先順に並べてください。')"
              :options="adjudicatorRankingPriorityOptions"
              :disabled="isLoading || isSavingTournamentAdjudicatorRanking"
              :min-active="1"
              :active-title="$t('使用する基準')"
              :inactive-title="$t('不使用')"
              :inactive-empty-text="$t('不使用の指標はありません。')"
              :active-action-label="$t('除外')"
            />
            <div class="row notice-actions">
              <Button
                size="sm"
                :disabled="isLoading || isSavingTournamentAdjudicatorRanking"
                @click="saveTournamentAdjudicatorRankingSettings"
              >
                {{
                  isSavingTournamentAdjudicatorRanking
                    ? $t('更新中...')
                    : $t('ジャッジ順位優先度を保存')
                }}
              </Button>
              <span v-if="tournamentAdjudicatorRankingSaved" class="muted small">{{
                $t('更新しました。')
              }}</span>
            </div>
            <p v-if="tournamentAdjudicatorRankingSaveError" class="error small">
              {{ tournamentAdjudicatorRankingSaveError }}
            </p>
          </div>
        </article>
      </div>

      <article class="card stack setup-rounds-card">
        <div class="row setup-rounds-head">
          <h4>{{ $t('新規ラウンド作成') }}</h4>
        </div>
        <form class="grid setup-round-form" @submit.prevent="createRoundFromSetup">
          <Field
            class="setup-round-number-field"
            :label="$t('ラウンド番号')"
            required
            v-slot="{ id, describedBy }"
          >
            <input
              v-model.number="setupRoundForm.round"
              :id="id"
              :aria-describedby="describedBy"
              type="number"
              min="1"
            />
          </Field>
          <Field class="setup-round-name-field" :label="$t('ラウンド名')" v-slot="{ id, describedBy }">
            <input
              v-model="setupRoundForm.name"
              :id="id"
              :aria-describedby="describedBy"
              type="text"
            />
          </Field>
          <div class="row create-actions">
            <Button type="submit" :disabled="isLoading">{{ $t('追加') }}</Button>
            <Button
              type="button"
              variant="secondary"
              :disabled="isLoading"
              @click="showRoundDefaultsModal = true"
            >
              {{ $t('デフォルト設定') }}
            </Button>
          </div>
        </form>
        <p v-if="setupRoundError" class="error">{{ setupRoundError }}</p>
        <p v-if="setupRoundBreakError" class="error">{{ setupRoundBreakError }}</p>
        <p v-if="tournamentAutosaveText" class="muted small">{{ tournamentAutosaveText }}</p>
        <p v-if="sortedRounds.length === 0" class="muted small">
          {{ $t('ラウンドがまだありません。') }}
        </p>
        <div v-else class="stack setup-round-list">
          <div v-for="round in sortedRounds" :key="round._id" class="stack setup-round-item">
            <div class="row setup-round-item-head">
              <div class="stack tight">
                <strong>{{ round.name || $t('ラウンド {round}', { round: round.round }) }}</strong>
                <span class="muted small"
                  >{{ $t('ラウンド番号') }}: {{ round.round }} / {{ roundTypeLabel(round) }}</span
                >
              </div>
              <Button
                variant="danger"
                size="sm"
                :disabled="isLoading"
                @click="requestRemoveRoundFromSetup(String(round._id))"
              >
                {{ $t('削除') }}
              </Button>
            </div>

            <section class="card soft stack setup-round-motion-panel">
              <RoundMotionEditor
                :tournament-id="tournamentId"
                :round-id="String(round._id)"
                :saved-motion="Array.isArray(round.motions) ? String(round.motions[0] ?? '') : ''"
                :disabled="roundPublicationBusy"
              >
                <template #status>
                  <div class="row setup-round-status-row">
                    <div class="setup-round-switches-wrap">
                      <RoundPublicationSwitches
                        :busy="roundPublicationBusy"
                        :show-break-round-switch="true"
                        :break-round-enabled="setupRoundBreakEnabled(round)"
                        :break-round-disabled="isLoading || setupRoundBreakUpdating"
                        :break-round-label="$t('ブレイクラウンド')"
                        :motion-opened="Boolean(round.motionOpened)"
                        :motion-label="$t('モーション公開')"
                        :team-allocation-opened="setupRoundTeamAllocationOpened(round.round)"
                        :team-allocation-disabled="!setupRoundHasDraw(round.round)"
                        :team-allocation-label="$t('チーム割り当て')"
                        :adjudicator-allocation-opened="
                          setupRoundAdjudicatorAllocationOpened(round.round)
                        "
                        :adjudicator-allocation-disabled="!setupRoundHasDraw(round.round)"
                        :adjudicator-allocation-label="$t('ジャッジ割り当て')"
                        @update:motion-opened="
                          (checked) => onSetupMotionOpenedChange(round, checked)
                        "
                        @update:break-round-enabled="
                          (checked) => onSetupRoundBreakEnabledChange(round, checked)
                        "
                        @update:team-allocation-opened="
                          (checked) => onSetupTeamAllocationChange(round, checked)
                        "
                        @update:adjudicator-allocation-opened="
                          (checked) => onSetupAdjudicatorAllocationChange(round, checked)
                        "
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="setup-round-details-open-button"
                      :aria-pressed="isSetupRoundDetailsOpen(String(round._id)) ? 'true' : 'false'"
                      :disabled="isLoading"
                      @click="openSetupRoundDetails(round)"
                    >
                      {{ $t('ラウンド詳細設定') }}
                    </Button>
                  </div>
                </template>
              </RoundMotionEditor>
            </section>

            <div
              v-if="isSetupRoundDetailsOpen(String(round._id))"
              class="modal-backdrop"
              role="presentation"
              @click.self="closeSetupRoundDetails(String(round._id))"
            >
              <div
                class="modal card stack entity-edit-modal setup-round-details-modal"
                role="dialog"
                aria-modal="true"
              >
                <div class="row">
                  <strong>{{ $t('ラウンド詳細設定') }}</strong>
                  <Button
                    variant="ghost"
                    size="sm"
                    @click="closeSetupRoundDetails(String(round._id))"
                    >{{ $t('閉じる') }}</Button
                  >
                </div>
                <p class="muted small">
                  {{ round.name || $t('ラウンド {round}', { round: round.round }) }}
                </p>
                <div class="stack setup-round-details-body">
                  <section class="stack setup-round-basic-panel">
                    <div v-if="setupRoundEditingId === round._id" class="stack">
                      <div class="grid setup-round-edit-grid">
                        <Field :label="$t('ラウンド番号')" v-slot="{ id, describedBy }">
                          <input
                            v-model.number="setupRoundEditForm.round"
                            :id="id"
                            :aria-describedby="describedBy"
                            type="number"
                            min="1"
                          />
                        </Field>
                        <Field :label="$t('ラウンド名')" v-slot="{ id, describedBy }">
                          <input
                            v-model="setupRoundEditForm.name"
                            :id="id"
                            :aria-describedby="describedBy"
                            type="text"
                          />
                        </Field>
                      </div>
                      <section class="stack setup-round-config-group">
                        <RoundOptionEditor
                          v-model:evaluate-from-adjudicators="
                            setupRoundEditForm.userDefinedData.evaluate_from_adjudicators
                          "
                          v-model:evaluate-from-teams="
                            setupRoundEditForm.userDefinedData.evaluate_from_teams
                          "
                          v-model:chairs-always-evaluated="
                            setupRoundEditForm.userDefinedData.chairs_always_evaluated
                          "
                          v-model:evaluator-in-team="
                            setupRoundEditForm.userDefinedData.evaluator_in_team
                          "
                          v-model:no-speaker-score="
                            setupRoundEditForm.userDefinedData.no_speaker_score
                          "
                          v-model:allow-low-tie-win="
                            setupRoundEditForm.userDefinedData.allow_low_tie_win
                          "
                          v-model:score-by-matter-manner="
                            setupRoundEditForm.userDefinedData.score_by_matter_manner
                          "
                          v-model:tie-points="setupRoundEditForm.compile.options.tie_points"
                          v-model:poi="setupRoundEditForm.userDefinedData.poi"
                          v-model:best="setupRoundEditForm.userDefinedData.best"
                          :lock-allow-low-tie-win="setupRoundEditForm.breakEnabled"
                          :disabled="isLoading"
                        />
                      </section>
                      <section class="stack setup-round-config-group">
                        <CompileOptionsEditor
                          v-model:source-rounds="setupRoundEditForm.compile.source_rounds"
                          v-model:winner-policy="setupRoundEditForm.compile.options.winner_policy"
                          v-model:tie-points="setupRoundEditForm.compile.options.tie_points"
                          v-model:merge-policy="
                            setupRoundEditForm.compile.options.duplicate_normalization.merge_policy
                          "
                          v-model:poi-aggregation="
                            setupRoundEditForm.compile.options.duplicate_normalization
                              .poi_aggregation
                          "
                          v-model:best-aggregation="
                            setupRoundEditForm.compile.options.duplicate_normalization
                              .best_aggregation
                          "
                          v-model:missing-data-policy="
                            setupRoundEditForm.compile.options.missing_data_policy
                          "
                          :show-winner-scoring="false"
                          :show-source-rounds="false"
                          :show-merge-and-missing="false"
                          :source-round-options="
                            compileSourceRoundSelectOptions(Number(setupRoundEditForm.round))
                          "
                          :disabled="isLoading"
                        />
                      </section>
                      <section
                        v-if="setupRoundEditForm.breakEnabled"
                        class="stack setup-round-config-group"
                      >
                        <BreakPolicyEditor
                          v-model:source="setupRoundEditForm.break.source"
                          v-model:size="setupRoundEditForm.break.size"
                          v-model:cutoff-tie-policy="setupRoundEditForm.break.cutoff_tie_policy"
                          v-model:seeding="setupRoundEditForm.break.seeding"
                          :disabled="isLoading"
                        />
                      </section>
                      <div class="row setup-round-item-actions">
                        <Button
                          size="sm"
                          :disabled="isLoading"
                          @click="saveEditRoundFromSetup(round)"
                        >
                          {{ $t('保存') }}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          :disabled="isLoading"
                          @click="closeSetupRoundDetails(String(round._id))"
                        >
                          {{ $t('キャンセル') }}
                        </Button>
                      </div>
                      <p v-if="setupRoundEditError" class="error small">
                        {{ setupRoundEditError }}
                      </p>
                    </div>
                    <p v-else class="muted small">
                      {{ $t('ラウンド番号') }}: {{ round.round }} / {{ roundTypeLabel(round) }}
                    </p>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="card stack overview-qr-card">
        <div v-if="participantUrl" class="qr-grid">
          <div class="stack qr-content">
            <h4>{{ $t('参加者アクセス用QRコード') }}</h4>
            <div class="muted small">{{ $t('大会アクセスURL') }}</div>
            <code class="qr-url">{{ participantUrl }}</code>
            <div class="row qr-actions">
              <Button class="qr-copy-button" variant="secondary" size="sm" @click="copyParticipantUrl">
                {{ copyStatus === 'copied' ? $t('コピーしました。') : $t('URLをコピー') }}
              </Button>
            </div>
            <p v-if="copyStatus === 'error'" class="error small">{{ copyError }}</p>
          </div>
          <div class="qr-box">
            <LoadingState v-if="qrLoading" />
            <img
              v-else-if="qrCodeDataUrl"
              class="qr-image"
              :src="qrCodeDataUrl"
              :alt="$t('QRコード')"
            />
            <p v-else class="muted small">{{ $t('QRコードを生成できませんでした。') }}</p>
            <p v-if="qrError" class="error">{{ qrError }}</p>
          </div>
        </div>
        <div v-else class="stack qr-content">
          <h4>{{ $t('参加者アクセス用QRコード') }}</h4>
        </div>
      </article>
    </template>

    <section v-else-if="activeSection === 'data'" class="stack entity-panel">
      <p v-if="csvError" class="error">{{ csvError }}</p>

      <div class="row entity-switch">
        <button
          v-for="tab in entityTabs"
          :key="tab.key"
          type="button"
          class="entity-tab"
          :class="{ active: activeEntityTab === tab.key }"
          @click="activeEntityTab = tab.key"
        >
          <span class="entity-tab-step">{{ `STEP ${tab.step}` }}</span>
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <div class="card stack" v-show="activeEntityTab === 'teams'">
        <section class="stack entity-block">
          <h4 class="entity-block-title">{{ $t('新規追加') }}</h4>
          <section class="stack block-panel">
            <form class="grid team-form-grid" @submit.prevent="handleCreateTeam">
              <Field
                class="team-name-field"
                :label="$t('チーム名')"
                required
                v-slot="{ id, describedBy }"
              >
                <input
                  v-model="teamForm.name"
                  type="text"
                  :id="id"
                  :aria-describedby="describedBy"
                />
              </Field>
              <Field class="full" :label="$t('コンフリクトグループ')">
                <div class="stack relation-group">
                  <input
                    v-model="teamInstitutionSearch"
                    type="text"
                    :placeholder="$t('コンフリクトグループ名で検索')"
                  />
                  <div class="relation-picker">
                    <template v-if="groupedTeamInstitutionOptions.length > 0">
                      <div
                        v-for="group in groupedTeamInstitutionOptions"
                        :key="`team-inst-${group.category}`"
                        class="relation-subgroup"
                      >
                        <p class="muted small relation-subgroup-header">
                          <span class="relation-subgroup-title">{{ group.label }}</span>
                          <span>{{ $t('{count}件', { count: group.items.length }) }}</span>
                        </p>
                        <label
                          v-for="inst in group.items"
                          :key="inst._id"
                          class="row small relation-item"
                        >
                          <input v-model="teamInstitutionIds" type="checkbox" :value="inst._id" />
                          <span>{{ inst.name }}</span>
                        </label>
                      </div>
                    </template>
                    <p v-else class="muted small relation-empty">
                      {{ $t('該当するコンフリクトグループがありません。') }}
                    </p>
                  </div>
                  <p class="muted small">
                    {{ $t('選択済み: {count}件', { count: teamInstitutionIds.length }) }}
                  </p>
                </div>
              </Field>
              <Field
                class="full"
                :label="$t('既存スピーカーから選択')"
                v-slot="{ id, describedBy }"
              >
                <div class="stack relation-group">
                  <input
                    v-model="teamSpeakerSearch"
                    type="text"
                    :id="id"
                    :aria-describedby="describedBy"
                    :placeholder="$t('スピーカー名で絞り込み')"
                  />
                  <div class="relation-picker">
                    <template v-if="filteredTeamSpeakerOptions.length > 0">
                      <label
                        v-for="speaker in filteredTeamSpeakerOptions"
                        :key="speaker._id"
                        class="row small relation-item"
                      >
                        <input
                          v-model="teamSelectedSpeakerIds"
                          type="checkbox"
                          :value="speaker._id"
                        />
                        <span>{{ speaker.name }}</span>
                      </label>
                    </template>
                    <p v-else class="muted small relation-empty">
                      {{ $t('該当するスピーカーがありません。') }}
                    </p>
                  </div>
                  <p class="muted small">
                    {{ $t('選択済み: {count}名', { count: teamSelectedSpeakerIds.length }) }}
                  </p>
                </div>
              </Field>
              <div class="row entity-submit-row">
                <Button type="submit" size="sm" :disabled="teams.loading">{{ $t('追加') }}</Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  :disabled="teams.loading"
                  @click="openEntityImportModal('teams')"
                >
                  {{ $t('CSV取り込み') }}
                </Button>
              </div>
            </form>
          </section>
        </section>

        <section class="stack entity-block">
          <Field :label="$t('検索')" v-slot="{ id, describedBy }">
            <input
              v-model="teamSearch"
              :id="id"
              :aria-describedby="describedBy"
              :placeholder="$t('名前/コンフリクトグループ/スピーカーで検索')"
            />
          </Field>
          <p v-if="teams.error" class="error">{{ teams.error }}</p>
          <ul class="list compact">
            <li v-for="team in visibleTeams" :key="team._id" class="list-item entity-list-item">
              <div class="entity-primary">
                <strong>{{ team.name }}</strong>
                <span class="muted small entity-inline-meta">
                  {{ teamInstitutionLabel(team) || $t('コンフリクトグループなし') }}
                </span>
              </div>
              <div class="muted entity-secondary">
                {{ teamSpeakerNames(team).join(', ') }}
              </div>
              <div class="row">
                <Button variant="ghost" size="sm" @click="toggleEntityInlineEdit('team', team)">
                  {{ isEntityInlineEditing('team', team._id) ? $t('閉じる') : $t('編集') }}
                </Button>
                <Button variant="danger" size="sm" @click="removeTeam(team._id)">
                  {{ $t('削除') }}
                </Button>
              </div>
              <div v-if="isEntityInlineEditing('team', team._id)" class="entity-inline-editor stack">
                <div class="inline-edit-row">
                  <label class="inline-control inline-control--grow">
                    <span class="inline-control-label">{{ $t('名前') }}</span>
                    <input v-model="entityForm.name" type="text" />
                  </label>
                </div>
                <div v-if="detailRows.length > 0" class="stack entity-round-details">
                  <div v-for="row in detailRows" :key="`team-inline-round-${row.r}`" class="detail-row">
                    <div class="row detail-row-head">
                      <button
                        type="button"
                        class="round-collapse-toggle"
                        @click="toggleRoundDetailExpanded(Number(row.r))"
                      >
                        <span>{{ isRoundDetailExpanded(Number(row.r)) ? '−' : '+' }}</span>
                        <strong>{{ $t('ラウンド {round}', { round: row.r }) }}</strong>
                      </button>
                      <label class="row small round-detail-switch">
                        <ToggleSwitch
                          v-model="row.available"
                          :aria-label="$t('ラウンド {round} を有効化', { round: row.r })"
                        />
                        <span class="muted small">{{ $t('有効') }}</span>
                      </label>
                    </div>
                    <div v-if="isRoundDetailExpanded(Number(row.r))" class="row round-detail-inline-line">
                      <label class="stack round-detail-inline-field">
                        <span class="field-label">{{ $t('コンフリクトグループ') }}</span>
                        <div class="relation-picker compact-relation-picker">
                          <template v-if="groupedRoundDetailInstitutionOptions.length > 0">
                            <div
                              v-for="group in groupedRoundDetailInstitutionOptions"
                              :key="`team-inline-round-inst-group-${row.r}-${group.category}`"
                              class="relation-subgroup"
                            >
                              <p class="muted small relation-subgroup-header">
                                <span class="relation-subgroup-title">{{ group.label }}</span>
                                <span>{{ $t('{count}件', { count: group.items.length }) }}</span>
                              </p>
                              <label
                                v-for="inst in group.items"
                                :key="`team-inline-inst-${row.r}-${inst._id}`"
                                class="row small relation-item relation-choice"
                              >
                                <input v-model="row.conflicts" type="checkbox" :value="inst._id" />
                                <span>{{ inst.name }}</span>
                              </label>
                            </div>
                          </template>
                          <p v-else class="muted small relation-empty">{{ $t('候補がありません。') }}</p>
                        </div>
                      </label>
                      <label class="stack round-detail-inline-field">
                        <span class="field-label">{{ $t('スピーカー') }}</span>
                        <div class="relation-picker compact-relation-picker">
                          <label
                            v-for="speaker in roundDetailSpeakerOptions"
                            :key="`team-inline-speaker-${row.r}-${speaker._id}`"
                            class="row small relation-item relation-choice"
                          >
                            <input v-model="row.speakers" type="checkbox" :value="speaker._id" />
                            <span>{{ speaker.name }}</span>
                          </label>
                          <p v-if="roundDetailSpeakerOptions.length === 0" class="muted small relation-empty">
                            {{ $t('候補がありません。') }}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
                <div class="row modal-actions">
                  <Button variant="ghost" size="sm" @click="cancelEditEntity">{{ $t('取消') }}</Button>
                  <Button size="sm" @click="saveEntityEdit">{{ $t('更新') }}</Button>
                </div>
              </div>
            </li>
          </ul>
          <Button
            v-if="filteredTeams.length > visibleTeams.length"
            variant="ghost"
            size="sm"
            @click="teamLimit += 20"
          >
            {{ $t('もっと見る') }}
          </Button>
        </section>
      </div>

      <div class="card stack" v-show="activeEntityTab === 'adjudicators'">
        <section class="stack entity-block">
          <h4 class="entity-block-title">{{ $t('新規追加') }}</h4>
          <section class="stack block-panel">
            <form class="grid aligned-field-grid" @submit.prevent="handleCreateAdjudicator">
              <Field :label="$t('名前')" required v-slot="{ id, describedBy }">
                <input
                  v-model="adjudicatorForm.name"
                  type="text"
                  :id="id"
                  :aria-describedby="describedBy"
                />
              </Field>
              <Field :label="$t('事前評価')" :help="$t('推奨範囲: 0〜10')">
                <template #label-suffix>
                  <HelpTip
                    :text="
                      $t(
                        '事前評価は大会開始前の参考評価です。自動割り当ての優先度計算に利用されます。'
                      )
                    "
                  />
                </template>
                <template #default="{ id, describedBy }">
                  <input
                    v-model.number="adjudicatorForm.preev"
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    :id="id"
                    :aria-describedby="describedBy"
                  />
                </template>
              </Field>
              <div class="stack full relation-group">
                <span class="field-label">{{ $t('コンフリクトグループ') }}</span>
                <input
                  v-model="adjudicatorInstitutionSearch"
                  type="text"
                  :placeholder="$t('コンフリクトグループ名で検索')"
                />
                <div class="relation-picker">
                  <template v-if="groupedAdjudicatorInstitutionOptions.length > 0">
                    <div
                      v-for="group in groupedAdjudicatorInstitutionOptions"
                      :key="group.category"
                      class="relation-subgroup"
                    >
                      <p class="muted small relation-subgroup-header">
                        <span class="relation-subgroup-title">{{ group.label }}</span>
                        <span>{{ $t('{count}件', { count: group.items.length }) }}</span>
                      </p>
                      <label
                        v-for="inst in group.items"
                        :key="inst._id"
                        class="row small relation-item"
                      >
                        <input
                          v-model="adjudicatorInstitutionIds"
                          type="checkbox"
                          :value="inst._id"
                        />
                        <span>{{ inst.name }}</span>
                      </label>
                    </div>
                  </template>
                  <p v-else class="muted small relation-empty">
                    {{ $t('該当するコンフリクトグループがありません。') }}
                  </p>
                </div>
                <p class="muted small">
                  {{ $t('選択済み: {count}件', { count: adjudicatorInstitutionIds.length }) }}
                </p>
              </div>
              <div class="stack full relation-group">
                <span class="field-label">{{ $t('コンフリクトチーム') }}</span>
                <input
                  v-model="adjudicatorConflictSearch"
                  type="text"
                  :placeholder="$t('検索してチームを絞り込む')"
                />
                <div class="relation-picker">
                  <template v-if="filteredAdjudicatorConflictTeams.length > 0">
                    <label
                      v-for="team in filteredAdjudicatorConflictTeams"
                      :key="team._id"
                      class="row small relation-item"
                    >
                      <input v-model="adjudicatorConflictIds" type="checkbox" :value="team._id" />
                      <span>{{ team.name }}</span>
                    </label>
                  </template>
                  <p v-else class="muted small relation-empty">
                    {{ $t('該当するチームがありません。') }}
                  </p>
                </div>
              </div>
              <div class="row entity-submit-row">
                <Button type="submit" size="sm" :disabled="adjudicators.loading">{{
                  $t('追加')
                }}</Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  :disabled="adjudicators.loading"
                  @click="openEntityImportModal('adjudicators')"
                >
                  {{ $t('CSV取り込み') }}
                </Button>
              </div>
            </form>
          </section>
        </section>

        <section class="stack entity-block">
          <Field :label="$t('検索')" v-slot="{ id, describedBy }">
            <input
              v-model="adjudicatorSearch"
              :id="id"
              :aria-describedby="describedBy"
              :placeholder="$t('名前で検索')"
            />
          </Field>
          <p v-if="adjudicators.error" class="error">{{ adjudicators.error }}</p>
          <ul class="list compact">
            <li
              v-for="adj in visibleAdjudicators"
              :key="adj._id"
              class="list-item entity-list-item"
            >
              <div class="entity-primary">
                <strong>{{ adj.name }}</strong>
                <span class="muted small entity-inline-meta">{{
                  adjudicatorInstitutionsLabel(adj)
                }}</span>
              </div>
              <div class="muted entity-secondary">
                {{ $t('事前評価') }} {{ adj.preev ?? 0 }}
              </div>
              <div class="row">
                <Button
                  variant="ghost"
                  size="sm"
                  @click="toggleEntityInlineEdit('adjudicator', adj)"
                >
                  {{
                    isEntityInlineEditing('adjudicator', adj._id) ? $t('閉じる') : $t('編集')
                  }}
                </Button>
                <Button variant="danger" size="sm" @click="removeAdjudicator(adj._id)">
                  {{ $t('削除') }}
                </Button>
              </div>
              <div
                v-if="isEntityInlineEditing('adjudicator', adj._id)"
                class="entity-inline-editor stack"
              >
                <div class="inline-edit-row">
                  <label class="inline-control inline-control--grow">
                    <span class="inline-control-label">{{ $t('名前') }}</span>
                    <input v-model="entityForm.name" type="text" />
                  </label>
                  <label class="inline-control">
                    <span class="inline-control-label">{{ $t('事前評価') }}</span>
                    <div class="number-stepper">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        @click="adjustEntityFormScore('preev', -0.5)"
                      >
                        -
                      </Button>
                      <input v-model.number="entityForm.preev" type="number" min="0" max="10" step="0.1" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        @click="adjustEntityFormScore('preev', 0.5)"
                      >
                        +
                      </Button>
                    </div>
                  </label>
                </div>
                <div v-if="detailRows.length > 0" class="stack entity-round-details">
                  <div v-for="row in detailRows" :key="`adj-inline-round-${row.r}`" class="detail-row">
                    <div class="row detail-row-head">
                      <button
                        type="button"
                        class="round-collapse-toggle"
                        @click="toggleRoundDetailExpanded(Number(row.r))"
                      >
                        <span>{{ isRoundDetailExpanded(Number(row.r)) ? '−' : '+' }}</span>
                        <strong>{{ $t('ラウンド {round}', { round: row.r }) }}</strong>
                      </button>
                      <label class="row small round-detail-switch">
                        <ToggleSwitch
                          v-model="row.available"
                          :aria-label="$t('ラウンド {round} を有効化', { round: row.r })"
                        />
                        <span class="muted small">{{ $t('有効') }}</span>
                      </label>
                    </div>
                    <div v-if="isRoundDetailExpanded(Number(row.r))" class="row round-detail-inline-line">
                      <label class="stack round-detail-inline-field">
                        <span class="field-label">{{ $t('コンフリクトグループ') }}</span>
                        <div class="relation-picker compact-relation-picker">
                          <template v-if="groupedRoundDetailInstitutionOptions.length > 0">
                            <div
                              v-for="group in groupedRoundDetailInstitutionOptions"
                              :key="`adj-inline-round-inst-group-${row.r}-${group.category}`"
                              class="relation-subgroup"
                            >
                              <p class="muted small relation-subgroup-header">
                                <span class="relation-subgroup-title">{{ group.label }}</span>
                                <span>{{ $t('{count}件', { count: group.items.length }) }}</span>
                              </p>
                              <label
                                v-for="inst in group.items"
                                :key="`adj-inline-inst-${row.r}-${inst._id}`"
                                class="row small relation-item relation-choice"
                              >
                                <input v-model="row.conflicts" type="checkbox" :value="inst._id" />
                                <span>{{ inst.name }}</span>
                              </label>
                            </div>
                          </template>
                          <p v-else class="muted small relation-empty">{{ $t('候補がありません。') }}</p>
                        </div>
                      </label>
                      <label class="stack round-detail-inline-field">
                        <span class="field-label">{{ $t('コンフリクトチーム') }}</span>
                        <div class="relation-picker compact-relation-picker">
                          <label
                            v-for="teamOption in roundDetailTeamOptions"
                            :key="`adj-inline-team-${row.r}-${teamOption._id}`"
                            class="row small relation-item relation-choice"
                          >
                            <input
                              v-model="row.conflict_teams"
                              type="checkbox"
                              :value="teamOption._id"
                            />
                            <span>{{ teamOption.name }}</span>
                          </label>
                          <p v-if="roundDetailTeamOptions.length === 0" class="muted small relation-empty">
                            {{ $t('候補がありません。') }}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
                <div class="row modal-actions">
                  <Button variant="ghost" size="sm" @click="cancelEditEntity">{{ $t('取消') }}</Button>
                  <Button size="sm" @click="saveEntityEdit">{{ $t('更新') }}</Button>
                </div>
              </div>
            </li>
          </ul>
          <Button
            v-if="filteredAdjudicators.length > visibleAdjudicators.length"
            variant="ghost"
            size="sm"
            @click="adjudicatorLimit += 20"
          >
            {{ $t('もっと見る') }}
          </Button>
        </section>
      </div>

      <div class="card stack" v-show="activeEntityTab === 'venues'">
        <section class="stack entity-block">
          <h4 class="entity-block-title">{{ $t('新規追加') }}</h4>
          <section class="stack block-panel">
            <form class="grid" @submit.prevent="handleCreateVenue">
              <Field :label="$t('会場名')" required v-slot="{ id, describedBy }">
                <input
                  v-model="venueForm.name"
                  type="text"
                  :id="id"
                  :aria-describedby="describedBy"
                />
              </Field>
              <div class="availability-control">
                <label class="row small">
                  <input v-model="venueForm.available" type="checkbox" />
                  <span>{{ $t('使用可能（デフォルト値）') }}</span>
                </label>
              </div>
              <div class="row entity-submit-row">
                <Button type="submit" size="sm" :disabled="venues.loading">{{ $t('追加') }}</Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  :disabled="venues.loading"
                  @click="openEntityImportModal('venues')"
                >
                  {{ $t('CSV取り込み') }}
                </Button>
              </div>
            </form>
          </section>
        </section>

        <section class="stack entity-block">
          <Field :label="$t('検索')" v-slot="{ id, describedBy }">
            <input
              v-model="venueSearch"
              :id="id"
              :aria-describedby="describedBy"
              :placeholder="$t('会場名で検索')"
            />
          </Field>
          <p v-if="venues.error" class="error">{{ venues.error }}</p>
          <ul class="list compact">
            <li v-for="venue in visibleVenues" :key="venue._id" class="list-item entity-list-item">
              <div>
                <strong>{{ venue.name }}</strong>
              </div>
              <div class="row">
                <Button variant="ghost" size="sm" @click="toggleEntityInlineEdit('venue', venue)">
                  {{ isEntityInlineEditing('venue', venue._id) ? $t('閉じる') : $t('編集') }}
                </Button>
                <Button variant="danger" size="sm" @click="removeVenue(venue._id)">
                  {{ $t('削除') }}
                </Button>
              </div>
              <div v-if="isEntityInlineEditing('venue', venue._id)" class="entity-inline-editor stack">
                <div class="inline-edit-row">
                  <label class="inline-control inline-control--grow">
                    <span class="inline-control-label">{{ $t('名前') }}</span>
                    <input v-model="entityForm.name" type="text" />
                  </label>
                </div>
                <div v-if="detailRows.length > 0" class="stack entity-round-details">
                  <div v-for="row in detailRows" :key="`venue-inline-round-${row.r}`" class="detail-row">
                    <div class="row detail-row-head detail-row-head--compact">
                      <strong>{{ $t('ラウンド {round}', { round: row.r }) }}</strong>
                      <label class="row small round-detail-switch">
                        <ToggleSwitch
                          v-model="row.available"
                          :aria-label="$t('ラウンド {round} を有効化', { round: row.r })"
                        />
                        <span class="muted small">{{ $t('有効') }}</span>
                      </label>
                      <label class="row small round-priority-inline">
                        <span class="field-label">{{ $t('優先度') }}</span>
                        <div class="number-stepper">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            @click="adjustDetailPriority(row, -1)"
                          >
                            -
                          </Button>
                          <input
                            v-model.number="row.priority"
                            type="number"
                            min="1"
                            :aria-label="$t('ラウンド {round} の優先度', { round: row.r })"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            @click="adjustDetailPriority(row, 1)"
                          >
                            +
                          </Button>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
                <div class="row modal-actions">
                  <Button variant="ghost" size="sm" @click="cancelEditEntity">{{ $t('取消') }}</Button>
                  <Button size="sm" @click="saveEntityEdit">{{ $t('更新') }}</Button>
                </div>
              </div>
            </li>
          </ul>
          <Button
            v-if="filteredVenues.length > visibleVenues.length"
            variant="ghost"
            size="sm"
            @click="venueLimit += 20"
          >
            {{ $t('もっと見る') }}
          </Button>
        </section>
      </div>

      <div class="card stack" v-show="activeEntityTab === 'speakers'">
        <section class="stack entity-block">
          <h4 class="entity-block-title">{{ $t('新規追加') }}</h4>
          <section class="stack block-panel">
            <form class="grid" @submit.prevent="handleCreateSpeaker">
              <Field :label="$t('スピーカー名')" required v-slot="{ id, describedBy }">
                <input
                  v-model="speakerForm.name"
                  type="text"
                  :id="id"
                  :aria-describedby="describedBy"
                />
              </Field>
              <div class="row entity-submit-row">
                <Button type="submit" size="sm" :disabled="speakers.loading">{{
                  $t('追加')
                }}</Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  :disabled="speakers.loading"
                  @click="openEntityImportModal('speakers')"
                >
                  {{ $t('CSV取り込み') }}
                </Button>
              </div>
            </form>
          </section>
        </section>

        <section class="stack entity-block">
          <Field :label="$t('検索')" v-slot="{ id, describedBy }">
            <input
              v-model="speakerSearch"
              :id="id"
              :aria-describedby="describedBy"
              :placeholder="$t('名前で検索')"
            />
          </Field>
          <p v-if="speakers.error" class="error">{{ speakers.error }}</p>
          <ul class="list compact">
            <li
              v-for="speaker in visibleSpeakers"
              :key="speaker._id"
              class="list-item entity-list-item"
            >
              <div>
                <strong>{{ speaker.name }}</strong>
              </div>
              <div class="row">
                <Button variant="ghost" size="sm" @click="toggleEntityInlineEdit('speaker', speaker)">
                  {{ isEntityInlineEditing('speaker', speaker._id) ? $t('閉じる') : $t('編集') }}
                </Button>
                <Button variant="danger" size="sm" @click="removeSpeaker(speaker._id)">
                  {{ $t('削除') }}
                </Button>
              </div>
              <div v-if="isEntityInlineEditing('speaker', speaker._id)" class="entity-inline-editor stack">
                <div class="inline-edit-row">
                  <label class="inline-control inline-control--grow">
                    <span class="inline-control-label">{{ $t('名前') }}</span>
                    <input v-model="entityForm.name" type="text" />
                  </label>
                </div>
                <div class="row modal-actions">
                  <Button variant="ghost" size="sm" @click="cancelEditEntity">{{ $t('取消') }}</Button>
                  <Button size="sm" @click="saveEntityEdit">{{ $t('更新') }}</Button>
                </div>
              </div>
            </li>
          </ul>
          <Button
            v-if="filteredSpeakers.length > visibleSpeakers.length"
            variant="ghost"
            size="sm"
            @click="speakerLimit += 20"
          >
            {{ $t('もっと見る') }}
          </Button>
        </section>
      </div>

      <div class="card stack" v-show="activeEntityTab === 'institutions'">
        <section class="stack entity-block">
          <h4 class="entity-block-title">{{ $t('新規追加') }}</h4>
          <section class="stack block-panel">
            <form class="grid aligned-field-grid" @submit.prevent="handleCreateInstitution">
              <Field :label="$t('コンフリクトグループ')" required v-slot="{ id, describedBy }">
                <input
                  v-model="institutionForm.name"
                  type="text"
                  :id="id"
                  :aria-describedby="describedBy"
                />
              </Field>
              <Field :label="$t('カテゴリ')">
                <template #label-suffix>
                  <HelpTip
                    :text="
                      $t(
                        'institution / region / league から選択します。競合判定の粒度を揃えるために使います。'
                      )
                    "
                  />
                </template>
                <template #default="{ id, describedBy }">
                  <select
                    v-model="institutionForm.category"
                    :id="id"
                    :aria-describedby="describedBy"
                  >
                    <option
                      v-for="option in institutionCategoryOptions"
                      :key="`institution-category-create-${option.value}`"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </template>
              </Field>
              <Field :label="$t('優先度')" v-slot="{ id, describedBy }">
                <input
                  v-model.number="institutionForm.priority"
                  type="number"
                  min="0"
                  step="0.1"
                  :id="id"
                  :aria-describedby="describedBy"
                />
              </Field>
              <div class="row entity-submit-row">
                <Button type="submit" size="sm" :disabled="institutions.loading">{{
                  $t('追加')
                }}</Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  :disabled="institutions.loading"
                  @click="openEntityImportModal('institutions')"
                >
                  {{ $t('CSV取り込み') }}
                </Button>
              </div>
            </form>
          </section>
        </section>

        <section class="stack entity-block">
          <Field :label="$t('検索')" v-slot="{ id, describedBy }">
            <input
              v-model="institutionSearch"
              :id="id"
              :aria-describedby="describedBy"
              :placeholder="$t('コンフリクトグループ名で検索')"
            />
          </Field>
          <p v-if="institutions.error" class="error">{{ institutions.error }}</p>
          <ul class="list compact">
            <li
              v-for="inst in visibleInstitutions"
              :key="inst._id"
              class="list-item entity-list-item"
            >
              <div class="entity-primary">
                <strong>{{ inst.name }}</strong>
                <span class="muted small entity-inline-meta">
                  {{
                    $t('{category} / 優先度 {priority}', {
                      category: institutionCategoryLabel(inst.category),
                      priority: institutionPriorityValue(inst.priority),
                    })
                  }}
                </span>
              </div>
              <div class="row">
                <Button
                  variant="ghost"
                  size="sm"
                  @click="toggleEntityInlineEdit('institution', inst)"
                >
                  {{ isEntityInlineEditing('institution', inst._id) ? $t('閉じる') : $t('編集') }}
                </Button>
                <Button variant="danger" size="sm" @click="removeInstitution(inst._id)">
                  {{ $t('削除') }}
                </Button>
              </div>
              <div
                v-if="isEntityInlineEditing('institution', inst._id)"
                class="entity-inline-editor stack"
              >
                <div class="inline-edit-row institution-inline-row">
                  <label class="inline-control inline-control--grow">
                    <span class="inline-control-label">{{ $t('名前') }}</span>
                    <input v-model="entityForm.name" type="text" />
                  </label>
                  <label class="inline-control inline-control--grow">
                    <span class="inline-control-label">{{ $t('カテゴリ') }}</span>
                    <select v-model="entityForm.category">
                      <option
                        v-for="option in institutionCategoryOptions"
                        :key="`institution-inline-category-${option.value}`"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                  </label>
                  <label class="inline-control institution-priority-inline">
                    <span class="inline-control-label">{{ $t('優先度') }}</span>
                    <div class="number-stepper">
                      <Button type="button" variant="ghost" size="sm" @click="adjustEntityFormPriority(-0.1)">
                        -
                      </Button>
                      <input
                        v-model.number="entityForm.priority"
                        type="number"
                        min="0"
                        step="0.1"
                        :aria-label="$t('優先度')"
                      />
                      <Button type="button" variant="ghost" size="sm" @click="adjustEntityFormPriority(0.1)">
                        +
                      </Button>
                    </div>
                  </label>
                </div>
                <div class="row modal-actions">
                  <Button variant="ghost" size="sm" @click="cancelEditEntity">{{ $t('取消') }}</Button>
                  <Button size="sm" @click="saveEntityEdit">{{ $t('更新') }}</Button>
                </div>
              </div>
            </li>
          </ul>
          <Button
            v-if="filteredInstitutions.length > visibleInstitutions.length"
            variant="ghost"
            size="sm"
            @click="institutionLimit += 20"
          >
            {{ $t('もっと見る') }}
          </Button>
        </section>
      </div>
    </section>

    <div v-else class="card stack">
      <p class="muted">{{ $t('大会情報が見つかりません。') }}</p>
    </div>

    <div
      v-if="showRoundDefaultsModal && activeSection === 'overview'"
      class="modal-backdrop"
      role="presentation"
      @click.self="showRoundDefaultsModal = false"
    >
      <div class="modal card stack entity-edit-modal" role="dialog" aria-modal="true">
        <div class="row">
          <strong>{{ $t('デフォルト設定') }}</strong>
          <Button variant="ghost" size="sm" @click="showRoundDefaultsModal = false">{{
            $t('閉じる')
          }}</Button>
        </div>
        <section class="stack setup-round-config-group">
          <RoundOptionEditor
            v-model:evaluate-from-adjudicators="
              roundDefaultsForm.userDefinedData.evaluate_from_adjudicators
            "
            v-model:evaluate-from-teams="roundDefaultsForm.userDefinedData.evaluate_from_teams"
            v-model:chairs-always-evaluated="
              roundDefaultsForm.userDefinedData.chairs_always_evaluated
            "
            v-model:evaluator-in-team="roundDefaultsForm.userDefinedData.evaluator_in_team"
            v-model:no-speaker-score="roundDefaultsForm.userDefinedData.no_speaker_score"
            v-model:allow-low-tie-win="roundDefaultsForm.userDefinedData.allow_low_tie_win"
            v-model:score-by-matter-manner="
              roundDefaultsForm.userDefinedData.score_by_matter_manner
            "
            v-model:tie-points="roundDefaultsForm.compile.options.tie_points"
            v-model:poi="roundDefaultsForm.userDefinedData.poi"
            v-model:best="roundDefaultsForm.userDefinedData.best"
            :disabled="isLoading"
          />
        </section>
        <section class="stack setup-round-config-group">
          <CompileOptionsEditor
            v-model:source-rounds="roundDefaultsForm.compile.source_rounds"
            v-model:winner-policy="roundDefaultsForm.compile.options.winner_policy"
            v-model:tie-points="roundDefaultsForm.compile.options.tie_points"
            v-model:merge-policy="
              roundDefaultsForm.compile.options.duplicate_normalization.merge_policy
            "
            v-model:poi-aggregation="
              roundDefaultsForm.compile.options.duplicate_normalization.poi_aggregation
            "
            v-model:best-aggregation="
              roundDefaultsForm.compile.options.duplicate_normalization.best_aggregation
            "
            v-model:missing-data-policy="roundDefaultsForm.compile.options.missing_data_policy"
            :show-winner-scoring="false"
            :show-source-rounds="false"
            :show-merge-and-missing="false"
            :disabled="isLoading"
          />
        </section>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="showRoundDefaultsModal = false">{{
            $t('取消')
          }}</Button>
          <Button size="sm" :disabled="isLoading" @click="saveRoundDefaults">
            {{ $t('ラウンドデフォルトを保存') }}
          </Button>
        </div>
      </div>
    </div>

    <div
      v-if="activeSection === 'overview' && setupRoundDeleteTarget"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeSetupRoundDeleteModal"
    >
      <div class="modal card stack" role="dialog" aria-modal="true">
        <h4>{{ $t('ラウンド削除') }}</h4>
        <p class="muted">
          {{
            $t('{round} を削除しますか？', {
              round:
                setupRoundDeleteTarget.name ||
                $t('ラウンド {round}', { round: setupRoundDeleteTarget.round }),
            })
          }}
        </p>
        <p v-if="setupRoundDeleteError" class="error small">{{ setupRoundDeleteError }}</p>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="closeSetupRoundDeleteModal">
            {{ $t('キャンセル') }}
          </Button>
          <Button
            variant="danger"
            size="sm"
            :disabled="isLoading"
            @click="confirmRemoveRoundFromSetup"
          >
            {{ $t('削除') }}
          </Button>
        </div>
      </div>
    </div>

    <ImportTextModal
      :open="activeSection === 'data' && showEntityImportModal"
      :title="entityImportTitle"
      :help-text="entityImportHelpText"
      :description="entityImportDescription"
      :example="entityImportExample"
      :template-content="entityImportTemplate"
      :template-filename="entityImportTemplateFilename"
      :header-guide-title="entityImportHeaderGuideTitle"
      :header-guide-rows="entityImportHeaderGuideRows"
      :error="entityImportError"
      :disabled="isLoading"
      @file-change="handleEntityImportFile"
      @close="closeEntityImportModal"
      @submit="applyEntityImport"
    />

    <div
      v-if="activeSection === 'data' && deleteEntityModal"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeDeleteEntityModal"
    >
      <div class="modal card stack" role="dialog" aria-modal="true">
        <h4>{{ $t('削除') }}</h4>
        <p class="muted">{{ deleteEntityPrompt }}</p>
        <p v-if="deleteEntityModalError" class="error small">{{ deleteEntityModalError }}</p>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="closeDeleteEntityModal">{{
            $t('キャンセル')
          }}</Button>
          <Button variant="danger" size="sm" :disabled="isLoading" @click="confirmDeleteEntity">
            {{ $t('削除') }}
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { api } from '@/utils/api'
import { useTournamentStore } from '@/stores/tournament'
import { useStylesStore } from '@/stores/styles'
import { useRoundsStore } from '@/stores/rounds'
import { useDrawsStore } from '@/stores/draws'
import { useTeamsStore } from '@/stores/teams'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { useVenuesStore } from '@/stores/venues'
import { useSpeakersStore } from '@/stores/speakers'
import { useInstitutionsStore } from '@/stores/institutions'
import { useSubmissionsStore } from '@/stores/submissions'
import type { Institution } from '@/types/institution'
import { renderMarkdown } from '@/utils/markdown'
import { buildEntityImportPayload } from '@/utils/entity-csv-import'
import {
  buildRoundUserDefinedFromDefaults,
  defaultRoundDefaults,
  normalizeRoundDefaults,
  serializeRoundDefaults,
} from '@/utils/round-defaults'
import {
  isRoundBreakEnabled,
  normalizeTournamentBreakConfig,
  withRoundBreakEnabled,
  type TournamentBreakConfig,
} from '@/utils/tournament-break'
import {
  compileAdjudicatorRankingMetrics,
  compileRankingMetrics,
  type CompileAdjudicatorRankingMetric,
  normalizeCompileOptions,
  type CompileRankingMetric,
} from '@/types/compiled'
import {
  defaultTournamentAdjudicatorRankingConfig,
  defaultTournamentTeamRankingConfig,
  normalizeTournamentAdjudicatorRankingConfig,
  normalizeTournamentTeamRankingConfig,
} from '@/utils/tournament-team-ranking'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import HelpTip from '@/components/common/HelpTip.vue'
import ImportTextModal from '@/components/common/ImportTextModal.vue'
import RoundMotionEditor from '@/components/common/RoundMotionEditor.vue'
import RoundPublicationSwitches from '@/components/common/RoundPublicationSwitches.vue'
import CompileOptionsEditor from '@/components/common/CompileOptionsEditor.vue'
import RoundOptionEditor from '@/components/common/RoundOptionEditor.vue'
import BreakPolicyEditor from '@/components/common/BreakPolicyEditor.vue'
import RankingPriorityEditor from '@/components/common/RankingPriorityEditor.vue'

const route = useRoute()
const tournamentStore = useTournamentStore()
const styles = useStylesStore()
const rounds = useRoundsStore()
const draws = useDrawsStore()
const teams = useTeamsStore()
const adjudicators = useAdjudicatorsStore()
const venues = useVenuesStore()
const speakers = useSpeakersStore()
const institutions = useInstitutionsStore()
const submissions = useSubmissionsStore()
const { t } = useI18n({ useScope: 'global' })

const tournamentId = computed(() => route.params.tournamentId as string)
const tournament = computed(() =>
  tournamentStore.tournaments.find((t) => t._id === tournamentId.value)
)
const activeSection = computed(() =>
  String(route.query.section ?? 'overview') === 'data' ? 'data' : 'overview'
)
const sectionLoading = ref(true)
const isSectionLoading = computed(() => sectionLoading.value)

const isLoading = computed(
  () =>
    tournamentStore.loading ||
    styles.loading ||
    rounds.loading ||
    draws.loading ||
    teams.loading ||
    adjudicators.loading ||
    venues.loading ||
    speakers.loading ||
    institutions.loading ||
    submissions.loading
)
const roundPublicationBusy = computed(() => rounds.loading || draws.loading || sectionLoading.value)
const DEFAULT_TOURNAMENT_ACCESS_PASSWORD = 'password'

const tournamentForm = reactive({
  name: '',
  style: 1,
  hidden: false,
  accessRequired: false,
  accessPassword: '',
  infoText: '',
})
const tournamentBreakForm = reactive<TournamentBreakConfig>(
  normalizeTournamentBreakConfig(undefined)
)
const tournamentTeamRankingForm = reactive(defaultTournamentTeamRankingConfig())
const tournamentAdjudicatorRankingForm = reactive(defaultTournamentAdjudicatorRankingConfig())
const roundDefaultsForm = reactive(defaultRoundDefaults())
const setupRoundForm = reactive<{
  round: number
  name: string
}>({
  round: 1,
  name: '',
})
const setupRoundError = ref('')
const setupRoundBreakError = ref('')
const setupRoundBreakUpdating = ref(false)
const setupRoundEditingId = ref<string | null>(null)
const setupRoundEditForm = reactive<{
  round: number
  name: string
  breakEnabled: boolean
  userDefinedData: ReturnType<typeof defaultRoundDefaults>['userDefinedData']
  break: ReturnType<typeof defaultRoundDefaults>['break']
  compile: ReturnType<typeof defaultRoundDefaults>['compile']
}>({
  round: 1,
  name: '',
  breakEnabled: false,
  userDefinedData: { ...defaultRoundDefaults().userDefinedData },
  break: { ...defaultRoundDefaults().break },
  compile: {
    ...defaultRoundDefaults().compile,
    source_rounds: [...defaultRoundDefaults().compile.source_rounds],
    options: normalizeCompileOptions(defaultRoundDefaults().compile.options),
  },
})
const setupRoundEditError = ref('')
const setupRoundDetailsOpen = ref<Record<string, boolean>>({})
const showRoundDefaultsModal = ref(false)
const isTournamentPublic = computed({
  get: () => !tournamentForm.hidden,
  set: (value: boolean) => {
    tournamentForm.hidden = !value
  },
})
const isApplyingTournamentForm = ref(false)
const isSavingTournamentAutosave = ref(false)
const pendingTournamentAutosave = ref(false)
const tournamentAutosaveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const tournamentAutosaveError = ref('')
const isSavingNotice = ref(false)
const noticeSaveError = ref('')
const noticeSaved = ref(false)
const isSavingTournamentBreak = ref(false)
const tournamentBreakSaveError = ref('')
const tournamentBreakSaved = ref(false)
const isSavingTournamentTeamRanking = ref(false)
const tournamentTeamRankingSaveError = ref('')
const tournamentTeamRankingSaved = ref(false)
const isSavingTournamentAdjudicatorRanking = ref(false)
const tournamentAdjudicatorRankingSaveError = ref('')
const tournamentAdjudicatorRankingSaved = ref(false)
const showTournamentBreakSettings = ref(false)
const showTournamentTeamRankingSettings = ref(false)
const showTournamentAdjudicatorRankingSettings = ref(false)
let tournamentAutosaveTimer: number | null = null
let tournamentAutosaveStatusTimer: number | null = null
let noticeSavedTimer: number | null = null
let tournamentBreakSavedTimer: number | null = null
let tournamentTeamRankingSavedTimer: number | null = null
let tournamentAdjudicatorRankingSavedTimer: number | null = null

const teamRankingPriorityOptions = computed(() =>
  compileRankingMetrics.map((metric) => ({
    value: metric,
    label: teamRankingMetricLabel(metric),
    description: teamRankingMetricDescription(metric),
  }))
)

const adjudicatorRankingPriorityOptions = computed(() =>
  compileAdjudicatorRankingMetrics.map((metric) => ({
    value: metric,
    label: adjudicatorRankingMetricLabel(metric),
    description: adjudicatorRankingMetricDescription(metric),
  }))
)

function teamRankingMetricLabel(metric: CompileRankingMetric): string {
  const labels: Record<CompileRankingMetric, string> = {
    win: t('勝敗ポイント'),
    sum: t('総得点'),
    margin: t('得失点差'),
    vote: t('ジャッジ支持数'),
    average: t('平均得点'),
    sd: t('得点の安定性'),
  }
  return labels[metric]
}

function teamRankingMetricDescription(metric: CompileRankingMetric): string {
  const descriptions: Record<CompileRankingMetric, string> = {
    win: t('勝ち=1点、引き分けは設定ポイント'),
    sum: t('得点の合計値'),
    margin: t('得点差の合計値'),
    vote: t('ジャッジの支持数'),
    average: t('平均得点'),
    sd: t('得点のばらつき（小さいほど上位）'),
  }
  return descriptions[metric]
}

function adjudicatorRankingMetricLabel(metric: CompileAdjudicatorRankingMetric): string {
  const labels: Record<CompileAdjudicatorRankingMetric, string> = {
    average: t('平均点'),
    sd: t('標準偏差'),
    num_experienced: t('ジャッジ担当回数'),
    num_experienced_chair: t('チェア担当回数'),
  }
  return labels[metric]
}

function adjudicatorRankingMetricDescription(metric: CompileAdjudicatorRankingMetric): string {
  const descriptions: Record<CompileAdjudicatorRankingMetric, string> = {
    average: t('評価スコアの平均（高いほど上位）'),
    sd: t('評価スコアのばらつき（小さいほど上位）'),
    num_experienced: t('割り当てられた担当回数（多いほど上位）'),
    num_experienced_chair: t('チェア担当回数（多いほど上位）'),
  }
  return descriptions[metric]
}

const teamForm = reactive({
  name: '',
})
const teamInstitutionIds = ref<string[]>([])
const teamInstitutionSearch = ref('')
const teamSpeakerSearch = ref('')
const teamSelectedSpeakerIds = ref<string[]>([])

const adjudicatorForm = reactive({
  name: '',
  preev: 0,
})
const adjudicatorInstitutionIds = ref<string[]>([])
const adjudicatorInstitutionSearch = ref('')
const adjudicatorConflictIds = ref<string[]>([])
const adjudicatorConflictSearch = ref('')
const venueForm = reactive({ name: '', available: true })
const speakerForm = reactive({ name: '' })
const institutionForm = reactive({
  name: '',
  category: 'institution',
  priority: 1,
})

const institutionCategoryOptions = [
  { value: 'institution', label: 'institution' },
  { value: 'region', label: 'region' },
  { value: 'league', label: 'league' },
] as const
type InstitutionCategory = (typeof institutionCategoryOptions)[number]['value']
type InstitutionOptionGroup = {
  category: InstitutionCategory
  label: string
  items: Institution[]
}
const institutionCategoryOrder: InstitutionCategory[] = ['institution', 'region', 'league']
type EntityImportHeaderGuideRow = {
  header: string
  required: boolean
  description: string
  example?: string
}

type EntityTabKey = 'teams' | 'adjudicators' | 'venues' | 'speakers' | 'institutions'
const activeEntityTab = ref<EntityTabKey>('institutions')
const entityTabs = computed<Array<{ key: EntityTabKey; label: string; step: 1 | 2 | 3 }>>(() => [
  { key: 'institutions', label: t('コンフリクトグループ'), step: 1 },
  { key: 'venues', label: t('会場'), step: 1 },
  { key: 'speakers', label: t('スピーカー'), step: 2 },
  { key: 'adjudicators', label: t('ジャッジ'), step: 2 },
  { key: 'teams', label: t('チーム'), step: 3 },
])
const showEntityImportModal = ref(false)
const entityImportType = ref<EntityTabKey | null>(null)
const entityImportText = ref('')
const entityImportError = ref<string | null>(null)

function entityTabLabel(type: EntityTabKey | null) {
  if (!type) return ''
  const map: Record<EntityTabKey, string> = {
    teams: t('チーム'),
    adjudicators: t('ジャッジ'),
    venues: t('会場'),
    speakers: t('スピーカー'),
    institutions: t('コンフリクトグループ'),
  }
  return map[type]
}

const entityImportTitle = computed(() => {
  const label = entityTabLabel(entityImportType.value)
  if (!label) return t('CSV取り込み')
  return `${label} ${t('CSV取り込み')}`
})

const entityImportHelpText = computed(() =>
  t('CSV/TSVファイルを選択して一括取り込みできます。ヘッダー行は必須です。')
)

const entityImportDescription = computed(() =>
  t('ヘッダー行は必須です。テンプレートをダウンロードして列名を維持したまま入力してください。')
)

function buildImportCsv(header: string[], rows: string[][]): string {
  return [header.join(','), ...rows.map((row) => row.join(','))].join('\n')
}

function buildImportCsvPreview(csvText: string, maxLines = 6): string {
  const lines = csvText.split('\n')
  if (lines.length <= maxLines) return csvText
  return [...lines.slice(0, maxLines), '...'].join('\n')
}

const importInstitutionRows: string[][] = [
  ['Aurora University', 'institution', '1.2'],
  ['Beacon College', 'institution', '1.0'],
  ['Crest Institute', 'institution', '1.4'],
  ['Delta Academy', 'institution', '0.9'],
  ['East Block', 'region', '1.6'],
  ['West Block', 'region', '1.5'],
  ['North League', 'league', '1.3'],
  ['South League', 'league', '1.1'],
]

const importVenueRows: string[][] = [
  ['Room A1', '1', 'true', 'true', 'true'],
  ['Room A2', '2', 'true', 'true', 'true'],
  ['Room B1', '3', 'true', 'true', 'true'],
  ['Room B2', '4', 'true', 'true', 'true'],
]

const importSpeakerRows: string[][] = Array.from({ length: 8 }, (_, teamIndex) => {
  const teamNo = String(teamIndex + 1).padStart(2, '0')
  return ['A', 'B', 'C'].map((suffix) => [`Speaker ${teamNo}${suffix}`])
}).flat()

const importTeamRows: string[][] = [
  [
    'Team 01',
    'Aurora University|East Block|North League',
    'Speaker 01A|Speaker 01B|Speaker 01C',
    'true',
    'true',
    'true',
  ],
  [
    'Team 02',
    'Beacon College|East Block|South League',
    'Speaker 02A|Speaker 02B|Speaker 02C',
    'true',
    'true',
    'true',
  ],
  [
    'Team 03',
    'Crest Institute|East Block|North League',
    'Speaker 03A|Speaker 03B|Speaker 03C',
    'true',
    'true',
    'false',
  ],
  [
    'Team 04',
    'Delta Academy|East Block|South League',
    'Speaker 04A|Speaker 04B|Speaker 04C',
    'true',
    'true',
    'true',
  ],
  [
    'Team 05',
    'Aurora University|West Block|South League',
    'Speaker 05A|Speaker 05B|Speaker 05C',
    'false',
    'false',
    'true',
  ],
  [
    'Team 06',
    'Beacon College|West Block|North League',
    'Speaker 06A|Speaker 06B|Speaker 06C',
    'true',
    'true',
    'true',
  ],
  [
    'Team 07',
    'Crest Institute|West Block|South League',
    'Speaker 07A|Speaker 07B|Speaker 07C',
    'true',
    'true',
    'false',
  ],
  [
    'Team 08',
    'Delta Academy|West Block|North League',
    'Speaker 08A|Speaker 08B|Speaker 08C',
    'true',
    'true',
    'true',
  ],
]

const importAdjudicatorRows: string[][] = [
  ['Judge 01', '1', 'true', 'Aurora University', 'Team 05', 'true', 'false'],
  ['Judge 02', '0', 'true', 'Beacon College', 'Team 02', 'true', 'true'],
  ['Judge 03', '2', 'true', 'Crest Institute', 'Team 07', 'false', 'true'],
  ['Judge 04', '-1', 'true', 'Delta Academy', 'Team 04', 'true', 'true'],
  ['Judge 05', '1', 'true', 'East Block', '', 'true', 'false'],
  ['Judge 06', '0', 'true', 'West Block', '', 'false', 'true'],
  ['Judge 07', '3', 'true', 'North League', 'Team 08', 'true', 'true'],
  ['Judge 08', '0', 'true', 'South League', 'Team 03', 'true', 'false'],
  ['Judge 09', '2', 'true', 'Aurora University|East Block', 'Team 01', 'false', 'true'],
  ['Judge 10', '1', 'true', 'Beacon College|West Block', 'Team 06', 'true', 'true'],
  ['Judge 11', '1', 'true', 'Crest Institute|North League', 'Team 03', 'true', 'false'],
  ['Judge 12', '-1', 'true', 'Delta Academy|South League', 'Team 04', 'false', 'true'],
]

const entityImportTemplateMap: Record<EntityTabKey, string> = {
  teams: buildImportCsv(
    ['name', 'institution', 'speakers', 'available', 'available_r1', 'available_r2'],
    importTeamRows
  ),
  adjudicators: buildImportCsv(
    [
      'name',
      'preev',
      'available',
      'conflicts',
      'conflict_teams',
      'available_r1',
      'available_r2',
    ],
    importAdjudicatorRows
  ),
  venues: buildImportCsv(
    ['name', 'priority', 'available', 'available_r1', 'available_r2'],
    importVenueRows
  ),
  speakers: buildImportCsv(['name'], importSpeakerRows),
  institutions: buildImportCsv(['name', 'category', 'priority'], importInstitutionRows),
}

const entityImportHeaderGuideMap: Record<EntityTabKey, EntityImportHeaderGuideRow[]> = {
  teams: [
    { header: 'name', required: true, description: 'チーム名。大会内で一意な名前を推奨。', example: 'Team 01' },
    {
      header: 'institution',
      required: true,
      description: '紐づけるコンフリクトグループ名。複数は | または ; 区切り。',
      example: 'Aurora University|East Block|North League',
    },
    {
      header: 'speakers',
      required: true,
      description: '所属スピーカー名。3 speakers/team を想定し、| または ; 区切り。',
      example: 'Speaker 01A|Speaker 01B|Speaker 01C',
    },
    {
      header: 'available',
      required: false,
      description: '全ラウンド共通のデフォルト出場可否 (true/false)。',
      example: 'true',
    },
    {
      header: 'available_r1',
      required: false,
      description: 'Round 1 の出場可否。未指定時は available を継承。',
      example: 'true',
    },
    {
      header: 'available_r2',
      required: false,
      description: 'Round 2 の出場可否。未指定時は available を継承。',
      example: 'false',
    },
  ],
  adjudicators: [
    { header: 'name', required: true, description: 'ジャッジ名。', example: 'Judge 01' },
    {
      header: 'preev',
      required: false,
      description: '事前補正値。直近情報を反映する調整スコア (0基準・負数可)。',
      example: '1',
    },
    {
      header: 'available',
      required: false,
      description: '全ラウンド共通のデフォルト参加可否 (true/false)。',
      example: 'true',
    },
    {
      header: 'conflicts',
      required: false,
      description: 'コンフリクトグループ名。複数は | または ; 区切り。',
      example: 'Aurora University|East Block',
    },
    {
      header: 'conflict_teams',
      required: false,
      description: '個別コンフリクトのチーム名。複数は | または ; 区切り。',
      example: 'Team 05',
    },
    {
      header: 'available_r1',
      required: false,
      description: 'Round 1 の参加可否。未指定時は available を継承。',
      example: 'true',
    },
    {
      header: 'available_r2',
      required: false,
      description: 'Round 2 の参加可否。未指定時は available を継承。',
      example: 'false',
    },
  ],
  venues: [
    { header: 'name', required: true, description: '会場名。', example: 'Room A1' },
    {
      header: 'priority',
      required: false,
      description: '会場優先度 (数値)。小さい値ほど優先利用。',
      example: '1',
    },
    {
      header: 'available',
      required: false,
      description: '全ラウンド共通の利用可否 (true/false)。',
      example: 'true',
    },
    {
      header: 'available_r1',
      required: false,
      description: 'Round 1 の利用可否。未指定時は available を継承。',
      example: 'true',
    },
    {
      header: 'available_r2',
      required: false,
      description: 'Round 2 の利用可否。未指定時は available を継承。',
      example: 'true',
    },
  ],
  speakers: [
    { header: 'name', required: true, description: 'スピーカー名。', example: 'Speaker 01A' },
  ],
  institutions: [
    {
      header: 'name',
      required: true,
      description: 'コンフリクトグループ名。チーム/ジャッジCSVと同名で紐づく。',
      example: 'Aurora University',
    },
    {
      header: 'category',
      required: false,
      description: 'グループ種別 (institution / region / league)。',
      example: 'region',
    },
    {
      header: 'priority',
      required: false,
      description: '衝突優先度 (数値)。高いほど重視。',
      example: '1.6',
    },
  ],
}

const entityImportExample = computed(() => {
  if (!entityImportType.value) return ''
  return buildImportCsvPreview(entityImportTemplateMap[entityImportType.value])
})

const entityImportTemplate = computed(() => {
  if (!entityImportType.value) return ''
  return entityImportTemplateMap[entityImportType.value]
})

const entityImportHeaderGuideTitle = computed(() => {
  const label = entityTabLabel(entityImportType.value)
  if (!label) return t('CSVヘッダー説明')
  return `${label} ${t('CSVヘッダー説明')}`
})

const entityImportHeaderGuideRows = computed<EntityImportHeaderGuideRow[]>(() => {
  if (!entityImportType.value) return []
  return entityImportHeaderGuideMap[entityImportType.value]
})

const entityImportTemplateFilename = computed(() => {
  if (entityImportType.value === 'teams') return 'teams_import_template.csv'
  if (entityImportType.value === 'adjudicators') return 'adjudicators_import_template.csv'
  if (entityImportType.value === 'venues') return 'venues_import_template.csv'
  if (entityImportType.value === 'speakers') return 'speakers_import_template.csv'
  if (entityImportType.value === 'institutions') return 'institutions_import_template.csv'
  return 'import_template.csv'
})

const teamSearch = ref('')
const adjudicatorSearch = ref('')
const speakerSearch = ref('')
const venueSearch = ref('')
const institutionSearch = ref('')
const naturalSortCollator = new Intl.Collator(['ja', 'en'], {
  numeric: true,
  sensitivity: 'base',
})

const teamLimit = ref(20)
const adjudicatorLimit = ref(20)
const venueLimit = ref(20)
const speakerLimit = ref(20)
const institutionLimit = ref(20)

const editingEntity = ref<{ type: string; id: string } | null>(null)
type DeleteEntityType = 'team' | 'adjudicator' | 'venue' | 'speaker' | 'institution'
const deleteEntityModal = ref<{ type: DeleteEntityType; id: string } | null>(null)
const deleteEntityModalError = ref('')
const entityForm = reactive<any>({
  name: '',
  preev: 0,
  category: 'institution',
  priority: 1,
})
const entityError = ref<string | null>(null)
const detailRows = ref<any[]>([])
const csvError = ref<string | null>(null)
const roundDetailInstitutionOptions = computed(() =>
  institutions.institutions
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
)
const groupedRoundDetailInstitutionOptions = computed(() =>
  buildInstitutionOptionGroups(roundDetailInstitutionOptions.value)
)
const roundDetailSpeakerOptions = computed(() =>
  speakers.speakers
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
)
const roundDetailTeamOptions = computed(() =>
  teams.teams
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
)
const deleteEntityPrompt = computed(() => {
  if (!deleteEntityModal.value) return ''
  const { type } = deleteEntityModal.value
  if (type === 'team') return t('チームを削除しますか？')
  if (type === 'adjudicator') return t('ジャッジを削除しますか？')
  if (type === 'venue') return t('会場を削除しますか？')
  if (type === 'speaker') return t('スピーカーを削除しますか？')
  return t('コンフリクトグループを削除しますか？')
})

const sortedRounds = computed(() => rounds.rounds.slice().sort((a, b) => a.round - b.round))
const hasBreakRounds = computed(() =>
  sortedRounds.value.some((round) => isRoundBreakEnabled(round?.userDefinedData))
)
const setupDrawByRound = computed(() => {
  const map = new Map<number, any>()
  draws.draws.forEach((draw) => {
    map.set(Number(draw.round), draw)
  })
  return map
})
function setupRoundDraw(roundNumber: number) {
  return setupDrawByRound.value.get(Number(roundNumber)) ?? null
}
function setupRoundHasDraw(roundNumber: number) {
  const draw = setupRoundDraw(roundNumber)
  return Boolean(draw && Array.isArray(draw.allocation) && draw.allocation.length > 0)
}
function setupRoundTeamAllocationOpened(roundNumber: number) {
  return Boolean(setupRoundDraw(roundNumber)?.drawOpened)
}
function setupRoundAdjudicatorAllocationOpened(roundNumber: number) {
  return Boolean(setupRoundDraw(roundNumber)?.allocationOpened)
}
const setupRoundDeleteId = ref<string | null>(null)
const setupRoundDeleteError = ref('')
const setupRoundDeleteTarget = computed(() => {
  const id = String(setupRoundDeleteId.value ?? '').trim()
  if (!id) return null
  return sortedRounds.value.find((round) => String(round._id) === id) ?? null
})
const setupSuggestedRoundNumber = computed(() => {
  if (sortedRounds.value.length === 0) return 1
  return sortedRounds.value[sortedRounds.value.length - 1].round + 1
})
const managedRoundNumbers = computed(() => {
  if (sortedRounds.value.length > 0) {
    return sortedRounds.value.map((item) => item.round)
  }
  const total = Number(tournament.value?.total_round_num ?? 0)
  if (!Number.isFinite(total) || total <= 0) return []
  return Array.from({ length: Math.floor(total) }, (_, index) => index + 1)
})

const filteredTeams = computed(() => {
  const q = teamSearch.value.trim().toLowerCase()
  const filtered = q
    ? teams.teams.filter((team) => {
        const speakersText = teamSpeakerNames(team).join(', ').toLowerCase()
        const institutionText = teamInstitutionLabel(team).toLowerCase()
        return (
          team.name?.toLowerCase().includes(q) ||
          institutionText.includes(q) ||
          speakersText.includes(q)
        )
      })
    : teams.teams
  return filtered
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
})

const filteredAdjudicators = computed(() => {
  const q = adjudicatorSearch.value.trim().toLowerCase()
  const filtered = q
    ? adjudicators.adjudicators.filter((adj) => adj.name?.toLowerCase().includes(q))
    : adjudicators.adjudicators
  return filtered
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
})

const filteredSpeakers = computed(() => {
  const q = speakerSearch.value.trim().toLowerCase()
  const filtered = q
    ? speakers.speakers.filter((sp) => sp.name?.toLowerCase().includes(q))
    : speakers.speakers
  return filtered
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
})

const filteredVenues = computed(() => {
  const q = venueSearch.value.trim().toLowerCase()
  const filtered = q
    ? venues.venues.filter((venue) => venue.name?.toLowerCase().includes(q))
    : venues.venues
  return filtered
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
})

const filteredInstitutions = computed(() => {
  const q = institutionSearch.value.trim().toLowerCase()
  const filtered = q
    ? institutions.institutions.filter((inst) => inst.name?.toLowerCase().includes(q))
    : institutions.institutions
  return filtered
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
})

const filteredTeamSpeakerOptions = computed(() => {
  const q = teamSpeakerSearch.value.trim().toLowerCase()
  const list = q
    ? speakers.speakers.filter((speaker) => speaker.name?.toLowerCase().includes(q))
    : speakers.speakers
  return list
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
})

const filteredTeamInstitutionOptions = computed(() => {
  const q = teamInstitutionSearch.value.trim().toLowerCase()
  const list = q
    ? institutions.institutions.filter((inst) => inst.name?.toLowerCase().includes(q))
    : institutions.institutions
  return list
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
})
const groupedTeamInstitutionOptions = computed(() =>
  buildInstitutionOptionGroups(filteredTeamInstitutionOptions.value)
)

const filteredAdjudicatorInstitutionOptions = computed(() => {
  const q = adjudicatorInstitutionSearch.value.trim().toLowerCase()
  const list = q
    ? institutions.institutions.filter((inst) => inst.name?.toLowerCase().includes(q))
    : institutions.institutions
  return list
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
})
const groupedAdjudicatorInstitutionOptions = computed(() =>
  buildInstitutionOptionGroups(filteredAdjudicatorInstitutionOptions.value)
)

const filteredAdjudicatorConflictTeams = computed(() => {
  const q = adjudicatorConflictSearch.value.trim().toLowerCase()
  const list = q ? teams.teams.filter((team) => team.name?.toLowerCase().includes(q)) : teams.teams
  return list
    .slice()
    .sort((a, b) => naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? '')))
})

const visibleTeams = computed(() => filteredTeams.value.slice(0, teamLimit.value))
const visibleAdjudicators = computed(() =>
  filteredAdjudicators.value.slice(0, adjudicatorLimit.value)
)
const visibleVenues = computed(() => filteredVenues.value.slice(0, venueLimit.value))
const visibleSpeakers = computed(() => filteredSpeakers.value.slice(0, speakerLimit.value))
const visibleInstitutions = computed(() =>
  filteredInstitutions.value.slice(0, institutionLimit.value)
)
const canSaveTournamentName = computed(() => {
  const next = tournamentForm.name.trim()
  const current = String(tournament.value?.name ?? '').trim()
  return next.length > 0 && next !== current
})
const canSaveTournamentNotice = computed(() => {
  const next = String(tournamentForm.infoText ?? '')
  const current = String(tournament.value?.user_defined_data?.info?.text ?? '')
  return next !== current
})

const tournamentAutosaveText = computed(() => {
  if (tournamentAutosaveStatus.value === 'saving') return t('大会設定を保存中...')
  if (tournamentAutosaveStatus.value === 'saved') return t('大会設定を自動保存しました。')
  if (tournamentAutosaveStatus.value === 'error') {
    return tournamentAutosaveError.value || t('大会設定の保存に失敗しました。')
  }
  return ''
})
const infoPreviewHtml = computed(() => renderMarkdown(tournamentForm.infoText ?? ''))

function joinUrl(base: string, path: string) {
  const normalizedBase = base.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

const currentOrigin = computed(() => {
  if (typeof window === 'undefined') return ''
  return window.location.origin
})
const participantUrl = computed(() => {
  if (!tournamentId.value) return ''
  return joinUrl(currentOrigin.value, `/user/${tournamentId.value}/home`)
})

const qrLoading = ref(false)
const qrError = ref('')
const qrCodeDataUrl = ref('')
let qrGenerationId = 0

const copyStatus = ref<'idle' | 'copied' | 'error'>('idle')
const copyError = ref('')
let copyTimeout: number | null = null

async function generateQrCode(url: string) {
  const generationId = ++qrGenerationId
  qrLoading.value = true
  qrError.value = ''
  qrCodeDataUrl.value = ''
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
    if (generationId !== qrGenerationId) return
    qrCodeDataUrl.value = dataUrl
  } catch (err: any) {
    if (generationId !== qrGenerationId) return
    qrError.value = err?.message ?? t('QRコード生成に失敗しました。')
  } finally {
    if (generationId === qrGenerationId) {
      qrLoading.value = false
    }
  }
}

async function copyParticipantUrl() {
  const url = participantUrl.value
  if (!url) return
  copyStatus.value = 'idle'
  copyError.value = ''
  try {
    await navigator.clipboard.writeText(url)
    copyStatus.value = 'copied'
    if (copyTimeout) {
      window.clearTimeout(copyTimeout)
    }
    copyTimeout = window.setTimeout(() => {
      copyStatus.value = 'idle'
    }, 1200)
  } catch {
    copyStatus.value = 'error'
    copyError.value = t('クリップボードへのコピーに失敗しました。')
  }
}

function applyAccessForm(authValue: unknown) {
  const auth = authValue && typeof authValue === 'object' ? (authValue as Record<string, any>) : {}
  const access =
    auth.access && typeof auth.access === 'object' ? (auth.access as Record<string, any>) : {}
  const required = access.required === true
  const hasPassword = access.hasPassword === true
  const savedAccessPassword = typeof access.password === 'string' ? String(access.password) : ''
  tournamentForm.accessRequired = required
  if (savedAccessPassword.length > 0) {
    tournamentForm.accessPassword = savedAccessPassword
  } else if (!hasPassword) {
    tournamentForm.accessPassword = ''
  }
}

function applyTournamentForm() {
  if (!tournament.value) return
  isApplyingTournamentForm.value = true
  tournamentForm.name = tournament.value.name
  tournamentForm.style = tournament.value.style
  tournamentForm.hidden = Boolean(tournament.value.user_defined_data?.hidden)
  applyAccessForm(tournament.value.auth)
  tournamentForm.infoText = String(tournament.value.user_defined_data?.info?.text ?? '')
  applyTournamentBreakForm()
  applyTournamentTeamRankingForm()
  applyTournamentAdjudicatorRankingForm()
  applyRoundDefaultsForm()
  void nextTick(() => {
    isApplyingTournamentForm.value = false
  })
}

function applyTournamentBreakForm() {
  const normalized = normalizeTournamentBreakConfig(tournament.value?.user_defined_data?.break)
  Object.assign(tournamentBreakForm, normalized)
}

function applyTournamentTeamRankingForm() {
  const normalized = normalizeTournamentTeamRankingConfig(
    tournament.value?.user_defined_data?.team_ranking_priority
  )
  Object.assign(tournamentTeamRankingForm, normalized)
}

function applyTournamentAdjudicatorRankingForm() {
  const normalized = normalizeTournamentAdjudicatorRankingConfig(
    tournament.value?.user_defined_data?.adjudicator_ranking_priority
  )
  Object.assign(tournamentAdjudicatorRankingForm, normalized)
}

function applyRoundDefaultsForm() {
  const normalized = normalizeRoundDefaults(tournament.value?.user_defined_data?.round_defaults)
  Object.assign(roundDefaultsForm.userDefinedData, normalized.userDefinedData)
  Object.assign(roundDefaultsForm.compile, {
    ...normalized.compile,
    source_rounds: [...normalized.compile.source_rounds],
    options: normalizeCompileOptions(normalized.compile.options, normalized.compile.options),
  })
}

async function refresh() {
  if (!tournamentId.value) return
  sectionLoading.value = true
  try {
    await Promise.all([
      tournamentStore.fetchTournaments(),
      styles.fetchStyles(),
      rounds.fetchRounds(tournamentId.value),
      draws.fetchDraws(tournamentId.value),
      teams.fetchTeams(tournamentId.value),
      adjudicators.fetchAdjudicators(tournamentId.value),
      venues.fetchVenues(tournamentId.value),
      speakers.fetchSpeakers(tournamentId.value),
      institutions.fetchInstitutions(tournamentId.value),
      submissions.fetchSubmissions({ tournamentId: tournamentId.value }),
    ])
    applyTournamentForm()
  } finally {
    sectionLoading.value = false
  }
}

async function refreshEntities() {
  await Promise.all([
    rounds.fetchRounds(tournamentId.value),
    draws.fetchDraws(tournamentId.value),
    teams.fetchTeams(tournamentId.value),
    adjudicators.fetchAdjudicators(tournamentId.value),
    venues.fetchVenues(tournamentId.value),
    speakers.fetchSpeakers(tournamentId.value),
    institutions.fetchInstitutions(tournamentId.value),
    submissions.fetchSubmissions({ tournamentId: tournamentId.value }),
  ])
}

async function saveTournament(options: { includeName?: boolean; includeInfo?: boolean } = {}) {
  if (!tournament.value) return false
  const includeName = options.includeName ?? true
  const includeInfo = options.includeInfo ?? false
  const passwordInput = String(tournamentForm.accessPassword ?? '').trim()
  const currentAccess =
    tournament.value.auth?.access && typeof tournament.value.auth.access === 'object'
      ? (tournament.value.auth.access as Record<string, any>)
      : {}
  const currentHasPassword =
    currentAccess.hasPassword === true ||
    (typeof currentAccess.password === 'string' && currentAccess.password.length > 0)
  const nextUserDefined = { ...(tournament.value.user_defined_data ?? {}) } as Record<string, any>
  delete nextUserDefined.submission_policy
  const currentInfo =
    nextUserDefined.info && typeof nextUserDefined.info === 'object'
      ? { ...(nextUserDefined.info as Record<string, any>) }
      : {}
  const info = includeInfo
    ? {
        ...currentInfo,
        text: tournamentForm.infoText,
        time: new Date().toISOString(),
      }
    : currentInfo
  const authPayload: Record<string, any> = {}
  authPayload.access = { required: tournamentForm.accessRequired }
  if (tournamentForm.accessRequired) {
    if (passwordInput.length > 0) {
      authPayload.access.password = passwordInput
    } else if (!currentHasPassword) {
      // Keep compatibility with server-side validation that requires a password when enabling access.
      authPayload.access.password = DEFAULT_TOURNAMENT_ACCESS_PASSWORD
    }
  } else {
    if (passwordInput.length > 0) {
      authPayload.access.password = passwordInput
    } else if (!currentHasPassword) {
      authPayload.access.password = null
    }
  }
  const updated = await tournamentStore.updateTournament({
    tournamentId: tournament.value._id,
    name: includeName ? tournamentForm.name : tournament.value.name,
    style: tournamentForm.style,
    auth: authPayload,
    user_defined_data: {
      ...nextUserDefined,
      hidden: tournamentForm.hidden,
      info,
    },
  })
  if (updated) {
    isApplyingTournamentForm.value = true
    applyAccessForm(updated.auth)
    void nextTick(() => {
      isApplyingTournamentForm.value = false
    })
    tournamentAutosaveStatus.value = 'saved'
    tournamentAutosaveError.value = ''
    if (tournamentAutosaveStatusTimer) {
      window.clearTimeout(tournamentAutosaveStatusTimer)
    }
    tournamentAutosaveStatusTimer = window.setTimeout(() => {
      tournamentAutosaveStatus.value = 'idle'
    }, 1200)
    return true
  }
  tournamentAutosaveStatus.value = 'error'
  tournamentAutosaveError.value = tournamentStore.error ?? t('大会設定の保存に失敗しました。')
  return false
}

async function saveTournamentName() {
  if (!canSaveTournamentName.value) return
  await saveTournament({ includeName: true, includeInfo: false })
}

async function saveTournamentNotice() {
  if (!canSaveTournamentNotice.value || isSavingNotice.value) return
  noticeSaveError.value = ''
  noticeSaved.value = false
  isSavingNotice.value = true
  const ok = await saveTournament({ includeName: false, includeInfo: true })
  isSavingNotice.value = false
  if (!ok) {
    noticeSaveError.value = tournamentStore.error ?? t('重要なお知らせの更新に失敗しました。')
    return
  }
  noticeSaved.value = true
  if (noticeSavedTimer) {
    window.clearTimeout(noticeSavedTimer)
  }
  noticeSavedTimer = window.setTimeout(() => {
    noticeSaved.value = false
  }, 1400)
}

function queueTournamentAutosave() {
  if (isApplyingTournamentForm.value || !tournament.value) return
  pendingTournamentAutosave.value = true
  if (tournamentAutosaveTimer) {
    window.clearTimeout(tournamentAutosaveTimer)
  }
  tournamentAutosaveTimer = window.setTimeout(() => {
    void flushTournamentAutosave()
  }, 500)
}

async function flushTournamentAutosave() {
  if (isApplyingTournamentForm.value || !pendingTournamentAutosave.value || !tournament.value)
    return
  if (isSavingTournamentAutosave.value) return
  pendingTournamentAutosave.value = false
  isSavingTournamentAutosave.value = true
  tournamentAutosaveStatus.value = 'saving'
  await saveTournament({ includeName: false, includeInfo: false })
  isSavingTournamentAutosave.value = false
  if (pendingTournamentAutosave.value) {
    void flushTournamentAutosave()
  }
}

function serializeRoundDefaultsForTournamentStorage() {
  const normalized = serializeRoundDefaults(roundDefaultsForm) as Record<string, any>
  const normalizedCompile = normalizeCompileOptions(
    normalized?.compile?.options ?? normalized?.compile
  ) as Record<string, any>
  const { ranking_priority: _ignoredRankingPriority, ...compileOptionsWithoutRanking } =
    normalizedCompile
  void _ignoredRankingPriority
  return {
    userDefinedData: normalized.userDefinedData,
    compile: {
      source: normalized?.compile?.source === 'raw' ? 'raw' : 'submissions',
      source_rounds: Array.isArray(normalized?.compile?.source_rounds)
        ? normalized.compile.source_rounds
        : [],
      options: compileOptionsWithoutRanking,
    },
  }
}

async function saveRoundDefaults() {
  if (!tournament.value) return
  const nextUserDefined = { ...(tournament.value.user_defined_data ?? {}) } as Record<string, any>
  delete nextUserDefined.submission_policy
  await tournamentStore.updateTournament({
    tournamentId: tournament.value._id,
    user_defined_data: {
      ...nextUserDefined,
      round_defaults: serializeRoundDefaultsForTournamentStorage(),
    },
  })
}

async function saveTournamentBreakSettings() {
  if (!tournament.value || isSavingTournamentBreak.value) return
  isSavingTournamentBreak.value = true
  tournamentBreakSaveError.value = ''
  tournamentBreakSaved.value = false
  const nextUserDefined = { ...(tournament.value.user_defined_data ?? {}) } as Record<string, any>
  delete nextUserDefined.submission_policy
  const normalizedBreak = normalizeTournamentBreakConfig(tournamentBreakForm)
  const updated = await tournamentStore.updateTournament({
    tournamentId: tournament.value._id,
    user_defined_data: {
      ...nextUserDefined,
      break: normalizedBreak,
    },
  })
  isSavingTournamentBreak.value = false
  if (!updated?._id) {
    tournamentBreakSaveError.value =
      tournamentStore.error ?? t('ブレイク設定の保存に失敗しました。')
    return
  }
  Object.assign(
    tournamentBreakForm,
    normalizeTournamentBreakConfig(updated.user_defined_data?.break)
  )
  tournamentBreakSaved.value = true
  if (tournamentBreakSavedTimer) {
    window.clearTimeout(tournamentBreakSavedTimer)
  }
  tournamentBreakSavedTimer = window.setTimeout(() => {
    tournamentBreakSaved.value = false
  }, 1400)
}

async function saveTournamentTeamRankingSettings() {
  if (!tournament.value || isSavingTournamentTeamRanking.value) return
  isSavingTournamentTeamRanking.value = true
  tournamentTeamRankingSaveError.value = ''
  tournamentTeamRankingSaved.value = false
  const nextUserDefined = { ...(tournament.value.user_defined_data ?? {}) } as Record<string, any>
  delete nextUserDefined.submission_policy
  const normalizedTeamRanking = normalizeTournamentTeamRankingConfig(tournamentTeamRankingForm)
  const updated = await tournamentStore.updateTournament({
    tournamentId: tournament.value._id,
    user_defined_data: {
      ...nextUserDefined,
      team_ranking_priority: normalizedTeamRanking,
    },
  })
  isSavingTournamentTeamRanking.value = false
  if (!updated?._id) {
    tournamentTeamRankingSaveError.value =
      tournamentStore.error ?? t('チーム順位優先度の保存に失敗しました。')
    return
  }
  Object.assign(
    tournamentTeamRankingForm,
    normalizeTournamentTeamRankingConfig(updated.user_defined_data?.team_ranking_priority)
  )
  tournamentTeamRankingSaved.value = true
  if (tournamentTeamRankingSavedTimer) {
    window.clearTimeout(tournamentTeamRankingSavedTimer)
  }
  tournamentTeamRankingSavedTimer = window.setTimeout(() => {
    tournamentTeamRankingSaved.value = false
  }, 1400)
}

async function saveTournamentAdjudicatorRankingSettings() {
  if (!tournament.value || isSavingTournamentAdjudicatorRanking.value) return
  isSavingTournamentAdjudicatorRanking.value = true
  tournamentAdjudicatorRankingSaveError.value = ''
  tournamentAdjudicatorRankingSaved.value = false
  const nextUserDefined = { ...(tournament.value.user_defined_data ?? {}) } as Record<string, any>
  delete nextUserDefined.submission_policy
  const normalizedAdjudicatorRanking = normalizeTournamentAdjudicatorRankingConfig(
    tournamentAdjudicatorRankingForm
  )
  const updated = await tournamentStore.updateTournament({
    tournamentId: tournament.value._id,
    user_defined_data: {
      ...nextUserDefined,
      adjudicator_ranking_priority: normalizedAdjudicatorRanking,
    },
  })
  isSavingTournamentAdjudicatorRanking.value = false
  if (!updated?._id) {
    tournamentAdjudicatorRankingSaveError.value =
      tournamentStore.error ?? t('ジャッジ順位優先度の保存に失敗しました。')
    return
  }
  Object.assign(
    tournamentAdjudicatorRankingForm,
    normalizeTournamentAdjudicatorRankingConfig(updated.user_defined_data?.adjudicator_ranking_priority)
  )
  tournamentAdjudicatorRankingSaved.value = true
  if (tournamentAdjudicatorRankingSavedTimer) {
    window.clearTimeout(tournamentAdjudicatorRankingSavedTimer)
  }
  tournamentAdjudicatorRankingSavedTimer = window.setTimeout(() => {
    tournamentAdjudicatorRankingSaved.value = false
  }, 1400)
}

function roundTypeLabel(round: any) {
  return isRoundBreakEnabled(round?.userDefinedData) ? t('ブレイク') : t('通常ラウンド')
}

function setupRoundBreakEnabled(round: any): boolean {
  return isRoundBreakEnabled(round?.userDefinedData)
}

function applyBreakRoundConstraints(userDefinedData: Record<string, any>, breakEnabled: boolean) {
  if (breakEnabled) {
    userDefinedData.allow_low_tie_win = false
  }
}

async function onSetupRoundBreakEnabledChange(round: any, nextEnabled: boolean) {
  if (setupRoundBreakUpdating.value) return
  setupRoundBreakError.value = ''

  const targetRound = Number(round?.round)
  if (!Number.isInteger(targetRound) || targetRound < 1) return

  const targets = sortedRounds.value.filter((item) => {
    const roundNumber = Number(item.round)
    if (!Number.isInteger(roundNumber) || roundNumber < 1) return false
    return nextEnabled ? roundNumber >= targetRound : roundNumber <= targetRound
  })
  if (targets.length === 0) return

  setupRoundBreakUpdating.value = true
  try {
    const payload = targets.map((item) => {
      const currentUserDefined =
        item?.userDefinedData && typeof item.userDefinedData === 'object'
          ? ({ ...(item.userDefinedData as Record<string, any>) } as Record<string, any>)
          : {}
      const nextUserDefined = withRoundBreakEnabled(currentUserDefined, nextEnabled) as Record<
        string,
        any
      >
      applyBreakRoundConstraints(nextUserDefined, nextEnabled)
      return {
        id: String(item._id),
        tournamentId: tournamentId.value,
        userDefinedData: nextUserDefined,
      }
    })

    const updated = await rounds.bulkUpdateRounds(payload)
    if (updated.length === 0) {
      setupRoundBreakError.value = rounds.error ?? t('ブレイク設定の保存に失敗しました。')
      await rounds.fetchRounds(tournamentId.value)
      return
    }

    if (setupRoundEditingId.value) {
      const editingRound = sortedRounds.value.find(
        (item) => String(item._id) === String(setupRoundEditingId.value)
      )
      if (editingRound) {
        setupRoundEditForm.breakEnabled = setupRoundBreakEnabled(editingRound)
        applyBreakRoundConstraints(
          setupRoundEditForm.userDefinedData as Record<string, any>,
          setupRoundEditForm.breakEnabled
        )
      }
    }
  } finally {
    setupRoundBreakUpdating.value = false
  }
}

async function onSetupMotionOpenedChange(round: any, checked: boolean) {
  const updated = await rounds.updateRound({
    tournamentId: tournamentId.value,
    roundId: String(round._id),
    motionOpened: Boolean(checked),
  })
  if (updated?._id) {
    await rounds.fetchRounds(tournamentId.value)
  }
}

async function saveSetupDrawPublication(
  round: any,
  nextState: Partial<{ drawOpened: boolean; allocationOpened: boolean }>
): Promise<boolean> {
  const roundNumber = Number(round?.round)
  const draw = setupRoundDraw(roundNumber)
  if (!Number.isInteger(roundNumber) || !draw) return false
  const updated = await draws.upsertDraw({
    tournamentId: tournamentId.value,
    round: roundNumber,
    allocation: Array.isArray(draw.allocation) ? draw.allocation : [],
    userDefinedData: draw.userDefinedData,
    drawOpened: nextState.drawOpened ?? Boolean(draw.drawOpened),
    allocationOpened: nextState.allocationOpened ?? Boolean(draw.allocationOpened),
    locked: Boolean(draw.locked),
  })
  if (!updated?._id) return false
  await draws.fetchDraws(tournamentId.value)
  return true
}

async function onSetupTeamAllocationChange(round: any, checked: boolean) {
  await saveSetupDrawPublication(round, { drawOpened: Boolean(checked) })
}

async function onSetupAdjudicatorAllocationChange(round: any, checked: boolean) {
  await saveSetupDrawPublication(round, { allocationOpened: Boolean(checked) })
}

function isSetupRoundDetailsOpen(roundId: string) {
  return setupRoundDetailsOpen.value[roundId] === true
}

function openSetupRoundDetails(round: any) {
  const roundId = String(round?._id ?? '')
  if (!roundId) return
  setupRoundDetailsOpen.value = { [roundId]: true }
  startEditRoundFromSetup(round)
}

function closeSetupRoundDetails(roundId?: string) {
  const normalizedRoundId = String(roundId ?? '').trim()
  setupRoundDetailsOpen.value = {}
  if (!setupRoundEditingId.value) return
  if (!normalizedRoundId || setupRoundEditingId.value === normalizedRoundId) {
    cancelEditRoundFromSetup()
  }
}

function normalizeBreakConfigForRoundEdit(input: unknown) {
  const source = input && typeof input === 'object' ? (input as Record<string, any>) : {}
  const breakDefaults = normalizeTournamentBreakConfig(tournamentBreakForm)
  const sizeRaw = Number(source.size)
  const cutoffTiePolicy =
    source.cutoff_tie_policy === 'include_all' || source.cutoff_tie_policy === 'strict'
      ? source.cutoff_tie_policy
      : breakDefaults.cutoff_tie_policy
  const seeding =
    source.seeding === 'high_low'
      ? 'reseed_each_round'
      : source.seeding === 'reseed_each_round' ||
          source.seeding === 'fixed_bracket' ||
          source.seeding === 'random_within_tie_group' ||
          source.seeding === 'random_full'
        ? source.seeding
        : breakDefaults.seeding
  return {
    source: source.source === 'raw' ? 'raw' : breakDefaults.source,
    source_rounds: Array.isArray(source.source_rounds) ? source.source_rounds : [],
    size: Number.isInteger(sizeRaw) && sizeRaw >= 1 ? sizeRaw : breakDefaults.size,
    cutoff_tie_policy: cutoffTiePolicy,
    seeding,
    participants: Array.isArray(source.participants) ? source.participants : [],
  }
}

function compileSourceRoundOptions(targetRound: number): number[] {
  return sortedRounds.value
    .map((round) => Number(round.round))
    .filter(
      (roundNumber) =>
        Number.isInteger(roundNumber) && roundNumber >= 1 && roundNumber < targetRound
    )
    .sort((left, right) => left - right)
}

function compileSourceRoundSelectOptions(
  targetRound: number
): Array<{ value: number; label: string }> {
  return compileSourceRoundOptions(targetRound).map((roundNumber) => ({
    value: roundNumber,
    label: t('ラウンド {round}', { round: roundNumber }),
  }))
}

function normalizeCompileSourceRoundsForRound(
  roundNumber: number,
  sourceRounds: unknown
): number[] {
  if (!Array.isArray(sourceRounds)) return []
  return Array.from(
    new Set(
      sourceRounds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1 && value < roundNumber)
    )
  ).sort((left, right) => left - right)
}

async function createRoundFromSetup() {
  if (!tournamentId.value) return
  setupRoundError.value = ''
  setupRoundBreakError.value = ''
  const roundNumber = Number(setupRoundForm.round)
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    setupRoundError.value = t('ラウンド番号を確認してください。')
    return
  }
  if (sortedRounds.value.some((round) => Number(round.round) === roundNumber)) {
    setupRoundError.value = t('同じラウンド番号が既に存在します。')
    return
  }

  const normalizedDefaults = normalizeRoundDefaults(roundDefaultsForm)
  const userDefinedData = buildRoundUserDefinedFromDefaults(normalizedDefaults) as Record<string, any>
  const compileOptions = normalizeCompileOptions(userDefinedData?.compile?.options)
  const { ranking_priority: _ignoredRankingPriority, ...compileOptionsWithoutRanking } =
    compileOptions as Record<string, any>
  void _ignoredRankingPriority
  const breakDefaults = normalizeTournamentBreakConfig(tournamentBreakForm)
  userDefinedData.break = {
    source: breakDefaults.source,
    source_rounds: [...breakDefaults.source_rounds],
    size: breakDefaults.size,
    cutoff_tie_policy: breakDefaults.cutoff_tie_policy,
    seeding: breakDefaults.seeding,
    participants: [],
  }
  userDefinedData.compile = {
    source: userDefinedData?.compile?.source === 'raw' ? 'raw' : normalizedDefaults.compile.source,
    source_rounds: Array.isArray(userDefinedData?.compile?.source_rounds)
      ? userDefinedData.compile.source_rounds
      : [],
    options: compileOptionsWithoutRanking,
  }
  userDefinedData.break_round = false

  const created = await rounds.createRound({
    tournamentId: tournamentId.value,
    round: roundNumber,
    name: setupRoundForm.name || t('ラウンド {round}', { round: roundNumber }),
    motionOpened: false,
    teamAllocationOpened: false,
    adjudicatorAllocationOpened: false,
    userDefinedData,
  })
  if (!created?._id) {
    setupRoundError.value = rounds.error ?? t('ラウンド追加に失敗しました。')
    return
  }
  setupRoundForm.round = setupSuggestedRoundNumber.value
  setupRoundForm.name = ''
}

function requestRemoveRoundFromSetup(roundId: string) {
  if (!roundId) return
  setupRoundDeleteError.value = ''
  setupRoundDeleteId.value = roundId
}

function closeSetupRoundDeleteModal() {
  setupRoundDeleteError.value = ''
  setupRoundDeleteId.value = null
}

async function confirmRemoveRoundFromSetup() {
  const roundId = String(setupRoundDeleteId.value ?? '').trim()
  if (!roundId) return
  setupRoundDeleteError.value = ''
  const deleted = await rounds.deleteRound(tournamentId.value, roundId)
  if (!deleted) {
    setupRoundDeleteError.value = rounds.error ?? t('ラウンドの削除に失敗しました。')
    rounds.error = null
    return
  }
  closeSetupRoundDeleteModal()
  const next = { ...setupRoundDetailsOpen.value }
  delete next[roundId]
  setupRoundDetailsOpen.value = next
  if (setupRoundEditingId.value === roundId) {
    cancelEditRoundFromSetup()
  }
}

function startEditRoundFromSetup(round: any) {
  setupRoundEditError.value = ''
  setupRoundEditingId.value = String(round?._id ?? '')
  setupRoundEditForm.round = Number(round?.round ?? 1)
  setupRoundEditForm.name = String(round?.name ?? '')
  setupRoundEditForm.breakEnabled = setupRoundBreakEnabled(round)
  const userDefined = round?.userDefinedData ?? {}
  const normalized = normalizeRoundDefaults({
    userDefinedData: userDefined,
    break: userDefined.break,
    compile: userDefined.compile,
  })
  Object.assign(setupRoundEditForm.userDefinedData, normalized.userDefinedData)
  Object.assign(setupRoundEditForm.break, normalized.break)
  Object.assign(setupRoundEditForm.compile, {
    ...normalized.compile,
    source_rounds: [...normalized.compile.source_rounds],
    options: normalizeCompileOptions(normalized.compile.options, normalized.compile.options),
  })
  applyBreakRoundConstraints(
    setupRoundEditForm.userDefinedData as Record<string, any>,
    setupRoundEditForm.breakEnabled
  )
}

function cancelEditRoundFromSetup() {
  setupRoundEditError.value = ''
  setupRoundEditingId.value = null
  setupRoundEditForm.round = setupSuggestedRoundNumber.value
  setupRoundEditForm.name = ''
  setupRoundEditForm.breakEnabled = false
  const normalizedBreakDefaults = normalizeTournamentBreakConfig(tournamentBreakForm)
  Object.assign(setupRoundEditForm.userDefinedData, defaultRoundDefaults().userDefinedData)
  Object.assign(setupRoundEditForm.break, normalizedBreakDefaults)
  Object.assign(setupRoundEditForm.compile, {
    ...defaultRoundDefaults().compile,
    source_rounds: [...defaultRoundDefaults().compile.source_rounds],
    options: normalizeCompileOptions(defaultRoundDefaults().compile.options),
  })
}

async function saveEditRoundFromSetup(round: any) {
  if (!tournamentId.value || !round?._id) return
  if (setupRoundEditingId.value !== String(round._id)) return
  setupRoundEditError.value = ''

  const roundNumber = Number(setupRoundEditForm.round)
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    setupRoundEditError.value = t('ラウンド番号を確認してください。')
    return
  }
  if (
    sortedRounds.value.some(
      (item) => String(item._id) !== String(round._id) && Number(item.round) === roundNumber
    )
  ) {
    setupRoundEditError.value = t('同じラウンド番号が既に存在します。')
    return
  }

  const currentUserDefined =
    round?.userDefinedData && typeof round.userDefinedData === 'object'
      ? ({ ...(round.userDefinedData as Record<string, any>) } as Record<string, any>)
      : {}
  const breakDefaults = normalizeTournamentBreakConfig(tournamentBreakForm)
  const normalizedBreak = normalizeBreakConfigForRoundEdit(currentUserDefined.break)
  const breakSizeRaw = Number(setupRoundEditForm.break.size)
  const breakSize =
    Number.isInteger(breakSizeRaw) && breakSizeRaw >= 1
      ? breakSizeRaw
      : breakDefaults.size
  const breakCutoffTiePolicy =
    setupRoundEditForm.break.cutoff_tie_policy === 'include_all' ||
    setupRoundEditForm.break.cutoff_tie_policy === 'strict'
      ? setupRoundEditForm.break.cutoff_tie_policy
      : breakDefaults.cutoff_tie_policy
  const compileSourceRounds = normalizeCompileSourceRoundsForRound(
    roundNumber,
    setupRoundEditForm.compile.source_rounds
  )
  const compileOptions = normalizeCompileOptions(setupRoundEditForm.compile.options)
  const { ranking_priority: _ignoredRankingPriority, ...compileOptionsWithoutRanking } =
    compileOptions as Record<string, any>
  void _ignoredRankingPriority
  const nextUserDefined: Record<string, any> = {
    ...currentUserDefined,
    ...setupRoundEditForm.userDefinedData,
    evaluator_in_team:
      setupRoundEditForm.userDefinedData.evaluator_in_team === 'speaker' ? 'speaker' : 'team',
    hidden: false,
    break_round: setupRoundEditForm.breakEnabled,
    break: {
      ...normalizedBreak,
      source: setupRoundEditForm.break.source === 'raw' ? 'raw' : 'submissions',
      size: breakSize,
      cutoff_tie_policy: breakCutoffTiePolicy,
      seeding: setupRoundEditForm.break.seeding,
    },
    compile: {
      source: setupRoundEditForm.compile.source === 'raw' ? 'raw' : 'submissions',
      source_rounds: compileSourceRounds,
      options: compileOptionsWithoutRanking,
    },
  }
  applyBreakRoundConstraints(nextUserDefined, setupRoundEditForm.breakEnabled)

  const updated = await rounds.updateRound({
    tournamentId: tournamentId.value,
    roundId: String(round._id),
    round: roundNumber,
    name: setupRoundEditForm.name.trim() || t('ラウンド {round}', { round: roundNumber }),
    userDefinedData: nextUserDefined,
  })
  if (!updated?._id) {
    setupRoundEditError.value = rounds.error ?? t('ラウンド更新に失敗しました。')
    return
  }

  closeSetupRoundDetails(String(round._id))
}

function resolveInstitutionName(id: string) {
  if (!id) return ''
  return institutions.institutions.find((inst) => inst._id === id)?.name ?? ''
}

function resolveInstitutionNames(ids: string[]) {
  return Array.from(
    new Set(
      ids
        .map((id) => resolveInstitutionName(String(id ?? '').trim()))
        .map((name) => String(name ?? '').trim())
        .filter(Boolean)
    )
  )
}

function institutionLabel(value?: string) {
  if (!value) return ''
  const token = String(value)
  const matched = institutions.institutions.find((inst) => inst._id === token)
  return matched?.name ?? token
}

function resolveTeamInstitutionIds(entity: any): string[] {
  const idsFromDetails: string[] = Array.isArray(entity?.details)
    ? entity.details.flatMap((detail: any) =>
        (detail?.conflicts ?? []).map((id: any) => String(id ?? '').trim())
      )
    : []
  const idsFromTemplate: string[] = Array.isArray(entity?.template?.conflicts)
    ? entity.template.conflicts.map((id: any) => String(id ?? '').trim())
    : []
  return Array.from(new Set([...idsFromDetails, ...idsFromTemplate].filter(Boolean)))
}

function teamInstitutionLabel(entity: any) {
  const detailNames = resolveInstitutionNames(resolveTeamInstitutionIds(entity))
  return detailNames.length > 0 ? detailNames.join(', ') : ''
}

function resolveTeamSpeakerIds(entity: any): string[] {
  const detailIds: string[] = Array.isArray(entity?.details)
    ? entity.details.flatMap((detail: any) => (detail?.speakers ?? []).map((id: any) => String(id)))
    : []
  const templateIds: string[] = Array.isArray(entity?.template?.speakers)
    ? entity.template.speakers.map((id: any) => String(id))
    : []
  return Array.from(new Set([...detailIds, ...templateIds].filter(Boolean)))
}

function teamSpeakerNames(entity: any): string[] {
  const speakerIds = resolveTeamSpeakerIds(entity)
  return speakerIds
    .map((id) => speakers.speakers.find((item) => item._id === id)?.name ?? '')
    .filter(Boolean)
}

function normalizeRoundDetailIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((entry: any) => String(entry ?? '').trim())
        .filter((entry) => entry.length > 0)
    )
  )
}

function managedRoundsForEntity(entity: any): number[] {
  const fromManaged = managedRoundNumbers.value
    .map((round) => Number(round))
    .filter((round) => Number.isInteger(round) && round >= 1)
  const fromDetails = Array.isArray(entity?.details)
    ? entity.details
        .map((detail: any) => Number(detail?.r))
        .filter((round: number) => Number.isInteger(round) && round >= 1)
    : []
  return Array.from(new Set([...fromManaged, ...fromDetails])).sort((left, right) => left - right)
}

function buildTeamEditDetailRows(entity: any) {
  const rounds = managedRoundsForEntity(entity)
  const template = entity?.template ?? {}
  const defaultAvailable =
    typeof template.available === 'boolean' ? Boolean(template.available) : true
  const defaultConflicts = normalizeRoundDetailIds(template?.conflicts ?? template?.institutions ?? [])
  const defaultSpeakers = normalizeRoundDetailIds(template?.speakers)

  return rounds.map((roundNumber) => {
    const detail = (entity?.details ?? []).find((row: any) => Number(row?.r) === Number(roundNumber)) ?? {}
    return {
      r: roundNumber,
      available: typeof detail?.available === 'boolean' ? Boolean(detail.available) : defaultAvailable,
      conflicts: normalizeRoundDetailIds(
        detail?.conflicts ?? detail?.institutions ?? defaultConflicts
      ),
      speakers: normalizeRoundDetailIds(detail?.speakers ?? defaultSpeakers),
    }
  })
}

function buildAdjudicatorEditDetailRows(entity: any) {
  const rounds = managedRoundsForEntity(entity)
  const template = entity?.template ?? {}
  const defaultAvailable =
    typeof template.available === 'boolean' ? Boolean(template.available) : true
  const defaultConflicts = normalizeRoundDetailIds(template?.conflicts ?? template?.institutions ?? [])
  const defaultConflictTeams = normalizeRoundDetailIds(template?.conflict_teams)

  return rounds.map((roundNumber) => {
    const detail = (entity?.details ?? []).find((row: any) => Number(row?.r) === Number(roundNumber)) ?? {}
    const hasConflictTeams = Array.isArray(detail?.conflict_teams)
    return {
      r: roundNumber,
      available: typeof detail?.available === 'boolean' ? Boolean(detail.available) : defaultAvailable,
      conflicts: normalizeRoundDetailIds(
        hasConflictTeams
          ? detail?.conflicts
          : detail?.institutions ?? detail?.conflicts ?? defaultConflicts
      ),
      conflict_teams: normalizeRoundDetailIds(
        hasConflictTeams ? detail?.conflict_teams : detail?.conflicts ?? defaultConflictTeams
      ),
    }
  })
}

function buildVenueEditDetailRows(entity: any) {
  const rounds = managedRoundsForEntity(entity)
  const template = entity?.template ?? {}
  const defaultAvailable =
    typeof template.available === 'boolean'
      ? Boolean(template.available)
      : typeof entity?.userDefinedData?.availableDefault === 'boolean'
        ? Boolean(entity.userDefinedData.availableDefault)
        : true
  const defaultPriority = Number.isFinite(Number(template?.priority))
    ? Number(template.priority)
    : 1

  return rounds.map((roundNumber) => {
    const detail = (entity?.details ?? []).find((row: any) => Number(row?.r) === Number(roundNumber)) ?? {}
    return {
      r: roundNumber,
      available: typeof detail?.available === 'boolean' ? Boolean(detail.available) : defaultAvailable,
      priority: Number.isFinite(Number(detail?.priority)) ? Number(detail.priority) : defaultPriority,
    }
  })
}

function buildTeamDetailsPayload(options: {
  selectedInstitutionIds: string[]
  selectedSpeakerIds: string[]
  roundNumbers: number[]
  existingDetails?: unknown
}) {
  const existingList = Array.isArray(options.existingDetails)
    ? options.existingDetails
        .map((detail: any) => ({
          r: Number(detail?.r),
          available: typeof detail?.available === 'boolean' ? detail.available : true,
        }))
        .filter((detail: { r: number }) => Number.isFinite(detail.r) && detail.r >= 1)
    : []

  const roundSet = new Set<number>(
    options.roundNumbers.map((value) => Number(value)).filter((value) => value >= 1)
  )
  existingList.forEach((detail) => {
    roundSet.add(detail.r)
  })
  const rounds = Array.from(roundSet).sort((left, right) => left - right)

  if (
    rounds.length === 0 ||
    (options.selectedInstitutionIds.length === 0 &&
      options.selectedSpeakerIds.length === 0 &&
      existingList.length === 0)
  ) {
    return undefined
  }

  const availableByRound = new Map<number, boolean>()
  existingList.forEach((detail) => {
    availableByRound.set(detail.r, detail.available)
  })

  return rounds.map((roundNumber) => ({
    r: roundNumber,
    available: availableByRound.get(roundNumber) ?? true,
    conflicts: options.selectedInstitutionIds.slice(),
    speakers: options.selectedSpeakerIds.slice(),
  }))
}

function buildTeamTemplatePayload(options: { selectedInstitutionIds: string[]; selectedSpeakerIds: string[] }) {
  return {
    available: true,
    conflicts: options.selectedInstitutionIds.slice(),
    speakers: options.selectedSpeakerIds.slice(),
  }
}

function normalizeInstitutionCategory(value?: string): InstitutionCategory {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  if (normalized === 'region' || normalized === 'league') return normalized
  return 'institution'
}

function institutionCategoryLabel(value?: string) {
  return normalizeInstitutionCategory(value)
}

function institutionCategorySectionLabel(value: InstitutionCategory) {
  return value
}

function buildInstitutionOptionGroups(list: Institution[]): InstitutionOptionGroup[] {
  const grouped: Record<InstitutionCategory, Institution[]> = {
    institution: [],
    region: [],
    league: [],
  }
  for (const inst of list) {
    grouped[normalizeInstitutionCategory(inst.category)].push(inst)
  }
  return institutionCategoryOrder
    .map((category) => ({
      category,
      label: institutionCategorySectionLabel(category),
      items: grouped[category],
    }))
    .filter((group) => group.items.length > 0)
}

function institutionPriorityValue(value?: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 1
  return Math.round(parsed * 1000) / 1000
}

function resolveAdjudicatorInstitutionIds(entity: any): string[] {
  const detailIds = Array.isArray(entity?.details)
    ? entity.details.flatMap((detail: any) => (detail?.conflicts ?? []).map((id: any) => String(id)))
    : []
  const templateIds = Array.isArray(entity?.template?.conflicts)
    ? entity.template.conflicts.map((id: any) => String(id))
    : []
  return Array.from(new Set([...detailIds, ...templateIds].filter(Boolean)))
}

function resolveAdjudicatorConflictIds(entity: any): string[] {
  const detailIds = Array.isArray(entity?.details)
    ? entity.details.flatMap((detail: any) =>
        (detail?.conflict_teams ?? []).map((id: any) => String(id))
      )
    : []
  const templateIds = Array.isArray(entity?.template?.conflict_teams)
    ? entity.template.conflict_teams.map((id: any) => String(id))
    : []
  return Array.from(new Set([...detailIds, ...templateIds].filter(Boolean)))
}

async function handleCreateTeam() {
  if (!teamForm.name) return
  const details = buildTeamDetailsPayload({
    selectedInstitutionIds: teamInstitutionIds.value,
    selectedSpeakerIds: teamSelectedSpeakerIds.value,
    roundNumbers: managedRoundNumbers.value,
  })
  const template = buildTeamTemplatePayload({
    selectedInstitutionIds: teamInstitutionIds.value,
    selectedSpeakerIds: teamSelectedSpeakerIds.value,
  })
  await teams.createTeam({
    tournamentId: tournamentId.value,
    name: teamForm.name,
    template,
    details,
  })
  teamForm.name = ''
  teamInstitutionIds.value = []
  teamInstitutionSearch.value = ''
  teamSelectedSpeakerIds.value = []
  teamSpeakerSearch.value = ''
}

async function handleCreateAdjudicator() {
  if (!adjudicatorForm.name) return
  const targetRounds = managedRoundNumbers.value.length > 0 ? managedRoundNumbers.value : [1]
  const details =
    targetRounds.length > 0 &&
    (adjudicatorInstitutionIds.value.length > 0 || adjudicatorConflictIds.value.length > 0)
      ? targetRounds.map((roundNumber) => ({
          r: roundNumber,
          available: true,
          conflicts: adjudicatorInstitutionIds.value.slice(),
          conflict_teams: adjudicatorConflictIds.value.slice(),
        }))
      : undefined
  const template = {
    available: true,
    conflicts: adjudicatorInstitutionIds.value.slice(),
    conflict_teams: adjudicatorConflictIds.value.slice(),
  }
  await adjudicators.createAdjudicator({
    tournamentId: tournamentId.value,
    name: adjudicatorForm.name,
    preev: adjudicatorForm.preev,
    template,
    details,
  })
  adjudicatorForm.name = ''
  adjudicatorForm.preev = 0
  adjudicatorInstitutionIds.value = []
  adjudicatorInstitutionSearch.value = ''
  adjudicatorConflictIds.value = []
  adjudicatorConflictSearch.value = ''
}

async function handleCreateVenue() {
  if (!venueForm.name) return
  const targetRounds = managedRoundNumbers.value
  const defaultAvailable = Boolean(venueForm.available)
  const details =
    targetRounds.length > 0
      ? targetRounds.map((roundNumber) => ({
          r: roundNumber,
          available: defaultAvailable,
          priority: 1,
        }))
      : undefined
  await venues.createVenue({
    tournamentId: tournamentId.value,
    name: venueForm.name,
    template: {
      available: defaultAvailable,
      priority: 1,
    },
    details,
    userDefinedData: {
      availableDefault: defaultAvailable,
    },
  })
  venueForm.name = ''
  venueForm.available = true
}

async function handleCreateSpeaker() {
  if (!speakerForm.name) return
  await speakers.createSpeaker({ tournamentId: tournamentId.value, name: speakerForm.name })
  speakerForm.name = ''
}

async function handleCreateInstitution() {
  if (!institutionForm.name) return
  const category = institutionCategoryLabel(institutionForm.category)
  const priority = institutionPriorityValue(institutionForm.priority)
  await institutions.createInstitution({
    tournamentId: tournamentId.value,
    name: institutionForm.name,
    category,
    priority,
  })
  institutionForm.name = ''
  institutionForm.category = 'institution'
  institutionForm.priority = 1
}

function openEntityImportModal(type: EntityTabKey) {
  entityImportType.value = type
  entityImportText.value = ''
  entityImportError.value = null
  showEntityImportModal.value = true
}

function closeEntityImportModal() {
  showEntityImportModal.value = false
  entityImportType.value = null
  entityImportText.value = ''
  entityImportError.value = null
}

async function handleEntityImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  entityImportError.value = null
  entityImportText.value = await file.text()
  input.value = ''
}

function openDeleteEntityModal(type: DeleteEntityType, id: string) {
  if (!id) return
  deleteEntityModalError.value = ''
  deleteEntityModal.value = { type, id }
}

function closeDeleteEntityModal() {
  deleteEntityModalError.value = ''
  deleteEntityModal.value = null
}

async function confirmDeleteEntity() {
  const modal = deleteEntityModal.value
  if (!modal) return
  deleteEntityModalError.value = ''
  if (modal.type === 'team') {
    const deleted = await teams.deleteTeam(tournamentId.value, modal.id)
    if (!deleted) {
      deleteEntityModalError.value = teams.error ?? t('チームの削除に失敗しました。')
      teams.error = null
      return
    }
    closeDeleteEntityModal()
    return
  }
  if (modal.type === 'adjudicator') {
    const deleted = await adjudicators.deleteAdjudicator(tournamentId.value, modal.id)
    if (!deleted) {
      deleteEntityModalError.value = adjudicators.error ?? t('ジャッジの削除に失敗しました。')
      adjudicators.error = null
      return
    }
    closeDeleteEntityModal()
    return
  }
  if (modal.type === 'venue') {
    const deleted = await venues.deleteVenue(tournamentId.value, modal.id)
    if (!deleted) {
      deleteEntityModalError.value = venues.error ?? t('会場の削除に失敗しました。')
      venues.error = null
      return
    }
    closeDeleteEntityModal()
    return
  }
  if (modal.type === 'speaker') {
    const deleted = await speakers.deleteSpeaker(tournamentId.value, modal.id)
    if (!deleted) {
      deleteEntityModalError.value = speakers.error ?? t('スピーカーの削除に失敗しました。')
      speakers.error = null
      return
    }
    closeDeleteEntityModal()
    return
  }
  const deleted = await institutions.deleteInstitution(tournamentId.value, modal.id)
  if (!deleted) {
    deleteEntityModalError.value =
      institutions.error ?? t('コンフリクトグループの削除に失敗しました。')
    institutions.error = null
    return
  }
  closeDeleteEntityModal()
}

function removeTeam(id: string) {
  openDeleteEntityModal('team', id)
}

function removeAdjudicator(id: string) {
  openDeleteEntityModal('adjudicator', id)
}

function removeVenue(id: string) {
  openDeleteEntityModal('venue', id)
}

function removeSpeaker(id: string) {
  openDeleteEntityModal('speaker', id)
}

function removeInstitution(id: string) {
  openDeleteEntityModal('institution', id)
}

function isEntityInlineEditing(type: string, id: string): boolean {
  return (
    Boolean(editingEntity.value) &&
    String(editingEntity.value?.type ?? '') === String(type) &&
    String(editingEntity.value?.id ?? '') === String(id)
  )
}

function toggleEntityInlineEdit(type: string, entity: any) {
  const id = String(entity?._id ?? '').trim()
  if (!id) return
  if (isEntityInlineEditing(type, id)) {
    cancelEditEntity()
    return
  }
  startEditEntity(type, entity)
}

const roundDetailExpanded = ref<Record<string, boolean>>({})

function roundDetailExpandKey(roundNumber: number): string {
  const current = editingEntity.value
  return `${String(current?.type ?? '')}:${String(current?.id ?? '')}:${Number(roundNumber)}`
}

function isRoundDetailExpanded(roundNumber: number): boolean {
  if (!editingEntity.value) return false
  const key = roundDetailExpandKey(roundNumber)
  return roundDetailExpanded.value[key] !== false
}

function toggleRoundDetailExpanded(roundNumber: number) {
  if (!editingEntity.value) return
  const key = roundDetailExpandKey(roundNumber)
  const current = roundDetailExpanded.value[key] !== false
  roundDetailExpanded.value = {
    ...roundDetailExpanded.value,
    [key]: !current,
  }
}

function resetRoundDetailExpanded(rows: Array<{ r: number }>) {
  if (!editingEntity.value) {
    roundDetailExpanded.value = {}
    return
  }
  const next: Record<string, boolean> = {}
  rows.forEach((row, index) => {
    next[roundDetailExpandKey(Number(row.r))] = index === 0
  })
  roundDetailExpanded.value = next
}

function adjustDetailPriority(row: any, delta: number) {
  const current = Number(row?.priority ?? 1)
  const next = Number.isFinite(current) ? current + delta : 1
  row.priority = Math.max(1, Math.round(next))
}

function adjustEntityFormScore(field: 'preev', delta: number) {
  const current = Number(entityForm[field] ?? 0)
  const next = Number.isFinite(current) ? current + delta : 0
  const clamped = Math.min(10, Math.max(0, next))
  entityForm[field] = Math.round(clamped * 10) / 10
}

function adjustEntityFormPriority(delta: number) {
  const current = Number(entityForm.priority ?? 1)
  const next = Number.isFinite(current) ? current + delta : 1
  entityForm.priority = Math.round(Math.max(0, next) * 1000) / 1000
}

function startEditEntity(type: string, entity: any) {
  editingEntity.value = { type, id: entity._id }
  entityForm.name = entity.name ?? ''
  entityForm.preev = entity.preev ?? 0
  entityForm.category = institutionCategoryLabel(entity.category)
  entityForm.priority = institutionPriorityValue(entity.priority)
  if (type === 'team') {
    detailRows.value = buildTeamEditDetailRows(entity)
  } else if (type === 'adjudicator') {
    detailRows.value = buildAdjudicatorEditDetailRows(entity)
  } else if (type === 'venue') {
    detailRows.value = buildVenueEditDetailRows(entity)
  } else {
    detailRows.value = []
  }
  resetRoundDetailExpanded(detailRows.value)
  entityError.value = null
}

function cancelEditEntity() {
  editingEntity.value = null
  detailRows.value = []
  roundDetailExpanded.value = {}
}

async function saveEntityEdit() {
  if (!editingEntity.value) return
  entityError.value = null

  const id = editingEntity.value.id
  if (editingEntity.value.type === 'team') {
    const details = detailRows.value.map((row: any) => ({
      r: Number(row?.r),
      available: row?.available !== false,
      conflicts: normalizeRoundDetailIds(row?.conflicts),
      speakers: normalizeRoundDetailIds(row?.speakers),
    }))
    const firstDetail = details[0]
    const template = {
      available: firstDetail ? firstDetail.available !== false : true,
      conflicts: firstDetail ? normalizeRoundDetailIds(firstDetail.conflicts) : [],
      speakers: firstDetail ? normalizeRoundDetailIds(firstDetail.speakers) : [],
    }
    const updated = await teams.updateTeam({
      tournamentId: tournamentId.value,
      teamId: id,
      name: entityForm.name,
      template,
      details: details.length > 0 ? details : undefined,
    })
    if (!updated?._id) {
      entityError.value = teams.error ?? t('チームの更新に失敗しました。')
      teams.error = null
      return
    }
  } else if (editingEntity.value.type === 'adjudicator') {
    const details = detailRows.value.map((row: any) => ({
      r: Number(row?.r),
      available: row?.available !== false,
      conflicts: normalizeRoundDetailIds(row?.conflicts),
      conflict_teams: normalizeRoundDetailIds(row?.conflict_teams),
    }))
    const firstDetail = details[0]
    const template = {
      available: firstDetail ? firstDetail.available !== false : true,
      conflicts: firstDetail ? normalizeRoundDetailIds(firstDetail.conflicts) : [],
      conflict_teams: firstDetail ? normalizeRoundDetailIds(firstDetail.conflict_teams) : [],
    }
    const updated = await adjudicators.updateAdjudicator({
      tournamentId: tournamentId.value,
      adjudicatorId: id,
      name: entityForm.name,
      preev: Number(entityForm.preev),
      template,
      details: details.length > 0 ? details : undefined,
    })
    if (!updated?._id) {
      entityError.value = adjudicators.error ?? t('ジャッジの更新に失敗しました。')
      adjudicators.error = null
      return
    }
  } else if (editingEntity.value.type === 'venue') {
    const details = detailRows.value.map((row: any) => ({
      r: Number(row?.r),
      available: row?.available !== false,
      priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 1,
    }))
    const firstDetail = details[0]
    const template = {
      available: firstDetail ? firstDetail.available !== false : true,
      priority: firstDetail ? firstDetail.priority : 1,
    }
    const updated = await venues.updateVenue({
      tournamentId: tournamentId.value,
      venueId: id,
      name: entityForm.name,
      template,
      details: details.length > 0 ? details : undefined,
      userDefinedData: {
        availableDefault: firstDetail ? firstDetail.available !== false : true,
      },
    })
    if (!updated?._id) {
      entityError.value = venues.error ?? t('会場の更新に失敗しました。')
      venues.error = null
      return
    }
  } else if (editingEntity.value.type === 'speaker') {
    const updated = await speakers.updateSpeaker({
      tournamentId: tournamentId.value,
      speakerId: id,
      name: entityForm.name,
    })
    if (!updated?._id) {
      entityError.value = speakers.error ?? t('スピーカーの更新に失敗しました。')
      speakers.error = null
      return
    }
  } else if (editingEntity.value.type === 'institution') {
    const category = institutionCategoryLabel(entityForm.category)
    const priority = institutionPriorityValue(entityForm.priority)
    const updated = await institutions.updateInstitution({
      tournamentId: tournamentId.value,
      institutionId: id,
      name: entityForm.name,
      category,
      priority,
    })
    if (!updated?._id) {
      entityError.value = institutions.error ?? t('コンフリクトグループの更新に失敗しました。')
      institutions.error = null
      return
    }
  }
  cancelEditEntity()
}

function adjudicatorInstitutionsLabel(adjudicator: any) {
  const detailIds: string[] = Array.isArray(adjudicator?.details)
    ? adjudicator.details.flatMap((detail: any) =>
        (detail?.conflicts ?? []).map((id: any) => String(id))
      )
    : []
  const templateIds: string[] = Array.isArray(adjudicator?.template?.conflicts)
    ? adjudicator.template.conflicts.map((id: any) => String(id))
    : []
  const ids = [...detailIds, ...templateIds]
  const unique = Array.from(
    new Set(
      ids
        .map((id: string) => institutionLabel(id))
        .filter((name: string): name is string => Boolean(name))
    )
  )
  return unique.length > 0 ? unique.join(', ') : t('未設定')
}

async function importEntitiesFromText(type: EntityTabKey, text: string) {
  const roundNumbers = sortedRounds.value
    .map((round) => Number(round.round))
    .filter((roundNumber) => Number.isInteger(roundNumber) && roundNumber >= 1)

  const { payload, errors } = buildEntityImportPayload({
    type,
    text,
    tournamentId: tournamentId.value,
    roundNumbers,
    teams: teams.teams.map((team) => ({
      _id: String(team._id),
      name: String(team.name ?? ''),
    })),
    speakers: speakers.speakers.map((speaker) => ({
      _id: String(speaker._id),
      name: String(speaker.name ?? ''),
    })),
    institutions: institutions.institutions.map((institution) => ({
      _id: String(institution._id),
      name: String(institution.name ?? ''),
    })),
    institutionCategoryLabel,
    institutionPriorityValue,
  })

  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }

  if (payload.length === 0) {
    throw new Error(t('取り込み可能な行がありません。'))
  }
  const endpoint =
    type === 'teams'
      ? '/teams'
      : type === 'adjudicators'
        ? '/adjudicators'
        : type === 'venues'
          ? '/venues'
          : type === 'speakers'
            ? '/speakers'
            : '/institutions'
  await api.post(endpoint, payload)
  await refreshEntities()
}

async function applyEntityImport() {
  if (!entityImportType.value) return
  entityImportError.value = null
  csvError.value = null
  try {
    await importEntitiesFromText(entityImportType.value, entityImportText.value)
    closeEntityImportModal()
  } catch (err: any) {
    const message =
      err?.response?.data?.errors?.[0]?.message ?? err?.message ?? t('CSV取り込みに失敗しました')
    entityImportError.value = message
    csvError.value = message
  }
}

watch(
  participantUrl,
  (url) => {
    if (!url) {
      qrError.value = ''
      qrCodeDataUrl.value = ''
      return
    }
    generateQrCode(url)
  },
  { immediate: true }
)

watch(
  () => [
    tournamentForm.style,
    tournamentForm.hidden,
    tournamentForm.accessRequired,
    tournamentForm.accessPassword,
  ],
  () => {
    queueTournamentAutosave()
  }
)

watch(
  tournamentId,
  () => {
    pendingTournamentAutosave.value = false
    isSavingTournamentAutosave.value = false
    isSavingNotice.value = false
    isSavingTournamentBreak.value = false
    isSavingTournamentTeamRanking.value = false
    isSavingTournamentAdjudicatorRanking.value = false
    tournamentAutosaveStatus.value = 'idle'
    tournamentAutosaveError.value = ''
    noticeSaveError.value = ''
    noticeSaved.value = false
    tournamentBreakSaveError.value = ''
    tournamentBreakSaved.value = false
    tournamentTeamRankingSaveError.value = ''
    tournamentTeamRankingSaved.value = false
    tournamentAdjudicatorRankingSaveError.value = ''
    tournamentAdjudicatorRankingSaved.value = false
    if (tournamentAutosaveTimer) {
      window.clearTimeout(tournamentAutosaveTimer)
      tournamentAutosaveTimer = null
    }
    if (tournamentAutosaveStatusTimer) {
      window.clearTimeout(tournamentAutosaveStatusTimer)
      tournamentAutosaveStatusTimer = null
    }
    if (noticeSavedTimer) {
      window.clearTimeout(noticeSavedTimer)
      noticeSavedTimer = null
    }
    if (tournamentBreakSavedTimer) {
      window.clearTimeout(tournamentBreakSavedTimer)
      tournamentBreakSavedTimer = null
    }
    if (tournamentTeamRankingSavedTimer) {
      window.clearTimeout(tournamentTeamRankingSavedTimer)
      tournamentTeamRankingSavedTimer = null
    }
    if (tournamentAdjudicatorRankingSavedTimer) {
      window.clearTimeout(tournamentAdjudicatorRankingSavedTimer)
      tournamentAdjudicatorRankingSavedTimer = null
    }
    if (editingEntity.value) cancelEditEntity()
    if (setupRoundEditingId.value) cancelEditRoundFromSetup()
    setupRoundDeleteId.value = null
    showRoundDefaultsModal.value = false
    closeEntityImportModal()
    setupRoundDetailsOpen.value = {}
    refresh()
  },
  { immediate: true }
)

watch(
  sortedRounds,
  () => {
    const current = Number(setupRoundForm.round)
    const duplicate = sortedRounds.value.some((round) => Number(round.round) === current)
    if (!Number.isInteger(current) || current < 1 || duplicate) {
      setupRoundForm.round = setupSuggestedRoundNumber.value
    }
    const existingIds = new Set(sortedRounds.value.map((round) => String(round._id)))
    setupRoundDetailsOpen.value = Object.fromEntries(
      Object.entries(setupRoundDetailsOpen.value).filter(([id]) => existingIds.has(id))
    )
    if (
      setupRoundEditingId.value &&
      !sortedRounds.value.some((round) => String(round._id) === setupRoundEditingId.value)
    ) {
      cancelEditRoundFromSetup()
    }
    if (
      setupRoundDeleteId.value &&
      !sortedRounds.value.some((round) => String(round._id) === setupRoundDeleteId.value)
    ) {
      setupRoundDeleteId.value = null
    }
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  if (copyTimeout) {
    window.clearTimeout(copyTimeout)
  }
  if (tournamentAutosaveTimer) {
    window.clearTimeout(tournamentAutosaveTimer)
    tournamentAutosaveTimer = null
  }
  if (tournamentAutosaveStatusTimer) {
    window.clearTimeout(tournamentAutosaveStatusTimer)
    tournamentAutosaveStatusTimer = null
  }
  if (noticeSavedTimer) {
    window.clearTimeout(noticeSavedTimer)
    noticeSavedTimer = null
  }
  if (tournamentBreakSavedTimer) {
    window.clearTimeout(tournamentBreakSavedTimer)
    tournamentBreakSavedTimer = null
  }
  if (tournamentTeamRankingSavedTimer) {
    window.clearTimeout(tournamentTeamRankingSavedTimer)
    tournamentTeamRankingSavedTimer = null
  }
  if (tournamentAdjudicatorRankingSavedTimer) {
    window.clearTimeout(tournamentAdjudicatorRankingSavedTimer)
    tournamentAdjudicatorRankingSavedTimer = null
  }
})

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && setupRoundDeleteTarget.value) {
    closeSetupRoundDeleteModal()
  }
  if (event.key === 'Escape' && showRoundDefaultsModal.value) {
    showRoundDefaultsModal.value = false
  }
  if (event.key === 'Escape' && showEntityImportModal.value) {
    closeEntityImportModal()
  }
  if (event.key === 'Escape' && editingEntity.value) {
    cancelEditEntity()
  }
  if (event.key === 'Escape' && Object.keys(setupRoundDetailsOpen.value).length > 0) {
    closeSetupRoundDetails()
  }
}
</script>

<style scoped>
.grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.overview-setting-grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.overview-setting-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  background: var(--color-surface-muted);
  min-height: 160px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  height: 100%;
}

.overview-setting-card--collapsible {
  min-height: 0;
  height: auto;
}

.toggle-setting-card {
  gap: var(--space-2);
}

.password-setting-card {
  gap: var(--space-2);
}

.password-setting-card input {
  width: 100%;
  min-height: 44px;
}

.password-setting-card input:disabled,
.password-setting-card input.is-disabled {
  background: var(--color-surface-muted);
  color: var(--color-muted);
  border-color: var(--color-border);
  cursor: not-allowed;
  opacity: 0.7;
}

.password-setting-card .muted.small {
  margin: 0;
}

.notice-setting-card {
  min-height: 0;
}

.notice-actions {
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.ranking-priority-card :deep(.ranking-priority-group) {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0;
  gap: var(--space-2);
}

.ranking-priority-card :deep(.ranking-priority-group-head) {
  display: none;
}

.ranking-priority-card :deep(.priority-dnd-single) {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.overview-setting-card h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.overview-collapse-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  width: fit-content;
  border: none;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  padding: 0;
  margin: 0;
}

.overview-collapse-icon {
  width: 1.1em;
  text-align: center;
  font-weight: 700;
  line-height: 1;
}

.overview-collapse-title {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
}

.overview-collapse-head {
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.overview-collapse-note {
  margin: 0;
}

.tournament-name-row {
  align-items: center;
  gap: var(--space-2);
}

.tournament-name-row input {
  flex: 1 1 auto;
  margin-bottom: 0;
}

.tournament-name-submit {
  flex: 0 0 auto;
}

.setup-rounds-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.setup-round-form {
  align-items: end;
  grid-template-columns: minmax(132px, 180px) minmax(0, 1fr) auto;
}

.setup-round-number-field,
.setup-round-name-field {
  min-width: 0;
}

.setup-round-number-field input,
.setup-round-name-field input {
  width: 100%;
}

.create-actions {
  gap: var(--space-2);
  flex-wrap: nowrap;
  justify-content: flex-end;
}

.setup-round-list {
  padding-top: var(--space-1);
}

.setup-round-item {
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-surface);
}

.setup-round-item-head {
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.setup-round-motion-panel {
  border: 1px solid var(--color-border);
  gap: var(--space-2);
}

.setup-round-status-row {
  width: 100%;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.setup-round-details-open-button {
  border-color: var(--color-border);
  white-space: nowrap;
  margin-left: auto;
}

.setup-round-switches-wrap {
  flex: 1 1 auto;
  min-width: 0;
}

.setup-round-switches-wrap :deep(.publish-switch-status-row) {
  width: 100%;
  justify-content: flex-start;
}

.setup-round-edit-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.setup-round-item-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-left: auto;
}

.setup-round-details-modal {
  width: min(1180px, 100%);
}

.setup-round-details-body {
  gap: var(--space-2);
  padding: 0;
}

.setup-round-basic-panel {
  gap: var(--space-2);
}

.setup-round-config-group {
  padding: 0;
  gap: var(--space-2);
}

.settings-options-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.setting-option {
  align-items: center;
  gap: var(--space-2);
}

.settings-group-title {
  margin: 0;
}

.switch-control {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 30px;
}

.switch-label {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 700;
}

.overview-qr-card h4 {
  margin: 0;
}

.qr-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  gap: var(--space-5);
  align-items: start;
}

.qr-content {
  min-width: 0;
}

.qr-box {
  display: grid;
  place-items: center;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px dashed var(--color-border);
  background: var(--color-surface-muted);
  justify-self: end;
  align-self: start;
}

.qr-image {
  width: 220px;
  height: 220px;
  display: block;
}

.qr-url {
  display: block;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  word-break: break-all;
}

.qr-actions {
  flex-wrap: wrap;
}

.qr-actions :deep(.btn) {
  flex: 1 1 auto;
  justify-content: center;
}

.qr-actions :deep(.btn--secondary) {
  min-width: 140px;
}

.qr-copy-button {
  width: 100%;
}

.grid .full {
  grid-column: 1 / -1;
}

.aligned-field-grid > :deep(.field),
.aligned-field-grid > .availability-control {
  min-height: 96px;
}

.aligned-field-grid > .availability-control {
  align-items: flex-end;
}

.team-form-grid {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.entity-submit-row {
  grid-column: 1 / -1;
  justify-content: flex-start;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.availability-control {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
}

textarea {
  font-family:
    'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
}

.markdown-grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.markdown-preview {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface-muted);
  min-height: 180px;
}

.markdown-content {
  color: var(--color-text);
}

.markdown-content :deep(p:first-child) {
  margin-top: 0;
}

.detail-row {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px var(--space-2);
  display: grid;
  gap: var(--space-2);
}

.entity-inline-editor {
  grid-column: 1 / -1;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-surface-muted);
  gap: var(--space-2);
}

.entity-round-details {
  gap: var(--space-2);
}

.inline-edit-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: nowrap;
}

.inline-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.inline-control--grow {
  flex: 1 1 300px;
}

.inline-control-label {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.inline-control input:not([type='checkbox']),
.inline-control select {
  min-height: 40px;
  height: 40px;
  margin: 0;
}

.inline-control--grow input:not([type='checkbox']),
.inline-control--grow select {
  width: 100%;
}

.detail-row-head {
  justify-content: flex-start;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: nowrap;
}

.detail-row-head--compact {
  justify-content: flex-start;
}

.detail-row-head--compact > strong {
  margin-right: 16px;
}

.round-collapse-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border: none;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  padding: 0;
  margin-right: 16px;
}

.round-detail-switch {
  align-items: center;
  gap: var(--space-2);
  margin-left: 4px;
}

.round-detail-inline-line {
  align-items: flex-start;
  gap: var(--space-2);
  flex-wrap: nowrap;
}

.round-detail-inline-field {
  flex: 1 1 260px;
  min-width: 240px;
}

.compact-relation-picker {
  max-height: 144px;
}

.relation-choice {
  align-items: center;
  gap: var(--space-2);
}

.round-priority-inline {
  align-items: center;
  gap: var(--space-2);
  margin-left: 8px;
}

.institution-inline-row {
  align-items: center;
  gap: var(--space-2);
  flex-wrap: nowrap;
}

.institution-priority-inline {
  align-items: center;
  gap: var(--space-2);
}

.number-stepper {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.number-stepper :deep(.btn--sm) {
  min-height: 40px;
  height: 40px;
  padding: 0 10px;
}

.number-stepper input {
  width: 86px;
  min-height: 40px;
  height: 40px;
  text-align: center;
  margin: 0;
}

.entity-switch {
  flex-wrap: wrap;
  gap: var(--space-2);
}

.entity-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-muted);
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.entity-tab-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  min-height: 20px;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 0.66rem;
  letter-spacing: 0.02em;
  font-weight: 700;
  background: var(--color-surface-muted);
  color: var(--color-muted);
}

.entity-tab:hover {
  border-color: #bfdbfe;
  color: var(--color-primary);
}

.entity-tab.active {
  background: var(--color-secondary);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.entity-tab.active .entity-tab-step {
  background: rgba(37, 99, 235, 0.16);
  color: var(--color-primary);
}

.data-guide-header {
  gap: 6px;
}

.data-guide-row {
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.data-guide-row p {
  margin: 0;
}

.entity-panel :deep(.btn--sm) {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
}

.entity-block {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface);
}

.entity-block-title {
  margin: 0;
  font-size: 14px;
}

.block-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface-muted);
}

.relation-group {
  gap: 6px;
}

.relation-group input[type='text'] {
  margin-bottom: 0;
}

.relation-picker {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  max-height: 180px;
  overflow: auto;
  display: grid;
  gap: 4px;
  background: var(--color-surface);
}

.relation-item {
  padding: 2px 0;
}

.relation-subgroup {
  display: grid;
  gap: 4px;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: var(--space-1);
}

.relation-subgroup:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.relation-subgroup-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 0;
}

.relation-subgroup-title {
  font-weight: 600;
}

.relation-empty {
  margin: 0;
  padding: var(--space-1) 0;
}

.tight {
  gap: 4px;
}

.entity-list-item {
  padding: 10px 12px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: center;
}

.entity-primary {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.entity-inline-meta {
  white-space: nowrap;
}

.entity-secondary {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entity-list-item > .row {
  justify-content: flex-end;
  gap: var(--space-1);
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
  width: min(980px, 100%);
  max-height: calc(100vh - 80px);
  overflow: auto;
}

.modal-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.entity-edit-modal {
  gap: var(--space-4);
}

@media (max-width: 960px) {
  .setup-round-form {
    grid-template-columns: 1fr;
  }

  .create-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .setup-round-status-row {
    align-items: flex-start;
  }

  .setup-round-switches-wrap {
    width: 100%;
    margin-left: 0;
  }

  .setup-round-switches-wrap :deep(.publish-switch-status-row) {
    width: 100%;
    justify-content: flex-start;
  }

  .entity-list-item {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .entity-list-item > .row {
    justify-content: flex-start;
  }

  .team-form-grid {
    grid-template-columns: 1fr;
  }

  .detail-row-head,
  .round-detail-inline-line,
  .institution-inline-row,
  .inline-edit-row {
    flex-wrap: wrap;
  }

  .round-collapse-toggle {
    margin-right: 0;
  }

  .detail-row-head--compact > strong {
    margin-right: 0;
  }

  .round-detail-switch,
  .round-priority-inline {
    margin-left: 0;
  }
}

.error {
  color: var(--color-danger);
}

@media (max-width: 960px) {
  .overview-setting-grid {
    grid-template-columns: 1fr;
  }

  .qr-grid {
    grid-template-columns: 1fr;
  }

  .qr-box {
    display: none;
  }

  .markdown-grid {
    grid-template-columns: 1fr;
  }
}
</style>
