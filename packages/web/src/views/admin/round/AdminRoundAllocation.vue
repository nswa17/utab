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

    <section
      :class="[
        'stack',
        'allocation-board',
        { card: !isEmbeddedRoute, 'allocation-board--break': isBreakRound },
      ]"
    >
      <LoadingState v-if="sectionLoading" />
      <template v-else>
        <section
          v-if="priorRounds.length > 0"
          class="stack board-block reference-round-confirm-block"
        >
          <div class="row board-head reference-round-confirm-head">
            <div class="stack tight">
              <h4>{{ $t('参照ラウンド選択') }}</h4>
            </div>
          </div>
          <p class="muted small reference-round-intro">
            {{
              $t('集計に使う参照ラウンドを選択し、「確定」で参照集計を保存します。')
            }}
          </p>
          <div class="reference-round-checkbox-list reference-round-checkbox-list--inline">
            <label
              v-for="item in priorRounds"
              :key="`common-reference-${item.round}`"
              class="reference-round-checkbox"
            >
              <input
                v-model="commonReferenceRoundSelections"
                type="checkbox"
                :value="String(item.round)"
                :disabled="
                  referenceSelectionConfirmed ||
                  (shouldTrackAdjudicatorReference && useScopedReferenceRoundSelections)
                "
              />
              <span>{{ item.name || $t('ラウンド {round}', { round: item.round }) }}</span>
            </label>
          </div>
          <label
            v-if="shouldTrackAdjudicatorReference"
            class="row reference-round-scope-toggle"
          >
            <input
              v-model="useScopedReferenceRoundSelections"
              type="checkbox"
              :disabled="referenceSelectionConfirmed"
            />
            <span>{{ $t('チーム・ジャッジで参照ラウンドを個別に設定する') }}</span>
          </label>
          <div
            v-if="shouldTrackAdjudicatorReference && useScopedReferenceRoundSelections"
            class="grid reference-round-select-grid"
          >
            <label class="stack reference-round-select-field">
              <span class="option-title">{{ $t('チーム結果参照ラウンド') }}</span>
              <div class="reference-round-checkbox-list reference-round-checkbox-list--inline">
                <label
                  v-for="item in priorRounds"
                  :key="`team-reference-${item.round}`"
                  class="reference-round-checkbox"
                >
                  <input
                    v-model="teamReferenceRoundSelections"
                    type="checkbox"
                    :value="String(item.round)"
                    :disabled="referenceSelectionConfirmed"
                  />
                  <span>{{ item.name || $t('ラウンド {round}', { round: item.round }) }}</span>
                </label>
              </div>
            </label>
            <label class="stack reference-round-select-field">
              <span class="option-title">{{ $t('ジャッジ結果参照ラウンド') }}</span>
              <div class="reference-round-checkbox-list reference-round-checkbox-list--inline">
                <label
                  v-for="item in priorRounds"
                  :key="`adjudicator-reference-${item.round}`"
                  class="reference-round-checkbox"
                >
                  <input
                    v-model="adjudicatorReferenceRoundSelections"
                    type="checkbox"
                    :value="String(item.round)"
                    :disabled="referenceSelectionConfirmed"
                  />
                  <span>{{ item.name || $t('ラウンド {round}', { round: item.round }) }}</span>
                </label>
              </div>
            </label>
          </div>
          <section v-if="referenceSelectionConfirmed" class="stack reference-snapshot-select-block">
            <p class="muted small reference-round-intro">
              {{ $t('対戦表作成で選択中の参照集計結果を利用します。') }}
            </p>
            <div v-if="compiledSnapshotSelectOptions.length > 0" class="grid reference-snapshot-select-grid">
              <CompiledSnapshotSelect
                v-if="!shouldTrackAdjudicatorReference || !useScopedReferenceRoundSelections"
                :model-value="selectedDetailSnapshotId"
                :label="$t('参照集計結果')"
                :options="compiledSnapshotSelectOptions"
                :disabled="isLoading"
                @update:model-value="handleSharedReferenceSnapshotSelection"
              />
              <template v-else>
                <CompiledSnapshotSelect
                  :model-value="selectedTeamSnapshotId"
                  :label="`${$t('チーム')} ${$t('参照集計結果')}`"
                  :options="compiledSnapshotSelectOptions"
                  :disabled="isLoading"
                  @update:model-value="handleTeamReferenceSnapshotSelection"
                />
                <CompiledSnapshotSelect
                  :model-value="selectedAdjudicatorSnapshotId"
                  :label="`${$t('ジャッジ')} ${$t('参照集計結果')}`"
                  :options="compiledSnapshotSelectOptions"
                  :disabled="isLoading"
                  @update:model-value="handleAdjudicatorReferenceSnapshotSelection"
                />
              </template>
            </div>
            <p v-else class="muted small">{{ $t('参照可能な集計結果がありません。') }}</p>
          </section>
          <p v-if="referenceConfirmError" class="error">{{ referenceConfirmError }}</p>
          <div class="row reference-round-confirm-actions">
            <Button
              v-if="!referenceSelectionConfirmed"
              size="sm"
              :loading="referenceConfirming"
              :disabled="isLoading || referenceConfirming"
              @click="confirmReferenceRounds"
            >
              {{ $t('確定') }}
            </Button>
            <Button
              v-else
              variant="secondary"
              size="sm"
              :disabled="isLoading || referenceConfirming"
              @click="reopenReferenceSelection"
            >
              {{ $t('参照ラウンドを変更') }}
            </Button>
          </div>
        </section>

        <template v-if="referenceSelectionConfirmed">
          <section class="stack board-block">
            <div class="row board-head">
              <div class="row board-title-row">
                <h4>{{ isEmbeddedRoute ? $t('配置') : $t('対戦表作成') }}</h4>
                <span v-if="isBreakRound" class="break-round-badge">{{ $t('ブレイク') }}</span>
              </div>
            </div>
          <div v-if="allocation.length === 0" class="muted">{{ $t('まだ行がありません。') }}</div>
          <AllocationTableShell v-else>
            <table class="allocation-table allocation-table--main">
              <thead>
                <tr>
                  <th class="match-col">
                    <SortHeaderButton
                      label="#"
                      compact
                      :indicator="allocationSortIndicator('match')"
                      :aria-label="$t('行番号をドラッグして並び替え')"
                      @click="setAllocationSort('match')"
                    />
                  </th>
                  <th class="venue-col">
                    <SortHeaderButton
                      :label="$t('会場')"
                      compact
                      :indicator="allocationSortIndicator('venue')"
                      @click="setAllocationSort('venue')"
                    />
                  </th>
                  <th class="team-col">
                    <SortHeaderButton
                      :label="govLabel"
                      compact
                      :indicator="allocationSortIndicator('gov')"
                      @click="setAllocationSort('gov')"
                    />
                  </th>
                  <th class="team-col">
                    <SortHeaderButton
                      :label="oppLabel"
                      compact
                      :indicator="allocationSortIndicator('opp')"
                      @click="setAllocationSort('opp')"
                    />
                  </th>
                  <th class="adjudicator-col">
                    <SortHeaderButton
                      :label="$t('チェア')"
                      compact
                      :indicator="allocationSortIndicator('chairs')"
                      @click="setAllocationSort('chairs')"
                    />
                  </th>
                  <th class="adjudicator-col">
                    <SortHeaderButton
                      :label="$t('パネル')"
                      compact
                      :indicator="allocationSortIndicator('panels')"
                      @click="setAllocationSort('panels')"
                    />
                  </th>
                  <th class="adjudicator-col">
                    <SortHeaderButton
                      :label="$t('トレーニー')"
                      compact
                      :indicator="allocationSortIndicator('trainees')"
                      @click="setAllocationSort('trainees')"
                    />
                  </th>
                  <th class="note-col">{{ $t('備考') }}</th>
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
                          :draggable="canDragEntity('venue', row.venue)"
                          @dragstart="onDragStart('venue', row.venue)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('venue', row.venue)"
                        >
                          {{ venueName(row.venue) }}
                        </span>
                        <span v-else class="muted small">{{ $t('会場をドロップ') }}</span>
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
                            'team-pill',
                            ...entityPillClasses('team', row.teams.gov),
                          ]"
                          :title="teamPillTitle(row.teams.gov)"
                          :draggable="canDragEntity('team', row.teams.gov)"
                          @dragstart="onDragStart('team', row.teams.gov)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('team', row.teams.gov)"
                        >
                          <span class="team-pill-name">{{ teamName(row.teams.gov) }}</span>
                          <span
                            v-if="teamWinBadge(row.teams.gov)"
                            :class="['team-win-badge', teamWinBadgeClass(row.teams.gov)]"
                          >
                            {{ teamWinBadge(row.teams.gov) }}
                          </span>
                        </span>
                        <span v-else class="muted small">{{ $t('チームをドロップ') }}</span>
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
                            'team-pill',
                            ...entityPillClasses('team', row.teams.opp),
                          ]"
                          :title="teamPillTitle(row.teams.opp)"
                          :draggable="canDragEntity('team', row.teams.opp)"
                          @dragstart="onDragStart('team', row.teams.opp)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('team', row.teams.opp)"
                        >
                          <span class="team-pill-name">{{ teamName(row.teams.opp) }}</span>
                          <span
                            v-if="teamWinBadge(row.teams.opp)"
                            :class="['team-win-badge', teamWinBadgeClass(row.teams.opp)]"
                          >
                            {{ teamWinBadge(row.teams.opp) }}
                          </span>
                        </span>
                        <span v-else class="muted small">{{ $t('チームをドロップ') }}</span>
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
                            'adjudicator-pill',
                            ...entityPillClasses('adjudicator', adjId),
                          ]"
                          :title="adjudicatorPillTitle(adjId)"
                          :draggable="canDragEntity('adjudicator', adjId)"
                          @dragstart="onDragStart('adjudicator', adjId)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('adjudicator', adjId)"
                        >
                          <span class="adjudicator-pill-name">{{ adjudicatorName(adjId) }}</span>
                          <span
                            v-if="adjudicatorAverageBadge(adjId)"
                            :class="[
                              'adjudicator-average-badge',
                              adjudicatorAverageBadgeClass(adjId),
                            ]"
                          >
                            {{ adjudicatorAverageBadge(adjId) }}
                          </span>
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
                            'adjudicator-pill',
                            ...entityPillClasses('adjudicator', adjId),
                          ]"
                          :title="adjudicatorPillTitle(adjId)"
                          :draggable="canDragEntity('adjudicator', adjId)"
                          @dragstart="onDragStart('adjudicator', adjId)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('adjudicator', adjId)"
                        >
                          <span class="adjudicator-pill-name">{{ adjudicatorName(adjId) }}</span>
                          <span
                            v-if="adjudicatorAverageBadge(adjId)"
                            :class="[
                              'adjudicator-average-badge',
                              adjudicatorAverageBadgeClass(adjId),
                            ]"
                          >
                            {{ adjudicatorAverageBadge(adjId) }}
                          </span>
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
                            'adjudicator-pill',
                            ...entityPillClasses('adjudicator', adjId),
                          ]"
                          :title="adjudicatorPillTitle(adjId)"
                          :draggable="canDragEntity('adjudicator', adjId)"
                          @dragstart="onDragStart('adjudicator', adjId)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('adjudicator', adjId)"
                        >
                          <span class="adjudicator-pill-name">{{ adjudicatorName(adjId) }}</span>
                          <span
                            v-if="adjudicatorAverageBadge(adjId)"
                            :class="[
                              'adjudicator-average-badge',
                              adjudicatorAverageBadgeClass(adjId),
                            ]"
                          >
                            {{ adjudicatorAverageBadge(adjId) }}
                          </span>
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
                        <span class="warning-summary" tabindex="0">
                          <span
                            v-for="item in warningSummaryItems(rowWarningState(index).counts)"
                            :key="item.severity"
                            :class="[
                              'warning-summary-item',
                              `warning-summary-item--${item.severity}`,
                            ]"
                            :title="`${item.label} ${item.count}`"
                          >
                            <span class="warning-summary-icon">{{
                              warningSeverityIcon(item.severity)
                            }}</span>
                            <span class="warning-summary-count">{{ item.count }}</span>
                          </span>
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
          </AllocationTableShell>

          <div class="row add-row-wrap">
            <button type="button" class="add-row-button" :disabled="locked" @click="addRow">
              <span class="plus" aria-hidden="true">+</span>
              <span>{{ $t('行追加') }}</span>
            </button>
          </div>
        </section>

        <section class="stack waiting-area board-block">
          <template v-if="useReferenceMatchupWaitingTeams">
            <h4>{{ $t('前回対戦表') }}</h4>
            <AllocationTableShell class="waiting-matchup-allocation-wrap">
              <table class="allocation-table waiting-matchup-allocation-table">
                <thead>
                  <tr>
                    <th class="venue-col">
                      <SortHeaderButton
                        :label="$t('会場')"
                        compact
                        :indicator="referenceWaitingSortIndicator('venue')"
                        @click="setReferenceWaitingSort('venue')"
                      />
                    </th>
                    <th class="team-col">
                      <SortHeaderButton
                        :label="govLabel"
                        compact
                        :indicator="referenceWaitingSortIndicator('gov')"
                        @click="setReferenceWaitingSort('gov')"
                      />
                    </th>
                    <th class="team-col">
                      <SortHeaderButton
                        :label="oppLabel"
                        compact
                        :indicator="referenceWaitingSortIndicator('opp')"
                        @click="setReferenceWaitingSort('opp')"
                      />
                    </th>
                    <th class="waiting-win-col">
                      <SortHeaderButton
                        :label="$t('Win')"
                        compact
                        :indicator="referenceWaitingSortIndicator('win')"
                        @click="setReferenceWaitingSort('win')"
                      />
                    </th>
                    <th class="adjudicator-col">
                      <SortHeaderButton
                        :label="$t('チェア')"
                        compact
                        :indicator="referenceWaitingSortIndicator('chairs')"
                        @click="setReferenceWaitingSort('chairs')"
                      />
                    </th>
                    <th class="adjudicator-col">
                      <SortHeaderButton
                        :label="$t('パネル')"
                        compact
                        :indicator="referenceWaitingSortIndicator('panels')"
                        @click="setReferenceWaitingSort('panels')"
                      />
                    </th>
                    <th class="adjudicator-col">
                      <SortHeaderButton
                        :label="$t('トレーニー')"
                        compact
                        :indicator="referenceWaitingSortIndicator('trainees')"
                        @click="setReferenceWaitingSort('trainees')"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in sortedReferenceUnassignedTeamRows" :key="row.key">
                    <td class="venue-col">
                      <div class="drop-zone compact single-line waiting-placeholder-zone">
                        <span
                          v-if="row.venueId"
                          :class="[
                            'pill',
                            'draggable',
                            'truncate-pill',
                            ...entityPillClasses('venue', row.venueId),
                          ]"
                          :title="venueName(row.venueId)"
                          :draggable="canDragEntity('venue', row.venueId)"
                          @dragstart="onDragStart('venue', row.venueId)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('venue', row.venueId)"
                        >
                          {{ venueName(row.venueId) }}
                        </span>
                      </div>
                    </td>
                    <td class="team-col">
                      <div class="drop-zone compact single-line waiting-placeholder-zone">
                        <span
                          v-for="teamId in row.govTeamIds"
                          :key="`${row.key}-gov-${teamId}`"
                          :class="[
                            'pill',
                            'draggable',
                            'team-pill',
                            ...entityPillClasses('team', teamId),
                          ]"
                          :title="teamPillTitle(teamId)"
                          :draggable="canDragEntity('team', teamId)"
                          @dragstart="onDragStart('team', teamId)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('team', teamId)"
                        >
                          <span class="team-pill-name">{{ teamName(teamId) }}</span>
                          <span
                            v-if="teamWinBadge(teamId)"
                            :class="['team-win-badge', teamWinBadgeClass(teamId)]"
                          >
                            {{ teamWinBadge(teamId) }}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td class="team-col">
                      <div class="drop-zone compact single-line waiting-placeholder-zone">
                        <span
                          v-for="teamId in row.oppTeamIds"
                          :key="`${row.key}-opp-${teamId}`"
                          :class="[
                            'pill',
                            'draggable',
                            'team-pill',
                            ...entityPillClasses('team', teamId),
                          ]"
                          :title="teamPillTitle(teamId)"
                          :draggable="canDragEntity('team', teamId)"
                          @dragstart="onDragStart('team', teamId)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('team', teamId)"
                        >
                          <span class="team-pill-name">{{ teamName(teamId) }}</span>
                          <span
                            v-if="teamWinBadge(teamId)"
                            :class="['team-win-badge', teamWinBadgeClass(teamId)]"
                          >
                            {{ teamWinBadge(teamId) }}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td class="waiting-win-col">
                      <span class="waiting-win-label">{{ referenceWaitingWinLabel(row) }}</span>
                    </td>
                    <td class="adjudicator-col">
                      <div class="drop-zone list compact multi-line waiting-placeholder-zone">
                        <span
                          v-for="adjId in row.chairIds"
                          :key="`${row.key}-chair-${adjId}`"
                          :class="[
                            'pill',
                            'draggable',
                            'adjudicator-pill',
                            ...entityPillClasses('adjudicator', adjId),
                          ]"
                          :title="adjudicatorPillTitle(adjId)"
                          :draggable="canDragEntity('adjudicator', adjId)"
                          @dragstart="onDragStart('adjudicator', adjId)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('adjudicator', adjId)"
                        >
                          <span class="adjudicator-pill-name">{{ adjudicatorName(adjId) }}</span>
                          <span
                            v-if="adjudicatorAverageBadge(adjId)"
                            :class="[
                              'adjudicator-average-badge',
                              adjudicatorAverageBadgeClass(adjId),
                            ]"
                          >
                            {{ adjudicatorAverageBadge(adjId) }}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td class="adjudicator-col">
                      <div class="drop-zone list compact multi-line waiting-placeholder-zone">
                        <span
                          v-for="adjId in row.panelIds"
                          :key="`${row.key}-panel-${adjId}`"
                          :class="[
                            'pill',
                            'draggable',
                            'adjudicator-pill',
                            ...entityPillClasses('adjudicator', adjId),
                          ]"
                          :title="adjudicatorPillTitle(adjId)"
                          :draggable="canDragEntity('adjudicator', adjId)"
                          @dragstart="onDragStart('adjudicator', adjId)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('adjudicator', adjId)"
                        >
                          <span class="adjudicator-pill-name">{{ adjudicatorName(adjId) }}</span>
                          <span
                            v-if="adjudicatorAverageBadge(adjId)"
                            :class="[
                              'adjudicator-average-badge',
                              adjudicatorAverageBadgeClass(adjId),
                            ]"
                          >
                            {{ adjudicatorAverageBadge(adjId) }}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td class="adjudicator-col">
                      <div class="drop-zone list compact multi-line waiting-placeholder-zone">
                        <span
                          v-for="adjId in row.traineeIds"
                          :key="`${row.key}-trainee-${adjId}`"
                          :class="[
                            'pill',
                            'draggable',
                            'adjudicator-pill',
                            ...entityPillClasses('adjudicator', adjId),
                          ]"
                          :title="adjudicatorPillTitle(adjId)"
                          :draggable="canDragEntity('adjudicator', adjId)"
                          @dragstart="onDragStart('adjudicator', adjId)"
                          @dragend="onDragEnd"
                          @click.stop="selectDetail('adjudicator', adjId)"
                        >
                          <span class="adjudicator-pill-name">{{ adjudicatorName(adjId) }}</span>
                          <span
                            v-if="adjudicatorAverageBadge(adjId)"
                            :class="[
                              'adjudicator-average-badge',
                              adjudicatorAverageBadgeClass(adjId),
                            ]"
                          >
                            {{ adjudicatorAverageBadge(adjId) }}
                          </span>
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </AllocationTableShell>
          </template>
          <h4>{{ $t('未配置リスト') }}</h4>
          <div class="grid waiting-grid">
            <div class="stack">
              <span class="muted">{{ $t('会場') }} ({{ waitingLooseVenues.length }})</span>
              <div
                class="drop-zone list compact waiting-drop-zone"
                :class="{ active: dragKind === 'venue' }"
                @dragover.prevent
                @drop="dropToWaiting('venue')"
              >
                <span v-if="waitingLooseVenues.length === 0" class="muted small">
                  {{ $t('なし') }}
                </span>
                <span
                  v-for="venue in waitingLooseVenues"
                  :key="venue._id"
                  :class="[
                    'pill',
                    'draggable',
                    'truncate-pill',
                    ...entityPillClasses('venue', venue._id),
                  ]"
                  :title="venue.name"
                  :draggable="canDragEntity('venue', venue._id)"
                  @dragstart="onDragStart('venue', venue._id)"
                  @dragend="onDragEnd"
                  @click.stop="selectDetail('venue', venue._id)"
                >
                  {{ venue.name }}
                </span>
              </div>
            </div>
            <div class="stack">
              <span class="muted">{{ $t('チーム') }} ({{ waitingLooseTeams.length }})</span>
              <div
                class="drop-zone list compact waiting-drop-zone"
                :class="{ active: dragKind === 'team' }"
                @dragover.prevent
                @drop="dropToWaiting('team')"
              >
                <span v-if="waitingLooseTeams.length === 0" class="muted small">
                  {{ $t('なし') }}
                </span>
                <span
                  v-for="team in waitingLooseTeams"
                  :key="team._id"
                  :class="[
                    'pill',
                    'draggable',
                    'team-pill',
                    ...entityPillClasses('team', team._id),
                  ]"
                  :title="teamPillTitle(team._id)"
                  :draggable="canDragEntity('team', team._id)"
                  @dragstart="onDragStart('team', team._id)"
                  @dragend="onDragEnd"
                  @click.stop="selectDetail('team', team._id)"
                >
                  <span class="team-pill-name">{{ team.name }}</span>
                  <span
                    v-if="teamWinBadge(team._id)"
                    :class="['team-win-badge', teamWinBadgeClass(team._id)]"
                  >
                    {{ teamWinBadge(team._id) }}
                  </span>
                </span>
              </div>
            </div>
            <div class="stack">
              <span class="muted"
                >{{ $t('ジャッジ') }} ({{ waitingLooseAdjudicators.length }})</span
              >
              <div
                class="drop-zone list compact waiting-drop-zone"
                :class="{ active: dragKind === 'adjudicator' }"
                @dragover.prevent
                @drop="dropToWaiting('adjudicator')"
              >
                <span v-if="waitingLooseAdjudicators.length === 0" class="muted small">
                  {{ $t('なし') }}
                </span>
                <span
                  v-for="adj in waitingLooseAdjudicators"
                  :key="adj._id"
                  :class="[
                    'pill',
                    'draggable',
                    'adjudicator-pill',
                    ...entityPillClasses('adjudicator', adj._id),
                  ]"
                  :title="adjudicatorPillTitle(adj._id)"
                  :draggable="canDragEntity('adjudicator', adj._id)"
                  @dragstart="onDragStart('adjudicator', adj._id)"
                  @dragend="onDragEnd"
                  @click.stop="selectDetail('adjudicator', adj._id)"
                >
                  <span class="adjudicator-pill-name">{{ adj.name }}</span>
                  <span
                    v-if="adjudicatorAverageBadge(adj._id)"
                    :class="['adjudicator-average-badge', adjudicatorAverageBadgeClass(adj._id)]"
                  >
                    {{ adjudicatorAverageBadge(adj._id) }}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <div class="row allocation-toolbar">
          <div class="row action-row">
            <Button
              variant="secondary"
              size="sm"
              @click="openAutoGenerateModal"
              :disabled="isLoading || requestLoading || locked"
            >
              {{ $t('自動生成') }}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              @click="openAllocationImportModal"
              :disabled="isLoading || locked || isBreakRound"
            >
              {{ $t('対戦表組み合わせ取込') }}
            </Button>
            <span v-if="isBreakRound" class="muted small">
              {{ $t('ブレイクラウンドのため取り込みできません。') }}
            </span>
            <Button
              variant="secondary"
              size="sm"
              @click="clearAllocation"
              :disabled="locked || allocation.length === 0"
            >
              {{ $t('クリア') }}
            </Button>
            <Button size="sm" @click="save" :disabled="isLoading || locked || !allocationChanged">{{
              $t('保存')
            }}</Button>
            <Button
              variant="secondary"
              size="sm"
              @click="revertAllocation"
              :disabled="locked || !allocationChanged"
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
            <Button
              variant="danger"
              size="sm"
              @click="openDeleteDrawModal"
              :disabled="locked || !currentDraw"
            >
              {{ $t('削除') }}
            </Button>
          </div>
        </div>

        <section class="stack board-block">
          <div class="row preview-head">
            <h4>{{ $t('対戦表プレビュー') }}</h4>
          </div>
          <DrawPreviewTable
            ref="drawPreviewTableRef"
            :rows="previewRows"
            :gov-label="govLabel"
            :opp-label="oppLabel"
          />
          <div class="stack preview-download-stack">
            <div class="row section-download-row">
              <Button
                variant="secondary"
                class="section-download-button"
                :disabled="previewRows.length === 0"
                @click="downloadDrawPreviewCsv"
              >
                {{ $t('CSVダウンロード') }}
              </Button>
            </div>
          </div>
        </section>
        </template>
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
      :title="$t('対戦表組み合わせ取込')"
      :help-text="$t('CSV/TSVファイルを選択して、非空セルだけ対戦表へ反映します。ヘッダー行は必須です。')"
      :description="
        $t(
          '空欄セルは現在値を保持します。名前/IDが未登録のチーム・ジャッジ・会場は反映できません（先に大会データ準備で取り込み）。'
        )
      "
      :example="allocationImportTemplate"
      :template-content="allocationImportTemplate"
      :template-filename="allocationImportTemplateFilename"
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
            <HelpTip
              :text="
                $t(
                  'チーム・ジャッジ・会場の割り当てを条件に沿って自動生成します。必要に応じて手動で調整してください。'
                )
              "
            />
          </div>
          <Button variant="ghost" size="sm" @click="closeAutoGenerateModal">
            {{ $t('閉じる') }}
          </Button>
        </div>
        <div class="stack auto-generate-layout">
          <section class="stack auto-basic-section">
            <div class="auto-basic-grid">
              <div class="stack auto-target-block">
                <span class="option-title">
                  {{ $t('対象') }}
                  <HelpTip :text="$t('全体/チーム/ジャッジ/会場のどこを生成するか選択します。')" />
                </span>
                <div class="auto-scope-tabs" role="tablist" :aria-label="$t('対象')">
                  <button
                    v-for="option in requestScopeTabOptions"
                    :key="option.value"
                    type="button"
                    class="auto-scope-tab"
                    :class="{ active: requestScope === option.value }"
                    role="tab"
                    :aria-selected="requestScope === option.value"
                    :disabled="option.disabled"
                    @click="selectRequestScope(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
                <p class="muted tiny option-help-text">{{ requestScopeDescription }}</p>
                <p v-if="autoScopeRequiresExistingDraw" class="muted tiny option-help-text">
                  {{
                    $t(
                      '既存のドローがないため、adjudicators/venues 生成には先にチーム割り当てが必要です。'
                    )
                  }}
                </p>
              </div>
            </div>
          </section>

          <section v-if="scopeIncludesTeams" class="card soft stack auto-group">
            <h5 class="auto-group-title">{{ $t('チーム生成詳細') }}</h5>
            <label class="stack">
              <span class="option-title">
                {{ $t('チームアルゴリズム') }}
                <HelpTip
                  :text="
                    $t(
                      '安定マッチングは選好ベース、大会標準/大会拡張は勝ち数ブラケットを使います。'
                    )
                  "
                />
              </span>
              <select v-model="autoOptions.teamAlgorithm">
                <option value="standard">{{ $t('安定マッチング') }}</option>
                <option value="powerpair">{{ $t('大会標準') }}</option>
                <option value="strict">{{ $t('大会拡張') }}</option>
                <option value="break" :disabled="!isBreakRound">
                  {{ isBreakRound ? $t('ブレイク') : $t('ブレイク（ブレイクラウンドのみ）') }}
                </option>
              </select>
              <p class="muted tiny option-help-text">{{ teamAlgorithmDescription }}</p>
              <p v-if="!isBreakRound" class="muted tiny option-help-text">
                {{ $t('このラウンドはブレイク設定ではないため、ブレイクは選択できません。') }}
              </p>
            </label>
            <div
              class="stack auto-algorithm-editor"
              v-if="autoOptions.teamAlgorithm === 'standard'"
            >
              <div class="grid auto-detail-grid">
                <label class="stack auto-standard-method-field">
                  <span class="option-title">
                    {{ $t('チーム方式') }}
                    <HelpTip :text="$t('安定マッチングで使用する並び替え方式です。')" />
                  </span>
                  <select v-model="autoOptions.teamMethod">
                    <option
                      v-for="option in teamMethodOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                  <p class="muted tiny option-help-text">{{ teamMethodDescription }}</p>
                </label>
                <div class="stack filter-priority-field">
                  <span class="option-title">
                    {{ $t('チームフィルタ') }}
                    <HelpTip :text="$t('適用する制約を複数選択できます。')" />
                  </span>
                  <p class="muted tiny option-help-text">
                    {{
                      $t(
                        '有効化したフィルタは上ほど優先されます。ドラッグ&ドロップで順番を変更できます。'
                      )
                    }}
                  </p>
                  <PriorityDragSelector
                    v-model="autoOptions.teamFilters"
                    :options="teamFilterOptions"
                    :disabled="locked"
                    layout="single"
                    :active-title="$t('使用する基準')"
                    :inactive-title="$t('不使用')"
                    :inactive-empty-text="$t('不使用の指標はありません。')"
                    :active-action-label="$t('除外')"
                  />
                </div>
              </div>
            </div>
            <div
              class="stack auto-algorithm-editor"
              v-else-if="autoOptions.teamAlgorithm === 'powerpair'"
            >
              <div class="grid auto-detail-grid">
                <label class="stack">
                  <span class="option-title">
                    {{ $t('繰り上げ方式') }}
                    <HelpTip :text="$t('勝ち数ブラケット間の繰り上げ方法を指定します。')" />
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
                  <p class="muted tiny option-help-text">
                    {{ teamPowerpairOddBracketDescription }}
                  </p>
                </label>
                <label class="stack">
                  <span class="option-title">
                    {{ $t('ペアリング方式') }}
                    <HelpTip :text="$t('ブラケット内のペアリング方式です。')" />
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
                    <HelpTip :text="$t('衝突回避方式を指定します。')" />
                  </span>
                  <select v-model="autoOptions.teamPowerpairAvoidConflicts">
                    <option
                      v-for="option in teamConflictOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                  <p class="muted tiny option-help-text">{{ teamPowerpairConflictDescription }}</p>
                </label>
                <label
                  class="stack"
                  v-if="autoOptions.teamPowerpairAvoidConflicts === 'one_up_one_down'"
                >
                  <span class="option-title">
                    {{ $t('機関衝突重み') }}
                    <HelpTip :text="$t('同一属性（機関）衝突の回避強度です。')" />
                  </span>
                  <input
                    v-model.number="autoOptions.teamPowerpairConflictInstitutionWeight"
                    type="number"
                    min="0"
                    step="0.1"
                  />
                </label>
                <label
                  class="stack"
                  v-if="autoOptions.teamPowerpairAvoidConflicts === 'one_up_one_down'"
                >
                  <span class="option-title">
                    {{ $t('過去対戦重み') }}
                    <HelpTip :text="$t('過去対戦の再マッチ回避強度です。')" />
                  </span>
                  <input
                    v-model.number="autoOptions.teamPowerpairConflictPastOpponentWeight"
                    type="number"
                    min="0"
                    step="0.1"
                  />
                </label>
                <label
                  class="stack"
                  v-if="autoOptions.teamPowerpairAvoidConflicts === 'one_up_one_down'"
                >
                  <span class="option-title">
                    {{ $t('最大スワップ試行') }}
                    <HelpTip :text="$t('衝突回避のスワップ試行上限です。')" />
                  </span>
                  <input
                    v-model.number="autoOptions.teamPowerpairMaxSwapIterations"
                    type="number"
                    min="0"
                    step="1"
                  />
                </label>
              </div>
            </div>
            <div
              class="stack auto-algorithm-editor"
              v-else-if="autoOptions.teamAlgorithm === 'strict'"
            >
              <div class="grid auto-detail-grid">
                <label class="stack">
                  <span class="option-title">
                    {{ $t('繰り上げ方式') }}
                    <HelpTip :text="$t('勝ち数ブラケット間の繰り上げ方法を指定します。')" />
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
                    {{ $t('ペアリング方式') }}
                    <HelpTip :text="$t('ブラケット内のペアリング方式です。')" />
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
                    {{ $t('ポジション方式') }}
                    <HelpTip :text="$t('サイド配置の方法を指定します。')" />
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
                <label class="stack">
                  <span class="option-title">
                    {{ $t('衝突回避方式') }}
                    <HelpTip :text="$t('衝突回避方式を指定します。')" />
                  </span>
                  <select v-model="autoOptions.teamStrictAvoidConflicts">
                    <option
                      v-for="option in teamConflictOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                  <p class="muted tiny option-help-text">{{ teamStrictConflictDescription }}</p>
                </label>
                <label
                  class="stack"
                  v-if="autoOptions.teamStrictAvoidConflicts === 'one_up_one_down'"
                >
                  <span class="option-title">
                    {{ $t('機関衝突重み') }}
                    <HelpTip :text="$t('同一属性（機関）衝突の回避強度です。')" />
                  </span>
                  <input
                    v-model.number="autoOptions.teamStrictConflictInstitutionWeight"
                    type="number"
                    min="0"
                    step="0.1"
                  />
                </label>
                <label
                  class="stack"
                  v-if="autoOptions.teamStrictAvoidConflicts === 'one_up_one_down'"
                >
                  <span class="option-title">
                    {{ $t('過去対戦重み') }}
                    <HelpTip :text="$t('過去対戦の再マッチ回避強度です。')" />
                  </span>
                  <input
                    v-model.number="autoOptions.teamStrictConflictPastOpponentWeight"
                    type="number"
                    min="0"
                    step="0.1"
                  />
                </label>
                <label
                  class="stack"
                  v-if="autoOptions.teamStrictAvoidConflicts === 'one_up_one_down'"
                >
                  <span class="option-title">
                    {{ $t('最大スワップ試行') }}
                    <HelpTip :text="$t('衝突回避のスワップ試行上限です。')" />
                  </span>
                  <input
                    v-model.number="autoOptions.teamStrictMaxSwapIterations"
                    type="number"
                    min="0"
                    step="1"
                  />
                </label>
              </div>
            </div>
            <div class="stack auto-break-policy" v-else-if="autoOptions.teamAlgorithm === 'break'">
              <BreakPolicyEditor
                v-model:source="autoBreakSource"
                v-model:size="autoBreakSize"
                v-model:cutoff-tie-policy="autoBreakCutoffTiePolicy"
                v-model:seeding="autoBreakSeeding"
                :show-source="false"
                :disabled="requestLoading || isLoading"
              />
            </div>
          </section>

          <section v-if="scopeIncludesAdjudicators" class="card soft stack auto-group">
            <h5 class="auto-group-title">{{ $t('ジャッジ生成詳細') }}</h5>
            <label class="stack">
              <span class="option-title">
                {{ $t('ジャッジアルゴリズム') }}
                <HelpTip :text="$t('安定マッチングまたは大会標準を選択します。')" />
              </span>
              <select v-model="autoOptions.adjudicatorAlgorithm">
                <option value="standard">{{ $t('安定マッチング') }}</option>
                <option value="traditional">{{ $t('大会標準') }}</option>
              </select>
              <p class="muted tiny option-help-text">{{ adjudicatorAlgorithmDescription }}</p>
            </label>
            <div
              class="stack auto-algorithm-editor"
              v-if="autoOptions.adjudicatorAlgorithm === 'standard'"
            >
              <div class="grid auto-detail-grid">
                <div class="stack filter-priority-field">
                  <span class="option-title">
                    {{ $t('ジャッジフィルタ') }}
                    <HelpTip :text="$t('ジャッジ割り当て時に適用する制約を選択します。')" />
                  </span>
                  <p class="muted tiny option-help-text">
                    {{
                      $t(
                        '有効化したフィルタは上ほど優先されます。ドラッグ&ドロップで順番を変更できます。'
                      )
                    }}
                  </p>
                  <PriorityDragSelector
                    v-model="autoOptions.adjudicatorFilters"
                    :options="adjudicatorFilterOptions"
                    :disabled="locked"
                    layout="single"
                    :active-title="$t('使用する基準')"
                    :inactive-title="$t('不使用')"
                    :inactive-empty-text="$t('不使用の指標はありません。')"
                    :active-action-label="$t('除外')"
                  />
                </div>
              </div>
            </div>
            <div class="stack auto-algorithm-editor" v-else>
              <div class="grid auto-detail-grid">
                <label class="stack auto-wide-field">
                  <span class="option-title">
                    {{ $t('割当方式') }}
                    <HelpTip :text="$t('大会運用の割り当て戦略です。')" />
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
                <label class="row auto-toggle-field auto-wide-field">
                  <input v-model="autoOptions.adjudicatorScatter" type="checkbox" />
                  <span class="option-title">
                    {{ $t('パネル分散') }}
                    <HelpTip :text="$t('同系統のジャッジが偏らないように分散させます。')" />
                  </span>
                </label>
                <p class="muted tiny option-help-text filter-priority-field">
                  {{
                    autoOptions.adjudicatorScatter
                      ? $t(
                          '有効時は同じ層のジャッジが一部屋に固まりすぎないよう、順に散らして配置します。'
                        )
                      : $t('無効時は上位から順に該当部屋へ詰めて配置します。')
                  }}
                </p>
              </div>
            </div>
            <div class="stack auto-algorithm-editor">
              <span class="option-title auto-subsection-title">{{ $t('人数設定') }}</span>
              <div class="grid auto-detail-grid">
                <label class="stack">
                  <span class="option-title">
                    {{ $t('チェア') }}
                    <HelpTip :text="$t('1マッチあたりのチェア人数です。')" />
                  </span>
                  <input v-model.number="autoOptions.chairs" type="number" min="1" />
                </label>
                <label class="stack">
                  <span class="option-title">
                    {{ $t('パネル') }}
                    <HelpTip :text="$t('1マッチあたりのパネル人数です。')" />
                  </span>
                  <input v-model.number="autoOptions.panels" type="number" min="0" />
                </label>
                <label class="stack">
                  <span class="option-title">
                    {{ $t('トレーニー') }}
                    <HelpTip :text="$t('1マッチあたりのトレーニー人数です。')" />
                  </span>
                  <input v-model.number="autoOptions.trainees" type="number" min="0" />
                </label>
              </div>
            </div>
          </section>

          <section v-if="scopeIncludesVenues" class="card soft stack auto-group">
            <h5 class="auto-group-title">{{ $t('会場詳細') }}</h5>
            <div class="stack auto-algorithm-editor">
              <div class="grid auto-detail-grid">
                <label class="stack auto-wide-field">
                  <span class="option-title">
                    {{ $t('会場割当方式') }}
                    <HelpTip :text="$t('会場の割り当て方を選択します。')" />
                  </span>
                  <select v-model="autoOptions.venueAllocationMode">
                    <option
                      v-for="option in venueAllocationModeOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                  <p class="muted tiny option-help-text">{{ venueAllocationDescription }}</p>
                </label>
              </div>
            </div>
          </section>
        </div>
        <p v-if="requestError" class="error auto-request-error">{{ requestError }}</p>
        <div class="row modal-actions auto-modal-actions">
          <Button variant="ghost" size="sm" @click="closeAutoGenerateModal">
            {{ $t('閉じる') }}
          </Button>
          <Button
            size="sm"
            :loading="requestLoading"
            @click="requestAllocation"
            :disabled="isLoading || requestLoading || locked"
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
          <Button variant="ghost" size="sm" @click="closeDeleteDrawModal">{{
            $t('キャンセル')
          }}</Button>
          <Button
            variant="danger"
            size="sm"
            :disabled="isLoading || locked"
            @click="confirmDeleteCurrentDraw"
          >
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
        <div
          v-for="row in detailRows"
          :key="row.label"
          class="detail-row"
          :class="{ 'detail-row--highlightable': (row.highlightEntityKeys?.length ?? 0) > 0 }"
          :tabindex="row.highlightEntityKeys?.length ? 0 : undefined"
          @mouseenter="setFocusedDetailRow(row)"
          @mouseleave="clearFocusedDetailRow"
          @focusin="setFocusedDetailRow(row)"
          @focusout="clearFocusedDetailRow"
        >
          <span class="muted">{{ row.label }}</span>
          <span>{{ row.value }}</span>
        </div>
      </div>
    </aside>

    <NoticeDialog v-model:open="showNoticeDialog" :message="noticeMessage" />
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
import SortHeaderButton from '@/components/common/SortHeaderButton.vue'
import AllocationTableShell from '@/components/common/AllocationTableShell.vue'
import ImportTextModal from '@/components/common/ImportTextModal.vue'
import NoticeDialog from '@/components/common/NoticeDialog.vue'
import HelpTip from '@/components/common/HelpTip.vue'
import PriorityDragSelector from '@/components/common/PriorityDragSelector.vue'
import BreakPolicyEditor from '@/components/common/BreakPolicyEditor.vue'
import DrawPreviewTable from '@/components/common/DrawPreviewTable.vue'
import CompiledSnapshotSelect from '@/components/common/CompiledSnapshotSelect.vue'
import { api } from '@/utils/api'
import { getSideShortLabel } from '@/utils/side-labels'
import type { DrawPreviewRow } from '@/types/draw-preview'
import type { BreakCutoffTiePolicy, BreakSeeding, RoundBreakConfig } from '@/types/round'
import { formatCompiledSnapshotOptionLabel } from '@/utils/compiled-snapshot'
import {
  DEFAULT_COMPILE_OPTIONS,
  compileIncludeLabels,
  normalizeCompileOptions,
  type CompileIncludeLabel,
  type CompileOptions,
} from '@/types/compiled'
import {
  applyDrawAllocationImportEntries,
  parseDrawAllocationImportText,
} from '@/utils/draw-allocation-import'
import { readAllocationTeamIds, resolveBreakStageTeamIds } from '@/utils/break-round'
import {
  normalizeTournamentBreakConfig,
  type TournamentBreakConfig,
} from '@/utils/tournament-break'
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
const { t, locale } = useI18n({ useScope: 'global' })
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
const emit = defineEmits<{
  (event: 'update:referenceCompiledId', value: string): void
  (event: 'update:referenceCompiledRounds', value: number[]): void
}>()

