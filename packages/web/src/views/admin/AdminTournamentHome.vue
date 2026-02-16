<template>
  <section class="stack">
    <div class="row section-row">
      <h3 class="page-title">{{ activeSection === 'overview' ? $t('大会設定') : $t('大会データ管理') }}</h3>
    </div>
    <p v-if="activeSection === 'overview'" class="muted small">
      {{ $t('大会の基本情報と公開設定を管理します。') }}
    </p>
    <p v-else class="muted small">
      {{ $t('チーム・ジャッジ・スピーカー・所属機関・会場を管理します。') }}
    </p>

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
              <select v-model.number="tournamentForm.style" :id="id" :aria-describedby="describedBy">
                <option v-for="style in styles.styles" :key="style.id" :value="style.id">
                  {{ style.id }}: {{ style.name }}
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
              <ToggleSwitch v-model="tournamentForm.accessRequired" :aria-label="$t('大会パスワード設定')" />
              <span class="switch-label">{{ $t('設定') }}</span>
            </label>
            <input
              v-model="tournamentForm.accessPassword"
              :aria-label="$t('大会パスワード')"
              type="password"
              autocomplete="new-password"
            />
            <p class="muted small">{{ accessPasswordHelpText }}</p>
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
      </div>

      <article class="card stack setup-rounds-card">
        <div class="row setup-rounds-head">
          <h4>{{ $t('新規ラウンド作成') }}</h4>
        </div>
        <form class="grid setup-round-form" @submit.prevent="createRoundFromSetup">
          <Field :label="$t('ラウンド番号')" required v-slot="{ id, describedBy }">
            <input
              v-model.number="setupRoundForm.round"
              :id="id"
              :aria-describedby="describedBy"
              type="number"
              min="1"
            />
          </Field>
          <Field :label="$t('ラウンド名')" v-slot="{ id, describedBy }">
            <input
              v-model="setupRoundForm.name"
              :id="id"
              :aria-describedby="describedBy"
              type="text"
            />
          </Field>
          <Field :label="$t('種類')" v-slot="{ id, describedBy }">
            <select
              v-model="setupRoundForm.type"
              :id="id"
              :aria-describedby="describedBy"
            >
              <option value="standard">{{ $t('通常ラウンド') }}</option>
              <option value="break">{{ $t('ブレイク') }}</option>
            </select>
          </Field>
          <div class="row create-actions">
            <Button type="submit" :disabled="isLoading">{{ $t('追加') }}</Button>
            <Button
              type="button"
              variant="secondary"
              :disabled="isLoading"
              @click="showRoundDefaultsModal = true"
            >
              {{ $t('ラウンドデフォルト設定') }}
            </Button>
          </div>
        </form>
        <p class="muted small">
          {{ $t('新規ラウンドは大会セットアップのラウンドデフォルトを継承します。') }}
        </p>
        <p v-if="setupRoundError" class="error">{{ setupRoundError }}</p>
        <p class="muted small">{{ tournamentAutosaveText }}</p>
        <p v-if="sortedRounds.length === 0" class="muted small">{{ $t('ラウンドがまだありません。') }}</p>
        <div v-else class="stack setup-round-list">
          <div
            v-for="round in sortedRounds"
            :key="round._id"
            class="stack setup-round-item"
          >
            <div class="stack tight">
              <strong>{{ round.name || $t('ラウンド {round}', { round: round.round }) }}</strong>
              <span class="muted small">{{ $t('ラウンド番号') }}: {{ round.round }} / {{ roundTypeLabel(round) }}</span>
            </div>

            <div class="grid setup-round-status-grid">
              <article class="card soft stack setup-round-status-card">
                <h5>{{ $t('モーション公開') }}</h5>
                <label class="switch-control">
                  <span class="switch-label">{{ $t('非公開') }}</span>
                  <ToggleSwitch
                    :model-value="Boolean(round.motionOpened)"
                    :disabled="roundPublicationBusy"
                    :aria-label="$t('モーション公開')"
                    @update:model-value="(checked) => onSetupMotionOpenedChange(round, checked)"
                  />
                  <span class="switch-label">{{ $t('公開') }}</span>
                </label>
              </article>
              <article class="card soft stack setup-round-status-card">
                <h5>{{ $t('チーム割り当て') }}</h5>
                <label class="switch-control">
                  <span class="switch-label">{{ $t('非公開') }}</span>
                  <ToggleSwitch
                    :model-value="Boolean(round.teamAllocationOpened)"
                    :disabled="roundPublicationBusy"
                    :aria-label="$t('チーム割り当て')"
                    @update:model-value="(checked) => onSetupTeamAllocationChange(round, checked)"
                  />
                  <span class="switch-label">{{ $t('公開') }}</span>
                </label>
              </article>
              <article class="card soft stack setup-round-status-card">
                <h5>{{ $t('ジャッジ割り当て') }}</h5>
                <label class="switch-control">
                  <span class="switch-label">{{ $t('非公開') }}</span>
                  <ToggleSwitch
                    :model-value="Boolean(round.adjudicatorAllocationOpened)"
                    :disabled="roundPublicationBusy"
                    :aria-label="$t('ジャッジ割り当て')"
                    @update:model-value="(checked) => onSetupAdjudicatorAllocationChange(round, checked)"
                  />
                  <span class="switch-label">{{ $t('公開') }}</span>
                </label>
              </article>
              <article class="card soft stack setup-round-status-card">
                <h5>{{ $t('提出状況') }}</h5>
                <div class="status-line">
                  <span>{{ $t('スコアシート') }}</span>
                  <strong>{{ setupBallotSubmittedCount(round) }}/{{ setupBallotExpectedCount(round) }}</strong>
                </div>
                <div class="status-line">
                  <span>{{ $t('フィードバック') }}</span>
                  <strong>{{ setupFeedbackSubmittedCount(round) }}/{{ setupFeedbackExpectedCount(round) }}</strong>
                </div>
              </article>
            </div>

            <section class="card soft stack setup-round-motion-panel">
              <RoundMotionEditor
                :tournament-id="tournamentId"
                :round-id="String(round._id)"
                :saved-motion="Array.isArray(round.motions) ? String(round.motions[0] ?? '') : ''"
                :disabled="roundPublicationBusy"
              />
            </section>

            <details
              class="setup-round-details"
              :open="isSetupRoundDetailsOpen(round._id)"
              @toggle="onSetupRoundDetailsToggle(round, $event)"
            >
              <summary class="row setup-round-details-summary">
                <CollapseHeader
                  :title="$t('ラウンド詳細設定')"
                  :open="isSetupRoundDetailsOpen(round._id)"
                />
              </summary>
              <div v-if="isSetupRoundDetailsOpen(round._id)" class="stack setup-round-details-body">
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
                      <Field :label="$t('種類')" v-slot="{ id, describedBy }">
                        <select
                          v-model="setupRoundEditForm.type"
                          :id="id"
                          :aria-describedby="describedBy"
                        >
                          <option value="standard">{{ $t('通常ラウンド') }}</option>
                          <option value="break">{{ $t('ブレイク') }}</option>
                        </select>
                      </Field>
                    </div>
                    <section class="stack setup-round-config-group">
                      <RoundOptionEditor
                        v-model:evaluate-from-adjudicators="setupRoundEditForm.userDefinedData.evaluate_from_adjudicators"
                        v-model:evaluate-from-teams="setupRoundEditForm.userDefinedData.evaluate_from_teams"
                        v-model:chairs-always-evaluated="setupRoundEditForm.userDefinedData.chairs_always_evaluated"
                        v-model:evaluator-in-team="setupRoundEditForm.userDefinedData.evaluator_in_team"
                        v-model:no-speaker-score="setupRoundEditForm.userDefinedData.no_speaker_score"
                        v-model:allow-low-tie-win="setupRoundEditForm.userDefinedData.allow_low_tie_win"
                        v-model:score-by-matter-manner="setupRoundEditForm.userDefinedData.score_by_matter_manner"
                        v-model:poi="setupRoundEditForm.userDefinedData.poi"
                        v-model:best="setupRoundEditForm.userDefinedData.best"
                        :disabled="isLoading"
                      />
                    </section>
                    <section class="stack setup-round-config-group">
                      <CompileOptionsEditor
                        v-model:source="setupRoundEditForm.compile.source"
                        v-model:source-rounds="setupRoundEditForm.compile.source_rounds"
                        v-model:ranking-preset="setupRoundEditForm.compile.options.ranking_priority.preset"
                        v-model:ranking-order="setupRoundEditForm.compile.options.ranking_priority.order"
                        v-model:winner-policy="setupRoundEditForm.compile.options.winner_policy"
                        v-model:tie-points="setupRoundEditForm.compile.options.tie_points"
                        v-model:merge-policy="setupRoundEditForm.compile.options.duplicate_normalization.merge_policy"
                        v-model:poi-aggregation="setupRoundEditForm.compile.options.duplicate_normalization.poi_aggregation"
                        v-model:best-aggregation="setupRoundEditForm.compile.options.duplicate_normalization.best_aggregation"
                        v-model:missing-data-policy="setupRoundEditForm.compile.options.missing_data_policy"
                        v-model:include-labels="setupRoundEditForm.compile.options.include_labels"
                        :show-source-rounds="true"
                        :source-round-options="compileSourceRoundSelectOptions(Number(setupRoundEditForm.round))"
                        :disabled="isLoading"
                      />
                    </section>
                    <section v-if="setupRoundEditForm.type === 'break'" class="stack setup-round-config-group">
                      <BreakPolicyEditor
                        v-model:source="setupRoundEditForm.break.source"
                        v-model:size="setupRoundEditForm.break.size"
                        v-model:cutoff-tie-policy="setupRoundEditForm.break.cutoff_tie_policy"
                        v-model:seeding="setupRoundEditForm.break.seeding"
                        :disabled="isLoading"
                      />
                    </section>
                    <div class="row setup-round-item-actions">
                      <Button size="sm" :disabled="isLoading" @click="saveEditRoundFromSetup(round)">
                        {{ $t('保存') }}
                      </Button>
                      <Button variant="ghost" size="sm" :disabled="isLoading" @click="cancelEditRoundFromSetup">
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
            </details>
          </div>
        </div>
      </article>

      <article class="card stack overview-qr-card">
        <div class="row overview-qr-head">
          <h4>{{ $t('参加者アクセス用QRコード') }}</h4>
        </div>
        <p class="muted small">{{ $t('参加者がスマホで読み取って大会ページを開けます。') }}</p>
        <div v-if="participantUrl" class="qr-grid">
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
          <div class="stack">
            <div class="muted small">{{ $t('大会アクセスURL') }}</div>
            <code class="qr-url">{{ participantUrl }}</code>
            <div class="row qr-actions">
              <Button variant="secondary" size="sm" @click="copyParticipantUrl">
                {{ copyStatus === 'copied' ? $t('コピーしました。') : $t('URLをコピー') }}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                :href="participantUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ $t('参加者画面を開く') }}
              </Button>
            </div>
            <p v-if="copyStatus === 'error'" class="error small">{{ copyError }}</p>
            <p class="muted small">
              {{ $t('大会パスワードが必要な場合、参加者は表示された画面で入力します。') }}
            </p>
          </div>
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
          {{ tab.label }}
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
              <Field
                class="team-institution-field"
                :label="$t('所属機関')"
                v-slot="{ id, describedBy }"
              >
                <select v-model="teamForm.institutionId" :id="id" :aria-describedby="describedBy">
                  <option value="">{{ $t('未選択') }}</option>
                  <option
                    v-for="inst in institutions.institutions"
                    :key="inst._id"
                    :value="inst._id"
                  >
                    {{ inst.name }}
                  </option>
                </select>
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
              :placeholder="$t('名前/所属/スピーカーで検索')"
            />
          </Field>
          <p v-if="teams.error" class="error">{{ teams.error }}</p>
          <ul class="list compact">
            <li v-for="team in visibleTeams" :key="team._id" class="list-item entity-list-item">
              <div class="entity-primary">
                <strong>{{ team.name }}</strong>
                <span class="muted small entity-inline-meta">
                  {{ institutionLabel(team.institution) || $t('所属機関なし') }}
                </span>
              </div>
              <div class="muted entity-secondary">{{ team.speakers?.map((s) => s.name).join(', ') }}</div>
              <div class="row">
                <Button variant="ghost" size="sm" @click="startEditEntity('team', team)">
                  {{ $t('編集') }}
                </Button>
                <Button variant="danger" size="sm" @click="removeTeam(team._id)">
                  {{ $t('削除') }}
                </Button>
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
            <form class="grid" @submit.prevent="handleCreateAdjudicator">
              <Field :label="$t('名前')" required v-slot="{ id, describedBy }">
                <input
                  v-model="adjudicatorForm.name"
                  type="text"
                  :id="id"
                  :aria-describedby="describedBy"
                />
              </Field>
              <Field :label="$t('強さ')" :help="$t('推奨範囲: 0〜10')" v-slot="{ id, describedBy }">
                <input
                  v-model.number="adjudicatorForm.strength"
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  :id="id"
                  :aria-describedby="describedBy"
                />
              </Field>
              <Field
                :label="$t('事前評価')"
                :help="$t('推奨範囲: 0〜10')"
                v-slot="{ id, describedBy }"
              >
                <input
                  v-model.number="adjudicatorForm.preev"
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  :id="id"
                  :aria-describedby="describedBy"
                />
              </Field>
              <div class="availability-control">
                <label class="row small">
                  <input v-model="adjudicatorForm.active" type="checkbox" />
                  <span>{{ $t('大会参加可能（デフォルト値）') }}</span>
                </label>
              </div>
              <div class="stack full relation-group">
                <span class="field-label">{{ $t('所属機関') }}</span>
                <input
                  v-model="adjudicatorInstitutionSearch"
                  type="text"
                  :placeholder="$t('機関名で検索')"
                />
                <div class="relation-picker">
                  <label
                    v-for="inst in filteredAdjudicatorInstitutionOptions"
                    :key="inst._id"
                    class="row small relation-item"
                  >
                    <input v-model="adjudicatorInstitutionIds" type="checkbox" :value="inst._id" />
                    <span>{{ inst.name }}</span>
                  </label>
                </div>
                <p class="muted small">
                  {{ $t('選択済み: {count}件', { count: adjudicatorInstitutionIds.length }) }}
                </p>
              </div>
              <div class="stack full relation-group">
                <span class="field-label">{{ $t('衝突チーム') }}</span>
                <input
                  v-model="adjudicatorConflictSearch"
                  type="text"
                  :placeholder="$t('検索してチームを絞り込む')"
                />
                <div class="relation-picker">
                  <label
                    v-for="team in filteredAdjudicatorConflictTeams"
                    :key="team._id"
                    class="row small relation-item"
                  >
                    <input v-model="adjudicatorConflictIds" type="checkbox" :value="team._id" />
                    <span>{{ team.name }}</span>
                  </label>
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
                <span class="muted small entity-inline-meta">{{ adjudicatorInstitutionsLabel(adj) }}</span>
              </div>
              <div class="muted entity-secondary">
                {{ $t('事前評価') }} {{ adj.preev ?? 0 }} / {{ $t('強さ') }} {{ adj.strength ?? 0 }}
              </div>
              <div class="row">
                <Button variant="ghost" size="sm" @click="startEditEntity('adjudicator', adj)">
                  {{ $t('編集') }}
                </Button>
                <Button variant="danger" size="sm" @click="removeAdjudicator(adj._id)">
                  {{ $t('削除') }}
                </Button>
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
                <Button variant="ghost" size="sm" @click="startEditEntity('venue', venue)">
                  {{ $t('編集') }}
                </Button>
                <Button variant="danger" size="sm" @click="removeVenue(venue._id)">
                  {{ $t('削除') }}
                </Button>
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
                <Button variant="ghost" size="sm" @click="startEditEntity('speaker', speaker)">
                  {{ $t('編集') }}
                </Button>
                <Button variant="danger" size="sm" @click="removeSpeaker(speaker._id)">
                  {{ $t('削除') }}
                </Button>
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
            <form class="grid" @submit.prevent="handleCreateInstitution">
              <Field :label="$t('機関名')" required v-slot="{ id, describedBy }">
                <input
                  v-model="institutionForm.name"
                  type="text"
                  :id="id"
                  :aria-describedby="describedBy"
                />
              </Field>
              <Field :label="$t('カテゴリ')" v-slot="{ id, describedBy }">
                <input
                  v-model="institutionForm.category"
                  type="text"
                  :id="id"
                  :aria-describedby="describedBy"
                  :placeholder="$t('例: institution / region / league')"
                />
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
              :placeholder="$t('機関名で検索')"
            />
          </Field>
          <p v-if="institutions.error" class="error">{{ institutions.error }}</p>
          <ul class="list compact">
            <li
              v-for="inst in visibleInstitutions"
              :key="inst._id"
              class="list-item entity-list-item"
            >
              <div>
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
                <Button variant="ghost" size="sm" @click="startEditEntity('institution', inst)">
                  {{ $t('編集') }}
                </Button>
                <Button variant="danger" size="sm" @click="removeInstitution(inst._id)">
                  {{ $t('削除') }}
                </Button>
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
          <strong>{{ $t('ラウンドデフォルト設定') }}</strong>
          <Button variant="ghost" size="sm" @click="showRoundDefaultsModal = false">{{
            $t('閉じる')
          }}</Button>
        </div>
        <section class="stack setup-round-config-group">
          <RoundOptionEditor
            v-model:evaluate-from-adjudicators="roundDefaultsForm.userDefinedData.evaluate_from_adjudicators"
            v-model:evaluate-from-teams="roundDefaultsForm.userDefinedData.evaluate_from_teams"
            v-model:chairs-always-evaluated="roundDefaultsForm.userDefinedData.chairs_always_evaluated"
            v-model:evaluator-in-team="roundDefaultsForm.userDefinedData.evaluator_in_team"
            v-model:no-speaker-score="roundDefaultsForm.userDefinedData.no_speaker_score"
            v-model:allow-low-tie-win="roundDefaultsForm.userDefinedData.allow_low_tie_win"
            v-model:score-by-matter-manner="roundDefaultsForm.userDefinedData.score_by_matter_manner"
            v-model:poi="roundDefaultsForm.userDefinedData.poi"
            v-model:best="roundDefaultsForm.userDefinedData.best"
            :disabled="isLoading"
          />
        </section>
        <section class="stack setup-round-config-group">
          <CompileOptionsEditor
            v-model:source="roundDefaultsForm.compile.source"
            v-model:source-rounds="roundDefaultsForm.compile.source_rounds"
            v-model:ranking-preset="roundDefaultsForm.compile.options.ranking_priority.preset"
            v-model:ranking-order="roundDefaultsForm.compile.options.ranking_priority.order"
            v-model:winner-policy="roundDefaultsForm.compile.options.winner_policy"
            v-model:tie-points="roundDefaultsForm.compile.options.tie_points"
            v-model:merge-policy="roundDefaultsForm.compile.options.duplicate_normalization.merge_policy"
            v-model:poi-aggregation="roundDefaultsForm.compile.options.duplicate_normalization.poi_aggregation"
            v-model:best-aggregation="roundDefaultsForm.compile.options.duplicate_normalization.best_aggregation"
            v-model:missing-data-policy="roundDefaultsForm.compile.options.missing_data_policy"
            v-model:include-labels="roundDefaultsForm.compile.options.include_labels"
            :disabled="isLoading"
          />
        </section>
        <section v-if="setupRoundForm.type === 'break'" class="stack setup-round-config-group">
          <BreakPolicyEditor
            v-model:source="roundDefaultsForm.break.source"
            v-model:size="roundDefaultsForm.break.size"
            v-model:cutoff-tie-policy="roundDefaultsForm.break.cutoff_tie_policy"
            v-model:seeding="roundDefaultsForm.break.seeding"
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

    <ImportTextModal
      :open="activeSection === 'data' && showEntityImportModal"
      v-model:text="entityImportText"
      :title="entityImportTitle"
      :help-text="entityImportHelpText"
      :placeholder="entityImportPlaceholder"
      :description="entityImportDescription"
      :example="entityImportExample"
      :error="entityImportError"
      :disabled="isLoading"
      @file-change="handleEntityImportFile"
      @close="closeEntityImportModal"
      @submit="applyEntityImport"
    />

    <div
      v-if="activeSection === 'data' && editingEntity"
      class="modal-backdrop"
      role="presentation"
      @click.self="cancelEditEntity"
    >
      <div class="modal card stack entity-edit-modal" role="dialog" aria-modal="true">
        <div class="row">
          <strong>{{ editingTitle }}</strong>
          <Button variant="ghost" size="sm" @click="cancelEditEntity">{{ $t('閉じる') }}</Button>
        </div>
        <div class="grid" v-if="editingEntity.type === 'team'">
          <Field :label="$t('名前')" required v-slot="{ id, describedBy }">
            <input v-model="entityForm.name" type="text" :id="id" :aria-describedby="describedBy" />
          </Field>
          <Field :label="$t('所属機関')" v-slot="{ id, describedBy }">
            <select v-model="entityForm.institutionId" :id="id" :aria-describedby="describedBy">
              <option value="">{{ $t('未選択') }}</option>
              <option v-for="inst in institutions.institutions" :key="inst._id" :value="inst._id">
                {{ inst.name }}
              </option>
            </select>
          </Field>
          <Field class="full" :label="$t('既存スピーカーから選択')" v-slot="{ id, describedBy }">
            <div class="stack relation-group">
              <input
                v-model="editTeamSpeakerSearch"
                type="text"
                :id="id"
                :aria-describedby="describedBy"
                :placeholder="$t('スピーカー名で絞り込み')"
              />
              <div class="relation-picker">
                <label
                  v-for="speaker in filteredEditTeamSpeakerOptions"
                  :key="speaker._id"
                  class="row small relation-item"
                >
                  <input
                    v-model="editTeamSelectedSpeakerIds"
                    type="checkbox"
                    :value="speaker._id"
                  />
                  <span>{{ speaker.name }}</span>
                </label>
              </div>
              <p class="muted small">
                {{ $t('選択済み: {count}名', { count: editTeamSelectedSpeakerIds.length }) }}
              </p>
            </div>
          </Field>
        </div>
        <div class="grid" v-else-if="editingEntity.type === 'adjudicator'">
          <Field :label="$t('名前')" required v-slot="{ id, describedBy }">
            <input v-model="entityForm.name" type="text" :id="id" :aria-describedby="describedBy" />
          </Field>
          <Field :label="$t('強さ')" :help="$t('推奨範囲: 0〜10')" v-slot="{ id, describedBy }">
            <input
              v-model.number="entityForm.strength"
              type="number"
              min="0"
              max="10"
              step="0.1"
              :id="id"
              :aria-describedby="describedBy"
            />
          </Field>
          <Field :label="$t('事前評価')" :help="$t('推奨範囲: 0〜10')" v-slot="{ id, describedBy }">
            <input
              v-model.number="entityForm.preev"
              type="number"
              min="0"
              max="10"
              step="0.1"
              :id="id"
              :aria-describedby="describedBy"
            />
          </Field>
          <div class="availability-control">
            <label class="row small">
              <input v-model="entityForm.active" type="checkbox" />
              <span>{{ $t('大会参加可能（デフォルト値）') }}</span>
            </label>
          </div>
          <div class="stack full relation-group">
            <span class="field-label">{{ $t('所属機関') }}</span>
            <input
              v-model="editAdjudicatorInstitutionSearch"
              type="text"
              :placeholder="$t('機関名で検索')"
            />
            <div class="relation-picker">
              <label
                v-for="inst in filteredEditAdjudicatorInstitutionOptions"
                :key="inst._id"
                class="row small relation-item"
              >
                <input v-model="editAdjudicatorInstitutionIds" type="checkbox" :value="inst._id" />
                <span>{{ inst.name }}</span>
              </label>
            </div>
            <p class="muted small">
              {{ $t('選択済み: {count}件', { count: editAdjudicatorInstitutionIds.length }) }}
            </p>
          </div>
          <div class="stack full relation-group">
            <span class="field-label">{{ $t('衝突チーム') }}</span>
            <input
              v-model="editAdjudicatorConflictSearch"
              type="text"
              :placeholder="$t('検索してチームを絞り込む')"
            />
            <div class="relation-picker">
              <label
                v-for="team in filteredEditAdjudicatorConflictTeams"
                :key="team._id"
                class="row small relation-item"
              >
                <input v-model="editAdjudicatorConflictIds" type="checkbox" :value="team._id" />
                <span>{{ team.name }}</span>
              </label>
            </div>
          </div>
        </div>
        <div class="grid" v-else-if="editingEntity.type === 'venue'">
          <Field :label="$t('名前')" required v-slot="{ id, describedBy }">
            <input v-model="entityForm.name" type="text" :id="id" :aria-describedby="describedBy" />
          </Field>
          <div class="availability-control">
            <label class="row small">
              <input v-model="entityForm.active" type="checkbox" />
              <span>{{ $t('使用可能（デフォルト値）') }}</span>
            </label>
          </div>
        </div>
        <div class="grid" v-else-if="editingEntity.type === 'institution'">
          <Field :label="$t('名前')" required v-slot="{ id, describedBy }">
            <input v-model="entityForm.name" type="text" :id="id" :aria-describedby="describedBy" />
          </Field>
          <Field :label="$t('カテゴリ')" v-slot="{ id, describedBy }">
            <input
              v-model="entityForm.category"
              type="text"
              :id="id"
              :aria-describedby="describedBy"
              :placeholder="$t('例: institution / region / league')"
            />
          </Field>
          <Field :label="$t('優先度')" v-slot="{ id, describedBy }">
            <input
              v-model.number="entityForm.priority"
              type="number"
              min="0"
              step="0.1"
              :id="id"
              :aria-describedby="describedBy"
            />
          </Field>
        </div>
        <div class="grid" v-else>
          <Field :label="$t('名前')" required v-slot="{ id, describedBy }">
            <input v-model="entityForm.name" type="text" :id="id" :aria-describedby="describedBy" />
          </Field>
        </div>
        <div v-if="editingEntity.type === 'venue' && detailRows.length > 0" class="card stack">
          <h4>{{ $t('ラウンド詳細') }}</h4>
          <div v-for="row in detailRows" :key="row.r" class="detail-row">
            <div class="row">
              <strong>{{ $t('ラウンド {round}', { round: row.r }) }}</strong>
              <label class="row small">
                <input v-model="row.available" type="checkbox" />
                {{ $t('有効') }}
              </label>
            </div>
            <div class="grid">
              <Field :label="$t('優先度')" v-slot="{ id, describedBy }">
                <input
                  v-model.number="row.priority"
                  type="number"
                  min="1"
                  :id="id"
                  :aria-describedby="describedBy"
                />
              </Field>
            </div>
          </div>
        </div>
        <p v-if="entityError" class="error">{{ entityError }}</p>
        <p v-if="csvError" class="error">{{ csvError }}</p>
        <div class="row">
          <Button variant="ghost" size="sm" @click="cancelEditEntity">{{ $t('取消') }}</Button>
          <Button size="sm" @click="saveEntityEdit">{{ $t('更新') }}</Button>
        </div>
      </div>
    </div>

    <div
      v-if="activeSection === 'data' && deleteEntityModal"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeDeleteEntityModal"
    >
      <div class="modal card stack" role="dialog" aria-modal="true">
        <h4>{{ $t('削除') }}</h4>
        <p class="muted">{{ deleteEntityPrompt }}</p>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="closeDeleteEntityModal">{{ $t('キャンセル') }}</Button>
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
import { renderMarkdown } from '@/utils/markdown'
import {
  buildRoundUserDefinedFromDefaults,
  defaultRoundDefaults,
  normalizeRoundDefaults,
  serializeRoundDefaults,
} from '@/utils/round-defaults'
import { normalizeCompileOptions } from '@/types/compiled'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import CollapseHeader from '@/components/common/CollapseHeader.vue'
import ImportTextModal from '@/components/common/ImportTextModal.vue'
import RoundMotionEditor from '@/components/common/RoundMotionEditor.vue'
import CompileOptionsEditor from '@/components/common/CompileOptionsEditor.vue'
import RoundOptionEditor from '@/components/common/RoundOptionEditor.vue'
import BreakPolicyEditor from '@/components/common/BreakPolicyEditor.vue'

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
const roundPublicationBusy = computed(() => rounds.loading || sectionLoading.value)

