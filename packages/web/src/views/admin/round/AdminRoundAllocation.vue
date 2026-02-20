<template>
  <section class="stack">
    <div v-if="!isEmbeddedRoute" class="row section-header">
      <div class="stack tight">
        <h4>{{ $t('対戦表設定') }}</h4>
        <span class="muted small">{{ roundHeading }}</span>
      </div>
    </div>
    <p v-if="allocationChanged" class="muted">{{ $t('未保存の変更があります。') }}</p>
    <p v-if="allocationImportInfo" class="muted import-info">{{ allocationImportInfo }}</p>

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
            <div class="row board-title-row">
              <h4>{{ $t('対戦表作成') }}</h4>
              <div class="warning-legend" role="status" aria-live="polite">
                <span class="warning-legend-title">{{ $t('警告凡例') }}</span>
                <span class="warning-legend-item warning-legend-item--critical">
                  {{ warningSeverityIcon('critical') }}
                  {{ $t('重大') }}
                </span>
                <span class="warning-legend-item warning-legend-item--warn">
                  {{ warningSeverityIcon('warn') }}
                  {{ $t('注意') }}
                </span>
                <span class="warning-legend-item warning-legend-item--info">
                  {{ warningSeverityIcon('info') }}
                  {{ $t('情報') }}
                </span>
              </div>
            </div>
            <CompiledSnapshotSelect
              v-if="detailSnapshotSelectOptions.length > 0"
              v-model="selectedDetailSnapshotId"
              class="detail-snapshot-select"
              :label="$t('参照集計結果')"
              :options="detailSnapshotSelectOptions"
              :placeholder="$t('未選択')"
            />
            <span v-else class="muted small">{{ $t('参照可能な集計結果がありません。') }}</span>
          </div>
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
                    <td
                      class="match-col match-col-draggable"
                      :class="{
                        'row-drag-source': rowDragSourceIndex === index,
                        'row-drag-target': rowDragTargetIndex === index,
                      }"
                      :title="$t('行番号をドラッグして並び替え')"
                      :draggable="!locked"
                      @dragstart="onRowDragStart(index, $event)"
                      @dragover.prevent="onRowDragOver(index, $event)"
                      @dragleave="onRowDragLeave(index)"
                      @drop.prevent="onRowDrop(index, $event)"
                      @dragend="onRowDragEnd"
                    >
                      {{ index + 1 }}
                    </td>
                    <td class="venue-col">
                      <div
                        class="drop-zone compact single-line"
                        :class="{ active: dragKind === 'venue' }"
                        @dragover.prevent
                        @drop="dropVenue(row)"
                      >
                        <span
                          v-if="row.venue"
                          :class="[
                            'pill',
                            'draggable',
                            'truncate-pill',
                            ...entityPillClasses('venue', row.venue),
                          ]"
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
                          :class="[
                            'pill',
                            'draggable',
                            'truncate-pill',
                            ...entityPillClasses('team', row.teams.gov),
                          ]"
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
                          :class="[
                            'pill',
                            'draggable',
                            'truncate-pill',
                            ...entityPillClasses('team', row.teams.opp),
                          ]"
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
                        class="drop-zone list compact multi-line allocation-drop-zone"
                        :class="{ active: dragKind === 'adjudicator' }"
                        @dragover.prevent
                        @drop="dropAdjudicator(row, 'chairs')"
                      >
                        <span
                          v-for="adjId in row.chairs"
                          :key="`chair-${index}-${adjId}`"
                          :class="[
                            'pill',
                            'draggable',
                            'truncate-pill',
                            ...entityPillClasses('adjudicator', adjId),
                          ]"
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
                        class="drop-zone list compact multi-line allocation-drop-zone"
                        :class="{ active: dragKind === 'adjudicator' }"
                        @dragover.prevent
                        @drop="dropAdjudicator(row, 'panels')"
                      >
                        <span
                          v-for="adjId in row.panels"
                          :key="`panel-${index}-${adjId}`"
                          :class="[
                            'pill',
                            'draggable',
                            'truncate-pill',
                            ...entityPillClasses('adjudicator', adjId),
                          ]"
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
                        class="drop-zone list compact multi-line allocation-drop-zone"
                        :class="{ active: dragKind === 'adjudicator' }"
                        @dragover.prevent
                        @drop="dropAdjudicator(row, 'trainees')"
                      >
                        <span
                          v-for="adjId in row.trainees"
                          :key="`trainee-${index}-${adjId}`"
                          :class="[
                            'pill',
                            'draggable',
                            'truncate-pill',
                            ...entityPillClasses('adjudicator', adjId),
                          ]"
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
                      <div
                        v-if="rowWarningState(index).warnings.length > 0"
                        class="warning-inline"
                        @mouseenter="openWarningPopover(index, $event)"
                        @mouseleave="scheduleCloseWarningPopover"
                        @focusin="openWarningPopover(index, $event)"
                        @focusout="scheduleCloseWarningPopover"
                      >
                        <span
                          class="warning-summary"
                          :class="warningSummaryClass(rowWarningState(index).counts)"
                          tabindex="0"
                        >
                          {{ warningSummary(rowWarningState(index).counts) }}
                        </span>
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
              <span class="muted">{{ $t('会場') }} ({{ unassignedVenues.length }})</span>
              <div
                class="drop-zone list compact waiting-drop-zone"
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
                  :class="[
                    'pill',
                    'draggable',
                    'truncate-pill',
                    ...entityPillClasses('venue', venue._id),
                  ]"
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
            <div class="stack">
              <span class="muted">{{ $t('チーム') }} ({{ unassignedTeams.length }})</span>
              <div
                class="drop-zone list compact waiting-drop-zone"
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
                  :class="[
                    'pill',
                    'draggable',
                    'truncate-pill',
                    ...entityPillClasses('team', team._id),
                  ]"
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
                class="drop-zone list compact waiting-drop-zone"
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
                  :class="[
                    'pill',
                    'draggable',
                    'truncate-pill',
                    ...entityPillClasses('adjudicator', adj._id),
                  ]"
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
          </div>
        </section>

        <section class="stack board-block">
          <div class="row preview-head">
            <h4>{{ $t('対戦表プレビュー') }}</h4>
          </div>
          <DrawPreviewTable :rows="previewRows" :gov-label="govLabel" :opp-label="oppLabel" />
        </section>

        <div class="row allocation-toolbar">
          <div class="row action-row">
            <Button
              variant="secondary"
              size="sm"
              @click="openAutoGenerateModal"
              :disabled="isLoading || requestLoading"
            >
              {{ $t('自動生成') }}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              @click="openAllocationImportModal"
              :disabled="isLoading || locked"
            >
              {{ $t('対戦表組み合わせ取込') }}
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

    <Teleport to="body">
      <div
        v-if="activeWarningState"
        class="warning-popover warning-popover--floating"
        :style="warningPopoverStyle"
        tabindex="-1"
        @mouseenter="clearWarningPopoverTimer"
        @mouseleave="scheduleCloseWarningPopover"
        @focusin="clearWarningPopoverTimer"
        @focusout="scheduleCloseWarningPopover"
      >
        <div
          v-for="(warning, warningIndex) in activeWarningState.warnings"
          :key="`${warning.code}-${warningIndex}`"
          tabindex="0"
          class="warning-item"
          :class="`warning-item--${warning.severity}`"
          @mouseenter="setFocusedWarning(warning)"
          @mouseleave="clearFocusedWarning"
          @focusin="setFocusedWarning(warning)"
          @focusout="clearFocusedWarning"
        >
          <span class="warning-severity" :class="`warning-severity--${warning.severity}`">
            {{ warningSeverityIcon(warning.severity) }}
            {{ warningSeverityLabel(warning.severity) }}
          </span>
          <span class="warning-kind">{{ warningLabel(warning.category) }}</span>
          <span>{{ warningMessage(warning) }}</span>
        </div>
      </div>
    </Teleport>

    <ImportTextModal
      :open="showAllocationImportModal"
      v-model:text="allocationImportText"
      :title="$t('対戦表組み合わせ取込')"
      :help-text="$t('CSV/TSVを貼り付けるかファイル選択して、非空セルだけ対戦表へ反映します。')"
      :placeholder="$t('例: match,venue,gov,opp,chairs,panels,trainees')"
      :description="
        $t(
          '空欄セルは現在値を保持します。名前/IDが未登録のチーム・ジャッジ・会場は反映できません（先に大会データ管理で取り込み）。'
        )
      "
      :example="'match,venue,gov,opp,chairs,panels,trainees\n1,Room 1,Team A,Team B,Judge A,Judge B|Judge C,\n2,,,Team D,,Judge D,'"
      :error="allocationImportError"
      :disabled="locked"
      @file-change="handleAllocationImportFile"
      @close="closeAllocationImportModal"
      @submit="applyAllocationImport"
    />

    <div
      v-if="showAutoGenerateModal"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeAutoGenerateModal"
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
          <Button variant="ghost" size="sm" @click="closeAutoGenerateModal">
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
                :placeholder="$t('未選択')"
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
            <div class="stack auto-break-policy" v-else-if="autoOptions.teamAlgorithm === 'break'">
              <BreakPolicyEditor
                v-model:source="autoBreakSource"
                v-model:size="autoBreakSize"
                v-model:cutoff-tie-policy="autoBreakCutoffTiePolicy"
                v-model:seeding="autoBreakSeeding"
                :disabled="requestLoading || isLoading"
              />
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
      <div class="row detail-head">
        <strong>{{ detailTitle }}</strong>
        <Button v-if="!isDragDetail" variant="ghost" size="sm" @click="clearDetail">{{
          $t('閉じる')
        }}</Button>
      </div>
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
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
import BreakPolicyEditor from '@/components/common/BreakPolicyEditor.vue'
import DrawPreviewTable from '@/components/common/DrawPreviewTable.vue'
import { api } from '@/utils/api'
import { getSideShortLabel } from '@/utils/side-labels'
import type { DrawPreviewRow } from '@/types/draw-preview'
import type { BreakCutoffTiePolicy, BreakSeeding, RoundBreakConfig } from '@/types/round'
import {
  formatCompiledSnapshotOptionLabel,
  resolveLatestCompiledIdContainingRound,
} from '@/utils/compiled-snapshot'
import {
  applyDrawAllocationImportEntries,
  parseDrawAllocationImportText,
} from '@/utils/draw-allocation-import'
import {
  buildEntityWarningIndex,
  buildFocusedEntitySet,
  buildRowWarningStates,
  warningEntityKey,
  type AllocationWarning,
  type ConflictGroupCategory,
  type RowWarningState,
  type WarningCategory,
  type WarningCode,
  type WarningSeverity,
  type WarningSeverityCounts,
} from '@/utils/allocation-warnings'

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
const showAllocationImportModal = ref(false)
const showDeleteDrawModal = ref(false)
const compiledHistory = ref<any[]>([])
const selectedAutoSnapshotId = ref('')
const selectedDetailSnapshotId = ref('')
const allocationImportText = ref('')
const allocationImportError = ref<string | null>(null)
const allocationImportInfo = ref<string | null>(null)
const autoBreakSource = ref<'submissions' | 'raw'>('submissions')
const autoBreakSize = ref(8)
const autoBreakCutoffTiePolicy = ref<BreakCutoffTiePolicy>('manual')
const autoBreakSeeding = ref<BreakSeeding>('high_low')