type RequestScope = 'all' | 'teams' | 'adjudicators' | 'venues'
type AllocationSortKey = 'match' | 'venue' | 'gov' | 'opp' | 'chairs' | 'panels' | 'trainees'
type AllocationSortDirection = 'asc' | 'desc'
const DRAW_REFERENCE_COMPILED_ID_KEY = 'reference_compiled_id'
const DRAW_REFERENCE_COMPILED_ROUNDS_KEY = 'reference_compiled_rounds'
const DRAW_REFERENCE_COMPILED_ID_TEAMS_KEY = 'reference_compiled_id_teams'
const DRAW_REFERENCE_COMPILED_ROUNDS_TEAMS_KEY = 'reference_compiled_rounds_teams'
const DRAW_REFERENCE_COMPILED_ID_ADJUDICATORS_KEY = 'reference_compiled_id_adjudicators'
const DRAW_REFERENCE_COMPILED_ROUNDS_ADJUDICATORS_KEY = 'reference_compiled_rounds_adjudicators'

function normalizeRoundValue(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null
}

function normalizeCompiledRoundNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((entry: unknown) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return Number(entry)
          const record = entry as Record<string, unknown>
          return Number(record.r ?? record.round ?? entry)
        })
        .filter((roundNumber) => Number.isInteger(roundNumber) && roundNumber >= 1)
    )
  ).sort((left, right) => left - right)
}