const tournamentForm = reactive({
  name: '',
  style: 1,
  hidden: false,
  accessRequired: false,
  accessPassword: '',
  infoText: '',
})
const roundDefaultsForm = reactive(defaultRoundDefaults())
const setupRoundForm = reactive<{
  round: number
  name: string
  type: 'standard' | 'break'
}>({
  round: 1,
  name: '',
  type: 'standard',
})
const setupRoundError = ref('')
const setupRoundEditingId = ref<string | null>(null)
const setupRoundEditForm = reactive<{
  round: number
  name: string
  type: 'standard' | 'break'
  userDefinedData: ReturnType<typeof defaultRoundDefaults>['userDefinedData']
  break: ReturnType<typeof defaultRoundDefaults>['break']
  compile: ReturnType<typeof defaultRoundDefaults>['compile']
}>({
  round: 1,
  name: '',
  type: 'standard',
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
const accessPasswordConfigured = ref(false)
const isApplyingTournamentForm = ref(false)
const isSavingTournamentAutosave = ref(false)
const pendingTournamentAutosave = ref(false)
const tournamentAutosaveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const tournamentAutosaveError = ref('')
const isSavingNotice = ref(false)
const noticeSaveError = ref('')
const noticeSaved = ref(false)
let tournamentAutosaveTimer: number | null = null
let tournamentAutosaveStatusTimer: number | null = null
let noticeSavedTimer: number | null = null

const teamForm = reactive({
  name: '',
  institutionId: '',
})
const teamSpeakerSearch = ref('')
const teamSelectedSpeakerIds = ref<string[]>([])

const adjudicatorForm = reactive({
  name: '',
  strength: 5,
  preev: 0,
  active: true,
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

type EntityTabKey = 'teams' | 'adjudicators' | 'venues' | 'speakers' | 'institutions'
const activeEntityTab = ref<EntityTabKey>('teams')
const entityTabs = computed<Array<{ key: EntityTabKey; label: string }>>(() => [
  { key: 'teams', label: t('チーム') },
  { key: 'adjudicators', label: t('ジャッジ') },
  { key: 'speakers', label: t('スピーカー') },
  { key: 'institutions', label: t('所属機関') },
  { key: 'venues', label: t('会場') },
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
    institutions: t('所属機関'),
  }
  return map[type]
}

const entityImportTitle = computed(() => {
  const label = entityTabLabel(entityImportType.value)
  if (!label) return t('CSV取り込み')
  return `${label} ${t('CSV取り込み')}`
})

const entityImportHelpText = computed(() =>
  t('CSV/TSVを貼り付けるか、ファイルを選択して一括取り込みできます。')
)

const entityImportPlaceholder = computed(() => {
  if (entityImportType.value === 'teams') return t('CSV例: Team A,Institution A,Speaker 1|Speaker 2')
  if (entityImportType.value === 'adjudicators') {
    return t('CSV例: name,strength,preev,active,available,conflicts,available_r1')
  }
  if (entityImportType.value === 'venues') return t('CSV例: Room 101')
  if (entityImportType.value === 'speakers') return t('CSV例: Speaker A')
  if (entityImportType.value === 'institutions') return t('CSV例: Institution A,region,2')
  return ''
})

const entityImportDescription = computed(() => {
  if (entityImportType.value === 'teams') return t('CSV例: Team A,Institution A,Speaker 1|Speaker 2')
  if (entityImportType.value === 'adjudicators') {
    return t('CSV例: name,strength,preev,active,available,conflicts,available_r1')
  }
  if (entityImportType.value === 'venues') return t('CSV例: Room 101')
  if (entityImportType.value === 'speakers') return t('CSV例: Speaker A')
  if (entityImportType.value === 'institutions') return t('CSV例: Institution A,region,2')
  return ''
})

const entityImportExample = computed(() => {
  if (entityImportType.value === 'teams') return 'Team A,Institution A,Speaker 1|Speaker 2'
  if (entityImportType.value === 'adjudicators') return 'name,strength,preev,active,available,conflicts,available_r1'
  if (entityImportType.value === 'venues') return 'Room 101'
  if (entityImportType.value === 'speakers') return 'Speaker A'
  if (entityImportType.value === 'institutions') return 'Institution A,region,2'
  return ''
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
const entityForm = reactive<any>({
  name: '',
  institutionId: '',
  strength: 5,
  preev: 0,
  active: true,
  category: 'institution',
  priority: 1,
})
const editTeamSpeakerSearch = ref('')
const editTeamSelectedSpeakerIds = ref<string[]>([])
const editAdjudicatorInstitutionIds = ref<string[]>([])
const editAdjudicatorInstitutionSearch = ref('')
const editAdjudicatorConflictIds = ref<string[]>([])
const editAdjudicatorConflictSearch = ref('')
const entityError = ref<string | null>(null)
const detailRows = ref<any[]>([])
const csvError = ref<string | null>(null)
const deleteEntityPrompt = computed(() => {
  if (!deleteEntityModal.value) return ''
  const { type } = deleteEntityModal.value
  if (type === 'team') return t('チームを削除しますか？')
  if (type === 'adjudicator') return t('ジャッジを削除しますか？')
  if (type === 'venue') return t('会場を削除しますか？')
  if (type === 'speaker') return t('スピーカーを削除しますか？')
  return t('機関を削除しますか？')
})

const sortedRounds = computed(() => rounds.rounds.slice().sort((a, b) => a.round - b.round))
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
        const speakersText =
          team.speakers
            ?.map((s: any) => s.name)
            .join(', ')
            .toLowerCase() ?? ''
        const institutionText = institutionLabel(team.institution).toLowerCase()
        return (
          team.name?.toLowerCase().includes(q) ||
          institutionText.includes(q) ||
          speakersText.includes(q)
        )
      })
    : teams.teams
  return filtered.slice().sort((a, b) =>
    naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? ''))
  )
})