type RoundBreakConfigLike = Partial<RoundBreakConfig> & {
  source?: 'submissions' | 'raw'
}

function readRoundBreakConfig(): RoundBreakConfigLike {
  const userDefined = roundConfig.value?.userDefinedData
  if (!userDefined || typeof userDefined !== 'object' || Array.isArray(userDefined)) return {}
  const breakConfig = (userDefined as Record<string, unknown>).break
  if (!breakConfig || typeof breakConfig !== 'object' || Array.isArray(breakConfig)) return {}
  return breakConfig as RoundBreakConfigLike
}

function normalizeBreakSourceRounds(roundNumber: number, sourceRounds: unknown): number[] {
  if (!Array.isArray(sourceRounds)) return []
  return Array.from(
    new Set(
      sourceRounds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1 && value < roundNumber)
    )
  ).sort((left, right) => left - right)
}

function normalizeBreakParticipants(participants: unknown): RoundBreakConfig['participants'] {
  if (!Array.isArray(participants)) return []
  const seenTeamIds = new Set<string>()
  const seenSeeds = new Set<number>()
  const normalized: RoundBreakConfig['participants'] = []
  for (const raw of participants) {
    const teamId = String((raw as any)?.teamId ?? '').trim()
    const seed = Number((raw as any)?.seed)
    if (teamId.length === 0 || !Number.isInteger(seed) || seed < 1) continue
    if (seenTeamIds.has(teamId) || seenSeeds.has(seed)) continue
    seenTeamIds.add(teamId)
    seenSeeds.add(seed)
    normalized.push({ teamId, seed })
  }
  return normalized.sort((left, right) => left.seed - right.seed)
}