function normalizeDrawUserDefinedData(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return { ...(value as Record<string, any>) }
}

function readDrawReferenceCompiledId(value: unknown): string {
  const payload = normalizeDrawUserDefinedData(value)
  const teamRaw = payload[DRAW_REFERENCE_COMPILED_ID_TEAMS_KEY]
  if (typeof teamRaw === 'string' && teamRaw.trim().length > 0) return teamRaw.trim()
  const raw = payload[DRAW_REFERENCE_COMPILED_ID_KEY]
  return typeof raw === 'string' ? raw.trim() : ''
}

function readDrawReferenceCompiledIdByScope(
  value: unknown,
  scope: 'teams' | 'adjudicators'
): string {
  const payload = normalizeDrawUserDefinedData(value)
  const key =
    scope === 'teams'
      ? DRAW_REFERENCE_COMPILED_ID_TEAMS_KEY
      : DRAW_REFERENCE_COMPILED_ID_ADJUDICATORS_KEY
  const scoped = payload[key]
  return typeof scoped === 'string' ? scoped.trim() : ''
}

function readDrawReferenceCompiledRounds(value: unknown): number[] {
  const payload = normalizeDrawUserDefinedData(value)
  return normalizeCompiledRoundNumbers(payload[DRAW_REFERENCE_COMPILED_ROUNDS_KEY])
}

function readDrawReferenceCompiledRoundsByScope(
  value: unknown,
  scope: 'teams' | 'adjudicators'
): number[] {
  const payload = normalizeDrawUserDefinedData(value)
  const key =
    scope === 'teams'
      ? DRAW_REFERENCE_COMPILED_ROUNDS_TEAMS_KEY
      : DRAW_REFERENCE_COMPILED_ROUNDS_ADJUDICATORS_KEY
  const scoped = normalizeCompiledRoundNumbers(payload[key])
  if (scoped.length > 0) return scoped
  return readDrawReferenceCompiledRounds(value)
}

function withDrawReferenceCompiledRefs(
  userDefinedData: unknown,
  refs: {
    sharedCompiledId: string
    sharedRounds: number[]
    teamCompiledId: string
    teamRounds: number[]
    adjudicatorCompiledId: string
    adjudicatorRounds: number[]
  }
): Record<string, any> | undefined {
  const merged = normalizeDrawUserDefinedData(userDefinedData)
  const normalizeId = (value: string) => value.trim()
  const normalizeRounds = (rounds: number[]) =>
    Array.from(
      new Set(rounds.filter((roundNumber) => Number.isInteger(roundNumber) && roundNumber >= 1))
    ).sort((left, right) => left - right)
  const sharedCompiledId = normalizeId(refs.sharedCompiledId)
  const teamCompiledId = normalizeId(refs.teamCompiledId)
  const adjudicatorCompiledId = normalizeId(refs.adjudicatorCompiledId)
  const sharedRounds = normalizeRounds(refs.sharedRounds)
  const teamRounds = normalizeRounds(refs.teamRounds)
  const adjudicatorRounds = normalizeRounds(refs.adjudicatorRounds)

  if (sharedCompiledId) {
    merged[DRAW_REFERENCE_COMPILED_ID_KEY] = sharedCompiledId
    if (sharedRounds.length > 0) merged[DRAW_REFERENCE_COMPILED_ROUNDS_KEY] = sharedRounds
    else delete merged[DRAW_REFERENCE_COMPILED_ROUNDS_KEY]
  } else {
    delete merged[DRAW_REFERENCE_COMPILED_ID_KEY]
    delete merged[DRAW_REFERENCE_COMPILED_ROUNDS_KEY]
  }

  if (teamCompiledId) {
    merged[DRAW_REFERENCE_COMPILED_ID_TEAMS_KEY] = teamCompiledId
    if (teamRounds.length > 0) merged[DRAW_REFERENCE_COMPILED_ROUNDS_TEAMS_KEY] = teamRounds
    else delete merged[DRAW_REFERENCE_COMPILED_ROUNDS_TEAMS_KEY]
  } else {
    delete merged[DRAW_REFERENCE_COMPILED_ID_TEAMS_KEY]
    delete merged[DRAW_REFERENCE_COMPILED_ROUNDS_TEAMS_KEY]
  }

  if (adjudicatorCompiledId) {
    merged[DRAW_REFERENCE_COMPILED_ID_ADJUDICATORS_KEY] = adjudicatorCompiledId
    if (adjudicatorRounds.length > 0)
      merged[DRAW_REFERENCE_COMPILED_ROUNDS_ADJUDICATORS_KEY] = adjudicatorRounds
    else delete merged[DRAW_REFERENCE_COMPILED_ROUNDS_ADJUDICATORS_KEY]
  } else {
    delete merged[DRAW_REFERENCE_COMPILED_ID_ADJUDICATORS_KEY]
    delete merged[DRAW_REFERENCE_COMPILED_ROUNDS_ADJUDICATORS_KEY]
  }

  const hasAnyReference = [
    DRAW_REFERENCE_COMPILED_ID_KEY,
    DRAW_REFERENCE_COMPILED_ID_TEAMS_KEY,
    DRAW_REFERENCE_COMPILED_ID_ADJUDICATORS_KEY,
  ].some((key) => typeof merged[key] === 'string' && String(merged[key]).trim().length > 0)
  if (!hasAnyReference) {
    delete merged[DRAW_REFERENCE_COMPILED_ROUNDS_KEY]
    delete merged[DRAW_REFERENCE_COMPILED_ROUNDS_TEAMS_KEY]
    delete merged[DRAW_REFERENCE_COMPILED_ROUNDS_ADJUDICATORS_KEY]
  }

  return Object.keys(merged).length > 0 ? merged : undefined
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
  () =>
    props.embedded ||
    route.path.startsWith('/admin-embed/') ||
    String(route.query.embed ?? '') === '1'
)

const allocation = ref<DrawAllocationRow[]>([])
const drawOpened = ref(false)
const allocationOpened = ref(false)
const locked = ref(false)
const sectionLoading = ref(true)
const requestError = ref<string | null>(null)
const requestLoading = ref(false)
const requestScope = ref<RequestScope>('all')
const savedSnapshot = ref('')
const savedDrawId = ref<string | null>(null)
const generatedUserDefinedData = ref<Record<string, any> | null>(null)
const showAutoGenerateModal = ref(false)
const showAllocationImportModal = ref(false)
const showDeleteDrawModal = ref(false)
const compiledHistory = ref<any[]>([])
const selectedDetailSnapshotId = ref('')
const selectedTeamSnapshotId = ref('')
const selectedAdjudicatorSnapshotId = ref('')
const referenceSelectionConfirmed = ref(false)
const referenceConfirming = ref(false)
const referenceConfirmError = ref<string | null>(null)
const commonReferenceRoundSelections = ref<string[]>([])
const teamReferenceRoundSelections = ref<string[]>([])
const adjudicatorReferenceRoundSelections = ref<string[]>([])
const useScopedReferenceRoundSelections = ref(false)
const allocationImportText = ref('')
const allocationImportError = ref<string | null>(null)
const allocationImportInfo = ref<string | null>(null)
const allocationImportTemplate =
  'match,venue,gov,opp,chairs,panels,trainees\n1,Room 1,Team A,Team B,Judge A,Judge B|Judge C,\n2,Room 2,Team C,Team D,Judge D,,Judge E'
const allocationImportTemplateFilename = computed(
  () => `round_${round.value}_draw_import_template.csv`
)
const autoBreakSource = ref<'submissions' | 'raw'>('submissions')
const autoBreakSize = ref(8)
const autoBreakCutoffTiePolicy = ref<BreakCutoffTiePolicy>('include_all')
const autoBreakSeeding = ref<BreakSeeding>('fixed_bracket')
const allocationSortState = ref<{ key: AllocationSortKey; direction: AllocationSortDirection }>({
  key: 'match',
  direction: 'asc',
})
const drawPreviewTableRef = ref<{ getDisplayRows: () => DrawPreviewRow[] } | null>(null)
const showNoticeDialog = ref(false)
const noticeMessage = ref('')
const allocationSortCollator = new Intl.Collator(['ja', 'en'], {
  numeric: true,
  sensitivity: 'base',
})

function openNotice(message: string) {
  noticeMessage.value = message
  showNoticeDialog.value = true
}

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

function readTournamentBreakConfig(): TournamentBreakConfig {
  return normalizeTournamentBreakConfig(tournament.value?.user_defined_data?.break)
}

function normalizeBreakSize(value: unknown): number {
  const size = Number(value)
  return Number.isInteger(size) && size >= 1 ? size : 8
}

function normalizeBreakSeeding(value: unknown, fallback: BreakSeeding): BreakSeeding {
  if (value === 'high_low') return 'reseed_each_round'
  if (value === 'reseed_each_round') return 'reseed_each_round'
  if (value === 'fixed_bracket') return 'fixed_bracket'
  if (value === 'random_within_tie_group') return 'random_within_tie_group'
  if (value === 'random_full') return 'random_full'
  return fallback
}

function hydrateAutoBreakPolicyFromRound() {
  const breakConfig = readTournamentBreakConfig()
  autoBreakSource.value = breakConfig.source
  const configuredSize = normalizeBreakSize(breakConfig.size)
  autoBreakSize.value = suggestedAutoBreakSize.value ?? configuredSize
  autoBreakCutoffTiePolicy.value =
    breakConfig.cutoff_tie_policy === 'manual' ||
    breakConfig.cutoff_tie_policy === 'include_all' ||
    breakConfig.cutoff_tie_policy === 'strict'
      ? breakConfig.cutoff_tie_policy
      : 'include_all'
  autoBreakSeeding.value = normalizeBreakSeeding(breakConfig.seeding, 'fixed_bracket')
}

async function syncAutoBreakPolicyToRound() {
  if (autoOptions.value.teamAlgorithm !== 'break' || requestScope.value !== 'teams') {
    return true
  }
  const currentTournament = tournament.value
  if (!currentTournament?._id) {
    requestError.value = t('読み込みに失敗しました。')
    return false
  }
  const normalizedSize = normalizeBreakSize(autoBreakSize.value)
  autoBreakSize.value = normalizedSize
  const currentUserDefined =
    currentTournament.user_defined_data && typeof currentTournament.user_defined_data === 'object'
      ? ({ ...(currentTournament.user_defined_data as Record<string, any>) } as Record<string, any>)
      : {}
  const currentBreak = readTournamentBreakConfig()
  const breakConfig = {
    ...currentBreak,
    source: autoBreakSource.value,
    size: normalizedSize,
    cutoff_tie_policy: autoBreakCutoffTiePolicy.value,
    seeding: autoBreakSeeding.value,
  }
  const updated = await tournamentStore.updateTournament({
    tournamentId: currentTournament._id,
    user_defined_data: {
      ...currentUserDefined,
      break: breakConfig,
    },
  })
  if (!updated?._id) {
    requestError.value = tournamentStore.error ?? t('ブレイク設定の保存に失敗しました。')
    return false
  }
  return true
}

const autoOptions = ref({
  teamAlgorithm: 'standard',
  teamMethod: 'original',
  teamFilters: ['by_strength', 'by_side', 'by_past_opponent', 'by_conflict_group'],
  teamPowerpairOddBracket: 'pullup_top',
  teamPowerpairPairingMethod: 'fold',
  teamPowerpairAvoidConflicts: 'one_up_one_down',
  teamPowerpairConflictInstitutionWeight: 1,
  teamPowerpairConflictPastOpponentWeight: 1,
  teamPowerpairMaxSwapIterations: 24,
  teamStrictPairingMethod: 'random',
  teamStrictPullupMethod: 'fromtop',
  teamStrictPositionMethod: 'adjusted',
  teamStrictAvoidConflicts: 'one_up_one_down',
  teamStrictConflictInstitutionWeight: 1,
  teamStrictConflictPastOpponentWeight: 1,
  teamStrictMaxSwapIterations: 24,
  adjudicatorAlgorithm: 'standard',
  adjudicatorFilters: [
    'by_bubble',
    'by_strength',
    'by_attendance',
    'by_conflict_team',
    'by_conflict_group',
    'by_past',
  ],
  adjudicatorAssign: 'high_to_high',
  adjudicatorScatter: false,
  chairs: 1,
  panels: 0,
  trainees: 0,
  venueAllocationMode: 'win_priority',
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
    value: 'by_conflict_group',
    label: t('同一機関回避'),
    description: t('同じコンフリクトグループどうしの対戦を避ける方向に評価します。'),
  },
  {
    value: 'by_random',
    label: t('ランダム'),
    description: t('同点時の並びを固定シードでランダム化し、偏りを分散します。'),
  },
  {
    value: 'by_sibling_past_opponent_school',
    label: t('同校別チームの過去対戦校回避'),
    description: t('同校の別チームが過去に当たった学校との対戦を避ける方向に評価します。'),
  },
  {
    value: 'spread_sides_by_school',
    label: t('同校サイド分散'),
    description: t(
      '安定マッチング後にGov/Oppを再調整し、同じ学校の複数チームでサイド偏りが小さくなるようにします。'
    ),
  },
])