const filteredAdjudicators = computed(() => {
  const q = adjudicatorSearch.value.trim().toLowerCase()
  const filtered = q
    ? adjudicators.adjudicators.filter((adj) => adj.name?.toLowerCase().includes(q))
    : adjudicators.adjudicators
  return filtered.slice().sort((a, b) =>
    naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? ''))
  )
})

const filteredSpeakers = computed(() => {
  const q = speakerSearch.value.trim().toLowerCase()
  const filtered = q
    ? speakers.speakers.filter((sp) => sp.name?.toLowerCase().includes(q))
    : speakers.speakers
  return filtered.slice().sort((a, b) =>
    naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? ''))
  )
})

const filteredVenues = computed(() => {
  const q = venueSearch.value.trim().toLowerCase()
  const filtered = q
    ? venues.venues.filter((venue) => venue.name?.toLowerCase().includes(q))
    : venues.venues
  return filtered.slice().sort((a, b) =>
    naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? ''))
  )
})

const filteredInstitutions = computed(() => {
  const q = institutionSearch.value.trim().toLowerCase()
  const filtered = q
    ? institutions.institutions.filter((inst) => inst.name?.toLowerCase().includes(q))
    : institutions.institutions
  return filtered.slice().sort((a, b) =>
    naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? ''))
  )
})