function normalizeBreakSize(value: unknown): number {
  const size = Number(value)
  return Number.isInteger(size) && size >= 1 ? size : 8
}

function hydrateAutoBreakPolicyFromRound() {
  const breakConfig = readRoundBreakConfig()
  autoBreakSource.value = breakConfig.source === 'raw' ? 'raw' : 'submissions'
  autoBreakSize.value = normalizeBreakSize(breakConfig.size)
  autoBreakCutoffTiePolicy.value =
    breakConfig.cutoff_tie_policy === 'include_all' || breakConfig.cutoff_tie_policy === 'strict'
      ? breakConfig.cutoff_tie_policy
      : 'manual'
  autoBreakSeeding.value = breakConfig.seeding === 'high_low' ? breakConfig.seeding : 'high_low'
}

async function syncAutoBreakPolicyToRound() {
  if (autoOptions.value.teamAlgorithm !== 'break' || requestScope.value !== 'teams') {
    return true
  }
  const currentRound = roundConfig.value
  if (!currentRound?._id) {
    requestError.value = t('読み込みに失敗しました。')
    return false
  }
  const currentBreak = readRoundBreakConfig()
  const normalizedSize = normalizeBreakSize(autoBreakSize.value)
  autoBreakSize.value = normalizedSize
  const breakConfig: RoundBreakConfig = {
    enabled: currentBreak.enabled === true,
    source_rounds: normalizeBreakSourceRounds(round.value, currentBreak.source_rounds),
    size: normalizedSize,
    cutoff_tie_policy: autoBreakCutoffTiePolicy.value,
    seeding: autoBreakSeeding.value,
    participants: normalizeBreakParticipants(currentBreak.participants),
  }
  const saved = await roundsStore.saveBreakRound({
    tournamentId: tournamentId.value,
    roundId: currentRound._id,
    breakConfig,
    syncTeamAvailability: false,
  })
  if (!saved) {
    requestError.value = roundsStore.error ?? t('ブレイク設定の保存に失敗しました。')
    return false
  }
  const latestRound =
    roundsStore.rounds.find((item) => item._id === currentRound._id) ?? currentRound
  const latestUserDefined =
    latestRound.userDefinedData &&
    typeof latestRound.userDefinedData === 'object' &&
    !Array.isArray(latestRound.userDefinedData)
      ? (latestRound.userDefinedData as Record<string, unknown>)
      : {}
  const latestBreak =
    latestUserDefined.break &&
    typeof latestUserDefined.break === 'object' &&
    !Array.isArray(latestUserDefined.break)
      ? (latestUserDefined.break as Record<string, unknown>)
      : {}
  if (latestBreak.source !== autoBreakSource.value) {
    const updated = await roundsStore.updateRound({
      tournamentId: tournamentId.value,
      roundId: currentRound._id,
      userDefinedData: {
        ...latestUserDefined,
        break: {
          ...latestBreak,
          source: autoBreakSource.value,
        },
      },
    })
    if (!updated) {
      requestError.value = roundsStore.error ?? t('ブレイク設定の保存に失敗しました。')
      return false
    }
  }
  return true
}

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
    description: t('同じコンフリクトグループどうしの対戦を避ける方向に評価します。'),
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
const defaultSnapshotTargetRound = computed(() => (round.value > 1 ? round.value - 1 : null))
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
    label: formatCompiledSnapshotOptionLabel(option, 'ja-JP'),
  }))
)
const selectedDetailSnapshot = computed<CompiledSnapshotOption | null>(() => {
  if (compiledSnapshotOptions.value.length === 0) return null
  const selectedId = String(selectedDetailSnapshotId.value ?? '').trim()
  if (selectedId.length === 0) return null
  const selected = compiledSnapshotOptions.value.find(
    (option) => option.compiledId === selectedId
  )
  return selected ?? null
})
const selectedDetailPayload = computed<Record<string, any>>(() =>
  selectedDetailSnapshot.value?.payload ?? {}
)
const autoSnapshotSelectOptions = computed(() =>
  autoCompiledSnapshotOptions.value.map((option) => ({
    value: option.compiledId,
    label: formatCompiledSnapshotOptionLabel(option, 'ja-JP'),
  }))
)