const teamMethodOptions = computed(() => [
  {
    value: 'straight',
    label: t('均等合算'),
    description: t('各フィルタを同じ重みで合算し、総合点で候補順を作ります。'),
  },
  {
    value: 'original',
    label: t('優先順適用'),
    description: t('フィルタを上から順に適用して候補順を作る従来方式です。'),
  },
  {
    value: 'weighted',
    label: t('優先度重み合算'),
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

const teamConflictOptions = computed(() => [
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
    label: t('バブル配慮'),
    description: t('勝敗順位の中位に近い部屋を優先し、部屋ごとにジャッジ強度を調整します。'),
  },
  {
    value: 'by_strength',
    label: t('実力マッチ'),
    description: t('ジャッジ評価（結果＋preev）が近い部屋を優先します。'),
  },
  {
    value: 'by_attendance',
    label: t('担当偏り回避'),
    description: t('担当回数の偏りを減らす方向に評価します。'),
  },
  {
    value: 'by_conflict_team',
    label: t('個別衝突回避'),
    description: t('個別衝突に登録されたチームとの同席を避けます。'),
  },
  {
    value: 'by_conflict_group',
    label: t('同一機関回避'),
    description: t('同一機関の衝突が少ない部屋を優先します。'),
  },
  {
    value: 'by_past',
    label: t('過去担当回避'),
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
    label: t('高→実力差大'),
    description: t('評価の高いジャッジを、実力差が大きい部屋から優先して当てます。'),
  },
  {
    value: 'high_to_close',
    label: t('高→実力差小'),
    description: t('評価の高いジャッジを、実力差が小さい部屋から優先して当てます。'),
  },
  {
    value: 'middle_to_high',
    label: t('中→高'),
    description: t('まずパネルを広く配ってから、強い部屋を優先して残りを埋めます。'),
  },
  {
    value: 'middle_to_slight',
    label: t('中→実力差大'),
    description: t('まずパネルを広く配ってから、実力差が大きい部屋を優先して埋めます。'),
  },
  {
    value: 'middle_to_close',
    label: t('中→実力差小'),
    description: t('まずパネルを広く配ってから、実力差が小さい部屋を優先して埋めます。'),
  },
])

const venueAllocationModeOptions = computed(() => [
  {
    value: 'win_priority',
    label: t('優先度順（Win順）'),
    description: t('会場優先度が高い順に、Win順が高いマッチから会場を割り当てます。'),
  },
  {
    value: 'shuffle',
    label: t('ランダム'),
    description: t('会場をランダム順で割り当てます。'),
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
function isRoundConfiguredAsBreak(
  roundLike: { userDefinedData?: unknown } | null | undefined
): boolean {
  const userDefined = roundLike?.userDefinedData
  if (!userDefined || typeof userDefined !== 'object' || Array.isArray(userDefined)) return false
  return (userDefined as Record<string, unknown>).break_round === true
}
const isBreakRound = computed(() => {
  return isRoundConfiguredAsBreak(roundConfig.value)
})
const roundHeading = computed(() => {
  const name = String(roundConfig.value?.name ?? '').trim()
  if (name.length > 0) return t('ラウンド {round}: {name}', { round: round.value, name })
  return t('ラウンド {round}', { round: round.value })
})
const tournament = computed(() =>
  tournamentStore.tournaments.find((item) => item._id === tournamentId.value)
)
const style = computed(() => stylesStore.styles.find((item) => item.id === tournament.value?.style))
const govLabel = computed(() => getSideShortLabel(style.value, 'gov', 'Gov'))
const oppLabel = computed(() => getSideShortLabel(style.value, 'opp', 'Opp'))
const priorRounds = computed(() =>
  roundsStore.rounds
    .filter((item) => item.round < round.value)
    .slice()
    .sort((a, b) => a.round - b.round)
)
const shouldTrackAdjudicatorReference = computed(() => adjudicators.adjudicators.length > 0)
const priorRoundNumberSet = computed(() => new Set(priorRounds.value.map((item) => item.round)))

function normalizeReferenceRoundSelections(values: string[]): number[] {
  const allowed = priorRoundNumberSet.value
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((roundNumber) => Number.isInteger(roundNumber) && allowed.has(roundNumber))
    )
  ).sort((left, right) => left - right)
}

const selectedCommonReferenceRounds = computed(() =>
  normalizeReferenceRoundSelections(commonReferenceRoundSelections.value)
)
const selectedTeamReferenceRounds = computed(() => {
  if (!shouldTrackAdjudicatorReference.value || !useScopedReferenceRoundSelections.value) {
    return selectedCommonReferenceRounds.value
  }
  return normalizeReferenceRoundSelections(teamReferenceRoundSelections.value)
})
const selectedAdjudicatorReferenceRounds = computed(() => {
  if (!shouldTrackAdjudicatorReference.value) return selectedTeamReferenceRounds.value
  if (!useScopedReferenceRoundSelections.value) return selectedCommonReferenceRounds.value
  return normalizeReferenceRoundSelections(adjudicatorReferenceRoundSelections.value)
})

const breakRoundNumbers = computed(() =>
  roundsStore.rounds
    .filter((item) => isRoundConfiguredAsBreak(item))
    .map((item) => item.round)
    .sort((a, b) => a - b)
)
const drawByRound = computed(() => {
  const map = new Map<number, any>()
  draws.draws.forEach((draw) => {
    const roundNumber = Number(draw?.round)
    if (!Number.isInteger(roundNumber) || roundNumber < 1) return
    map.set(roundNumber, draw)
  })
  return map
})
const roundConfigByRound = computed(() => {
  const map = new Map<number, any>()
  roundsStore.rounds.forEach((roundItem) => {
    const roundNumber = Number(roundItem?.round)
    if (!Number.isInteger(roundNumber) || roundNumber < 1) return
    map.set(roundNumber, roundItem)
  })
  return map
})
type CompiledSnapshotOption = {
  compiledId: string
  rounds: number[]
  roundNames: string[]
  createdAt?: string
  snapshotName?: string
  payload: Record<string, any>
}
type CompiledSnapshotSelectOption = {
  value: string
  label: string
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
        snapshotName: String(normalizedPayload?.snapshot_name ?? '').trim() || undefined,
        payload: normalizedPayload,
      }
    })
    .filter((item) => item.compiledId.length > 0)
)
const compiledSnapshotLocaleTag = computed(() => (locale.value === 'ja' ? 'ja-JP' : 'en-US'))
const compiledSnapshotSelectOptions = computed<CompiledSnapshotSelectOption[]>(() =>
  compiledSnapshotOptions.value.map((option) => ({
    value: option.compiledId,
    label: formatCompiledSnapshotOptionLabel(
      {
        rounds: option.rounds,
        createdAt: option.createdAt,
        snapshotName: option.snapshotName,
      },
      compiledSnapshotLocaleTag.value
    ),
  }))
)
function resolveSnapshotById(compiledId: string): CompiledSnapshotOption | null {
  const normalizedId = String(compiledId ?? '').trim()
  if (!normalizedId) return null
  return (
    compiledSnapshotOptions.value.find((option) => option.compiledId === normalizedId) ?? null
  )
}

