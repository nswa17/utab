<template>
  <section class="stack">
    <div v-if="!isEmbeddedRoute" class="row section-header">
      <div class="stack tight">
        <h4>{{ $t('対戦表設定') }}</h4>
        <span class="muted small">{{ roundHeading }}</span>
      </div>
    </div>
    <p v-if="allocationChanged" class="muted">{{ $t('未保存の変更があります。') }}</p>
    <p v-if="adjudicatorImportInfo" class="muted import-info">{{ adjudicatorImportInfo }}</p>

    <div class="card stack" v-if="formError || draws.error">
      <p v-if="formError" class="error">{{ formError }}</p>
      <p v-if="draws.error" class="error">{{ draws.error }}</p>
    </div>

    <div class="card stack" v-if="unsubmittedEnabled && !isEmbeddedRoute">
      <div class="row">
        <strong>{{ $t('未提出') }}</strong>
      </div>
      <div v-if="missingBallotSubmitters.length === 0" class="muted">
        {{ $t('スコアシート未提出はありません。') }}
      </div>
      <div v-else class="stack">
        <strong>{{ $t('スコアシート未提出（ジャッジ）') }}</strong>
        <ul class="list compact">
          <li v-for="adj in missingBallotSubmitters" :key="adj._id">{{ adj.name }}</li>
        </ul>
      </div>
      <div v-if="missingFeedbackFromTeams.length > 0" class="stack">
        <strong>{{ $t('評価未提出（{label}）', { label: missingFeedbackTeamLabel }) }}</strong>
        <ul class="list compact">
          <li v-for="item in missingFeedbackFromTeams" :key="item.id">{{ item.name }}</li>
        </ul>
      </div>
      <div v-if="missingFeedbackFromAdjudicators.length > 0" class="stack">
        <strong>{{ $t('評価未提出（ジャッジ）') }}</strong>
        <ul class="list compact">
          <li v-for="adj in missingFeedbackFromAdjudicators" :key="adj._id">{{ adj.name }}</li>
        </ul>
      </div>
      <div v-if="unknownBallotCount > 0 || unknownFeedbackCount > 0" class="muted">
        {{
          $t('提出者情報が不足している提出: Ballot {ballot} / Feedback {feedback}', {
            ballot: unknownBallotCount,
            feedback: unknownFeedbackCount,
          })
        }}
      </div>
    </div>

    <section :class="['stack', 'allocation-board', { card: !isEmbeddedRoute }]">
      <LoadingState v-if="sectionLoading" />
      <template v-else>
        <section class="stack board-block">
          <div class="row board-head">
            <h4>{{ $t('対戦表') }}</h4>
            <CompiledSnapshotSelect
              v-if="detailSnapshotSelectOptions.length > 0"
              v-model="selectedDetailSnapshotId"
              class="detail-snapshot-select"
              :label="$t('参照集計結果')"
              :options="detailSnapshotSelectOptions"
            />
            <span v-else class="muted small">{{ $t('参照可能な集計結果がありません。') }}</span>
          </div>
          <p v-if="detailSnapshotLabel" class="muted tiny">
            {{ $t('警告と詳細は次の集計を参照: {label}', { label: detailSnapshotLabel }) }}
          </p>
          <div v-if="allocation.length === 0" class="muted">{{ $t('まだ行がありません。') }}</div>
          <div v-else class="allocation-table-wrap">
            <table class="allocation-table">
              <thead>
                <tr>
                  <th class="match-col"></th>
                  <th class="venue-col">{{ $t('会場') }}</th>
                  <th class="team-col">{{ govLabel }}</th>
                  <th class="team-col">{{ oppLabel }}</th>
                  <th class="adjudicator-col">{{ $t('チェア') }}</th>
                  <th class="adjudicator-col">{{ $t('パネル') }}</th>
                  <th class="adjudicator-col">{{ $t('トレーニー') }}</th>
                  <th>{{ $t('備考') }}</th>
                  <th class="delete-col"></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="(row, index) in allocation" :key="`row-${index}`">
                  <tr>
                    <td class="match-col">{{ index + 1 }}</td>
                    <td class="venue-col">
                      <div
                        class="drop-zone compact single-line"
                        :class="{ active: dragKind === 'venue' }"
                        @dragover.prevent
                        @drop="dropVenue(row)"
                      >
                        <span
                          v-if="row.venue"
                          class="pill draggable truncate-pill"
                          :title="venueName(row.venue)"
                          draggable="true"
                          @dragstart="onDragStart('venue', row.venue)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('venue', row.venue)"
                        >
                          {{ venueName(row.venue) }}
                        </span>
                        <span v-else class="muted small">{{ $t('ここに会場をドロップ') }}</span>
                      </div>
                    </td>
                    <td class="team-col">
                      <div
                        class="drop-zone compact single-line"
                        :class="{ active: dragKind === 'team' }"
                        @dragover.prevent
                        @drop="dropTeam(row, 'gov')"
                      >
                        <span
                          v-if="row.teams.gov"
                          class="pill draggable truncate-pill"
                          :title="teamName(row.teams.gov)"
                          draggable="true"
                          @dragstart="onDragStart('team', row.teams.gov)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('team', row.teams.gov)"
                        >
                          {{ teamName(row.teams.gov) }}
                        </span>
                        <span v-else class="muted small">{{ $t('ここにチームをドロップ') }}</span>
                      </div>
                    </td>
                    <td class="team-col">
                      <div
                        class="drop-zone compact single-line"
                        :class="{ active: dragKind === 'team' }"
                        @dragover.prevent
                        @drop="dropTeam(row, 'opp')"
                      >
                        <span
                          v-if="row.teams.opp"
                          class="pill draggable truncate-pill"
                          :title="teamName(row.teams.opp)"
                          draggable="true"
                          @dragstart="onDragStart('team', row.teams.opp)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('team', row.teams.opp)"
                        >
                          {{ teamName(row.teams.opp) }}
                        </span>
                        <span v-else class="muted small">{{ $t('ここにチームをドロップ') }}</span>
                      </div>
                    </td>
                    <td class="adjudicator-col">
                      <div
                        class="drop-zone list compact multi-line"
                        :class="{ active: dragKind === 'adjudicator' }"
                        @dragover.prevent
                        @drop="dropAdjudicator(row, 'chairs')"
                      >
                        <span
                          v-for="adjId in row.chairs"
                          :key="`chair-${index}-${adjId}`"
                          class="pill draggable truncate-pill"
                          :title="adjudicatorName(adjId)"
                          draggable="true"
                          @dragstart="onDragStart('adjudicator', adjId)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('adjudicator', adjId)"
                        >
                          {{ adjudicatorName(adjId) }}
                        </span>
                        <span v-if="row.chairs.length === 0" class="muted small">{{
                          $t('ジャッジをドロップ')
                        }}</span>
                      </div>
                    </td>
                    <td class="adjudicator-col">
                      <div
                        class="drop-zone list compact multi-line"
                        :class="{ active: dragKind === 'adjudicator' }"
                        @dragover.prevent
                        @drop="dropAdjudicator(row, 'panels')"
                      >
                        <span
                          v-for="adjId in row.panels"
                          :key="`panel-${index}-${adjId}`"
                          class="pill draggable truncate-pill"
                          :title="adjudicatorName(adjId)"
                          draggable="true"
                          @dragstart="onDragStart('adjudicator', adjId)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('adjudicator', adjId)"
                        >
                          {{ adjudicatorName(adjId) }}
                        </span>
                        <span v-if="row.panels.length === 0" class="muted small">{{
                          $t('ジャッジをドロップ')
                        }}</span>
                      </div>
                    </td>
                    <td class="adjudicator-col">
                      <div
                        class="drop-zone list compact multi-line"
                        :class="{ active: dragKind === 'adjudicator' }"
                        @dragover.prevent
                        @drop="dropAdjudicator(row, 'trainees')"
                      >
                        <span
                          v-for="adjId in row.trainees"
                          :key="`trainee-${index}-${adjId}`"
                          class="pill draggable truncate-pill"
                          :title="adjudicatorName(adjId)"
                          draggable="true"
                          @dragstart="onDragStart('adjudicator', adjId)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('adjudicator', adjId)"
                        >
                          {{ adjudicatorName(adjId) }}
                        </span>
                        <span v-if="row.trainees.length === 0" class="muted small">{{
                          $t('ジャッジをドロップ')
                        }}</span>
                      </div>
                    </td>
                    <td class="note-col">
                      <div v-if="rowWarnings(row).length > 0" class="warning-inline">
                        <span
                          class="warning-summary"
                          :class="warningSummaryClass(rowWarnings(row))"
                        >
                          {{ warningSummary(rowWarnings(row)) }}
                        </span>
                        <div class="warning-popover">
                          <div
                            v-for="(warning, warningIndex) in rowWarnings(row)"
                            :key="`${warning.category}-${warningIndex}`"
                            class="warning-item"
                            :class="`warning-item--${warning.category}`"
                          >
                            <span class="warning-kind">{{ warningLabel(warning.category) }}</span>
                            <span>{{ warning.message }}</span>
                          </div>
                        </div>
                      </div>
                      <span v-else class="muted small">{{ $t('なし') }}</span>
                    </td>
                    <td class="delete-col">
                      <button
                        type="button"
                        class="row-remove"
                        :aria-label="$t('削除')"
                        :title="$t('削除')"
                        :disabled="locked"
                        @click="removeRow(index)"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <div class="row add-row-wrap">
            <button
              type="button"
              class="add-row-button"
              :disabled="locked"
              @click="addRow"
            >
              <span class="plus" aria-hidden="true">+</span>
              <span>{{ $t('行追加') }}</span>
            </button>
          </div>
        </section>

        <section class="stack waiting-area board-block">
          <h4>{{ $t('未配置リスト') }}</h4>
          <div class="grid waiting-grid">
            <div class="stack">
              <span class="muted">{{ $t('チーム') }} ({{ unassignedTeams.length }})</span>
              <div
                class="drop-zone list compact multi-line"
                :class="{ active: dragKind === 'team' }"
                @dragover.prevent
                @drop="dropToWaiting('team')"
              >
                <span v-if="unassignedTeams.length === 0" class="muted small">
                  {{ $t('なし') }}
                </span>
                <span
                  v-for="team in unassignedTeams"
                  :key="team._id"
                  class="pill draggable truncate-pill"
                  :title="team.name"
                  draggable="true"
                  @dragstart="onDragStart('team', team._id)"
                  @dragend="onDragEnd"
                  @click.stop="selectDetail('team', team._id)"
                >
                  {{ team.name }}
                </span>
              </div>
            </div>
            <div class="stack">
              <span class="muted">{{ $t('ジャッジ') }} ({{ unassignedAdjudicators.length }})</span>
              <div
                class="drop-zone list compact multi-line"
                :class="{ active: dragKind === 'adjudicator' }"
                @dragover.prevent
                @drop="dropToWaiting('adjudicator')"
              >
                <span v-if="unassignedAdjudicators.length === 0" class="muted small">
                  {{ $t('なし') }}
                </span>
                <span
                  v-for="adj in unassignedAdjudicators"
                  :key="adj._id"
                  class="pill draggable truncate-pill"
                  :title="adj.name"
                  draggable="true"
                  @dragstart="onDragStart('adjudicator', adj._id)"
                  @dragend="onDragEnd"
                  @click.stop="selectDetail('adjudicator', adj._id)"
                >
                  {{ adj.name }}
                </span>
              </div>
            </div>
            <div class="stack">
              <span class="muted">{{ $t('会場') }} ({{ unassignedVenues.length }})</span>
              <div
                class="drop-zone list compact multi-line"
                :class="{ active: dragKind === 'venue' }"
                @dragover.prevent
                @drop="dropToWaiting('venue')"
              >
                <span v-if="unassignedVenues.length === 0" class="muted small">
                  {{ $t('なし') }}
                </span>
                <span
                  v-for="venue in unassignedVenues"
                  :key="venue._id"
                  class="pill draggable truncate-pill"
                  :title="venue.name"
                  draggable="true"
                  @dragstart="onDragStart('venue', venue._id)"
                  @dragend="onDragEnd"
                  @click.stop="selectDetail('venue', venue._id)"
                >
                  {{ venue.name }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section class="stack board-block">
          <div class="row preview-head">
            <h4>{{ $t('対戦表') }}</h4>
          </div>
          <DrawPreviewTable :rows="previewRows" :gov-label="govLabel" :opp-label="oppLabel" />
        </section>

        <div class="row allocation-toolbar">
          <div class="row action-row">
            <Button
              variant="secondary"
              size="sm"
              @click="showAutoGenerateModal = true"
              :disabled="isLoading || requestLoading"
            >
              {{ $t('自動生成') }}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              @click="openAdjudicatorImportModal"
              :disabled="isLoading || locked"
            >
              {{ $t('ジャッジ組み合わせ取込') }}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              @click="clearAllocation"
              :disabled="locked || allocation.length === 0"
            >
              {{ $t('クリア') }}
            </Button>
            <Button size="sm" @click="save" :disabled="isLoading || locked">{{ $t('保存') }}</Button>
            <Button
              variant="secondary"
              size="sm"
              @click="revertAllocation"
              :disabled="!allocationChanged"
            >
              {{ $t('元に戻す') }}
            </Button>
            <label v-if="savedDrawId" class="row lock-inline">
              <span class="muted small">{{ $t('ドローをロック') }}</span>
              <span class="switch">
                <input v-model="locked" type="checkbox" />
                <span class="switch-slider"></span>
              </span>
            </label>
            <span class="action-spacer"></span>
            <Button variant="danger" size="sm" @click="openDeleteDrawModal" :disabled="!currentDraw">
              {{ $t('削除') }}
            </Button>
          </div>
        </div>
      </template>
    </section>

    <ImportTextModal
      :open="showAdjudicatorImportModal"
      v-model:text="adjudicatorImportText"
      v-model:mode="adjudicatorImportMode"
      :title="$t('ジャッジ組み合わせ取込')"
      :help-text="$t('CSV/TSVを貼り付けてラウンドのジャッジ割当を一括反映します。')"
      :mode-options="adjudicatorImportModeOptions"
      :placeholder="$t('例: match,chairs,panels,trainees')"
      :description="
        $t(
          'フォーマット: ① match,chairs,panels,trainees（matchは1始まり） ② gov,opp,chairs,panels,trainees（チーム名/ID指定）'
        )
      "
      :example="'match,chairs,panels,trainees\n1,Judge A,Judge B|Judge C,\n2,Judge D,,Judge E'"
      :error="adjudicatorImportError"
      :disabled="locked"
      @file-change="handleAdjudicatorImportFile"
      @close="closeAdjudicatorImportModal"
      @submit="applyAdjudicatorImport"
    />

    <div
      v-if="showAutoGenerateModal"
      class="modal-backdrop"
      role="presentation"
      @click.self="showAutoGenerateModal = false"
    >
      <section class="modal card stack auto-modal" role="dialog" aria-modal="true">
        <div class="row auto-generate-header">
          <div class="row auto-label">
            <strong>{{ $t('自動生成') }}</strong>
            <span class="help-tip" aria-hidden="true">
              ?
              <span class="help-panel">
                {{
                  $t(
                    'チーム・ジャッジ・会場の割り当てを条件に沿って自動生成します。必要に応じて手動で調整してください。'
                  )
                }}
              </span>
            </span>
          </div>
          <Button variant="ghost" size="sm" @click="showAutoGenerateModal = false">
            {{ $t('閉じる') }}
          </Button>
        </div>
        <div class="stack auto-generate-layout">
          <section class="card soft stack auto-group">
            <h5 class="auto-group-title">{{ $t('基本設定') }}</h5>
            <div class="grid">
              <label class="stack">
                <span class="option-title">
                  {{ $t('対象') }}
                  <span class="help-tip" :title="$t('全体/チーム/ジャッジ/会場のどこを生成するか選択します。')"
                    >?</span
                  >
                </span>
                <select v-model="requestScope">
                  <option value="all">{{ $t('全体') }}</option>
                  <option value="teams">{{ $t('チーム') }}</option>
                  <option value="adjudicators">{{ $t('ジャッジ') }}</option>
                  <option value="venues">{{ $t('会場') }}</option>
                </select>
                <p class="muted tiny option-help-text">{{ requestScopeDescription }}</p>
              </label>
              <CompiledSnapshotSelect
                v-if="autoSnapshotSelectOptions.length > 0"
                v-model="selectedAutoSnapshotId"
                :label="$t('参照集計結果')"
                :options="autoSnapshotSelectOptions"
              />
              <p v-else class="muted small">
                {{ $t('参照できる集計結果がありません。未選択のまま自動生成できます。') }}
              </p>
            </div>
          </section>

          <section class="card soft stack auto-group">
            <h5 class="auto-group-title">{{ $t('生成エンジン') }}</h5>
            <div class="grid">
              <label class="stack" v-if="scopeIncludesTeams">
                <span class="option-title">
                  {{ $t('チームアルゴリズム') }}
                  <span class="help-tip" :title="$t('標準は簡易、厳密は制約を強めて生成します。')">?</span>
                </span>
                <select v-model="autoOptions.teamAlgorithm">
                  <option value="standard">{{ $t('標準') }}</option>
                  <option value="break">{{ $t('ブレイク') }}</option>
                  <option value="powerpair">{{ $t('Power Pair') }}</option>
                  <option value="strict">{{ $t('厳密') }}</option>
                </select>
                <p class="muted tiny option-help-text">{{ teamAlgorithmDescription }}</p>
              </label>
              <label class="stack" v-if="scopeIncludesAdjudicators">
                <span class="option-title">
                  {{ $t('ジャッジアルゴリズム') }}
                  <span class="help-tip" :title="$t('標準または伝統的な割当方法を選択します。')">?</span>
                </span>
                <select v-model="autoOptions.adjudicatorAlgorithm">
                  <option value="standard">{{ $t('標準') }}</option>
                  <option value="traditional">{{ $t('伝統的') }}</option>
                </select>
                <p class="muted tiny option-help-text">{{ adjudicatorAlgorithmDescription }}</p>
              </label>
              <label class="row" v-if="scopeIncludesVenues">
                <input v-model="autoOptions.shuffleVenue" type="checkbox" />
                <span class="option-title">
                  {{ $t('会場シャッフル') }}
                  <span class="help-tip" :title="$t('会場をランダムに割り当てる場合に有効にします。')"
                    >?</span
                  >
                </span>
              </label>
              <p v-if="scopeIncludesVenues" class="muted tiny option-help-text">
                {{ venueShuffleDescription }}
              </p>
            </div>
          </section>

          <section v-if="scopeIncludesTeams" class="card soft stack auto-group">
            <h5 class="auto-group-title">{{ $t('チーム生成詳細') }}</h5>
            <div class="grid" v-if="autoOptions.teamAlgorithm === 'standard'">
              <label class="stack">
                <span class="option-title">
                  {{ $t('チーム方式') }}
                  <span class="help-tip" :title="$t('標準アルゴリズムで使用する並び替え方式です。')">?</span>
                </span>
                <select v-model="autoOptions.teamMethod">
                  <option v-for="option in teamMethodOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <p class="muted tiny option-help-text">{{ teamMethodDescription }}</p>
              </label>
              <div class="stack">
                <span class="option-title">
                  {{ $t('チームフィルタ') }}
                  <span class="help-tip" :title="$t('適用する制約を複数選択できます。')">?</span>
                </span>
                <div class="checklist">
                  <div v-for="option in teamFilterOptions" :key="option.value" class="stack checklist-option">
                    <label class="row">
                      <input v-model="autoOptions.teamFilters" type="checkbox" :value="option.value" />
                      <span>{{ option.label }}</span>
                    </label>
                    <span class="muted tiny option-inline-help">{{ option.description }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="grid" v-else-if="autoOptions.teamAlgorithm === 'powerpair'">
              <label class="stack">
                <span class="option-title">
                  {{ $t('奇数ブラケット処理') }}
                  <span class="help-tip" :title="$t('パワーペアの奇数ブラケット処理です。')">?</span>
                </span>
                <select v-model="autoOptions.teamPowerpairOddBracket">
                  <option
                    v-for="option in teamPowerpairOddBracketOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <p class="muted tiny option-help-text">{{ teamPowerpairOddBracketDescription }}</p>
              </label>
              <label class="stack">
                <span class="option-title">
                  {{ $t('ペアリング方式') }}
                  <span class="help-tip" :title="$t('パワーペアのブラケット内ペアリング方式です。')"
                    >?</span
                  >
                </span>
                <select v-model="autoOptions.teamPowerpairPairingMethod">
                  <option
                    v-for="option in teamPowerpairPairingOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <p class="muted tiny option-help-text">{{ teamPowerpairPairingDescription }}</p>
              </label>
              <label class="stack">
                <span class="option-title">
                  {{ $t('衝突回避方式') }}
                  <span class="help-tip" :title="$t('パワーペアで使う衝突回避方式です。')">?</span>
                </span>
                <select v-model="autoOptions.teamPowerpairAvoidConflicts">
                  <option
                    v-for="option in teamPowerpairConflictOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <p class="muted tiny option-help-text">{{ teamPowerpairConflictDescription }}</p>
              </label>
              <label class="stack" v-if="autoOptions.teamPowerpairAvoidConflicts === 'one_up_one_down'">
                <span class="option-title">
                  {{ $t('機関衝突重み') }}
                  <span class="help-tip" :title="$t('同一属性（機関）衝突の回避強度です。')">?</span>
                </span>
                <input
                  v-model.number="autoOptions.teamPowerpairConflictInstitutionWeight"
                  type="number"
                  min="0"
                  step="0.1"
                />
              </label>
              <label class="stack" v-if="autoOptions.teamPowerpairAvoidConflicts === 'one_up_one_down'">
                <span class="option-title">
                  {{ $t('過去対戦重み') }}
                  <span class="help-tip" :title="$t('過去対戦の再マッチ回避強度です。')">?</span>
                </span>
                <input
                  v-model.number="autoOptions.teamPowerpairConflictPastOpponentWeight"
                  type="number"
                  min="0"
                  step="0.1"
                />
              </label>
              <label class="stack" v-if="autoOptions.teamPowerpairAvoidConflicts === 'one_up_one_down'">
                <span class="option-title">
                  {{ $t('最大スワップ試行') }}
                  <span class="help-tip" :title="$t('衝突回避のスワップ試行上限です。')">?</span>
                </span>
                <input
                  v-model.number="autoOptions.teamPowerpairMaxSwapIterations"
                  type="number"
                  min="0"
                  step="1"
                />
              </label>
            </div>
            <div class="grid" v-else-if="autoOptions.teamAlgorithm === 'break'">
              <p class="muted">
                {{
                  $t(
                    'Round のブレイク設定を参照して、シード順で対戦カードを生成します（1 vs N, 2 vs N-1 ...）。'
                  )
                }}
              </p>
            </div>
            <div class="grid" v-else>
              <label class="stack">
                <span class="option-title">
                  {{ $t('ペアリング方式') }}
                  <span class="help-tip" :title="$t('厳密アルゴリズムのチーム組み合わせ方式です。')">?</span>
                </span>
                <select v-model="autoOptions.teamStrictPairingMethod">
                  <option
                    v-for="option in teamStrictPairingOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <p class="muted tiny option-help-text">{{ teamStrictPairingDescription }}</p>
              </label>
              <label class="stack">
                <span class="option-title">
                  {{ $t('プルアップ方式') }}
                  <span class="help-tip" :title="$t('ブラケット間の繰り上げ方法を指定します。')">?</span>
                </span>
                <select v-model="autoOptions.teamStrictPullupMethod">
                  <option
                    v-for="option in teamStrictPullupOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <p class="muted tiny option-help-text">{{ teamStrictPullupDescription }}</p>
              </label>
              <label class="stack">
                <span class="option-title">
                  {{ $t('ポジション方式') }}
                  <span class="help-tip" :title="$t('サイド配置の方法を指定します。')">?</span>
                </span>
                <select v-model="autoOptions.teamStrictPositionMethod">
                  <option
                    v-for="option in teamStrictPositionOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <p class="muted tiny option-help-text">{{ teamStrictPositionDescription }}</p>
              </label>
              <label class="row">
                <input v-model="autoOptions.teamStrictAvoidConflict" type="checkbox" />
                <span class="option-title">
                  {{ $t('衝突回避') }}
                  <span class="help-tip" :title="$t('同一機関や衝突指定の対戦を避けます。')">?</span>
                </span>
              </label>
              <label class="stack" v-if="autoOptions.teamStrictAvoidConflict">
                <span class="option-title">
                  {{ $t('機関衝突重み') }}
                  <span class="help-tip" :title="$t('同一属性（機関）衝突の回避強度です。')">?</span>
                </span>
                <input
                  v-model.number="autoOptions.teamStrictConflictInstitutionWeight"
                  type="number"
                  min="0"
                  step="0.1"
                />
              </label>
              <label class="stack" v-if="autoOptions.teamStrictAvoidConflict">
                <span class="option-title">
                  {{ $t('過去対戦重み') }}
                  <span class="help-tip" :title="$t('過去対戦の再マッチ回避強度です。')">?</span>
                </span>
                <input
                  v-model.number="autoOptions.teamStrictConflictPastOpponentWeight"
                  type="number"
                  min="0"
                  step="0.1"
                />
              </label>
            </div>
          </section>

          <section v-if="scopeIncludesAdjudicators" class="card soft stack auto-group">
            <h5 class="auto-group-title">{{ $t('ジャッジ生成詳細') }}</h5>
            <div class="grid" v-if="autoOptions.adjudicatorAlgorithm === 'standard'">
              <div class="stack">
                <span class="option-title">
                  {{ $t('ジャッジフィルタ') }}
                  <span class="help-tip" :title="$t('ジャッジ割り当て時に適用する制約を選択します。')">?</span>
                </span>
                <div class="checklist">
                  <div
                    v-for="option in adjudicatorFilterOptions"
                    :key="option.value"
                    class="stack checklist-option"
                  >
                    <label class="row">
                      <input
                        v-model="autoOptions.adjudicatorFilters"
                        type="checkbox"
                        :value="option.value"
                      />
                      <span>{{ option.label }}</span>
                    </label>
                    <span class="muted tiny option-inline-help">{{ option.description }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="grid" v-else>
              <label class="stack">
                <span class="option-title">
                  {{ $t('割当方式') }}
                  <span class="help-tip" :title="$t('伝統的アルゴリズムの割り当て戦略です。')">?</span>
                </span>
                <select v-model="autoOptions.adjudicatorAssign">
                  <option
                    v-for="option in adjudicatorAssignOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <p class="muted tiny option-help-text">{{ adjudicatorAssignDescription }}</p>
              </label>
              <label class="row">
                <input v-model="autoOptions.adjudicatorScatter" type="checkbox" />
                <span class="option-title">
                  {{ $t('パネル分散') }}
                  <span class="help-tip" :title="$t('同系統のジャッジが偏らないように分散させます。')"
                    >?</span
                  >
                </span>
              </label>
              <p class="muted tiny option-help-text">
                {{
                  autoOptions.adjudicatorScatter
                    ? $t('有効時は同じ層のジャッジが一部屋に固まりすぎないよう、順に散らして配置します。')
                    : $t('無効時は上位から順に該当部屋へ詰めて配置します。')
                }}
              </p>
            </div>
          </section>

          <section v-if="scopeIncludesAdjudicators" class="card soft stack auto-group">
            <h5 class="auto-group-title">{{ $t('人数設定') }}</h5>
            <div class="grid">
              <label class="stack">
                <span class="option-title">
                  {{ $t('チェア') }}
                  <span class="help-tip" :title="$t('1マッチあたりのチェア人数です。')">?</span>
                </span>
                <input v-model.number="autoOptions.chairs" type="number" min="1" />
              </label>
              <label class="stack">
                <span class="option-title">
                  {{ $t('パネル') }}
                  <span class="help-tip" :title="$t('1マッチあたりのパネル人数です。')">?</span>
                </span>
                <input v-model.number="autoOptions.panels" type="number" min="0" />
              </label>
              <label class="stack">
                <span class="option-title">
                  {{ $t('トレーニー') }}
                  <span class="help-tip" :title="$t('1マッチあたりのトレーニー人数です。')">?</span>
                </span>
                <input v-model.number="autoOptions.trainees" type="number" min="0" />
              </label>
            </div>
          </section>
        </div>
        <p v-if="requestError" class="error">{{ requestError }}</p>
        <div class="row modal-actions">
          <Button
            size="sm"
            :loading="requestLoading"
            @click="requestAllocation"
            :disabled="isLoading || requestLoading"
          >
            {{ $t('生成') }}
          </Button>
        </div>
      </section>
    </div>

    <div
      v-if="showDeleteDrawModal"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeDeleteDrawModal"
    >
      <section class="modal card stack" role="dialog" aria-modal="true">
        <h4>{{ $t('ドロー削除') }}</h4>
        <p class="muted">{{ $t('このドローを削除しますか？') }}</p>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="closeDeleteDrawModal">{{ $t('キャンセル') }}</Button>
          <Button variant="danger" size="sm" :disabled="isLoading" @click="confirmDeleteCurrentDraw">
            {{ $t('削除') }}
          </Button>
        </div>
      </section>
    </div>

    <aside v-if="displayDetail" class="floating-detail card stack">
      <div class="row">
        <strong>{{ detailPanelLabel }}</strong>
        <Button v-if="!isDragDetail" variant="ghost" size="sm" @click="clearDetail">{{
          $t('閉じる')
        }}</Button>
      </div>
      <strong>{{ detailTitle }}</strong>
      <div v-if="detailRows.length === 0" class="muted">{{ $t('詳細情報がありません。') }}</div>
      <div v-else class="detail-grid">
        <div v-for="row in detailRows" :key="row.label" class="detail-row">
          <span class="muted">{{ row.label }}</span>
          <span>{{ row.value }}</span>
        </div>
      </div>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTeamsStore } from '@/stores/teams'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { useDrawsStore } from '@/stores/draws'
import { useVenuesStore } from '@/stores/venues'
import { useRoundsStore } from '@/stores/rounds'
import { useCompiledStore } from '@/stores/compiled'
import { useInstitutionsStore } from '@/stores/institutions'
import { useSubmissionsStore } from '@/stores/submissions'
import { useSpeakersStore } from '@/stores/speakers'
import { useTournamentStore } from '@/stores/tournament'
import { useStylesStore } from '@/stores/styles'
import type { DrawAllocationRow } from '@/types/draw'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'
import ImportTextModal from '@/components/common/ImportTextModal.vue'
import CompiledSnapshotSelect from '@/components/common/CompiledSnapshotSelect.vue'
import DrawPreviewTable from '@/components/common/DrawPreviewTable.vue'
import { api } from '@/utils/api'
import { getSideShortLabel } from '@/utils/side-labels'
import type { DrawPreviewRow } from '@/types/draw-preview'
import {
  applyAdjudicatorImportEntries,
  parseAdjudicatorImportText,
  type AdjudicatorImportMode,
} from '@/utils/adjudicator-import'

const route = useRoute()
const teams = useTeamsStore()
const adjudicators = useAdjudicatorsStore()
const draws = useDrawsStore()
const venues = useVenuesStore()
const roundsStore = useRoundsStore()
const compiledStore = useCompiledStore()
const institutions = useInstitutionsStore()
const submissionsStore = useSubmissionsStore()
const speakersStore = useSpeakersStore()
const tournamentStore = useTournamentStore()
const stylesStore = useStylesStore()
const { t } = useI18n({ useScope: 'global' })
const props = withDefaults(
  defineProps<{
    embedded?: boolean
    embeddedRound?: number | null
  }>(),
  {
    embedded: false,
    embeddedRound: null,
  }
)

function normalizeRoundValue(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null
}

const tournamentId = computed(() => route.params.tournamentId as string)
const round = computed(() => {
  const fromProp = normalizeRoundValue(props.embeddedRound)
  if (fromProp !== null) return fromProp
  const fromParam = normalizeRoundValue(route.params.round)
  if (fromParam !== null) return fromParam
  return normalizeRoundValue(route.query.round) ?? 1
})
const isEmbeddedRoute = computed(
  () => props.embedded || route.path.startsWith('/admin-embed/') || String(route.query.embed ?? '') === '1'
)

const allocation = ref<DrawAllocationRow[]>([])
const drawOpened = ref(false)
const allocationOpened = ref(false)
const locked = ref(false)
const sectionLoading = ref(true)
const formError = ref<string | null>(null)
const requestError = ref<string | null>(null)
const requestLoading = ref(false)
const requestScope = ref<'all' | 'teams' | 'adjudicators' | 'venues'>('all')
const savedSnapshot = ref('')
const savedDrawId = ref<string | null>(null)
const generatedUserDefinedData = ref<Record<string, any> | null>(null)
const showAutoGenerateModal = ref(false)
const showAdjudicatorImportModal = ref(false)
const showDeleteDrawModal = ref(false)
const compiledHistory = ref<any[]>([])
const selectedAutoSnapshotId = ref('')
const selectedDetailSnapshotId = ref('')
const adjudicatorImportText = ref('')
const adjudicatorImportMode = ref<AdjudicatorImportMode>('replace')
const adjudicatorImportError = ref<string | null>(null)
const adjudicatorImportInfo = ref<string | null>(null)
const adjudicatorImportModeOptions = computed<Array<{ value: AdjudicatorImportMode; label: string }>>(
  () => [
    { value: 'replace', label: t('置換') },
    { value: 'append', label: t('追記') },
  ]
)

const autoOptions = ref({
  teamAlgorithm: 'standard',
  teamMethod: 'straight',
  teamFilters: ['by_strength', 'by_side', 'by_past_opponent', 'by_institution'],
  teamPowerpairOddBracket: 'pullup_top',
  teamPowerpairPairingMethod: 'fold',
  teamPowerpairAvoidConflicts: 'one_up_one_down',
  teamPowerpairConflictInstitutionWeight: 1,
  teamPowerpairConflictPastOpponentWeight: 1,
  teamPowerpairMaxSwapIterations: 24,
  teamStrictPairingMethod: 'random',
  teamStrictPullupMethod: 'fromtop',
  teamStrictPositionMethod: 'adjusted',
  teamStrictAvoidConflict: true,
  teamStrictConflictInstitutionWeight: 1,
  teamStrictConflictPastOpponentWeight: 1,
  adjudicatorAlgorithm: 'standard',
  adjudicatorFilters: [
    'by_bubble',
    'by_strength',
    'by_attendance',
    'by_conflict',
    'by_institution',
    'by_past',
  ],
  adjudicatorAssign: 'high_to_high',
  adjudicatorScatter: false,
  chairs: 1,
  panels: 0,
  trainees: 0,
  shuffleVenue: false,
})

const teamFilterOptions = computed(() => [
  {
    value: 'by_strength',
    label: t('パワーペアリング'),
    description: t('現在の勝ち数・得点が近いチームを優先して、実力の近い対戦に寄せます。'),
  },
  {
    value: 'by_side',
    label: t('サイド偏り回避'),
    description: t('過去の政府/反対の偏りが小さくなる組み合わせを優先します。'),
  },
  {
    value: 'by_past_opponent',
    label: t('過去対戦回避'),
    description: t('同じ相手との再戦を避ける方向に評価します。'),
  },
  {
    value: 'by_institution',
    label: t('同一機関回避'),
    description: t('同じ所属機関どうしの対戦を避ける方向に評価します。'),
  },
  {
    value: 'by_random',
    label: t('ランダム'),
    description: t('同点時の並びを固定シードでランダム化し、偏りを分散します。'),
  },
])

const teamMethodOptions = computed(() => [
  {
    value: 'straight',
    label: t('ストレート'),
    description: t('各フィルタを同じ重みで合算し、総合点で候補順を作ります。'),
  },
  {
    value: 'original',
    label: t('オリジナル'),
    description: t('フィルタを上から順に適用して候補順を作る従来方式です。'),
  },
  {
    value: 'weighted',
    label: t('重み付け'),
    description: t('上にあるフィルタほど強く効くように重みを下げながら合算します。'),
  },
])

const teamStrictPairingOptions = computed(() => [
  { value: 'random', label: t('ランダム'), description: t('ブラケット内をランダム順で組みます。') },
  {
    value: 'fold',
    label: t('フォールド'),
    description: t('上位と下位を折り返して組み、実力差を均す定番方式です。'),
  },
  {
    value: 'slide',
    label: t('スライド'),
    description: t('上位群と下位群を平行に並べて順番に組みます。'),
  },
  {
    value: 'sort',
    label: t('ソート'),
    description: t('整列順をそのまま固定的に区切って組みます。'),
  },
  {
    value: 'adjusted',
    label: t('調整'),
    description: t('候補全体を比較して、偏りが小さい組み方を選びます。'),
  },
])

const teamPowerpairOddBracketOptions = computed(() => [
  {
    value: 'pullup_top',
    label: t('上位から'),
    description: t('奇数ブラケットで不足する1チームを、下位ブラケット上位から繰り上げます。'),
  },
  {
    value: 'pullup_bottom',
    label: t('下位から'),
    description: t('奇数ブラケットで不足する1チームを、下位ブラケット下位から繰り上げます。'),
  },
  {
    value: 'pullup_random',
    label: t('ランダム'),
    description: t('奇数ブラケットの繰り上げ元をランダムに選びます。'),
  },
])

const teamPowerpairPairingOptions = computed(() => [
  {
    value: 'slide',
    label: t('スライド'),
    description: t('ブラケットを前半/後半に分けて対応順に組みます。'),
  },
  {
    value: 'fold',
    label: t('フォールド'),
    description: t('ブラケット内の上位と下位を折り返して組みます。'),
  },
  { value: 'random', label: t('ランダム'), description: t('ブラケット内をランダムに組みます。') },
])

const teamPowerpairConflictOptions = computed(() => [
  {
    value: 'one_up_one_down',
    label: t('one-up-one-down'),
    description: t('隣接マッチ間で1チームずつ交換し、衝突が減るなら採用します。'),
  },
  {
    value: 'off',
    label: t('なし'),
    description: t('衝突最適化を行わず、初回ペアリング結果をそのまま使います。'),
  },
])

const teamStrictPullupOptions = computed(() => [
  {
    value: 'fromtop',
    label: t('上位から'),
    description: t('ブラケット間の人数調整で、下位ブラケット上位から繰り上げます。'),
  },
  {
    value: 'frombottom',
    label: t('下位から'),
    description: t('ブラケット間の人数調整で、下位ブラケット下位から繰り上げます。'),
  },
  {
    value: 'random',
    label: t('ランダム'),
    description: t('ブラケット間の繰り上げ対象をランダムに選びます。'),
  },
])

const teamStrictPositionOptions = computed(() => [
  {
    value: 'random',
    label: t('ランダム'),
    description: t('政府/反対の配置をランダムに決めます。'),
  },
  {
    value: 'adjusted',
    label: t('調整'),
    description: t('過去サイド履歴を見て、偏りが減る配置を選びます。'),
  },
])

const adjudicatorFilterOptions = computed(() => [
  {
    value: 'by_bubble',
    label: t('バブル'),
    description: t('現行実装では優先度は変わりません（将来拡張用）。'),
  },
  {
    value: 'by_strength',
    label: t('強さ'),
    description: t('ジャッジ評価（結果＋preev）が近い部屋を優先します。'),
  },
  {
    value: 'by_attendance',
    label: t('出席'),
    description: t('担当回数の偏りを減らす方向に評価します。'),
  },
  {
    value: 'by_conflict',
    label: t('衝突'),
    description: t('個別衝突に登録されたチームとの同席を避けます。'),
  },
  {
    value: 'by_institution',
    label: t('機関'),
    description: t('同一機関の衝突が少ない部屋を優先します。'),
  },
  {
    value: 'by_past',
    label: t('過去'),
    description: t('過去に担当したチームとの再担当を避けます。'),
  },
  {
    value: 'by_random',
    label: t('ランダム'),
    description: t('同点時の並びを固定シードでランダム化し偏りを分散します。'),
  },
])

const adjudicatorAssignOptions = computed(() => [
  {
    value: 'high_to_high',
    label: t('高→高'),
    description: t('評価の高いジャッジを、強い部屋から順に当てる配り方です。'),
  },
  {
    value: 'high_to_slight',
    label: t('高→弱'),
    description: t('評価の高いジャッジを、実力差が大きい部屋から優先して当てます。'),
  },
  {
    value: 'middle_to_high',
    label: t('中→高'),
    description: t('まずパネルを広く配ってから、強い部屋を優先して残りを埋めます。'),
  },
  {
    value: 'middle_to_slight',
    label: t('中→弱'),
    description: t('まずパネルを広く配ってから、実力差が大きい部屋を優先して埋めます。'),
  },
])

const isLoading = computed(
  () =>
    teams.loading ||
    adjudicators.loading ||
    draws.loading ||
    venues.loading ||
    roundsStore.loading ||
    compiledStore.loading ||
    institutions.loading ||
    submissionsStore.loading ||
    speakersStore.loading ||
    tournamentStore.loading ||
    stylesStore.loading
)
const currentDraw = computed(() => draws.draws.find((item) => item.round === round.value))
const roundConfig = computed(() => roundsStore.rounds.find((item) => item.round === round.value))
const roundHeading = computed(() => {
  const name = String(roundConfig.value?.name ?? '').trim()
  if (name.length > 0) return t('ラウンド {round}: {name}', { round: round.value, name })
  return t('ラウンド {round}', { round: round.value })
})
const tournament = computed(() =>
  tournamentStore.tournaments.find((item) => item._id === tournamentId.value)
)
const style = computed(() => stylesStore.styles.find((item) => item.id === tournament.value?.style))
const govLabel = computed(() => getSideShortLabel(style.value, 'gov', t('政府')))
const oppLabel = computed(() => getSideShortLabel(style.value, 'opp', t('反対')))
const priorRounds = computed(() =>
  roundsStore.rounds
    .filter((item) => item.round < round.value)
    .slice()
    .sort((a, b) => a.round - b.round)
)
const priorRoundNumbers = computed(() => priorRounds.value.map((item) => Number(item.round)))
type CompiledSnapshotOption = {
  compiledId: string
  rounds: number[]
  roundNames: string[]
  createdAt?: string
  payload: Record<string, any>
}
const compiledSnapshotOptions = computed<CompiledSnapshotOption[]>(() =>
  compiledHistory.value
    .map((item) => {
      const payload = item?.payload && typeof item.payload === 'object' ? item.payload : item
      const normalizedPayload =
        payload && typeof payload === 'object' ? (payload as Record<string, any>) : {}
      const roundsValue = Array.isArray(normalizedPayload?.rounds) ? normalizedPayload.rounds : []
      const normalizedRounds = roundsValue
        .map((entry: any) => Number(entry?.r ?? entry?.round ?? entry))
        .filter((value: number) => Number.isFinite(value))
      return {
        compiledId: String(item?._id ?? normalizedPayload?._id ?? ''),
        rounds: normalizedRounds,
        roundNames: roundsValue
          .map((entry: any) => String(entry?.name ?? '').trim())
          .filter((value: string) => value.length > 0),
        createdAt: item?.createdAt ? String(item.createdAt) : undefined,
        payload: normalizedPayload,
      }
    })
    .filter((item) => item.compiledId.length > 0)
)
const autoCompiledSnapshotOptions = computed<CompiledSnapshotOption[]>(() => {
  const priorSet = new Set(priorRoundNumbers.value)
  return compiledSnapshotOptions.value
    .map((item) => ({ ...item }))
    .filter((item) => item.rounds.some((value) => priorSet.has(value)))
})
const detailSnapshotSelectOptions = computed(() =>
  compiledSnapshotOptions.value.map((option) => ({
    value: option.compiledId,
    label: autoCompiledOptionLabel(option),
  }))
)
const selectedDetailSnapshot = computed<CompiledSnapshotOption | null>(() => {
  if (compiledSnapshotOptions.value.length === 0) return null
  const selected = compiledSnapshotOptions.value.find(
    (option) => option.compiledId === selectedDetailSnapshotId.value
  )
  return selected ?? compiledSnapshotOptions.value[0] ?? null
})
const selectedDetailPayload = computed<Record<string, any>>(() =>
  selectedDetailSnapshot.value?.payload ?? {}
)
const detailSnapshotLabel = computed(() => {
  if (!selectedDetailSnapshot.value) return ''
  return autoCompiledOptionLabel(selectedDetailSnapshot.value)
})
const autoSnapshotSelectOptions = computed(() =>
  autoCompiledSnapshotOptions.value.map((option) => ({
    value: option.compiledId,
    label: autoCompiledOptionLabel(option),
  }))
)
const scopeIncludesTeams = computed(
  () => requestScope.value === 'all' || requestScope.value === 'teams'
)
const scopeIncludesAdjudicators = computed(
  () => requestScope.value === 'all' || requestScope.value === 'adjudicators'
)
const scopeIncludesVenues = computed(
  () => requestScope.value === 'all' || requestScope.value === 'venues'
)

const requestScopeDescriptions = computed<Record<string, string>>(() => ({
  all: t('チーム・ジャッジ・会場をまとめて作り直します。最初に全体を組むとき向けです。'),
  teams: t('チームの組み合わせだけを作ります。既存のジャッジ・会場割当は維持します。'),
  adjudicators: t('既存の対戦カードを使ってジャッジだけを割り当て直します。'),
  venues: t('既存の対戦カードを使って会場だけを割り当て直します。'),
}))
const requestScopeDescription = computed(
  () => requestScopeDescriptions.value[requestScope.value] ?? ''
)

const teamAlgorithmDescriptions = computed<Record<string, string>>(() => ({
  standard: t(
    '標準: 各チームが候補を順位付けし、安定マッチング（Gale-Shapley）で対戦を作ります。'
  ),
  strict: t(
    '厳密: 勝ち数の層ごとに組み、繰り上げ・ペアリング・サイド決定の順で調整し、必要なら衝突を減らすスワップを行います。'
  ),
  powerpair: t(
    'Power Pair: 勝ち数ブラケット内で組みます。人数が奇数のブラケットは下位ブラケットから繰り上げて調整します。'
  ),
  break: t('ブレイク: ブレイク参加者シードを使い、1位対最下位の順で対戦を作ります。'),
}))
const teamAlgorithmDescription = computed(
  () => teamAlgorithmDescriptions.value[autoOptions.value.teamAlgorithm] ?? ''
)

const adjudicatorAlgorithmDescriptions = computed<Record<string, string>>(() => ({
  standard: t(
    '標準: 対戦とジャッジの双方の希望順を作り、安定マッチングでチェア→パネル→トレーニーの順に割り当てます。'
  ),
  traditional: t(
    '伝統的: 部屋とジャッジを並べて上から割り当てる方式です。割当戦略と分散オプションで配り方を変えます。'
  ),
}))
const adjudicatorAlgorithmDescription = computed(
  () => adjudicatorAlgorithmDescriptions.value[autoOptions.value.adjudicatorAlgorithm] ?? ''
)

const venueShuffleDescription = computed(() =>
  autoOptions.value.shuffleVenue
    ? t('会場をランダム順で割り当てます。固定順より会場偏りを避けたい場合に使います。')
    : t('会場優先度と対戦順に沿って割り当てます。')
)

function selectedDescription(
  options: Array<{ value: string; description: string }>,
  selectedValue: string
) {
  return options.find((option) => option.value === selectedValue)?.description ?? ''
}

const teamMethodDescription = computed(() =>
  selectedDescription(teamMethodOptions.value, autoOptions.value.teamMethod)
)
const teamPowerpairOddBracketDescription = computed(() =>
  selectedDescription(teamPowerpairOddBracketOptions.value, autoOptions.value.teamPowerpairOddBracket)
)
const teamPowerpairPairingDescription = computed(() =>
  selectedDescription(teamPowerpairPairingOptions.value, autoOptions.value.teamPowerpairPairingMethod)
)
const teamPowerpairConflictDescription = computed(() =>
  selectedDescription(teamPowerpairConflictOptions.value, autoOptions.value.teamPowerpairAvoidConflicts)
)
const teamStrictPairingDescription = computed(() =>
  selectedDescription(teamStrictPairingOptions.value, autoOptions.value.teamStrictPairingMethod)
)
const teamStrictPullupDescription = computed(() =>
  selectedDescription(teamStrictPullupOptions.value, autoOptions.value.teamStrictPullupMethod)
)
const teamStrictPositionDescription = computed(() =>
  selectedDescription(teamStrictPositionOptions.value, autoOptions.value.teamStrictPositionMethod)
)
const adjudicatorAssignDescription = computed(() =>
  selectedDescription(adjudicatorAssignOptions.value, autoOptions.value.adjudicatorAssign)
)

function formatCompiledTimestamp(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function roundName(roundNumber: number) {
  return (
    roundsStore.rounds.find((item) => Number(item.round) === Number(roundNumber))?.name ??
    t('ラウンド {round}', { round: roundNumber })
  )
}

function autoCompiledOptionLabel(option: CompiledSnapshotOption) {
  const roundLabel =
    option.roundNames.length > 0
      ? option.roundNames.join(', ')
      : option.rounds.length > 0
        ? option.rounds.map((roundNumber) => roundName(roundNumber)).join(', ')
        : t('全ラウンド')
  return `${t('日時')}: ${formatCompiledTimestamp(option.createdAt)} / ${t('考慮ラウンド')}: ${roundLabel}`
}

const allocationChanged = computed(() => allocationSnapshot() !== savedSnapshot.value)

function cloneAllocation(rows: DrawAllocationRow[]) {
  return rows.map((row) => ({
    venue: row.venue ?? '',
    teams: { gov: row.teams.gov, opp: row.teams.opp },
    chairs: [...(row.chairs ?? [])],
    panels: [...(row.panels ?? [])],
    trainees: [...(row.trainees ?? [])],
  }))
}

function allocationSnapshot() {
  return JSON.stringify({
    drawOpened: drawOpened.value,
    allocationOpened: allocationOpened.value,
    locked: locked.value,
    allocation: allocation.value.map((row) => ({
      venue: row.venue ?? '',
      teams: { gov: row.teams.gov ?? '', opp: row.teams.opp ?? '' },
      chairs: row.chairs ?? [],
      panels: row.panels ?? [],
      trainees: row.trainees ?? [],
    })),
  })
}

function syncFromDraw(draw?: DrawAllocationRow[] | any | null) {
  if (draw) {
    allocation.value = cloneAllocation(draw.allocation ?? [])
    drawOpened.value = Boolean(draw.drawOpened)
    allocationOpened.value = Boolean(draw.allocationOpened)
    locked.value = Boolean(draw.locked)
    savedDrawId.value = draw._id ?? null
    generatedUserDefinedData.value =
      draw.userDefinedData && typeof draw.userDefinedData === 'object'
        ? (draw.userDefinedData as Record<string, any>)
        : null
  } else {
    allocation.value = []
    drawOpened.value = false
    allocationOpened.value = false
    locked.value = false
    savedDrawId.value = null
    generatedUserDefinedData.value = null
  }
  savedSnapshot.value = allocationSnapshot()
}

async function refresh() {
  if (!tournamentId.value) return
  sectionLoading.value = true
  try {
    await Promise.all([
      teams.fetchTeams(tournamentId.value),
      adjudicators.fetchAdjudicators(tournamentId.value),
      draws.fetchDraws(tournamentId.value, round.value),
      venues.fetchVenues(tournamentId.value),
      roundsStore.fetchRounds(tournamentId.value),
      compiledStore.fetchLatest(tournamentId.value),
      refreshCompiledHistory(),
      institutions.fetchInstitutions(tournamentId.value),
      speakersStore.fetchSpeakers(tournamentId.value),
      tournamentStore.fetchTournaments(),
      stylesStore.fetchStyles(),
      submissionsStore.fetchSubmissions({
        tournamentId: tournamentId.value,
        round: round.value,
      }),
    ])
  } finally {
    sectionLoading.value = false
  }
}

async function refreshCompiledHistory() {
  if (!tournamentId.value) return
  try {
    const res = await api.get('/compiled', { params: { tournamentId: tournamentId.value } })
    compiledHistory.value = Array.isArray(res.data?.data) ? res.data.data : []
  } catch {
    compiledHistory.value = []
  }
}

function addRow() {
  allocation.value.push({
    venue: '',
    teams: { gov: '', opp: '' },
    chairs: [],
    panels: [],
    trainees: [],
  })
}

function removeRow(index: number) {
  allocation.value.splice(index, 1)
}

async function save() {
  formError.value = null
  const validRows = allocation.value.filter((row) => row.teams.gov && row.teams.opp)
  if (validRows.length === 0) {
    formError.value = t('有効なマッチがありません。')
    return
  }
  if (validRows.some((row) => row.teams.gov === row.teams.opp)) {
    formError.value = t('同じチームが両サイドに設定されています。')
    return
  }
  const saved = await draws.upsertDraw({
    tournamentId: tournamentId.value,
    round: round.value,
    allocation: validRows,
    ...(generatedUserDefinedData.value ? { userDefinedData: generatedUserDefinedData.value } : {}),
    drawOpened: drawOpened.value,
    allocationOpened: allocationOpened.value,
    locked: locked.value,
  })
  if (!saved) {
    formError.value = draws.error ?? t('保存に失敗しました')
    return
  }
  savedSnapshot.value = allocationSnapshot()
  savedDrawId.value = saved?._id ?? savedDrawId.value
}

function openAdjudicatorImportModal() {
  adjudicatorImportError.value = null
  showAdjudicatorImportModal.value = true
}

function closeAdjudicatorImportModal() {
  showAdjudicatorImportModal.value = false
  adjudicatorImportError.value = null
}

async function handleAdjudicatorImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  adjudicatorImportError.value = null
  adjudicatorImportText.value = await file.text()
  input.value = ''
}

function applyAdjudicatorImport() {
  adjudicatorImportError.value = null
  adjudicatorImportInfo.value = null
  if (locked.value) {
    adjudicatorImportError.value = t('ドローがロックされているため取り込みできません。')
    return
  }

  const parsed = parseAdjudicatorImportText(adjudicatorImportText.value)
  if (parsed.errors.length > 0) {
    adjudicatorImportError.value = parsed.errors.join(' / ')
    return
  }
  if (parsed.entries.length === 0) {
    adjudicatorImportError.value = t('取り込み可能な行がありません。')
    return
  }

  const applied = applyAdjudicatorImportEntries({
    allocation: allocation.value,
    entries: parsed.entries,
    teams: teams.teams.map((team) => ({ _id: String(team._id), name: String(team.name ?? '') })),
    adjudicators: adjudicators.adjudicators.map((adj) => ({
      _id: String(adj._id),
      name: String(adj.name ?? ''),
    })),
    mode: adjudicatorImportMode.value,
  })
  if (applied.errors.length > 0) {
    adjudicatorImportError.value = applied.errors.join(' / ')
    return
  }

  allocation.value = applied.allocation.map((row) => ({
    venue: row.venue ?? '',
    teams: { gov: String(row.teams.gov ?? ''), opp: String(row.teams.opp ?? '') },
    chairs: [...(row.chairs ?? [])],
    panels: [...(row.panels ?? [])],
    trainees: [...(row.trainees ?? [])],
  }))
  adjudicatorImportInfo.value = t('ジャッジ組み合わせを {count} 試合に取り込みました。', {
    count: applied.appliedRows,
  })
  closeAdjudicatorImportModal()
}

async function requestAllocation() {
  requestError.value = null
  requestLoading.value = true
  try {
    const teamOptions =
      autoOptions.value.teamAlgorithm === 'strict'
        ? {
            pairing_method: autoOptions.value.teamStrictPairingMethod,
            pullup_method: autoOptions.value.teamStrictPullupMethod,
            position_method: autoOptions.value.teamStrictPositionMethod,
            avoid_conflict: autoOptions.value.teamStrictAvoidConflict,
            conflict_weights: {
              institution: autoOptions.value.teamStrictConflictInstitutionWeight,
              past_opponent: autoOptions.value.teamStrictConflictPastOpponentWeight,
            },
          }
        : autoOptions.value.teamAlgorithm === 'powerpair'
          ? {
              odd_bracket: autoOptions.value.teamPowerpairOddBracket,
              pairing_method: autoOptions.value.teamPowerpairPairingMethod,
              avoid_conflicts: autoOptions.value.teamPowerpairAvoidConflicts,
              conflict_weights: {
                institution: autoOptions.value.teamPowerpairConflictInstitutionWeight,
                past_opponent: autoOptions.value.teamPowerpairConflictPastOpponentWeight,
              },
              max_swap_iterations: autoOptions.value.teamPowerpairMaxSwapIterations,
            }
        : autoOptions.value.teamAlgorithm === 'break'
          ? {}
        : {
            method: autoOptions.value.teamMethod,
            filters: autoOptions.value.teamFilters,
          }
    const adjudicatorOptions =
      autoOptions.value.adjudicatorAlgorithm === 'traditional'
        ? {
            assign: autoOptions.value.adjudicatorAssign,
            scatter: autoOptions.value.adjudicatorScatter,
          }
        : { filters: autoOptions.value.adjudicatorFilters }
    const snapshotId = String(selectedAutoSnapshotId.value ?? '').trim()
    const roundList = snapshotId ? [] : priorRounds.value.map((item) => item.round)
    if (
      (requestScope.value === 'adjudicators' || requestScope.value === 'venues') &&
      allocation.value.length === 0
    ) {
      requestError.value = t(
        '既存のドローがないため、adjudicators/venues 生成には先にチーム割り当てが必要です。'
      )
      return
    }
    if (
      scopeIncludesTeams.value &&
      autoOptions.value.teamAlgorithm === 'break' &&
      requestScope.value !== 'teams'
    ) {
      requestError.value = t('ブレイク生成は対象をチームに設定してください。')
      return
    }
    const options = {
      team_allocation_algorithm: autoOptions.value.teamAlgorithm,
      team_allocation_algorithm_options: teamOptions,
      adjudicator_allocation_algorithm: autoOptions.value.adjudicatorAlgorithm,
      adjudicator_allocation_algorithm_options: adjudicatorOptions,
      numbers_of_adjudicators: {
        chairs: autoOptions.value.chairs,
        panels: autoOptions.value.panels,
        trainees: autoOptions.value.trainees,
      },
      venue_allocation_algorithm_options: { shuffle: autoOptions.value.shuffleVenue },
    }

    const basePayload: Record<string, any> = {
      tournamentId: tournamentId.value,
      round: round.value,
      options,
      rounds: roundList.length > 0 ? roundList : undefined,
      ...(snapshotId ? { snapshotId } : {}),
    }

    let endpoint = '/allocations'
    let payload = basePayload
    if (requestScope.value === 'teams') {
      endpoint =
        autoOptions.value.teamAlgorithm === 'break' ? '/allocations/break' : '/allocations/teams'
    } else if (requestScope.value === 'adjudicators') {
      endpoint = '/allocations/adjudicators'
      payload = { ...basePayload, allocation: allocation.value }
    } else if (requestScope.value === 'venues') {
      endpoint = '/allocations/venues'
      payload = { ...basePayload, allocation: allocation.value }
    }

    const res = await api.post(endpoint, payload)
    const data = res.data?.data
    if (data?.allocation) {
      allocation.value = cloneAllocation(data.allocation)
      if (Object.prototype.hasOwnProperty.call(data, 'userDefinedData')) {
        generatedUserDefinedData.value =
          data.userDefinedData && typeof data.userDefinedData === 'object'
            ? (data.userDefinedData as Record<string, any>)
            : null
      } else if (requestScope.value === 'all' || requestScope.value === 'teams') {
        generatedUserDefinedData.value = null
      }
      showAutoGenerateModal.value = false
    }
  } catch (err: any) {
    requestError.value = err?.response?.data?.errors?.[0]?.message ?? t('自動生成に失敗しました')
  } finally {
    requestLoading.value = false
  }
}

function clearAllocation() {
  allocation.value = []
}

function revertAllocation() {
  syncFromDraw(currentDraw.value ?? null)
}

function detailAvailable(details: any[] | undefined, r: number) {
  const detail = details?.find((d: any) => Number(d.r) === r)
  return detail?.available !== false
}

function detailForRound(details: any[] | undefined, r: number) {
  return details?.find((d: any) => Number(d.r) === r) ?? {}
}

function normalizeInstitutions(values: string[] = []) {
  const mapped = new Set<string>()
  values.forEach((value) => {
    const token = String(value)
    if (!token) return
    mapped.add(token)
    const match = institutions.institutions.find(
      (inst) => inst._id === token || inst.name === token
    )
    if (match) mapped.add(match._id)
  })
  return Array.from(mapped)
}

function teamInstitutions(team: any) {
  if (!team) return []
  const detail = detailForRound(team.details, round.value)
  const base = ([] as string[]).concat(detail.institutions ?? [])
  if (team.institution) base.push(String(team.institution))
  return normalizeInstitutions(base)
}

function adjudicatorInstitutions(adj: any) {
  if (!adj) return []
  const detail = detailForRound(adj.details, round.value)
  return normalizeInstitutions(detail.institutions ?? [])
}

function adjudicatorConflicts(adj: any) {
  if (!adj) return []
  const detail = detailForRound(adj.details, round.value)
  return (detail.conflicts ?? []).map((id: any) => String(id))
}

const compiledTeamMap = computed(() => {
  const results = Array.isArray(selectedDetailPayload.value?.compiled_team_results)
    ? selectedDetailPayload.value.compiled_team_results
    : []
  const map = new Map<string, any>()
  results.forEach((result: any) => {
    map.set(String(result.id), result)
  })
  return map
})

const compiledAdjMap = computed(() => {
  const results = Array.isArray(selectedDetailPayload.value?.compiled_adjudicator_results)
    ? selectedDetailPayload.value.compiled_adjudicator_results
    : []
  const map = new Map<string, any>()
  results.forEach((result: any) => {
    map.set(String(result.id), result)
  })
  return map
})

function adjudicatorListLabel(ids: string[]) {
  if (!ids || ids.length === 0) return '—'
  return ids.map((id) => adjudicatorNameById(id)).join(', ')
}

const previewRows = computed<DrawPreviewRow[]>(() => {
  return allocation.value.map((row, index) => {
    const govId = row.teams.gov
    const oppId = row.teams.opp
    const govResult = compiledTeamMap.value.get(String(govId))
    const oppResult = compiledTeamMap.value.get(String(oppId))
    const govWin = Number(govResult?.win)
    const oppWin = Number(oppResult?.win)
    const normalizedGovWin = Number.isFinite(govWin) ? govWin : 0
    const normalizedOppWin = Number.isFinite(oppWin) ? oppWin : 0
    const venueLabel = row.venue ? venueName(row.venue) : t('会場未定')
    const govName = govId ? teamName(govId) : t('未選択')
    const oppName = oppId ? teamName(oppId) : t('未選択')
    return {
      key: `${index}-${govId}-${oppId}-${row.venue ?? ''}`,
      matchIndex: index,
      venuePriority: venuePriority(row.venue),
      venueLabel,
      govName,
      oppName,
      winLabel: `${normalizedGovWin}-${normalizedOppWin}`,
      winTotal: normalizedGovWin + normalizedOppWin,
      winGap: Math.abs(normalizedGovWin - normalizedOppWin),
      chairsLabel: adjudicatorListLabel(row.chairs ?? []),
      panelsLabel: adjudicatorListLabel(row.panels ?? []),
      traineesLabel: adjudicatorListLabel(row.trainees ?? []),
    }
  })
})

function teamNameById(id: string) {
  return teams.teams.find((team) => team._id === id)?.name ?? id
}

function adjudicatorNameById(id: string) {
  return adjudicators.adjudicators.find((adj) => adj._id === id)?.name ?? id
}

function speakerNameById(id: string) {
  return speakersStore.speakers.find((speaker) => speaker._id === id)?.name ?? id
}

function institutionNameById(id: string) {
  return institutions.institutions.find((inst) => inst._id === id)?.name ?? id
}

function teamSpeakerNames(team: any) {
  if (!team) return []
  const detail = detailForRound(team.details, round.value)
  const detailSpeakerIds = (detail.speakers ?? []).map((id: any) => String(id)).filter(Boolean)
  if (detailSpeakerIds.length > 0) {
    return detailSpeakerIds.map((id: string) => speakerNameById(id))
  }
  if (Array.isArray(team.speakers)) {
    return team.speakers.map((speaker: any) => speaker?.name ?? '').filter(Boolean)
  }
  return []
}

function teamSpeakerIds(team: any) {
  if (!team) return []
  const detail = detailForRound(team.details, round.value)
  const detailSpeakerIds = (detail.speakers ?? []).map((id: any) => String(id)).filter(Boolean)
  if (detailSpeakerIds.length > 0) return detailSpeakerIds
  if (Array.isArray(team.speakers)) {
    return team.speakers
      .map((speaker: any) => {
        const name = speaker?.name
        if (!name) return ''
        return speakersStore.speakers.find((item) => item.name === name)?._id ?? ''
      })
      .filter(Boolean)
  }
  return []
}

type DragKind = 'team' | 'adjudicator' | 'venue'
const dragPayload = ref<{ kind: DragKind; id: string } | null>(null)
const dragKind = computed(() => dragPayload.value?.kind ?? null)

const selectedDetail = ref<{ type: 'team' | 'adjudicator' | 'venue'; id: string } | null>(null)

function selectDetail(type: 'team' | 'adjudicator' | 'venue', id?: string) {
  if (!id) return
  if (selectedDetail.value?.type === type && selectedDetail.value?.id === id) {
    selectedDetail.value = null
    return
  }
  selectedDetail.value = { type, id }
}

function clearDetail() {
  selectedDetail.value = null
}

const displayDetail = computed<
  { type: 'team' | 'adjudicator' | 'venue'; id: string; fromDrag: boolean } | null
>(() => {
  if (dragPayload.value) {
    const type =
      dragPayload.value.kind === 'team'
        ? 'team'
        : dragPayload.value.kind === 'adjudicator'
          ? 'adjudicator'
          : 'venue'
    return {
      type,
      id: dragPayload.value.id,
      fromDrag: true,
    }
  }
  if (!selectedDetail.value) return null
  return { ...selectedDetail.value, fromDrag: false }
})

const isDragDetail = computed(() => displayDetail.value?.fromDrag === true)

const detailPanelLabel = computed(() => {
  if (!displayDetail.value) return ''
  if (displayDetail.value.fromDrag) {
    if (displayDetail.value.type === 'team') return t('選択中のチーム詳細')
    if (displayDetail.value.type === 'adjudicator') return t('選択中のジャッジ詳細')
  }
  if (displayDetail.value.type === 'team') return t('チーム詳細')
  if (displayDetail.value.type === 'adjudicator') return t('ジャッジ詳細')
  return t('会場詳細')
})

const detailTitle = computed(() => {
  if (!displayDetail.value) return ''
  if (displayDetail.value.type === 'team') {
    return t('チーム: {name}', { name: teamNameById(displayDetail.value.id) })
  }
  if (displayDetail.value.type === 'adjudicator') {
    return t('ジャッジ: {name}', { name: adjudicatorNameById(displayDetail.value.id) })
  }
  return t('会場: {name}', { name: venueName(displayDetail.value.id) })
})

const detailRows = computed(() => {
  if (!displayDetail.value) return []
  const { type, id } = displayDetail.value
  if (type === 'team') {
    const team = teams.teams.find((t) => t._id === id)
    const result = compiledTeamMap.value.get(String(id))
    const institutionsList = team
      ? teamInstitutions(team).map((inst) => institutionNameById(inst))
      : []
    const speakersList = teamSpeakerNames(team)
    return [
      { label: t('順位'), value: result?.ranking ?? '—' },
      { label: t('勝利数'), value: result?.win ?? '—' },
      { label: t('合計'), value: result?.sum ?? '—' },
      { label: t('マージン'), value: result?.margin ?? '—' },
      {
        label: t('所属機関'),
        value: institutionsList.length ? institutionsList.join(', ') : '—',
      },
      {
        label: t('対戦相手'),
        value: result?.past_opponents?.length
          ? result.past_opponents.map((opp: string) => teamNameById(opp)).join(', ')
          : '—',
      },
      {
        label: t('サイド'),
        value: result?.past_sides?.length ? result.past_sides.join(', ') : '—',
      },
      { label: t('スピーカー'), value: speakersList.length ? speakersList.join(', ') : '—' },
      { label: t('ID'), value: id },
    ]
  }
  if (type === 'adjudicator') {
    const adj = adjudicators.adjudicators.find((a) => a._id === id)
    const result = compiledAdjMap.value.get(String(id))
    const institutionsList = adj
      ? adjudicatorInstitutions(adj).map((inst) => institutionNameById(inst))
      : []
    const conflictsList = adj
      ? adjudicatorConflicts(adj).map((teamId: string) => teamNameById(teamId))
      : []
    return [
      { label: t('順位'), value: result?.ranking ?? '—' },
      { label: t('平均'), value: result?.average ?? '—' },
      {
        label: t('所属機関'),
        value: institutionsList.length ? institutionsList.join(', ') : '—',
      },
      {
        label: t('衝突'),
        value: conflictsList.length ? conflictsList.join(', ') : '—',
      },
      {
        label: t('担当チーム'),
        value: result?.judged_teams?.length
          ? result.judged_teams.map((teamId: string) => teamNameById(teamId)).join(', ')
          : '—',
      },
      { label: t('担当数'), value: result?.num_experienced ?? result?.active_num ?? '—' },
      { label: t('チェア担当'), value: result?.num_experienced_chair ?? '—' },
      { label: t('ID'), value: id },
    ]
  }
  const venue = venues.venues.find((v) => v._id === id)
  const detail = venue ? detailForRound(venue.details, round.value) : {}
  return [
    { label: t('優先度'), value: detail?.priority ?? '—' },
    { label: t('有効'), value: detail?.available === false ? t('いいえ') : t('はい') },
    { label: t('ID'), value: id },
  ]
})

function hasIntersection(a: string[], b: string[]) {
  const setB = new Set(b)
  return a.some((value) => setB.has(value))
}

function checkSided(result: any, side: 'gov' | 'opp') {
  if (!result) return false
  const sides = [...(result.past_sides ?? []), side]
  const gov = sides.filter((s) => s === 'gov').length
  const opp = sides.filter((s) => s === 'opp').length
  return Math.abs(gov - opp) > 1
}

type WarningCategory = 'team' | 'adjudicator' | 'venue'
type Warning = { category: WarningCategory; message: string }

function warningLabel(category: WarningCategory) {
  if (category === 'adjudicator') return t('ジャッジ')
  if (category === 'venue') return t('会場')
  return t('チーム')
}

function rowWarnings(row: DrawAllocationRow): Warning[] {
  const warnings: Warning[] = []
  const govId = row.teams.gov
  const oppId = row.teams.opp
  const teamIds = [govId, oppId].filter(Boolean)
  const adjudicatorIds = ([] as string[])
    .concat(row.chairs ?? [], row.panels ?? [], row.trainees ?? [])
    .filter(Boolean)

  const teamA = teams.teams.find((team) => team._id === govId)
  const teamB = teams.teams.find((team) => team._id === oppId)
  const teamResultA = compiledTeamMap.value.get(String(govId))
  const teamResultB = compiledTeamMap.value.get(String(oppId))

  if (teamA && !detailAvailable(teamA.details, round.value)) {
    warnings.push({
      category: 'team',
      message: t('{name} は利用不可', { name: teamNameById(govId) }),
    })
  }
  if (teamB && !detailAvailable(teamB.details, round.value)) {
    warnings.push({
      category: 'team',
      message: t('{name} は利用不可', { name: teamNameById(oppId) }),
    })
  }
  if (row.venue) {
    const venue = venues.venues.find((v) => v._id === row.venue)
    if (venue && !detailAvailable(venue.details, round.value)) {
      warnings.push({
        category: 'venue',
        message: t('会場 {name} は利用不可', { name: venue.name }),
      })
    }
  }

  if (teamResultA && checkSided(teamResultA, 'gov')) {
    warnings.push({
      category: 'team',
      message: t('{name} が片側に偏っています', { name: teamNameById(govId) }),
    })
  }
  if (teamResultB && checkSided(teamResultB, 'opp')) {
    warnings.push({
      category: 'team',
      message: t('{name} が片側に偏っています', { name: teamNameById(oppId) }),
    })
  }

  if (teamA && teamB) {
    if (hasIntersection(teamInstitutions(teamA), teamInstitutions(teamB))) {
      warnings.push({
        category: 'team',
        message: t('{a} と {b} が同一機関です', {
          a: teamNameById(govId),
          b: teamNameById(oppId),
        }),
      })
    }
    if (teamResultA && teamResultB && teamResultA.win !== teamResultB.win) {
      warnings.push({
        category: 'team',
        message: t('{a} と {b} の勝利数が異なります', {
          a: teamNameById(govId),
          b: teamNameById(oppId),
        }),
      })
    }
    if (
      teamResultA?.past_opponents?.includes(oppId) ||
      teamResultB?.past_opponents?.includes(govId)
    ) {
      warnings.push({
        category: 'team',
        message: t('{a} と {b} は過去に対戦済みです', {
          a: teamNameById(govId),
          b: teamNameById(oppId),
        }),
      })
    }
  }

  adjudicatorIds.forEach((adjId) => {
    const adj = adjudicators.adjudicators.find((a) => a._id === adjId)
    if (adj && !detailAvailable(adj.details, round.value)) {
      warnings.push({
        category: 'adjudicator',
        message: t('{name} は利用不可', { name: adjudicatorNameById(adjId) }),
      })
    }
  })

  for (const teamId of teamIds) {
    const team = teams.teams.find((t) => t._id === teamId)
    const teamInst = team ? teamInstitutions(team) : []
    for (const adjId of adjudicatorIds) {
      const adj = adjudicators.adjudicators.find((a) => a._id === adjId)
      if (!adj) continue
      const adjInst = adjudicatorInstitutions(adj)
      const adjResult = compiledAdjMap.value.get(String(adjId))
      if (hasIntersection(teamInst, adjInst)) {
        warnings.push({
          category: 'adjudicator',
          message: t('{adj} と {team} に機関衝突', {
            adj: adjudicatorNameById(adjId),
            team: teamNameById(teamId),
          }),
        })
      }
      if (adjudicatorConflicts(adj).includes(String(teamId))) {
        warnings.push({
          category: 'adjudicator',
          message: t('{adj} と {team} に個別衝突', {
            adj: adjudicatorNameById(adjId),
            team: teamNameById(teamId),
          }),
        })
      }
      if (adjResult?.judged_teams?.includes(teamId)) {
        warnings.push({
          category: 'adjudicator',
          message: t('{adj} は {team} を既に担当済み', {
            adj: adjudicatorNameById(adjId),
            team: teamNameById(teamId),
          }),
        })
      }
    }
  }

  for (let i = 0; i < adjudicatorIds.length; i += 1) {
    for (let j = i + 1; j < adjudicatorIds.length; j += 1) {
      const adjA = adjudicators.adjudicators.find((a) => a._id === adjudicatorIds[i])
      const adjB = adjudicators.adjudicators.find((a) => a._id === adjudicatorIds[j])
      if (!adjA || !adjB) continue
      if (hasIntersection(adjudicatorInstitutions(adjA), adjudicatorInstitutions(adjB))) {
        warnings.push({
          category: 'adjudicator',
          message: t('{a} と {b} が同一機関です', {
            a: adjudicatorNameById(adjudicatorIds[i]),
            b: adjudicatorNameById(adjudicatorIds[j]),
          }),
        })
      }
    }
  }

  if (adjudicatorIds.length === 0) {
    warnings.push({ category: 'adjudicator', message: t('割り当てられたジャッジがいません') })
  } else if (adjudicatorIds.length % 2 === 0) {
    warnings.push({ category: 'adjudicator', message: t('ジャッジ人数が偶数です') })
  }

  return warnings
}

function warningSummary(warnings: Warning[]) {
  if (warnings.length === 0) return ''
  const hasAdjudicator = warnings.some((warning) => warning.category === 'adjudicator')
  const hasTeam = warnings.some(
    (warning) => warning.category === 'team' || warning.category === 'venue'
  )
  if (hasAdjudicator && hasTeam) {
    return `${t('チーム')}/${t('ジャッジ')} ${warnings.length}`
  }
  if (hasAdjudicator) {
    return `${t('ジャッジ')} ${warnings.length}`
  }
  if (warnings.every((warning) => warning.category === 'venue')) {
    return `${t('会場')} ${warnings.length}`
  }
  return `${t('チーム')} ${warnings.length}`
}

function warningSummaryClass(warnings: Warning[]) {
  if (warnings.length === 0) return 'warning-summary--team'
  const hasAdjudicator = warnings.some((warning) => warning.category === 'adjudicator')
  const hasTeam = warnings.some(
    (warning) => warning.category === 'team' || warning.category === 'venue'
  )
  if (hasAdjudicator && hasTeam) return 'warning-summary--mixed'
  if (hasAdjudicator) return 'warning-summary--adjudicator'
  if (warnings.every((warning) => warning.category === 'venue')) return 'warning-summary--venue'
  return 'warning-summary--team'
}

const availableTeams = computed(() =>
  teams.teams.filter((team) => detailAvailable(team.details, round.value))
)

const availableVenues = computed(() =>
  venues.venues.filter((venue) => detailAvailable(venue.details, round.value))
)

const availableAdjudicators = computed(() =>
  adjudicators.adjudicators.filter(
    (adj) => adj.active !== false && detailAvailable(adj.details, round.value)
  )
)

const unassignedTeams = computed(() => {
  const assigned = new Set<string>()
  allocation.value.forEach((row) => {
    if (row.teams.gov) assigned.add(row.teams.gov)
    if (row.teams.opp) assigned.add(row.teams.opp)
  })
  return availableTeams.value.filter((team) => !assigned.has(team._id))
})

const unassignedVenues = computed(() => {
  const assigned = new Set<string>()
  allocation.value.forEach((row) => {
    if (row.venue) assigned.add(row.venue)
  })
  return availableVenues.value.filter((venue) => !assigned.has(venue._id))
})

const roundSubmissions = computed(() => submissionsStore.submissions)
const ballotSubmissions = computed(() =>
  roundSubmissions.value.filter((item) => item.type === 'ballot')
)
const feedbackSubmissions = computed(() =>
  roundSubmissions.value.filter((item) => item.type === 'feedback')
)

const expectedTeamIds = computed(() => {
  const set = new Set<string>()
  allocation.value.forEach((row) => {
    if (row.teams.gov) set.add(row.teams.gov)
    if (row.teams.opp) set.add(row.teams.opp)
  })
  return set
})

const expectedAdjudicatorIds = computed(() => {
  const set = new Set<string>()
  allocation.value.forEach((row) => {
    ;(row.chairs ?? []).forEach((id) => set.add(id))
    ;(row.panels ?? []).forEach((id) => set.add(id))
    ;(row.trainees ?? []).forEach((id) => set.add(id))
  })
  return set
})

const ballotSubmittedIds = computed(() => {
  const set = new Set<string>()
  ballotSubmissions.value.forEach((item) => {
    const id = (item.payload as any)?.submittedEntityId
    if (id) set.add(String(id))
  })
  return set
})

const feedbackSubmittedIds = computed(() => {
  const set = new Set<string>()
  feedbackSubmissions.value.forEach((item) => {
    const id = (item.payload as any)?.submittedEntityId
    if (id) set.add(String(id))
  })
  return set
})

const missingBallotSubmitters = computed(() => {
  const ids = Array.from(expectedAdjudicatorIds.value).filter(
    (id) => !ballotSubmittedIds.value.has(id)
  )
  return adjudicators.adjudicators.filter((adj) => ids.includes(adj._id))
})

const evaluationFromTeamsEnabled = computed(
  () => roundConfig.value?.userDefinedData?.evaluate_from_teams !== false
)

const evaluationFromAdjudicatorsEnabled = computed(
  () => roundConfig.value?.userDefinedData?.evaluate_from_adjudicators !== false
)

const evaluatorInTeam = computed(
  () => roundConfig.value?.userDefinedData?.evaluator_in_team ?? 'team'
)

const expectedSpeakerIds = computed(() => {
  const set = new Set<string>()
  expectedTeamIds.value.forEach((teamId) => {
    const team = teams.teams.find((item) => item._id === teamId)
    teamSpeakerIds(team).forEach((id: string) => set.add(id))
  })
  return set
})

const missingFeedbackTeamLabel = computed(() =>
  evaluatorInTeam.value === 'speaker' ? t('スピーカー') : t('チーム')
)

const missingFeedbackFromTeams = computed(() => {
  if (!evaluationFromTeamsEnabled.value) return []
  if (evaluatorInTeam.value === 'speaker') {
    const ids = Array.from(expectedSpeakerIds.value).filter(
      (id) => !feedbackSubmittedIds.value.has(id)
    )
    return ids.map((id) => ({ id, name: speakerNameById(id) })).filter((item) => item.id)
  }
  const ids = Array.from(expectedTeamIds.value).filter((id) => !feedbackSubmittedIds.value.has(id))
  return teams.teams
    .filter((team) => ids.includes(team._id))
    .map((team) => ({
      id: team._id,
      name: team.name,
    }))
})

const missingFeedbackFromAdjudicators = computed(() => {
  if (!evaluationFromAdjudicatorsEnabled.value) return []
  const ids = Array.from(expectedAdjudicatorIds.value).filter(
    (id) => !feedbackSubmittedIds.value.has(id)
  )
  return adjudicators.adjudicators.filter((adj) => ids.includes(adj._id))
})

const unknownBallotCount = computed(
  () => ballotSubmissions.value.filter((item) => !(item.payload as any)?.submittedEntityId).length
)

const unknownFeedbackCount = computed(
  () => feedbackSubmissions.value.filter((item) => !(item.payload as any)?.submittedEntityId).length
)

const unsubmittedEnabled = computed(
  () => expectedAdjudicatorIds.value.size > 0 || expectedTeamIds.value.size > 0
)

function onDragStart(kind: DragKind, id: string) {
  dragPayload.value = { kind, id }
}

function onDragEnd() {
  dragPayload.value = null
}

function removeTeamFromAllocation(id: string) {
  allocation.value.forEach((row) => {
    if (row.teams.gov === id) row.teams.gov = ''
    if (row.teams.opp === id) row.teams.opp = ''
  })
}

function removeAdjudicatorFromAllocation(id: string) {
  allocation.value.forEach((row) => {
    row.chairs = (row.chairs ?? []).filter((item) => item !== id)
    row.panels = (row.panels ?? []).filter((item) => item !== id)
    row.trainees = (row.trainees ?? []).filter((item) => item !== id)
  })
}

function removeVenueFromAllocation(id: string) {
  allocation.value.forEach((row) => {
    if (row.venue === id) row.venue = ''
  })
}

function dropTeam(row: DrawAllocationRow, side: 'gov' | 'opp') {
  const payload = dragPayload.value
  if (!payload || payload.kind !== 'team') return
  removeTeamFromAllocation(payload.id)
  row.teams[side] = payload.id
  const other = side === 'gov' ? 'opp' : 'gov'
  if (row.teams[other] === payload.id) {
    row.teams[other] = ''
  }
  onDragEnd()
}

function dropAdjudicator(row: DrawAllocationRow, role: 'chairs' | 'panels' | 'trainees') {
  const payload = dragPayload.value
  if (!payload || payload.kind !== 'adjudicator') return
  removeAdjudicatorFromAllocation(payload.id)
  if (!row[role].includes(payload.id)) {
    row[role] = [...row[role], payload.id]
  }
  onDragEnd()
}

function dropVenue(row: DrawAllocationRow) {
  const payload = dragPayload.value
  if (!payload || payload.kind !== 'venue') return
  removeVenueFromAllocation(payload.id)
  row.venue = payload.id
  onDragEnd()
}

function dropToWaiting(kind: DragKind) {
  const payload = dragPayload.value
  if (!payload || payload.kind !== kind) return
  if (kind === 'team') removeTeamFromAllocation(payload.id)
  if (kind === 'adjudicator') removeAdjudicatorFromAllocation(payload.id)
  if (kind === 'venue') removeVenueFromAllocation(payload.id)
  onDragEnd()
}

function teamName(id: string) {
  return teams.teams.find((team) => team._id === id)?.name ?? id
}

function adjudicatorName(id: string) {
  return adjudicators.adjudicators.find((adj) => adj._id === id)?.name ?? id
}

function venueName(id: string) {
  return venues.venues.find((venue) => venue._id === id)?.name ?? id
}

function venuePriority(id?: string) {
  if (!id) return Number.MAX_SAFE_INTEGER
  const venue = venues.venues.find((item) => item._id === id)
  const detail = venue ? detailForRound(venue.details, round.value) : null
  const priority = Number((detail as any)?.priority)
  return Number.isFinite(priority) ? priority : Number.MAX_SAFE_INTEGER
}

const unassignedAdjudicators = computed(() => {
  const assigned = new Set<string>()
  allocation.value.forEach((row) => {
    row.chairs?.forEach((id) => assigned.add(id))
    row.panels?.forEach((id) => assigned.add(id))
    row.trainees?.forEach((id) => assigned.add(id))
  })
  return availableAdjudicators.value.filter((adj) => !assigned.has(adj._id))
})

function openDeleteDrawModal() {
  if (!currentDraw.value?._id || isLoading.value) return
  showDeleteDrawModal.value = true
}

function closeDeleteDrawModal() {
  showDeleteDrawModal.value = false
}

async function confirmDeleteCurrentDraw() {
  if (!currentDraw.value?._id) return
  closeDeleteDrawModal()
  const deleted = await draws.deleteDraw(currentDraw.value._id, tournamentId.value)
  if (deleted) {
    syncFromDraw(null)
  }
}

watch(
  [tournamentId, round],
  () => {
    refresh()
  },
  { immediate: true }
)

watch(
  currentDraw,
  (next) => {
    if (next) {
      syncFromDraw(next)
      return
    }
    syncFromDraw(null)
  },
  { immediate: true }
)

watch(
  autoCompiledSnapshotOptions,
  (options) => {
    if (options.length === 0) {
      selectedAutoSnapshotId.value = ''
      return
    }
    const exists = options.some((option) => option.compiledId === selectedAutoSnapshotId.value)
    if (!exists) {
      selectedAutoSnapshotId.value = options[0].compiledId
    }
  },
  { immediate: true }
)

watch(
  compiledSnapshotOptions,
  (options) => {
    if (options.length === 0) {
      selectedDetailSnapshotId.value = ''
      return
    }
    const exists = options.some((option) => option.compiledId === selectedDetailSnapshotId.value)
    if (!exists) {
      selectedDetailSnapshotId.value = options[0].compiledId
    }
  },
  { immediate: true }
)

watch(
  () => autoOptions.value.teamAlgorithm,
  (next) => {
    if (next === 'break') {
      requestScope.value = 'teams'
    }
  }
)
</script>

<style scoped>
.grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.section-header {
  align-items: center;
  gap: var(--space-2);
}

.header-reload {
  margin-left: 0;
}

.action-row {
  width: 100%;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}

.allocation-toolbar {
  justify-content: flex-start;
}

.action-spacer {
  flex: 1;
}

.lock-inline {
  align-items: center;
  gap: 8px;
}

.auto-generate-header {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.auto-label {
  gap: var(--space-2);
}

.auto-generate-layout {
  gap: var(--space-2);
}

.auto-group {
  border: 1px solid var(--color-border);
  gap: var(--space-2);
}

.auto-group-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
}

.option-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

.help-tip {
  position: relative;
  width: 18px;
  height: 18px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  color: var(--color-muted);
  user-select: none;
}

.help-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  min-width: 240px;
  max-width: 360px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: 8px 10px;
  color: var(--color-text);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.4;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.05s ease;
}

.help-tip:hover .help-panel,
.help-tip:focus-within .help-panel {
  opacity: 1;
  visibility: visible;
}

.allocation-board {
  gap: var(--space-3);
}

.board-block {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface);
}