function defaultCompiledSnapshotId(options: Array<Pick<CompiledSnapshotOption, 'compiledId' | 'rounds' | 'createdAt'>>) {
  return resolveLatestCompiledIdContainingRound(options, defaultSnapshotTargetRound.value)
}
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

const allocationChanged = computed(() => allocationSnapshot() !== savedSnapshot.value)

function createEmptyAllocationRow(): DrawAllocationRow {
  return {
    venue: '',
    teams: { gov: '', opp: '' },
    chairs: [],
    panels: [],
    trainees: [],
  }
}

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
    const cloned = cloneAllocation(draw.allocation ?? [])
    allocation.value = cloned.length > 0 ? cloned : [createEmptyAllocationRow()]
    drawOpened.value = Boolean(draw.drawOpened)
    allocationOpened.value = Boolean(draw.allocationOpened)
    locked.value = Boolean(draw.locked)
    savedDrawId.value = draw._id ?? null
    generatedUserDefinedData.value =
      draw.userDefinedData && typeof draw.userDefinedData === 'object'
        ? (draw.userDefinedData as Record<string, any>)
        : null
  } else {
    allocation.value = [createEmptyAllocationRow()]
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
  allocation.value.push(createEmptyAllocationRow())
}

function removeRow(index: number) {
  allocation.value.splice(index, 1)
  if (allocation.value.length === 0) {
    allocation.value.push(createEmptyAllocationRow())
  }
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

function openAutoGenerateModal() {
  requestError.value = null
  if (autoOptions.value.teamAlgorithm === 'break') {
    hydrateAutoBreakPolicyFromRound()
  }
  showAutoGenerateModal.value = true
}

function closeAutoGenerateModal() {
  showAutoGenerateModal.value = false
  requestError.value = null
}

function openAllocationImportModal() {
  allocationImportError.value = null
  showAllocationImportModal.value = true
}

function closeAllocationImportModal() {
  showAllocationImportModal.value = false
  allocationImportError.value = null
}

async function handleAllocationImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  allocationImportError.value = null
  allocationImportText.value = await file.text()
  input.value = ''
}

function applyAllocationImport() {
  allocationImportError.value = null
  allocationImportInfo.value = null
  if (locked.value) {
    allocationImportError.value = t('ドローがロックされているため取り込みできません。')
    return
  }

  const parsed = parseDrawAllocationImportText(allocationImportText.value)
  if (parsed.errors.length > 0) {
    allocationImportError.value = parsed.errors.join(' / ')
    return
  }
  if (parsed.entries.length === 0) {
    allocationImportError.value = t('取り込み可能な行がありません。')
    return
  }

  const applied = applyDrawAllocationImportEntries({
    allocation: allocation.value,
    entries: parsed.entries,
    teams: teams.teams.map((team) => ({ _id: String(team._id), name: String(team.name ?? '') })),
    adjudicators: adjudicators.adjudicators.map((adj) => ({
      _id: String(adj._id),
      name: String(adj.name ?? ''),
    })),
    venues: venues.venues.map((venue) => ({
      _id: String(venue._id),
      name: String(venue.name ?? ''),
    })),
  })
  if (applied.errors.length > 0) {
    allocationImportError.value = applied.errors.join(' / ')
    return
  }

  allocation.value = applied.allocation.map((row) => ({
    venue: row.venue ?? '',
    teams: { gov: String(row.teams.gov ?? ''), opp: String(row.teams.opp ?? '') },
    chairs: [...(row.chairs ?? [])],
    panels: [...(row.panels ?? [])],
    trainees: [...(row.trainees ?? [])],
  }))
  allocationImportInfo.value = t('対戦表組み合わせを {count} 試合に取り込みました。', {
    count: applied.appliedRows,
  })
  closeAllocationImportModal()
}

function teamPairKey(row: DrawAllocationRow) {
  const gov = String(row.teams?.gov ?? '')
  const opp = String(row.teams?.opp ?? '')
  if (!gov || !opp) return ''
  return [gov, opp].sort().join('::')
}