const filteredTeamSpeakerOptions = computed(() => {
  const q = teamSpeakerSearch.value.trim().toLowerCase()
  const list = q
    ? speakers.speakers.filter((speaker) => speaker.name?.toLowerCase().includes(q))
    : speakers.speakers
  return list.slice().sort((a, b) =>
    naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? ''))
  )
})

const filteredEditTeamSpeakerOptions = computed(() => {
  const q = editTeamSpeakerSearch.value.trim().toLowerCase()
  const list = q
    ? speakers.speakers.filter((speaker) => speaker.name?.toLowerCase().includes(q))
    : speakers.speakers
  return list.slice().sort((a, b) =>
    naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? ''))
  )
})

const filteredAdjudicatorInstitutionOptions = computed(() => {
  const q = adjudicatorInstitutionSearch.value.trim().toLowerCase()
  const list = q
    ? institutions.institutions.filter((inst) => inst.name?.toLowerCase().includes(q))
    : institutions.institutions
  return list.slice().sort((a, b) =>
    naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? ''))
  )
})

const filteredAdjudicatorConflictTeams = computed(() => {
  const q = adjudicatorConflictSearch.value.trim().toLowerCase()
  const list = q ? teams.teams.filter((team) => team.name?.toLowerCase().includes(q)) : teams.teams
  return list.slice().sort((a, b) =>
    naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? ''))
  )
})