.board-head {
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.detail-snapshot-select {
  min-width: 300px;
  max-width: 100%;
}

.preview-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.allocation-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.allocation-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.allocation-table th,
.allocation-table td {
  border-bottom: 1px solid var(--color-border);
  padding: 6px;
  vertical-align: middle;
  text-align: left;
}

.allocation-table th {
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 600;
}

.match-col {
  width: 56px;
  text-align: center;
  font-weight: 700;
}

.venue-col {
  width: 12%;
  min-width: 140px;
}

.team-col {
  width: 14%;
  min-width: 170px;
}

.adjudicator-col {
  width: 14%;
  min-width: 170px;
}

.note-col {
  width: 220px;
  min-width: 220px;
}

.delete-col {
  width: 40px;
  min-width: 40px;
  text-align: right;
  vertical-align: top;
}

.warning-inline {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.warning-summary {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 11px;
  font-weight: 700;
  cursor: default;
}

.warning-summary--team {
  background: #fff7ed;
  color: #9a3412;
  border: 1px solid #fdba74;
}

.warning-summary--adjudicator {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #93c5fd;
}

.warning-summary--venue {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.warning-summary--mixed {
  background: #faf5ff;
  color: #6d28d9;
  border: 1px solid #c4b5fd;
}

.warning-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 15;
  min-width: 260px;
  max-width: 420px;
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  display: none;
  gap: var(--space-2);
  box-shadow: var(--shadow-card);
}

.warning-inline:hover .warning-popover,
.warning-inline:focus-within .warning-popover {
  display: grid;
}

.checklist {
  display: grid;
  gap: var(--space-2);
}

.pill-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.pill {
  background: var(--color-surface-muted);
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
}

.truncate-pill {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drop-zone {
  min-height: 34px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: 4px 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  background: var(--color-surface-muted);
}

.drop-zone.list {
  min-height: 52px;
}

.drop-zone.compact {
  min-height: 32px;
}

.drop-zone.list.compact {
  min-height: 44px;
}

.drop-zone.single-line {
  flex-wrap: nowrap;
  overflow: hidden;
}

.drop-zone.multi-line {
  align-content: flex-start;
  max-height: 56px;
  overflow-y: auto;
}

.drop-zone.active {
  border-color: var(--color-primary);
  background: #eff6ff;
}

.draggable {
  cursor: grab;
}

.list {
  margin: 0;
  padding-left: var(--space-4);
}

.list.compact {
  margin: 0;
  padding-left: var(--space-4);
}

.warning-item {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  font-size: 13px;
}

.option-help-text {
  margin: 0;
  line-height: 1.45;
}

.checklist-option {
  gap: 2px;
}

.option-inline-help {
  margin-left: 22px;
  line-height: 1.35;
}

.warning-kind {
  border-radius: 999px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.5;
  white-space: nowrap;
}

.warning-item--team {
  color: #9a3412;
}

.warning-item--team .warning-kind {
  background: #fff7ed;
}

.warning-item--adjudicator {
  color: #1d4ed8;
}

.warning-item--adjudicator .warning-kind {
  background: #eff6ff;
}

.warning-item--venue {
  color: #334155;
}

.warning-item--venue .warning-kind {
  background: #f1f5f9;
}

.waiting-area {
  gap: var(--space-3);
}

.add-row-wrap {
  justify-content: center;
}

.add-row-button {
  border: 1px dashed var(--color-border);
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-text);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font: inherit;
  cursor: pointer;
}

.add-row-button:hover {
  background: #eff6ff;
  border-color: var(--color-primary);
}

.add-row-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.add-row-button .plus {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-primary-contrast);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.row-remove {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #dc2626;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  margin-left: auto;
}

.row-remove:hover {
  background: #fee2e2;
}

.row-remove:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.detail-grid {
  display: grid;
  gap: var(--space-2);
}

.detail-row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: var(--space-3);
  align-items: center;
  font-size: 13px;
}

.waiting-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  z-index: 40;
}

.modal {
  width: min(960px, 100%);
  max-height: calc(100vh - 64px);
  overflow: auto;
}

.auto-modal {
  gap: var(--space-3);
}

.import-info {
  margin-top: -4px;
}

.modal-actions {
  justify-content: flex-end;
  gap: var(--space-2);
}

.floating-detail {
  position: fixed;
  top: 88px;
  right: 16px;
  width: min(380px, calc(100vw - 32px));
  max-height: calc(100vh - 112px);
  overflow: auto;
  z-index: 30;
  box-shadow: var(--shadow-card);
}

.error {
  color: var(--color-danger);
}

@media (max-width: 960px) {
  .floating-detail {
    top: auto;
    bottom: 12px;
    left: 12px;
    right: 12px;
    width: auto;
    max-height: 45vh;
  }

  .action-spacer {
    display: none;
  }
}
</style>