function mergeTeamScopeAllocation(generatedRows: DrawAllocationRow[]) {
  const currentRows = cloneAllocation(allocation.value)
  const rowsByPair = new Map<string, DrawAllocationRow[]>()

  currentRows.forEach((row) => {
    const key = teamPairKey(row)
    if (!key) return
    const list = rowsByPair.get(key) ?? []
    list.push(row)
    rowsByPair.set(key, list)
  })

  return generatedRows.map((generatedRow, index) => {
    const nextRow: DrawAllocationRow = {
      venue: generatedRow.venue ?? '',
      teams: {
        gov: String(generatedRow.teams?.gov ?? ''),
        opp: String(generatedRow.teams?.opp ?? ''),
      },
      chairs: [...(generatedRow.chairs ?? [])],
      panels: [...(generatedRow.panels ?? [])],
      trainees: [...(generatedRow.trainees ?? [])],
    }

    let preservedRow: DrawAllocationRow | undefined
    const key = teamPairKey(nextRow)
    if (key) {
      const matchedRows = rowsByPair.get(key) ?? []
      if (matchedRows.length > 0) {
        preservedRow = matchedRows.shift()
      }
    }
    if (!preservedRow) {
      preservedRow = currentRows[index]
    }
    if (!preservedRow) return nextRow

    return {
      venue: preservedRow.venue ?? '',
      teams: nextRow.teams,
      chairs: [...(preservedRow.chairs ?? [])],
      panels: [...(preservedRow.panels ?? [])],
      trainees: [...(preservedRow.trainees ?? [])],
    }
  })
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
    if (autoOptions.value.teamAlgorithm === 'break' && requestScope.value === 'teams') {
      const synced = await syncAutoBreakPolicyToRound()
      if (!synced) return
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
      const generatedRows = cloneAllocation(data.allocation)
      allocation.value =
        requestScope.value === 'teams'
          ? mergeTeamScopeAllocation(generatedRows)
          : generatedRows
      if (Object.prototype.hasOwnProperty.call(data, 'userDefinedData')) {
        generatedUserDefinedData.value =
          data.userDefinedData && typeof data.userDefinedData === 'object'
            ? (data.userDefinedData as Record<string, any>)
            : null
      } else if (requestScope.value === 'all' || requestScope.value === 'teams') {
        generatedUserDefinedData.value = null
      }
      closeAutoGenerateModal()
    }
  } catch (err: any) {
    requestError.value = err?.response?.data?.errors?.[0]?.message ?? t('自動生成に失敗しました')
  } finally {
    requestLoading.value = false
  }
}