const filteredEditAdjudicatorInstitutionOptions = computed(() => {
  const q = editAdjudicatorInstitutionSearch.value.trim().toLowerCase()
  const list = q
    ? institutions.institutions.filter((inst) => inst.name?.toLowerCase().includes(q))
    : institutions.institutions
  return list.slice().sort((a, b) =>
    naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? ''))
  )
})

const filteredEditAdjudicatorConflictTeams = computed(() => {
  const q = editAdjudicatorConflictSearch.value.trim().toLowerCase()
  const list = q ? teams.teams.filter((team) => team.name?.toLowerCase().includes(q)) : teams.teams
  return list.slice().sort((a, b) =>
    naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? ''))
  )
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

const accessPasswordHelpText = computed(() => {
  if (accessPasswordConfigured.value) {
    return t('大会パスワードは表示・編集できます。空欄で保存すると解除されます。')
  }
  return t('大会パスワードを設定すると、参加者に入力を求められます。')
})
const tournamentAutosaveText = computed(() => {
  if (tournamentAutosaveStatus.value === 'saving') return t('大会設定を保存中...')
  if (tournamentAutosaveStatus.value === 'saved') return t('大会設定を自動保存しました。')
  if (tournamentAutosaveStatus.value === 'error') {
    return tournamentAutosaveError.value || t('大会設定の保存に失敗しました。')
  }
  return t('大会設定（重要なお知らせを除く）の変更は自動で保存されます。')
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

const editingTitle = computed(() => {
  if (!editingEntity.value) return ''
  const label = entityTypeLabel(editingEntity.value.type)
  const name = String(entityForm.name ?? '').trim()
  return name ? `${label}${t('編集')}: ${name}` : `${label}${t('編集')}`
})

function entityTypeLabel(type: string) {
  const map: Record<string, string> = {
    team: t('チーム'),
    adjudicator: t('ジャッジ'),
    venue: t('会場'),
    speaker: t('スピーカー'),
    institution: t('所属機関'),
  }
  return map[type] ?? type
}

function applyTournamentForm() {
  if (!tournament.value) return
  isApplyingTournamentForm.value = true
  tournamentForm.name = tournament.value.name
  tournamentForm.style = tournament.value.style
  tournamentForm.hidden = Boolean(tournament.value.user_defined_data?.hidden)
  tournamentForm.accessRequired = Boolean(tournament.value.auth?.access?.required)
  const savedAccessPassword =
    typeof tournament.value.auth?.access?.password === 'string'
      ? String(tournament.value.auth.access.password)
      : ''
  accessPasswordConfigured.value = Boolean(
    tournament.value.auth?.access?.hasPassword || savedAccessPassword
  )
  tournamentForm.accessPassword = savedAccessPassword
  tournamentForm.infoText = String(tournament.value.user_defined_data?.info?.text ?? '')
  applyRoundDefaultsForm()
  void nextTick(() => {
    isApplyingTournamentForm.value = false
  })
}

function applyRoundDefaultsForm() {
  const normalized = normalizeRoundDefaults(tournament.value?.user_defined_data?.round_defaults)
  Object.assign(roundDefaultsForm.userDefinedData, normalized.userDefinedData)
  Object.assign(roundDefaultsForm.break, normalized.break)
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
  const passwordInput = tournamentForm.accessPassword.trim()
  const nextUserDefined = { ...(tournament.value.user_defined_data ?? {}) } as Record<string, any>
  delete nextUserDefined.submission_policy
  const currentInfo = nextUserDefined.info && typeof nextUserDefined.info === 'object'
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
    authPayload.access.password = passwordInput || null
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
    const savedAccessPassword =
      typeof updated.auth?.access?.password === 'string' ? String(updated.auth.access.password) : ''
    accessPasswordConfigured.value = Boolean(
      updated.auth?.access?.hasPassword || savedAccessPassword
    )
    tournamentForm.accessPassword = savedAccessPassword
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
  if (isApplyingTournamentForm.value || !pendingTournamentAutosave.value || !tournament.value) return
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

async function saveRoundDefaults() {
  if (!tournament.value) return
  const nextUserDefined = { ...(tournament.value.user_defined_data ?? {}) } as Record<string, any>
  delete nextUserDefined.submission_policy
  await tournamentStore.updateTournament({
    tournamentId: tournament.value._id,
    user_defined_data: {
      ...nextUserDefined,
      round_defaults: serializeRoundDefaults(roundDefaultsForm),
    },
  })
}

function roundTypeLabel(round: any) {
  const isBreak = Boolean(round?.userDefinedData?.break?.enabled)
  return isBreak ? t('ブレイク') : t('通常ラウンド')
}

function setupExpectedAdjudicatorIds(roundNumber: number) {
  const set = new Set<string>()
  const draw = draws.draws.find((item) => Number(item.round) === Number(roundNumber))
  const allocation = Array.isArray(draw?.allocation) ? draw.allocation : []
  allocation.forEach((row: any) => {
    ;(row?.chairs ?? []).forEach((id: any) => id && set.add(String(id)))
    ;(row?.panels ?? []).forEach((id: any) => id && set.add(String(id)))
    ;(row?.trainees ?? []).forEach((id: any) => id && set.add(String(id)))
  })
  return set
}

function setupExpectedTeamIds(roundNumber: number) {
  const set = new Set<string>()
  const draw = draws.draws.find((item) => Number(item.round) === Number(roundNumber))
  const allocation = Array.isArray(draw?.allocation) ? draw.allocation : []
  allocation.forEach((row: any) => {
    if (row?.teams?.gov) set.add(String(row.teams.gov))
    if (row?.teams?.opp) set.add(String(row.teams.opp))
  })
  return set
}

function setupTeamSpeakerIds(teamId: string, roundNumber: number) {
  const team = teams.teams.find((item) => item._id === teamId)
  if (!team) return []
  const detail = team.details?.find((item: any) => Number(item.r) === Number(roundNumber))
  const detailSpeakerIds = (detail?.speakers ?? []).map((id: any) => String(id)).filter(Boolean)
  if (detailSpeakerIds.length > 0) return detailSpeakerIds
  return (team.speakers ?? [])
    .map((speaker: any) => {
      const name = String(speaker?.name ?? '')
      if (!name) return ''
      return speakers.speakers.find((item) => item.name === name)?._id ?? ''
    })
    .filter(Boolean)
}

function setupSubmittedIds(roundNumber: number, type: 'ballot' | 'feedback') {
  const set = new Set<string>()
  submissions.submissions.forEach((item) => {
    if (Number(item.round) !== Number(roundNumber) || item.type !== type) return
    const id = (item.payload as any)?.submittedEntityId
    if (id) set.add(String(id))
  })
  return set
}

function setupIntersectionCount(expected: Set<string>, actual: Set<string>) {
  let count = 0
  expected.forEach((id) => {
    if (actual.has(id)) count += 1
  })
  return count
}

function setupBallotExpectedCount(round: any) {
  return setupExpectedAdjudicatorIds(Number(round.round)).size
}

function setupBallotSubmittedCount(round: any) {
  const expected = setupExpectedAdjudicatorIds(Number(round.round))
  const actual = setupSubmittedIds(Number(round.round), 'ballot')
  return setupIntersectionCount(expected, actual)
}

function setupFeedbackExpectedCount(round: any) {
  const roundNumber = Number(round.round)
  const expected = new Set<string>()
  const userDefined = round.userDefinedData ?? {}
  const teamIds = setupExpectedTeamIds(roundNumber)
  if (userDefined.evaluate_from_teams !== false) {
    if ((userDefined.evaluator_in_team ?? 'team') === 'speaker') {
      teamIds.forEach((teamId) => {
        setupTeamSpeakerIds(teamId, roundNumber).forEach((id) => expected.add(id))
      })
    } else {
      teamIds.forEach((id) => expected.add(id))
    }
  }
  if (userDefined.evaluate_from_adjudicators !== false) {
    setupExpectedAdjudicatorIds(roundNumber).forEach((id) => expected.add(id))
  }
  return expected.size
}

function setupFeedbackSubmittedCount(round: any) {
  const roundNumber = Number(round.round)
  const expected = new Set<string>()
  const userDefined = round.userDefinedData ?? {}
  const teamIds = setupExpectedTeamIds(roundNumber)
  if (userDefined.evaluate_from_teams !== false) {
    if ((userDefined.evaluator_in_team ?? 'team') === 'speaker') {
      teamIds.forEach((teamId) => {
        setupTeamSpeakerIds(teamId, roundNumber).forEach((id) => expected.add(id))
      })
    } else {
      teamIds.forEach((id) => expected.add(id))
    }
  }
  if (userDefined.evaluate_from_adjudicators !== false) {
    setupExpectedAdjudicatorIds(roundNumber).forEach((id) => expected.add(id))
  }
  const actual = setupSubmittedIds(roundNumber, 'feedback')
  return setupIntersectionCount(expected, actual)
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

async function onSetupTeamAllocationChange(round: any, checked: boolean) {
  const updated = await rounds.updateRound({
    tournamentId: tournamentId.value,
    roundId: String(round._id),
    teamAllocationOpened: Boolean(checked),
  })
  if (updated?._id) {
    await rounds.fetchRounds(tournamentId.value)
  }
}

async function onSetupAdjudicatorAllocationChange(round: any, checked: boolean) {
  const updated = await rounds.updateRound({
    tournamentId: tournamentId.value,
    roundId: String(round._id),
    adjudicatorAllocationOpened: Boolean(checked),
  })
  if (updated?._id) {
    await rounds.fetchRounds(tournamentId.value)
  }
}

function isSetupRoundDetailsOpen(roundId: string) {
  return setupRoundDetailsOpen.value[roundId] === true
}

function onSetupRoundDetailsToggle(round: any, event: Event) {
  const roundId = String(round?._id ?? '')
  if (!roundId) return
  const details = event.target as HTMLDetailsElement | null
  const isOpen = Boolean(details?.open)
  setupRoundDetailsOpen.value = isOpen ? { [roundId]: true } : {}
  if (isOpen) {
    startEditRoundFromSetup(round)
  }
  if (!isOpen && setupRoundEditingId.value === roundId) {
    cancelEditRoundFromSetup()
  }
}

function roundTypeValue(round: any): 'standard' | 'break' {
  return round?.userDefinedData?.break?.enabled === true ? 'break' : 'standard'
}

function normalizeBreakConfigForRoundEdit(input: unknown) {
  const source = input && typeof input === 'object' ? (input as Record<string, any>) : {}
  const breakDefaults = normalizeRoundDefaults(roundDefaultsForm).break
  const sizeRaw = Number(source.size)
  const cutoffTiePolicy =
    source.cutoff_tie_policy === 'include_all' || source.cutoff_tie_policy === 'strict'
      ? source.cutoff_tie_policy
      : breakDefaults.cutoff_tie_policy
  return {
    enabled: source.enabled === true,
    source: source.source === 'raw' ? 'raw' : breakDefaults.source,
    source_rounds: Array.isArray(source.source_rounds) ? source.source_rounds : [],
    size: Number.isInteger(sizeRaw) && sizeRaw >= 1 ? sizeRaw : breakDefaults.size,
    cutoff_tie_policy: cutoffTiePolicy,
    seeding: source.seeding === 'high_low' ? 'high_low' : breakDefaults.seeding,
    participants: Array.isArray(source.participants) ? source.participants : [],
  }
}

function compileSourceRoundOptions(targetRound: number): number[] {
  return sortedRounds.value
    .map((round) => Number(round.round))
    .filter((roundNumber) => Number.isInteger(roundNumber) && roundNumber >= 1 && roundNumber < targetRound)
    .sort((left, right) => left - right)
}

function compileSourceRoundSelectOptions(targetRound: number): Array<{ value: number; label: string }> {
  return compileSourceRoundOptions(targetRound).map((roundNumber) => ({
    value: roundNumber,
    label: t('ラウンド {round}', { round: roundNumber }),
  }))
}

function normalizeCompileSourceRoundsForRound(roundNumber: number, sourceRounds: unknown): number[] {
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
  const roundNumber = Number(setupRoundForm.round)
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    setupRoundError.value = t('ラウンド番号を確認してください。')
    return
  }
  if (sortedRounds.value.some((round) => Number(round.round) === roundNumber)) {
    setupRoundError.value = t('同じラウンド番号が既に存在します。')
    return
  }

  const userDefinedData = buildRoundUserDefinedFromDefaults(normalizeRoundDefaults(roundDefaultsForm)) as Record<
    string,
    any
  >
  if (setupRoundForm.type === 'break') {
    userDefinedData.break = {
      ...(userDefinedData.break ?? {}),
      enabled: true,
    }
  }

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
  setupRoundForm.type = 'standard'
}

function startEditRoundFromSetup(round: any) {
  setupRoundEditError.value = ''
  setupRoundEditingId.value = String(round?._id ?? '')
  setupRoundEditForm.round = Number(round?.round ?? 1)
  setupRoundEditForm.name = String(round?.name ?? '')
  setupRoundEditForm.type = roundTypeValue(round)
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
}

function cancelEditRoundFromSetup() {
  setupRoundEditError.value = ''
  setupRoundEditingId.value = null
  setupRoundEditForm.round = setupSuggestedRoundNumber.value
  setupRoundEditForm.name = ''
  setupRoundEditForm.type = 'standard'
  Object.assign(setupRoundEditForm.userDefinedData, defaultRoundDefaults().userDefinedData)
  Object.assign(setupRoundEditForm.break, defaultRoundDefaults().break)
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
  const normalizedBreak = normalizeBreakConfigForRoundEdit(currentUserDefined.break)
  const breakSizeRaw = Number(setupRoundEditForm.break.size)
  const breakSize = Number.isInteger(breakSizeRaw) && breakSizeRaw >= 1
    ? breakSizeRaw
    : defaultRoundDefaults().break.size
  const breakCutoffTiePolicy =
    setupRoundEditForm.break.cutoff_tie_policy === 'include_all' ||
    setupRoundEditForm.break.cutoff_tie_policy === 'strict'
      ? setupRoundEditForm.break.cutoff_tie_policy
      : 'manual'
  const compileSourceRounds = normalizeCompileSourceRoundsForRound(
    roundNumber,
    setupRoundEditForm.compile.source_rounds
  )
  const compileOptions = normalizeCompileOptions(setupRoundEditForm.compile.options)
  const nextUserDefined: Record<string, any> = {
    ...currentUserDefined,
    ...setupRoundEditForm.userDefinedData,
    evaluator_in_team:
      setupRoundEditForm.userDefinedData.evaluator_in_team === 'speaker' ? 'speaker' : 'team',
    hidden: false,
    break: {
      ...normalizedBreak,
      enabled: setupRoundEditForm.type === 'break',
      source: setupRoundEditForm.break.source === 'raw' ? 'raw' : 'submissions',
      size: breakSize,
      cutoff_tie_policy: breakCutoffTiePolicy,
      seeding: 'high_low',
    },
    compile: {
      source: setupRoundEditForm.compile.source === 'raw' ? 'raw' : 'submissions',
      source_rounds: compileSourceRounds,
      options: compileOptions,
    },
  }

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

  cancelEditRoundFromSetup()
}

function speakerNamesFromIds(ids: string[]) {
  return ids
    .map((id) => speakers.speakers.find((item) => item._id === id)?.name ?? '')
    .filter(Boolean)
}

function resolveInstitutionName(id: string) {
  if (!id) return ''
  return institutions.institutions.find((inst) => inst._id === id)?.name ?? ''
}

function institutionLabel(value?: string) {
  if (!value) return ''
  const token = String(value)
  const matched = institutions.institutions.find(
    (inst) => inst._id === token || inst.name === token
  )
  return matched?.name ?? token
}

function resolveInstitutionId(value?: string) {
  if (!value) return ''
  const token = String(value)
  const matched = institutions.institutions.find(
    (inst) => inst._id === token || inst.name === token
  )
  return matched?._id ?? ''
}

function institutionCategoryLabel(value?: string) {
  const normalized = String(value ?? '').trim()
  return normalized || 'institution'
}

function institutionPriorityValue(value?: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 1
  return Math.round(parsed * 1000) / 1000
}

function resolveTeamSpeakerIds(entity: any): string[] {
  const detailIds: string[] = Array.isArray(entity.details)
    ? entity.details.flatMap((detail: any) => (detail?.speakers ?? []).map((id: any) => String(id)))
    : []
  const normalizedDetailIds = Array.from(new Set(detailIds.filter(Boolean)))
  if (normalizedDetailIds.length > 0) return normalizedDetailIds

  const nameBasedIds: string[] = (entity.speakers ?? [])
    .map((speaker: any) => {
      const name = speaker?.name
      if (!name) return ''
      return speakers.speakers.find((item) => item.name === name)?._id ?? ''
    })
    .filter(Boolean)
  return Array.from(new Set(nameBasedIds))
}

function resolveAdjudicatorInstitutionIds(entity: any): string[] {
  if (!Array.isArray(entity.details)) return []
  const ids = entity.details.flatMap((detail: any) =>
    (detail?.institutions ?? []).map((id: any) => String(id))
  )
  return Array.from(new Set(ids.filter(Boolean)))
}

function resolveAdjudicatorConflictIds(entity: any): string[] {
  if (!Array.isArray(entity.details)) return []
  const ids = entity.details.flatMap((detail: any) =>
    (detail?.conflicts ?? []).map((id: any) => String(id))
  )
  return Array.from(new Set(ids.filter(Boolean)))
}

async function handleCreateTeam() {
  if (!teamForm.name) return
  const selectedNames = speakerNamesFromIds(teamSelectedSpeakerIds.value)
  const speakersList = Array.from(new Set(selectedNames)).map((name) => ({
    name,
  }))
  const institutionName = resolveInstitutionName(teamForm.institutionId)
  const targetRounds = managedRoundNumbers.value
  const details =
    targetRounds.length > 0 && (teamSelectedSpeakerIds.value.length > 0 || teamForm.institutionId)
      ? targetRounds.map((roundNumber) => ({
          r: roundNumber,
          available: true,
          institutions: teamForm.institutionId ? [teamForm.institutionId] : [],
          speakers: teamSelectedSpeakerIds.value.slice(),
        }))
      : undefined
  await teams.createTeam({
    tournamentId: tournamentId.value,
    name: teamForm.name,
    institution: institutionName || undefined,
    speakers: speakersList,
    details,
  })
  teamForm.name = ''
  teamForm.institutionId = ''
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
          institutions: adjudicatorInstitutionIds.value.slice(),
          conflicts: adjudicatorConflictIds.value.slice(),
        }))
      : undefined
  await adjudicators.createAdjudicator({
    tournamentId: tournamentId.value,
    name: adjudicatorForm.name,
    strength: adjudicatorForm.strength,
    active: adjudicatorForm.active,
    preev: adjudicatorForm.preev,
    details,
  })
  adjudicatorForm.name = ''
  adjudicatorForm.strength = 5
  adjudicatorForm.preev = 0
  adjudicatorForm.active = true
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
  deleteEntityModal.value = { type, id }
}