function snapshotRecencyValue(option: CompiledSnapshotOption): number {
  const parsed = Date.parse(String(option.createdAt ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function resolveLatestSnapshotByReferenceRounds(rounds: number[]): CompiledSnapshotOption | null {
  const normalizedTarget = normalizeCompiledRoundNumbers(rounds)
  if (normalizedTarget.length === 0) return null
  const targetMaxRound = normalizedTarget[normalizedTarget.length - 1]
  let strictLatest: CompiledSnapshotOption | null = null
  let looseLatest: CompiledSnapshotOption | null = null

  for (const option of compiledSnapshotOptions.value) {
    const optionRounds = normalizeCompiledRoundNumbers(option.rounds)
    if (optionRounds.length === 0) continue
    const optionMaxRound = optionRounds[optionRounds.length - 1]
    if (optionMaxRound !== targetMaxRound) continue
    const optionSet = new Set(optionRounds)
    const isStrict = normalizedTarget.every((roundNumber) => optionSet.has(roundNumber))
    if (isStrict) {
      if (!strictLatest || snapshotRecencyValue(option) > snapshotRecencyValue(strictLatest)) {
        strictLatest = option
      }
      continue
    }
    if (!looseLatest || snapshotRecencyValue(option) > snapshotRecencyValue(looseLatest)) {
      looseLatest = option
    }
  }

  return strictLatest ?? looseLatest
}

function resolveLatestSnapshotByPreviousRoundMaxRound(): CompiledSnapshotOption | null {
  const previousRound = round.value - 1
  if (!Number.isInteger(previousRound) || previousRound < 1) return null
  let latest: CompiledSnapshotOption | null = null
  for (const option of compiledSnapshotOptions.value) {
    const optionRounds = normalizeCompiledRoundNumbers(option.rounds)
    if (optionRounds.length === 0) continue
    const optionMaxRound = optionRounds[optionRounds.length - 1]
    if (optionMaxRound !== previousRound) continue
    if (!optionRounds.includes(previousRound)) continue
    if (!latest || snapshotRecencyValue(option) > snapshotRecencyValue(latest)) {
      latest = option
    }
  }
  return latest
}
const selectedDetailSnapshot = computed<CompiledSnapshotOption | null>(() => {
  if (compiledSnapshotOptions.value.length === 0) return null
  return resolveSnapshotById(selectedDetailSnapshotId.value)
})
const selectedTeamSnapshot = computed<CompiledSnapshotOption | null>(() => {
  const scopedId = String(selectedTeamSnapshotId.value ?? '').trim()
  if (!scopedId) return selectedDetailSnapshot.value
  return resolveSnapshotById(scopedId)
})
const selectedAdjudicatorSnapshot = computed<CompiledSnapshotOption | null>(() => {
  const scopedId = String(selectedAdjudicatorSnapshotId.value ?? '').trim()
  if (!scopedId) return selectedDetailSnapshot.value
  return resolveSnapshotById(scopedId)
})
const selectedTeamPayload = computed<Record<string, any>>(
  () => selectedTeamSnapshot.value?.payload ?? selectedDetailSnapshot.value?.payload ?? {}
)
const selectedAdjudicatorPayload = computed<Record<string, any>>(
  () => selectedAdjudicatorSnapshot.value?.payload ?? selectedDetailSnapshot.value?.payload ?? {}
)
const selectedDetailPayload = computed<Record<string, any>>(
  () => selectedDetailSnapshot.value?.payload ?? {}
)
const selectedDetailSnapshotRoundNumbers = computed(() =>
  normalizeCompiledRoundNumbers(selectedDetailSnapshot.value?.rounds ?? [])
)
const selectedTeamSnapshotRoundNumbers = computed(() =>
  normalizeCompiledRoundNumbers(selectedTeamSnapshot.value?.rounds ?? [])
)
const selectedAdjudicatorSnapshotRoundNumbers = computed(() =>
  normalizeCompiledRoundNumbers(selectedAdjudicatorSnapshot.value?.rounds ?? [])
)
const previousBreakRoundInReference = computed<number | null>(() => {
  if (!isBreakRound.value) return null
  const referencedRounds = new Set<number>(selectedDetailSnapshotRoundNumbers.value)
  const candidates = breakRoundNumbers.value.filter(
    (roundNumber) => roundNumber < round.value && referencedRounds.has(roundNumber)
  )
  if (candidates.length === 0) return null
  return candidates[candidates.length - 1]
})
const previousBreakStageParticipantIds = computed(() => {
  const previousBreakRound = previousBreakRoundInReference.value
  if (previousBreakRound === null) return [] as string[]
  const previousDraw = drawByRound.value.get(previousBreakRound)
  const previousRoundConfig = roundConfigByRound.value.get(previousBreakRound)
  return resolveBreakStageTeamIds({
    roundUserDefinedData: previousRoundConfig?.userDefinedData,
    drawUserDefinedData: previousDraw?.userDefinedData,
    allocation: previousDraw?.allocation,
  })
})
const suggestedAutoBreakSize = computed<number | null>(() => {
  const previousParticipantCount = previousBreakStageParticipantIds.value.length
  if (previousParticipantCount <= 0) return null
  return Math.max(1, Math.ceil(previousParticipantCount / 2))
})
const previousBreakRoundTeamIds = computed(() => {
  const previousBreakRound = previousBreakRoundInReference.value
  if (previousBreakRound === null) return new Set<string>()
  const previousDraw = drawByRound.value.get(previousBreakRound)
  const previousRoundConfig = roundConfigByRound.value.get(previousBreakRound)
  const teamIdsFromAllocation = readAllocationTeamIds(previousDraw?.allocation)
  const teamIds =
    teamIdsFromAllocation.length > 0
      ? teamIdsFromAllocation
      : resolveBreakStageTeamIds({
          roundUserDefinedData: previousRoundConfig?.userDefinedData,
          drawUserDefinedData: previousDraw?.userDefinedData,
          allocation: previousDraw?.allocation,
        })
  return new Set(teamIds)
})
const shouldStrikeBreakEliminatedTeams = computed(
  () =>
    isBreakRound.value &&
    previousBreakRoundInReference.value !== null &&
    previousBreakRoundTeamIds.value.size > 0
)
const breakEliminatedTeamIds = computed(() => {
  if (!shouldStrikeBreakEliminatedTeams.value) return new Set<string>()
  const previousRoundTeamIds = previousBreakRoundTeamIds.value
  const eliminated = new Set<string>()
  teams.teams.forEach((team) => {
    const teamId = String(team?._id ?? '').trim()
    if (!teamId) return
    if (!previousRoundTeamIds.has(teamId)) eliminated.add(teamId)
  })
  return eliminated
})

function emitReferenceCompiledSelection() {
  emit('update:referenceCompiledId', String(selectedDetailSnapshotId.value ?? '').trim())
  emit('update:referenceCompiledRounds', selectedDetailSnapshotRoundNumbers.value)
}

function handleSharedReferenceSnapshotSelection(snapshotId: string) {
  const selectedId = firstExistingSnapshotId(snapshotId)
  if (!selectedId) return
  selectedDetailSnapshotId.value = selectedId
  selectedTeamSnapshotId.value = selectedId
  selectedAdjudicatorSnapshotId.value = selectedId
}

function handleTeamReferenceSnapshotSelection(snapshotId: string) {
  const selectedId = firstExistingSnapshotId(snapshotId)
  if (!selectedId) return
  selectedTeamSnapshotId.value = selectedId
  selectedDetailSnapshotId.value = firstExistingSnapshotId(
    selectedTeamSnapshotId.value,
    selectedAdjudicatorSnapshotId.value,
    selectedDetailSnapshotId.value
  )
}

function handleAdjudicatorReferenceSnapshotSelection(snapshotId: string) {
  const selectedId = firstExistingSnapshotId(snapshotId)
  if (!selectedId) return
  selectedAdjudicatorSnapshotId.value = selectedId
  selectedDetailSnapshotId.value = firstExistingSnapshotId(
    selectedTeamSnapshotId.value,
    selectedAdjudicatorSnapshotId.value,
    selectedDetailSnapshotId.value
  )
}

const autoScopeRequiresExistingDraw = computed(() => allocation.value.length === 0)
const requestScopeTabOptions = computed<
  Array<{ value: RequestScope; label: string; disabled: boolean }>
>(() => [
  { value: 'all', label: t('全体'), disabled: false },
  { value: 'teams', label: t('チーム'), disabled: false },
  {
    value: 'adjudicators',
    label: t('ジャッジ'),
    disabled: autoScopeRequiresExistingDraw.value,
  },
  {
    value: 'venues',
    label: t('会場'),
    disabled: autoScopeRequiresExistingDraw.value,
  },
])

function scopeRequiresExistingDraw(scope: RequestScope) {
  return autoScopeRequiresExistingDraw.value && (scope === 'adjudicators' || scope === 'venues')
}

function selectRequestScope(scope: RequestScope) {
  if (scopeRequiresExistingDraw(scope)) return
  requestScope.value = scope
  if (scope === 'teams' && isBreakRound.value && autoOptions.value.teamAlgorithm !== 'break') {
    autoOptions.value.teamAlgorithm = 'break'
  }
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
function resolveSnapshotIdForScope(scope: RequestScope, useOverrides = true): string {
  const sharedId = String(selectedDetailSnapshotId.value ?? '').trim()
  if (!useOverrides) return sharedId
  const teamId = String(selectedTeamSnapshotId.value ?? '').trim()
  const adjudicatorId = String(selectedAdjudicatorSnapshotId.value ?? '').trim()
  if (scope === 'teams') return teamId || sharedId
  if (scope === 'adjudicators') return adjudicatorId || sharedId
  if (scope === 'venues') return teamId || sharedId
  return teamId || adjudicatorId || sharedId
}

const teamAlgorithmDescriptions = computed<Record<string, string>>(() => ({
  standard: t('各チームが候補を順位付けし、安定マッチング（Gale-Shapley）で対戦を作ります。'),
  strict: t(
    '勝ち数の層ごとに組み、繰り上げ・ペアリング・サイド決定の順で調整し、必要なら衝突を減らすスワップを行います。'
  ),
  powerpair: t(
    '勝ち数ブラケット内で組みます。人数が奇数のブラケットは下位ブラケットから繰り上げて調整します。'
  ),
  break: t('ブレイク参加者シードを使い、1位対最下位の順で対戦を作ります。'),
}))
const teamAlgorithmDescription = computed(
  () => teamAlgorithmDescriptions.value[autoOptions.value.teamAlgorithm] ?? ''
)

const adjudicatorAlgorithmDescriptions = computed<Record<string, string>>(() => ({
  standard: t(
    '対戦とジャッジの双方の希望順を作り、安定マッチングでチェア→パネル→トレーニーの順に割り当てます。'
  ),
  traditional: t(
    '部屋とジャッジを並べて上から割り当てる方式です。割当戦略と分散オプションで配り方を変えます。'
  ),
}))
const adjudicatorAlgorithmDescription = computed(
  () => adjudicatorAlgorithmDescriptions.value[autoOptions.value.adjudicatorAlgorithm] ?? ''
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
  selectedDescription(
    teamPowerpairOddBracketOptions.value,
    autoOptions.value.teamPowerpairOddBracket
  )
)
const teamPowerpairPairingDescription = computed(() =>
  selectedDescription(
    teamPowerpairPairingOptions.value,
    autoOptions.value.teamPowerpairPairingMethod
  )
)
const teamPowerpairConflictDescription = computed(() =>
  selectedDescription(teamConflictOptions.value, autoOptions.value.teamPowerpairAvoidConflicts)
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
const teamStrictConflictDescription = computed(() =>
  selectedDescription(teamConflictOptions.value, autoOptions.value.teamStrictAvoidConflicts)
)
const adjudicatorAssignDescription = computed(() =>
  selectedDescription(adjudicatorAssignOptions.value, autoOptions.value.adjudicatorAssign)
)
const venueAllocationDescription = computed(() =>
  selectedDescription(venueAllocationModeOptions.value, autoOptions.value.venueAllocationMode)
)
const venueShuffleEnabled = computed(() => autoOptions.value.venueAllocationMode === 'shuffle')

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

function defaultReferenceRoundSelections(): string[] {
  return priorRounds.value.map((item) => String(item.round))
}

function sanitizeReferenceRoundSelectionStrings(values: string[]): string[] {
  return normalizeReferenceRoundSelections(values).map((roundNumber) => String(roundNumber))
}

function areReferenceRoundSelectionsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function applyReferenceRoundSelectionState(
  teamSelectionsInput: string[],
  adjudicatorSelectionsInput: string[],
  defaultSelectionsInput: string[]
) {
  const defaultSelections = sanitizeReferenceRoundSelectionStrings(defaultSelectionsInput)
  const teamSelections = sanitizeReferenceRoundSelectionStrings(teamSelectionsInput)
  const adjudicatorSelections = sanitizeReferenceRoundSelectionStrings(adjudicatorSelectionsInput)

  if (!shouldTrackAdjudicatorReference.value) {
    const common =
      teamSelections.length > 0
        ? teamSelections
        : adjudicatorSelections.length > 0
          ? adjudicatorSelections
          : defaultSelections
    commonReferenceRoundSelections.value = [...common]
    teamReferenceRoundSelections.value = [...common]
    adjudicatorReferenceRoundSelections.value = [...common]
    useScopedReferenceRoundSelections.value = false
    return
  }

  const useScoped =
    teamSelections.length > 0 &&
    adjudicatorSelections.length > 0 &&
    !areReferenceRoundSelectionsEqual(teamSelections, adjudicatorSelections)
  useScopedReferenceRoundSelections.value = useScoped

  if (useScoped) {
    const common = teamSelections.length > 0 ? teamSelections : defaultSelections
    commonReferenceRoundSelections.value = [...common]
    teamReferenceRoundSelections.value = [...teamSelections]
    adjudicatorReferenceRoundSelections.value = [...adjudicatorSelections]
    return
  }

  const common =
    teamSelections.length > 0
      ? teamSelections
      : adjudicatorSelections.length > 0
        ? adjudicatorSelections
        : defaultSelections
  commonReferenceRoundSelections.value = [...common]
  teamReferenceRoundSelections.value = [...common]
  adjudicatorReferenceRoundSelections.value = [...common]
}

function resolveSavedReferenceRoundSelections(
  value: unknown,
  scope: 'teams' | 'adjudicators'
): string[] {
  const explicitRounds = readDrawReferenceCompiledRoundsByScope(value, scope)
  const explicitSelections = sanitizeReferenceRoundSelectionStrings(
    explicitRounds.map((roundNumber) => String(roundNumber))
  )
  if (explicitSelections.length > 0) return explicitSelections
  const scopedId = readDrawReferenceCompiledIdByScope(value, scope)
  const sharedId = readDrawReferenceCompiledId(value)
  const snapshot = resolveSnapshotById(scopedId || sharedId)
  const inferredRounds = normalizeCompiledRoundNumbers(snapshot?.rounds ?? [])
  if (inferredRounds.length === 0) return []
  return sanitizeReferenceRoundSelectionStrings(
    inferredRounds.map((roundNumber) => String(roundNumber))
  )
}

function firstExistingSnapshotId(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (!normalized) continue
    if (resolveSnapshotById(normalized)) return normalized
  }
  return ''
}

function resolvePreferredSnapshotIdByReferenceRounds(
  rounds: number[],
  ...preferredIds: Array<string | null | undefined>
): string {
  const preferred = firstExistingSnapshotId(...preferredIds)
  if (preferred) return preferred
  const latestByReference = resolveLatestSnapshotByReferenceRounds(rounds)
  if (latestByReference) return latestByReference.compiledId
  const fallback = resolveLatestSnapshotByPreviousRoundMaxRound()
  return fallback?.compiledId ?? ''
}

function areRoundSetsEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function hasConfirmedReferenceSelection(draw: any | null | undefined): boolean {
  if (priorRounds.value.length === 0) return true
  if (draw && Array.isArray(draw.allocation) && draw.allocation.length > 0) return true
  const sharedId = readDrawReferenceCompiledId(draw?.userDefinedData)
  const teamId = readDrawReferenceCompiledIdByScope(draw?.userDefinedData, 'teams') || sharedId
  const adjudicatorId =
    readDrawReferenceCompiledIdByScope(draw?.userDefinedData, 'adjudicators') || sharedId
  if (!teamId) return false
  if (shouldTrackAdjudicatorReference.value && !adjudicatorId) return false
  return true
}

function syncFromDraw(
  draw?: DrawAllocationRow[] | any | null,
  options: { preserveReferenceSelection?: boolean } = {}
) {
  const preserveReferenceSelection = options.preserveReferenceSelection === true
  const defaultSelections = defaultReferenceRoundSelections()
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
    if (!preserveReferenceSelection) {
      selectedDetailSnapshotId.value = readDrawReferenceCompiledId(draw.userDefinedData)
      const savedTeamSnapshotId = readDrawReferenceCompiledIdByScope(draw.userDefinedData, 'teams')
      const savedAdjudicatorSnapshotId = readDrawReferenceCompiledIdByScope(
        draw.userDefinedData,
        'adjudicators'
      )
      selectedTeamSnapshotId.value = savedTeamSnapshotId
      selectedAdjudicatorSnapshotId.value = savedAdjudicatorSnapshotId
      const savedTeamRounds = resolveSavedReferenceRoundSelections(draw.userDefinedData, 'teams')
      const savedAdjudicatorRounds = resolveSavedReferenceRoundSelections(
        draw.userDefinedData,
        'adjudicators'
      )
      const fallbackSnapshot = resolveLatestSnapshotByPreviousRoundMaxRound()
      const fallbackRounds = sanitizeReferenceRoundSelectionStrings(
        normalizeCompiledRoundNumbers(fallbackSnapshot?.rounds ?? []).map((roundNumber) =>
          String(roundNumber)
        )
      )
      applyReferenceRoundSelectionState(
        savedTeamRounds.length > 0
          ? savedTeamRounds
          : fallbackRounds.length > 0
            ? fallbackRounds
            : defaultSelections,
        savedAdjudicatorRounds.length > 0
          ? savedAdjudicatorRounds
          : savedTeamRounds.length > 0
            ? savedTeamRounds
            : fallbackRounds.length > 0
              ? fallbackRounds
            : defaultSelections,
        defaultSelections
      )
      const confirmedReferenceSelection = hasConfirmedReferenceSelection(draw)
      referenceSelectionConfirmed.value = confirmedReferenceSelection
      if (confirmedReferenceSelection) {
        selectedTeamSnapshotId.value = resolvePreferredSnapshotIdByReferenceRounds(
          selectedTeamReferenceRounds.value,
          savedTeamSnapshotId,
          selectedDetailSnapshotId.value,
          selectedTeamSnapshotId.value
        )
        if (shouldTrackAdjudicatorReference.value) {
          selectedAdjudicatorSnapshotId.value = resolvePreferredSnapshotIdByReferenceRounds(
            selectedAdjudicatorReferenceRounds.value,
            savedAdjudicatorSnapshotId,
            selectedDetailSnapshotId.value,
            selectedAdjudicatorSnapshotId.value,
            selectedTeamSnapshotId.value
          )
        } else {
          selectedAdjudicatorSnapshotId.value = selectedTeamSnapshotId.value
        }
        selectedDetailSnapshotId.value = firstExistingSnapshotId(
          selectedTeamSnapshotId.value,
          selectedAdjudicatorSnapshotId.value,
          selectedDetailSnapshotId.value
        )
      }
      referenceConfirmError.value = null
    }
  } else {
    allocation.value = [createEmptyAllocationRow()]
    drawOpened.value = false
    allocationOpened.value = false
    locked.value = false
    savedDrawId.value = null
    generatedUserDefinedData.value = null
    if (!preserveReferenceSelection) {
      selectedDetailSnapshotId.value = ''
      selectedTeamSnapshotId.value = ''
      selectedAdjudicatorSnapshotId.value = ''
      applyReferenceRoundSelectionState(defaultSelections, defaultSelections, defaultSelections)
      referenceSelectionConfirmed.value = priorRounds.value.length === 0
      referenceConfirmError.value = null
    }
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
      draws.fetchDraws(tournamentId.value),
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

function readRoundCompileOptions(): CompileOptions {
  const userDefined = (roundConfig.value?.userDefinedData ?? {}) as Record<string, any>
  const rawCompile = (userDefined.compile ?? {}) as Record<string, any>
  const source =
    rawCompile.options && typeof rawCompile.options === 'object' ? rawCompile.options : rawCompile
  return normalizeCompileOptions(source as Partial<CompileOptions>, DEFAULT_COMPILE_OPTIONS)
}

function buildReferenceCompileOptions(scope: 'teams' | 'adjudicators'): CompileOptions {
  const base = readRoundCompileOptions()
  const includeLabels = new Set<CompileIncludeLabel>(['teams'])
  if (scope === 'adjudicators' && shouldTrackAdjudicatorReference.value) {
    includeLabels.add('adjudicators')
  }
  return {
    ...base,
    include_labels: compileIncludeLabels.filter((label) => includeLabels.has(label)),
  }
}

function reopenReferenceSelection() {
  referenceSelectionConfirmed.value = false
  referenceConfirmError.value = null
}

async function confirmReferenceRounds() {
  if (!tournamentId.value || referenceConfirming.value) return
  referenceConfirmError.value = null
  const teamRounds = selectedTeamReferenceRounds.value
  const adjudicatorRounds = shouldTrackAdjudicatorReference.value
    ? selectedAdjudicatorReferenceRounds.value
    : []

  if (priorRounds.value.length > 0 && teamRounds.length === 0) {
    referenceConfirmError.value = t('チーム結果参照ラウンドを1つ以上選択してください。')
    return
  }
  if (priorRounds.value.length > 0 && shouldTrackAdjudicatorReference.value && adjudicatorRounds.length === 0) {
    referenceConfirmError.value = t('ジャッジ結果参照ラウンドを1つ以上選択してください。')
    return
  }
  if (priorRounds.value.length === 0) {
    referenceSelectionConfirmed.value = true
    return
  }

  referenceConfirming.value = true
  try {
    const requiresAdjudicatorReference = shouldTrackAdjudicatorReference.value
    const shouldCompileAdjudicatorSeparately =
      requiresAdjudicatorReference && !areRoundSetsEqual(teamRounds, adjudicatorRounds)
    const teamCompileScope =
      requiresAdjudicatorReference && !shouldCompileAdjudicatorSeparately
        ? 'adjudicators'
        : 'teams'
    const teamCompiled = await compiledStore.saveCompiled(tournamentId.value, {
      source: 'submissions',
      rounds: teamRounds,
      options: buildReferenceCompileOptions(teamCompileScope),
    })
    const teamCompiledId = String(teamCompiled?._id ?? '').trim()
    if (!teamCompiledId) {
      referenceConfirmError.value = compiledStore.error ?? t('参照集計の確定に失敗しました。')
      return
    }

    let adjudicatorCompiledId = teamCompiledId
    if (shouldCompileAdjudicatorSeparately) {
      const adjudicatorCompiled = await compiledStore.saveCompiled(tournamentId.value, {
        source: 'submissions',
        rounds: adjudicatorRounds,
        options: buildReferenceCompileOptions('adjudicators'),
      })
      adjudicatorCompiledId = String(adjudicatorCompiled?._id ?? '').trim()
      if (!adjudicatorCompiledId) {
        referenceConfirmError.value = compiledStore.error ?? t('参照集計の確定に失敗しました。')
        return
      }
    }

    selectedDetailSnapshotId.value = teamCompiledId
    selectedTeamSnapshotId.value = teamCompiledId
    selectedAdjudicatorSnapshotId.value = adjudicatorCompiledId
    referenceSelectionConfirmed.value = true
    await refreshCompiledHistory()
  } finally {
    referenceConfirming.value = false
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
  if (!referenceSelectionConfirmed.value) {
    openNotice(t('先に参照ラウンドを確定してください。'))
    return
  }
  const validRows = allocation.value.filter((row) => row.teams.gov && row.teams.opp)
  if (validRows.length === 0) {
    openNotice(t('有効なマッチがありません。'))
    return
  }
  if (validRows.some((row) => row.teams.gov === row.teams.opp)) {
    openNotice(t('同じチームが両サイドに設定されています。'))
    return
  }
  const sharedCompiledId = String(selectedDetailSnapshotId.value ?? '').trim()
  const teamCompiledId = String(selectedTeamSnapshotId.value ?? '').trim()
  const adjudicatorCompiledId = String(selectedAdjudicatorSnapshotId.value ?? '').trim()
  const nextUserDefinedData = withDrawReferenceCompiledRefs(generatedUserDefinedData.value, {
    sharedCompiledId,
    sharedRounds: selectedDetailSnapshotRoundNumbers.value,
    teamCompiledId,
    teamRounds: selectedTeamSnapshotRoundNumbers.value,
    adjudicatorCompiledId,
    adjudicatorRounds: selectedAdjudicatorSnapshotRoundNumbers.value,
  })
  const saved = await draws.upsertDraw({
    tournamentId: tournamentId.value,
    round: round.value,
    allocation: validRows,
    ...(nextUserDefinedData ? { userDefinedData: nextUserDefinedData } : {}),
    drawOpened: drawOpened.value,
    allocationOpened: allocationOpened.value,
    locked: locked.value,
  })
  if (!saved) {
    if (!draws.error) {
      openNotice(t('保存に失敗しました'))
    }
    return
  }
  savedSnapshot.value = allocationSnapshot()
  savedDrawId.value = saved?._id ?? savedDrawId.value
  generatedUserDefinedData.value = nextUserDefinedData ?? null
}

function openAutoGenerateModal() {
  requestError.value = null
  if (locked.value) {
    openNotice(t('ドローがロックされているため自動生成できません。'))
    return
  }
  if (
    isBreakRound.value &&
    scopeIncludesTeams.value &&
    autoOptions.value.teamAlgorithm !== 'break'
  ) {
    autoOptions.value.teamAlgorithm = 'break'
  } else if (!isBreakRound.value && autoOptions.value.teamAlgorithm === 'break') {
    autoOptions.value.teamAlgorithm = 'standard'
  }
  if (scopeRequiresExistingDraw(requestScope.value)) {
    requestScope.value = 'all'
  }
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
  allocationImportText.value = ''
  if (isBreakRound.value) {
    openNotice(t('ブレイクラウンドのため取り込みできません。'))
    return
  }
  showAllocationImportModal.value = true
}

function closeAllocationImportModal() {
  showAllocationImportModal.value = false
  allocationImportError.value = null
  allocationImportText.value = ''
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
  if (isBreakRound.value) {
    allocationImportError.value = t('ブレイクラウンドのため取り込みできません。')
    return
  }
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

const TEAM_ALGORITHM_VALUES = ['standard', 'powerpair', 'strict', 'break'] as const
const TEAM_STANDARD_METHOD_VALUES = ['original', 'straight', 'weighted', 'custom'] as const
const TEAM_STANDARD_SIDE_SPREAD_FILTER = 'spread_sides_by_school' as const
const TEAM_STANDARD_FILTER_VALUES = [
  'by_strength',
  'by_side',
  'by_past_opponent',
  'by_conflict_group',
  'by_random',
  'by_sibling_past_opponent_school',
  TEAM_STANDARD_SIDE_SPREAD_FILTER,
] as const
const TEAM_STANDARD_FILTER_DEFAULTS = [
  'by_strength',
  'by_side',
  'by_past_opponent',
  'by_conflict_group',
] as const
const TEAM_STRICT_PAIRING_VALUES = ['random', 'fold', 'slide', 'sort', 'adjusted'] as const
const TEAM_STRICT_PULLUP_VALUES = ['fromtop', 'frombottom', 'random'] as const
const TEAM_STRICT_POSITION_VALUES = ['random', 'adjusted'] as const
const TEAM_POWERPAIR_ODD_BRACKET_VALUES = ['pullup_top', 'pullup_bottom', 'pullup_random'] as const
const TEAM_POWERPAIR_PAIRING_VALUES = ['slide', 'fold', 'random'] as const
const TEAM_CONFLICT_MODE_VALUES = ['one_up_one_down', 'off'] as const
const ADJUDICATOR_ALGORITHM_VALUES = ['standard', 'traditional'] as const
const ADJUDICATOR_STANDARD_FILTER_VALUES = [
  'by_bubble',
  'by_strength',
  'by_attendance',
  'by_conflict_team',
  'by_conflict_group',
  'by_past',
  'by_random',
] as const
const ADJUDICATOR_ASSIGN_VALUES = [
  'high_to_high',
  'high_to_slight',
  'high_to_close',
  'middle_to_high',
  'middle_to_slight',
  'middle_to_close',
] as const

function normalizeEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback
}

function normalizeUniqueStringList<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: readonly T[]
): T[] {
  if (!Array.isArray(value)) return [...fallback]
  const allowedSet = new Set<string>(allowed)
  const out: T[] = []
  value.forEach((item) => {
    if (typeof item !== 'string') return
    if (!allowedSet.has(item)) return
    if (out.includes(item as T)) return
    out.push(item as T)
  })
  return out.length > 0 ? out : [...fallback]
}

function normalizeNonNegativeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

async function requestAllocation() {
  requestError.value = null
  if (locked.value) {
    requestError.value = t('ドローがロックされているため自動生成できません。')
    return
  }
  requestLoading.value = true
  try {
    const requestedTeamAlgorithm = scopeIncludesTeams.value
      ? normalizeEnumValue(autoOptions.value.teamAlgorithm, TEAM_ALGORITHM_VALUES, 'standard')
      : 'standard'
    const effectiveTeamAlgorithm =
      !isBreakRound.value && requestedTeamAlgorithm === 'break'
        ? 'standard'
        : requestedTeamAlgorithm
    const requestedAdjudicatorAlgorithm = normalizeEnumValue(
      autoOptions.value.adjudicatorAlgorithm,
      ADJUDICATOR_ALGORITHM_VALUES,
      'standard'
    )
    const normalizedStandardTeamFilters = normalizeUniqueStringList(
      autoOptions.value.teamFilters,
      TEAM_STANDARD_FILTER_VALUES,
      TEAM_STANDARD_FILTER_DEFAULTS
    )
    const spreadSidesBySchool = normalizedStandardTeamFilters.includes(
      TEAM_STANDARD_SIDE_SPREAD_FILTER
    )
    const standardTeamFilters = normalizedStandardTeamFilters.filter(
      (value) => value !== TEAM_STANDARD_SIDE_SPREAD_FILTER
    )

    const teamOptions =
      effectiveTeamAlgorithm === 'strict'
        ? {
            pullup_method: normalizeEnumValue(
              autoOptions.value.teamStrictPullupMethod,
              TEAM_STRICT_PULLUP_VALUES,
              'fromtop'
            ),
            pairing_method: normalizeEnumValue(
              autoOptions.value.teamStrictPairingMethod,
              TEAM_STRICT_PAIRING_VALUES,
              'random'
            ),
            avoid_conflict: autoOptions.value.teamStrictAvoidConflicts === 'one_up_one_down',
            conflict_weights: {
              conflict_group: normalizeNonNegativeNumber(
                autoOptions.value.teamStrictConflictInstitutionWeight,
                1
              ),
              past_opponent: normalizeNonNegativeNumber(
                autoOptions.value.teamStrictConflictPastOpponentWeight,
                1
              ),
            },
            max_swap_iterations: normalizeNonNegativeInteger(
              autoOptions.value.teamStrictMaxSwapIterations,
              24
            ),
            position_method: normalizeEnumValue(
              autoOptions.value.teamStrictPositionMethod,
              TEAM_STRICT_POSITION_VALUES,
              'adjusted'
            ),
          }
        : effectiveTeamAlgorithm === 'powerpair'
          ? {
              odd_bracket: normalizeEnumValue(
                autoOptions.value.teamPowerpairOddBracket,
                TEAM_POWERPAIR_ODD_BRACKET_VALUES,
                'pullup_top'
              ),
              pairing_method: normalizeEnumValue(
                autoOptions.value.teamPowerpairPairingMethod,
                TEAM_POWERPAIR_PAIRING_VALUES,
                'fold'
              ),
              avoid_conflicts: normalizeEnumValue(
                autoOptions.value.teamPowerpairAvoidConflicts,
                TEAM_CONFLICT_MODE_VALUES,
                'one_up_one_down'
              ),
              conflict_weights: {
                conflict_group: normalizeNonNegativeNumber(
                  autoOptions.value.teamPowerpairConflictInstitutionWeight,
                  1
                ),
                past_opponent: normalizeNonNegativeNumber(
                  autoOptions.value.teamPowerpairConflictPastOpponentWeight,
                  1
                ),
              },
              max_swap_iterations: normalizeNonNegativeInteger(
                autoOptions.value.teamPowerpairMaxSwapIterations,
                24
              ),
            }
          : effectiveTeamAlgorithm === 'break'
            ? {}
            : {
                method: normalizeEnumValue(
                  autoOptions.value.teamMethod,
                  TEAM_STANDARD_METHOD_VALUES,
                  'original'
                ),
                filters: standardTeamFilters,
                spread_sides_by_school: spreadSidesBySchool,
              }
    const adjudicatorOptions =
      requestedAdjudicatorAlgorithm === 'traditional'
        ? {
            assign: normalizeEnumValue(
              autoOptions.value.adjudicatorAssign,
              ADJUDICATOR_ASSIGN_VALUES,
              'high_to_high'
            ),
            scatter: Boolean(autoOptions.value.adjudicatorScatter),
          }
        : {
            filters: normalizeUniqueStringList(
              autoOptions.value.adjudicatorFilters,
              ADJUDICATOR_STANDARD_FILTER_VALUES,
              ADJUDICATOR_STANDARD_FILTER_VALUES
            ),
          }
    const numbersOfAdjudicators = {
      chairs: normalizeNonNegativeInteger(autoOptions.value.chairs, 1),
      panels: normalizeNonNegativeInteger(autoOptions.value.panels, 0),
      trainees: normalizeNonNegativeInteger(autoOptions.value.trainees, 0),
    }
    const useScopedOverrides = true
    const teamSnapshotId = resolveSnapshotIdForScope('teams', useScopedOverrides)
    const adjudicatorSnapshotId = resolveSnapshotIdForScope('adjudicators', useScopedOverrides)
    const snapshotId = resolveSnapshotIdForScope(requestScope.value, useScopedOverrides)
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
    if (effectiveTeamAlgorithm === 'break' && scopeIncludesTeams.value) {
      const synced = await syncAutoBreakPolicyToRound()
      if (!synced) return
    }
    const options = {
      team_allocation_algorithm: effectiveTeamAlgorithm,
      team_allocation_algorithm_options: teamOptions,
      adjudicator_allocation_algorithm: requestedAdjudicatorAlgorithm,
      adjudicator_allocation_algorithm_options: adjudicatorOptions,
      numbers_of_adjudicators: numbersOfAdjudicators,
      venue_allocation_algorithm_options: { shuffle: venueShuffleEnabled.value },
    }

    const snapshotPayload =
      requestScope.value === 'all'
        ? useScopedOverrides
          ? {
              ...(teamSnapshotId ? { snapshotIdTeams: teamSnapshotId } : {}),
              ...(adjudicatorSnapshotId ? { snapshotIdAdjudicators: adjudicatorSnapshotId } : {}),
            }
          : {
              ...(snapshotId ? { snapshotId } : {}),
            }
        : {
            ...(snapshotId ? { snapshotId } : {}),
          }

    const basePayload: Record<string, any> = {
      tournamentId: tournamentId.value,
      round: round.value,
      options,
      rounds: roundList.length > 0 ? roundList : undefined,
      ...snapshotPayload,
    }

    let endpoint = '/allocations'
    let payload = basePayload
    if (requestScope.value === 'teams') {
      endpoint = effectiveTeamAlgorithm === 'break' ? '/allocations/break' : '/allocations/teams'
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
        requestScope.value === 'teams' ? mergeTeamScopeAllocation(generatedRows) : generatedRows
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
  if (locked.value) return
  syncFromDraw(currentDraw.value ?? null, { preserveReferenceSelection: true })
}

function detailAvailable(details: any[] | undefined, r: number) {
  const detail = details?.find((d: any) => Number(d.r) === r)
  return detail?.available !== false
}

function teamAvailableInRound(teamId: string) {
  const team = teams.teams.find((item) => item._id === teamId)
  if (!team) return true
  return detailAvailable(team.details, round.value)
}

function adjudicatorAvailableInRound(adjudicatorId: string) {
  const adjudicator = adjudicators.adjudicators.find((item) => item._id === adjudicatorId)
  if (!adjudicator) return true
  return detailAvailable(adjudicator.details, round.value)
}

function venueAvailableInRound(venueId: string) {
  const venue = venues.venues.find((item) => item._id === venueId)
  if (!venue) return true
  return detailAvailable(venue.details, round.value)
}

function isEntityAvailableInRound(kind: 'team' | 'adjudicator' | 'venue', id: string) {
  if (kind === 'team') return teamAvailableInRound(id)
  if (kind === 'adjudicator') return adjudicatorAvailableInRound(id)
  return venueAvailableInRound(id)
}

function canDragEntity(kind: 'team' | 'adjudicator' | 'venue', id: string | null | undefined) {
  if (locked.value) return false
  const normalizedId = String(id ?? '').trim()
  if (!normalizedId) return false
  return isEntityAvailableInRound(kind, normalizedId)
}

function detailForRound(details: any[] | undefined, r: number) {
  return details?.find((d: any) => Number(d.r) === r) ?? {}
}

function normalizeInstitutionCategory(value: unknown): ConflictGroupCategory {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
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
  })
  return Array.from(mapped)
}

function institutionCategoryById(value: string): ConflictGroupCategory {
  const token = String(value ?? '').trim()
  if (!token) return 'institution'
  const match = institutions.institutions.find((inst) => inst._id === token)
  return normalizeInstitutionCategory(match?.category)
}

function teamInstitutions(team: any) {
  if (!team) return []
  const detail = detailForRound(team.details, round.value)
  const base = ([] as string[]).concat(detail.conflicts ?? [], team?.template?.conflicts ?? [])
  return normalizeInstitutions(base)
}

function adjudicatorInstitutions(adj: any) {
  if (!adj) return []
  const detail = detailForRound(adj.details, round.value)
  return normalizeInstitutions(([] as string[]).concat(detail.conflicts ?? [], adj?.template?.conflicts ?? []))
}

function adjudicatorConflicts(adj: any) {
  if (!adj) return []
  const detail = detailForRound(adj.details, round.value)
  return ([] as any[]).concat(detail.conflict_teams ?? [], adj?.template?.conflict_teams ?? []).map((id: any) => String(id))
}

const compiledTeamMap = computed(() => {
  const results = Array.isArray(selectedTeamPayload.value?.compiled_team_results)
    ? selectedTeamPayload.value.compiled_team_results
    : []
  const map = new Map<string, any>()
  results.forEach((result: any) => {
    map.set(String(result.id), result)
  })
  return map
})

const compiledAdjMap = computed(() => {
  const results = Array.isArray(selectedAdjudicatorPayload.value?.compiled_adjudicator_results)
    ? selectedAdjudicatorPayload.value.compiled_adjudicator_results
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

function teamWinValue(teamId: string): number | null {
  const result = compiledTeamMap.value.get(String(teamId))
  const value = Number(result?.win)
  return Number.isFinite(value) ? value : null
}

const maxTeamWin = computed(() => {
  let max = 0
  compiledTeamMap.value.forEach((result) => {
    const value = Number(result?.win)
    if (Number.isFinite(value) && value > max) {
      max = value
    }
  })
  return max
})

function formatTeamWinValue(value: number) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function teamWinBadge(teamId: string) {
  const value = teamWinValue(teamId)
  if (value === null) return ''
  const formatted = formatTeamWinValue(value)
  return formatted.startsWith('-') ? formatted : `+${formatted}`
}

function teamWinBadgeClass(teamId: string) {
  const value = teamWinValue(teamId)
  if (value === null) return 'team-win-badge--none'
  const max = maxTeamWin.value
  if (max <= 0) return 'team-win-badge--low'
  const ratio = value / max
  if (ratio >= 0.67) return 'team-win-badge--high'
  if (ratio >= 0.34) return 'team-win-badge--mid'
  return 'team-win-badge--low'
}

function teamPillTitle(teamId: string) {
  const label = teamName(teamId)
  const winBadge = teamWinBadge(teamId)
  return winBadge ? `${label} (${winBadge})` : label
}

function adjudicatorAverageValue(adjudicatorId: string): number | null {
  const result = compiledAdjMap.value.get(String(adjudicatorId))
  const value = Number(result?.average)
  return Number.isFinite(value) ? value : null
}

const adjudicatorAverageRange = computed(() => {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  compiledAdjMap.value.forEach((result) => {
    const value = Number(result?.average)
    if (!Number.isFinite(value)) return
    if (value < min) min = value
    if (value > max) max = value
  })
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: null as number | null, max: null as number | null }
  }
  return { min, max }
})

function adjudicatorAverageBadge(adjudicatorId: string) {
  const value = adjudicatorAverageValue(adjudicatorId)
  if (value === null) return ''
  return String(Math.round(value))
}

function adjudicatorAverageBadgeClass(adjudicatorId: string) {
  const value = adjudicatorAverageValue(adjudicatorId)
  if (value === null) return 'adjudicator-average-badge--none'
  const { min, max } = adjudicatorAverageRange.value
  if (min === null || max === null || max <= min) return 'adjudicator-average-badge--mid'
  const ratio = (value - min) / (max - min)
  if (ratio >= 0.67) return 'adjudicator-average-badge--high'
  if (ratio >= 0.34) return 'adjudicator-average-badge--mid'
  return 'adjudicator-average-badge--low'
}

function adjudicatorPillTitle(adjudicatorId: string) {
  const label = adjudicatorName(adjudicatorId)
  const averageBadge = adjudicatorAverageBadge(adjudicatorId)
  return averageBadge ? `${label} (${t('平均')}: ${averageBadge})` : label
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

function formatPreviewCsvValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (Array.isArray(value)) return value.map((item) => String(item)).join(',')
  if (value === null || value === undefined || value === '') return ''
  return String(value)
}

function escapeCsvValue(value: string) {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function downloadDrawPreviewCsv() {
  const displayRows = drawPreviewTableRef.value?.getDisplayRows() ?? previewRows.value
  if (displayRows.length === 0) return
  const headers = [
    '#',
    t('会場'),
    govLabel.value,
    oppLabel.value,
    t('チェア'),
    t('パネル'),
    t('トレーニー'),
  ]
  const rows = displayRows.map((row, index) =>
    [
      index + 1,
      row.venueLabel,
      row.govName,
      row.oppName,
      row.chairsLabel,
      row.panelsLabel,
      row.traineesLabel,
    ].map((cell) => escapeCsvValue(formatPreviewCsvValue(cell)))
  )
  const csv = [
    headers.map((header) => escapeCsvValue(String(header))).join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\n')
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `round_${round.value}_draw_preview.csv`
  link.click()
  URL.revokeObjectURL(url)
}

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
  return detailSpeakerIds.map((id: string) => speakerNameById(id))
}

function teamSpeakerIds(team: any) {
  if (!team) return []
  const detail = detailForRound(team.details, round.value)
  const detailSpeakerIds = (detail.speakers ?? []).map((id: any) => String(id)).filter(Boolean)
  return detailSpeakerIds
}

type DragKind = 'team' | 'adjudicator' | 'venue'
const dragPayload = ref<{ kind: DragKind; id: string } | null>(null)
const dragKind = computed(() => dragPayload.value?.kind ?? null)
const rowDragSourceIndex = ref<number | null>(null)
const rowDragTargetIndex = ref<number | null>(null)

function allocationSortValue(row: DrawAllocationRow, key: AllocationSortKey) {
  if (key === 'venue') return row.venue ? venueName(row.venue) : ''
  if (key === 'gov') return row.teams.gov ? teamName(row.teams.gov) : ''
  if (key === 'opp') return row.teams.opp ? teamName(row.teams.opp) : ''
  if (key === 'chairs') return adjudicatorListLabel(row.chairs ?? [])
  if (key === 'panels') return adjudicatorListLabel(row.panels ?? [])
  if (key === 'trainees') return adjudicatorListLabel(row.trainees ?? [])
  return ''
}

function applyAllocationSort(key: AllocationSortKey, direction: AllocationSortDirection) {
  const rows = allocation.value.map((row, index) => ({ row, index }))
  rows.sort((left, right) => {
    if (key === 'match') {
      return direction === 'asc' ? left.index - right.index : right.index - left.index
    }
    const leftValue = allocationSortValue(left.row, key)
    const rightValue = allocationSortValue(right.row, key)
    const diff = allocationSortCollator.compare(leftValue, rightValue)
    if (diff !== 0) return direction === 'asc' ? diff : -diff
    return left.index - right.index
  })
  allocation.value = rows.map((item) => item.row)
  clearRowDragState()
}

function setAllocationSort(key: AllocationSortKey) {
  if (locked.value) return
  const nextDirection: AllocationSortDirection =
    allocationSortState.value.key === key
      ? allocationSortState.value.direction === 'asc'
        ? 'desc'
        : 'asc'
      : key === 'match'
        ? 'asc'
        : 'asc'
  allocationSortState.value = { key, direction: nextDirection }
  applyAllocationSort(key, nextDirection)
}

function allocationSortIndicator(key: AllocationSortKey) {
  if (allocationSortState.value.key !== key) return '↕'
  return allocationSortState.value.direction === 'asc' ? '↑' : '↓'
}

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
  allocationSortState.value = { key: 'match', direction: 'asc' }
}

function onRowDrop(targetIndex: number, event: DragEvent) {
  if (locked.value) {
    clearRowDragState()
    return
  }
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

const displayDetail = computed<{
  type: 'team' | 'adjudicator' | 'venue'
  id: string
  fromDrag: boolean
} | null>(() => {
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

type DetailRow = {
  label: string
  value: string | number
  highlightEntityKeys?: string[]
}

function uniqueEntityIds(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function buildTeamEntityKeys(teamIds: string[]): string[] {
  return uniqueEntityIds(teamIds).map((teamId) => warningEntityKey('team', teamId))
}

function buildAdjudicatorEntityKeys(adjudicatorIds: string[]): string[] {
  return uniqueEntityIds(adjudicatorIds).map((adjudicatorId) =>
    warningEntityKey('adj', adjudicatorId)
  )
}

function buildInstitutionEntityKeys(institutionIds: string[]): string[] {
  const normalizedInstitutionIds = uniqueEntityIds(institutionIds)
  if (normalizedInstitutionIds.length === 0) return []
  const institutionSet = new Set(normalizedInstitutionIds)
  const keys = new Set<string>()

  teams.teams.forEach((team) => {
    const matched = teamInstitutions(team).some((institutionId) =>
      institutionSet.has(institutionId)
    )
    if (matched) {
      keys.add(warningEntityKey('team', team._id))
    }
  })
  adjudicators.adjudicators.forEach((adj) => {
    const matched = adjudicatorInstitutions(adj).some((institutionId) =>
      institutionSet.has(institutionId)
    )
    if (matched) {
      keys.add(warningEntityKey('adj', adj._id))
    }
  })

  return [...keys]
}

const detailRows = computed<DetailRow[]>(() => {
  if (!displayDetail.value) return []
  const { type, id } = displayDetail.value
  if (type === 'team') {
    const team = teams.teams.find((t) => t._id === id)
    const result = compiledTeamMap.value.get(String(id))
    const normalizedTeamId = String(id).trim()
    const institutionIds = team ? teamInstitutions(team) : []
    const institutionsList = institutionIds.map((inst) => institutionNameById(inst))
    const pastOpponentIds = uniqueEntityIds(
      Array.isArray(result?.past_opponents) ? result.past_opponents : []
    )
    const pastAdjudicatorIds = uniqueEntityIds(
      Array.from(compiledAdjMap.value.values())
        .filter(
          (adjResult) =>
            Array.isArray(adjResult?.judged_teams) &&
            adjResult.judged_teams.some(
              (teamId: any) => String(teamId ?? '').trim() === normalizedTeamId
            )
        )
        .map((adjResult: any) => String(adjResult?.id ?? ''))
    )
    const speakersList = teamSpeakerNames(team)
    return [
      { label: t('順位'), value: result?.ranking ?? '—' },
      { label: t('勝利数'), value: result?.win ?? '—' },
      { label: t('合計'), value: result?.sum ?? '—' },
      { label: t('マージン'), value: result?.margin ?? '—' },
      { label: t('利用可'), value: teamAvailableInRound(String(id)) ? t('はい') : t('いいえ') },
      {
        label: t('コンフリクトグループ'),
        value: institutionsList.length ? institutionsList.join(', ') : '—',
        highlightEntityKeys: buildInstitutionEntityKeys(institutionIds),
      },
      {
        label: t('対戦相手'),
        value: pastOpponentIds.length
          ? pastOpponentIds.map((oppId) => teamNameById(oppId)).join(', ')
          : '—',
        highlightEntityKeys: buildTeamEntityKeys(pastOpponentIds),
      },
      {
        label: t('サイド'),
        value: result?.past_sides?.length ? result.past_sides.join(', ') : '—',
      },
      {
        label: t('過去に担当済み'),
        value: pastAdjudicatorIds.length
          ? pastAdjudicatorIds.map((adjudicatorId) => adjudicatorNameById(adjudicatorId)).join(', ')
          : '—',
        highlightEntityKeys: buildAdjudicatorEntityKeys(pastAdjudicatorIds),
      },
      { label: t('スピーカー'), value: speakersList.length ? speakersList.join(', ') : '—' },
      { label: t('ID'), value: id },
    ]
  }
  if (type === 'adjudicator') {
    const adj = adjudicators.adjudicators.find((a) => a._id === id)
    const result = compiledAdjMap.value.get(String(id))
    const averageBadge = adjudicatorAverageBadge(id)
    const institutionIds = adj ? adjudicatorInstitutions(adj) : []
    const institutionsList = institutionIds.map((inst) => institutionNameById(inst))
    const conflictTeamIds = uniqueEntityIds(adj ? adjudicatorConflicts(adj) : [])
    const conflictsList = conflictTeamIds.map((teamId) => teamNameById(teamId))
    const judgedTeamIds = uniqueEntityIds(
      Array.isArray(result?.judged_teams) ? result.judged_teams : []
    )
    return [
      { label: t('順位'), value: result?.ranking ?? '—' },
      { label: t('平均'), value: averageBadge || '—' },
      {
        label: t('利用可'),
        value: adjudicatorAvailableInRound(String(id)) ? t('はい') : t('いいえ'),
      },
      {
        label: t('コンフリクトグループ'),
        value: institutionsList.length ? institutionsList.join(', ') : '—',
        highlightEntityKeys: buildInstitutionEntityKeys(institutionIds),
      },
      {
        label: t('コンフリクトチーム'),
        value: conflictsList.length ? conflictsList.join(', ') : '—',
        highlightEntityKeys: buildTeamEntityKeys(conflictTeamIds),
      },
      {
        label: t('担当チーム'),
        value: judgedTeamIds.length
          ? judgedTeamIds.map((teamId) => teamNameById(teamId)).join(', ')
          : '—',
        highlightEntityKeys: buildTeamEntityKeys(judgedTeamIds),
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
    { label: t('利用可'), value: venueAvailableInRound(String(id)) ? t('はい') : t('いいえ') },
    { label: t('ID'), value: id },
  ]
})

const focusedDetailEntityKeys = ref<Set<string>>(new Set())

function setFocusedDetailRow(row: DetailRow) {
  const keys = Array.isArray(row.highlightEntityKeys) ? row.highlightEntityKeys : []
  focusedDetailEntityKeys.value = new Set(keys)
}

function clearFocusedDetailRow() {
  focusedDetailEntityKeys.value = new Set()
}

watch(displayDetail, () => {
  clearFocusedDetailRow()
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

function warningSideLabel(value: unknown): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  if (normalized === 'gov') return govLabel.value
  if (normalized === 'opp') return oppLabel.value
  return ''
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
    const name = teamNameById(String(warning.params.teamId ?? ''))
    const side = warningSideLabel(warning.params.side)
    if (side) {
      return t('{name} が{side}側に偏っています', {
        name,
        side,
      })
    }
    return t('{name} が片側に偏っています', { name })
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

type WarningSummaryItem = {
  severity: WarningSeverity
  label: string
  count: number
}

function warningSummaryItems(counts: WarningSeverityCounts): WarningSummaryItem[] {
  const items: WarningSummaryItem[] = [
    {
      severity: 'critical',
      label: warningSeverityLabel('critical'),
      count: counts.critical,
    },
    {
      severity: 'warn',
      label: warningSeverityLabel('warn'),
      count: counts.warn,
    },
    {
      severity: 'info',
      label: warningSeverityLabel('info'),
      count: counts.info,
    },
  ]
  return items.filter((item) => item.count > 0)
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
  top = Math.max(
    viewportPadding,
    Math.min(top, window.innerHeight - estimatedHeight - viewportPadding)
  )

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
  if (kind === 'team' && breakEliminatedTeamIds.value.has(normalized)) {
    classes.push('pill-team-eliminated')
  }
  const warningMeta = entityWarningIndex.value.get(key)
  if (warningMeta) {
    classes.push(`pill-severity--${warningMeta.maxSeverity}`)
  }
  if (focusedEntityKeys.value.has(key) || focusedDetailEntityKeys.value.has(key)) {
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
  adjudicators.adjudicators.filter((adj) => detailAvailable(adj.details, round.value))
)

const unassignedTeams = computed(() => {
  const assigned = new Set<string>()
  allocation.value.forEach((row) => {
    if (row.teams.gov) assigned.add(row.teams.gov)
    if (row.teams.opp) assigned.add(row.teams.opp)
  })
  return availableTeams.value.filter((team) => !assigned.has(team._id))
})

type ReferenceUnassignedTeamRow = {
  key: string
  venueId: string | null
  govTeamIds: string[]
  oppTeamIds: string[]
  chairIds: string[]
  panelIds: string[]
  traineeIds: string[]
  matchIndex: number
  sortTopWin: number
  sortTotalWin: number
  sortLabel: string
}

function normalizeMatchupSide(value: unknown): 'gov' | 'opp' | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  if (normalized === 'gov') return 'gov'
  if (normalized === 'opp') return 'opp'
  return null
}

function normalizeEntityIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids: string[] = []
  value.forEach((entry) => {
    const id = String(entry ?? '').trim()
    if (!id || ids.includes(id)) return
    ids.push(id)
  })
  return ids
}

const selectedDetailReferenceRound = computed<number | null>(() => {
  const rounds = selectedDetailSnapshotRoundNumbers.value
  if (rounds.length === 0) return null
  return rounds[rounds.length - 1] ?? null
})

const referenceLatestRoundDraw = computed(() => {
  const targetRound = selectedDetailReferenceRound.value
  if (targetRound === null) return null
  return draws.draws.find((draw) => Number(draw.round) === targetRound) ?? null
})

function rowWinMetrics(govTeamIds: string[], oppTeamIds: string[]) {
  const govWins = govTeamIds.reduce((total, teamId) => total + (teamWinValue(teamId) ?? 0), 0)
  const oppWins = oppTeamIds.reduce((total, teamId) => total + (teamWinValue(teamId) ?? 0), 0)
  const hasWinValue = [...govTeamIds, ...oppTeamIds].some((teamId) => teamWinValue(teamId) !== null)
  return {
    govWins,
    oppWins,
    hasWinValue,
    sortTopWin: hasWinValue ? Math.max(govWins, oppWins) : Number.NEGATIVE_INFINITY,
    sortTotalWin: hasWinValue ? govWins + oppWins : Number.NEGATIVE_INFINITY,
  }
}

function referenceRowsFromLatestDraw(
  draw: { allocation?: DrawAllocationRow[]; round?: number } | null
) {
  const allocationRows = Array.isArray(draw?.allocation) ? (draw?.allocation ?? []) : []
  return allocationRows
    .map((row, index): ReferenceUnassignedTeamRow | null => {
      const gov = String(row?.teams?.gov ?? '').trim()
      const opp = String(row?.teams?.opp ?? '').trim()
      if (!gov && !opp) return null
      const govTeamIds = gov ? [gov] : []
      const oppTeamIds = opp ? [opp] : []
      const venueId = String(row?.venue ?? '').trim()
      const chairIds = normalizeEntityIdList(row?.chairs)
      const panelIds = normalizeEntityIdList(row?.panels)
      const traineeIds = normalizeEntityIdList(row?.trainees)
      const winMetrics = rowWinMetrics(govTeamIds, oppTeamIds)
      return {
        key: `draw-r${draw?.round ?? 'x'}-${index}-${gov}-${opp}`,
        venueId: venueId || null,
        govTeamIds,
        oppTeamIds,
        chairIds,
        panelIds,
        traineeIds,
        matchIndex: index,
        sortTopWin: winMetrics.sortTopWin,
        sortTotalWin: winMetrics.sortTotalWin,
        sortLabel: teamNameById(gov || opp),
      }
    })
    .filter((row): row is ReferenceUnassignedTeamRow => row !== null)
}

function referenceRowsFromCompiled(targetRound: number): ReferenceUnassignedTeamRow[] {
  const compiledTeamResults = Array.isArray(selectedTeamPayload.value?.compiled_team_results)
    ? selectedTeamPayload.value.compiled_team_results
    : []
  if (compiledTeamResults.length === 0) return []

  const rowMap = new Map<
    string,
    {
      allTeamIds: string[]
      govTeamIds: string[]
      oppTeamIds: string[]
      sortLabel: string
    }
  >()
  compiledTeamResults.forEach((result: any) => {
    const teamId = String(result?.id ?? '').trim()
    if (!teamId) return
    const detail = Array.isArray(result?.details)
      ? result.details.find((entry: any) => Number(entry?.r ?? entry?.round) === targetRound)
      : null
    if (!detail) return
    const opponents = Array.isArray(detail?.opponents)
      ? detail.opponents
          .map((entry: unknown) => String(entry ?? '').trim())
          .filter((entry: string) => entry.length > 0)
      : []
    const candidateIds = Array.from(new Set([teamId, ...opponents]))
    if (candidateIds.length <= 1) return

    const key = candidateIds
      .slice()
      .sort((left, right) => allocationSortCollator.compare(left, right))
      .join('::')
    const current = rowMap.get(key) ?? {
      allTeamIds: [],
      govTeamIds: [],
      oppTeamIds: [],
      sortLabel: '',
    }
    candidateIds.forEach((id) => {
      if (current.allTeamIds.includes(id)) return
      current.allTeamIds.push(id)
    })
    const side = normalizeMatchupSide(detail?.side)
    if (side === 'gov' && !current.govTeamIds.includes(teamId)) current.govTeamIds.push(teamId)
    if (side === 'opp' && !current.oppTeamIds.includes(teamId)) current.oppTeamIds.push(teamId)
    if (!current.sortLabel) {
      current.sortLabel = teamNameById(teamId)
    }
    rowMap.set(key, current)
  })

  const rows = Array.from(rowMap.entries())
    .map(([key, value]) => {
      const normalizedGov = value.govTeamIds.slice()
      const normalizedOpp = value.oppTeamIds.slice()
      const distributed = value.allTeamIds
        .slice()
        .sort((left, right) =>
          allocationSortCollator.compare(teamNameById(left), teamNameById(right))
        )
      distributed.forEach((teamId) => {
        if (normalizedGov.includes(teamId) || normalizedOpp.includes(teamId)) return
        if (normalizedGov.length <= normalizedOpp.length) {
          normalizedGov.push(teamId)
        } else {
          normalizedOpp.push(teamId)
        }
      })
      const winMetrics = rowWinMetrics(normalizedGov, normalizedOpp)
      return {
        key,
        venueId: null,
        govTeamIds: normalizedGov,
        oppTeamIds: normalizedOpp,
        chairIds: [],
        panelIds: [],
        traineeIds: [],
        matchIndex: 0,
        sortTopWin: winMetrics.sortTopWin,
        sortTotalWin: winMetrics.sortTotalWin,
        sortLabel: value.sortLabel,
      }
    })
    .sort((left, right) => {
      if (left.sortTopWin !== right.sortTopWin) return right.sortTopWin - left.sortTopWin
      if (left.sortTotalWin !== right.sortTotalWin) return right.sortTotalWin - left.sortTotalWin
      return allocationSortCollator.compare(left.sortLabel, right.sortLabel)
    })
    .map((row, index) => ({
      ...row,
      matchIndex: index,
    }))
  return rows
}

const referenceBaseTeamRows = computed<ReferenceUnassignedTeamRow[]>(() => {
  const fromDraw = referenceRowsFromLatestDraw(referenceLatestRoundDraw.value)
  if (fromDraw.length > 0) return fromDraw
  const targetRound = selectedDetailReferenceRound.value
  if (targetRound === null) return []
  return referenceRowsFromCompiled(targetRound)
})

const referenceUnassignedTeamRows = computed<ReferenceUnassignedTeamRow[]>(() => {
  const unassignedTeamSet = new Set(unassignedTeams.value.map((team) => team._id))
  const unassignedVenueSet = new Set(unassignedVenues.value.map((venue) => venue._id))
  const unassignedAdjudicatorSet = new Set(
    unassignedAdjudicators.value.map((adjudicator) => adjudicator._id)
  )
  const groupedRows = referenceBaseTeamRows.value
    .map((row) => {
      const venueId =
        typeof row.venueId === 'string' && unassignedVenueSet.has(row.venueId) ? row.venueId : null
      const govTeamIds = row.govTeamIds.filter((id) => unassignedTeamSet.has(id))
      const oppTeamIds = row.oppTeamIds.filter((id) => unassignedTeamSet.has(id))
      const chairIds = row.chairIds.filter((id) => unassignedAdjudicatorSet.has(id))
      const panelIds = row.panelIds.filter((id) => unassignedAdjudicatorSet.has(id))
      const traineeIds = row.traineeIds.filter((id) => unassignedAdjudicatorSet.has(id))
      const winMetrics = rowWinMetrics(govTeamIds, oppTeamIds)
      return {
        key: row.key,
        venueId,
        govTeamIds,
        oppTeamIds,
        chairIds,
        panelIds,
        traineeIds,
        matchIndex: row.matchIndex,
        sortTopWin: winMetrics.sortTopWin,
        sortTotalWin: winMetrics.sortTotalWin,
        sortLabel: row.sortLabel,
      }
    })
    .filter(
      (row) =>
        row.govTeamIds.length > 0 ||
        row.oppTeamIds.length > 0 ||
        !!row.venueId ||
        row.chairIds.length > 0 ||
        row.panelIds.length > 0 ||
        row.traineeIds.length > 0
    )

  return groupedRows
})

const useReferenceMatchupWaitingTeams = computed(() => referenceUnassignedTeamRows.value.length > 0)

const referenceWaitingEntityIdSet = computed(() => {
  const teamIds = new Set<string>()
  const venueIds = new Set<string>()
  const adjudicatorIds = new Set<string>()
  referenceUnassignedTeamRows.value.forEach((row) => {
    if (row.venueId) venueIds.add(row.venueId)
    row.govTeamIds.forEach((teamId) => teamIds.add(teamId))
    row.oppTeamIds.forEach((teamId) => teamIds.add(teamId))
    row.chairIds.forEach((adjId) => adjudicatorIds.add(adjId))
    row.panelIds.forEach((adjId) => adjudicatorIds.add(adjId))
    row.traineeIds.forEach((adjId) => adjudicatorIds.add(adjId))
  })
  return {
    teamIds,
    venueIds,
    adjudicatorIds,
  }
})

const waitingLooseTeams = computed(() => {
  if (!useReferenceMatchupWaitingTeams.value) return unassignedTeams.value
  const coveredTeamIds = referenceWaitingEntityIdSet.value.teamIds
  return unassignedTeams.value.filter((team) => !coveredTeamIds.has(team._id))
})

type ReferenceWaitingSortKey = 'venue' | 'gov' | 'opp' | 'win' | 'chairs' | 'panels' | 'trainees'

const referenceWaitingSortState = ref<{
  key: ReferenceWaitingSortKey
  direction: AllocationSortDirection
}>({
  key: 'win',
  direction: 'desc',
})

function referenceWaitingSortValue(row: ReferenceUnassignedTeamRow, key: ReferenceWaitingSortKey) {
  if (key === 'venue') return row.venueId ? venueName(row.venueId) : ''
  if (key === 'gov') return row.govTeamIds.map((teamId) => teamNameById(teamId)).join(', ')
  if (key === 'opp') return row.oppTeamIds.map((teamId) => teamNameById(teamId)).join(', ')
  if (key === 'win') return row.sortTopWin
  if (key === 'chairs') return row.chairIds.map((adjId) => adjudicatorNameById(adjId)).join(', ')
  if (key === 'panels') return row.panelIds.map((adjId) => adjudicatorNameById(adjId)).join(', ')
  if (key === 'trainees')
    return row.traineeIds.map((adjId) => adjudicatorNameById(adjId)).join(', ')
  return ''
}

function referenceWaitingWinLabel(row: ReferenceUnassignedTeamRow) {
  const metrics = rowWinMetrics(row.govTeamIds, row.oppTeamIds)
  if (!metrics.hasWinValue) return '—'
  return `${formatTeamWinValue(metrics.govWins)} - ${formatTeamWinValue(metrics.oppWins)}`
}

const sortedReferenceUnassignedTeamRows = computed<ReferenceUnassignedTeamRow[]>(() => {
  const { key, direction } = referenceWaitingSortState.value
  const rows = referenceUnassignedTeamRows.value.map((row, index) => ({ row, index }))
  rows.sort((left, right) => {
    if (key === 'win') {
      const topDiff = left.row.sortTopWin - right.row.sortTopWin
      if (topDiff !== 0) return direction === 'asc' ? topDiff : -topDiff
      const totalDiff = left.row.sortTotalWin - right.row.sortTotalWin
      if (totalDiff !== 0) return direction === 'asc' ? totalDiff : -totalDiff
      return left.row.matchIndex - right.row.matchIndex
    }
    const leftValue = referenceWaitingSortValue(left.row, key)
    const rightValue = referenceWaitingSortValue(right.row, key)
    const diff = allocationSortCollator.compare(String(leftValue), String(rightValue))
    if (diff !== 0) return direction === 'asc' ? diff : -diff
    return left.row.matchIndex - right.row.matchIndex || left.index - right.index
  })
  return rows.map((entry) => entry.row)
})

function setReferenceWaitingSort(key: ReferenceWaitingSortKey) {
  const nextDirection: AllocationSortDirection =
    referenceWaitingSortState.value.key === key
      ? referenceWaitingSortState.value.direction === 'asc'
        ? 'desc'
        : 'asc'
      : key === 'win'
        ? 'desc'
        : 'asc'
  referenceWaitingSortState.value = { key, direction: nextDirection }
}

function referenceWaitingSortIndicator(key: ReferenceWaitingSortKey) {
  if (referenceWaitingSortState.value.key !== key) return '↕'
  return referenceWaitingSortState.value.direction === 'asc' ? '↑' : '↓'
}

const unassignedVenues = computed(() => {
  const assigned = new Set<string>()
  allocation.value.forEach((row) => {
    if (row.venue) assigned.add(row.venue)
  })
  return availableVenues.value.filter((venue) => !assigned.has(venue._id))
})

const waitingLooseVenues = computed(() => {
  if (!useReferenceMatchupWaitingTeams.value) return unassignedVenues.value
  const coveredVenueIds = referenceWaitingEntityIdSet.value.venueIds
  return unassignedVenues.value.filter((venue) => !coveredVenueIds.has(venue._id))
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

const expectedBallotSubmitterIds = computed(() => {
  const set = new Set<string>()
  allocation.value.forEach((row) => {
    ;(row.chairs ?? []).forEach((id) => set.add(id))
    ;(row.panels ?? []).forEach((id) => set.add(id))
  })
  return set
})

const expectedFeedbackAdjudicatorIds = computed(() => {
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
  const ids = Array.from(expectedBallotSubmitterIds.value).filter(
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
  const ids = Array.from(expectedFeedbackAdjudicatorIds.value).filter(
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
  () => expectedFeedbackAdjudicatorIds.value.size > 0 || expectedTeamIds.value.size > 0
)

function onDragStart(kind: DragKind, id: string) {
  if (locked.value) return
  const normalizedId = String(id ?? '').trim()
  if (!normalizedId) return
  if (!isEntityAvailableInRound(kind, normalizedId)) return
  dragPayload.value = { kind, id: normalizedId }
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

function findTeamPlacement(id: string): { row: DrawAllocationRow; side: 'gov' | 'opp' } | null {
  for (const row of allocation.value) {
    if (row.teams.gov === id) return { row, side: 'gov' }
    if (row.teams.opp === id) return { row, side: 'opp' }
  }
  return null
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

function findVenuePlacement(id: string): { row: DrawAllocationRow } | null {
  for (const row of allocation.value) {
    if (row.venue === id) return { row }
  }
  return null
}

function dropTeam(row: DrawAllocationRow, side: 'gov' | 'opp') {
  if (locked.value) return
  const payload = dragPayload.value
  if (!payload || payload.kind !== 'team') return
  if (!isEntityAvailableInRound(payload.kind, payload.id)) {
    onDragEnd()
    return
  }
  const targetTeamId = String(row.teams[side] ?? '')
  if (targetTeamId === payload.id) {
    onDragEnd()
    return
  }
  const source = findTeamPlacement(payload.id)
  removeTeamFromAllocation(payload.id)
  if (source && targetTeamId.length > 0 && targetTeamId !== payload.id) {
    source.row.teams[source.side] = targetTeamId
  }
  row.teams[side] = payload.id
  const other = side === 'gov' ? 'opp' : 'gov'
  if (row.teams[other] === payload.id) {
    row.teams[other] = ''
  }
  onDragEnd()
}

function dropAdjudicator(row: DrawAllocationRow, role: 'chairs' | 'panels' | 'trainees') {
  if (locked.value) return
  const payload = dragPayload.value
  if (!payload || payload.kind !== 'adjudicator') return
  if (!isEntityAvailableInRound(payload.kind, payload.id)) {
    onDragEnd()
    return
  }
  removeAdjudicatorFromAllocation(payload.id)
  if (!row[role].includes(payload.id)) {
    row[role] = [...row[role], payload.id]
  }
  onDragEnd()
}

function dropVenue(row: DrawAllocationRow) {
  if (locked.value) return
  const payload = dragPayload.value
  if (!payload || payload.kind !== 'venue') return
  if (!isEntityAvailableInRound(payload.kind, payload.id)) {
    onDragEnd()
    return
  }
  const targetVenueId = String(row.venue ?? '')
  if (targetVenueId === payload.id) {
    onDragEnd()
    return
  }
  const source = findVenuePlacement(payload.id)
  removeVenueFromAllocation(payload.id)
  if (source && targetVenueId.length > 0 && targetVenueId !== payload.id) {
    source.row.venue = targetVenueId
  }
  row.venue = payload.id
  onDragEnd()
}

function dropToWaiting(kind: DragKind) {
  if (locked.value) return
  const payload = dragPayload.value
  if (!payload || payload.kind !== kind) return
  if (!isEntityAvailableInRound(payload.kind, payload.id)) {
    onDragEnd()
    return
  }
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

const waitingLooseAdjudicators = computed(() => {
  if (!useReferenceMatchupWaitingTeams.value) return unassignedAdjudicators.value
  const coveredAdjudicatorIds = referenceWaitingEntityIdSet.value.adjudicatorIds
  return unassignedAdjudicators.value.filter((adj) => !coveredAdjudicatorIds.has(adj._id))
})

function openDeleteDrawModal() {
  if (!currentDraw.value?._id || isLoading.value || locked.value) return
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
  priorRounds,
  (roundItems) => {
    const defaults = roundItems.map((item) => String(item.round))
    if (roundItems.length === 0) {
      commonReferenceRoundSelections.value = []
      teamReferenceRoundSelections.value = []
      adjudicatorReferenceRoundSelections.value = []
      useScopedReferenceRoundSelections.value = false
      referenceSelectionConfirmed.value = true
      referenceConfirmError.value = null
      return
    }

    const commonSelections = sanitizeReferenceRoundSelectionStrings(
      commonReferenceRoundSelections.value
    )
    const teamSelections = sanitizeReferenceRoundSelectionStrings(teamReferenceRoundSelections.value)
    const adjudicatorSelections = sanitizeReferenceRoundSelectionStrings(
      adjudicatorReferenceRoundSelections.value
    )
    const nextCommon = commonSelections.length > 0 ? commonSelections : defaults
    commonReferenceRoundSelections.value = [...nextCommon]

    if (!shouldTrackAdjudicatorReference.value || !useScopedReferenceRoundSelections.value) {
      teamReferenceRoundSelections.value = [...nextCommon]
      adjudicatorReferenceRoundSelections.value = [...nextCommon]
      return
    }

    teamReferenceRoundSelections.value = teamSelections.length > 0 ? teamSelections : [...nextCommon]
    adjudicatorReferenceRoundSelections.value =
      adjudicatorSelections.length > 0 ? adjudicatorSelections : [...teamReferenceRoundSelections.value]
  },
  { immediate: true }
)

watch(
  useScopedReferenceRoundSelections,
  (enabled) => {
    if (!shouldTrackAdjudicatorReference.value) {
      if (enabled) useScopedReferenceRoundSelections.value = false
      return
    }

    const defaults = defaultReferenceRoundSelections()
    const commonSelections = sanitizeReferenceRoundSelectionStrings(commonReferenceRoundSelections.value)
    if (!enabled) {
      const teamSelections = sanitizeReferenceRoundSelectionStrings(teamReferenceRoundSelections.value)
      const adjudicatorSelections = sanitizeReferenceRoundSelectionStrings(
        adjudicatorReferenceRoundSelections.value
      )
      const nextCommon =
        commonSelections.length > 0
          ? commonSelections
          : teamSelections.length > 0
            ? teamSelections
            : adjudicatorSelections.length > 0
              ? adjudicatorSelections
              : defaults
      commonReferenceRoundSelections.value = [...nextCommon]
      teamReferenceRoundSelections.value = [...nextCommon]
      adjudicatorReferenceRoundSelections.value = [...nextCommon]
      return
    }

    const baseSelections = commonSelections.length > 0 ? commonSelections : defaults
    if (teamReferenceRoundSelections.value.length === 0) {
      teamReferenceRoundSelections.value = [...baseSelections]
    }
    if (adjudicatorReferenceRoundSelections.value.length === 0) {
      adjudicatorReferenceRoundSelections.value = [...baseSelections]
    }
  },
  { immediate: true }
)

watch(
  shouldTrackAdjudicatorReference,
  (enabled) => {
    if (enabled) {
      if (adjudicatorReferenceRoundSelections.value.length === 0) {
        adjudicatorReferenceRoundSelections.value =
          teamReferenceRoundSelections.value.length > 0
            ? [...teamReferenceRoundSelections.value]
            : [...commonReferenceRoundSelections.value]
      }
      return
    }
    useScopedReferenceRoundSelections.value = false
    const defaults = defaultReferenceRoundSelections()
    const commonSelections = sanitizeReferenceRoundSelectionStrings(commonReferenceRoundSelections.value)
    const teamSelections = sanitizeReferenceRoundSelectionStrings(teamReferenceRoundSelections.value)
    const nextCommon = commonSelections.length > 0 ? commonSelections : teamSelections.length > 0 ? teamSelections : defaults
    commonReferenceRoundSelections.value = [...nextCommon]
    teamReferenceRoundSelections.value = [...nextCommon]
    adjudicatorReferenceRoundSelections.value = [...nextCommon]
  },
  { immediate: true }
)

watch(
  [compiledSnapshotOptions, round, currentDraw],
  ([options, , draw]) => {
    const hasSavedDraw = Boolean(draw)
    const savedReferenceCompiledId = hasSavedDraw
      ? readDrawReferenceCompiledId(draw?.userDefinedData)
      : ''
    const savedTeamReferenceCompiledId = hasSavedDraw
      ? readDrawReferenceCompiledIdByScope(draw?.userDefinedData, 'teams')
      : ''
    const savedAdjudicatorReferenceCompiledId = hasSavedDraw
      ? readDrawReferenceCompiledIdByScope(draw?.userDefinedData, 'adjudicators')
      : ''

    if (options.length === 0) {
      selectedDetailSnapshotId.value = ''
      selectedTeamSnapshotId.value = ''
      selectedAdjudicatorSnapshotId.value = ''
      return
    }

    selectedDetailSnapshotId.value = firstExistingSnapshotId(
      selectedDetailSnapshotId.value,
      savedReferenceCompiledId
    )
    selectedTeamSnapshotId.value = firstExistingSnapshotId(
      selectedTeamSnapshotId.value,
      savedTeamReferenceCompiledId,
      selectedDetailSnapshotId.value
    )
    selectedAdjudicatorSnapshotId.value = firstExistingSnapshotId(
      selectedAdjudicatorSnapshotId.value,
      savedAdjudicatorReferenceCompiledId,
      selectedTeamSnapshotId.value,
      selectedDetailSnapshotId.value
    )

    if (hasSavedDraw && referenceSelectionConfirmed.value) {
      const savedTeamSelections = resolveSavedReferenceRoundSelections(draw?.userDefinedData, 'teams')
      const savedAdjudicatorSelections = resolveSavedReferenceRoundSelections(
        draw?.userDefinedData,
        'adjudicators'
      )
      const fallbackSnapshot = resolveLatestSnapshotByPreviousRoundMaxRound()
      const fallbackSelections = sanitizeReferenceRoundSelectionStrings(
        normalizeCompiledRoundNumbers(fallbackSnapshot?.rounds ?? []).map((roundNumber) =>
          String(roundNumber)
        )
      )
      applyReferenceRoundSelectionState(
        savedTeamSelections.length > 0
          ? savedTeamSelections
          : fallbackSelections.length > 0
            ? fallbackSelections
            : defaultReferenceRoundSelections(),
        savedAdjudicatorSelections.length > 0
          ? savedAdjudicatorSelections
          : savedTeamSelections.length > 0
            ? savedTeamSelections
            : fallbackSelections.length > 0
              ? fallbackSelections
            : defaultReferenceRoundSelections(),
        defaultReferenceRoundSelections()
      )
    }

    if (referenceSelectionConfirmed.value) {
      selectedTeamSnapshotId.value = resolvePreferredSnapshotIdByReferenceRounds(
        selectedTeamReferenceRounds.value,
        selectedTeamSnapshotId.value,
        savedTeamReferenceCompiledId,
        savedReferenceCompiledId,
        selectedDetailSnapshotId.value
      )
      if (shouldTrackAdjudicatorReference.value) {
        selectedAdjudicatorSnapshotId.value = resolvePreferredSnapshotIdByReferenceRounds(
          selectedAdjudicatorReferenceRounds.value,
          selectedAdjudicatorSnapshotId.value,
          savedAdjudicatorReferenceCompiledId,
          savedReferenceCompiledId,
          selectedTeamSnapshotId.value
        )
      } else {
        selectedAdjudicatorSnapshotId.value = selectedTeamSnapshotId.value
      }
      selectedDetailSnapshotId.value = firstExistingSnapshotId(
        selectedTeamSnapshotId.value,
        selectedAdjudicatorSnapshotId.value,
        selectedDetailSnapshotId.value
      )
    }
  },
  { immediate: true }
)

watch(
  [selectedDetailSnapshotId, selectedDetailSnapshotRoundNumbers],
  () => {
    emitReferenceCompiledSelection()
  },
  { immediate: true }
)

watch(
  () => autoOptions.value.teamAlgorithm,
  (next) => {
    if (next === 'break' && scopeIncludesTeams.value) hydrateAutoBreakPolicyFromRound()
  }
)

watch(showAutoGenerateModal, (isOpen) => {
  if (isOpen && autoOptions.value.teamAlgorithm === 'break') {
    hydrateAutoBreakPolicyFromRound()
  }
})

watch(
  isBreakRound,
  (enabled) => {
    if (!enabled && autoOptions.value.teamAlgorithm === 'break') {
      autoOptions.value.teamAlgorithm = 'standard'
    }
  },
  { immediate: true }
)

watch(
  () => draws.error,
  (message) => {
    if (!message) return
    openNotice(message)
  }
)
</script>

<style scoped>
.grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.reference-round-confirm-block {
  gap: var(--space-2);
}

.reference-round-confirm-head {
  align-items: flex-start;
}

.reference-round-select-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.reference-round-select-field {
  gap: 6px;
}

.reference-snapshot-select-block {
  gap: 6px;
}

.reference-snapshot-select-grid {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.reference-round-intro {
  margin: 0;
}

.reference-round-checkbox-list {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-soft);
  padding: 8px;
}

.reference-round-checkbox-list--inline {
  min-height: 44px;
}

.reference-round-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
  background: var(--color-surface);
  font-size: 13px;
}

.reference-round-checkbox input[type='checkbox'] {
  margin: 0;
}

.reference-round-confirm-actions {
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2);
  flex-wrap: wrap;
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
  gap: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid #dbe2ea;
}

.auto-label {
  gap: var(--space-2);
  align-items: center;
}

.auto-label strong {
  font-size: 18px;
  letter-spacing: 0.01em;
}

.auto-generate-layout {
  gap: var(--space-3);
}

.auto-basic-section {
  gap: var(--space-2);
}

.auto-basic-grid {
  display: grid;
  grid-template-columns: minmax(320px, 1fr);
  gap: var(--space-3);
  align-items: start;
}

.auto-target-block {
  gap: var(--space-2);
}

.auto-reference-block {
  gap: var(--space-2);
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-md);
  background: #f8fbff;
  padding: var(--space-3);
  margin-top: 34px;
}

.reference-selection-block {
  margin-top: 0;
}

.auto-reference-header {
  gap: 4px;
}

.auto-reference-description {
  margin: 0;
}

.auto-reference-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  align-items: start;
}

.auto-reference-customize-toggle {
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: 13px;
  color: var(--color-text);
}

.auto-reference-customize-toggle input {
  margin: 0;
}

.filter-priority-field {
  grid-column: 1 / -1;
}

.auto-algorithm-editor {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-3);
  gap: var(--space-3);
}

.auto-detail-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  align-items: start;
}

.auto-standard-method-field {
  grid-column: 1 / -1;
  width: 100%;
  max-width: 100%;
}

.auto-wide-field {
  grid-column: 1 / -1;
  width: 100%;
  max-width: 100%;
}

.auto-subsection-title {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--color-muted);
}

.auto-algorithm-editor .stack {
  gap: var(--space-2);
}

.auto-algorithm-editor .option-title {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--color-muted);
}

.auto-toggle-field {
  min-height: 42px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-soft);
  padding: 8px 10px;
  align-items: center;
}

.auto-scope-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.auto-scope-tab {
  border: 1px solid #cbd5e1;
  border-radius: var(--radius-md);
  background: #f1f5f9;
  color: #334155;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.25;
  padding: 8px 10px;
  min-height: 42px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.auto-scope-tab:hover:not(:disabled) {
  background: #ffffff;
  color: #0f172a;
}

.auto-scope-tab.active {
  background: #ffffff;
  border-color: #60a5fa;
  color: #0f172a;
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.25);
}

.auto-scope-tab:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.auto-group {
  border: 1px solid #dbe2ea;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
  gap: var(--space-2);
}

.auto-group--basic {
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
}

.auto-group-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.01em;
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

.break-round-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #7c2d12;
  background: #ffedd5;
  border: 1px solid #fdba74;
}

.allocation-board:not(.allocation-board--break) .allocation-table--main td .drop-zone {
  border-color: #93c5fd;
  background: #eef4ff;
}

.allocation-board--break .allocation-table--main td .drop-zone {
  border-color: #d4b88a;
  background: #fdf1d9;
}
.allocation-board--break .allocation-table--main td .drop-zone.active {
  border-color: #b45309;
  background:
    repeating-linear-gradient(
      -45deg,
      rgba(245, 158, 11, 0.12) 0 8px,
      rgba(245, 158, 11, 0.2) 8px 16px
    ),
    #fce7bf;
  box-shadow: inset 0 0 0 1px rgba(180, 83, 9, 0.32);
}

.preview-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.preview-download-stack {
  margin-top: var(--space-2);
  gap: var(--space-1);
}

.section-download-row {
  justify-content: flex-end;
}

.section-download-button {
  width: 100%;
  justify-content: center;
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

.allocation-table--main th,
.allocation-table--main td {
  padding: 3px;
}

.allocation-table th {
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 600;
}

.allocation-table--main th,
.waiting-matchup-allocation-table th {
  background: #e5e7eb;
  color: #374151;
}

.allocation-table th.venue-col,
.allocation-table th.team-col,
.allocation-table th.adjudicator-col,
.allocation-table td.venue-col,
.allocation-table td.team-col,
.allocation-table td.adjudicator-col {
  text-align: center;
}

.allocation-table td.venue-col .drop-zone,
.allocation-table td.team-col .drop-zone,
.allocation-table td.adjudicator-col .drop-zone {
  justify-content: center;
}

.match-col {
  width: 38px;
  min-width: 38px;
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
  width: 180px;
  min-width: 180px;
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
  min-height: 20px;
}

.warning-summary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: default;
  white-space: nowrap;
}

.warning-summary-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}

.warning-summary-icon {
  line-height: 1;
}

.warning-summary-count {
  min-width: 0.8em;
  text-align: right;
}

.warning-summary-item--critical {
  background: #fff1f2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

.warning-summary-item--warn {
  background: #fff7ed;
  color: #9a3412;
  border: 1px solid #fdba74;
}

.warning-summary-item--info {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #93c5fd;
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

.team-pill {
  gap: 6px;
  max-width: 100%;
}

.team-pill-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adjudicator-pill {
  gap: 6px;
  max-width: 100%;
}

.adjudicator-pill-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-win-badge {
  flex: 0 0 auto;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.25;
}

.team-win-badge--high {
  color: #075985;
  background: #e0f2fe;
  border-color: #7dd3fc;
}

.team-win-badge--mid {
  color: #1d4ed8;
  background: #dbeafe;
  border-color: #93c5fd;
}

.team-win-badge--low {
  color: #334155;
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.team-win-badge--none {
  color: #475569;
  background: #f8fafc;
  border-color: #e2e8f0;
}

.adjudicator-average-badge {
  flex: 0 0 auto;
  border-radius: 999px;
  border: 1px solid transparent;
  min-width: 26px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
}

.adjudicator-average-badge--high {
  color: #166534;
  background: #dcfce7;
  border-color: #86efac;
}

.adjudicator-average-badge--mid {
  color: #1d4ed8;
  background: #dbeafe;
  border-color: #93c5fd;
}

.adjudicator-average-badge--low {
  color: #334155;
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.adjudicator-average-badge--none {
  color: #475569;
  background: #f8fafc;
  border-color: #e2e8f0;
}

.pill-entity {
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background-color 0.15s ease;
}

.pill-team-eliminated {
  opacity: 0.72;
}

.pill-team-eliminated .team-pill-name {
  text-decoration-line: line-through;
  text-decoration-thickness: 1.5px;
  text-decoration-color: #64748b;
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

.allocation-table--main .drop-zone {
  min-height: 28px;
  padding: 1px 4px;
  gap: 3px;
}

.allocation-table--main .drop-zone.compact {
  min-height: 26px;
}

.allocation-table--main .drop-zone.list.compact {
  min-height: 30px;
}

.allocation-table--main .drop-zone.allocation-drop-zone.multi-line {
  max-height: none;
  overflow: visible;
}

.allocation-table--main .drop-zone .muted.small {
  white-space: nowrap;
}

.allocation-table--main .pill {
  padding: 2px 8px;
  font-size: 11px;
}

.allocation-table--main .team-win-badge,
.allocation-table--main .adjudicator-average-badge {
  padding: 0 5px;
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

ul.list,
ol.list {
  margin: 0;
  padding-left: var(--space-4);
}

ul.list.compact,
ol.list.compact {
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
  font-size: 12px;
  line-height: 1.45;
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

.waiting-matchup-allocation-wrap {
  width: 100%;
  overflow-x: auto;
}

.waiting-matchup-allocation-table {
  min-width: 1120px;
}

.waiting-matchup-allocation-table th,
.waiting-matchup-allocation-table td {
  padding: 4px;
}

.waiting-matchup-allocation-table .waiting-win-col {
  width: 110px;
  min-width: 110px;
  text-align: center;
}

.waiting-win-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.waiting-matchup-allocation-table .drop-zone {
  min-height: 28px;
  padding: 2px 5px;
}

.waiting-matchup-allocation-table .drop-zone.list.compact {
  min-height: 30px;
  max-height: 36px;
}

.waiting-placeholder-zone {
  background: #f1f5f9;
  border-style: dashed;
}

.allocation-board:not(.allocation-board--break) .waiting-matchup-allocation-table td .drop-zone,
.allocation-board--break .waiting-matchup-allocation-table td .drop-zone {
  border-color: #94a3b8;
  background: #f1f5f9;
}

.allocation-board:not(.allocation-board--break) .waiting-matchup-allocation-table td .drop-zone.active,
.allocation-board--break .waiting-matchup-allocation-table td .drop-zone.active {
  border-color: var(--color-primary);
  background:
    repeating-linear-gradient(
      -45deg,
      rgba(37, 99, 235, 0.08) 0 8px,
      rgba(37, 99, 235, 0.14) 8px 16px
    ),
    var(--color-surface);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 36%, transparent);
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

.detail-row--highlightable {
  margin: 0 -4px;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.detail-row--highlightable:hover {
  background: #f8fafc;
}

.detail-row--highlightable:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 1px;
  background: #f8fafc;
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

.reference-compile-settings-modal {
  width: min(980px, 100%);
  max-height: calc(100vh - 64px);
  overflow: auto;
}

.auto-modal {
  gap: var(--space-3);
  padding: clamp(14px, 2vw, 20px);
  border: 1px solid #cbd5e1;
  background: #ffffff;
}

.import-info {
  margin-top: -4px;
}

.modal-actions {
  justify-content: flex-end;
  gap: var(--space-2);
}

.auto-request-error {
  margin: 0;
  border: 1px solid #fecaca;
  border-radius: var(--radius-sm);
  background: #fff1f2;
  padding: 8px 10px;
}

.auto-modal-actions {
  border-top: 1px solid #dbe2ea;
  padding-top: var(--space-2);
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
  .auto-basic-grid {
    grid-template-columns: 1fr;
  }

  .auto-reference-block {
    margin-top: 0;
  }

  .auto-reference-detail-grid {
    grid-template-columns: 1fr;
  }

  .auto-detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .auto-scope-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

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

@media (max-width: 720px) {
  .auto-detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