function clearAllocation() {
  allocation.value = [createEmptyAllocationRow()]
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

function normalizeInstitutionCategory(value: unknown): ConflictGroupCategory {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'region') return 'region'
  if (normalized === 'league') return 'league'
  return 'institution'
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

function institutionCategoryById(value: string): ConflictGroupCategory {
  const token = String(value ?? '').trim()
  if (!token) return 'institution'
  const match = institutions.institutions.find((inst) => inst._id === token || inst.name === token)
  return normalizeInstitutionCategory(match?.category)
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
const rowDragSourceIndex = ref<number | null>(null)
const rowDragTargetIndex = ref<number | null>(null)

function clearRowDragState() {
  rowDragSourceIndex.value = null
  rowDragTargetIndex.value = null
}

function onRowDragStart(index: number, event: DragEvent) {
  if (locked.value) {
    event.preventDefault()
    return
  }
  rowDragSourceIndex.value = index
  rowDragTargetIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.dropEffect = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onRowDragOver(index: number, event: DragEvent) {
  if (rowDragSourceIndex.value === null) return
  if (index === rowDragSourceIndex.value) return
  rowDragTargetIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function onRowDragLeave(index: number) {
  if (rowDragTargetIndex.value !== index) return
  rowDragTargetIndex.value = rowDragSourceIndex.value
}

function moveAllocationRow(fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return
  if (fromIndex < 0 || toIndex < 0) return
  if (fromIndex >= allocation.value.length || toIndex >= allocation.value.length) return
  const [moved] = allocation.value.splice(fromIndex, 1)
  if (!moved) return
  allocation.value.splice(toIndex, 0, moved)
}

function onRowDrop(targetIndex: number, event: DragEvent) {
  const fromState = rowDragSourceIndex.value
  const fromPayload = Number(event.dataTransfer?.getData('text/plain'))
  const fromIndex = Number.isInteger(fromState) ? Number(fromState) : fromPayload
  if (!Number.isInteger(fromIndex)) {
    clearRowDragState()
    return
  }
  moveAllocationRow(fromIndex, targetIndex)
  clearRowDragState()
}

function onRowDragEnd() {
  clearRowDragState()
}

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
        label: t('コンフリクトグループ'),
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
        label: t('コンフリクトグループ'),
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

const rowWarningStates = computed<RowWarningState[]>(() =>
  buildRowWarningStates({
    allocation: allocation.value,
    isTeamAvailable: (teamId) => {
      const team = teams.teams.find((item) => item._id === teamId)
      if (!team) return undefined
      return detailAvailable(team.details, round.value)
    },
    isAdjudicatorAvailable: (adjudicatorId) => {
      const adj = adjudicators.adjudicators.find((item) => item._id === adjudicatorId)
      if (!adj) return undefined
      return detailAvailable(adj.details, round.value)
    },
    isVenueAvailable: (venueId) => {
      const venue = venues.venues.find((item) => item._id === venueId)
      if (!venue) return undefined
      return detailAvailable(venue.details, round.value)
    },
    teamInstitutions: (teamId) => {
      const team = teams.teams.find((item) => item._id === teamId)
      return team ? teamInstitutions(team) : []
    },
    adjudicatorInstitutions: (adjudicatorId) => {
      const adj = adjudicators.adjudicators.find((item) => item._id === adjudicatorId)
      return adj ? adjudicatorInstitutions(adj) : []
    },
    institutionCategory: (institutionId) => institutionCategoryById(institutionId),
    adjudicatorConflicts: (adjudicatorId) => {
      const adj = adjudicators.adjudicators.find((item) => item._id === adjudicatorId)
      return adj ? adjudicatorConflicts(adj) : []
    },
    teamWin: (teamId) => {
      const result = compiledTeamMap.value.get(String(teamId))
      const win = Number(result?.win)
      return Number.isFinite(win) ? win : undefined
    },
    teamPastOpponents: (teamId) => {
      const result = compiledTeamMap.value.get(String(teamId))
      return Array.isArray(result?.past_opponents)
        ? result.past_opponents.map((id: any) => String(id)).filter(Boolean)
        : []
    },
    teamPastSides: (teamId) => {
      const result = compiledTeamMap.value.get(String(teamId))
      return Array.isArray(result?.past_sides)
        ? result.past_sides.map((side: any) => String(side)).filter(Boolean)
        : []
    },
    adjudicatorJudgedTeams: (adjudicatorId) => {
      const result = compiledAdjMap.value.get(String(adjudicatorId))
      return Array.isArray(result?.judged_teams)
        ? result.judged_teams.map((id: any) => String(id)).filter(Boolean)
        : []
    },
  })
)

const emptySeverityCounts: WarningSeverityCounts = { critical: 0, warn: 0, info: 0 }
const emptyRowWarningState: RowWarningState = {
  rowIndex: -1,
  warnings: [],
  counts: emptySeverityCounts,
}

function rowWarningState(index: number): RowWarningState {
  return rowWarningStates.value[index] ?? emptyRowWarningState
}

function warningLabel(category: WarningCategory) {
  if (category === 'adjudicator') return t('ジャッジ')
  if (category === 'venue') return t('会場')
  return t('チーム')
}

function warningSeverityLabel(severity: WarningSeverity) {
  if (severity === 'critical') return t('重大')
  if (severity === 'warn') return t('注意')
  return t('情報')
}

function warningSeverityIcon(severity: WarningSeverity) {
  if (severity === 'critical') return '!'
  if (severity === 'warn') return '△'
  return 'i'
}

function warningConflictGroupLabel(value: unknown) {
  const category = normalizeInstitutionCategory(value)
  if (category === 'region') return t('地域')
  if (category === 'league') return t('リーグ')
  return t('機関')
}

function warningMessage(warning: AllocationWarning) {
  const warningCode = warning.code as WarningCode
  if (warningCode === 'team_unavailable') {
    return t('{name} は利用不可', {
      name: teamNameById(String(warning.params.teamId ?? '')),
    })
  }
  if (warningCode === 'venue_unavailable') {
    return t('会場 {name} は利用不可', {
      name: venueName(String(warning.params.venueId ?? '')),
    })
  }
  if (warningCode === 'team_side_imbalance') {
    return t('{name} が片側に偏っています', {
      name: teamNameById(String(warning.params.teamId ?? '')),
    })
  }
  if (warningCode === 'team_same_institution') {
    return t('{a} と {b} が同一{group}です', {
      a: teamNameById(String(warning.params.teamAId ?? '')),
      b: teamNameById(String(warning.params.teamBId ?? '')),
      group: warningConflictGroupLabel(warning.params.groupCategory),
    })
  }
  if (warningCode === 'team_different_win') {
    return t('{a} と {b} の勝利数が異なります', {
      a: teamNameById(String(warning.params.teamAId ?? '')),
      b: teamNameById(String(warning.params.teamBId ?? '')),
    })
  }
  if (warningCode === 'team_past_match') {
    return t('{a} と {b} は過去に対戦済みです', {
      a: teamNameById(String(warning.params.teamAId ?? '')),
      b: teamNameById(String(warning.params.teamBId ?? '')),
    })
  }
  if (warningCode === 'team_past_match_same_institution') {
    return t('{a} と {b} は同一{group}の別チームと過去対戦があります', {
      a: teamNameById(String(warning.params.teamAId ?? '')),
      b: teamNameById(String(warning.params.teamBId ?? '')),
      group: warningConflictGroupLabel(warning.params.groupCategory),
    })
  }
  if (warningCode === 'adjudicator_unavailable') {
    return t('{name} は利用不可', {
      name: adjudicatorNameById(String(warning.params.adjudicatorId ?? '')),
    })
  }
  if (warningCode === 'adjudicator_institution_conflict') {
    return t('{adj} と {team} に{group}衝突', {
      adj: adjudicatorNameById(String(warning.params.adjudicatorId ?? '')),
      team: teamNameById(String(warning.params.teamId ?? '')),
      group: warningConflictGroupLabel(warning.params.groupCategory),
    })
  }
  if (warningCode === 'adjudicator_personal_conflict') {
    return t('{adj} と {team} に個別衝突', {
      adj: adjudicatorNameById(String(warning.params.adjudicatorId ?? '')),
      team: teamNameById(String(warning.params.teamId ?? '')),
    })
  }
  if (warningCode === 'adjudicator_already_judged') {
    return t('{adj} は {team} を既に担当済み', {
      adj: adjudicatorNameById(String(warning.params.adjudicatorId ?? '')),
      team: teamNameById(String(warning.params.teamId ?? '')),
    })
  }
  if (warningCode === 'adjudicator_same_institution') {
    return t('{a} と {b} が同一{group}です', {
      a: adjudicatorNameById(String(warning.params.adjudicatorAId ?? '')),
      b: adjudicatorNameById(String(warning.params.adjudicatorBId ?? '')),
      group: warningConflictGroupLabel(warning.params.groupCategory),
    })
  }
  if (warningCode === 'adjudicator_none') return t('割り当てられたジャッジがいません')
  if (warningCode === 'adjudicator_even_count') return t('ジャッジ人数が偶数です')
  return ''
}

function warningSummary(counts: WarningSeverityCounts) {
  return `${t('重大')} ${counts.critical} / ${t('注意')} ${counts.warn} / ${t('情報')} ${counts.info}`
}

function warningSummaryClass(counts: WarningSeverityCounts) {
  if (counts.critical > 0) return 'warning-summary--critical'
  if (counts.warn > 0) return 'warning-summary--warn'
  return 'warning-summary--info'
}

const activeWarningRowIndex = ref<number | null>(null)
const warningPopoverStyle = ref<Record<string, string>>({})
let warningPopoverCloseTimer: number | null = null

const activeWarningState = computed<RowWarningState | null>(() => {
  if (activeWarningRowIndex.value === null) return null
  const state = rowWarningState(activeWarningRowIndex.value)
  return state.warnings.length > 0 ? state : null
})

function clearWarningPopoverTimer() {
  if (warningPopoverCloseTimer === null) return
  window.clearTimeout(warningPopoverCloseTimer)
  warningPopoverCloseTimer = null
}

function closeWarningPopover() {
  clearWarningPopoverTimer()
  activeWarningRowIndex.value = null
  warningPopoverStyle.value = {}
  clearFocusedWarning()
}

function scheduleCloseWarningPopover() {
  clearWarningPopoverTimer()
  warningPopoverCloseTimer = window.setTimeout(() => {
    closeWarningPopover()
  }, 140)
}

function openWarningPopover(index: number, event: Event) {
  const state = rowWarningState(index)
  if (state.warnings.length === 0) {
    closeWarningPopover()
    return
  }

  clearWarningPopoverTimer()
  activeWarningRowIndex.value = index

  const anchor = event.currentTarget
  if (!(anchor instanceof HTMLElement)) return

  const viewportPadding = 10
  const topGap = 8
  const rect = anchor.getBoundingClientRect()
  const popoverWidth = Math.max(280, Math.min(420, window.innerWidth - viewportPadding * 2))
  const maxHeight = Math.max(120, Math.min(320, window.innerHeight - viewportPadding * 2))
  const estimatedHeight = Math.min(maxHeight, 44 + state.warnings.length * 46)

  let left = rect.left
  if (left + popoverWidth > window.innerWidth - viewportPadding) {
    left = window.innerWidth - popoverWidth - viewportPadding
  }
  left = Math.max(viewportPadding, left)

  let top = rect.bottom + topGap
  if (top + estimatedHeight > window.innerHeight - viewportPadding) {
    top = rect.top - estimatedHeight - topGap
  }
  top = Math.max(viewportPadding, Math.min(top, window.innerHeight - estimatedHeight - viewportPadding))

  warningPopoverStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${Math.round(popoverWidth)}px`,
    maxHeight: `${Math.round(maxHeight)}px`,
  }
}

const entityWarningIndex = computed(() => buildEntityWarningIndex(rowWarningStates.value))
const focusedEntityKeys = ref<Set<string>>(new Set())

function setFocusedWarning(warning: AllocationWarning | null) {
  focusedEntityKeys.value = buildFocusedEntitySet(warning)
}

function clearFocusedWarning() {
  focusedEntityKeys.value = new Set()
}

onBeforeUnmount(() => {
  clearWarningPopoverTimer()
})

function warningEntityKeyByType(kind: 'team' | 'adjudicator' | 'venue', id: string) {
  if (kind === 'adjudicator') return warningEntityKey('adj', id)
  if (kind === 'venue') return warningEntityKey('venue', id)
  return warningEntityKey('team', id)
}

function entityPillClasses(kind: 'team' | 'adjudicator' | 'venue', id?: string) {
  const normalized = String(id ?? '').trim()
  if (!normalized) return []
  const key = warningEntityKeyByType(kind, normalized)
  const classes: string[] = ['pill-entity']
  const warningMeta = entityWarningIndex.value.get(key)
  if (warningMeta) {
    classes.push(`pill-severity--${warningMeta.maxSeverity}`)
  }
  if (focusedEntityKeys.value.has(key)) {
    classes.push('pill-focused')
  }
  return classes
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

watch(defaultSnapshotTargetRound, () => {
  if (compiledSnapshotOptions.value.length > 0) {
    selectedDetailSnapshotId.value = defaultCompiledSnapshotId(compiledSnapshotOptions.value)
  }
  if (autoCompiledSnapshotOptions.value.length > 0) {
    selectedAutoSnapshotId.value = defaultCompiledSnapshotId(autoCompiledSnapshotOptions.value)
  }
})

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
    const selected = String(selectedAutoSnapshotId.value ?? '').trim()
    if (!selected) {
      selectedAutoSnapshotId.value = defaultCompiledSnapshotId(options)
      return
    }
    const exists = options.some((option) => option.compiledId === selected)
    if (!exists) {
      selectedAutoSnapshotId.value = defaultCompiledSnapshotId(options)
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
    const selected = String(selectedDetailSnapshotId.value ?? '').trim()
    if (!selected) {
      selectedDetailSnapshotId.value = defaultCompiledSnapshotId(options)
      return
    }
    const exists = options.some((option) => option.compiledId === selected)
    if (!exists) {
      selectedDetailSnapshotId.value = defaultCompiledSnapshotId(options)
    }
  },
  { immediate: true }
)

watch(
  () => autoOptions.value.teamAlgorithm,
  (next) => {
    if (next === 'break') {
      requestScope.value = 'teams'
      hydrateAutoBreakPolicyFromRound()
    }
  }
)

watch(showAutoGenerateModal, (isOpen) => {
  if (isOpen && autoOptions.value.teamAlgorithm === 'break') {
    hydrateAutoBreakPolicyFromRound()
  }
})
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

.board-title-row {
  align-items: center;
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
  overflow-y: visible;
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

.match-col-draggable {
  cursor: grab;
  user-select: none;
}

.match-col-draggable:active {
  cursor: grabbing;
}

.match-col-draggable.row-drag-source {
  background: #eff6ff;
}

.match-col-draggable.row-drag-target {
  outline: 2px dashed #93c5fd;
  outline-offset: -2px;
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
  display: inline-flex;
  align-items: center;
  min-height: 24px;
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

.warning-summary--critical {
  background: #fff1f2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

.warning-summary--warn {
  background: #fff7ed;
  color: #9a3412;
  border: 1px solid #fdba74;
}

.warning-summary--info {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #93c5fd;
}

.warning-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.warning-legend-title {
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 700;
}

.warning-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
}

.warning-legend-item--critical {
  color: #991b1b;
  background: #fff1f2;
  border-color: #fca5a5;
}

.warning-legend-item--warn {
  color: #9a3412;
  background: #fff7ed;
  border-color: #fdba74;
}

.warning-legend-item--info {
  color: #1d4ed8;
  background: #eff6ff;
  border-color: #93c5fd;
}

.warning-popover {
  min-width: 260px;
  max-width: min(420px, calc(100vw - 80px));
  max-height: min(40vh, 280px);
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  display: grid;
  gap: var(--space-2);
  box-shadow: var(--shadow-card);
  overflow-y: auto;
}

.warning-popover--floating {
  position: fixed;
  z-index: 60;
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
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid #94a3b8;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  color: #0f172a;
  box-shadow: 0 1px 1px rgba(15, 23, 42, 0.06);
}

.pill-entity {
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
}

.pill-severity--critical {
  border-color: #fca5a5;
}

.pill-severity--warn {
  border-color: #fdba74;
}

.pill-severity--info {
  border-color: #93c5fd;
}

.pill-focused {
  box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.15);
  border-width: 2px;
}

.pill-focused.pill-severity--critical {
  background: #fff1f2;
}

.pill-focused.pill-severity--warn {
  background: #fff7ed;
}

.pill-focused.pill-severity--info {
  background: #eff6ff;
}

.truncate-pill {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drop-zone {
  min-height: 34px;
  border: 1px dashed #94a3b8;
  border-radius: var(--radius-md);
  padding: 4px 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  background: #f1f5f9;
  position: relative;
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

.drop-zone.allocation-drop-zone {
  max-height: none;
  overflow: visible;
}

.drop-zone.active {
  border-color: #1d4ed8;
  background:
    repeating-linear-gradient(
      -45deg,
      rgba(59, 130, 246, 0.14) 0 8px,
      rgba(59, 130, 246, 0.24) 8px 16px
    ),
    #e0ecff;
  box-shadow: inset 0 0 0 1px rgba(29, 78, 216, 0.35);
}

.draggable {
  cursor: grab;
}

.draggable:hover {
  border-color: #64748b;
  background: #ffffff;
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
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  column-gap: var(--space-2);
  row-gap: 2px;
  align-items: flex-start;
  font-size: 13px;
  border-radius: var(--radius-sm);
  padding: 4px 6px;
}

.warning-item:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 1px;
}

.warning-item > :last-child {
  min-width: 0;
  line-height: 1.4;
  overflow-wrap: anywhere;
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
  background: #f8fafc;
  color: #334155;
}

.warning-severity {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.warning-severity--critical {
  color: #991b1b;
  background: #fff1f2;
}

.warning-severity--warn {
  color: #9a3412;
  background: #fff7ed;
}

.warning-severity--info {
  color: #1d4ed8;
  background: #eff6ff;
}

.warning-item--critical {
  color: #7f1d1d;
}

.warning-item--warn {
  color: #7c2d12;
}

.warning-item--info {
  color: #1e3a8a;
}

.waiting-area {
  gap: var(--space-3);
}

.drop-zone.waiting-drop-zone {
  align-content: flex-start;
  max-height: none !important;
  overflow: visible !important;
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

.detail-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
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