function closeDeleteEntityModal() {
  deleteEntityModal.value = null
}

async function confirmDeleteEntity() {
  const modal = deleteEntityModal.value
  if (!modal) return
  closeDeleteEntityModal()
  if (modal.type === 'team') {
    await teams.deleteTeam(tournamentId.value, modal.id)
    return
  }
  if (modal.type === 'adjudicator') {
    await adjudicators.deleteAdjudicator(tournamentId.value, modal.id)
    return
  }
  if (modal.type === 'venue') {
    await venues.deleteVenue(tournamentId.value, modal.id)
    return
  }
  if (modal.type === 'speaker') {
    await speakers.deleteSpeaker(tournamentId.value, modal.id)
    return
  }
  await institutions.deleteInstitution(tournamentId.value, modal.id)
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

function startEditEntity(type: string, entity: any) {
  editingEntity.value = { type, id: entity._id }
  entityForm.name = entity.name ?? ''
  entityForm.institutionId = resolveInstitutionId(entity.institution)
  entityForm.strength = entity.strength ?? 5
  entityForm.preev = entity.preev ?? 0
  entityForm.active = entity.active ?? true
  entityForm.category = institutionCategoryLabel(entity.category)
  entityForm.priority = institutionPriorityValue(entity.priority)
  if (type === 'venue') {
    entityForm.active =
      typeof entity.userDefinedData?.availableDefault === 'boolean'
        ? Boolean(entity.userDefinedData.availableDefault)
        : true
  }
  editTeamSelectedSpeakerIds.value = type === 'team' ? resolveTeamSpeakerIds(entity) : []
  editTeamSpeakerSearch.value = ''
  editAdjudicatorInstitutionIds.value =
    type === 'adjudicator' ? resolveAdjudicatorInstitutionIds(entity) : []
  editAdjudicatorInstitutionSearch.value = ''
  editAdjudicatorConflictIds.value =
    type === 'adjudicator' ? resolveAdjudicatorConflictIds(entity) : []
  editAdjudicatorConflictSearch.value = ''
  detailRows.value = type === 'venue' ? buildDetailRows(entity) : []
  entityError.value = null
}

function cancelEditEntity() {
  editingEntity.value = null
  detailRows.value = []
  editTeamSelectedSpeakerIds.value = []
  editTeamSpeakerSearch.value = ''
  editAdjudicatorInstitutionIds.value = []
  editAdjudicatorInstitutionSearch.value = ''
  editAdjudicatorConflictIds.value = []
  editAdjudicatorConflictSearch.value = ''
}

async function saveEntityEdit() {
  if (!editingEntity.value) return
  entityError.value = null

  const id = editingEntity.value.id
  if (editingEntity.value.type === 'team') {
    const selectedNames = speakerNamesFromIds(editTeamSelectedSpeakerIds.value)
    const speakersList = Array.from(new Set(selectedNames)).map((name: string) => ({ name }))
    const institutionName = resolveInstitutionName(entityForm.institutionId)
    await teams.updateTeam({
      tournamentId: tournamentId.value,
      teamId: id,
      name: entityForm.name,
      institution: institutionName || undefined,
      speakers: speakersList,
    })
  } else if (editingEntity.value.type === 'adjudicator') {
    const targetRounds = managedRoundNumbers.value.length > 0 ? managedRoundNumbers.value : [1]
    const existing = adjudicators.adjudicators.find((item) => item._id === id)
    const details =
      targetRounds.length > 0 &&
      (editAdjudicatorInstitutionIds.value.length > 0 ||
        editAdjudicatorConflictIds.value.length > 0)
        ? targetRounds.map((roundNumber) => {
            const currentDetail = existing?.details?.find(
              (detail: any) => Number(detail.r) === Number(roundNumber)
            )
            return {
              r: roundNumber,
              available: currentDetail?.available ?? true,
              institutions: editAdjudicatorInstitutionIds.value.slice(),
              conflicts: editAdjudicatorConflictIds.value.slice(),
            }
          })
        : undefined
    await adjudicators.updateAdjudicator({
      tournamentId: tournamentId.value,
      adjudicatorId: id,
      name: entityForm.name,
      strength: Number(entityForm.strength),
      preev: Number(entityForm.preev),
      active: Boolean(entityForm.active),
      details,
    })
  } else if (editingEntity.value.type === 'venue') {
    const details = detailRows.value.length > 0 ? detailRows.value.map((row) => ({ ...row })) : []
    await venues.updateVenue({
      tournamentId: tournamentId.value,
      venueId: id,
      name: entityForm.name,
      details: details.map((row: any) => ({
        r: row.r,
        available: row.available,
        priority: row.priority ?? 1,
      })),
      userDefinedData: {
        availableDefault: Boolean(entityForm.active),
      },
    })
  } else if (editingEntity.value.type === 'speaker') {
    await speakers.updateSpeaker({
      tournamentId: tournamentId.value,
      speakerId: id,
      name: entityForm.name,
    })
  } else if (editingEntity.value.type === 'institution') {
    const category = institutionCategoryLabel(entityForm.category)
    const priority = institutionPriorityValue(entityForm.priority)
    await institutions.updateInstitution({
      tournamentId: tournamentId.value,
      institutionId: id,
      name: entityForm.name,
      category,
      priority,
    })
  }
  cancelEditEntity()
}

function buildDetailRows(entity: any) {
  if (!managedRoundNumbers.value.length) return []
  const defaultAvailable =
    typeof entity.userDefinedData?.availableDefault === 'boolean'
      ? Boolean(entity.userDefinedData.availableDefault)
      : true
  return managedRoundNumbers.value.map((roundNumber) => {
    const existing =
      (entity.details ?? []).find((d: any) => Number(d.r) === Number(roundNumber)) ?? {}
    return {
      r: roundNumber,
      available: existing.available ?? defaultAvailable,
      priority: existing.priority ?? 1,
    }
  })
}

function adjudicatorInstitutionsLabel(adjudicator: any) {
  const ids: string[] = Array.isArray(adjudicator?.details)
    ? adjudicator.details.flatMap((detail: any) =>
        (detail?.institutions ?? []).map((id: any) => String(id))
      )
    : []
  const unique = Array.from(
    new Set(
      ids
        .map((id: string) => institutionLabel(id))
        .filter((name: string): name is string => Boolean(name))
    )
  )
  return unique.length > 0 ? unique.join(', ') : t('未設定')
}

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const first = lines[0].split(',').map((cell) => cell.trim())
  const headerKeys = [
    'name',
    'institution',
    'category',
    'kind',
    'type',
    'priority',
    'speakers',
    'strength',
    'preev',
    'priority',
    'active',
    'available',
    'availability',
    'conflict',
    'conflicts',
  ]
  const hasHeader = first.some((cell) => {
    const key = cell.toLowerCase()
    return (
      headerKeys.includes(key) ||
      /^available_r\d+$/.test(key) ||
      /^availability_r\d+$/.test(key) ||
      /^conflicts?_r\d+$/.test(key)
    )
  })
  const headers = hasHeader ? first.map((h) => h.toLowerCase()) : []
  const rows = lines.slice(hasHeader ? 1 : 0).map((line) => line.split(',').map((c) => c.trim()))
  return { headers, rows }
}

function splitList(value: string) {
  return value
    .split(/[;|]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

function toBooleanCell(value: string, defaultValue: boolean) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return defaultValue
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return defaultValue
}

function findHeaderValue(headers: string[], row: string[], keyCandidates: string[]) {
  for (const key of keyCandidates) {
    const index = headers.indexOf(key)
    if (index >= 0) return row[index] ?? ''
  }
  return ''
}

async function importEntitiesFromText(type: EntityTabKey, text: string) {
  const { headers, rows } = parseCsv(text)
  const payload: any[] = []
  const get = (row: string[], key: string, fallbackIndex: number) => {
    if (headers.length === 0) return row[fallbackIndex] ?? ''
    const idx = headers.indexOf(key)
    return idx >= 0 ? (row[idx] ?? '') : ''
  }
  const teamNameMap = new Map<string, string>()
  teams.teams.forEach((team) => {
    teamNameMap.set(team._id, team._id)
    teamNameMap.set(team.name.toLowerCase(), team._id)
  })
  const institutionIdMap = new Map<string, string>()
  institutions.institutions.forEach((inst) => {
    institutionIdMap.set(inst._id, inst._id)
    institutionIdMap.set(inst.name, inst._id)
    institutionIdMap.set(inst.name.toLowerCase(), inst._id)
  })
  const resolveConflictIds = (cell: string) => {
    const ids = splitList(cell).map((token) => {
      const normalized = token.trim()
      if (!normalized) return ''
      return teamNameMap.get(normalized) ?? teamNameMap.get(normalized.toLowerCase()) ?? ''
    })
    return Array.from(new Set(ids.filter(Boolean)))
  }
  const resolveInstitutionIds = (cell: string) => {
    const ids = splitList(cell).map((token) => {
      const normalized = token.trim()
      if (!normalized) return ''
      return institutionIdMap.get(normalized) ?? institutionIdMap.get(normalized.toLowerCase()) ?? ''
    })
    return Array.from(new Set(ids.filter(Boolean)))
  }
  const hasRoundAvailabilityHeader = headers.some(
    (header) => /^available_r\d+$/.test(header) || /^availability_r\d+$/.test(header)
  )
  const hasRoundConflictHeader = headers.some((header) => /^conflicts?_r\d+$/.test(header))

  for (const row of rows) {
    if (type === 'teams') {
      const name = get(row, 'name', 0)
      if (!name) continue
      const institution = get(row, 'institution', 1)
      const speakersCell = get(row, 'speakers', 2)
      const speakersList = splitList(speakersCell).map((n) => ({ name: n }))
      payload.push({
        tournamentId: tournamentId.value,
        name,
        institution: institution || undefined,
        speakers: speakersList,
      })
    } else if (type === 'adjudicators') {
      const name = get(row, 'name', 0)
      if (!name) continue
      const strength = Number(get(row, 'strength', 1) || 0)
      const preev = Number(get(row, 'preev', 2) || 0)
      const activeValue = get(row, 'active', 3)
      const active = toBooleanCell(activeValue, true)
      const institutionCell = findHeaderValue(headers, row, ['institutions', 'institution'])
      const baseInstitutionIds = resolveInstitutionIds(institutionCell)
      const defaultAvailableCell =
        headers.length === 0
          ? (row[4] ?? '')
          : findHeaderValue(headers, row, ['available', 'availability'])
      const defaultAvailable = toBooleanCell(defaultAvailableCell, true)
      const baseConflictCell =
        headers.length === 0
          ? (row[5] ?? '')
          : findHeaderValue(headers, row, ['conflicts', 'conflict'])
      const baseConflicts = resolveConflictIds(baseConflictCell)
      const includeDetails =
        sortedRounds.value.length > 0 &&
        (defaultAvailable === false ||
          baseInstitutionIds.length > 0 ||
          baseConflicts.length > 0 ||
          hasRoundAvailabilityHeader ||
          hasRoundConflictHeader)
      const details = includeDetails
        ? sortedRounds.value.map((roundItem) => {
            const availableCell = findHeaderValue(headers, row, [
              `available_r${roundItem.round}`,
              `availability_r${roundItem.round}`,
            ])
            const available = toBooleanCell(availableCell, defaultAvailable)
            const conflictCell = findHeaderValue(headers, row, [
              `conflicts_r${roundItem.round}`,
              `conflict_r${roundItem.round}`,
            ])
            const conflictIds = Array.from(new Set([...baseConflicts, ...resolveConflictIds(conflictCell)]))
            return {
              r: roundItem.round,
              available,
              institutions: baseInstitutionIds,
              conflicts: conflictIds,
            }
          })
        : undefined
      payload.push({
        tournamentId: tournamentId.value,
        name,
        strength,
        preev,
        active,
        details,
      })
    } else if (type === 'venues') {
      const name = get(row, 'name', 0)
      if (!name) continue
      const priority = Number(get(row, 'priority', 1) || 1)
      payload.push({
        tournamentId: tournamentId.value,
        name,
        details: sortedRounds.value.map((round) => ({
          r: round.round,
          available: true,
          priority,
        })),
      })
    } else if (type === 'speakers') {
      const name = get(row, 'name', 0)
      if (!name) continue
      payload.push({ tournamentId: tournamentId.value, name })
    } else if (type === 'institutions') {
      const name = get(row, 'name', 0)
      if (!name) continue
      const category =
        headers.length === 0
          ? (row[1] ?? '')
          : findHeaderValue(headers, row, ['category', 'kind', 'type'])
      const priorityRaw =
        headers.length === 0 ? (row[2] ?? '') : findHeaderValue(headers, row, ['priority'])
      payload.push({
        tournamentId: tournamentId.value,
        name,
        category: institutionCategoryLabel(category || undefined),
        priority: institutionPriorityValue(Number(priorityRaw || 1)),
      })
    }
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
      err?.response?.data?.errors?.[0]?.message ??
      err?.message ??
      t('CSV取り込みに失敗しました')
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
    tournamentAutosaveStatus.value = 'idle'
    tournamentAutosaveError.value = ''
    noticeSaveError.value = ''
    noticeSaved.value = false
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
    if (editingEntity.value) cancelEditEntity()
    if (setupRoundEditingId.value) cancelEditRoundFromSetup()
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
})

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && showRoundDefaultsModal.value) {
    showRoundDefaultsModal.value = false
  }
  if (event.key === 'Escape' && showEntityImportModal.value) {
    closeEntityImportModal()
  }
  if (event.key === 'Escape' && editingEntity.value) {
    cancelEditEntity()
  }
  if (event.key === 'Escape' && setupRoundEditingId.value) {
    cancelEditRoundFromSetup()
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

.overview-setting-card h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
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
}

.create-actions {
  gap: var(--space-2);
  flex-wrap: wrap;
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

.setup-round-status-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.setup-round-status-card {
  border: 1px solid var(--color-border);
  padding: var(--space-2);
  gap: var(--space-2);
}

.setup-round-status-card h5 {
  margin: 0;
  font-size: 14px;
}

.setup-round-motion-panel {
  border: 1px solid var(--color-border);
  gap: var(--space-2);
}

.status-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: 13px;
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

.setup-round-details {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  overflow: visible;
}

.setup-round-details-summary {
  list-style: none;
  cursor: pointer;
  padding: 10px 12px;
  align-items: center;
  gap: var(--space-2);
  justify-content: flex-start;
}

.setup-round-details-summary::-webkit-details-marker {
  display: none;
}

.setup-round-details-body {
  gap: var(--space-2);
  padding: 0 var(--space-2) var(--space-2);
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

.overview-qr-head {
  justify-content: space-between;
}

.qr-grid {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: var(--space-5);
  align-items: start;
}

.qr-box {
  display: grid;
  place-items: center;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px dashed var(--color-border);
  background: var(--color-surface-muted);
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

.qr-actions :deep(.btn--secondary:last-child) {
  min-width: 160px;
}

.grid .full {
  grid-column: 1 / -1;
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
  padding: var(--space-3);
  display: grid;
  gap: var(--space-3);
}

.section-row {
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.page-title {
  margin: 0;
  color: var(--color-text);
  font-size: clamp(1.95rem, 2.2vw, 2.25rem);
  line-height: 1.2;
  letter-spacing: 0.01em;
  font-weight: 800;
}

.entity-switch {
  flex-wrap: wrap;
  gap: var(--space-2);
}

.entity-tab {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-muted);
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
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

.entity-list-item .row {
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
  .entity-list-item {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .entity-list-item .row {
    justify-content: flex-start;
  }

  .team-form-grid {
    grid-template-columns: 1fr;
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
    width: min(320px, 100%);
    margin: 0 auto;
  }

  .markdown-grid {
    grid-template-columns: 1fr;
  }
}
</style>
